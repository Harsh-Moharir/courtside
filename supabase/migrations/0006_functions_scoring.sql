-- 0006_functions_scoring.sql
-- Live match scoring (section 8). The database never ticks: clocks are (remaining_ms, running, updated_at).

create or replace function public.server_time() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

create or replace function public._eff_ms(p_ms int, p_running boolean, p_at timestamptz) returns int
language sql volatile as $$
  select case when p_running
    then greatest(0, p_ms - floor(extract(epoch from (clock_timestamp() - p_at)) * 1000)::int)
    else p_ms end
$$;

create or replace function public._period_len_ms(r public.match_rules, p_period int) returns int
language sql immutable as $$
  select case when p_period <= r.quarters then r.quarter_seconds else r.overtime_seconds end * 1000
$$;

create or replace function public._period_label(p_quarters int, p_period int) returns text
language sql immutable as $$
  select case when p_period > p_quarters then 'OT' || (p_period - p_quarters)
              when p_quarters = 2 then 'H' || p_period
              else 'Q' || p_period end
$$;

-- Timeout pool size in force during a period (8.4).
create or replace function public._timeout_pool(r public.match_rules, p_period int) returns int
language sql immutable as $$
  select case when p_period > r.quarters then r.timeouts_per_overtime
              when p_period > r.quarters / 2 then r.timeouts_second_half
              else r.timeouts_first_half end
$$;

create or replace function public._match_payload(p_fixture_id uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'state', (select to_jsonb(m) from public.match_states m where m.fixture_id = p_fixture_id),
    'fixture', (select to_jsonb(f) from public.fixtures f where f.id = p_fixture_id),
    'server_now', clock_timestamp()) || coalesce(p_extra, '{}'::jsonb)
$$;

-- Locks the live state row of a fixture of the active tournament. Raises MATCH_NOT_LIVE otherwise.
create or replace function public._lock_match(p_fixture_id uuid) returns public.match_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; v_status public.fixture_status;
begin
  select status into v_status from public.fixtures where id = p_fixture_id and tournament_id = public.active_tournament_id();
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  select * into ms from public.match_states where fixture_id = p_fixture_id for update;
  if not found or v_status <> 'live' then perform public.raise_err('MATCH_NOT_LIVE', jsonb_build_object('status', v_status)); end if;
  return ms;
end $$;

create or replace function public._scoring_dup(p_crid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_crid is not null and exists (select 1 from public.live_scoring_events where client_request_id = p_crid)
$$;

create or replace function public._side_name(p_fixture_id uuid, p_side public.team_side) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select t.name from public.fixtures f join public.teams t
    on t.id = case when p_side = 'home' then f.home_team_id else f.away_team_id end
  where f.id = p_fixture_id
$$;

-- Appends an event with the next seq. The caller holds the match_states (or fixtures) row lock.
create or replace function public._scoring_event(
  p_fixture_id uuid, p_type public.scoring_event_type, p_side public.team_side, p_delta int,
  p_prev jsonb, p_detail jsonb, p_crid uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_seq int; ms public.match_states;
begin
  select coalesce(max(seq), 0) + 1 into v_seq from public.live_scoring_events where fixture_id = p_fixture_id;
  select * into ms from public.match_states where fixture_id = p_fixture_id;
  insert into public.live_scoring_events (tournament_id, fixture_id, seq, event_type, side, delta, prev, detail, client_request_id, created_by)
  values ((select tournament_id from public.fixtures where id = p_fixture_id), p_fixture_id, v_seq, p_type, p_side, p_delta, p_prev,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object(
            'period', ms.period, 'is_break', ms.is_break,
            'clock_ms', case when ms.fixture_id is null then null else public._eff_ms(ms.clock_remaining_ms, ms.clock_running, ms.clock_updated_at) end,
            'home', ms.home_score, 'away', ms.away_score),
          p_crid, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'));
  return v_seq;
end $$;

create or replace function public._rules(p_tid uuid) returns public.match_rules
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.match_rules;
begin
  select * into r from public.match_rules where tournament_id = p_tid;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Start
-- ---------------------------------------------------------------------------
create or replace function public.start_match(p_fixture_id uuid, p_client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; r public.match_rules;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status = 'live' and p_client_request_id is not null and public._scoring_dup(p_client_request_id) then
    return public._match_payload(f.id, '{"duplicate":true}');
  end if;
  if f.status not in ('upcoming','postponed') then perform public.raise_err('MATCH_ALREADY_STARTED', jsonb_build_object('status', f.status)); end if;
  if f.home_team_id is null or f.away_team_id is null then perform public.raise_err('MATCH_NOT_STARTABLE', '{"reason":"Both teams must be known"}'); end if;
  if exists (select 1 from public.fixtures o where o.tournament_id = v_tid and o.status = 'live' and o.id <> f.id
             and (o.home_team_id in (f.home_team_id, f.away_team_id) or o.away_team_id in (f.home_team_id, f.away_team_id))) then
    perform public.raise_err('MATCH_TEAM_BUSY', '{}');
  end if;
  r := public._rules(v_tid);
  delete from public.match_states where fixture_id = f.id;
  insert into public.match_states (fixture_id, tournament_id, period, clock_remaining_ms, clock_updated_at,
         shot_clock_remaining_ms, shot_clock_updated_at, home_timeouts_left, away_timeouts_left, started_at, version)
  values (f.id, v_tid, 1, r.quarter_seconds * 1000, clock_timestamp(), r.shot_clock_seconds * 1000, clock_timestamp(),
          r.timeouts_first_half, r.timeouts_first_half, now(), 1);
  update public.fixtures set status = 'live', postponed_reason = null where id = f.id;
  perform public._scoring_event(f.id, 'match_started', null, null, null, '{"desc":"Match started"}', p_client_request_id);
  return public._match_payload(f.id);
end $$;

-- ---------------------------------------------------------------------------
-- Points, fouls, timeouts, corrections
-- ---------------------------------------------------------------------------
create or replace function public.score_points(p_fixture_id uuid, p_side public.team_side, p_points int, p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; v_home int; v_away int; v_prev jsonb; v_ps jsonb; v_last int;
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  if p_side is null or p_points not in (1, 2, 3) then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"points":"1, 2 or 3"}}'); end if;
  v_home := ms.home_score + case when p_side = 'home' then p_points else 0 end;
  v_away := ms.away_score + case when p_side = 'away' then p_points else 0 end;
  if v_home > 999 or v_away > 999 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"score":"Score cap is 999"}}'); end if;
  v_prev := jsonb_build_object('home_score', ms.home_score, 'away_score', ms.away_score);
  v_ps := ms.period_scores;
  if ms.is_break and jsonb_array_length(v_ps) > 0 then
    v_prev := v_prev || jsonb_build_object('period_scores', ms.period_scores);
    v_last := jsonb_array_length(v_ps) - 1;
    v_ps := jsonb_set(v_ps, array[v_last::text], (v_ps->v_last) || jsonb_build_object('home_total', v_home, 'away_total', v_away));
  end if;
  update public.match_states set home_score = v_home, away_score = v_away, period_scores = v_ps, version = version + 1
   where fixture_id = p_fixture_id;
  perform public._scoring_event(p_fixture_id, 'points', p_side, p_points, v_prev,
    jsonb_build_object('desc', format('%s +%s', public._side_name(p_fixture_id, p_side), p_points)), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

create or replace function public.add_foul(p_fixture_id uuid, p_side public.team_side, p_delta int, p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; v_old int; v_new int; v_col text;
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  if p_side is null or p_delta not in (1, -1) then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"delta":"1 or -1"}}'); end if;
  v_old := case when p_side = 'home' then ms.home_fouls else ms.away_fouls end;
  v_new := greatest(0, v_old + p_delta);
  if v_new = v_old then return public._match_payload(p_fixture_id, '{"unchanged":true}'); end if;
  v_col := p_side::text || '_fouls';
  update public.match_states set
    home_fouls = case when p_side = 'home' then v_new else home_fouls end,
    away_fouls = case when p_side = 'away' then v_new else away_fouls end,
    version = version + 1
  where fixture_id = p_fixture_id;
  perform public._scoring_event(p_fixture_id, 'foul', p_side, p_delta, jsonb_build_object(v_col, v_old),
    jsonb_build_object('desc', format('%s %s', public._side_name(p_fixture_id, p_side),
      case when p_delta > 0 then 'team foul' else 'foul removed' end)), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

create or replace function public.record_timeout(p_fixture_id uuid, p_side public.team_side, p_restore boolean default false,
  p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; r public.match_rules; v_old int; v_new int; v_col text; v_pool int; v_g int; v_s int;
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  if p_side is null then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"side":"required"}}'); end if;
  r := public._rules(ms.tournament_id);
  v_old := case when p_side = 'home' then ms.home_timeouts_left else ms.away_timeouts_left end;
  v_col := p_side::text || '_timeouts_left';
  if coalesce(p_restore, false) then
    v_pool := public._timeout_pool(r, ms.period);
    if v_old >= v_pool then return public._match_payload(p_fixture_id, '{"unchanged":true}'); end if;
    v_new := v_old + 1;
    update public.match_states set
      home_timeouts_left = case when p_side = 'home' then v_new else home_timeouts_left end,
      away_timeouts_left = case when p_side = 'away' then v_new else away_timeouts_left end,
      version = version + 1
    where fixture_id = p_fixture_id;
  else
    if v_old <= 0 then perform public.raise_err('NO_TIMEOUTS_LEFT', jsonb_build_object('side', p_side)); end if;
    v_new := v_old - 1;
    v_g := public._eff_ms(ms.clock_remaining_ms, ms.clock_running, ms.clock_updated_at);
    v_s := public._eff_ms(ms.shot_clock_remaining_ms, ms.shot_clock_running, ms.shot_clock_updated_at);
    update public.match_states set
      home_timeouts_left = case when p_side = 'home' then v_new else home_timeouts_left end,
      away_timeouts_left = case when p_side = 'away' then v_new else away_timeouts_left end,
      clock_remaining_ms = v_g, clock_running = false, clock_updated_at = clock_timestamp(),
      shot_clock_remaining_ms = v_s, shot_clock_running = false, shot_clock_updated_at = clock_timestamp(),
      version = version + 1
    where fixture_id = p_fixture_id;
  end if;
  perform public._scoring_event(p_fixture_id, 'timeout', p_side, case when p_restore then 1 else -1 end,
    jsonb_build_object(v_col, v_old),
    jsonb_build_object('desc', format('%s %s', public._side_name(p_fixture_id, p_side),
      case when p_restore then 'timeout restored' else 'timeout' end)), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

create or replace function public.correct_score(p_fixture_id uuid, p_home int, p_away int, p_reason text, p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; v_prev jsonb; v_ps jsonb; v_last int; v_reason text;
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  v_reason := public.clean_text(p_reason);
  if p_home is null or p_away is null or p_home not between 0 and 999 or p_away not between 0 and 999 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"score":"Scores must be 0 to 999"}}');
  end if;
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  v_prev := jsonb_build_object('home_score', ms.home_score, 'away_score', ms.away_score);
  v_ps := ms.period_scores;
  if ms.is_break and jsonb_array_length(v_ps) > 0 then
    v_prev := v_prev || jsonb_build_object('period_scores', ms.period_scores);
    v_last := jsonb_array_length(v_ps) - 1;
    v_ps := jsonb_set(v_ps, array[v_last::text], (v_ps->v_last) || jsonb_build_object('home_total', p_home, 'away_total', p_away));
  end if;
  update public.match_states set home_score = p_home, away_score = p_away, period_scores = v_ps, version = version + 1
   where fixture_id = p_fixture_id;
  perform public._scoring_event(p_fixture_id, 'score_correction', null, null, v_prev,
    jsonb_build_object('desc', format('Score corrected to %s-%s', p_home, p_away), 'reason', v_reason), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

-- ---------------------------------------------------------------------------
-- Clocks (8.3)
-- ---------------------------------------------------------------------------
create or replace function public.clock_control(p_fixture_id uuid, p_action text, p_value_ms int default null, p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; r public.match_rules; v_g int; v_s int; v_len int; v_full int; v_type public.scoring_event_type; v_desc text;
        v_now timestamptz := clock_timestamp();
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  r := public._rules(ms.tournament_id);
  v_g := public._eff_ms(ms.clock_remaining_ms, ms.clock_running, ms.clock_updated_at);
  v_s := public._eff_ms(ms.shot_clock_remaining_ms, ms.shot_clock_running, ms.shot_clock_updated_at);
  v_len := public._period_len_ms(r, ms.period);
  v_full := r.shot_clock_seconds * 1000;
  case p_action
  when 'start' then
    if ms.clock_running then return public._match_payload(p_fixture_id, '{"unchanged":true}'); end if;
    if ms.is_break or v_g <= 0 then
      perform public.raise_err('INVALID_PERIOD_TRANSITION', '{"reason":"The period has ended: start the next period first"}');
    end if;
    update public.match_states set clock_running = true, clock_remaining_ms = v_g, clock_updated_at = v_now,
           shot_clock_running = (v_s > 0), shot_clock_remaining_ms = v_s, shot_clock_updated_at = v_now, version = version + 1
     where fixture_id = p_fixture_id;
    v_type := 'clock_start'; v_desc := 'Clock started';
  when 'pause' then
    if not ms.clock_running and not ms.shot_clock_running then return public._match_payload(p_fixture_id, '{"unchanged":true}'); end if;
    update public.match_states set clock_running = false, clock_remaining_ms = v_g, clock_updated_at = v_now,
           shot_clock_running = false, shot_clock_remaining_ms = v_s, shot_clock_updated_at = v_now, version = version + 1
     where fixture_id = p_fixture_id;
    v_type := 'clock_pause'; v_desc := 'Clock paused';
  when 'reset' then
    if ms.clock_running then perform public.raise_err('CLOCK_RUNNING', '{}'); end if;
    update public.match_states set clock_remaining_ms = v_len, clock_updated_at = v_now,
           shot_clock_running = false, shot_clock_remaining_ms = v_full, shot_clock_updated_at = v_now, version = version + 1
     where fixture_id = p_fixture_id;
    v_type := 'clock_set'; v_desc := 'Clock reset';
  when 'set' then
    if ms.clock_running then perform public.raise_err('CLOCK_RUNNING', '{}'); end if;
    if p_value_ms is null or p_value_ms < 0 or p_value_ms > v_len then
      perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('value_ms', format('0 to %s ms', v_len))));
    end if;
    update public.match_states set clock_remaining_ms = p_value_ms, clock_updated_at = v_now, version = version + 1
     where fixture_id = p_fixture_id;
    v_type := 'clock_set'; v_desc := 'Clock set';
  when 'shot_reset', 'shot_reset_short', 'shot_set' then
    v_s := case p_action when 'shot_reset' then v_full when 'shot_reset_short' then r.shot_clock_short_reset_seconds * 1000 else p_value_ms end;
    if v_s is null or v_s < 0 or v_s > v_full then
      perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('value_ms', format('0 to %s ms', v_full))));
    end if;
    update public.match_states set shot_clock_remaining_ms = v_s, shot_clock_running = (ms.clock_running and v_g > 0 and v_s > 0),
           shot_clock_updated_at = v_now, clock_remaining_ms = v_g, clock_updated_at = v_now, version = version + 1
     where fixture_id = p_fixture_id;
    v_type := 'shot_clock_set'; v_desc := format('Shot clock %s', ceil(v_s / 1000.0)::int);
  else
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"action":"Unknown clock action"}}');
  end case;
  perform public._scoring_event(p_fixture_id, v_type, null, null, null, jsonb_build_object('desc', v_desc), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

-- ---------------------------------------------------------------------------
-- Periods (8.4)
-- ---------------------------------------------------------------------------
create or replace function public.change_period(p_fixture_id uuid, p_action text, p_client_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; r public.match_rules; v_prev jsonb; v_g int; v_s int; v_label text; v_next int;
        v_now timestamptz := clock_timestamp(); v_half int;
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  if public._scoring_dup(p_client_request_id) then return public._match_payload(p_fixture_id, '{"duplicate":true}'); end if;
  r := public._rules(ms.tournament_id);
  v_half := r.quarters / 2;
  v_g := public._eff_ms(ms.clock_remaining_ms, ms.clock_running, ms.clock_updated_at);
  v_s := public._eff_ms(ms.shot_clock_remaining_ms, ms.shot_clock_running, ms.shot_clock_updated_at);
  v_prev := jsonb_build_object('period', ms.period, 'is_break', ms.is_break, 'home_fouls', ms.home_fouls, 'away_fouls', ms.away_fouls,
    'home_timeouts_left', ms.home_timeouts_left, 'away_timeouts_left', ms.away_timeouts_left, 'period_scores', ms.period_scores,
    'clock_remaining_ms', v_g, 'shot_clock_remaining_ms', v_s);
  if p_action = 'end_period' then
    if ms.is_break then perform public.raise_err('INVALID_PERIOD_TRANSITION', '{"reason":"Already in a break"}'); end if;
    v_label := case when ms.period > r.quarters then 'End of OT' || (ms.period - r.quarters)
                    when ms.period = v_half then 'Halftime'
                    else 'End of ' || public._period_label(r.quarters, ms.period) end;
    update public.match_states set is_break = true,
      clock_running = false, clock_remaining_ms = 0, clock_updated_at = v_now,
      shot_clock_running = false, shot_clock_remaining_ms = v_s, shot_clock_updated_at = v_now,
      period_scores = period_scores || jsonb_build_array(jsonb_build_object('period', ms.period, 'home_total', ms.home_score, 'away_total', ms.away_score)),
      version = version + 1
    where fixture_id = p_fixture_id;
  elsif p_action = 'start_next_period' then
    if not ms.is_break then perform public.raise_err('INVALID_PERIOD_TRANSITION', '{"reason":"End the current period first"}'); end if;
    if ms.period >= r.quarters and ms.home_score <> ms.away_score then
      perform public.raise_err('INVALID_PERIOD_TRANSITION', '{"reason":"Not tied: complete the match instead"}');
    end if;
    v_next := ms.period + 1;
    v_label := 'Start of ' || public._period_label(r.quarters, v_next);
    update public.match_states set period = v_next, is_break = false,
      clock_running = false, clock_remaining_ms = public._period_len_ms(r, v_next), clock_updated_at = v_now,
      shot_clock_running = false, shot_clock_remaining_ms = r.shot_clock_seconds * 1000, shot_clock_updated_at = v_now,
      home_fouls = case when v_next <= r.quarters then 0 else home_fouls end,
      away_fouls = case when v_next <= r.quarters then 0 else away_fouls end,
      home_timeouts_left = case when v_next > r.quarters then r.timeouts_per_overtime
                                when v_next = v_half + 1 then r.timeouts_second_half else home_timeouts_left end,
      away_timeouts_left = case when v_next > r.quarters then r.timeouts_per_overtime
                                when v_next = v_half + 1 then r.timeouts_second_half else away_timeouts_left end,
      version = version + 1
    where fixture_id = p_fixture_id;
  else
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"action":"end_period or start_next_period"}}');
  end if;
  perform public._scoring_event(p_fixture_id, 'period_change', null, null, v_prev,
    jsonb_build_object('desc', v_label, 'label', v_label, 'action', p_action), p_client_request_id);
  return public._match_payload(p_fixture_id);
end $$;

-- ---------------------------------------------------------------------------
-- Undo (8.6)
-- ---------------------------------------------------------------------------
create or replace function public.undo_last_event(p_fixture_id uuid, p_expected_seq int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms public.match_states; ev public.live_scoring_events; n public.match_states; v_now timestamptz := clock_timestamp();
begin
  perform public.require_admin();
  ms := public._lock_match(p_fixture_id);
  select * into ev from public.live_scoring_events
   where fixture_id = p_fixture_id and not is_voided and event_type in ('points','foul','timeout','period_change','score_correction')
   order by seq desc limit 1;
  if not found then perform public.raise_err('NOTHING_TO_UNDO', '{}'); end if;
  if p_expected_seq is not null and p_expected_seq <> ev.seq then
    -- The console was looking at a different event (double click or another admin): do nothing.
    return public._match_payload(p_fixture_id, jsonb_build_object('stale', true, 'latest_seq', ev.seq));
  end if;
  n := jsonb_populate_record(ms, coalesce(ev.prev, '{}'::jsonb));
  if ev.event_type = 'period_change' then
    n.clock_running := false; n.shot_clock_running := false;
    n.clock_updated_at := v_now; n.shot_clock_updated_at := v_now;
  end if;
  update public.match_states set
    home_score = n.home_score, away_score = n.away_score, period = n.period, is_break = n.is_break,
    clock_remaining_ms = n.clock_remaining_ms, clock_running = n.clock_running, clock_updated_at = n.clock_updated_at,
    shot_clock_remaining_ms = n.shot_clock_remaining_ms, shot_clock_running = n.shot_clock_running, shot_clock_updated_at = n.shot_clock_updated_at,
    home_fouls = n.home_fouls, away_fouls = n.away_fouls, home_timeouts_left = n.home_timeouts_left, away_timeouts_left = n.away_timeouts_left,
    period_scores = n.period_scores, version = version + 1
  where fixture_id = p_fixture_id;
  update public.live_scoring_events set is_voided = true where id = ev.id;
  return public._match_payload(p_fixture_id, jsonb_build_object('undone_seq', ev.seq));
end $$;

-- ---------------------------------------------------------------------------
-- Completion, forfeit, corrections, reopen, abandon (8.7, 8.8, 7.4)
-- ---------------------------------------------------------------------------
create or replace function public._check_scores(p_home int, p_away int) returns void
language plpgsql immutable as $$
begin
  if p_home is null or p_away is null or p_home not between 0 and 999 or p_away not between 0 and 999 then
    perform public.raise_err('RESULT_INVALID', '{"reason":"Scores must be whole numbers from 0 to 999"}');
  end if;
end $$;

create or replace function public.complete_match(p_fixture_id uuid, p_home_score int, p_away_score int, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; ms public.match_states; ps public.points_settings; r public.match_rules;
        v_winner uuid; v_g int; v_s int; v_periods jsonb := '[]'::jsonb; v_played int; v_note text; v_now timestamptz := clock_timestamp();
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status = 'completed' then perform public.raise_err('FIXTURE_NOT_EDITABLE', '{"status":"completed"}'); end if;
  if f.home_team_id is null or f.away_team_id is null then perform public.raise_err('MATCH_NOT_STARTABLE', '{"reason":"Both teams must be known"}'); end if;
  perform public._check_scores(p_home_score, p_away_score);
  v_note := public.clean_text(p_note);
  if char_length(coalesce(v_note, '')) > 200 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"note":"Up to 200 characters"}}'); end if;
  select * into ps from public.points_settings where tournament_id = v_tid;
  r := public._rules(v_tid);
  if p_home_score = p_away_score and (f.stage = 'playoff' or not ps.allow_draws) then
    perform public.raise_err('TIED_NO_DRAWS', jsonb_build_object('stage', f.stage));
  end if;
  v_winner := case when p_home_score > p_away_score then f.home_team_id when p_away_score > p_home_score then f.away_team_id end;
  select * into ms from public.match_states where fixture_id = f.id for update;
  if found then
    v_g := public._eff_ms(ms.clock_remaining_ms, ms.clock_running, ms.clock_updated_at);
    v_s := public._eff_ms(ms.shot_clock_remaining_ms, ms.shot_clock_running, ms.shot_clock_updated_at);
    v_periods := ms.period_scores;
    if not ms.is_break then
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', ms.period, 'home_total', p_home_score, 'away_total', p_away_score));
    elsif jsonb_array_length(v_periods) > 0 then
      v_periods := jsonb_set(v_periods, array[(jsonb_array_length(v_periods) - 1)::text],
        (v_periods->(jsonb_array_length(v_periods) - 1)) || jsonb_build_object('home_total', p_home_score, 'away_total', p_away_score));
    end if;
    v_played := ms.period;
    update public.match_states set home_score = p_home_score, away_score = p_away_score, period_scores = v_periods,
      clock_running = false, clock_remaining_ms = v_g, clock_updated_at = v_now,
      shot_clock_running = false, shot_clock_remaining_ms = v_s, shot_clock_updated_at = v_now,
      ended_at = v_now, version = version + 1
    where fixture_id = f.id;
    perform public._scoring_event(f.id, 'match_ended', null, null, null,
      jsonb_build_object('desc', format('Final: %s-%s', p_home_score, p_away_score), 'live_home', ms.home_score, 'live_away', ms.away_score,
        'final_home', p_home_score, 'final_away', p_away_score), null);
  else
    v_played := r.quarters;
  end if;
  insert into public.match_results (fixture_id, tournament_id, home_score, away_score, winner_team_id, result_type,
         periods_played, period_scores, note, completed_at, completed_by)
  values (f.id, v_tid, p_home_score, p_away_score, v_winner, 'normal', v_played, v_periods, v_note, now(), auth.uid());
  update public.fixtures set status = 'completed', postponed_reason = null where id = f.id;
  return public._match_payload(f.id, jsonb_build_object('result', (select to_jsonb(x) from public.match_results x where x.fixture_id = f.id)));
end $$;

create or replace function public.record_forfeit(p_fixture_id uuid, p_winner_team_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; ps public.points_settings; v_reason text; v_home int; v_away int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status not in ('upcoming','postponed') then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  if f.home_team_id is null or f.away_team_id is null then perform public.raise_err('MATCH_NOT_STARTABLE', '{"reason":"Both teams must be known"}'); end if;
  if p_winner_team_id is null or p_winner_team_id not in (f.home_team_id, f.away_team_id) then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"winner":"Pick one of the two teams"}}');
  end if;
  v_reason := public.clean_text(p_reason);
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  select * into ps from public.points_settings where tournament_id = v_tid;
  v_home := case when p_winner_team_id = f.home_team_id then ps.forfeit_score else 0 end;
  v_away := case when p_winner_team_id = f.away_team_id then ps.forfeit_score else 0 end;
  insert into public.match_results (fixture_id, tournament_id, home_score, away_score, winner_team_id, result_type,
         periods_played, period_scores, note, completed_at, completed_by)
  values (f.id, v_tid, v_home, v_away, p_winner_team_id, 'forfeit', 0, '[]', 'Forfeit: ' || v_reason, now(), auth.uid());
  update public.fixtures set status = 'completed', postponed_reason = null where id = f.id;
  return jsonb_build_object('result', (select to_jsonb(x) from public.match_results x where x.fixture_id = f.id));
end $$;

create or replace function public.correct_match_result(p_fixture_id uuid, p_home_score int, p_away_score int, p_note text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; ps public.points_settings; mr public.match_results; v_winner uuid; v_note text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  select * into mr from public.match_results where fixture_id = f.id for update;
  if f.status <> 'completed' or mr.fixture_id is null then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  v_note := public.clean_text(p_note);
  if v_note is null or char_length(v_note) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"note":"A note of 1 to 200 characters is required"}}');
  end if;
  perform public._check_scores(p_home_score, p_away_score);
  select * into ps from public.points_settings where tournament_id = v_tid;
  if p_home_score = p_away_score and (f.stage = 'playoff' or not ps.allow_draws) then
    perform public.raise_err('TIED_NO_DRAWS', jsonb_build_object('stage', f.stage));
  end if;
  v_winner := case when p_home_score > p_away_score then f.home_team_id when p_away_score > p_home_score then f.away_team_id end;
  if f.stage = 'playoff' then perform public._playoff_lock_check(f.id, v_winner); end if;
  update public.match_results set home_score = p_home_score, away_score = p_away_score, winner_team_id = v_winner,
    result_type = 'normal', correction_count = correction_count + 1, last_corrected_at = now(),
    last_corrected_by = auth.uid(), correction_note = v_note,
    period_scores = case when jsonb_array_length(period_scores) > 0 then
      jsonb_set(period_scores, array[(jsonb_array_length(period_scores) - 1)::text],
        (period_scores->(jsonb_array_length(period_scores) - 1)) || jsonb_build_object('home_total', p_home_score, 'away_total', p_away_score))
      else period_scores end
  where fixture_id = f.id;
  update public.match_states set home_score = p_home_score, away_score = p_away_score, version = version + 1 where fixture_id = f.id;
  return jsonb_build_object('result', (select to_jsonb(x) from public.match_results x where x.fixture_id = f.id));
end $$;

create or replace function public.reopen_match(p_fixture_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; v_reason text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status <> 'completed' then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  if not exists (select 1 from public.match_states where fixture_id = f.id) then
    perform public.raise_err('MATCH_NOT_STARTABLE', '{"reason":"No live record exists: correct the result instead"}');
  end if;
  v_reason := public.clean_text(p_reason);
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  if exists (select 1 from public.fixtures o where o.tournament_id = v_tid and o.status = 'live' and o.id <> f.id
             and (o.home_team_id in (f.home_team_id, f.away_team_id) or o.away_team_id in (f.home_team_id, f.away_team_id))) then
    perform public.raise_err('MATCH_TEAM_BUSY', '{}');
  end if;
  if f.stage = 'playoff' then perform public._playoff_lock_check(f.id, null); end if;
  delete from public.match_results where fixture_id = f.id;
  update public.fixtures set status = 'live' where id = f.id;
  update public.match_states set ended_at = null, clock_running = false, shot_clock_running = false, version = version + 1
   where fixture_id = f.id;
  return public._match_payload(f.id, jsonb_build_object('reason', v_reason));
end $$;

create or replace function public.abandon_match(p_fixture_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; v_reason text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status <> 'live' then perform public.raise_err('MATCH_NOT_LIVE', jsonb_build_object('status', f.status)); end if;
  v_reason := public.clean_text(p_reason);
  if v_reason is null then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason is required"}}'); end if;
  delete from public.match_states where fixture_id = f.id;
  update public.live_scoring_events set is_voided = true where fixture_id = f.id and not is_voided;
  update public.fixtures set status = 'postponed', postponed_reason = left('Abandoned: ' || v_reason, 200) where id = f.id returning * into f;
  return jsonb_build_object('fixture', to_jsonb(f));
end $$;

-- ---------------------------------------------------------------------------
-- Match rules (11.6)
-- ---------------------------------------------------------------------------
create or replace function public.save_match_rules(p_rules jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; cur public.match_rules; n public.match_rules; v_e jsonb := '{}'::jsonb;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.ensure_tournament_children(v_tid);
  select * into cur from public.match_rules where tournament_id = v_tid for update;
  begin
    n := jsonb_populate_record(cur, p_rules - 'tournament_id' - 'created_at' - 'updated_at');
  exception when others then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"rules":"A value has the wrong type"}}');
  end;
  if n.quarters not between 2 and 4 then v_e := v_e || '{"quarters":"2 to 4"}'; end if;
  if n.quarter_seconds not between 60 and 3600 then v_e := v_e || '{"quarter_seconds":"60 to 3600 seconds"}'; end if;
  if n.overtime_seconds not between 60 and 1800 then v_e := v_e || '{"overtime_seconds":"60 to 1800 seconds"}'; end if;
  if n.shot_clock_seconds not between 10 and 60 then v_e := v_e || '{"shot_clock_seconds":"10 to 60 seconds"}'; end if;
  if n.shot_clock_short_reset_seconds not between 5 and n.shot_clock_seconds then v_e := v_e || '{"shot_clock_short_reset_seconds":"5 to the full shot clock"}'; end if;
  if n.timeouts_first_half not between 0 and 10 then v_e := v_e || '{"timeouts_first_half":"0 to 10"}'; end if;
  if n.timeouts_second_half not between 0 and 10 then v_e := v_e || '{"timeouts_second_half":"0 to 10"}'; end if;
  if n.timeouts_per_overtime not between 0 and 5 then v_e := v_e || '{"timeouts_per_overtime":"0 to 5"}'; end if;
  if n.team_foul_bonus_threshold not between 1 and 20 then v_e := v_e || '{"team_foul_bonus_threshold":"1 to 20"}'; end if;
  if v_e <> '{}'::jsonb then perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', v_e)); end if;
  if n.quarters <> cur.quarters and exists (select 1 from public.fixtures where tournament_id = v_tid and status = 'live') then
    perform public.raise_err('SETTINGS_CONFLICT', '{"field":"quarters","reason":"A match is live"}');
  end if;
  update public.match_rules set quarters = n.quarters, quarter_seconds = n.quarter_seconds, overtime_seconds = n.overtime_seconds,
    shot_clock_seconds = n.shot_clock_seconds, shot_clock_short_reset_seconds = n.shot_clock_short_reset_seconds,
    timeouts_first_half = n.timeouts_first_half, timeouts_second_half = n.timeouts_second_half,
    timeouts_per_overtime = n.timeouts_per_overtime, team_foul_bonus_threshold = n.team_foul_bonus_threshold,
    hide_shot_clock_under_game_clock = n.hide_shot_clock_under_game_clock
  where tournament_id = v_tid returning * into n;
  return to_jsonb(n);
end $$;

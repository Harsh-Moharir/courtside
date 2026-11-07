-- 0005_functions_fixtures.sql
-- League generation (circle method), auto-scheduling, manual fixture management (section 7).

-- Deterministic PRNG shared with src/lib/domain/roundRobin.ts (LCG, glibc constants, 31-bit state).
create or replace function public._lcg_next(p_state bigint) returns bigint
language sql immutable as $$
  select (p_state * 1103515245 + 12345) % 2147483648
$$;

-- Pure pairing function: returns rows (round_number, home, away) for the ordered team list.
-- Mirrors generateRoundRobin() in src/lib/domain/roundRobin.ts exactly.
create or replace function public.round_robin_pairs(p_teams uuid[], p_double boolean, p_seed int default null)
returns table (round_number int, pair_index int, home uuid, away uuid)
language plpgsql immutable as $$
declare
  t uuid[] := p_teams; m int; n int; r int; i int; a uuid; b uuid; h uuid; aw uuid;
  v_state bigint; j int; tmp uuid; rot uuid[];
  home_count jsonb := '{}'::jsonb; last_away jsonb := '{}'::jsonb;
  ha int; hb int; la boolean; lb boolean;
  first_leg jsonb := '[]'::jsonb; rec jsonb;
begin
  n := coalesce(cardinality(t), 0);
  if n < 2 then return; end if;
  if p_seed is not null then
    v_state := abs(p_seed::bigint) % 2147483648;
    for i in reverse n..2 loop
      v_state := public._lcg_next(v_state);
      j := (v_state % i)::int + 1;
      tmp := t[i]; t[i] := t[j]; t[j] := tmp;
    end loop;
  end if;
  if n % 2 = 1 then t := t || null::uuid; end if;
  m := cardinality(t);
  for r in 0..m-2 loop
    for i in 0..(m/2)-1 loop
      a := t[i+1]; b := t[m-i];
      if a is null or b is null then continue; end if;
      ha := coalesce((home_count->>a::text)::int, 0);
      hb := coalesce((home_count->>b::text)::int, 0);
      la := coalesce((last_away->>a::text)::boolean, false);
      lb := coalesce((last_away->>b::text)::boolean, false);
      if ha < hb then h := a; aw := b;
      elsif hb < ha then h := b; aw := a;
      elsif la and not lb then h := a; aw := b;
      elsif lb and not la then h := b; aw := a;
      elsif (r + i) % 2 = 0 then h := a; aw := b;
      else h := b; aw := a;
      end if;
      home_count := home_count || jsonb_build_object(h::text, coalesce((home_count->>h::text)::int, 0) + 1);
      last_away := last_away || jsonb_build_object(h::text, false, aw::text, true);
      round_number := r + 1; pair_index := i; home := h; away := aw;
      first_leg := first_leg || jsonb_build_object('r', r + 1, 'i', i, 'h', h, 'a', aw);
      return next;
    end loop;
    rot := array[t[1], t[m]] || t[2:m-1];
    t := rot;
  end loop;
  if p_double then
    for rec in select * from jsonb_array_elements(first_leg) loop
      round_number := (rec->>'r')::int + (m - 1);
      pair_index := (rec->>'i')::int;
      home := (rec->>'a')::uuid; away := (rec->>'h')::uuid;
      return next;
    end loop;
  end if;
end $$;

create or replace function public.generate_league_fixtures(p_format text, p_shuffle_seed int default null, p_replace boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; v_teams uuid[]; v_venue text; v_base int; v_n int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform 1 from public.tournaments where id = v_tid for update;
  if p_format not in ('single','double') then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"format":"Choose single or double"}}');
  end if;
  select coalesce(array_agg(id order by sort_order, name), '{}') into v_teams from public.teams where tournament_id = v_tid;
  if cardinality(v_teams) < 2 then perform public.raise_err('TEAMS_NOT_ENOUGH', jsonb_build_object('teams', cardinality(v_teams))); end if;
  if exists (select 1 from public.fixtures where tournament_id = v_tid and stage = 'league') then
    if not coalesce(p_replace, false) then perform public.raise_err('FIXTURES_EXIST', '{}'); end if;
    if exists (select 1 from public.fixtures where tournament_id = v_tid and stage = 'league' and status in ('live','completed')) then
      perform public.raise_err('FIXTURE_NOT_EDITABLE', '{"reason":"Live or completed league fixtures exist"}');
    end if;
    update public.tournaments set featured_fixture_id = null
     where id = v_tid and featured_fixture_id in (select id from public.fixtures where tournament_id = v_tid and stage = 'league');
    delete from public.fixtures where tournament_id = v_tid and stage = 'league' and status in ('upcoming','postponed');
  end if;
  select venue_default into v_venue from public.tournaments where id = v_tid;
  -- League fixtures come first; playoff fixtures (if any) are renumbered after them.
  update public.fixtures set match_number = match_number + 100000 where tournament_id = v_tid;
  insert into public.fixtures (tournament_id, stage, match_number, round_number, home_team_id, away_team_id, venue)
  select v_tid, 'league', row_number() over (order by rr.round_number, rr.pair_index), rr.round_number, rr.home, rr.away, v_venue
  from public.round_robin_pairs(v_teams, p_format = 'double', p_shuffle_seed) rr;
  get diagnostics v_n = row_count;
  v_base := v_n;
  with ordered as (
    select f.id, row_number() over (order by f.round_number, coalesce(pn.position, 0), f.match_number) rn
    from public.fixtures f left join public.playoff_nodes pn on pn.fixture_id = f.id
    where f.tournament_id = v_tid and f.stage = 'playoff')
  update public.fixtures f set match_number = v_base + o.rn from ordered o where o.id = f.id;
  update public.tournaments set phase = 'league' where id = v_tid and phase in ('setup','auction');
  return jsonb_build_object('created', v_n, 'teams', cardinality(v_teams), 'format', p_format);
end $$;

create or replace function public.auto_schedule_fixtures(
  p_start_date date, p_game_days int[], p_first_start time, p_slot_minutes int default 90,
  p_courts text[] default null, p_slots_per_day int default 4, p_scope text default 'unscheduled')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; v_tz text; d date; s int; c text; f record; v_busy uuid[]; v_at timestamptz;
        v_pending uuid[]; v_done int := 0; v_day int := 0; v_fid uuid; v_taken boolean;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform 1 from public.tournaments where id = v_tid for update;
  if p_start_date is null or p_first_start is null then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"start":"Start date and time are required"}}'); end if;
  if p_game_days is null or cardinality(p_game_days) = 0 or exists (select 1 from unnest(p_game_days) x where x not between 1 and 7) then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"game_days":"Pick at least one weekday"}}');
  end if;
  if p_courts is null or cardinality(p_courts) = 0 or exists (select 1 from unnest(p_courts) x where public.clean_text(x) is null) then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"courts":"Enter at least one court or venue"}}');
  end if;
  if coalesce(p_slot_minutes, 0) not between 15 and 600 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"slot_minutes":"15 to 600 minutes"}}'); end if;
  if coalesce(p_slots_per_day, 0) not between 1 and 24 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"slots_per_day":"1 to 24 slots"}}'); end if;
  if p_scope not in ('unscheduled','all') then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"scope":"unscheduled or all"}}'); end if;
  select timezone into v_tz from public.tournaments where id = v_tid;

  if p_scope = 'all' then
    update public.fixtures set scheduled_at = null where tournament_id = v_tid and stage = 'league' and status = 'upcoming';
  end if;
  select coalesce(array_agg(id order by match_number), '{}') into v_pending from public.fixtures
   where tournament_id = v_tid and stage = 'league' and status = 'upcoming' and scheduled_at is null;

  d := p_start_date;
  while cardinality(v_pending) > 0 loop
    if v_day > 366 then
      perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('schedule', 'Could not fit every fixture within 366 days'),
        'scheduled', v_done, 'unscheduled', cardinality(v_pending)));
    end if;
    if extract(isodow from d)::int = any(p_game_days) then
      -- Teams already playing on this date (tournament time zone), including fixtures scheduled earlier.
      select coalesce(array_agg(x), '{}') into v_busy from (
        select home_team_id x from public.fixtures where tournament_id = v_tid and scheduled_at is not null
          and (scheduled_at at time zone v_tz)::date = d and home_team_id is not null
        union select away_team_id from public.fixtures where tournament_id = v_tid and scheduled_at is not null
          and (scheduled_at at time zone v_tz)::date = d and away_team_id is not null) q;
      for s in 0..p_slots_per_day-1 loop
        v_at := ((d::timestamp + p_first_start + make_interval(mins => s * p_slot_minutes)) at time zone v_tz);
        foreach c in array p_courts loop
          c := public.clean_text(c);
          select exists (select 1 from public.fixtures where tournament_id = v_tid and scheduled_at = v_at and venue = c) into v_taken;
          if v_taken then continue; end if;
          v_fid := null;
          select f2.id into v_fid from unnest(v_pending) with ordinality u(id, ord)
            join public.fixtures f2 on f2.id = u.id
           where not (f2.home_team_id = any(v_busy)) and not (f2.away_team_id = any(v_busy))
           order by u.ord limit 1;
          if v_fid is null then continue; end if;
          update public.fixtures set scheduled_at = v_at, venue = c where id = v_fid returning home_team_id, away_team_id into f;
          v_busy := v_busy || f.home_team_id || f.away_team_id;
          v_pending := array_remove(v_pending, v_fid);
          v_done := v_done + 1;
          exit when cardinality(v_pending) = 0;
        end loop;
        exit when cardinality(v_pending) = 0;
      end loop;
    end if;
    d := d + 1;
    v_day := v_day + 1;
  end loop;
  return jsonb_build_object('scheduled', v_done, 'unscheduled',
    (select count(*) from public.fixtures where tournament_id = v_tid and stage = 'league' and scheduled_at is null and status = 'upcoming'));
end $$;

create or replace function public._fixture_warnings(p_fixture_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.fixtures; v_w jsonb := '[]'::jsonb; v_slot int := 90; r record;
begin
  select * into f from public.fixtures where id = p_fixture_id;
  if f.scheduled_at is null then return v_w; end if;
  if f.scheduled_at < now() and f.status = 'upcoming' then
    v_w := v_w || jsonb_build_object('code', 'DATE_IN_PAST', 'message', 'The date is in the past');
  end if;
  for r in select o.match_number from public.fixtures o
    where o.tournament_id = f.tournament_id and o.id <> f.id and o.scheduled_at is not null
      and abs(extract(epoch from o.scheduled_at - f.scheduled_at)) < 7200
      and (o.home_team_id in (f.home_team_id, f.away_team_id) or o.away_team_id in (f.home_team_id, f.away_team_id))
  loop
    v_w := v_w || jsonb_build_object('code', 'TEAM_CLASH', 'message', format('A team also plays match %s within 2 hours', r.match_number));
  end loop;
  if f.venue is not null then
    for r in select o.match_number from public.fixtures o
      where o.tournament_id = f.tournament_id and o.id <> f.id and o.venue = f.venue and o.scheduled_at is not null
        and abs(extract(epoch from o.scheduled_at - f.scheduled_at)) < v_slot * 60
    loop
      v_w := v_w || jsonb_build_object('code', 'VENUE_CLASH', 'message', format('Match %s uses the same venue within %s minutes', r.match_number, v_slot));
    end loop;
  end if;
  return v_w;
end $$;

create or replace function public.create_fixture(
  p_home uuid, p_away uuid, p_scheduled_at timestamptz default null, p_venue text default null,
  p_round int default null, p_allow_duplicate boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; v_num int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform 1 from public.tournaments where id = v_tid for update;
  if p_home is null or p_away is null or p_home = p_away
     or (select count(*) from public.teams where id in (p_home, p_away) and tournament_id = v_tid) <> 2 then
    perform public.raise_err('FIXTURE_TEAMS_INVALID', '{}');
  end if;
  if not coalesce(p_allow_duplicate, false) and exists (
      select 1 from public.fixtures where tournament_id = v_tid and stage = 'league' and home_team_id = p_home and away_team_id = p_away) then
    perform public.raise_err('FIXTURE_DUPLICATE', '{}');
  end if;
  if p_round is not null and p_round < 1 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"round":"Round must be 1 or more"}}'); end if;
  select coalesce(max(match_number), 0) + 1 into v_num from public.fixtures where tournament_id = v_tid;
  insert into public.fixtures (tournament_id, stage, match_number, round_number, home_team_id, away_team_id, scheduled_at, venue)
  values (v_tid, 'league', v_num, p_round, p_home, p_away, p_scheduled_at,
          coalesce(public.clean_text(p_venue), (select venue_default from public.tournaments where id = v_tid)))
  returning * into f;
  return jsonb_build_object('fixture', to_jsonb(f), 'warnings', public._fixture_warnings(f.id));
end $$;

create or replace function public.update_fixture(
  p_fixture_id uuid, p_scheduled_at timestamptz, p_venue text, p_notes text,
  p_home uuid default null, p_away uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; v_home uuid; v_away uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status not in ('upcoming','postponed') then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  if char_length(coalesce(p_notes, '')) > 200 or char_length(coalesce(p_venue, '')) > 80 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"notes":"Notes up to 200, venue up to 80 characters"}}');
  end if;
  v_home := f.home_team_id; v_away := f.away_team_id;
  if f.stage = 'league' then
    v_home := coalesce(p_home, f.home_team_id); v_away := coalesce(p_away, f.away_team_id);
    if v_home = v_away or (select count(*) from public.teams where id in (v_home, v_away) and tournament_id = v_tid) <> 2 then
      perform public.raise_err('FIXTURE_TEAMS_INVALID', '{}');
    end if;
  end if;
  update public.fixtures set scheduled_at = p_scheduled_at, venue = public.clean_text(p_venue), notes = public.clean_text(p_notes),
         home_team_id = v_home, away_team_id = v_away
   where id = f.id returning * into f;
  return jsonb_build_object('fixture', to_jsonb(f), 'warnings', public._fixture_warnings(f.id));
end $$;

create or replace function public.delete_fixture(p_fixture_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.stage <> 'league' or f.status not in ('upcoming','postponed')
     or exists (select 1 from public.match_states where fixture_id = f.id) then
    perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status, 'stage', f.stage));
  end if;
  delete from public.live_scoring_events where fixture_id = f.id;
  delete from public.fixtures where id = f.id;
  return jsonb_build_object('deleted', f.id);
end $$;

create or replace function public.renumber_fixtures() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; v_n int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform 1 from public.tournaments where id = v_tid for update;
  with ordered as (
    select f.id, row_number() over (order by
      case when f.stage = 'league' then 0 else 1 end,
      case when f.stage = 'league' then f.scheduled_at end nulls last,
      f.round_number nulls last, coalesce(pn.position, 0), f.match_number) rn
    from public.fixtures f left join public.playoff_nodes pn on pn.fixture_id = f.id
    where f.tournament_id = v_tid)
  update public.fixtures f set match_number = o.rn from ordered o where o.id = f.id and f.match_number <> o.rn;
  get diagnostics v_n = row_count;
  return jsonb_build_object('renumbered', v_n);
end $$;

create or replace function public.set_featured_fixture(p_fixture_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  if p_fixture_id is not null and not exists (select 1 from public.fixtures where id = p_fixture_id and tournament_id = v_tid) then
    perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}');
  end if;
  update public.tournaments set featured_fixture_id = p_fixture_id where id = v_tid;
  return jsonb_build_object('featured_fixture_id', p_fixture_id);
end $$;

create or replace function public.postpone_fixture(p_fixture_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures; v_reason text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  v_reason := public.clean_text(p_reason);
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status <> 'upcoming' then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  update public.fixtures set status = 'postponed', postponed_reason = v_reason where id = f.id returning * into f;
  return jsonb_build_object('fixture', to_jsonb(f));
end $$;

create or replace function public.reschedule_fixture(p_fixture_id uuid, p_scheduled_at timestamptz, p_venue text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  if p_scheduled_at is null then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"scheduled_at":"A new date is required"}}'); end if;
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if f.status <> 'postponed' then perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status)); end if;
  update public.fixtures set status = 'upcoming', postponed_reason = null, scheduled_at = p_scheduled_at,
         venue = coalesce(public.clean_text(p_venue), venue)
   where id = f.id returning * into f;
  return jsonb_build_object('fixture', to_jsonb(f), 'warnings', public._fixture_warnings(f.id));
end $$;

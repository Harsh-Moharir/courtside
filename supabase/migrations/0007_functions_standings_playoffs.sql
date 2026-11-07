-- 0007_functions_standings_playoffs.sql
-- Standings (section 9) and playoffs (section 10). compute_standings is pure; recalculate_standings writes the table.

-- ---------------------------------------------------------------------------
-- Pure ranking (9.3). Mirrors src/lib/domain/standings.ts.
-- p_stats: {team_id: {pts, pd, pf, pa, w, name, mrank}}
-- p_matches: [{home_team_id, away_team_id, home_score, away_score, winner_team_id}]
-- Returns [{id, reason}] where reason separates the team from the one above it inside the group.
-- ---------------------------------------------------------------------------
create or replace function public._st_rank_group(p_group text[], p_k int, p_stats jsonb, p_matches jsonb, p_settings jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  v_order text[]; c text; v_out jsonb := '[]'::jsonb; v_sub jsonb; v_groups int; g record; v_first boolean := true;
  v_win int := (p_settings->>'win_points')::int;
  v_loss int := (p_settings->>'loss_points')::int;
  v_draw int := (p_settings->>'draw_points')::int;
begin
  if cardinality(p_group) = 1 then
    return jsonb_build_array(jsonb_build_object('id', p_group[1], 'reason', null));
  end if;
  select coalesce(array_agg(x order by o), '{}') into v_order
    from jsonb_array_elements_text(p_settings->'tiebreaker_order') with ordinality t(x, o);
  if p_k >= cardinality(v_order) then
    select jsonb_agg(jsonb_build_object('id', id, 'reason', case when rn = 1 then null else 'fallback' end) order by rn) into v_out
    from (select id, row_number() over (order by (p_stats->id->>'mrank')::int nulls last,
                 lower(p_stats->id->>'name') collate "C", id collate "C") rn
          from unnest(p_group) id) q;
    return v_out;
  end if;
  c := v_order[p_k + 1];

  with keys as (
    select id,
      case c
        when 'head_to_head' then coalesce((
          select sum(case when m->>'winner_team_id' is null then v_draw
                          when m->>'winner_team_id' = id then v_win else v_loss end)
          from jsonb_array_elements(p_matches) m
          where (m->>'home_team_id' = id or m->>'away_team_id' = id)
            and m->>'home_team_id' = any(p_group) and m->>'away_team_id' = any(p_group)), 0)
        when 'point_difference' then (p_stats->id->>'pf')::bigint - (p_stats->id->>'pa')::bigint
        when 'points_for' then (p_stats->id->>'pf')::bigint
        when 'points_against_lowest' then -(p_stats->id->>'pa')::bigint
        when 'wins' then (p_stats->id->>'w')::bigint
      end as k1,
      case c when 'head_to_head' then coalesce((
          select sum(case when m->>'home_team_id' = id then (m->>'home_score')::int - (m->>'away_score')::int
                          else (m->>'away_score')::int - (m->>'home_score')::int end)
          from jsonb_array_elements(p_matches) m
          where (m->>'home_team_id' = id or m->>'away_team_id' = id)
            and m->>'home_team_id' = any(p_group) and m->>'away_team_id' = any(p_group)), 0)
        else 0 end as k2
    from unnest(p_group) id),
  ranked as (select id, dense_rank() over (order by k1 desc, k2 desc) dr from keys)
  select max(dr) into v_groups from ranked;

  if v_groups = 1 then
    return public._st_rank_group(p_group, p_k + 1, p_stats, p_matches, p_settings);
  end if;

  for g in
    with keys as (
      select id,
        case c
          when 'head_to_head' then coalesce((
            select sum(case when m->>'winner_team_id' is null then v_draw
                            when m->>'winner_team_id' = id then v_win else v_loss end)
            from jsonb_array_elements(p_matches) m
            where (m->>'home_team_id' = id or m->>'away_team_id' = id)
              and m->>'home_team_id' = any(p_group) and m->>'away_team_id' = any(p_group)), 0)
          when 'point_difference' then (p_stats->id->>'pf')::bigint - (p_stats->id->>'pa')::bigint
          when 'points_for' then (p_stats->id->>'pf')::bigint
          when 'points_against_lowest' then -(p_stats->id->>'pa')::bigint
          when 'wins' then (p_stats->id->>'w')::bigint
        end as k1,
        case c when 'head_to_head' then coalesce((
            select sum(case when m->>'home_team_id' = id then (m->>'home_score')::int - (m->>'away_score')::int
                            else (m->>'away_score')::int - (m->>'home_score')::int end)
            from jsonb_array_elements(p_matches) m
            where (m->>'home_team_id' = id or m->>'away_team_id' = id)
              and m->>'home_team_id' = any(p_group) and m->>'away_team_id' = any(p_group)), 0)
          else 0 end as k2
      from unnest(p_group) id)
    select k1, k2, array_agg(id order by id collate "C") ids
    from keys group by k1, k2 order by k1 desc, k2 desc
  loop
    if cardinality(g.ids) > 1 then
      v_sub := public._st_rank_group(g.ids, 0, p_stats, p_matches, p_settings);
    else
      v_sub := jsonb_build_array(jsonb_build_object('id', g.ids[1], 'reason', null));
    end if;
    if not v_first then
      v_sub := jsonb_set(v_sub, '{0,reason}', to_jsonb(c));
    end if;
    v_first := false;
    v_out := v_out || v_sub;
  end loop;
  return v_out;
end $$;

create or replace function public._st_reason_label(p_reason text, p_other text) returns text
language sql immutable as $$
  select case p_reason
    when 'head_to_head' then 'Head-to-head vs ' || p_other
    when 'point_difference' then 'Point difference'
    when 'points_for' then 'Points scored'
    when 'points_against_lowest' then 'Fewest points against'
    when 'wins' then 'Wins'
    when 'fallback' then 'Level on all criteria, ordered by admin ranking or name' end
$$;

-- p_teams: [{id, name, manual_tiebreak_rank}]
-- p_matches: counted fixtures only [{home_team_id, away_team_id, home_score, away_score, winner_team_id}]
-- p_settings: {win_points, loss_points, draw_points, tiebreaker_order: [...]}
create or replace function public.compute_standings(p_teams jsonb, p_matches jsonb, p_settings jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_stats jsonb := '{}'::jsonb; t jsonb; v_id text; v_played int; v_w int; v_l int; v_d int; v_pf int; v_pa int; v_pts int;
  v_order jsonb := '[]'::jsonb; v_group text[]; v_pts_cur int; g record; v_ranked jsonb; v_res jsonb := '[]'::jsonb;
  i int; n int; v_note text; v_above jsonb; v_below jsonb; v_me jsonb;
  v_win int := (p_settings->>'win_points')::int;
  v_loss int := (p_settings->>'loss_points')::int;
  v_draw int := (p_settings->>'draw_points')::int;
begin
  for t in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    v_id := t->>'id';
    select count(*),
           count(*) filter (where m->>'winner_team_id' = v_id),
           count(*) filter (where m->>'winner_team_id' is not null and m->>'winner_team_id' <> v_id),
           count(*) filter (where m->>'winner_team_id' is null),
           coalesce(sum(case when m->>'home_team_id' = v_id then (m->>'home_score')::int else (m->>'away_score')::int end), 0),
           coalesce(sum(case when m->>'home_team_id' = v_id then (m->>'away_score')::int else (m->>'home_score')::int end), 0)
      into v_played, v_w, v_l, v_d, v_pf, v_pa
    from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) m
    where (m->>'home_team_id' = v_id or m->>'away_team_id' = v_id)
      and exists (select 1 from jsonb_array_elements(p_teams) x where x->>'id' = m->>'home_team_id')
      and exists (select 1 from jsonb_array_elements(p_teams) x where x->>'id' = m->>'away_team_id');
    v_pts := v_w * v_win + v_l * v_loss + v_d * v_draw;
    v_stats := v_stats || jsonb_build_object(v_id, jsonb_build_object('played', v_played, 'w', v_w, 'l', v_l, 'd', v_d,
      'pf', v_pf, 'pa', v_pa, 'pts', v_pts, 'name', t->>'name', 'mrank', t->'manual_tiebreak_rank'));
  end loop;

  for g in
    select (v->>'pts')::int pts, array_agg(k order by k collate "C") ids
    from jsonb_each(v_stats) e(k, v) group by 1 order by 1 desc
  loop
    if cardinality(g.ids) > 1 then
      v_ranked := public._st_rank_group(g.ids, 0, v_stats, p_matches, p_settings);
      v_ranked := jsonb_set(v_ranked, '{0,reason}', 'null'::jsonb);
    else
      v_ranked := jsonb_build_array(jsonb_build_object('id', g.ids[1], 'reason', null));
    end if;
    v_order := v_order || v_ranked;
  end loop;

  n := jsonb_array_length(v_order);
  for i in 0..n-1 loop
    v_me := v_order->i;
    v_id := v_me->>'id';
    v_above := case when i > 0 then v_order->(i-1) end;
    v_below := case when i < n-1 then v_order->(i+1) end;
    v_note := null;
    if v_above is not null and (v_stats->(v_above->>'id')->>'pts') = (v_stats->v_id->>'pts') and v_me->>'reason' is not null then
      v_note := public._st_reason_label(v_me->>'reason', v_stats->(v_above->>'id')->>'name');
    elsif v_below is not null and (v_stats->(v_below->>'id')->>'pts') = (v_stats->v_id->>'pts') and v_below->>'reason' is not null then
      v_note := public._st_reason_label(v_below->>'reason', v_stats->(v_below->>'id')->>'name');
    end if;
    v_res := v_res || jsonb_build_object(
      'team_id', v_id, 'rank', i + 1,
      'played', (v_stats->v_id->>'played')::int, 'wins', (v_stats->v_id->>'w')::int,
      'losses', (v_stats->v_id->>'l')::int, 'draws', (v_stats->v_id->>'d')::int,
      'points_for', (v_stats->v_id->>'pf')::int, 'points_against', (v_stats->v_id->>'pa')::int,
      'point_diff', (v_stats->v_id->>'pf')::int - (v_stats->v_id->>'pa')::int,
      'league_points', (v_stats->v_id->>'pts')::int, 'tiebreak_note', v_note);
  end loop;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------
-- Recalculation (9.4)
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_standings(p_tid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teams jsonb; v_matches jsonb; v_settings jsonb; v_rows jsonb;
begin
  if p_tid is null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'manual_tiebreak_rank', manual_tiebreak_rank)), '[]')
    into v_teams from public.teams where tournament_id = p_tid;
  select coalesce(jsonb_agg(jsonb_build_object('home_team_id', f.home_team_id, 'away_team_id', f.away_team_id,
           'home_score', r.home_score, 'away_score', r.away_score, 'winner_team_id', r.winner_team_id)), '[]')
    into v_matches
  from public.fixtures f join public.match_results r on r.fixture_id = f.id
  where f.tournament_id = p_tid and f.stage = 'league' and f.status = 'completed';
  select jsonb_build_object('win_points', win_points, 'loss_points', loss_points, 'draw_points', draw_points,
           'tiebreaker_order', to_jsonb(tiebreaker_order))
    into v_settings from public.points_settings where tournament_id = p_tid;
  if v_settings is null then return; end if;
  v_rows := public.compute_standings(v_teams, v_matches, v_settings);

  delete from public.standings s where s.tournament_id = p_tid
    and not exists (select 1 from public.teams t where t.id = s.team_id);
  insert into public.standings as s (tournament_id, team_id, played, wins, losses, draws, points_for, points_against,
         league_points, remaining, rank, tiebreak_note, updated_at)
  select p_tid, (x->>'team_id')::uuid, (x->>'played')::int, (x->>'wins')::int, (x->>'losses')::int, (x->>'draws')::int,
         (x->>'points_for')::int, (x->>'points_against')::int, (x->>'league_points')::int,
         (select count(*) from public.fixtures f where f.tournament_id = p_tid and f.stage = 'league' and f.status <> 'completed'
            and (f.home_team_id = (x->>'team_id')::uuid or f.away_team_id = (x->>'team_id')::uuid)),
         (x->>'rank')::smallint, x->>'tiebreak_note', now()
  from jsonb_array_elements(v_rows) x
  on conflict (tournament_id, team_id) do update set
    played = excluded.played, wins = excluded.wins, losses = excluded.losses, draws = excluded.draws,
    points_for = excluded.points_for, points_against = excluded.points_against, league_points = excluded.league_points,
    remaining = excluded.remaining, rank = excluded.rank, tiebreak_note = excluded.tiebreak_note, updated_at = now()
  where (s.played, s.wins, s.losses, s.draws, s.points_for, s.points_against, s.league_points, s.remaining, s.rank, s.tiebreak_note)
        is distinct from
        (excluded.played, excluded.wins, excluded.losses, excluded.draws, excluded.points_for, excluded.points_against,
         excluded.league_points, excluded.remaining, excluded.rank, excluded.tiebreak_note);

  perform public.refresh_bracket_seeds(p_tid);
end $$;

create or replace function public.rebuild_standings() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.recalculate_standings(v_tid);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.save_points_settings(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; cur public.points_settings; n public.points_settings; v_e jsonb := '{}'::jsonb; v_draws jsonb;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.ensure_tournament_children(v_tid);
  select * into cur from public.points_settings where tournament_id = v_tid for update;
  begin
    n := jsonb_populate_record(cur, p_settings - 'tournament_id' - 'created_at' - 'updated_at');
  exception when others then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"settings":"A value has the wrong type"}}');
  end;
  if n.win_points < 0 or n.loss_points < 0 then v_e := v_e || '{"win_points":"Points cannot be negative"}'; end if;
  if not (n.loss_points <= n.draw_points and n.draw_points <= n.win_points) then
    v_e := v_e || '{"draw_points":"Loss <= draw <= win is required"}';
  end if;
  if n.forfeit_score not between 1 and 999 then v_e := v_e || '{"forfeit_score":"1 to 999"}'; end if;
  if cardinality(n.tiebreaker_order) not between 1 and 5
     or (select count(distinct x) from unnest(n.tiebreaker_order) x) <> cardinality(n.tiebreaker_order) then
    v_e := v_e || '{"tiebreaker_order":"1 to 5 tiebreakers without duplicates"}';
  end if;
  if v_e <> '{}'::jsonb then perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', v_e)); end if;
  if not n.allow_draws then
    select coalesce(jsonb_agg(f.match_number order by f.match_number), '[]') into v_draws
    from public.fixtures f join public.match_results r on r.fixture_id = f.id
    where f.tournament_id = v_tid and f.status = 'completed' and r.winner_team_id is null;
    if jsonb_array_length(v_draws) > 0 then
      perform public.raise_err('SETTINGS_CONFLICT', jsonb_build_object('field', 'allow_draws', 'drawn_matches', v_draws));
    end if;
  end if;
  update public.points_settings set win_points = n.win_points, loss_points = n.loss_points, draw_points = n.draw_points,
    allow_draws = n.allow_draws, forfeit_score = n.forfeit_score, tiebreaker_order = n.tiebreaker_order
  where tournament_id = v_tid returning * into n;
  perform public.recalculate_standings(v_tid);
  return to_jsonb(n);
end $$;

-- ---------------------------------------------------------------------------
-- Playoffs (section 10)
-- ---------------------------------------------------------------------------
create or replace function public.playoff_template(p_format public.playoff_format, p_third boolean)
returns table (code text, label text, round_order int, pos int, home_kind text, home_ref text,
               away_kind text, away_ref text, is_final boolean, is_third_place boolean)
language sql immutable as $$
  select v.code, v.label, v.round_order, v.pos, v.hk, v.hr, v.ak, v.ar, v.is_final, v.is_third from (values
    ('direct_final', 'F', 'Final', 1, 1, 'seed', '1', 'seed', '2', true, false),
    ('semis_final', 'SF1', 'Semifinal 1', 1, 1, 'seed', '1', 'seed', '4', false, false),
    ('semis_final', 'SF2', 'Semifinal 2', 1, 2, 'seed', '2', 'seed', '3', false, false),
    ('semis_final', 'F', 'Final', 2, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true, false),
    ('semis_final', '3P', 'Third place', 2, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true),
    ('ipl_page', 'Q1', 'Qualifier 1', 1, 1, 'seed', '1', 'seed', '2', false, false),
    ('ipl_page', 'ELIM', 'Eliminator', 1, 2, 'seed', '3', 'seed', '4', false, false),
    ('ipl_page', 'Q2', 'Qualifier 2', 2, 1, 'loser_of', 'Q1', 'winner_of', 'ELIM', false, false),
    ('ipl_page', 'F', 'Final', 3, 1, 'winner_of', 'Q1', 'winner_of', 'Q2', true, false),
    ('single_elim_6', 'QF1', 'Quarterfinal 1', 1, 1, 'seed', '3', 'seed', '6', false, false),
    ('single_elim_6', 'QF2', 'Quarterfinal 2', 1, 2, 'seed', '4', 'seed', '5', false, false),
    ('single_elim_6', 'SF1', 'Semifinal 1', 2, 1, 'seed', '1', 'winner_of', 'QF2', false, false),
    ('single_elim_6', 'SF2', 'Semifinal 2', 2, 2, 'seed', '2', 'winner_of', 'QF1', false, false),
    ('single_elim_6', 'F', 'Final', 3, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true, false),
    ('single_elim_6', '3P', 'Third place', 3, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true),
    ('single_elim_8', 'QF1', 'Quarterfinal 1', 1, 1, 'seed', '1', 'seed', '8', false, false),
    ('single_elim_8', 'QF2', 'Quarterfinal 2', 1, 2, 'seed', '4', 'seed', '5', false, false),
    ('single_elim_8', 'QF3', 'Quarterfinal 3', 1, 3, 'seed', '2', 'seed', '7', false, false),
    ('single_elim_8', 'QF4', 'Quarterfinal 4', 1, 4, 'seed', '3', 'seed', '6', false, false),
    ('single_elim_8', 'SF1', 'Semifinal 1', 2, 1, 'winner_of', 'QF1', 'winner_of', 'QF2', false, false),
    ('single_elim_8', 'SF2', 'Semifinal 2', 2, 2, 'winner_of', 'QF3', 'winner_of', 'QF4', false, false),
    ('single_elim_8', 'F', 'Final', 3, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true, false),
    ('single_elim_8', '3P', 'Third place', 3, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true)
  ) v(fmt, code, label, round_order, pos, hk, hr, ak, ar, is_final, is_third)
  where v.fmt = p_format::text and (not v.is_third or p_third)
  order by v.round_order, v.pos
$$;

create or replace function public._playoff_nodes_for(p_format public.playoff_format, p_third boolean)
returns table (code text, label text, round_order smallint, pos smallint, home_kind public.node_source_kind, home_ref text,
               away_kind public.node_source_kind, away_ref text, is_final boolean, is_third_place boolean)
language sql immutable as $$
  select t.code, t.label, t.round_order::smallint, t.pos::smallint, t.home_kind::public.node_source_kind, t.home_ref,
         t.away_kind::public.node_source_kind, t.away_ref, t.is_final, t.is_third_place
  from public.playoff_template(p_format, p_third) t
$$;

create or replace function public._league_complete(p_tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.fixtures where tournament_id = p_tid and stage = 'league')
     and not exists (select 1 from public.fixtures where tournament_id = p_tid and stage = 'league'
                     and status in ('upcoming','live','postponed'))
$$;

create or replace function public._playoffs_started(p_tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.fixtures where tournament_id = p_tid and stage = 'playoff' and status in ('live','completed'))
$$;

create or replace function public._node_side_team(p_bracket public.playoff_brackets, p_kind public.node_source_kind, p_ref text)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_fid uuid; f public.fixtures; r public.match_results;
begin
  if p_kind = 'seed' then
    return (select (s->>'team_id')::uuid from jsonb_array_elements(p_bracket.seeds) s where (s->>'seed')::int = p_ref::int limit 1);
  end if;
  select fixture_id into v_fid from public.playoff_nodes where bracket_id = p_bracket.id and code = p_ref;
  select * into f from public.fixtures where id = v_fid;
  if f.status <> 'completed' then return null; end if;
  select * into r from public.match_results where fixture_id = v_fid;
  if r.winner_team_id is null then return null; end if;
  if p_kind = 'winner_of' then return r.winner_team_id; end if;
  return case when r.winner_team_id = f.home_team_id then f.away_team_id else f.home_team_id end;
end $$;

create or replace function public.resolve_bracket(p_bracket_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.playoff_brackets; nd record; v_home uuid; v_away uuid; v_status public.bracket_status;
        v_final_fixture uuid; v_champion uuid; v_any_started boolean;
begin
  select * into b from public.playoff_brackets where id = p_bracket_id for update;
  if not found then return; end if;
  for nd in select n.*, f.status as fstatus from public.playoff_nodes n join public.fixtures f on f.id = n.fixture_id
            where n.bracket_id = b.id order by n.round_order, n.position loop
    if nd.fstatus in ('upcoming','postponed') then
      v_home := public._node_side_team(b, nd.home_kind, nd.home_ref);
      v_away := public._node_side_team(b, nd.away_kind, nd.away_ref);
      update public.fixtures set home_team_id = v_home, away_team_id = v_away
       where id = nd.fixture_id and (home_team_id is distinct from v_home or away_team_id is distinct from v_away);
    end if;
  end loop;
  select exists (select 1 from public.playoff_nodes n join public.fixtures f on f.id = n.fixture_id
                 where n.bracket_id = b.id and f.status in ('live','completed')) into v_any_started;
  select n.fixture_id into v_final_fixture from public.playoff_nodes n where n.bracket_id = b.id and n.is_final;
  select r.winner_team_id into v_champion from public.match_results r join public.fixtures f on f.id = r.fixture_id
   where r.fixture_id = v_final_fixture and f.status = 'completed';
  v_status := case when v_champion is not null then 'completed'
                   when v_any_started then 'in_progress'
                   when exists (select 1 from public.playoff_nodes where bracket_id = b.id) then 'generated'
                   else 'not_generated' end;
  update public.playoff_brackets set status = v_status, champion_team_id = v_champion
   where id = b.id and (status, champion_team_id) is distinct from (v_status, v_champion);
  if v_champion is not null then
    update public.tournaments set champion_team_id = v_champion, phase = 'completed'
     where id = b.tournament_id and (champion_team_id, phase) is distinct from (v_champion, 'completed'::public.tournament_phase);
  else
    update public.tournaments set champion_team_id = null,
           phase = case when v_any_started or phase = 'completed' then 'playoffs' else phase end
     where id = b.tournament_id
       and (champion_team_id is not null or (v_any_started and phase <> 'playoffs') or phase = 'completed');
  end if;
end $$;

create or replace function public.refresh_bracket_seeds(p_tid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.playoff_brackets; v_seeds jsonb;
begin
  select * into b from public.playoff_brackets where tournament_id = p_tid;
  if not found or not exists (select 1 from public.playoff_nodes where bracket_id = b.id) then return; end if;
  if public._playoffs_started(p_tid) then
    perform public.resolve_bracket(b.id);
    return;
  end if;
  if public._league_complete(p_tid) then
    select coalesce(jsonb_agg(jsonb_build_object('seed', rank, 'team_id', team_id) order by rank), '[]') into v_seeds
      from public.standings where tournament_id = p_tid and rank <= b.qualifying_teams;
    if jsonb_array_length(v_seeds) < b.qualifying_teams then v_seeds := '[]'; end if;
  else
    v_seeds := '[]';
  end if;
  update public.playoff_brackets set seeds = v_seeds where id = b.id and seeds is distinct from v_seeds;
  perform public.resolve_bracket(b.id);
end $$;

create or replace function public.refresh_seeds() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.refresh_bracket_seeds(v_tid);
  return (select to_jsonb(b) from public.playoff_brackets b where b.tournament_id = v_tid);
end $$;

create or replace function public.save_playoff_settings(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; cur public.playoff_settings; n public.playoff_settings; v_teams int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.ensure_tournament_children(v_tid);
  select * into cur from public.playoff_settings where tournament_id = v_tid for update;
  begin
    n := jsonb_populate_record(cur, p_settings - 'tournament_id' - 'created_at' - 'updated_at');
  exception when others then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"settings":"A value has the wrong type"}}');
  end;
  select count(*) into v_teams from public.teams where tournament_id = v_tid;
  if n.qualifying_teams > greatest(v_teams, 2) then
    perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('qualifying_teams',
      format('Only %s teams exist', v_teams))));
  end if;
  update public.playoff_settings set qualifying_teams = n.qualifying_teams, format = n.format, third_place_match = n.third_place_match
   where tournament_id = v_tid returning * into n;
  return to_jsonb(n);
end $$;

create or replace function public.generate_playoff_bracket(p_replace boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; s public.playoff_settings; b public.playoff_brackets; v_teams int; v_venue text; v_num int; nd record; v_fid uuid; v_old uuid[];
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform public.ensure_tournament_children(v_tid);
  perform 1 from public.tournaments where id = v_tid for update;
  select * into s from public.playoff_settings where tournament_id = v_tid;
  select count(*) into v_teams from public.teams where tournament_id = v_tid;
  if v_teams < s.qualifying_teams then
    perform public.raise_err('TEAMS_NOT_ENOUGH', jsonb_build_object('teams', v_teams, 'needed', s.qualifying_teams));
  end if;
  select * into b from public.playoff_brackets where tournament_id = v_tid for update;
  if exists (select 1 from public.playoff_nodes where bracket_id = b.id) then
    if not coalesce(p_replace, false) then perform public.raise_err('BRACKET_EXISTS', '{}'); end if;
    if public._playoffs_started(v_tid) then perform public.raise_err('BRACKET_LOCKED', '{}'); end if;
    update public.tournaments set featured_fixture_id = null
     where id = v_tid and featured_fixture_id in (select fixture_id from public.playoff_nodes where bracket_id = b.id);
    select array_agg(fixture_id) into v_old from public.playoff_nodes where bracket_id = b.id;
    delete from public.playoff_nodes where bracket_id = b.id;
    delete from public.fixtures where id = any(v_old);
  end if;
  update public.playoff_brackets set format = s.format, qualifying_teams = s.qualifying_teams, third_place_match = s.third_place_match,
         status = 'generated', seeds = '[]', champion_team_id = null, generated_at = now()
   where id = b.id returning * into b;
  select venue_default into v_venue from public.tournaments where id = v_tid;
  select coalesce(max(match_number), 0) into v_num from public.fixtures where tournament_id = v_tid;
  for nd in select * from public._playoff_nodes_for(s.format, s.third_place_match) loop
    v_num := v_num + 1;
    insert into public.fixtures (tournament_id, stage, match_number, round_number, venue, status)
    values (v_tid, 'playoff', v_num, nd.round_order, v_venue, 'upcoming') returning id into v_fid;
    insert into public.playoff_nodes (bracket_id, tournament_id, code, label, round_order, position, home_kind, home_ref,
                                      away_kind, away_ref, is_final, is_third_place, fixture_id)
    values (b.id, v_tid, nd.code, nd.label, nd.round_order, nd.pos, nd.home_kind, nd.home_ref, nd.away_kind, nd.away_ref,
            nd.is_final, nd.is_third_place, v_fid);
  end loop;
  update public.tournaments set champion_team_id = null where id = v_tid and champion_team_id is not null;
  perform public.refresh_bracket_seeds(v_tid);
  return jsonb_build_object('bracket', (select to_jsonb(x) from public.playoff_brackets x where x.id = b.id),
    'nodes', (select jsonb_agg(to_jsonb(n) order by n.round_order, n.position) from public.playoff_nodes n where n.bracket_id = b.id));
end $$;

-- Lock check (10.4) used by correct_match_result and reopen_match for playoff fixtures.
create or replace function public._playoff_lock_check(p_fixture_id uuid, p_new_winner uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare nd public.playoff_nodes; v_old uuid; v_blocked jsonb;
begin
  select * into nd from public.playoff_nodes where fixture_id = p_fixture_id;
  if not found then return; end if;
  select winner_team_id into v_old from public.match_results where fixture_id = p_fixture_id;
  if v_old is not distinct from p_new_winner then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code', n.code, 'match_number', f.match_number, 'status', f.status)), '[]')
    into v_blocked
  from public.playoff_nodes n join public.fixtures f on f.id = n.fixture_id
  where n.bracket_id = nd.bracket_id and f.status in ('live','completed')
    and ((n.home_kind in ('winner_of','loser_of') and n.home_ref = nd.code) or (n.away_kind in ('winner_of','loser_of') and n.away_ref = nd.code));
  if jsonb_array_length(v_blocked) > 0 then
    perform public.raise_err('PLAYOFF_RESULT_LOCKED', jsonb_build_object('fixtures', v_blocked));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers (3.6, 10.5)
-- ---------------------------------------------------------------------------
create or replace function public.trg_results_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_fid uuid; v_tid uuid; v_stage public.fixture_stage; v_bracket uuid;
begin
  v_fid := coalesce(new.fixture_id, old.fixture_id);
  v_tid := coalesce(new.tournament_id, old.tournament_id);
  select stage into v_stage from public.fixtures where id = v_fid;
  if v_stage = 'playoff' then
    select bracket_id into v_bracket from public.playoff_nodes where fixture_id = v_fid;
    if v_bracket is not null then perform public.resolve_bracket(v_bracket); end if;
  elsif v_stage = 'league' then
    perform public.recalculate_standings(v_tid);
  end if;
  return null;
end $$;
create trigger trg_recalc_standings after insert or update or delete on public.match_results
  for each row execute function public.trg_results_changed();

create or replace function public.trg_fixture_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_bracket uuid;
begin
  if new.stage = 'league' or old.stage = 'league' then
    perform public.recalculate_standings(new.tournament_id);
  end if;
  if new.stage = 'playoff' and new.status is distinct from old.status then
    select bracket_id into v_bracket from public.playoff_nodes where fixture_id = new.id;
    if v_bracket is not null then perform public.resolve_bracket(v_bracket); end if;
  end if;
  return null;
end $$;
create trigger trg_fixture_changed after update of status, home_team_id, away_team_id, stage on public.fixtures
  for each row execute function public.trg_fixture_changed();

create or replace function public.trg_recalc_statement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.recalculate_standings(public.active_tournament_id());
  return null;
end $$;
create trigger trg_fixtures_insert_delete after insert or delete on public.fixtures
  for each statement execute function public.trg_recalc_statement();
create trigger trg_teams_insert_delete after insert or delete on public.teams
  for each statement execute function public.trg_recalc_statement();

create or replace function public.trg_team_rank_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.manual_tiebreak_rank is distinct from old.manual_tiebreak_rank or new.name is distinct from old.name then
    perform public.recalculate_standings(new.tournament_id);
  end if;
  return null;
end $$;
create trigger trg_team_rank_changed after update of manual_tiebreak_rank, name on public.teams
  for each row execute function public.trg_team_rank_changed();

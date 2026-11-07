begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Isolation: a fresh active tournament so demo data never interferes; everything is rolled back.
update public.tournaments set is_active = false where is_active;
insert into public.tournaments (name, slug) values ('Test Cup', 'test-cup');
select public.ensure_tournament_children(public.active_tournament_id());

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'user@test.local', 'authenticated', 'authenticated');
insert into public.administrators values ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@test.local');

create schema tests;
-- Runs p_sql (which must return one jsonb value) as an admin, a signed-in non-admin, or anon.
create function tests.exec_as(p_who text, p_sql text) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', case p_who
      when 'admin' then '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}'
      when 'user' then '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}'
      else '{"role":"anon"}' end, true);
  perform set_config('role', case p_who when 'anon' then 'anon' else 'authenticated' end, true);
  begin
    execute p_sql into r;
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $f$;
create function tests.admin(p_sql text) returns jsonb language sql as $f$ select tests.exec_as('admin', p_sql) $f$;

create function tests.add_teams(n int, p_start int default 1) returns void language plpgsql as $f$
declare i int;
begin
  for i in p_start..p_start + n - 1 loop
    perform tests.admin(format($q$with x as (insert into public.teams (tournament_id, name, short_name, sort_order)
      values (public.active_tournament_id(), %L, %L, %s) returning id) select to_jsonb(id) from x$q$, 'Team ' || chr(64 + i), 'T' || chr(64 + i), i));
  end loop;
end $f$;
create function tests.team(p_letter text) returns uuid language sql as $f$
  select id from public.teams where tournament_id = public.active_tournament_id() and short_name = 'T' || p_letter
$f$;
create function tests.add_players(n int, p_base bigint default 100) returns void language plpgsql as $f$
begin
  perform tests.admin(format('select public.import_players(%L::jsonb)', (
    select jsonb_agg(jsonb_build_object('row_number', g, 'full_name', 'Player ' || lpad(g::text, 3, '0'),
      'primary_position', (array['PG','SG','SF','PF','C'])[1 + g % 5], 'base_price', p_base)) from generate_series(1, n) g)));
end $f$;
create function tests.player(p_n int) returns uuid language sql as $f$
  select id from public.players where tournament_id = public.active_tournament_id() and full_name = 'Player ' || lpad(p_n::text, 3, '0')
$f$;
create function tests.lot() returns uuid language sql as $f$
  select current_lot_id from public.auction_state where tournament_id = public.active_tournament_id()
$f$;
-- The four invariants of 3.3.
create function tests.invariants() returns text language sql as $f$
  select coalesce(string_agg(msg, '; '), 'ok') from (
    select 'purse '||t.name msg from public.teams t where t.tournament_id = public.active_tournament_id()
      and t.purse_spent <> coalesce((select sum(price) from public.team_players tp where tp.team_id = t.id), 0)
    union all
    select 'sold '||p.full_name from public.players p where p.tournament_id = public.active_tournament_id() and p.status = 'sold'
      and (select count(*) from public.team_players tp where tp.player_id = p.id and tp.source in ('auction','manual')) <> 1
    union all
    select 'icon '||p.full_name from public.players p where p.tournament_id = public.active_tournament_id() and p.status = 'icon'
      and (select count(*) from public.team_players tp where tp.player_id = p.id and tp.source = 'icon') <> 1
    union all
    select 'free '||p.full_name from public.players p where p.tournament_id = public.active_tournament_id() and p.status in ('available','unsold')
      and exists (select 1 from public.team_players tp where tp.player_id = p.id)
    union all
    select 'squad '||t.name from public.teams t join public.auction_settings s on s.tournament_id = t.tournament_id
      where t.tournament_id = public.active_tournament_id() and public.team_squad_count(t.id) > s.max_squad_size
    union all
    select 'txn '||player_id from public.auction_transactions where status = 'active' group by player_id having count(*) > 1
  ) x
$f$;
-- Live scoring (8.x)
select * from no_plan();
select tests.add_teams(3);
select tests.admin('select public.generate_league_fixtures(''single'', null, false)');
create temp table fx as select match_number n, id from fixtures where tournament_id = active_tournament_id();
create function tests.fx(int) returns uuid language sql as $f$ select id from fx where n = $1 $f$;
create function tests.ms(int) returns public.match_states language sql as $f$ select * from public.match_states where fixture_id = tests.fx($1) $f$;
create temp table standings_before as select * from standings where tournament_id = active_tournament_id();

select throws_ok($$select tests.admin(format('select public.score_points(%L, ''home'', 2)', tests.fx(1)))$$, 'P0001', 'MATCH_NOT_LIVE', 'cannot score before start');
select is(tests.admin(format('select public.start_match(%L)', tests.fx(1)))->'fixture'->>'status', 'live', 'start -> live');
select is((tests.ms(1)).clock_remaining_ms, 600000, 'game clock = quarter length');
select is((tests.ms(1)).home_timeouts_left, 2::smallint, 'first-half timeouts');
select throws_ok($$select tests.admin(format('select public.start_match(%L)', tests.fx(1)))$$, 'P0001', 'MATCH_ALREADY_STARTED', 'cannot start twice');
select throws_ok($$select tests.admin(format('select public.start_match(%L)', (select id from fx f join fixtures x using (id) where x.home_team_id in ((select home_team_id from fixtures where id = tests.fx(1)), (select away_team_id from fixtures where id = tests.fx(1))) and f.n <> 1 limit 1)))$$, 'P0001', 'MATCH_TEAM_BUSY', 'team already in a live match');

-- points, idempotency, cap
select tests.admin(format('select public.score_points(%L, ''home'', 3, %L)', tests.fx(1), 'dddddddd-0000-0000-0000-000000000001'));
select is(tests.admin(format('select public.score_points(%L, ''home'', 3, %L)', tests.fx(1), 'dddddddd-0000-0000-0000-000000000001'))->>'duplicate', 'true', '8.12.1 retry with same id has one effect');
select tests.admin(format('select public.score_points(%L, ''home'', 3, gen_random_uuid())', tests.fx(1)));
select is((tests.ms(1)).home_score, 6, 'two distinct taps = two events');
select throws_ok($$select tests.admin(format('select public.score_points(%L, ''away'', 4)', tests.fx(1)))$$, 'P0001', 'VALIDATION_FAILED', 'only 1, 2 or 3');
select tests.admin(format('select public.score_points(%L, ''away'', 2)', tests.fx(1)));
select is((select array_agg(seq order by seq) from live_scoring_events where fixture_id = tests.fx(1)), array[1,2,3,4], 'consecutive seq');

-- fouls, timeouts, undo
select tests.admin(format('select public.add_foul(%L, ''away'', 1)', tests.fx(1)));
select tests.admin(format('select public.add_foul(%L, ''away'', -1)', tests.fx(1)));
select is(tests.admin(format('select public.add_foul(%L, ''away'', -1)', tests.fx(1)))->>'unchanged', 'true', 'fouls never below 0');
select tests.admin(format('select public.clock_control(%L, ''start'')', tests.fx(1)));
select is(tests.admin(format('select public.clock_control(%L, ''start'')', tests.fx(1)))->>'unchanged', 'true', 'start is idempotent');
select pg_sleep(0.3);
select tests.admin(format('select public.record_timeout(%L, ''home'')', tests.fx(1)));
select ok(not (tests.ms(1)).clock_running and (tests.ms(1)).clock_remaining_ms < 600000 and (tests.ms(1)).clock_remaining_ms > 590000, 'timeout pauses and folds elapsed time');
select tests.admin(format('select public.record_timeout(%L, ''home'')', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.record_timeout(%L, ''home'')', tests.fx(1)))$$, 'P0001', 'NO_TIMEOUTS_LEFT', 'no timeouts left');
select tests.admin(format('select public.record_timeout(%L, ''home'', true)', tests.fx(1)));
select is((tests.ms(1)).home_timeouts_left, 1::smallint, 'restore gives one back');
select tests.admin(format('select public.undo_last_event(%L)', tests.fx(1)));
select is((tests.ms(1)).home_timeouts_left, 0::smallint, 'undo restore');
select tests.admin(format('select public.undo_last_event(%L)', tests.fx(1)));
select is((tests.ms(1)).home_timeouts_left, 1::smallint, 'undo timeout');
select is(tests.admin(format('select public.undo_last_event(%L, 1)', tests.fx(1)))->>'stale', 'true', 'expected seq guards against double undo');

-- clocks
select lives_ok($$select tests.admin(format('select public.clock_control(%L, ''reset'')', tests.fx(1)))$$, 'reset allowed while paused');
select tests.admin(format('select public.clock_control(%L, ''start'')', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.clock_control(%L, ''set'', 1000)', tests.fx(1)))$$, 'P0001', 'CLOCK_RUNNING', 'set needs a paused clock');
select tests.admin(format('select public.clock_control(%L, ''shot_reset_short'')', tests.fx(1)));
select ok((tests.ms(1)).shot_clock_running and (tests.ms(1)).shot_clock_remaining_ms = 14000, 'shot 14 keeps running with the game clock');
select tests.admin(format('select public.clock_control(%L, ''pause'')', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.clock_control(%L, ''set'', 700000)', tests.fx(1)))$$, 'P0001', 'VALIDATION_FAILED', 'set within period length');
select tests.admin(format('select public.clock_control(%L, ''set'', 0)', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.clock_control(%L, ''start'')', tests.fx(1)))$$, 'P0001', 'INVALID_PERIOD_TRANSITION', 'cannot start at 0');

-- periods, halftime, overtime
select throws_ok($$select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)))$$, 'P0001', 'INVALID_PERIOD_TRANSITION', 'end period first');
select is(tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)))->'state'->>'is_break', 'true', 'end Q1');
select throws_ok($$select tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)))$$, 'P0001', 'INVALID_PERIOD_TRANSITION', 'already in a break');
select tests.admin(format('select public.score_points(%L, ''away'', 3)', tests.fx(1)));
select is((tests.ms(1)).period_scores->0->>'away_total', '5', '8.12.4 basket after the buzzer lands in the ended period');
select tests.admin(format('select public.undo_last_event(%L)', tests.fx(1)));
select is((tests.ms(1)).period_scores->0->>'away_total', '2', 'undo restores the period snapshot');
select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)));
select tests.admin(format('select public.add_foul(%L, ''home'', 1)', tests.fx(1)));
select tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)));
select is((select detail->>'label' from live_scoring_events where fixture_id = tests.fx(1) and event_type = 'period_change' and not is_voided order by seq desc limit 1), 'Halftime', 'halftime recorded');
select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)));
select ok((tests.ms(1)).home_timeouts_left = 3 and (tests.ms(1)).home_fouls = 0, 'second half: 3 timeouts, fouls reset');
select tests.admin(format('select public.undo_last_event(%L)', tests.fx(1)));
select ok((tests.ms(1)).is_break and (tests.ms(1)).period = 2 and (tests.ms(1)).home_fouls = 1, 'undo period change restores period, break and fouls');
select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)));
select tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)));
select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)));
select tests.admin(format('select public.add_foul(%L, ''away'', 1)', tests.fx(1)));
select tests.admin(format('select public.correct_score(%L, 70, 70, ''table check'')', tests.fx(1)));
select tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.complete_match(%L, 70, 70, null)', tests.fx(1)))$$, 'P0001', 'TIED_NO_DRAWS', '8.12.5 tie with draws off');
select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)));
select ok((tests.ms(1)).period = 5 and (tests.ms(1)).clock_remaining_ms = 300000 and (tests.ms(1)).away_fouls = 1 and (tests.ms(1)).home_timeouts_left = 1, 'OT1: 5 minutes, fouls carry over, 1 timeout');
select tests.admin(format('select public.score_points(%L, ''home'', 2)', tests.fx(1)));
select tests.admin(format('select public.change_period(%L, ''end_period'')', tests.fx(1)));
select throws_ok($$select tests.admin(format('select public.change_period(%L, ''start_next_period'')', tests.fx(1)))$$, 'P0001', 'INVALID_PERIOD_TRANSITION', 'not tied: complete instead');

-- 8.12.9 live scoring never changed official standings
select is((select count(*)::int from (select * from standings where tournament_id = active_tournament_id() except select * from standings_before) x), 0, 'standings byte-identical while live');

-- completion
select throws_ok($$select tests.admin(format('select public.complete_match(%L, 1000, 0, null)', tests.fx(1)))$$, 'P0001', 'RESULT_INVALID', 'scores 0..999');
select is(tests.admin(format('select public.complete_match(%L, 72, 70, ''OT win'')', tests.fx(1)))->'result'->>'periods_played', '5', 'periods played includes OT');
select is((select status::text from fixtures where id = tests.fx(1)), 'completed', 'fixture completed');
select is((select count(*)::int from (select team_id, played, wins, losses, draws, points_for, points_against, league_points, remaining from standings where tournament_id = active_tournament_id()
  except select team_id, played, wins, losses, draws, points_for, points_against, league_points, remaining from standings_before) x), 2, '7: figures change for exactly the two teams');
select throws_ok($$select tests.admin(format('select public.undo_last_event(%L)', tests.fx(1)))$$, 'P0001', 'MATCH_NOT_LIVE', 'undo after completion refused');
select throws_ok($$select tests.admin(format('select public.complete_match(%L, 72, 70, null)', tests.fx(1)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'cannot complete twice');

-- corrections and reopen
select throws_ok($$select tests.admin(format('select public.correct_match_result(%L, 60, 72, '''')', tests.fx(1)))$$, 'P0001', 'VALIDATION_FAILED', 'correction note required');
select tests.admin(format('select public.correct_match_result(%L, 60, 72, ''scorer error'')', tests.fx(1)));
select is((select winner_team_id from match_results where fixture_id = tests.fx(1)), (select away_team_id from fixtures where id = tests.fx(1)), '8.12.12 corrected winner');
select is((select wins from standings where team_id = (select away_team_id from fixtures where id = tests.fx(1))), 1, 'standings recalculated on correction');
select is((select correction_count from match_results where fixture_id = tests.fx(1)), 1, 'correction counted');
select tests.admin(format('select public.reopen_match(%L, ''wrong final'')', tests.fx(1)));
select is((select count(*)::int from match_results where fixture_id = tests.fx(1)), 0, 'reopen deletes the result');
select is((select played from standings where team_id = (select away_team_id from fixtures where id = tests.fx(1))), 0, 'reopen removes the match from standings');
select tests.admin(format('select public.complete_match(%L, 80, 70, null)', tests.fx(1)));

-- manual result without live scoring, forfeit
select is(tests.admin(format('select public.complete_match(%L, 50, 40, null)', tests.fx(2)))->'result'->>'periods_played', '4', 'manual result = regulation periods');
select throws_ok($$select tests.admin(format('select public.reopen_match(%L, ''x'')', tests.fx(2)))$$, 'P0001', 'MATCH_NOT_STARTABLE', 'no live record to reopen');
select throws_ok($$select tests.admin(format('select public.record_forfeit(%L, gen_random_uuid(), ''no show'')', tests.fx(3)))$$, 'P0001', 'VALIDATION_FAILED', 'forfeit winner must be one of the two teams');
select is(tests.admin(format('select public.record_forfeit(%L, (select home_team_id from fixtures where id = %L), ''No show'')', tests.fx(3), tests.fx(3)))->'result'->>'result_type', 'forfeit', 'forfeit recorded');
select is((select home_score from match_results where fixture_id = tests.fx(3)), 20, 'forfeit_score to 0');
select is((select sum(played)::int from standings where tournament_id = active_tournament_id()), 6, 'forfeit counts as played');
select * from finish();
rollback;

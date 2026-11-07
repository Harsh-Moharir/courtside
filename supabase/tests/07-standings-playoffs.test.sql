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
-- Standings (9.x) and playoffs (10.x)
select * from no_plan();
select tests.add_teams(4);
create function tests.play(h text, hs int, a_s int, a text) returns void language plpgsql as $f$
declare v uuid;
begin
  select public.create_fixture(tests.team(h), tests.team(a), null, null, null, true)->'fixture'->>'id' into v;
  perform tests.admin(format('select public.complete_match(%L, %s, %s, null)', v, hs, a_s));
end $f$;
-- create_fixture runs as postgres here; make it an admin call instead
create or replace function tests.play(h text, hs int, a_s int, a text) returns void language plpgsql as $f$
declare v uuid;
begin
  v := (tests.admin(format('select public.create_fixture(%L, %L, null, null, null, true)', tests.team(h), tests.team(a)))->'fixture'->>'id')::uuid;
  perform tests.admin(format('select public.complete_match(%L, %s, %s, null)', v, hs, a_s));
end $f$;
create function tests.rank_order() returns text language sql as $f$
  select string_agg(substr(t.short_name, 2), '' order by s.rank) from public.standings s join public.teams t on t.id = s.team_id
  where s.tournament_id = public.active_tournament_id()
$f$;

select is(tests.rank_order(), 'ABCD', 'case 4 style fallback by name with no matches');
update teams set manual_tiebreak_rank = 1 where id = tests.team('C');
select is(tests.rank_order(), 'CABD', 'manual tiebreak rank applies via trigger');
update teams set manual_tiebreak_rank = null where id = tests.team('C');

-- worked example case 2 through real fixtures
select tests.play('A', 60, 59, 'B');
select tests.play('A', 70, 40, 'C');
select tests.play('D', 65, 60, 'A');
select tests.play('B', 90, 60, 'C');
select tests.play('B', 80, 70, 'D');
select tests.play('C', 55, 50, 'D');
select is(tests.rank_order(), 'ABCD', 'case 2: head-to-head beats overall difference');
select is((select tiebreak_note from standings where team_id = tests.team('B')), 'Head-to-head vs Team A', 'tiebreak note');
select is((select point_diff from standings where team_id = tests.team('B')), 39, 'PD');

-- settings
select throws_ok($$select tests.admin($q$select public.save_points_settings('{"win_points":2,"draw_points":3}')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'draw <= win');
select throws_ok($$select tests.admin($q$select public.save_points_settings('{"tiebreaker_order":["wins","wins"]}')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'no duplicate tiebreakers');
select tests.admin($q$select public.save_points_settings('{"win_points":3,"tiebreaker_order":["point_difference"]}')$q$);
select is(tests.rank_order(), 'BADC', 'changing settings recalculates from stored results');
select tests.admin($q$select public.save_points_settings('{"win_points":2,"tiebreaker_order":["head_to_head","point_difference","points_for"],"allow_draws":true}')$q$);

-- draws
select tests.play('A', 50, 50, 'C');
select is((select draws from standings where team_id = tests.team('A')), 1, 'draw recorded');
select throws_ok($$select tests.admin($q$select public.save_points_settings('{"allow_draws":false}')$q$)$$, 'P0001', 'SETTINGS_CONFLICT', 'cannot disable draws with a drawn match');
select tests.admin(format('select public.correct_match_result((select f.id from public.fixtures f join public.match_results r on r.fixture_id = f.id where r.winner_team_id is null and f.tournament_id = public.active_tournament_id()), 51, 50, ''fix'')'));
select lives_ok($$select tests.admin($q$select public.save_points_settings('{"allow_draws":false}')$q$)$$, 'draws off after correcting');

-- playoffs: provisional, then seeded when league complete
select tests.add_teams(1, 5);
select tests.admin(format('select public.create_fixture(%L, %L)', tests.team('E'), tests.team('A')));
select throws_ok($$select tests.admin($q$select public.save_playoff_settings('{"format":"semis_final","qualifying_teams":6}')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'format and count must pair');
select is(tests.admin('select public.generate_playoff_bracket(false)')->'bracket'->>'status', 'generated', 'bracket generated');
select throws_ok($$select tests.admin('select public.generate_playoff_bracket(false)')$$, 'P0001', 'BRACKET_EXISTS', 'exists');
select is((select seeds from playoff_brackets where tournament_id = active_tournament_id()), '[]'::jsonb, '10.7.1 league incomplete: no seeds');
select is((select count(*)::int from fixtures where tournament_id = active_tournament_id() and stage = 'playoff' and home_team_id is not null), 0, 'no playoff teams yet');
create temp table nodes as select n.code, n.fixture_id from playoff_nodes n where n.tournament_id = active_tournament_id();
create function tests.node(text) returns uuid language sql as $f$ select fixture_id from nodes where code = $1 $f$;
select throws_ok($$select tests.admin(format('select public.start_match(%L)', tests.node('F')))$$, 'P0001', 'MATCH_NOT_STARTABLE', 'final without teams cannot start');
select tests.admin(format('select public.complete_match((select id from public.fixtures where tournament_id = public.active_tournament_id() and stage = ''league'' and status = ''upcoming''), 40, 90, null)'));
select is(jsonb_array_length((select seeds from playoff_brackets where tournament_id = active_tournament_id())), 4, '10.7.2 last league match seeds the bracket in the same transaction');
select is((select home_team_id from fixtures where id = tests.node('SF1')), (select team_id from standings where tournament_id = active_tournament_id() and rank = 1), 'SF1 home = seed 1');
select is((select away_team_id from fixtures where id = tests.node('SF1')), (select team_id from standings where tournament_id = active_tournament_id() and rank = 4), 'SF1 away = seed 4');
select is((select home_team_id from fixtures where id = tests.node('SF2')), (select team_id from standings where tournament_id = active_tournament_id() and rank = 2), 'SF2 home = seed 2');

-- 10.7.3 league correction before playoffs start re-seeds
create temp table seeds_before as select seeds from playoff_brackets where tournament_id = active_tournament_id();
select tests.admin(format('select public.correct_match_result((select id from public.fixtures f where f.tournament_id = public.active_tournament_id() and f.stage = ''league'' and f.home_team_id = %L), 99, 40, ''reversal'')', tests.team('E')));
select isnt((select seeds from playoff_brackets where tournament_id = active_tournament_id()), (select seeds from seeds_before), 'seeds follow a correction before playoffs start');

-- progression
select throws_ok($$select tests.admin(format('select public.complete_match(%L, 70, 70, null)', tests.node('SF1')))$$, 'P0001', 'TIED_NO_DRAWS', '10.7.9 playoff ties rejected');
select tests.admin(format('select public.complete_match(%L, 80, 70, null)', tests.node('SF1')));
select is((select home_team_id from fixtures where id = tests.node('F')), (select home_team_id from fixtures where id = tests.node('SF1')), '10.7.5 SF1 winner fills the final home slot');
select is((select away_team_id from fixtures where id = tests.node('F')), null, 'away slot still open');
select is((select status::text from playoff_brackets where tournament_id = active_tournament_id()), 'in_progress', 'bracket in progress');
select throws_ok($$select tests.admin('select public.generate_playoff_bracket(true)')$$, 'P0001', 'BRACKET_LOCKED', '10.7.8 regenerate after start is locked');
-- 10.7.4 league correction after playoffs started keeps the seeds
create temp table seeds_mid as select seeds from playoff_brackets where tournament_id = active_tournament_id();
select tests.admin(format('select public.correct_match_result((select id from public.fixtures f where f.tournament_id = public.active_tournament_id() and f.stage = ''league'' and f.home_team_id = %L), 10, 99, ''flip'')', tests.team('E')));
select is((select seeds from playoff_brackets where tournament_id = active_tournament_id()), (select seeds from seeds_mid), 'seeds kept once playoffs started');
select tests.admin(format('select public.record_forfeit(%L, (select away_team_id from public.fixtures where id = %L), ''No show'')', tests.node('SF2'), tests.node('SF2')));
select is((select away_team_id from fixtures where id = tests.node('F')), (select away_team_id from fixtures where id = tests.node('SF2')), 'forfeit winner advances');
-- 10.7.6 correcting SF1 to a different winner while the final is upcoming
select tests.admin(format('select public.correct_match_result(%L, 60, 70, ''wrong winner'')', tests.node('SF1')));
select is((select home_team_id from fixtures where id = tests.node('F')), (select away_team_id from fixtures where id = tests.node('SF1')), 'final slot follows the correction');
select tests.admin(format('select public.start_match(%L)', tests.node('F')));
select throws_ok($$select tests.admin(format('select public.correct_match_result(%L, 90, 70, ''again'')', tests.node('SF1')))$$, 'P0001', 'PLAYOFF_RESULT_LOCKED', 'locked after the final started');
select lives_ok($$select tests.admin(format('select public.correct_match_result(%L, 61, 75, ''score only'')', tests.node('SF1')))$$, 'score-only correction is allowed');
select throws_ok($$select tests.admin(format('select public.reopen_match(%L, ''x'')', tests.node('SF1')))$$, 'P0001', 'MATCH_NOT_STARTABLE', 'SF1 had no live record');
select tests.admin(format('select public.score_points(%L, ''home'', 3)', tests.node('F')));
select tests.admin(format('select public.complete_match(%L, 3, 0, null)', tests.node('F')));
select is((select champion_team_id from tournaments where is_active), (select home_team_id from fixtures where id = tests.node('F')), 'champion set');
select is((select phase::text from tournaments where is_active), 'completed', 'phase completed');
select is((select status::text from playoff_brackets where tournament_id = active_tournament_id()), 'completed', 'bracket completed');
select tests.admin(format('select public.reopen_match(%L, ''recount'')', tests.node('F')));
select is((select champion_team_id from tournaments where is_active), null, '10.7.7 reopening the final clears the champion');
select is((select phase::text from tournaments where is_active), 'playoffs', 'phase back to playoffs');

select * from finish();
rollback;

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
-- Fixtures and scheduling (7.x)
select * from no_plan();
select throws_ok($$select tests.admin('select public.generate_league_fixtures(''single'', null, false)')$$, 'P0001', 'TEAMS_NOT_ENOUGH', 'needs 2 teams');
select tests.add_teams(5);
select is(tests.admin('select public.generate_league_fixtures(''single'', null, false)')->>'created', '10', 'single round robin, 5 teams = 10');
select is((select count(distinct round_number)::int from fixtures where tournament_id = active_tournament_id()), 5, 'odd n: n rounds');
select is((select count(*)::int from fixtures f where tournament_id = active_tournament_id() and not exists (select 1 from teams t where t.id = f.home_team_id)), 0, 'fixtures use real teams');
select throws_ok($$select tests.admin('select public.generate_league_fixtures(''single'', null, false)')$$, 'P0001', 'FIXTURES_EXIST', 'exists without replace');
select throws_ok($$select tests.admin('select public.generate_league_fixtures(''triple'', null, true)')$$, 'P0001', 'VALIDATION_FAILED', 'bad format');
select is(tests.admin('select public.generate_league_fixtures(''double'', 3, true)')->>'created', '20', 'double with replace = 20');
select is((select array_agg(match_number order by match_number) from fixtures where tournament_id = active_tournament_id()), (select array_agg(g) from generate_series(1, 20) g), 'match numbers 1..20');
select is((select count(*)::int from standings where tournament_id = active_tournament_id() and remaining = 8), 5, 'remaining counts every league fixture');

-- auto schedule
select throws_ok($$select tests.admin($q$select public.auto_schedule_fixtures('2026-12-01', array[]::int[], '09:00', 90, array['A'], 4, 'unscheduled')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'game days required');
select is(tests.admin($q$select public.auto_schedule_fixtures('2026-12-05', array[6,7], '10:00', 90, array['Court A','Court B'], 2, 'unscheduled')$q$)->>'unscheduled', '0', 'everything scheduled');
select is((select count(*)::int from (select f.scheduled_at, t from fixtures f, unnest(array[home_team_id, away_team_id]) t
   where tournament_id = active_tournament_id()) x group by (scheduled_at at time zone 'Asia/Kolkata')::date, t having count(*) > 1 limit 1), null, 'a team plays at most once per date');
select is((select min(extract(isodow from scheduled_at at time zone 'Asia/Kolkata'))::int from fixtures where tournament_id = active_tournament_id()), 6, 'only Saturdays and Sundays');
select is((select to_char(min(scheduled_at at time zone 'Asia/Kolkata'), 'HH24:MI') from fixtures where tournament_id = active_tournament_id()), '10:00', 'wall clock in the tournament zone');

-- manual fixtures, edits, warnings
select throws_ok($$select tests.admin(format('select public.create_fixture(%L, %L)', tests.team('A'), tests.team('A')))$$, 'P0001', 'FIXTURE_TEAMS_INVALID', 'same team twice');
select throws_ok($$select tests.admin(format('select public.create_fixture(%L, %L)', (select home_team_id from fixtures where tournament_id = active_tournament_id() and match_number = 1), (select away_team_id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))$$, 'P0001', 'FIXTURE_DUPLICATE', 'duplicate pairing');
select is(tests.admin(format('select public.create_fixture(%L, %L, null, ''Annex'', 9, true)', (select home_team_id from fixtures where tournament_id = active_tournament_id() and match_number = 1), (select away_team_id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))->'fixture'->>'match_number', '21', 'duplicate allowed with flag');
create temp table f21 as select id from fixtures where tournament_id = active_tournament_id() and match_number = 21;
select ok(jsonb_array_length(tests.admin(format('select public.update_fixture(%L, %L, ''Court A'', null)', (select id from f21), (select scheduled_at from fixtures where tournament_id = active_tournament_id() and match_number = 1)))->'warnings') > 0, 'clash warnings returned (non-blocking)');
select is(tests.admin(format('select public.update_fixture(%L, now() - interval ''1 day'', null, ''note'')', (select id from f21)))->'warnings'->0->>'code', 'DATE_IN_PAST', 'past date warning');
select throws_ok($$select tests.admin(format('select public.postpone_fixture(%L, '''')', (select id from f21)))$$, 'P0001', 'VALIDATION_FAILED', 'postpone needs a reason');
select is(tests.admin(format('select public.postpone_fixture(%L, ''Rain'')', (select id from f21)))->'fixture'->>'status', 'postponed', 'postponed');
select throws_ok($$select tests.admin(format('select public.reschedule_fixture(%L, null)', (select id from f21)))$$, 'P0001', 'VALIDATION_FAILED', 'reschedule needs a date');
select is(tests.admin(format('select public.reschedule_fixture(%L, ''2027-01-01 12:00+00'')', (select id from f21)))->'fixture'->>'status', 'upcoming', 'rescheduled');
select throws_ok($$select tests.admin(format('select public.reschedule_fixture(%L, now())', (select id from f21)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'only postponed can be rescheduled');
select is(tests.admin(format('select public.set_featured_fixture(%L)', (select id from f21)))->>'featured_fixture_id', (select id::text from f21), 'match of the day');
select ok(tests.admin(format('select public.delete_fixture(%L)', (select id from f21))) ? 'deleted', 'delete upcoming league fixture');
select is((select featured_fixture_id from tournaments where is_active), null, 'featured cleared on delete');
select is(tests.admin('select public.renumber_fixtures()')->>'renumbered', '0', 'renumber is idempotent');

-- live / completed fixtures cannot be regenerated, deleted or edited
select tests.admin(format('select public.start_match(%L)', (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1)));
select throws_ok($$select tests.admin('select public.generate_league_fixtures(''single'', null, true)')$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'regenerate refused with a live fixture');
select throws_ok($$select tests.admin(format('select public.update_fixture(%L, null, null, null)', (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'live fixture not editable');
select throws_ok($$select tests.admin(format('select public.postpone_fixture(%L, ''x'')', (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'live fixture cannot be postponed');
select throws_ok($$select tests.admin(format('select public.delete_fixture(%L)', (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'live fixture cannot be deleted');
select throws_ok($$select tests.admin(format('select public.delete_team(%L)', tests.team('A')))$$, 'P0001', 'TEAM_HAS_HISTORY', 'team with fixtures cannot be deleted');
select is(tests.admin(format('select public.abandon_match(%L, ''Power cut'')', (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1)))->'fixture'->>'postponed_reason', 'Abandoned: Power cut', 'abandon -> postponed');
select is((select count(*)::int from live_scoring_events where fixture_id = (select id from fixtures where tournament_id = active_tournament_id() and match_number = 1) and not is_voided), 0, 'abandon voids events');
select * from finish();
rollback;

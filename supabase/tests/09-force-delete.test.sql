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
-- Admin force deletes (0009): players, teams and matches can always be deleted with p_force = true.
select * from no_plan();
select tests.add_teams(4);
select tests.add_players(20);
select tests.admin('select public.start_auction_round(true)');

-- a sold player
select tests.admin(format('select public.open_lot(%L)', tests.player(1)));
select tests.admin(format('select public.place_bid(%L, %L, 400, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select tests.admin(format('select public.mark_sold(%L)', tests.lot()));
select throws_ok($$select tests.admin(format('select public.delete_player(%L)', tests.player(1)))$$, 'P0001', 'PLAYER_IS_SOLD', 'safe delete still refuses a sold player');
select is(tests.admin(format('select public.delete_player(%L, true)', tests.player(1)))->>'refunded', '400', 'force delete of a sold player refunds the purse');
select is((select purse_spent from teams where id = tests.team('A')), 0::bigint, 'purse back to 0');
select is((select count(*)::int from players where full_name = 'Player 001'), 0, 'player gone');
select is((select count(*)::int from auction_transactions where player_name = 'Player 001'), 1, 'auction history keeps the (reversed) record');

-- an icon player and a player on the live lot
select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('B'), tests.player(2)));
select lives_ok($$select tests.admin(format('select public.delete_player(%L, true)', tests.player(2)))$$, 'force delete of an icon player');
select tests.admin(format('select public.open_lot(%L)', tests.player(3)));
select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('C')));
select lives_ok($$select tests.admin(format('select public.delete_player(%L, true)', tests.player(3)))$$, 'force delete of the player on the block');
select is(tests.lot(), null, 'the live lot was cancelled');
select is(tests.invariants(), 'ok', 'invariants after player deletes');

-- a team with purchases, bids, fixtures and results
select tests.admin(format('select public.open_lot(%L)', tests.player(4)));
select tests.admin(format('select public.place_bid(%L, %L, 300, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select tests.admin(format('select public.mark_sold(%L)', tests.lot()));
select tests.admin(format('select public.open_lot(%L)', tests.player(5)));
select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select tests.admin('select public.generate_league_fixtures(''single'', null, false)');
select tests.admin(format('select public.complete_match(%L, 60, 50, null)', (select id from fixtures where tournament_id = active_tournament_id() and (home_team_id = tests.team('A') or away_team_id = tests.team('A')) order by match_number limit 1)));
select tests.admin(format('select public.complete_match(%L, 60, 50, null)', (select id from fixtures where tournament_id = active_tournament_id() and home_team_id <> tests.team('A') and away_team_id <> tests.team('A') order by match_number limit 1)));
select throws_ok($$select tests.admin(format('select public.delete_team(%L)', tests.team('A')))$$, 'P0001', 'TEAM_HAS_HISTORY', 'safe delete still refuses');
select is(tests.admin(format('select public.delete_team(%L, true)', tests.team('A')))->>'fixtures_deleted', '3', 'force delete removes its 3 league matches');
select is((select count(*)::int from teams where tournament_id = active_tournament_id()), 3, 'team gone');
select is((select status::text from players where id = tests.player(4)), 'available', 'its purchase returned to the pool');
select is(tests.lot(), null, 'the lot it was bidding on was cancelled');
select is((select status::text from players where id = tests.player(5)), 'available', 'that player stays available');
select is((select count(*)::int from standings where tournament_id = active_tournament_id()), 3, 'standings rebuilt for 3 teams');
select is((select sum(played)::int from standings where tournament_id = active_tournament_id()), 2, 'only the other completed match counts');
select is(tests.invariants(), 'ok', 'invariants after the team delete');

-- matches: completed and live league fixtures
create temp table fx as select id, match_number from fixtures where tournament_id = active_tournament_id() order by match_number;
select throws_ok($$select tests.admin(format('select public.delete_fixture(%L)', (select id from fixtures where tournament_id = active_tournament_id() and status = 'completed' limit 1)))$$, 'P0001', 'FIXTURE_NOT_EDITABLE', 'safe delete refuses a completed match');
select ok(tests.admin(format('select public.delete_fixture(%L, true)', (select id from fixtures where tournament_id = active_tournament_id() and status = 'completed' limit 1))) ? 'deleted', 'force delete of a completed match');
select is((select sum(played)::int from standings where tournament_id = active_tournament_id()), 0, 'standings recalculated after deleting the result');
select tests.admin(format('select public.start_match(%L)', (select id from fixtures where tournament_id = active_tournament_id() and status = 'upcoming' limit 1)));
select ok(tests.admin(format('select public.delete_fixture(%L, true)', (select id from fixtures where tournament_id = active_tournament_id() and status = 'live' limit 1))) ? 'deleted', 'force delete of a live match');

-- playoff match "delete" resets it
select tests.admin($q$select public.save_playoff_settings('{"format":"direct_final","qualifying_teams":2}')$q$);
select tests.admin('select public.generate_playoff_bracket(false)');
do $$ declare f record; begin
  for f in select id from public.fixtures where tournament_id = public.active_tournament_id() and stage = 'league' and status = 'upcoming' loop
    perform tests.admin(format('select public.complete_match(%L, 70, 60, null)', f.id));
  end loop; end $$;
create temp table fin as select fixture_id id from playoff_nodes where tournament_id = active_tournament_id() and code = 'F';
select tests.admin(format('select public.complete_match(%L, 80, 70, null)', (select id from fin)));
select isnt((select champion_team_id from tournaments where is_active), null, 'champion crowned');
select ok(tests.admin(format('select public.delete_fixture(%L, true)', (select id from fin))) ? 'reset', 'force delete of the final resets it');
select is((select status::text from fixtures where id = (select id from fin)), 'upcoming', 'final upcoming again');
select is((select champion_team_id from tournaments where is_active), null, 'champion cleared');
select throws_ok($$select tests.exec_as('user', 'select public.delete_team(gen_random_uuid(), true)')$$, '42501', 'NOT_AUTHORIZED', 'non-admins still cannot delete');
select * from finish();
rollback;

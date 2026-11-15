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
-- Divisions (0010): each division is isolated; API reads are scoped by the x-division header.
select * from no_plan();
update public.tournaments set is_default = false where is_default;
update public.tournaments set is_default = true where id = public.active_tournament_id();
create temp table d as select public.active_tournament_id() as men;
select ok((tests.admin('select public.create_division(''Women'')') ->> 'id') is not null, 'create a division');
alter table d add column women uuid;
update d set women = (select id from tournaments where is_active and division_label = 'Women');
select throws_ok($$select tests.admin('select public.create_division(''women'')')$$, 'P0001', 'CONFLICT', 'duplicate division name refused');
select is(jsonb_array_length(public.list_divisions()), 2, 'two divisions listed');

-- A function that runs SQL as the admin with the x-division header PostgREST would send.
create function tests.in_div(p_div uuid, p_sql text) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
  perform set_config('request.headers', json_build_object('x-division', p_div)::text, true);
  r := tests.admin(p_sql);
  perform set_config('request.headers', '', true);
  return r;
exception when others then
  perform set_config('request.headers', '', true);
  raise;
end $f$;

select tests.add_teams(3);
select tests.add_players(6);
select is(tests.in_div((select women from d), $q$with x as (insert into public.teams (tournament_id, name, short_name) values (public.active_tournament_id(), 'Team A', 'TA') returning tournament_id) select to_jsonb(tournament_id) from x$q$),
          to_jsonb((select women from d)), 'same team name allowed in another division; lands in Women');
select is(tests.in_div((select women from d), 'select to_jsonb(count(*)) from public.teams'), '1'::jsonb, 'Women API reads see only Women teams');
select is(tests.in_div((select men from d), 'select to_jsonb(count(*)) from public.teams'), '3'::jsonb, 'Men API reads see only Men teams');
select is(tests.admin(format('select to_jsonb(count(*)) from public.teams where tournament_id in (%L, %L)', (select men from d), (select women from d))), '4'::jsonb, 'realtime-style reads (no headers) are not scoped');
select is((select count(*)::int from auction_state where tournament_id in ((select men from d), (select women from d))), 2, 'each division has its own auction');
select tests.admin('select public.start_auction_round(true)');
select is((select status::text from auction_state where tournament_id = (select women from d)), 'not_started', 'starting the Men auction leaves Women untouched');
select throws_ok($$select tests.in_div((select women from d), 'select public.start_auction_round(true)')$$, 'P0001', 'AUCTION_NEEDS_TEAMS', 'Women auction checks only Women teams');
select tests.in_div((select women from d), $q$with x as (insert into public.teams (tournament_id, name, short_name) values (public.active_tournament_id(), 'Team B', 'TB') returning 1) select to_jsonb(count(*)) from x$q$);
select is(tests.in_div((select women from d), 'select public.generate_league_fixtures(''single'', null, false)')->>'created', '1', 'Women league has 1 match');
select is(tests.admin('select public.generate_league_fixtures(''single'', null, false)')->>'created', '3', 'Men league has 3 matches');
select is((select count(*)::int from standings where tournament_id = (select women from d)), 2, 'Women standings separate');
-- shared courts: a Women match at the same time and court as a Men match is warned about
update fixtures set scheduled_at = '2027-01-01 10:00+00', venue = 'Court A' where tournament_id = (select men from d) and match_number = 1;
select ok(tests.in_div((select women from d), format('select public.update_fixture(%L, ''2027-01-01 10:00+00'', ''Court A'', null)',
  (select id from fixtures where tournament_id = (select women from d))))->'warnings' @> '[{"code":"VENUE_CLASH"}]', 'venue clash across divisions is warned');
select is(public.division_of((select id from fixtures where tournament_id = (select women from d))), (select women from d), 'division_of finds a match''s division');
-- branding is shared
update tournaments set name = 'Shared Name' where id = (select men from d);
select is((select name from tournaments where id = (select women from d)), 'Shared Name', 'branding synced across divisions');
select throws_ok($$select tests.admin(format('select public.delete_division(%L)', (select women from d)))$$, 'P0001', 'CONFLICT', 'a division with teams cannot be removed');
select * from finish();
rollback;

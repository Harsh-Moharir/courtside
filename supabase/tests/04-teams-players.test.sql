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
-- Teams, owners, players, icons, import (6.x)
select plan(16);
select tests.add_teams(9);
select throws_ok($$select tests.admin($q$with x as (insert into public.teams (tournament_id, name, short_name) values (public.active_tournament_id(), 'team a', 'ZZ') returning 1) select to_jsonb(count(*)) from x$q$)$$, '23505', null, 'team names are unique case-insensitively');
select tests.add_teams(1, 10);
select is((select count(*)::int from teams where tournament_id = active_tournament_id()), 10, 'ten teams');
select throws_ok($$select tests.add_teams(1, 11)$$, 'P0001', 'TEAM_LIMIT_REACHED', '11th team refused');
select is((select count(*)::int from standings where tournament_id = active_tournament_id()), 10, 'a zero standings row per team');
select is(tests.admin($q$with x as (update public.teams set name = '  Spaced   Name ' where short_name = 'TA' returning name) select to_jsonb(name) from x$q$), '"Spaced Name"'::jsonb, 'names trimmed and spaces collapsed');

select tests.add_players(5);
select throws_ok($$select tests.admin($q$with x as (insert into public.players (tournament_id, full_name, primary_position, secondary_position, base_price) values (public.active_tournament_id(), 'Dup', 'PG', 'PG', 100) returning 1) select to_jsonb(count(*)) from x$q$)$$, '23514', null, 'secondary must differ from primary');
select is(tests.admin($q$with x as (insert into public.players (tournament_id, full_name, primary_position, base_price) values (public.active_tournament_id(), 'आदित्य कुलकर्णी 🏀', 'C', 100) returning full_name) select to_jsonb(full_name) from x$q$), '"आदित्य कुलकर्णी 🏀"'::jsonb, 'non-Latin names and emoji stored unchanged');
select throws_ok($$select tests.admin($q$select public.import_players('[{"row_number":2,"full_name":"Ok","primary_position":"PG"},{"row_number":3,"full_name":"","primary_position":"PG"},{"row_number":4,"full_name":"Bad","primary_position":"XX"}]')$q$)$$, 'P0001', 'IMPORT_INVALID', 'invalid rows abort the whole import');
select is((select count(*)::int from players where full_name = 'Ok'), 0, 'all or nothing');
select is(tests.admin($q$select public.import_players('[{"row_number":2,"full_name":"Imported One","primary_position":"PG","age":21,"height_cm":180,"jersey_number":7},{"row_number":3,"full_name":"Imported Two","primary_position":"C"}]')$q$)->>'inserted', '2', 'valid import inserts all rows');
select is((select base_price from players where full_name = 'Imported Two'), 100::bigint, 'empty base price takes the default');
select is(tests.admin($q$select public.bulk_set_base_price(250)$q$)->>'updated', '8', 'bulk base price for available players');
select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('A'), tests.player(1)));
select is(tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('A'), tests.player(2)))->>'released_player_id', tests.player(1)::text, 'replacing an icon releases the previous one');
select is((select status::text from players where id = tests.player(1)), 'available', 'released player is available');
select throws_ok($$select tests.admin(format('select public.set_player_status(%L, ''unsold'')', tests.player(2)))$$, 'P0001', 'PLAYER_IS_ICON', 'icon status cannot be set by hand');
select throws_ok($$select tests.admin(format('select public.delete_player(%L)', tests.player(2)))$$, 'P0001', 'PLAYER_IS_ICON', 'icon cannot be deleted');
select * from finish();
rollback;

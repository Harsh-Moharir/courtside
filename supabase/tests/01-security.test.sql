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
-- Security tests (4.6)
select plan(28);
select tests.add_teams(2);
select tests.add_players(3);

-- 1. anonymous: no writes anywhere, no admin RPC
select throws_ok($$select tests.exec_as('anon', $q$with x as (insert into public.teams (tournament_id, name, short_name) values (public.active_tournament_id(), 'Anon', 'ANO') returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'anon cannot insert teams');
select throws_ok($$select tests.exec_as('anon', $q$with x as (update public.players set full_name = 'x' returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'anon cannot update players');
select throws_ok($$select tests.exec_as('anon', $q$with x as (delete from public.fixtures returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'anon cannot delete fixtures');
select throws_ok($$select tests.exec_as('anon', $q$with x as (insert into public.announcements (tournament_id, title, body) values (public.active_tournament_id(), 't', 'b') returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'anon cannot insert announcements');
select throws_ok($$select tests.exec_as('anon', 'select public.start_auction_round(false)')$$, '42501', null, 'anon cannot call start_auction_round');
select throws_ok($$select tests.exec_as('anon', 'select public.generate_league_fixtures(''single'', null, false)')$$, '42501', null, 'anon cannot call generate_league_fixtures');
select throws_ok($$select tests.exec_as('anon', 'select public.rebuild_standings()')$$, '42501', null, 'anon cannot call rebuild_standings');
select throws_ok($$select tests.exec_as('anon', 'select to_jsonb(public.recalculate_standings(public.active_tournament_id()))')$$, '42501', null, 'internal recalculate_standings is not callable by anon');

-- 2. signed-in non-admin: same rights as anon (RLS / NOT_AUTHORIZED)
select throws_ok($$select tests.exec_as('user', 'select public.start_auction_round(false)')$$, '42501', 'NOT_AUTHORIZED', 'non-admin RPC call is NOT_AUTHORIZED');
select throws_ok($$select tests.exec_as('user', 'select public.place_bid(gen_random_uuid(), gen_random_uuid(), 1, null, null)')$$, '42501', 'NOT_AUTHORIZED', 'non-admin cannot bid');
select throws_ok($$select tests.exec_as('user', $q$with x as (insert into public.teams (tournament_id, name, short_name) values (public.active_tournament_id(), 'User', 'USR') returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'non-admin insert blocked by RLS');
select is(tests.exec_as('user', $q$with x as (update public.players set full_name = 'hacked' returning 1) select to_jsonb(count(*)) from x$q$), '0'::jsonb, 'non-admin update affects no rows');
select is(tests.exec_as('user', 'select to_jsonb(count(*)) from public.administrators'), '0'::jsonb, 'non-admin sees no administrators (RLS)');

-- 3. admin cannot write protected columns directly
select throws_ok($$select tests.admin($q$with x as (update public.teams set purse_spent = 5 returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write teams.purse_spent');
select throws_ok($$select tests.admin($q$with x as (update public.teams set purse_total = 5 returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write teams.purse_total');
select throws_ok($$select tests.admin($q$with x as (update public.players set status = 'sold' returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write players.status');
select throws_ok($$select tests.admin($q$with x as (update public.standings set wins = 9 returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write standings');
select throws_ok($$select tests.admin($q$with x as (update public.match_results set home_score = 9 returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write match_results');
select throws_ok($$select tests.admin($q$with x as (update public.fixtures set status = 'completed' returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'admin cannot write fixtures.status');
select throws_ok($$select tests.admin($q$with x as (insert into public.auction_events (tournament_id, event_type, message) values (public.active_tournament_id(), 'sold', 'x') returning 1) select to_jsonb(count(*)) from x$q$)$$, '42501', null, 'auction_events is append-only via RPCs');
select lives_ok($$select tests.admin($q$with x as (update public.teams set primary_color = '#123456' returning 1) select to_jsonb(count(*)) from x$q$)$$, 'admin may update permitted team columns');

-- 4. anonymous select hides voided bids, reversed transactions, voided events, unpublished announcements, administrators
select tests.admin('select public.start_auction_round(true)');
select tests.admin(format('select public.open_lot(%L)', tests.player(1)));
select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select tests.admin(format('select public.undo_last_bid(%L)', tests.lot()));
select is(tests.exec_as('anon', 'select to_jsonb(count(*)) from public.auction_bids where tournament_id = public.active_tournament_id()'), '0'::jsonb, 'anon cannot see the voided bid');
select is(tests.admin('select to_jsonb(count(*)) from public.auction_bids where tournament_id = public.active_tournament_id()'), '1'::jsonb, 'admin sees the voided bid');
select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select tests.admin(format('select public.mark_sold(%L)', tests.lot()));
select tests.admin(format('select public.reverse_sale((select id from public.auction_transactions where player_id = %L), ''test'', ''available'')', tests.player(1)));
select is(tests.exec_as('anon', 'select to_jsonb(count(*)) from public.auction_transactions where tournament_id = public.active_tournament_id()'), '0'::jsonb, 'anon cannot see reversed transactions');
insert into public.announcements (tournament_id, title, body, published_at) values (public.active_tournament_id(), 'Later', 'b', now() + interval '1 day'), (public.active_tournament_id(), 'Now', 'b', now() - interval '1 minute');
select is(tests.exec_as('anon', 'select to_jsonb(array_agg(title)) from public.announcements where tournament_id = public.active_tournament_id()'), '["Now"]'::jsonb, 'anon sees only published announcements');
select throws_ok($$select tests.exec_as('anon', 'select to_jsonb(count(*)) from public.administrators')$$, '42501', null, 'anon cannot read administrators');

-- 5. storage: anonymous upload denied; buckets reject SVG and > 2 MB
select throws_ok($$select tests.exec_as('anon', $q$with x as (insert into storage.objects (bucket_id, name) values ('team-logos', 'x/y.png') returning 1) select to_jsonb(count(*)) from x$q$)$$, null, null, 'anon upload denied');
select is((select bool_and(not ('image/svg+xml' = any(allowed_mime_types)) and file_size_limit = 2097152) from storage.buckets where id in ('team-logos','player-photos','tournament-assets')), true, 'buckets allow only png/jpeg/webp up to 2 MB');

select * from finish();
rollback;

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
-- Playoff formats: ipl_page and direct_final progression (10.7.10)
select * from no_plan();
select tests.add_teams(4);
select tests.admin($q$select public.save_playoff_settings('{"format":"ipl_page","qualifying_teams":4}')$q$);
select tests.admin('select public.generate_league_fixtures(''single'', null, false)');
select tests.admin('select public.generate_playoff_bracket(false)');
do $$ declare f record; i int := 0; begin
  for f in select id from public.fixtures where tournament_id = public.active_tournament_id() and stage = 'league' order by match_number loop
    i := i + 1;
    perform tests.admin(format('select public.complete_match(%L, %s, %s, null)', f.id, 50 + i, 40));
  end loop; end $$;
create temp table n as select code, fixture_id from playoff_nodes where tournament_id = active_tournament_id();
select is((select count(*)::int from n), 4, 'ipl_page has 4 nodes');
select tests.admin(format('select public.complete_match(%L, 80, 70, null)', (select fixture_id from n where code = 'Q1')));
select tests.admin(format('select public.complete_match(%L, 60, 70, null)', (select fixture_id from n where code = 'ELIM')));
select is((select home_team_id from fixtures where id = (select fixture_id from n where code = 'Q2')), (select away_team_id from fixtures where id = (select fixture_id from n where code = 'Q1')), 'loser of Q1 goes to Q2');
select is((select away_team_id from fixtures where id = (select fixture_id from n where code = 'Q2')), (select away_team_id from fixtures where id = (select fixture_id from n where code = 'ELIM')), 'winner of ELIM goes to Q2');
select is((select home_team_id from fixtures where id = (select fixture_id from n where code = 'F')), (select home_team_id from fixtures where id = (select fixture_id from n where code = 'Q1')), 'winner of Q1 straight to the final');
select throws_ok($$select tests.admin($q$select public.save_playoff_settings('{"format":"direct_final","qualifying_teams":4}')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'direct_final needs 2');
select throws_ok($$select tests.admin($q$select public.save_playoff_settings('{"format":"single_elim_8","qualifying_teams":8}')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'qualifying count cannot exceed the number of teams');
select throws_ok($$select tests.admin('select public.generate_playoff_bracket(true)')$$, 'P0001', 'BRACKET_LOCKED', 'regenerate locked once playoffs started');
select * from finish();
rollback;

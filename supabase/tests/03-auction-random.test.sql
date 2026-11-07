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
-- Randomised sequence of 200 auction operations with a fixed seed; invariants (3.3) after every step.
select plan(4);
select tests.add_teams(4);
select tests.add_players(40, 100);
select tests.admin($q$select public.save_auction_settings('{"purse_per_team":3000,"min_squad_size":3,"max_squad_size":6,"reserve_per_slot":50}', null)$q$);
select tests.admin('select public.start_auction_round(true)');

create table tests.log (step int, op text, outcome text, inv text);
do $$
declare i int; op text; v_lot uuid; v_team uuid; v_player uuid; v_bid bigint; v_min bigint; r jsonb; v_out text; v_inv text;
begin
  perform setseed(0.42);
  for i in 1..200 loop
    v_lot := tests.lot();
    op := (array['open','bid','bid','bid','undo','sold','sold','unsold','cancel','reverse','reassign','icon','icon_clear'])[1 + floor(random() * 13)::int];
    v_out := 'ok';
    begin
      case op
        when 'open' then
          select id into v_player from public.players where tournament_id = public.active_tournament_id() and status = 'available' order by random() limit 1;
          perform tests.admin(format('select public.open_lot(%L)', v_player));
        when 'bid' then
          select current_bid, case when current_bid is null then base_price else current_bid + public.bid_step(tournament_id, current_bid) end
            into v_bid, v_min from public.auction_lots where id = v_lot;
          select id into v_team from public.teams where tournament_id = public.active_tournament_id() order by random() limit 1;
          perform tests.admin(format('select public.place_bid(%L, %L, %s, %s, gen_random_uuid())', v_lot, v_team,
            coalesce(v_min, 100) + (floor(random() * 3) * 100)::bigint, coalesce(v_bid::text, $q$null$q$)));
        when 'undo' then perform tests.admin(format('select public.undo_last_bid(%L)', v_lot));
        when 'sold' then perform tests.admin(format('select public.mark_sold(%L)', v_lot));
        when 'unsold' then perform tests.admin(format('select public.mark_unsold(%L, true)', v_lot));
        when 'cancel' then perform tests.admin(format('select public.cancel_lot(%L)', v_lot));
        when 'reverse' then
          perform tests.admin(format('select public.reverse_sale((select id from public.auction_transactions where tournament_id = public.active_tournament_id() and status = ''active'' order by random() limit 1), ''random'', ''%s'')',
            (array['available','unsold'])[1 + floor(random() * 2)::int]));
        when 'reassign' then
          select id into v_player from public.players where tournament_id = public.active_tournament_id() and status in ('sold','unsold','available') order by random() limit 1;
          select id into v_team from public.teams where tournament_id = public.active_tournament_id() order by random() limit 1;
          perform tests.admin(format('select public.reassign_player(%L, %L, %s, ''random'')', v_player, v_team, (floor(random() * 8) * 100)::int));
        when 'icon' then
          select id into v_player from public.players where tournament_id = public.active_tournament_id() and status in ('available','unsold') order by random() limit 1;
          select id into v_team from public.teams where tournament_id = public.active_tournament_id() order by random() limit 1;
          perform tests.admin(format('select public.set_icon_player(%L, %s, %L)', v_team, 1 + floor(random() * 2)::int, v_player));
        when 'icon_clear' then
          select id into v_team from public.teams where tournament_id = public.active_tournament_id() order by random() limit 1;
          perform tests.admin(format('select public.set_icon_player(%L, %s, null)', v_team, 1 + floor(random() * 2)::int));
      end case;
    exception when others then
      v_out := sqlerrm;
    end;
    v_inv := tests.invariants();
    insert into tests.log values (i, op, v_out, v_inv);
  end loop;
end $$;

select is((select count(*)::int from tests.log), 200, '200 operations ran');
select is((select count(*)::int from tests.log where inv <> 'ok'), 0, 'invariants held after every operation');
select is((select count(*)::int from tests.log where outcome <> 'ok' and outcome !~ '^[A-Z_]+$'), 0, 'every refusal was a stable error code (no raw Postgres errors)');
select ok((select count(*) from tests.log where op = 'sold' and outcome = 'ok') > 0, 'some sales happened');
select * from finish();
rollback;

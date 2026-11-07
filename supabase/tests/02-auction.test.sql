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
-- Auction engine (5.x) incl. every edge case in 5.9 and the invariants in 3.3
select * from no_plan();

-- start_auction_round preconditions
select throws_ok($$select tests.admin('select public.start_auction_round(false)')$$, 'P0001', 'AUCTION_NEEDS_TEAMS', 'needs 2 teams');
select tests.add_teams(3);
select throws_ok($$select tests.admin('select public.start_auction_round(false)')$$, 'P0001', 'POOL_EMPTY', 'needs available players');
select tests.add_players(30);
select throws_ok($$select tests.admin('select public.start_auction_round(false)')$$, 'P0001', 'ICONS_INCOMPLETE', 'icons incomplete blocks without force');
select throws_ok($$select tests.admin(format('select public.open_lot(%L)', tests.player(1)))$$, 'P0001', 'AUCTION_NOT_LIVE', 'open_lot before start');
select tests.admin($q$select public.save_auction_settings('{"purse_per_team":1000,"min_squad_size":3,"max_squad_size":4}', null)$q$);
select is((select array_agg(distinct purse_total) from teams where tournament_id = active_tournament_id()), array[1000::bigint], 'purse_per_team applies to teams while not started');
select is(tests.admin('select public.start_auction_round(true)')->'state'->>'status', 'live', 'force start goes live');
select is((select current_round from auction_state where tournament_id = active_tournament_id()), 1::smallint, 'round 1');
select throws_ok($$select tests.admin('select public.start_auction_round(true)')$$, 'P0001', 'CONFLICT', 'cannot start round 1 twice');

-- open_lot / open_random_lot
select is(tests.admin(format('select public.open_lot(%L)', tests.player(1)))->'lot'->>'player_name', 'Player 001', 'lot opened with snapshot');
select throws_ok($$select tests.admin(format('select public.open_lot(%L)', tests.player(2)))$$, 'P0001', 'LOT_ALREADY_LIVE', 'one live lot');
select throws_ok($$select tests.admin('select public.open_random_lot(null)')$$, 'P0001', 'LOT_ALREADY_LIVE', 'random also blocked');
select throws_ok($$select tests.admin(format('select public.delete_player(%L)', tests.player(1)))$$, 'P0001', 'PLAYER_ON_LIVE_LOT', 'cannot delete player on the block');
select throws_ok($$select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('A'), tests.player(1)))$$, 'P0001', 'PLAYER_ON_LIVE_LOT', 'cannot make lot player an icon');

-- place_bid checks in order
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 50, null, gen_random_uuid())', tests.lot(), tests.team('A')))$$, 'P0001', 'BID_BELOW_MINIMUM', 'below base price');
select is(tests.admin(format('select public.place_bid(%L, %L, 100, null, %L)', tests.lot(), tests.team('A'), 'cccccccc-0000-0000-0000-000000000001'))->'lot'->>'current_bid', '100', 'first bid at base price');
select is(tests.admin(format('select public.place_bid(%L, %L, 100, null, %L)', tests.lot(), tests.team('A'), 'cccccccc-0000-0000-0000-000000000001'))->>'duplicate', 'true', '5.9.2 retry with same request id is idempotent');
select is((select count(*)::int from auction_bids where lot_id = tests.lot()), 1, 'still one bid after the retry');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 200, null, gen_random_uuid())', tests.lot(), tests.team('B')))$$, 'P0001', 'BID_STALE', '5.9.1 stale expected bid');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 200, 100, gen_random_uuid())', tests.lot(), tests.team('A')))$$, 'P0001', 'BID_SAME_TEAM_LEADING', 'leader cannot raise itself');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 150, 100, gen_random_uuid())', tests.lot(), tests.team('B')))$$, 'P0001', 'BID_BELOW_MINIMUM', 'step enforced');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 1001, 100, gen_random_uuid())', tests.lot(), tests.team('B')))$$, 'P0001', 'BID_EXCEEDS_PURSE', '5.9.4 one unit over max bid fails');
select is(tests.admin(format('select public.place_bid(%L, %L, 1000, 100, gen_random_uuid())', tests.lot(), tests.team('B')))->'lot'->>'current_bid', '1000', '5.9.4 bid equal to max bid succeeds');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, gen_random_uuid(), 2000, 1000, gen_random_uuid())', tests.lot()))$$, 'P0001', 'NOT_FOUND', 'unknown team');

-- undo
select is(tests.admin(format('select public.undo_last_bid(%L)', tests.lot()))->'lot'->>'current_bid', '100', 'undo restores previous bid');
select is((select leading_team_id from auction_lots where id = tests.lot()), tests.team('A'), 'undo restores previous leader');
select is(tests.admin(format('select public.undo_last_bid(%L)', tests.lot()))->'lot'->>'current_bid', null, 'undo down to zero bids');
select throws_ok($$select tests.admin(format('select public.undo_last_bid(%L)', tests.lot()))$$, 'P0001', 'NOTHING_TO_UNDO', 'nothing left');
select throws_ok($$select tests.admin(format('select public.mark_sold(%L)', tests.lot()))$$, 'P0001', 'SOLD_WITHOUT_BID', 'sold needs a bid');

-- 5.9.7 sale re-validates purse
select tests.admin(format('select public.place_bid(%L, %L, 500, null, gen_random_uuid())', tests.lot(), tests.team('C')));
select throws_ok($$select tests.admin(format('select public.set_team_purse(%L, 400)', tests.team('C')))$$, 'P0001', 'PURSE_BELOW_SPENT', 'purse cannot drop below spent + leading bid');
select is(tests.admin(format('select public.set_team_purse(%L, 2000)', tests.team('C')))->'team'->>'purse_total', '2000', 'purse override');

-- pause blocks bidding
select tests.admin('select public.pause_auction()');
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 600, 500, gen_random_uuid())', tests.lot(), tests.team('A')))$$, 'P0001', 'AUCTION_PAUSED', 'paused rejects bids');
select throws_ok($$select tests.admin(format('select public.mark_sold(%L)', tests.lot()))$$, 'P0001', 'AUCTION_PAUSED', 'paused rejects sold');
select throws_ok($$select tests.admin('select public.pause_auction()')$$, 'P0001', 'AUCTION_NOT_LIVE', 'cannot pause twice');
select tests.admin('select public.resume_auction()');
select throws_ok($$select tests.admin('select public.resume_auction()')$$, 'P0001', 'CONFLICT', 'cannot resume when live');

-- mark_sold atomic effects
select is(tests.admin(format('select public.mark_sold(%L)', tests.lot()))->'event'->>'event_type', 'sold', 'sold');
select is((select status::text from players where id = tests.player(1)), 'sold', 'player sold');
select is((select purse_spent from teams where id = tests.team('C')), 500::bigint, 'purse deducted');
select is((select count(*)::int from team_players where player_id = tests.player(1) and team_id = tests.team('C')), 1, 'roster row created');
select is((select purchase_order from auction_transactions where player_id = tests.player(1)), 1, 'purchase order 1');
select is(tests.invariants(), 'ok', 'invariants after sale');
select throws_ok($$select tests.admin(format('select public.mark_sold((select id from public.auction_lots where player_id = %L))', tests.player(1)))$$, 'P0001', 'LOT_NOT_LIVE', '5.9.8 second sold sees LOT_NOT_LIVE');
select throws_ok($$select tests.admin(format('select public.open_lot(%L)', tests.player(1)))$$, 'P0001', 'PLAYER_NOT_AVAILABLE', 'sold player cannot be auctioned again');
select throws_ok($$select tests.admin(format('select public.set_player_status(%L, ''unsold'')', tests.player(1)))$$, 'P0001', 'PLAYER_IS_SOLD', 'sold player status cannot be set by hand');
select throws_ok($$select tests.admin(format('select public.delete_player(%L)', tests.player(1)))$$, 'P0001', 'PLAYER_IS_SOLD', 'sold player cannot be deleted');

-- 5.9.9 unsold with bids requires discard; cancel keeps available
select tests.admin(format('select public.open_lot(%L)', tests.player(2)));
select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('A')));
select throws_ok($$select tests.admin(format('select public.mark_unsold(%L, false)', tests.lot()))$$, 'P0001', 'BIDS_EXIST', 'unsold needs discard confirmation');
select is(tests.admin(format('select public.mark_unsold(%L, true)', tests.lot()))->'lot'->>'status', 'unsold', 'unsold with discard');
select is((select status::text from players where id = tests.player(2)), 'unsold', 'player unsold');
select is((select count(*)::int from auction_bids where lot_id = (select id from auction_lots where player_id = tests.player(2)) and not is_voided), 0, 'bids voided');
select tests.admin(format('select public.open_lot(%L)', tests.player(3)));
select is(tests.admin(format('select public.cancel_lot(%L)', tests.lot()))->'lot'->>'status', 'cancelled', 'cancel lot');
select is((select status::text from players where id = tests.player(3)), 'available', 'cancelled lot leaves player available');

-- 5.9.5 squad full: max 4, icons count
select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('A'), tests.player(10)));
select tests.admin(format('select public.set_icon_player(%L, 2, %L)', tests.team('A'), tests.player(11)));
select tests.admin(format('select public.reassign_player(%L, %L, 0, ''direct placement'')', tests.player(12), tests.team('A')));
select tests.admin(format('select public.reassign_player(%L, %L, 0, ''direct placement'')', tests.player(13), tests.team('A')));
select is(public.team_squad_count(tests.team('A')), 4, 'team A full');
select tests.admin(format('select public.open_lot(%L)', tests.player(4)));
select throws_ok($$select tests.admin(format('select public.place_bid(%L, %L, 100, null, gen_random_uuid())', tests.lot(), tests.team('A')))$$, 'P0001', 'TEAM_SQUAD_FULL', 'full squad cannot bid');
select throws_ok($$select tests.admin(format('select public.reassign_player(%L, %L, 0, ''x'')', tests.player(14), tests.team('A')))$$, 'P0001', 'TEAM_SQUAD_FULL', 'full squad cannot receive');
select throws_ok($$select tests.admin($q$select public.save_auction_settings('{"max_squad_size":3}', null)$q$)$$, 'P0001', 'SETTINGS_CONFLICT', 'max squad below largest squad');
select throws_ok($$select tests.admin($q$select public.save_auction_settings('{"max_squad_size":2,"min_squad_size":3}', null)$q$)$$, 'P0001', 'VALIDATION_FAILED', 'max < min rejected');
select throws_ok($$select tests.admin($q$select public.save_auction_settings('{}', '[{"from_amount":10,"step":5}]')$q$)$$, 'P0001', 'VALIDATION_FAILED', 'tiers must start at 0');
select throws_ok($$select tests.admin($q$select public.save_auction_settings('{"max_rounds":0}', null)$q$)$$, 'P0001', 'VALIDATION_FAILED', 'max_rounds range');
select tests.admin(format('select public.cancel_lot(%L)', tests.lot()));
select throws_ok($$select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('B'), tests.player(11)))$$, 'P0001', 'ICON_PLAYER_INVALID', 'player is already an icon elsewhere');
select throws_ok($$select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('B'), tests.player(1)))$$, 'P0001', 'ICON_PLAYER_INVALID', 'sold player cannot be icon');
select throws_ok($$select tests.admin(format('select public.set_icon_player(%L, 2, %L)', tests.team('A'), tests.player(10)))$$, 'P0001', 'ICON_PLAYER_INVALID', 'same player as other icon slot');
select throws_ok($$select tests.admin(format('select public.reassign_player(%L, %L, 0, ''x'')', tests.player(10), tests.team('B')))$$, 'P0001', 'PLAYER_IS_ICON', 'icons cannot be reassigned');

-- 5.9.11 reverse refunds to the unit; reassign covers wrong team and wrong price
select is(tests.admin(format('select public.reverse_sale((select id from public.auction_transactions where player_id = %L and status = ''active''), ''wrong team'', ''unsold'')', tests.player(1)))->'event'->>'event_type', 'sale_reversed', 'reverse sale');
select is((select purse_spent from teams where id = tests.team('C')), 0::bigint, 'purse refunded to the unit');
select is((select status::text from players where id = tests.player(1)), 'unsold', 'return status applied');
select throws_ok($$select tests.admin(format('select public.reverse_sale((select id from public.auction_transactions where player_id = %L), ''again'', ''available'')', tests.player(1)))$$, 'P0001', 'TXN_NOT_ACTIVE', 'cannot reverse twice');
select throws_ok($$select tests.admin(format('select public.reverse_sale((select id from public.auction_transactions where player_id = %L and status = ''active''), '''', ''available'')', tests.player(12)))$$, 'P0001', 'VALIDATION_FAILED', 'reason required');
select tests.admin(format('select public.reassign_player(%L, %L, 700, ''late sale'')', tests.player(1), tests.team('B')));
select is((select purse_spent from teams where id = tests.team('B')), 700::bigint, 'manual placement deducts');
select tests.admin(format('select public.reassign_player(%L, %L, 300, ''wrong price'')', tests.player(1), tests.team('B')));
select is((select purse_spent from teams where id = tests.team('B')), 300::bigint, 'same-team price correction');
select throws_ok($$select tests.admin(format('select public.reassign_player(%L, %L, 5000, ''too much'')', tests.player(1), tests.team('C')))$$, 'P0001', 'BID_EXCEEDS_PURSE', 'reassign respects purse');
select is((select count(*)::int from auction_transactions where player_id = tests.player(1) and status = 'active'), 1, 'one active transaction per player');
select ok((select array_agg(purchase_order order by purchase_order) from auction_transactions where tournament_id = active_tournament_id()) = array[1,2,3,4,5], '5.9.14 purchase orders keep numbers (gaps after reversals are allowed)');
select is(tests.invariants(), 'ok', 'invariants after corrections');

-- rounds and unsold rules; 5.9.12 decay never below 1
select tests.admin($q$select public.save_auction_settings('{"unsold_base_price_reduction_pct":90,"max_rounds":2}', null)$q$);
update players set base_price = 3 where id = tests.player(2);
select throws_ok($$select tests.admin('select public.start_next_round(array[]::uuid[])')$$, 'P0001', 'CONFLICT', 'not between rounds');
select tests.admin(format('select public.open_lot(%L)', tests.player(5)));
select throws_ok($$select tests.admin('select public.end_auction_round()')$$, 'P0001', 'LIVE_LOT_EXISTS', 'end round needs no live lot');
select throws_ok($$select tests.admin('select public.complete_auction()')$$, 'P0001', 'LIVE_LOT_EXISTS', 'complete needs no live lot');
select tests.admin(format('select public.cancel_lot(%L)', tests.lot()));
select is(tests.admin('select public.end_auction_round()')->'state'->>'between_rounds', 'true', 'manual_reenter pauses between rounds');
select throws_ok($$select tests.admin('select public.resume_auction()')$$, 'P0001', 'CONFLICT', 'resume not allowed between rounds');
select throws_ok($$select tests.admin(format('select public.start_next_round(array[%L]::uuid[])', tests.player(5)))$$, 'P0001', 'PLAYER_NOT_AVAILABLE', 'only unsold players re-enter');
select is(tests.admin(format('select public.start_next_round(array[%L]::uuid[])', tests.player(2)))->'state'->>'current_round', '2', 'round 2 started');
select is((select base_price from players where id = tests.player(2)), 1::bigint, '90% decay of 3 floors at 1');
select is((select status::text from players where id = tests.player(2)), 'available', 're-entered player available');
select tests.admin('select public.end_auction_round()');
select throws_ok($$select tests.admin('select public.start_next_round(array[]::uuid[])')$$, 'P0001', 'ROUND_LIMIT_REACHED', 'max rounds reached');

-- 5.9.13 complete with warnings, reopen
select ok(jsonb_array_length(tests.admin('select public.complete_auction()')->'warnings'->'teams_below_min') >= 1, 'complete returns teams below min squad');
select is((select status::text from auction_state where tournament_id = active_tournament_id()), 'completed', 'completed');
select is(tests.admin('select public.reopen_auction()')->'state'->>'status', 'paused', 'reopen goes paused between rounds');
select tests.admin('select public.complete_auction()');

-- auto_reenter
select tests.admin('select public.reopen_auction()');
select tests.admin($q$select public.save_auction_settings('{"unsold_rule":"no_reenter","max_rounds":5}', null)$q$);
select throws_ok($$select tests.admin(format('select public.start_next_round(array[%L]::uuid[])', tests.player(1)))$$, 'P0001', 'ROUND_LIMIT_REACHED', 'no_reenter blocks next round');

-- delete_team rules
select throws_ok($$select tests.admin(format('select public.delete_team(%L)', tests.team('A')))$$, 'P0001', 'TEAM_HAS_HISTORY', 'team with purchases cannot be deleted');
select tests.add_teams(1, 4);
select tests.admin(format('select public.set_icon_player(%L, 1, %L)', tests.team('D'), tests.player(20)));
select ok(tests.admin(format('select public.delete_team(%L)', tests.team('D'))) ? 'deleted', 'team without history deleted');
select is((select status::text from players where id = tests.player(20)), 'available', 'icons released on delete');
select is(tests.invariants(), 'ok', 'invariants at the end');

select * from finish();
rollback;

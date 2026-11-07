-- 0004_functions_auction.sql
-- Auction engine (section 5), icon players and player/team administration RPCs (section 6).
-- Lock order, always: auction_state row, then auction_lots row, then teams rows in ascending id, then players row.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._fmt_money(p_tid uuid, p_amount bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select currency_symbol from public.tournaments where id = p_tid), '₹')
         || to_char(coalesce(p_amount, 0), 'FM999,99,99,99,99,999')
$$;

create or replace function public._require_tournament() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v uuid;
begin
  v := public.active_tournament_id();
  if v is null then perform public.raise_err('NOT_FOUND', '{"entity":"tournament"}'); end if;
  return v;
end $$;

-- Step for a current bid b: step of the tier with the greatest from_amount <= b (5.3).
create or replace function public.bid_step(p_tid uuid, p_bid bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select step from public.auction_increment_tiers
                   where tournament_id = p_tid and from_amount <= coalesce(p_bid, 0)
                   order by from_amount desc limit 1), 1)
$$;

-- Squad count (5.3): icon rows only count when icon_counts_in_squad.
create or replace function public.team_squad_count(p_team_id uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.team_players tp
  join public.teams t on t.id = tp.team_id
  join public.auction_settings s on s.tournament_id = t.tournament_id
  where tp.team_id = p_team_id and (tp.source <> 'icon' or s.icon_counts_in_squad)
$$;

-- max_bid = purse_remaining - reserve_per_slot * max(0, min_squad_size - squad_count - 1), floored at 0.
create or replace function public.team_max_bid(p_team_id uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(0, t.purse_remaining
           - s.reserve_per_slot * greatest(0, s.min_squad_size - public.team_squad_count(t.id) - 1))::bigint
  from public.teams t join public.auction_settings s on s.tournament_id = t.tournament_id
  where t.id = p_team_id
$$;

create or replace view public.v_team_finance with (security_invoker = true) as
select t.id as team_id, t.tournament_id, t.purse_total, t.purse_spent, t.purse_remaining,
       public.team_squad_count(t.id) as squad_count,
       (select count(*)::int from public.team_players tp where tp.team_id = t.id and tp.source <> 'icon') as purchased_count,
       greatest(0, s.max_squad_size - public.team_squad_count(t.id)) as slots_left,
       s.min_squad_size, s.max_squad_size,
       public.team_max_bid(t.id) as max_bid
from public.teams t join public.auction_settings s on s.tournament_id = t.tournament_id;
grant select on public.v_team_finance to anon, authenticated;

create or replace function public._auction_event(
  p_tid uuid, p_type public.auction_event_type, p_lot uuid, p_team uuid, p_player uuid,
  p_amount bigint, p_message text, p_payload jsonb default '{}'::jsonb)
returns public.auction_events
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.auction_events;
begin
  insert into public.auction_events (tournament_id, event_type, lot_id, team_id, player_id, amount, message, payload, created_by)
  values (p_tid, p_type, p_lot, p_team, p_player, p_amount, p_message, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning * into e;
  return e;
end $$;

create or replace function public._lock_auction(p_tid uuid) returns public.auction_state
language plpgsql security definer set search_path = public, pg_temp as $$
declare st public.auction_state;
begin
  perform public.ensure_tournament_children(p_tid);
  select * into st from public.auction_state where tournament_id = p_tid for update;
  return st;
end $$;

create or replace function public._require_live(st public.auction_state) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if st.status = 'paused' then perform public.raise_err('AUCTION_PAUSED', jsonb_build_object('status', st.status)); end if;
  if st.status <> 'live' then perform public.raise_err('AUCTION_NOT_LIVE', jsonb_build_object('status', st.status)); end if;
end $$;

-- Locks a lot of the tournament and checks it is live. Returns the lot.
create or replace function public._lock_live_lot(p_tid uuid, p_lot_id uuid) returns public.auction_lots
language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.auction_lots;
begin
  select * into l from public.auction_lots where id = p_lot_id and tournament_id = p_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', jsonb_build_object('entity', 'lot')); end if;
  if l.status <> 'live' then
    perform public.raise_err('LOT_NOT_LIVE', jsonb_build_object('already', l.status, 'lot', to_jsonb(l)));
  end if;
  return l;
end $$;

create or replace function public._auction_result(p_tid uuid, p_lot uuid, p_team uuid, p_event public.auction_events, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'state', (select to_jsonb(s) from public.auction_state s where s.tournament_id = p_tid),
    'lot', (select to_jsonb(l) from public.auction_lots l where l.id = p_lot),
    'team', (select to_jsonb(f) from public.v_team_finance f where f.team_id = p_team),
    'event', to_jsonb(p_event)) || coalesce(p_extra, '{}'::jsonb)
$$;

create or replace function public._is_on_live_lot(p_player_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.auction_lots where player_id = p_player_id and status = 'live')
$$;

create or replace function public._decayed_price(p_price bigint, p_pct int) returns bigint
language sql immutable as $$
  select greatest(1, floor(p_price * (100 - p_pct) / 100.0))::bigint
$$;

-- ---------------------------------------------------------------------------
-- Rounds and status (5.1, 5.6)
-- ---------------------------------------------------------------------------
create or replace function public.start_auction_round(p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; v_missing jsonb; e public.auction_events; v_teams int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status <> 'not_started' then
    perform public.raise_err('CONFLICT', jsonb_build_object('status', st.status, 'reason', 'Round 1 has already started'));
  end if;
  select count(*) into v_teams from public.teams where tournament_id = v_tid;
  if v_teams < 2 then perform public.raise_err('AUCTION_NEEDS_TEAMS', jsonb_build_object('teams', v_teams)); end if;
  if not exists (select 1 from public.players where tournament_id = v_tid and status = 'available') then
    perform public.raise_err('POOL_EMPTY', '{}');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name,
           'icons', (select count(*) from public.team_players tp where tp.team_id = t.id and tp.source = 'icon'))
           order by t.sort_order, t.name), '[]'::jsonb)
    into v_missing
  from public.teams t
  where t.tournament_id = v_tid
    and (select count(*) from public.team_players tp where tp.team_id = t.id and tp.source = 'icon') < 2;
  if jsonb_array_length(v_missing) > 0 and not coalesce(p_force, false) then
    perform public.raise_err('ICONS_INCOMPLETE', jsonb_build_object('teams', v_missing));
  end if;
  update public.auction_state set status = 'live', current_round = 1, between_rounds = false, updated_by = auth.uid()
  where tournament_id = v_tid;
  update public.tournaments set phase = 'auction' where id = v_tid and phase = 'setup';
  e := public._auction_event(v_tid, 'round_started', null, null, null, null, 'Round 1 of the auction has started',
                             jsonb_build_object('round', 1));
  return public._auction_result(v_tid, null, null, e);
end $$;

create or replace function public.pause_auction() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status <> 'live' then perform public.raise_err('AUCTION_NOT_LIVE', jsonb_build_object('status', st.status)); end if;
  update public.auction_state set status = 'paused', between_rounds = false, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'auction_paused', st.current_lot_id, null, null, null, 'Auction paused', '{}');
  return public._auction_result(v_tid, st.current_lot_id, null, e);
end $$;

create or replace function public.resume_auction() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status <> 'paused' then perform public.raise_err('CONFLICT', jsonb_build_object('status', st.status)); end if;
  if st.between_rounds then
    perform public.raise_err('CONFLICT', jsonb_build_object('reason', 'Between rounds: start the next round or complete the auction'));
  end if;
  update public.auction_state set status = 'live', updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'auction_resumed', st.current_lot_id, null, null, null, 'Auction resumed', '{}');
  return public._auction_result(v_tid, st.current_lot_id, null, e);
end $$;

create or replace function public._reenter_players(p_tid uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pct int; v_count int;
begin
  select unsold_base_price_reduction_pct into v_pct from public.auction_settings where tournament_id = p_tid;
  update public.players
     set status = 'available', base_price = public._decayed_price(base_price, coalesce(v_pct, 0))
   where tournament_id = p_tid and status = 'unsold' and id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.end_auction_round() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; s public.auction_settings; e public.auction_events;
        v_unsold uuid[]; v_auto boolean := false; v_n int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  if st.current_lot_id is not null then perform public.raise_err('LIVE_LOT_EXISTS', jsonb_build_object('lot_id', st.current_lot_id)); end if;
  select * into s from public.auction_settings where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'round_ended', null, null, null, null, format('Round %s ended', st.current_round),
                             jsonb_build_object('round', st.current_round));
  select coalesce(array_agg(id), '{}') into v_unsold from public.players where tournament_id = v_tid and status = 'unsold';
  if s.unsold_rule = 'auto_reenter' and st.current_round < s.max_rounds and cardinality(v_unsold) > 0 then
    v_n := public._reenter_players(v_tid, v_unsold);
    update public.auction_state set status = 'live', current_round = st.current_round + 1, between_rounds = false,
           updated_by = auth.uid() where tournament_id = v_tid;
    e := public._auction_event(v_tid, 'round_started', null, null, null, null,
           format('Round %s started with %s re-entered player(s)', st.current_round + 1, v_n),
           jsonb_build_object('round', st.current_round + 1, 'reentered', v_n));
    v_auto := true;
  else
    update public.auction_state set status = 'paused', between_rounds = true, updated_by = auth.uid() where tournament_id = v_tid;
  end if;
  return public._auction_result(v_tid, null, null, e, jsonb_build_object('auto_started', v_auto));
end $$;

create or replace function public.start_next_round(p_player_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; s public.auction_settings; e public.auction_events; v_n int; v_bad int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if not (st.status = 'paused' and st.between_rounds) then
    perform public.raise_err('CONFLICT', jsonb_build_object('status', st.status, 'reason', 'Not between rounds'));
  end if;
  select * into s from public.auction_settings where tournament_id = v_tid;
  if s.unsold_rule = 'no_reenter' or st.current_round >= s.max_rounds then
    perform public.raise_err('ROUND_LIMIT_REACHED', jsonb_build_object('current_round', st.current_round, 'max_rounds', s.max_rounds,
      'unsold_rule', s.unsold_rule));
  end if;
  select count(*) into v_bad from unnest(coalesce(p_player_ids, '{}')) x(id)
   where not exists (select 1 from public.players p where p.id = x.id and p.tournament_id = v_tid and p.status = 'unsold');
  if v_bad > 0 then perform public.raise_err('PLAYER_NOT_AVAILABLE', jsonb_build_object('reason', 'Only unsold players can be re-entered')); end if;
  v_n := public._reenter_players(v_tid, coalesce(p_player_ids, '{}'));
  if not exists (select 1 from public.players where tournament_id = v_tid and status = 'available') then
    perform public.raise_err('POOL_EMPTY', '{}');
  end if;
  update public.auction_state set status = 'live', current_round = st.current_round + 1, between_rounds = false,
         updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'round_started', null, null, null, null,
         format('Round %s started with %s re-entered player(s)', st.current_round + 1, v_n),
         jsonb_build_object('round', st.current_round + 1, 'reentered', v_n));
  return public._auction_result(v_tid, null, null, e);
end $$;

create or replace function public._auction_warnings(p_tid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'teams_below_min', coalesce((select jsonb_agg(jsonb_build_object('team_id', f.team_id, 'name', t.name,
                         'squad_count', f.squad_count, 'min', f.min_squad_size) order by t.name)
                       from public.v_team_finance f join public.teams t on t.id = f.team_id
                       where f.tournament_id = p_tid and f.squad_count < f.min_squad_size), '[]'::jsonb),
    'available_players', (select count(*) from public.players where tournament_id = p_tid and status = 'available'),
    'unsold_players', (select count(*) from public.players where tournament_id = p_tid and status = 'unsold'))
$$;

create or replace function public.complete_auction() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status not in ('live','paused') then perform public.raise_err('AUCTION_NOT_LIVE', jsonb_build_object('status', st.status)); end if;
  if st.current_lot_id is not null then perform public.raise_err('LIVE_LOT_EXISTS', jsonb_build_object('lot_id', st.current_lot_id)); end if;
  update public.auction_state set status = 'completed', between_rounds = false, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'auction_completed', null, null, null, null, 'The auction is complete', '{}');
  return public._auction_result(v_tid, null, null, e, jsonb_build_object('warnings', public._auction_warnings(v_tid)));
end $$;

create or replace function public.reopen_auction() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status <> 'completed' then perform public.raise_err('CONFLICT', jsonb_build_object('status', st.status)); end if;
  update public.auction_state set status = 'paused', between_rounds = true, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'auction_resumed', null, null, null, null, 'The auction was reopened for corrections or more rounds', '{}');
  return public._auction_result(v_tid, null, null, e);
end $$;

create or replace function public.auction_warnings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public._auction_warnings(public.active_tournament_id());
end $$;

-- ---------------------------------------------------------------------------
-- Lots and bids (5.2, 5.4)
-- ---------------------------------------------------------------------------
create or replace function public.open_lot(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; p public.players; l public.auction_lots; e public.auction_events; v_num int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  if st.current_lot_id is not null then perform public.raise_err('LOT_ALREADY_LIVE', jsonb_build_object('lot_id', st.current_lot_id)); end if;
  select * into p from public.players where id = p_player_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
  if p.status <> 'available' then perform public.raise_err('PLAYER_NOT_AVAILABLE', jsonb_build_object('status', p.status)); end if;
  select coalesce(max(lot_number), 0) + 1 into v_num from public.auction_lots where tournament_id = v_tid;
  insert into public.auction_lots (tournament_id, round_number, lot_number, player_id, player_name, player_photo_path,
                                   primary_position, secondary_position, base_price)
  values (v_tid, greatest(st.current_round, 1), v_num, p.id, p.full_name, p.photo_path, p.primary_position, p.secondary_position, p.base_price)
  returning * into l;
  update public.auction_state set current_lot_id = l.id, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'lot_opened', l.id, null, p.id, p.base_price,
         format('Lot %s: %s (%s) is up, base price %s', v_num, p.full_name, p.primary_position, public._fmt_money(v_tid, p.base_price)),
         jsonb_build_object('lot_number', v_num, 'round', l.round_number));
  return public._auction_result(v_tid, l.id, null, e);
end $$;

create or replace function public.open_random_lot(p_position public.player_position default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; v_player uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  if st.current_lot_id is not null then perform public.raise_err('LOT_ALREADY_LIVE', jsonb_build_object('lot_id', st.current_lot_id)); end if;
  select id into v_player from public.players
   where tournament_id = v_tid and status = 'available' and (p_position is null or primary_position = p_position)
   order by random() limit 1;
  if v_player is null then perform public.raise_err('POOL_EMPTY', jsonb_build_object('position', p_position)); end if;
  return public.open_lot(v_player);
end $$;

create or replace function public.place_bid(
  p_lot_id uuid, p_team_id uuid, p_amount bigint, p_expected_current_bid bigint, p_client_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; l public.auction_lots; t public.teams; s public.auction_settings;
        e public.auction_events; v_min bigint; v_max bigint; v_seq int; v_squad int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  -- 1 auction live
  perform public._require_live(st);
  -- 2 lot live
  l := public._lock_live_lot(v_tid, p_lot_id);
  -- 3 idempotent retry
  if p_client_request_id is not null and exists (select 1 from public.auction_bids where client_request_id = p_client_request_id) then
    return public._auction_result(v_tid, l.id, p_team_id, null, jsonb_build_object('duplicate', true));
  end if;
  -- 4 stale view
  if p_expected_current_bid is distinct from l.current_bid then
    perform public.raise_err('BID_STALE', jsonb_build_object('lot', to_jsonb(l)));
  end if;
  -- 5 team exists
  select * into t from public.teams where id = p_team_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  -- 6 not already leading
  if l.leading_team_id = p_team_id then perform public.raise_err('BID_SAME_TEAM_LEADING', jsonb_build_object('team', t.name)); end if;
  select * into s from public.auction_settings where tournament_id = v_tid;
  -- 7 squad
  v_squad := public.team_squad_count(t.id);
  if v_squad >= s.max_squad_size then
    perform public.raise_err('TEAM_SQUAD_FULL', jsonb_build_object('team', t.name, 'squad_count', v_squad, 'max', s.max_squad_size));
  end if;
  -- 8 minimum
  v_min := case when l.current_bid is null then l.base_price else l.current_bid + public.bid_step(v_tid, l.current_bid) end;
  if p_amount is null or p_amount < v_min then
    perform public.raise_err('BID_BELOW_MINIMUM', jsonb_build_object('minimum', v_min));
  end if;
  -- 9 purse
  v_max := public.team_max_bid(t.id);
  if p_amount > v_max then
    perform public.raise_err('BID_EXCEEDS_PURSE', jsonb_build_object('max_bid', v_max, 'team', t.name));
  end if;
  select coalesce(max(sequence), 0) + 1 into v_seq from public.auction_bids where lot_id = l.id;
  insert into public.auction_bids (tournament_id, lot_id, team_id, amount, sequence, client_request_id, created_by)
  values (v_tid, l.id, t.id, p_amount, v_seq, p_client_request_id, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'));
  update public.auction_lots set current_bid = p_amount, leading_team_id = t.id, bid_count = bid_count + 1 where id = l.id;
  e := public._auction_event(v_tid, 'bid_placed', l.id, t.id, l.player_id, p_amount,
         format('%s bid %s for %s', t.name, public._fmt_money(v_tid, p_amount), l.player_name),
         jsonb_build_object('sequence', v_seq));
  return public._auction_result(v_tid, l.id, t.id, e, jsonb_build_object('duplicate', false));
end $$;

create or replace function public.undo_last_bid(p_lot_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; l public.auction_lots; b public.auction_bids; prev public.auction_bids;
        e public.auction_events; v_team text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  l := public._lock_live_lot(v_tid, p_lot_id);
  select * into b from public.auction_bids where lot_id = l.id and not is_voided order by sequence desc limit 1;
  if not found then perform public.raise_err('NOTHING_TO_UNDO', '{}'); end if;
  update public.auction_bids set is_voided = true, voided_at = now(), voided_by = auth.uid() where id = b.id;
  select * into prev from public.auction_bids where lot_id = l.id and not is_voided order by sequence desc limit 1;
  update public.auction_lots
     set current_bid = prev.amount, leading_team_id = prev.team_id, bid_count = greatest(bid_count - 1, 0)
   where id = l.id;
  select name into v_team from public.teams where id = b.team_id;
  e := public._auction_event(v_tid, 'bid_undone', l.id, b.team_id, l.player_id, b.amount,
         format('Bid of %s by %s withdrawn', public._fmt_money(v_tid, b.amount), v_team),
         jsonb_build_object('sequence', b.sequence));
  return public._auction_result(v_tid, l.id, prev.team_id, e);
end $$;

create or replace function public.mark_sold(p_lot_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; l public.auction_lots; t public.teams; s public.auction_settings;
        tx public.auction_transactions; e public.auction_events; v_order int; v_squad int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  l := public._lock_live_lot(v_tid, p_lot_id);
  if l.current_bid is null or l.leading_team_id is null then perform public.raise_err('SOLD_WITHOUT_BID', '{}'); end if;
  select * into t from public.teams where id = l.leading_team_id for update;
  perform 1 from public.players where id = l.player_id for update;
  select * into s from public.auction_settings where tournament_id = v_tid;
  v_squad := public.team_squad_count(t.id);
  if t.purse_remaining < l.current_bid or v_squad >= s.max_squad_size then
    perform public.raise_err('SALE_INVALID', jsonb_build_object('team', t.name, 'purse_remaining', t.purse_remaining,
      'price', l.current_bid, 'squad_count', v_squad, 'max', s.max_squad_size));
  end if;
  if l.player_id is null then perform public.raise_err('SALE_INVALID', jsonb_build_object('reason', 'Player was deleted')); end if;
  select coalesce(max(purchase_order), 0) + 1 into v_order from public.auction_transactions where tournament_id = v_tid;
  update public.auction_lots set status = 'sold', closed_at = now(), closed_by = auth.uid() where id = l.id;
  insert into public.auction_transactions (tournament_id, lot_id, player_id, team_id, player_name, player_photo_path,
                                           primary_position, secondary_position, price, purchase_order, kind, created_by)
  values (v_tid, l.id, l.player_id, t.id, l.player_name, l.player_photo_path, l.primary_position, l.secondary_position,
          l.current_bid, v_order, 'auction', auth.uid())
  returning * into tx;
  insert into public.team_players (tournament_id, team_id, player_id, source, price, purchase_order, transaction_id)
  values (v_tid, t.id, l.player_id, 'auction', l.current_bid, v_order, tx.id);
  update public.teams set purse_spent = purse_spent + l.current_bid where id = t.id;
  update public.players set status = 'sold' where id = l.player_id;
  update public.auction_state set current_lot_id = null, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'sold', l.id, t.id, l.player_id, l.current_bid,
         format('%s SOLD to %s for %s', l.player_name, t.name, public._fmt_money(v_tid, l.current_bid)),
         jsonb_build_object('purchase_order', v_order, 'transaction_id', tx.id));
  return public._auction_result(v_tid, l.id, t.id, e, jsonb_build_object('transaction', to_jsonb(tx)));
end $$;

create or replace function public.mark_unsold(p_lot_id uuid, p_discard_bids boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; l public.auction_lots; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  perform public._require_live(st);
  l := public._lock_live_lot(v_tid, p_lot_id);
  if l.bid_count > 0 and not coalesce(p_discard_bids, false) then
    perform public.raise_err('BIDS_EXIST', jsonb_build_object('bid_count', l.bid_count));
  end if;
  perform 1 from public.players where id = l.player_id for update;
  update public.auction_bids set is_voided = true, voided_at = now(), voided_by = auth.uid() where lot_id = l.id and not is_voided;
  update public.auction_lots set status = 'unsold', closed_at = now(), closed_by = auth.uid(),
         current_bid = null, leading_team_id = null, bid_count = 0 where id = l.id;
  update public.players set status = 'unsold' where id = l.player_id;
  update public.auction_state set current_lot_id = null, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'unsold', l.id, null, l.player_id, null, format('%s went UNSOLD', l.player_name), '{}');
  return public._auction_result(v_tid, l.id, null, e);
end $$;

create or replace function public.cancel_lot(p_lot_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; l public.auction_lots; e public.auction_events;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.status not in ('live','paused') then perform public.raise_err('AUCTION_NOT_LIVE', jsonb_build_object('status', st.status)); end if;
  l := public._lock_live_lot(v_tid, p_lot_id);
  update public.auction_bids set is_voided = true, voided_at = now(), voided_by = auth.uid() where lot_id = l.id and not is_voided;
  update public.auction_lots set status = 'cancelled', closed_at = now(), closed_by = auth.uid(),
         current_bid = null, leading_team_id = null, bid_count = 0 where id = l.id;
  update public.auction_state set current_lot_id = null, updated_by = auth.uid() where tournament_id = v_tid;
  e := public._auction_event(v_tid, 'lot_cancelled', l.id, null, l.player_id, null,
         format('Lot %s (%s) was cancelled', l.lot_number, l.player_name), '{}');
  return public._auction_result(v_tid, l.id, null, e);
end $$;

-- ---------------------------------------------------------------------------
-- Corrections (5.4)
-- ---------------------------------------------------------------------------
create or replace function public._do_reverse(p_tx public.auction_transactions, p_reason text, p_return_status public.player_status)
returns public.auction_events
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_team text;
begin
  delete from public.team_players where transaction_id = p_tx.id or (player_id = p_tx.player_id and source <> 'icon');
  update public.teams set purse_spent = purse_spent - p_tx.price where id = p_tx.team_id;
  update public.auction_transactions set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = p_reason
   where id = p_tx.id;
  update public.players set status = p_return_status where id = p_tx.player_id;
  select name into v_team from public.teams where id = p_tx.team_id;
  return public._auction_event(p_tx.tournament_id, 'sale_reversed', p_tx.lot_id, p_tx.team_id, p_tx.player_id, p_tx.price,
           format('Sale of %s to %s (%s) was reversed', p_tx.player_name, v_team, public._fmt_money(p_tx.tournament_id, p_tx.price)),
           jsonb_build_object('transaction_id', p_tx.id, 'reason', p_reason));
end $$;

create or replace function public.reverse_sale(p_transaction_id uuid, p_reason text, p_return_status public.player_status default 'available')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; tx public.auction_transactions; e public.auction_events; v_reason text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  v_reason := public.clean_text(p_reason);
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  if p_return_status not in ('available','unsold') then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"return_status":"Must be available or unsold"}}');
  end if;
  select * into tx from public.auction_transactions where id = p_transaction_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"transaction"}'); end if;
  if tx.status <> 'active' then perform public.raise_err('TXN_NOT_ACTIVE', jsonb_build_object('status', tx.status)); end if;
  perform 1 from public.teams where id = tx.team_id for update;
  perform 1 from public.players where id = tx.player_id for update;
  e := public._do_reverse(tx, v_reason, p_return_status);
  return public._auction_result(v_tid, tx.lot_id, tx.team_id, e);
end $$;

create or replace function public.reassign_player(p_player_id uuid, p_to_team_id uuid, p_price bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; p public.players; tx public.auction_transactions; t public.teams;
        s public.auction_settings; e public.auction_events; ntx public.auction_transactions;
        v_reason text; v_squad int; v_remaining bigint; v_order int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  v_reason := public.clean_text(p_reason);
  if v_reason is null or char_length(v_reason) > 200 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"reason":"A reason of 1 to 200 characters is required"}}');
  end if;
  if p_price is null or p_price < 0 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"price":"Price must be 0 or more"}}'); end if;
  select * into p from public.players where id = p_player_id and tournament_id = v_tid;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
  if p.status = 'icon' then perform public.raise_err('PLAYER_IS_ICON', '{}'); end if;
  if public._is_on_live_lot(p.id) then perform public.raise_err('PLAYER_ON_LIVE_LOT', '{}'); end if;
  select * into tx from public.auction_transactions where player_id = p.id and status = 'active';
  -- Lock teams in ascending id, then the player.
  perform 1 from public.teams where id in (p_to_team_id, tx.team_id) order by id for update;
  select * into t from public.teams where id = p_to_team_id and tournament_id = v_tid;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  perform 1 from public.players where id = p.id for update;
  select * into s from public.auction_settings where tournament_id = v_tid;
  v_squad := public.team_squad_count(t.id);
  v_remaining := t.purse_remaining;
  if tx.id is not null and tx.team_id = t.id then
    v_squad := v_squad - 1;
    v_remaining := v_remaining + tx.price;
  end if;
  if v_squad >= s.max_squad_size then
    perform public.raise_err('TEAM_SQUAD_FULL', jsonb_build_object('team', t.name, 'squad_count', v_squad, 'max', s.max_squad_size));
  end if;
  if p_price > v_remaining then
    perform public.raise_err('BID_EXCEEDS_PURSE', jsonb_build_object('max_bid', v_remaining, 'team', t.name));
  end if;
  if tx.id is not null then
    perform public._do_reverse(tx, v_reason, 'available');
  end if;
  select coalesce(max(purchase_order), 0) + 1 into v_order from public.auction_transactions where tournament_id = v_tid;
  insert into public.auction_transactions (tournament_id, lot_id, player_id, team_id, player_name, player_photo_path,
                                           primary_position, secondary_position, price, purchase_order, kind, created_by)
  values (v_tid, null, p.id, t.id, p.full_name, p.photo_path, p.primary_position, p.secondary_position, p_price, v_order, 'manual', auth.uid())
  returning * into ntx;
  insert into public.team_players (tournament_id, team_id, player_id, source, price, purchase_order, transaction_id)
  values (v_tid, t.id, p.id, 'manual', p_price, v_order, ntx.id);
  update public.teams set purse_spent = purse_spent + p_price where id = t.id;
  update public.players set status = 'sold' where id = p.id;
  e := public._auction_event(v_tid, 'player_reassigned', null, t.id, p.id, p_price,
         format('%s assigned to %s for %s', p.full_name, t.name, public._fmt_money(v_tid, p_price)),
         jsonb_build_object('transaction_id', ntx.id, 'reason', v_reason, 'previous_transaction_id', tx.id));
  return public._auction_result(v_tid, null, t.id, e, jsonb_build_object('transaction', to_jsonb(ntx)));
end $$;

create or replace function public.set_team_purse(p_team_id uuid, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; t public.teams; v_lead bigint := 0;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if st.current_lot_id is not null then
    select coalesce(current_bid, 0) into v_lead from public.auction_lots where id = st.current_lot_id and leading_team_id = p_team_id;
    v_lead := coalesce(v_lead, 0);
  end if;
  select * into t from public.teams where id = p_team_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  if p_amount is null or p_amount < t.purse_spent + v_lead then
    perform public.raise_err('PURSE_BELOW_SPENT', jsonb_build_object('minimum', t.purse_spent + v_lead));
  end if;
  update public.teams set purse_total = p_amount where id = t.id;
  return jsonb_build_object('team', (select to_jsonb(f) from public.v_team_finance f where f.team_id = t.id));
end $$;

-- ---------------------------------------------------------------------------
-- Settings (5.8)
-- ---------------------------------------------------------------------------
create or replace function public.save_auction_settings(p_settings jsonb, p_tiers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; cur public.auction_settings; n public.auction_settings;
        v_errors jsonb := '{}'::jsonb; v_max_squad int; v_tier jsonb; v_prev bigint := -1; v_spent bigint;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  select * into cur from public.auction_settings where tournament_id = v_tid for update;
  n := cur;
  begin
    n.purse_per_team := coalesce((p_settings->>'purse_per_team')::bigint, cur.purse_per_team);
    n.default_base_price := coalesce((p_settings->>'default_base_price')::bigint, cur.default_base_price);
    n.min_squad_size := coalesce((p_settings->>'min_squad_size')::smallint, cur.min_squad_size);
    n.max_squad_size := coalesce((p_settings->>'max_squad_size')::smallint, cur.max_squad_size);
    n.icon_counts_in_squad := coalesce((p_settings->>'icon_counts_in_squad')::boolean, cur.icon_counts_in_squad);
    n.reserve_per_slot := coalesce((p_settings->>'reserve_per_slot')::bigint, cur.reserve_per_slot);
    n.max_rounds := coalesce((p_settings->>'max_rounds')::smallint, cur.max_rounds);
    n.unsold_rule := coalesce((p_settings->>'unsold_rule')::public.unsold_rule, cur.unsold_rule);
    n.unsold_base_price_reduction_pct := coalesce((p_settings->>'unsold_base_price_reduction_pct')::smallint, cur.unsold_base_price_reduction_pct);
  exception when others then
    perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('settings', 'A value has the wrong type')));
  end;
  if n.purse_per_team <= 0 then v_errors := v_errors || '{"purse_per_team":"Must be greater than 0"}'; end if;
  if n.default_base_price <= 0 then v_errors := v_errors || '{"default_base_price":"Must be greater than 0"}'; end if;
  if n.min_squad_size < 1 then v_errors := v_errors || '{"min_squad_size":"Must be at least 1"}'; end if;
  if n.max_squad_size < n.min_squad_size then v_errors := v_errors || '{"max_squad_size":"Must be at least the minimum squad size"}'; end if;
  if n.reserve_per_slot < 0 then v_errors := v_errors || '{"reserve_per_slot":"Must be 0 or more"}'; end if;
  if n.max_rounds not between 1 and 10 then v_errors := v_errors || '{"max_rounds":"Must be 1 to 10"}'; end if;
  if n.unsold_base_price_reduction_pct not between 0 and 90 then v_errors := v_errors || '{"unsold_base_price_reduction_pct":"Must be 0 to 90"}'; end if;
  if p_tiers is not null then
    if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
      v_errors := v_errors || '{"tiers":"At least one tier is required"}';
    else
      if (p_tiers->0->>'from_amount')::bigint is distinct from 0 then
        v_errors := v_errors || '{"tiers":"The first tier must start at 0"}';
      end if;
      for v_tier in select * from jsonb_array_elements(p_tiers) loop
        if (v_tier->>'from_amount')::bigint <= v_prev then v_errors := v_errors || '{"tiers":"Tier starting amounts must strictly increase"}'; end if;
        if coalesce((v_tier->>'step')::bigint, 0) <= 0 then v_errors := v_errors || '{"tiers":"Every step must be greater than 0"}'; end if;
        v_prev := (v_tier->>'from_amount')::bigint;
      end loop;
    end if;
  end if;
  if v_errors <> '{}'::jsonb then perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', v_errors)); end if;

  select coalesce(max(c), 0) into v_max_squad from (
    select count(*) c from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.tournament_id = v_tid and (tp.source <> 'icon' or n.icon_counts_in_squad) group by tp.team_id) x;
  if n.max_squad_size < v_max_squad then
    perform public.raise_err('SETTINGS_CONFLICT', jsonb_build_object('field', 'max_squad_size', 'largest_squad', v_max_squad));
  end if;
  if n.max_rounds < st.current_round then
    perform public.raise_err('SETTINGS_CONFLICT', jsonb_build_object('field', 'max_rounds', 'current_round', st.current_round));
  end if;
  if st.status = 'not_started' and n.purse_per_team <> cur.purse_per_team then
    select coalesce(max(purse_spent), 0) into v_spent from public.teams where tournament_id = v_tid;
    if n.purse_per_team < v_spent then
      perform public.raise_err('SETTINGS_CONFLICT', jsonb_build_object('field', 'purse_per_team', 'largest_spent', v_spent));
    end if;
    update public.teams set purse_total = n.purse_per_team where tournament_id = v_tid;
  end if;

  update public.auction_settings set
    purse_per_team = n.purse_per_team, default_base_price = n.default_base_price, min_squad_size = n.min_squad_size,
    max_squad_size = n.max_squad_size, icon_counts_in_squad = n.icon_counts_in_squad, reserve_per_slot = n.reserve_per_slot,
    max_rounds = n.max_rounds, unsold_rule = n.unsold_rule, unsold_base_price_reduction_pct = n.unsold_base_price_reduction_pct
  where tournament_id = v_tid;
  if p_tiers is not null then
    delete from public.auction_increment_tiers where tournament_id = v_tid;
    insert into public.auction_increment_tiers (tournament_id, from_amount, step)
    select v_tid, (x->>'from_amount')::bigint, (x->>'step')::bigint from jsonb_array_elements(p_tiers) x;
  end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(a) from public.auction_settings a where a.tournament_id = v_tid),
    'tiers', (select jsonb_agg(to_jsonb(x) order by x.from_amount) from public.auction_increment_tiers x where x.tournament_id = v_tid));
end $$;

-- ---------------------------------------------------------------------------
-- Icon players, player status, deletes, import (6.1 to 6.5)
-- ---------------------------------------------------------------------------
create or replace function public.set_icon_player(p_team_id uuid, p_slot int, p_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; t public.teams; p public.players; s public.auction_settings;
        cur public.team_players; other public.team_players; v_squad int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if p_slot not in (1, 2) then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"slot":"Slot must be 1 or 2"}}'); end if;
  select * into t from public.teams where id = p_team_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  select * into cur from public.team_players where team_id = t.id and icon_slot = p_slot;
  select * into other from public.team_players where team_id = t.id and icon_slot = 3 - p_slot;
  if p_player_id is not null then
    select * into p from public.players where id = p_player_id and tournament_id = v_tid for update;
    if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
    if cur.player_id = p.id then
      return jsonb_build_object('team_id', t.id, 'slot', p_slot, 'player_id', p.id, 'unchanged', true);
    end if;
    if public._is_on_live_lot(p.id) then perform public.raise_err('PLAYER_ON_LIVE_LOT', '{}'); end if;
    if other.player_id = p.id then
      perform public.raise_err('ICON_PLAYER_INVALID', '{"reason":"Already this team''s other icon player"}');
    end if;
    if p.status not in ('available','unsold') then
      perform public.raise_err('ICON_PLAYER_INVALID', jsonb_build_object('reason', 'Player is ' || p.status::text));
    end if;
  end if;
  -- Release the current occupant of the slot.
  if cur.id is not null then
    delete from public.team_players where id = cur.id;
    update public.players set status = 'available' where id = cur.player_id;
  end if;
  if p_player_id is not null then
    select * into s from public.auction_settings where tournament_id = v_tid;
    v_squad := public.team_squad_count(t.id);
    if s.icon_counts_in_squad and v_squad >= s.max_squad_size then
      perform public.raise_err('TEAM_SQUAD_FULL', jsonb_build_object('team', t.name, 'squad_count', v_squad, 'max', s.max_squad_size));
    end if;
    insert into public.team_players (tournament_id, team_id, player_id, source, icon_slot, price)
    values (v_tid, t.id, p.id, 'icon', p_slot, 0);
    update public.players set status = 'icon' where id = p.id;
  end if;
  return jsonb_build_object('team_id', t.id, 'slot', p_slot, 'player_id', p_player_id, 'released_player_id', cur.player_id);
end $$;

create or replace function public.set_player_status(p_player_id uuid, p_status public.player_status) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; p public.players;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if p_status not in ('available','unsold') then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"status":"Only available or unsold can be set by hand"}}');
  end if;
  select * into p from public.players where id = p_player_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
  if public._is_on_live_lot(p.id) then perform public.raise_err('PLAYER_ON_LIVE_LOT', '{}'); end if;
  if p.status = 'sold' then perform public.raise_err('PLAYER_IS_SOLD', '{}'); end if;
  if p.status = 'icon' then perform public.raise_err('PLAYER_IS_ICON', '{}'); end if;
  update public.players set status = p_status where id = p.id returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.delete_player(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; p public.players;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  select * into p from public.players where id = p_player_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
  if public._is_on_live_lot(p.id) then perform public.raise_err('PLAYER_ON_LIVE_LOT', '{}'); end if;
  if p.status = 'sold' then perform public.raise_err('PLAYER_IS_SOLD', '{}'); end if;
  if p.status = 'icon' then perform public.raise_err('PLAYER_IS_ICON', '{}'); end if;
  delete from public.players where id = p.id;
  return jsonb_build_object('deleted', p.id, 'photo_path', p.photo_path);
end $$;

create or replace function public.delete_team(p_team_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; t public.teams; v_reasons text[] := '{}'; v_owner_photo text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  select * into t from public.teams where id = p_team_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  if exists (select 1 from public.fixtures where home_team_id = t.id or away_team_id = t.id) then v_reasons := v_reasons || 'fixtures'::text; end if;
  if exists (select 1 from public.team_players where team_id = t.id and source <> 'icon') then v_reasons := v_reasons || 'roster purchases'::text; end if;
  if exists (select 1 from public.auction_bids where team_id = t.id) then v_reasons := v_reasons || 'auction bids'::text; end if;
  if exists (select 1 from public.auction_transactions where team_id = t.id) then v_reasons := v_reasons || 'auction transactions'::text; end if;
  if exists (select 1 from public.auction_lots where leading_team_id = t.id) then v_reasons := v_reasons || 'auction lots'::text; end if;
  if cardinality(v_reasons) > 0 then perform public.raise_err('TEAM_HAS_HISTORY', jsonb_build_object('reasons', to_jsonb(v_reasons))); end if;
  update public.players set status = 'available'
   where id in (select player_id from public.team_players where team_id = t.id and source = 'icon');
  delete from public.team_players where team_id = t.id;
  select photo_path into v_owner_photo from public.team_owners where team_id = t.id;
  delete from public.teams where id = t.id;
  return jsonb_build_object('deleted', t.id, 'logo_path', t.logo_path, 'owner_photo_path', v_owner_photo);
end $$;

create or replace function public.bulk_set_base_price(p_amount bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; v_n int;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  if p_amount is null or p_amount < 1 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"amount":"Must be at least 1"}}'); end if;
  update public.players set base_price = p_amount
   where tournament_id = v_tid and status = 'available' and not public._is_on_live_lot(id);
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n);
end $$;

-- Rows: [{row_number, full_name, primary_position, secondary_position, age, height_cm, jersey_number, description, base_price}]
create or replace function public.import_players(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; r jsonb; v_bad jsonb := '[]'::jsonb; v_n int := 0; v_default bigint; v_idx int := 0;
        v_name text; v_pp public.player_position; v_sp public.player_position; v_reason text;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    perform public.raise_err('IMPORT_INVALID', '{"reason":"No rows"}');
  end if;
  if jsonb_array_length(p_rows) > 1000 then perform public.raise_err('IMPORT_INVALID', '{"reason":"At most 1000 rows"}'); end if;
  select default_base_price into v_default from public.auction_settings where tournament_id = v_tid;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_reason := null;
    begin
      v_name := public.clean_text(r->>'full_name');
      v_pp := (r->>'primary_position')::public.player_position;
      v_sp := nullif(r->>'secondary_position', '')::public.player_position;
      if v_name is null or char_length(v_name) > 80 then v_reason := 'Name must be 1 to 80 characters';
      elsif v_pp is null then v_reason := 'Primary position is required';
      elsif v_sp = v_pp then v_reason := 'Secondary position must differ from primary';
      elsif (r->>'age') is not null and (r->>'age')::int not between 10 and 70 then v_reason := 'Age must be 10 to 70';
      elsif (r->>'height_cm') is not null and (r->>'height_cm')::int not between 120 and 250 then v_reason := 'Height must be 120 to 250 cm';
      elsif (r->>'jersey_number') is not null and (r->>'jersey_number')::int not between 0 and 99 then v_reason := 'Jersey must be 0 to 99';
      elsif (r->>'base_price') is not null and (r->>'base_price')::bigint < 1 then v_reason := 'Base price must be at least 1';
      elsif char_length(coalesce(r->>'description', '')) > 280 then v_reason := 'Description is too long';
      end if;
    exception when others then
      v_reason := 'Invalid value';
    end;
    if v_reason is not null then
      v_bad := v_bad || jsonb_build_object('row', coalesce((r->>'row_number')::int, v_idx), 'reason', v_reason);
      continue;
    end if;
    insert into public.players (tournament_id, full_name, primary_position, secondary_position, age, height_cm,
                                jersey_number, description, base_price)
    values (v_tid, v_name, v_pp, v_sp, (r->>'age')::smallint, (r->>'height_cm')::smallint, (r->>'jersey_number')::smallint,
            nullif(r->>'description', ''), coalesce((r->>'base_price')::bigint, v_default));
    v_n := v_n + 1;
  end loop;
  if jsonb_array_length(v_bad) > 0 then
    perform public.raise_err('IMPORT_INVALID', jsonb_build_object('rows', v_bad));
  end if;
  return jsonb_build_object('inserted', v_n);
end $$;

-- 0009_admin_force_delete.sql
-- Gives administrators full freedom to delete players, teams and matches.
-- The safe default (refuse when history exists) is unchanged; passing p_force = true deletes anyway and
-- cleans up everything that depends on the row in the same transaction: live lots are cancelled, sales are
-- reversed and refunded, results are removed, and standings and the playoff bracket are recalculated.

-- A deleted team takes its own bids and (already reversed) transactions with it; closed lots keep their snapshots.
alter table public.auction_bids drop constraint auction_bids_team_id_fkey,
  add constraint auction_bids_team_id_fkey foreign key (team_id) references public.teams on delete cascade;
alter table public.auction_lots drop constraint auction_lots_leading_team_id_fkey,
  add constraint auction_lots_leading_team_id_fkey foreign key (leading_team_id) references public.teams on delete set null;
alter table public.auction_transactions drop constraint auction_transactions_team_id_fkey,
  add constraint auction_transactions_team_id_fkey foreign key (team_id) references public.teams on delete cascade;

-- Cancels the live lot (if any) without touching the player. Caller holds the auction_state lock.
create or replace function public._force_cancel_live_lot(p_tid uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.auction_lots;
begin
  select * into l from public.auction_lots where tournament_id = p_tid and status = 'live' for update;
  if not found then return; end if;
  update public.auction_bids set is_voided = true, voided_at = now(), voided_by = auth.uid() where lot_id = l.id and not is_voided;
  update public.auction_lots set status = 'cancelled', closed_at = now(), closed_by = auth.uid(),
         current_bid = null, leading_team_id = null, bid_count = 0 where id = l.id;
  update public.auction_state set current_lot_id = null, updated_by = auth.uid() where tournament_id = p_tid;
  perform public._auction_event(p_tid, 'lot_cancelled', l.id, null, l.player_id, null,
    format('Lot %s (%s) was cancelled: %s', l.lot_number, l.player_name, p_reason), '{}');
end $$;

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
drop function if exists public.delete_player(uuid);
create or replace function public.delete_player(p_player_id uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; p public.players; tx public.auction_transactions; v_refunded bigint := 0;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  select * into p from public.players where id = p_player_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"player"}'); end if;
  if not coalesce(p_force, false) then
    if public._is_on_live_lot(p.id) then perform public.raise_err('PLAYER_ON_LIVE_LOT', '{}'); end if;
    if p.status = 'sold' then perform public.raise_err('PLAYER_IS_SOLD', '{}'); end if;
    if p.status = 'icon' then perform public.raise_err('PLAYER_IS_ICON', '{}'); end if;
  else
    if public._is_on_live_lot(p.id) then perform public._force_cancel_live_lot(v_tid, 'player deleted'); end if;
    for tx in select * from public.auction_transactions where player_id = p.id and status = 'active' for update loop
      perform 1 from public.teams where id = tx.team_id for update;
      perform public._do_reverse(tx, 'Player deleted by admin', 'available');
      v_refunded := v_refunded + tx.price;
    end loop;
    delete from public.team_players where player_id = p.id;
  end if;
  delete from public.players where id = p.id;
  return jsonb_build_object('deleted', p.id, 'photo_path', p.photo_path, 'refunded', v_refunded, 'was_status', p.status);
end $$;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
drop function if exists public.delete_team(uuid);
create or replace function public.delete_team(p_team_id uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; st public.auction_state; t public.teams; v_reasons text[] := '{}'; v_owner_photo text;
        tx public.auction_transactions; v_fx int := 0; v_players int := 0; f record; v_bracket uuid;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  st := public._lock_auction(v_tid);
  select * into t from public.teams where id = p_team_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"team"}'); end if;
  if not coalesce(p_force, false) then
    if exists (select 1 from public.fixtures where home_team_id = t.id or away_team_id = t.id) then v_reasons := v_reasons || 'fixtures'::text; end if;
    if exists (select 1 from public.team_players where team_id = t.id and source <> 'icon') then v_reasons := v_reasons || 'roster purchases'::text; end if;
    if exists (select 1 from public.auction_bids where team_id = t.id) then v_reasons := v_reasons || 'auction bids'::text; end if;
    if exists (select 1 from public.auction_transactions where team_id = t.id) then v_reasons := v_reasons || 'auction transactions'::text; end if;
    if exists (select 1 from public.auction_lots where leading_team_id = t.id) then v_reasons := v_reasons || 'auction lots'::text; end if;
    if cardinality(v_reasons) > 0 then perform public.raise_err('TEAM_HAS_HISTORY', jsonb_build_object('reasons', to_jsonb(v_reasons))); end if;
  else
    -- 1. A live lot this team is bidding on is cancelled (the player stays available).
    if exists (select 1 from public.auction_lots l join public.auction_bids b on b.lot_id = l.id
               where l.tournament_id = v_tid and l.status = 'live' and b.team_id = t.id) then
      perform public._force_cancel_live_lot(v_tid, format('%s was deleted', t.name));
    end if;
    -- 2. Every purchase is reversed: players return to the pool as available.
    for tx in select * from public.auction_transactions where team_id = t.id and status = 'active' for update loop
      perform public._do_reverse(tx, 'Team deleted by admin', 'available');
      v_players := v_players + 1;
    end loop;
    -- 3. League matches involving the team are deleted (results, live state and events go with them).
    delete from public.fixtures where tournament_id = v_tid and stage = 'league' and (home_team_id = t.id or away_team_id = t.id);
    get diagnostics v_fx = row_count;
    -- 4. Playoff matches involving the team are reset to upcoming with an empty slot.
    for f in select id from public.fixtures where tournament_id = v_tid and stage = 'playoff'
               and (home_team_id = t.id or away_team_id = t.id) for update loop
      delete from public.match_results where fixture_id = f.id;
      delete from public.match_states where fixture_id = f.id;
      delete from public.live_scoring_events where fixture_id = f.id;
      update public.fixtures set status = 'upcoming', postponed_reason = null,
             home_team_id = nullif(home_team_id, t.id), away_team_id = nullif(away_team_id, t.id)
       where id = f.id;
    end loop;
    update public.playoff_brackets set seeds = coalesce((select jsonb_agg(s) from jsonb_array_elements(seeds) s where s->>'team_id' <> t.id::text), '[]')
     where tournament_id = v_tid and seeds @> jsonb_build_array(jsonb_build_object('team_id', t.id));
  end if;
  -- Icon players are released.
  update public.players set status = 'available'
   where id in (select player_id from public.team_players where team_id = t.id and source = 'icon');
  delete from public.team_players where team_id = t.id;
  select photo_path into v_owner_photo from public.team_owners where team_id = t.id;
  delete from public.teams where id = t.id;
  perform public.recalculate_standings(v_tid);
  select id into v_bracket from public.playoff_brackets where tournament_id = v_tid;
  if v_bracket is not null then perform public.resolve_bracket(v_bracket); end if;
  return jsonb_build_object('deleted', t.id, 'logo_path', t.logo_path, 'owner_photo_path', v_owner_photo,
    'fixtures_deleted', v_fx, 'players_released', v_players);
end $$;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
drop function if exists public.delete_fixture(uuid);
create or replace function public.delete_fixture(p_fixture_id uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; f public.fixtures;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  select * into f from public.fixtures where id = p_fixture_id and tournament_id = v_tid for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"fixture"}'); end if;
  if not coalesce(p_force, false) then
    if f.stage <> 'league' or f.status not in ('upcoming','postponed')
       or exists (select 1 from public.match_states where fixture_id = f.id) then
      perform public.raise_err('FIXTURE_NOT_EDITABLE', jsonb_build_object('status', f.status, 'stage', f.stage));
    end if;
  end if;
  if f.stage = 'playoff' then
    -- A playoff match belongs to the bracket, so "delete" clears its result and live state instead;
    -- teams are re-derived from the seeds and earlier results.
    delete from public.match_results where fixture_id = f.id;
    delete from public.match_states where fixture_id = f.id;
    delete from public.live_scoring_events where fixture_id = f.id;
    update public.fixtures set status = 'upcoming', postponed_reason = null where id = f.id;
    perform public.resolve_bracket((select bracket_id from public.playoff_nodes where fixture_id = f.id));
    return jsonb_build_object('reset', f.id);
  end if;
  delete from public.live_scoring_events where fixture_id = f.id;
  delete from public.fixtures where id = f.id;
  return jsonb_build_object('deleted', f.id, 'was_status', f.status);
end $$;

-- Privileges for the new signatures (same model as 0008).
revoke all on function public._force_cancel_live_lot(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_player(uuid, boolean) from public, anon;
revoke all on function public.delete_team(uuid, boolean) from public, anon;
revoke all on function public.delete_fixture(uuid, boolean) from public, anon;
grant execute on function public.delete_player(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_team(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_fixture(uuid, boolean) to authenticated, service_role;

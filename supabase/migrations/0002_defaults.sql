-- 0002_defaults.sql
-- Default rows. Idempotent: re-running this file never duplicates rows (12.1 item 12).

create or replace function public.active_tournament_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.tournaments where is_active limit 1
$$;

-- Creates any missing 1:1 child row of a tournament.
create or replace function public.ensure_tournament_children(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.auction_settings (tournament_id) values (p_tournament_id) on conflict do nothing;
  if not exists (select 1 from public.auction_increment_tiers where tournament_id = p_tournament_id) then
    insert into public.auction_increment_tiers (tournament_id, from_amount, step)
    values (p_tournament_id, 0, 100), (p_tournament_id, 2000, 250), (p_tournament_id, 5000, 500);
  end if;
  insert into public.auction_state (tournament_id) values (p_tournament_id) on conflict do nothing;
  insert into public.match_rules (tournament_id) values (p_tournament_id) on conflict do nothing;
  insert into public.points_settings (tournament_id) values (p_tournament_id) on conflict do nothing;
  insert into public.playoff_settings (tournament_id) values (p_tournament_id) on conflict do nothing;
  insert into public.playoff_brackets (tournament_id, status) values (p_tournament_id, 'not_generated') on conflict do nothing;
end $$;

do $$
declare v_id uuid;
begin
  select id into v_id from public.tournaments where is_active;
  if v_id is null then
    insert into public.tournaments (name, slug) values ('Basketball Tournament', 'basketball-tournament')
    returning id into v_id;
  end if;
  perform public.ensure_tournament_children(v_id);
end $$;

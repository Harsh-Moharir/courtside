-- 0003_security.sql
-- is_admin(), RLS, table and column privileges, storage buckets and policies (section 4).

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.administrators where user_id = auth.uid())
      -- Local maintenance scripts (seed, bootstrap) use the service-role key; it already bypasses RLS.
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501', detail = '{}';
  end if;
end $$;

-- Functions created later must not be executable by anon unless granted explicitly (see 0008).
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- Start from deny
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'administrators','tournaments','auction_settings','auction_increment_tiers','match_rules','points_settings',
    'playoff_settings','announcements','teams','team_owners','players','auction_lots','auction_bids',
    'auction_transactions','team_players','auction_state','auction_events','fixtures','match_states',
    'live_scoring_events','match_results','standings','playoff_brackets','playoff_nodes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

revoke select on public.administrators from anon;

-- ---------------------------------------------------------------------------
-- Read policies (4.2)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tournaments','auction_settings','auction_increment_tiers','match_rules','points_settings',
    'playoff_settings','teams','team_owners','players','auction_lots','team_players','auction_state',
    'auction_events','fixtures','match_states','match_results','standings','playoff_brackets','playoff_nodes']
  loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;

create policy administrators_read on public.administrators for select to authenticated using (public.is_admin());
create policy announcements_read on public.announcements for select to anon, authenticated
  using (published_at <= now() or public.is_admin());
create policy auction_bids_read on public.auction_bids for select to anon, authenticated
  using (not is_voided or public.is_admin());
create policy auction_transactions_read on public.auction_transactions for select to anon, authenticated
  using (status = 'active' or public.is_admin());
create policy live_scoring_events_read on public.live_scoring_events for select to anon, authenticated
  using (not is_voided or public.is_admin());

-- ---------------------------------------------------------------------------
-- Direct writes, admin only, with column-level grants (4.2)
-- ---------------------------------------------------------------------------
grant update (name, tagline, logo_path, banner_path, timezone, currency_symbol, venue_default, phase, featured_fixture_id)
  on public.tournaments to authenticated;
create policy tournaments_admin_update on public.tournaments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant insert (tournament_id, name, short_name, logo_path, primary_color, secondary_color, manual_tiebreak_rank, sort_order)
  on public.teams to authenticated;
grant update (name, short_name, logo_path, primary_color, secondary_color, manual_tiebreak_rank, sort_order)
  on public.teams to authenticated;
create policy teams_admin_insert on public.teams for insert to authenticated
  with check (public.is_admin() and tournament_id = public.active_tournament_id());
create policy teams_admin_update on public.teams for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant insert, update, delete on public.team_owners to authenticated;
create policy team_owners_admin_insert on public.team_owners for insert to authenticated
  with check (public.is_admin() and tournament_id = public.active_tournament_id());
create policy team_owners_admin_update on public.team_owners for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy team_owners_admin_delete on public.team_owners for delete to authenticated
  using (public.is_admin());

grant insert (tournament_id, full_name, photo_path, age, height_cm, primary_position, secondary_position, jersey_number, description, base_price)
  on public.players to authenticated;
grant update (full_name, photo_path, age, height_cm, primary_position, secondary_position, jersey_number, description, base_price)
  on public.players to authenticated;
create policy players_admin_insert on public.players for insert to authenticated
  with check (public.is_admin() and tournament_id = public.active_tournament_id());
create policy players_admin_update on public.players for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant insert (id, tournament_id, title, body, is_pinned, published_at) on public.announcements to authenticated;
grant update (title, body, is_pinned, published_at) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;
create policy announcements_admin_insert on public.announcements for insert to authenticated
  with check (public.is_admin() and tournament_id = public.active_tournament_id());
create policy announcements_admin_update on public.announcements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy announcements_admin_delete on public.announcements for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage (4.4)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('team-logos', 'team-logos', true, 2097152, array['image/png','image/jpeg','image/webp']),
  ('player-photos', 'player-photos', true, 2097152, array['image/png','image/jpeg','image/webp']),
  ('tournament-assets', 'tournament-assets', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "courtside public read" on storage.objects for select to anon, authenticated
  using (bucket_id in ('team-logos','player-photos','tournament-assets'));
create policy "courtside admin insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('team-logos','player-photos','tournament-assets') and public.is_admin());
create policy "courtside admin update" on storage.objects for update to authenticated
  using (bucket_id in ('team-logos','player-photos','tournament-assets') and public.is_admin())
  with check (bucket_id in ('team-logos','player-photos','tournament-assets') and public.is_admin());
create policy "courtside admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('team-logos','player-photos','tournament-assets') and public.is_admin());

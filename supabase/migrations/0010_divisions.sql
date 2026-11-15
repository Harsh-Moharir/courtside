-- 0010_divisions.sql
-- Divisions (for example Men and Women) on one website. Each division is a tournament row, so every existing rule
-- (auction, purse, 10-team limit, fixtures, live scoring, standings, playoffs, champion) already works per division.
--
-- How the current division is chosen: the app sends an `x-division: <tournament id>` request header (from a cookie).
--   * active_tournament_id() returns that division, or the default division when the header is missing.
--   * Read policies show only the current division's rows to API requests. Realtime (no request headers) is not
--     scoped, so every division's changes are delivered and pages refetch their own, scoped data.

alter table public.tournaments
  add column division_label text not null default 'Open' check (char_length(division_label) between 1 and 30),
  add column is_default boolean not null default false,
  add column sort_order smallint not null default 0;
drop index if exists public.tournaments_one_active;
create unique index tournaments_one_default on public.tournaments (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- Division resolution
-- ---------------------------------------------------------------------------
create or replace function public.request_division() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_raw text; v_hdr text; v_id uuid;
begin
  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is null then return null; end if;
  v_hdr := v_raw::json ->> 'x-division';
  if v_hdr is null or v_hdr !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select id into v_id from public.tournaments where id = v_hdr::uuid and is_active;
  return v_id;
exception when others then
  return null;
end $$;

create or replace function public.active_tournament_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.request_division(),
    (select id from public.tournaments where is_active order by is_default desc, sort_order, created_at limit 1))
$$;

-- The division API reads are scoped to; null means "not an API request" (realtime, SQL), which is not scoped.
create or replace function public.read_scope() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select case when nullif(current_setting('request.headers', true), '') is null then null
              else public.active_tournament_id() end
$$;

-- ---------------------------------------------------------------------------
-- Read policies scoped to the current division
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'auction_settings','auction_increment_tiers','match_rules','points_settings',
    'playoff_settings','teams','team_owners','players','auction_lots','team_players','auction_state',
    'auction_events','fixtures','match_states','match_results','standings','playoff_brackets','playoff_nodes']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (tournament_id = coalesce(public.read_scope(), tournament_id))', t || '_read', t);
  end loop;
end $$;

drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments for select to anon, authenticated
  using (id = coalesce(public.read_scope(), id));
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to anon, authenticated
  using (tournament_id = coalesce(public.read_scope(), tournament_id) and (published_at <= now() or public.is_admin()));
drop policy if exists auction_bids_read on public.auction_bids;
create policy auction_bids_read on public.auction_bids for select to anon, authenticated
  using (tournament_id = coalesce(public.read_scope(), tournament_id) and (not is_voided or public.is_admin()));
drop policy if exists auction_transactions_read on public.auction_transactions;
create policy auction_transactions_read on public.auction_transactions for select to anon, authenticated
  using (tournament_id = coalesce(public.read_scope(), tournament_id) and (status = 'active' or public.is_admin()));
drop policy if exists live_scoring_events_read on public.live_scoring_events;
create policy live_scoring_events_read on public.live_scoring_events for select to anon, authenticated
  using (tournament_id = coalesce(public.read_scope(), tournament_id) and (not is_voided or public.is_admin()));

-- ---------------------------------------------------------------------------
-- One brand for the whole event: name, tagline, logo, banner, time zone and currency are kept in sync
-- ---------------------------------------------------------------------------
create or replace function public.sync_tournament_branding() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 or not new.is_active then return null; end if;
  update public.tournaments set name = new.name, tagline = new.tagline, logo_path = new.logo_path, banner_path = new.banner_path,
         timezone = new.timezone, currency_symbol = new.currency_symbol
   where is_active and id <> new.id
     and (name, tagline, logo_path, banner_path, timezone, currency_symbol)
         is distinct from (new.name, new.tagline, new.logo_path, new.banner_path, new.timezone, new.currency_symbol);
  return null;
end $$;
create trigger tournaments_sync_branding after update of name, tagline, logo_path, banner_path, timezone, currency_symbol
  on public.tournaments for each row execute function public.sync_tournament_branding();

-- ---------------------------------------------------------------------------
-- Division RPCs
-- ---------------------------------------------------------------------------
create or replace function public.list_divisions() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', division_label, 'is_default', is_default, 'sort_order', sort_order)
                  order by sort_order, created_at), '[]'::jsonb)
  from public.tournaments where is_active
$$;

-- Division of a team, fixture or player (used so shared links open in the right division).
create or replace function public.division_of(p_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select t.tournament_id from public.teams t where t.id = p_id),
    (select f.tournament_id from public.fixtures f where f.id = p_id),
    (select p.tournament_id from public.players p where p.id = p_id))
$$;

create or replace function public.create_division(p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.tournaments; v_label text; v_id uuid; v_n int;
begin
  perform public.require_admin();
  v_label := public.clean_text(p_label);
  if v_label is null or char_length(v_label) > 30 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"label":"A name of 1 to 30 characters is required"}}');
  end if;
  if exists (select 1 from public.tournaments where is_active and lower(division_label) = lower(v_label)) then
    perform public.raise_err('CONFLICT', '{"reason":"A division with this name already exists"}');
  end if;
  select count(*) into v_n from public.tournaments where is_active;
  if v_n >= 6 then perform public.raise_err('CONFLICT', '{"reason":"At most 6 divisions"}'); end if;
  select * into d from public.tournaments where is_active order by is_default desc, sort_order, created_at limit 1;
  insert into public.tournaments (name, slug, tagline, logo_path, banner_path, timezone, currency_symbol, venue_default,
                                  is_active, division_label, sort_order)
  values (d.name, left(d.slug || '-' || regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g'), 50) || '-' || substr(md5(random()::text), 1, 5),
          d.tagline, d.logo_path, d.banner_path, d.timezone, d.currency_symbol, d.venue_default, true, v_label,
          (select coalesce(max(sort_order), 0) + 1 from public.tournaments where is_active))
  returning id into v_id;
  perform public.ensure_tournament_children(v_id);
  return jsonb_build_object('id', v_id, 'label', v_label);
end $$;

create or replace function public.rename_division(p_id uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_label text;
begin
  perform public.require_admin();
  v_label := public.clean_text(p_label);
  if v_label is null or char_length(v_label) > 30 then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"label":"A name of 1 to 30 characters is required"}}');
  end if;
  if exists (select 1 from public.tournaments where is_active and id <> p_id and lower(division_label) = lower(v_label)) then
    perform public.raise_err('CONFLICT', '{"reason":"A division with this name already exists"}');
  end if;
  update public.tournaments set division_label = v_label where id = p_id and is_active;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"division"}'); end if;
  return jsonb_build_object('id', p_id, 'label', v_label);
end $$;

create or replace function public.delete_division(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.tournaments;
begin
  perform public.require_admin();
  select * into d from public.tournaments where id = p_id and is_active for update;
  if not found then perform public.raise_err('NOT_FOUND', '{"entity":"division"}'); end if;
  if (select count(*) from public.tournaments where is_active) <= 1 then
    perform public.raise_err('CONFLICT', '{"reason":"The last division cannot be deleted"}');
  end if;
  if exists (select 1 from public.teams where tournament_id = p_id) or exists (select 1 from public.players where tournament_id = p_id)
     or exists (select 1 from public.fixtures where tournament_id = p_id) then
    perform public.raise_err('CONFLICT', '{"reason":"Delete this division''s teams, players and matches first"}');
  end if;
  delete from public.tournaments where id = p_id;
  if d.is_default then
    update public.tournaments set is_default = true
     where id = (select id from public.tournaments where is_active order by sort_order, created_at limit 1);
  end if;
  return jsonb_build_object('deleted', p_id);
end $$;

-- ---------------------------------------------------------------------------
-- Courts are shared between divisions: scheduling and clash warnings look at every division
-- ---------------------------------------------------------------------------
create or replace function public.auto_schedule_fixtures(
  p_start_date date, p_game_days int[], p_first_start time, p_slot_minutes int default 90,
  p_courts text[] default null, p_slots_per_day int default 4, p_scope text default 'unscheduled')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tid uuid; v_tz text; d date; s int; c text; f record; v_busy uuid[]; v_at timestamptz;
        v_pending uuid[]; v_done int := 0; v_day int := 0; v_fid uuid; v_taken boolean;
begin
  perform public.require_admin();
  v_tid := public._require_tournament();
  perform 1 from public.tournaments where id = v_tid for update;
  if p_start_date is null or p_first_start is null then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"start":"Start date and time are required"}}'); end if;
  if p_game_days is null or cardinality(p_game_days) = 0 or exists (select 1 from unnest(p_game_days) x where x not between 1 and 7) then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"game_days":"Pick at least one weekday"}}');
  end if;
  if p_courts is null or cardinality(p_courts) = 0 or exists (select 1 from unnest(p_courts) x where public.clean_text(x) is null) then
    perform public.raise_err('VALIDATION_FAILED', '{"fields":{"courts":"Enter at least one court or venue"}}');
  end if;
  if coalesce(p_slot_minutes, 0) not between 15 and 600 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"slot_minutes":"15 to 600 minutes"}}'); end if;
  if coalesce(p_slots_per_day, 0) not between 1 and 24 then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"slots_per_day":"1 to 24 slots"}}'); end if;
  if p_scope not in ('unscheduled','all') then perform public.raise_err('VALIDATION_FAILED', '{"fields":{"scope":"unscheduled or all"}}'); end if;
  select timezone into v_tz from public.tournaments where id = v_tid;

  if p_scope = 'all' then
    update public.fixtures set scheduled_at = null where tournament_id = v_tid and stage = 'league' and status = 'upcoming';
  end if;
  select coalesce(array_agg(id order by match_number), '{}') into v_pending from public.fixtures
   where tournament_id = v_tid and stage = 'league' and status = 'upcoming' and scheduled_at is null;

  d := p_start_date;
  while cardinality(v_pending) > 0 loop
    if v_day > 366 then
      perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('schedule', 'Could not fit every fixture within 366 days'),
        'scheduled', v_done, 'unscheduled', cardinality(v_pending)));
    end if;
    if extract(isodow from d)::int = any(p_game_days) then
      -- Teams already playing on this date (tournament time zone), including fixtures scheduled earlier.
      select coalesce(array_agg(x), '{}') into v_busy from (
        select home_team_id x from public.fixtures where tournament_id = v_tid and scheduled_at is not null
          and (scheduled_at at time zone v_tz)::date = d and home_team_id is not null
        union select away_team_id from public.fixtures where tournament_id = v_tid and scheduled_at is not null
          and (scheduled_at at time zone v_tz)::date = d and away_team_id is not null) q;
      for s in 0..p_slots_per_day-1 loop
        v_at := ((d::timestamp + p_first_start + make_interval(mins => s * p_slot_minutes)) at time zone v_tz);
        foreach c in array p_courts loop
          c := public.clean_text(c);
          select exists (select 1 from public.fixtures fx join public.tournaments tt on tt.id = fx.tournament_id
            where tt.is_active and fx.scheduled_at = v_at and fx.venue = c) into v_taken;
          if v_taken then continue; end if;
          v_fid := null;
          select f2.id into v_fid from unnest(v_pending) with ordinality u(id, ord)
            join public.fixtures f2 on f2.id = u.id
           where not (f2.home_team_id = any(v_busy)) and not (f2.away_team_id = any(v_busy))
           order by u.ord limit 1;
          if v_fid is null then continue; end if;
          update public.fixtures set scheduled_at = v_at, venue = c where id = v_fid returning home_team_id, away_team_id into f;
          v_busy := v_busy || f.home_team_id || f.away_team_id;
          v_pending := array_remove(v_pending, v_fid);
          v_done := v_done + 1;
          exit when cardinality(v_pending) = 0;
        end loop;
        exit when cardinality(v_pending) = 0;
      end loop;
    end if;
    d := d + 1;
    v_day := v_day + 1;
  end loop;
  return jsonb_build_object('scheduled', v_done, 'unscheduled',
    (select count(*) from public.fixtures where tournament_id = v_tid and stage = 'league' and scheduled_at is null and status = 'upcoming'));
end $$;

create or replace function public._fixture_warnings(p_fixture_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f public.fixtures; v_w jsonb := '[]'::jsonb; v_slot int := 90; r record;
begin
  select * into f from public.fixtures where id = p_fixture_id;
  if f.scheduled_at is null then return v_w; end if;
  if f.scheduled_at < now() and f.status = 'upcoming' then
    v_w := v_w || jsonb_build_object('code', 'DATE_IN_PAST', 'message', 'The date is in the past');
  end if;
  for r in select o.match_number from public.fixtures o
    where o.tournament_id = f.tournament_id and o.id <> f.id and o.scheduled_at is not null
      and abs(extract(epoch from o.scheduled_at - f.scheduled_at)) < 7200
      and (o.home_team_id in (f.home_team_id, f.away_team_id) or o.away_team_id in (f.home_team_id, f.away_team_id))
  loop
    v_w := v_w || jsonb_build_object('code', 'TEAM_CLASH', 'message', format('A team also plays match %s within 2 hours', r.match_number));
  end loop;
  if f.venue is not null then
    for r in select o.match_number, tt.division_label from public.fixtures o join public.tournaments tt on tt.id = o.tournament_id
      where tt.is_active and o.id <> f.id and o.venue = f.venue and o.scheduled_at is not null
        and abs(extract(epoch from o.scheduled_at - f.scheduled_at)) < v_slot * 60
    loop
      v_w := v_w || jsonb_build_object('code', 'VENUE_CLASH', 'message', format('%s match %s uses the same venue within %s minutes', r.division_label, r.match_number, v_slot));
    end loop;
  end if;
  return v_w;
end $$;

-- ---------------------------------------------------------------------------
-- Existing data: the current tournament becomes the default "Men" division and a "Women" division is added
-- ---------------------------------------------------------------------------
do $$
declare d public.tournaments; v_id uuid;
begin
  select * into d from public.tournaments where is_active order by created_at limit 1;
  if d.id is null then return; end if;
  update public.tournaments set is_default = true, division_label = 'Men', sort_order = 0 where id = d.id and not is_default;
  if (select count(*) from public.tournaments where is_active) = 1 then
    insert into public.tournaments (name, slug, tagline, logo_path, banner_path, timezone, currency_symbol, venue_default,
                                    is_active, division_label, sort_order)
    values (d.name, left(d.slug, 50) || '-women', d.tagline, d.logo_path, d.banner_path, d.timezone, d.currency_symbol,
            d.venue_default, true, 'Women', 1)
    on conflict (slug) do nothing
    returning id into v_id;
    if v_id is not null then perform public.ensure_tournament_children(v_id); end if;
  end if;
end $$;

-- Privileges
revoke all on function public.request_division(), public.read_scope(), public.sync_tournament_branding() from public;
grant execute on function public.request_division(), public.read_scope(), public.active_tournament_id() to anon, authenticated;
revoke all on function public.list_divisions(), public.division_of(uuid) from public;
grant execute on function public.list_divisions(), public.division_of(uuid) to anon, authenticated, service_role;
revoke all on function public.create_division(text), public.rename_division(uuid, text), public.delete_division(uuid) from public, anon;
grant execute on function public.create_division(text), public.rename_division(uuid, text), public.delete_division(uuid) to authenticated, service_role;

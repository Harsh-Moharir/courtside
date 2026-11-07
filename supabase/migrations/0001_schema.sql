-- 0001_schema.sql
-- Enums, tables, constraints, indexes and generic triggers.
-- Business functions live in 0004..0007; security in 0003; realtime in 0008.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 3.1 Enumerated types
-- ---------------------------------------------------------------------------
create type public.tournament_phase   as enum ('setup','auction','league','playoffs','completed');
create type public.player_position    as enum ('PG','SG','SF','PF','C');
create type public.player_status      as enum ('available','sold','unsold','icon');
create type public.roster_source      as enum ('icon','auction','manual');
create type public.auction_status     as enum ('not_started','live','paused','completed');
create type public.lot_status         as enum ('live','sold','unsold','cancelled');
create type public.txn_status         as enum ('active','reversed');
create type public.unsold_rule        as enum ('manual_reenter','auto_reenter','no_reenter');
create type public.auction_event_type as enum ('round_started','round_ended','lot_opened','bid_placed','bid_undone',
  'sold','unsold','lot_cancelled','sale_reversed','player_reassigned','auction_paused','auction_resumed','auction_completed');
create type public.fixture_stage      as enum ('league','playoff');
create type public.fixture_status     as enum ('upcoming','live','completed','postponed');
create type public.result_type        as enum ('normal','forfeit');
create type public.team_side          as enum ('home','away');
create type public.scoring_event_type as enum ('match_started','points','foul','timeout','period_change',
  'clock_start','clock_pause','clock_set','shot_clock_set','score_correction','match_ended');
create type public.tiebreaker         as enum ('head_to_head','point_difference','points_for','points_against_lowest','wins');
create type public.playoff_format     as enum ('semis_final','direct_final','single_elim_6','single_elim_8','ipl_page');
create type public.bracket_status     as enum ('not_generated','generated','in_progress','completed');
create type public.node_source_kind   as enum ('seed','winner_of','loser_of');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Raise a stable machine-readable error code with a JSON detail (5.7).
create or replace function public.raise_err(p_code text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql as $$
begin
  if p_code = 'NOT_AUTHORIZED' then
    raise exception using message = p_code, detail = coalesce(p_detail, '{}'::jsonb)::text, errcode = '42501';
  end if;
  raise exception using message = p_code, detail = coalesce(p_detail, '{}'::jsonb)::text, errcode = 'P0001';
end $$;

-- Collapse internal whitespace and trim (6.7 item 4).
create or replace function public.clean_text(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(p, '\s+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------------------
-- 3.2 Core and settings tables
-- ---------------------------------------------------------------------------
create table public.administrators (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  tagline text check (tagline is null or char_length(tagline) <= 140),
  logo_path text,
  banner_path text,
  timezone text not null default 'Asia/Kolkata',
  currency_symbol text not null default '₹' check (char_length(currency_symbol) between 1 and 4),
  venue_default text check (venue_default is null or char_length(venue_default) <= 80),
  phase public.tournament_phase not null default 'setup',
  is_active boolean not null default true,
  featured_fixture_id uuid,
  champion_team_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tournaments_one_active on public.tournaments (is_active) where is_active;
create trigger tournaments_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

create or replace function public.validate_timezone() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields', jsonb_build_object('timezone', 'Unknown time zone')));
  end if;
  return new;
end $$;
create trigger tournaments_timezone before insert or update of timezone on public.tournaments
  for each row execute function public.validate_timezone();

create table public.auction_settings (
  tournament_id uuid primary key references public.tournaments on delete cascade,
  purse_per_team bigint not null default 10000 check (purse_per_team > 0),
  default_base_price bigint not null default 100 check (default_base_price > 0),
  min_squad_size smallint not null default 8 check (min_squad_size >= 1),
  max_squad_size smallint not null default 12,
  icon_counts_in_squad boolean not null default true,
  reserve_per_slot bigint not null default 0 check (reserve_per_slot >= 0),
  max_rounds smallint not null default 3 check (max_rounds between 1 and 10),
  unsold_rule public.unsold_rule not null default 'manual_reenter',
  unsold_base_price_reduction_pct smallint not null default 0 check (unsold_base_price_reduction_pct between 0 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_squad_size >= min_squad_size)
);
create trigger auction_settings_updated_at before update on public.auction_settings
  for each row execute function public.set_updated_at();

create table public.auction_increment_tiers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  from_amount bigint not null check (from_amount >= 0),
  step bigint not null check (step > 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, from_amount)
);

create table public.match_rules (
  tournament_id uuid primary key references public.tournaments on delete cascade,
  quarters smallint not null default 4 check (quarters between 2 and 4),
  quarter_seconds int not null default 600 check (quarter_seconds between 60 and 3600),
  overtime_seconds int not null default 300 check (overtime_seconds between 60 and 1800),
  shot_clock_seconds smallint not null default 24 check (shot_clock_seconds between 10 and 60),
  shot_clock_short_reset_seconds smallint not null default 14,
  timeouts_first_half smallint not null default 2 check (timeouts_first_half between 0 and 10),
  timeouts_second_half smallint not null default 3 check (timeouts_second_half between 0 and 10),
  timeouts_per_overtime smallint not null default 1 check (timeouts_per_overtime between 0 and 5),
  team_foul_bonus_threshold smallint not null default 5 check (team_foul_bonus_threshold between 1 and 20),
  hide_shot_clock_under_game_clock boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shot_clock_short_reset_seconds between 5 and shot_clock_seconds)
);
create trigger match_rules_updated_at before update on public.match_rules
  for each row execute function public.set_updated_at();

create table public.points_settings (
  tournament_id uuid primary key references public.tournaments on delete cascade,
  win_points smallint not null default 2 check (win_points >= 0),
  loss_points smallint not null default 0 check (loss_points >= 0),
  draw_points smallint not null default 1,
  allow_draws boolean not null default false,
  forfeit_score smallint not null default 20 check (forfeit_score between 1 and 999),
  tiebreaker_order public.tiebreaker[] not null default '{head_to_head,point_difference,points_for}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (loss_points <= win_points),
  check (draw_points >= loss_points and draw_points <= win_points),
  check (cardinality(tiebreaker_order) between 1 and 5)
);
create trigger points_settings_updated_at before update on public.points_settings
  for each row execute function public.set_updated_at();

create table public.playoff_settings (
  tournament_id uuid primary key references public.tournaments on delete cascade,
  qualifying_teams smallint not null default 4 check (qualifying_teams in (2,4,6,8)),
  format public.playoff_format not null default 'semis_final',
  third_place_match boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger playoff_settings_updated_at before update on public.playoff_settings
  for each row execute function public.set_updated_at();

create or replace function public.validate_playoff_settings() returns trigger
language plpgsql as $$
declare v_expected int;
begin
  v_expected := case new.format
    when 'direct_final' then 2 when 'semis_final' then 4 when 'ipl_page' then 4
    when 'single_elim_6' then 6 when 'single_elim_8' then 8 end;
  if new.qualifying_teams <> v_expected then
    perform public.raise_err('VALIDATION_FAILED', jsonb_build_object('fields',
      jsonb_build_object('qualifying_teams', format('Format %s needs exactly %s teams', new.format, v_expected))));
  end if;
  if new.format not in ('semis_final','single_elim_6','single_elim_8') then
    new.third_place_match := false;
  end if;
  return new;
end $$;
create trigger playoff_settings_validate before insert or update on public.playoff_settings
  for each row execute function public.validate_playoff_settings();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 2000),
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_published on public.announcements (tournament_id, published_at desc);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create or replace function public.announcements_set_creator() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger announcements_creator before insert or update on public.announcements
  for each row execute function public.announcements_set_creator();

-- ---------------------------------------------------------------------------
-- 3.3 Teams, owners, players, rosters
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  short_name text not null check (short_name ~ '^[A-Z0-9]{2,4}$'),
  logo_path text,
  primary_color text not null default '#F97316' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#111111' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  purse_total bigint not null default 0 check (purse_total >= 0),
  purse_spent bigint not null default 0,
  purse_remaining bigint generated always as (purse_total - purse_spent) stored,
  manual_tiebreak_rank smallint,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_purse_bounds check (purse_spent >= 0 and purse_spent <= purse_total),
  unique (tournament_id, short_name)
);
create unique index teams_name_unique on public.teams (tournament_id, lower(name));
create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create or replace function public.teams_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  -- Serialise team creation per tournament so two parallel inserts cannot both pass the limit.
  perform 1 from public.tournaments where id = new.tournament_id for update;
  select count(*) into v_count from public.teams where tournament_id = new.tournament_id;
  if v_count >= 10 then
    perform public.raise_err('TEAM_LIMIT_REACHED', jsonb_build_object('max', 10));
  end if;
  new.name := public.clean_text(new.name);
  select purse_per_team into new.purse_total from public.auction_settings where tournament_id = new.tournament_id;
  new.purse_total := coalesce(new.purse_total, 10000);
  new.purse_spent := 0;
  return new;
end $$;
create trigger teams_before_insert before insert on public.teams
  for each row execute function public.teams_before_insert();

create or replace function public.teams_clean_name() returns trigger
language plpgsql as $$
begin
  new.name := public.clean_text(new.name);
  return new;
end $$;
create trigger teams_clean_name before update of name on public.teams
  for each row execute function public.teams_clean_name();

create table public.team_owners (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  team_id uuid not null unique references public.teams on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger team_owners_updated_at before update on public.team_owners
  for each row execute function public.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  photo_path text,
  age smallint check (age is null or age between 10 and 70),
  height_cm smallint check (height_cm is null or height_cm between 120 and 250),
  primary_position public.player_position not null,
  secondary_position public.player_position,
  jersey_number smallint check (jersey_number is null or jersey_number between 0 and 99),
  description text check (description is null or char_length(description) <= 280),
  base_price bigint not null check (base_price >= 1),
  status public.player_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (secondary_position is distinct from primary_position)
);
create index players_name_trgm on public.players using gin (full_name extensions.gin_trgm_ops);
create index players_status on public.players (tournament_id, status);
create index players_position on public.players (tournament_id, primary_position);
create trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();

create or replace function public.players_clean() returns trigger
language plpgsql as $$
begin
  new.full_name := public.clean_text(new.full_name);
  new.description := public.clean_text(new.description);
  if tg_op = 'INSERT' then
    new.status := 'available';
  end if;
  return new;
end $$;
create trigger players_clean before insert or update of full_name, description on public.players
  for each row execute function public.players_clean();

-- ---------------------------------------------------------------------------
-- 3.4 Auction tables
-- ---------------------------------------------------------------------------
create table public.auction_lots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  round_number smallint not null check (round_number >= 1),
  lot_number int not null,
  player_id uuid references public.players on delete set null,
  player_name text not null,
  player_photo_path text,
  primary_position public.player_position,
  secondary_position public.player_position,
  base_price bigint not null check (base_price >= 1),
  status public.lot_status not null default 'live',
  current_bid bigint,
  leading_team_id uuid references public.teams on delete restrict,
  bid_count int not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, lot_number)
);
create unique index auction_lots_one_live on public.auction_lots (tournament_id) where status = 'live';
create index auction_lots_status on public.auction_lots (tournament_id, status);
create trigger auction_lots_updated_at before update on public.auction_lots
  for each row execute function public.set_updated_at();

create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  lot_id uuid not null references public.auction_lots on delete cascade,
  team_id uuid not null references public.teams on delete restrict,
  amount bigint not null check (amount > 0),
  sequence int not null,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid,
  client_request_id uuid unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (lot_id, sequence)
);
create index auction_bids_lot_seq on public.auction_bids (lot_id, sequence);

create table public.auction_transactions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  lot_id uuid unique references public.auction_lots on delete restrict,
  player_id uuid references public.players on delete set null,
  team_id uuid not null references public.teams on delete restrict,
  player_name text not null,
  player_photo_path text,
  primary_position public.player_position,
  secondary_position public.player_position,
  price bigint not null check (price >= 0),
  purchase_order int not null,
  kind text not null check (kind in ('auction','manual')),
  status public.txn_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid,
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 1 and 200),
  unique (tournament_id, purchase_order),
  check (status = 'active' or reversal_reason is not null)
);
create unique index auction_transactions_one_active on public.auction_transactions (player_id) where status = 'active';
create index auction_transactions_team on public.auction_transactions (tournament_id, team_id);

create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  player_id uuid not null unique references public.players on delete restrict,
  source public.roster_source not null,
  icon_slot smallint check (icon_slot in (1,2)),
  price bigint not null default 0 check (price >= 0),
  purchase_order int,
  transaction_id uuid references public.auction_transactions on delete set null,
  acquired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((source = 'icon') = (icon_slot is not null)),
  check (source <> 'icon' or price = 0),
  unique (team_id, icon_slot)
);
create index team_players_team on public.team_players (team_id);

create table public.auction_state (
  tournament_id uuid primary key references public.tournaments on delete cascade,
  status public.auction_status not null default 'not_started',
  current_round smallint not null default 0,
  current_lot_id uuid references public.auction_lots on delete set null,
  between_rounds boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create trigger auction_state_updated_at before update on public.auction_state
  for each row execute function public.set_updated_at();

create table public.auction_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  event_type public.auction_event_type not null,
  lot_id uuid references public.auction_lots on delete set null,
  team_id uuid references public.teams on delete set null,
  player_id uuid references public.players on delete set null,
  amount bigint,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index auction_events_recent on public.auction_events (tournament_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3.5 Fixtures, live scoring, results, standings, playoffs
-- ---------------------------------------------------------------------------
create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  stage public.fixture_stage not null default 'league',
  match_number int not null,
  round_number int,
  home_team_id uuid references public.teams on delete restrict,
  away_team_id uuid references public.teams on delete restrict,
  scheduled_at timestamptz,
  venue text check (venue is null or char_length(venue) <= 80),
  status public.fixture_status not null default 'upcoming',
  postponed_reason text check (postponed_reason is null or char_length(postponed_reason) <= 200),
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_match_number_unique unique (tournament_id, match_number) deferrable initially deferred,
  -- Both null is allowed for an undecided playoff slot; two equal non-null teams are not.
  constraint fixtures_teams_differ check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id),
  constraint fixtures_league_teams check (stage = 'playoff' or (home_team_id is not null and away_team_id is not null)),
  constraint fixtures_postponed_reason check (status <> 'postponed' or postponed_reason is not null)
);
create index fixtures_schedule on public.fixtures (tournament_id, scheduled_at);
create index fixtures_status on public.fixtures (tournament_id, status);
create index fixtures_home on public.fixtures (home_team_id);
create index fixtures_away on public.fixtures (away_team_id);
create trigger fixtures_updated_at before update on public.fixtures
  for each row execute function public.set_updated_at();

alter table public.tournaments
  add constraint tournaments_featured_fixture_fk foreign key (featured_fixture_id) references public.fixtures on delete set null,
  add constraint tournaments_champion_fk foreign key (champion_team_id) references public.teams on delete set null;

create table public.match_states (
  fixture_id uuid primary key references public.fixtures on delete cascade,
  tournament_id uuid not null references public.tournaments on delete cascade,
  home_score int not null default 0 check (home_score between 0 and 999),
  away_score int not null default 0 check (away_score between 0 and 999),
  period smallint not null default 1 check (period >= 1),
  is_break boolean not null default false,
  clock_remaining_ms int not null check (clock_remaining_ms >= 0),
  clock_running boolean not null default false,
  clock_updated_at timestamptz not null default now(),
  shot_clock_remaining_ms int not null check (shot_clock_remaining_ms >= 0),
  shot_clock_running boolean not null default false,
  shot_clock_updated_at timestamptz not null default now(),
  home_fouls smallint not null default 0 check (home_fouls >= 0),
  away_fouls smallint not null default 0 check (away_fouls >= 0),
  home_timeouts_left smallint not null check (home_timeouts_left >= 0),
  away_timeouts_left smallint not null check (away_timeouts_left >= 0),
  period_scores jsonb not null default '[]'::jsonb,
  version int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger match_states_updated_at before update on public.match_states
  for each row execute function public.set_updated_at();

create table public.live_scoring_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments on delete cascade,
  fixture_id uuid not null references public.fixtures on delete cascade,
  seq int not null,
  event_type public.scoring_event_type not null,
  side public.team_side,
  delta int,
  prev jsonb,
  detail jsonb not null default '{}'::jsonb,
  is_voided boolean not null default false,
  client_request_id uuid unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (fixture_id, seq)
);
create index live_scoring_events_fixture_seq on public.live_scoring_events (fixture_id, seq);

create table public.match_results (
  fixture_id uuid primary key references public.fixtures on delete cascade,
  tournament_id uuid not null references public.tournaments on delete cascade,
  home_score int not null check (home_score between 0 and 999),
  away_score int not null check (away_score between 0 and 999),
  winner_team_id uuid references public.teams on delete restrict,
  result_type public.result_type not null default 'normal',
  periods_played smallint not null default 4 check (periods_played >= 0),
  period_scores jsonb not null default '[]'::jsonb,
  note text check (note is null or char_length(note) <= 200),
  completed_at timestamptz not null default now(),
  completed_by uuid,
  correction_count int not null default 0,
  last_corrected_at timestamptz,
  last_corrected_by uuid,
  correction_note text check (correction_note is null or char_length(correction_note) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index match_results_completed on public.match_results (tournament_id, completed_at desc);
create trigger match_results_updated_at before update on public.match_results
  for each row execute function public.set_updated_at();

-- The winner must agree with the scores: higher score wins, equal scores mean a draw (null winner).
create or replace function public.validate_match_result() returns trigger
language plpgsql as $$
declare f public.fixtures;
begin
  select * into f from public.fixtures where id = new.fixture_id;
  if f.home_team_id is null or f.away_team_id is null then
    perform public.raise_err('RESULT_INVALID', jsonb_build_object('reason', 'Both teams must be set'));
  end if;
  if new.home_score > new.away_score and new.winner_team_id is distinct from f.home_team_id
     or new.away_score > new.home_score and new.winner_team_id is distinct from f.away_team_id
     or new.home_score = new.away_score and new.winner_team_id is not null then
    perform public.raise_err('RESULT_INVALID', jsonb_build_object('reason', 'Winner does not match the scores'));
  end if;
  return new;
end $$;
create trigger match_results_validate before insert or update on public.match_results
  for each row execute function public.validate_match_result();

create table public.standings (
  tournament_id uuid not null references public.tournaments on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  points_for int not null default 0,
  points_against int not null default 0,
  point_diff int generated always as (points_for - points_against) stored,
  league_points int not null default 0,
  remaining int not null default 0,
  rank smallint not null,
  tiebreak_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

create table public.playoff_brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments on delete cascade,
  format public.playoff_format not null default 'semis_final',
  qualifying_teams smallint not null default 4,
  third_place_match boolean not null default false,
  status public.bracket_status not null default 'not_generated',
  seeds jsonb not null default '[]'::jsonb,
  champion_team_id uuid references public.teams on delete set null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger playoff_brackets_updated_at before update on public.playoff_brackets
  for each row execute function public.set_updated_at();

create table public.playoff_nodes (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.playoff_brackets on delete cascade,
  tournament_id uuid not null references public.tournaments on delete cascade,
  code text not null,
  label text not null,
  round_order smallint not null,
  position smallint not null,
  home_kind public.node_source_kind not null,
  home_ref text not null,
  away_kind public.node_source_kind not null,
  away_ref text not null,
  is_final boolean not null default false,
  is_third_place boolean not null default false,
  fixture_id uuid unique references public.fixtures on delete restrict,
  created_at timestamptz not null default now(),
  unique (bracket_id, code)
);

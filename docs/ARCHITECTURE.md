# Architecture

## At a glance

```text
 Spectator browsers ──(HTTPS: pages)──► Next.js 15 on Vercel ──(server client, anon key + cookies)──┐
        │                                   │  middleware.ts refreshes the session, guards /admin   │
        │                                   │  (admin)/admin/layout.tsx checks is_admin() server-side│
        │                                                                                           ▼
        └──(WebSocket: Realtime Postgres Changes)◄───────────── Supabase ─────────────────────────────
 Admin browser ──(supabase.rpc / RLS-checked writes)──────────► Postgres (RLS, RPC functions, triggers)
                                                               Auth (email+password, sign-up off)
                                                               Storage (3 public-read, admin-write buckets)
```

* **Reads**: Server Components render the first paint with the server Supabase client (anon key + the user's cookies). Client components then subscribe to Realtime and refetch their own slice of data.
* **Writes**: the admin browser calls Postgres functions (`supabase.rpc`) for every business operation, or performs a small set of RLS-protected direct writes (team/player/owner/announcement CRUD, tournament branding). The service-role key never reaches Next.js.
* **Realtime**: the migration `0008_realtime.sql` adds every live table to the `supabase_realtime` publication (replica identity full). Spectators receive row changes; RLS still applies, so voided bids and events never reach them.

## Data model (migrations)

| File | Contents |
| --- | --- |
| `0001_schema.sql` | Enums, all tables, constraints (incl. `purse_spent <= purse_total`, one live lot, one active transaction per player, unique roster per player), generic triggers (updated_at, name cleaning, team limit, timezone and playoff-format validation, match result validation) |
| `0002_defaults.sql` | `active_tournament_id()`, `ensure_tournament_children()`, the default active tournament and its 1:1 settings rows (idempotent) |
| `0003_security.sql` | `is_admin()`, start-from-deny privileges, RLS on every table (forced), read policies, column-level write grants, storage buckets and policies |
| `0004_functions_auction.sql` | Auction state machine, lots, bids, sale/unsold/cancel, reverse/reassign, purse override, settings, icon players, player status/delete, team delete, bulk base price, CSV import |
| `0005_functions_fixtures.sql` | `round_robin_pairs()` (circle method, pure), league generation, auto-scheduling, manual create/update/delete, renumber, featured fixture, postpone/reschedule |
| `0006_functions_scoring.sql` | `server_time()`, match start, points/fouls/timeouts, clocks, periods, undo, complete/forfeit/correct/reopen/abandon, match rules |
| `0007_functions_standings_playoffs.sql` | `compute_standings()` (pure), `recalculate_standings()`, points settings, playoff templates, bracket generation, seeding, `resolve_bracket()`, lock check, and the triggers that keep standings and the bracket in sync |
| `0008_realtime.sql` | Realtime publication + function privilege pass (admin RPCs → `authenticated`, read helpers → `anon`, internals → nobody) |

### Single-tournament model (D1)
Every tournament-owned table carries `tournament_id`; the UI works on the one row with `is_active = true` (partial unique index). RPCs resolve it themselves with `active_tournament_id()`; no function takes a tournament id from the client.

## Business logic lives in Postgres

Every RPC is `security definer`, starts with `require_admin()`, validates every input, does all its writes in the function's single transaction and raises stable error codes (`raise_err('CODE', detail_json)`), which `src/lib/errors.ts` maps to human sentences.

### Auction concurrency
The `auction_state` row is the mutex: every auction RPC begins with `select … for update` on it, then locks the lot, the teams (ascending id) and the player. `place_bid` also takes the caller's view of the current bid (`p_expected_current_bid`) and a `client_request_id`, so two admins bidding at once produce one bid and one `BID_STALE`, and a retried request returns `duplicate: true` without a second effect. `mark_sold` re-validates purse and squad inside the transaction. Database constraints are the last line of defence (purse bounds CHECK, unique roster row per player, partial unique index on active transactions).

### Live scoring and clocks
The database never ticks. A clock is `(remaining_ms, running, updated_at)` written with `clock_timestamp()`. Clients estimate the server offset (three `server_time()` calls, smallest round trip wins) and compute `remaining - (serverNow - updated_at)`, clamped at 0. Every scoring RPC locks the `match_states` row, assigns the next `seq`, bumps `version` and writes an event whose `prev` column holds exactly the values it overwrote, so undo is a generic `jsonb_populate_record` restore.

### Standings and playoffs
`compute_standings(teams, matches, settings)` is a pure function (no table access) implementing the recursive tiebreak algorithm; `src/lib/domain/standings.ts` is its TypeScript twin and a parity test runs both on the same inputs. `recalculate_standings()` gathers completed league results, calls it and upserts only rows whose figures changed (so live scoring leaves the table byte-identical). It runs from triggers on `match_results` and on fixture status/team/stage changes, and ends by calling `refresh_bracket_seeds()`, which freezes the seeds when the league is complete and no playoff match has started, then calls `resolve_bracket()` — a pure re-derivation of every node's teams from seeds and results, safe to run any number of times. Corrections that would change a winner after a dependent playoff match started are refused (`PLAYOFF_RESULT_LOCKED`).

## Frontend

```text
src/app/layout.tsx              root: fonts, TournamentProvider (active tournament, realtime), Navbar (live dot), Footer, Toaster
src/app/(public)/…              /, teams, players, auction (+ display), fixtures, live, matches/[id], points-table, playoffs, announcements
src/app/(admin)/admin/…         dashboard, tournament, teams, players (+ import), auction, fixtures, live (+ console), standings-settings, playoffs, announcements, account, admins
src/app/login                   sign-in (generic error message), password reset
src/middleware.ts               session refresh + redirect /admin/* → /login?next=
src/lib/supabase/               browser (one client per tab), server (cookies), middleware
src/lib/actions/rpc.ts          rpc()/write() → Result<T> = {ok:true,data} | {ok:false,code,message}; NOT_AUTHORIZED opens the "Session expired" dialog without clearing screen state
src/lib/realtime/               useRealtimeQuery (subscribe → fetch → debounced refetch → polling fallback), server clock offset
src/lib/domain/                 pure logic: roundRobin, standings, bracket, clock, money (unit-tested; previews only)
src/lib/format.ts               formatInTournamentTz (the only date formatter), money, positions
src/lib/color.ts                WCAG contrast helpers for team colours
src/lib/export, src/lib/import  CSV (formula-safe, BOM), XLSX, PDF (Devanagari-aware), ICS; CSV/XLSX player import
```

Design tokens (dark NBA-style, orange accent) are CSS variables in `globals.css`, mapped into Tailwind. Team colours are applied per card/page through `--team-primary`, `--team-on-primary` and `--team-visible` (lightened until it has 3:1 contrast on the dark background).

## Security model (summary)

* Anonymous and signed-in non-admin users can only `SELECT`, and RLS hides voided bids/events, reversed transactions, unpublished announcements and the administrators table.
* Admins write only through RPCs, plus column-limited direct writes on a few tables; `purse_*`, `players.status`, standings, results and fixture status are never client-writable.
* Storage buckets accept only PNG/JPEG/WebP up to 2 MB; uploads require `is_admin()`. Images are downscaled to WebP in the browser first.
* Response headers: CSP (`default-src 'self'`, Supabase host for images and websockets, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, strict referrer, restrictive permissions policy.

# Decisions and deviations

The specification's MUSTs are implemented as written unless listed here. Each entry says what was decided and why.

## Platform and tooling

| # | Decision | Reason |
| --- | --- | --- |
| 1 | Migration files are named `0001_schema.sql` … `0008_realtime.sql` (no timestamp prefix). | The spec names them this way; the Supabase CLI accepts any numeric version prefix and applies them in order. |
| 2 | Local Postgres is 17 (Supabase CLI default). | Spec says "Postgres 15+". Nothing version-specific is used. |
| 3 | `@playwright/test` is pinned to 1.63.0. | Matches the pre-installed Chromium in the build environment; CI installs the matching browser with `playwright install`. |
| 4 | Fonts load through `next/font/google` (Barlow Condensed, Inter). PDF fonts (Noto Sans, Noto Sans Devanagari) are bundled TTFs under `public/fonts` (OFL 1.1). | `next/font` self-hosts at build time, so no request goes to Google at runtime and the CSP stays `font-src 'self'`. |
| 5 | CSP uses `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` only in development). No nonces. | Nonces would force every page to dynamic rendering without per-request benefit here; the spec allows this ("SHOULD use nonces if it does not break the build"). |
| 6 | Tailwind colour tokens use literal hex values that mirror the CSS variables in `globals.css`. | Tailwind 3 cannot apply opacity modifiers (`bg-danger/15`) to `var()` colours. The CSS variables remain the documented tokens. |

## Database

| # | Decision | Reason |
| --- | --- | --- |
| 7 | The standings and playoff triggers are created in `0007` rather than `0001`. | They call functions defined in `0007`; keeping trigger and function together is clearer. Applying all migrations to an empty database still succeeds. |
| 8 | `is_admin()` also returns true when the JWT role is `service_role`. | Lets the local maintenance scripts (`seed.ts`, `bootstrap-admin.ts`) call the same RPCs. The service role already bypasses RLS and never reaches the browser or Next.js. |
| 9 | `fixtures` check is `home_team_id is null or away_team_id is null or home_team_id <> away_team_id` (plus "both not null for league"). | The literal `home_team_id is distinct from away_team_id` rejects two null slots, which a not-yet-decided playoff fixture needs. |
| 10 | Added `match_results.note` (≤ 200 chars). | `complete_match(p_note)` and `record_forfeit(p_reason)` need somewhere to store their text; `correction_note` is reserved for corrections. |
| 11 | `forfeit_score` is constrained to 1–999. | A forfeit win must still have a winner by score; 0–0 would contradict the result validation trigger. |
| 12 | Anonymous calls to admin RPCs fail with Postgres `42501 permission denied` (execute revoked) instead of reaching the function's `NOT_AUTHORIZED`. Signed-in non-admins get `NOT_AUTHORIZED` (`42501`) from inside the function. | Spec 4.3 requires `revoke execute … from anon`, which makes the privilege check fire first. Both surface as `NOT_AUTHORIZED` in the UI (`src/lib/errors.ts`). |
| 13 | `clean_text()` and `raise_err()` are executable by `anon` and `authenticated`. | They are pure helpers used by row triggers that run as the invoking role (name cleaning on admin team/player edits). Found by the pgTAP suite. |
| 14 | Extra read-only RPC `auction_warnings()`; admin wrappers `rebuild_standings()` and `refresh_seeds()` around the internal `recalculate_standings()` / `refresh_bracket_seeds()`. | The internals are called from triggers and must not be callable by clients; the wrappers carry the admin check. |
| 15 | Statement-level triggers on `fixtures` (insert/delete) and `teams` (insert/delete) recalculate standings. | Keeps `remaining` correct after (re)generating fixtures and guarantees exactly one standings row per team, without a recompute per inserted row. |
| 16 | `recalculate_standings()` only rewrites rows whose figures changed. | So live scoring (which changes fixture status) leaves `standings` byte-identical until completion (8.12 item 9). |
| 17 | `team_owners` is also in the realtime publication. | Owner changes propagate to open team pages without a reload (6.7 item 2). |
| 18 | `auto_schedule_fixtures` also avoids teams that already play on a date because of fixtures scheduled earlier, and skips a court/time already used. | Prevents double-booking when scheduling in several passes (`scope = 'unscheduled'`). |

## Auction

| # | Decision | Reason |
| --- | --- | --- |
| 19 | `start_next_round([])` is accepted when `available` players exist (players added after round 1 started); it is refused with `POOL_EMPTY` only when the resulting pool would be empty. | Spec 5.6 says players added later join the pool; refusing an empty re-entry list would strand them. |
| 20 | `reopen_auction()` records an `auction_resumed` event with the message "The auction was reopened…". | There is no dedicated event type in the enum. |
| 21 | `set_icon_player` also takes the auction-state lock. | Serialises icon changes with sales so invariants 2 and 3 cannot be broken by a race. |
| 22 | Increment step for a bid below the first tier, or with no tiers, defaults to 1. | Defensive; `save_auction_settings` always enforces a tier starting at 0. |

## Live scoring

| # | Decision | Reason |
| --- | --- | --- |
| 23 | `undo_last_event(p_fixture_id, p_expected_seq default null)`. When the console passes the seq it is showing and a different event is now latest, the call returns the state with `stale: true` and changes nothing. | The spec's undo takes no request id, so a double click would undo twice. |
| 24 | `reopen_match` writes no scoring event (the enum has no `match_reopened`); it bumps `version`, which makes every client refetch. | Keeps the enum as specified. |
| 25 | `complete_match` on an already completed fixture raises `FIXTURE_NOT_EDITABLE`; corrections go through `correct_match_result`. | As in 8.7 item 1. |

## Standings

| # | Decision | Reason |
| --- | --- | --- |
| 26 | Tiebreak notes: a team that is level on points with the team above gets the label of the criterion that separated it from that team; the top team of a tied group gets the label of the criterion that separated the team below it. Head-to-head reads `Head-to-head vs <other team>`. | The spec defines the note for "the one above"; the top of a tied group has no tied team above it but must still show a note (9.3 item 5). |
| 27 | Name comparison in the fallback order uses `lower(name) collate "C"` in SQL and byte-wise UTF-8 comparison in TypeScript. | Guarantees identical ordering in both implementations regardless of the database locale. |
| 28 | The circle-method home/away greedy rule from 7.1 is used unchanged. | Unit tests confirm `|home − away| ≤ 2` (single) and `home = away` (double) for every n from 2 to 10. |
| 29 | Seeded shuffle uses a 31-bit LCG (glibc constants) implemented identically in SQL and TypeScript. | Deterministic, portable and covered by a parity test. |

## Frontend

| # | Decision | Reason |
| --- | --- | --- |
| 30 | A signed-in non-admin reaching `/admin` is sent to `/auth/signout?error=not_admin` (a Route Handler that signs out and redirects to `/login?error=not_admin`). | Server Components cannot clear cookies; the layout check itself remains server-side as required. |
| 31 | `useRealtimeQuery` refetches the affected query on every change (debounced) instead of patching rows in place. | Simpler and always consistent with RLS (voided rows disappear for visitors). Tables are small by design (≤ 10 teams, ≤ 1,000 players, paginated). |
| 32 | After sign-in the login form does a full page navigation (`window.location.assign`) and the navbar/footer links to `/admin` are not prefetched. | In production Next.js prefetches links; a signed-out prefetch of `/admin` (a redirect to `/login`) was cached and reused after sign-in. Found by the production-mode check. |
| 33 | Time zones are validated by asking `Intl.DateTimeFormat` to format with the zone rather than by membership in `Intl.supportedValuesOf('timeZone')`. | Chromium reports canonical aliases (`Asia/Calcutta`) that the list does not contain; Postgres accepts both. |

## Local Supabase configuration

| # | Decision | Reason |
| --- | --- | --- |
| 34 | `supabase/config.toml`: `[auth] enable_signup = false`, `[auth.email] enable_signup = true`. | In the CLI config the `[auth.email]` flag enables the email *provider* (password sign-in); turning it off blocks admin sign-in. Public sign-up is disabled by the top-level flag (D6). In the hosted dashboard the equivalent is: Email provider on, "Allow new users to sign up" off. |
| 35 | `NEXT_DIST_DIR` (optional) sets Next.js's build directory. | Lets a production build/server run next to a dev server (used for the production-mode verification). |
| 36 | Demo data lives in `scripts/seed.ts`; `supabase/seed.sql` is intentionally empty. | `supabase db reset` must give the clean database the test suites expect; the seed refuses to run against a non-local URL. |

## Admin force delete (added after delivery, at the owner's request)

| # | Decision | Reason |
| --- | --- | --- |
| 37 | `delete_player`, `delete_team` and `delete_fixture` take `p_force boolean default false` (migration `0009`). Without it the original safety refusals apply; with it the row is deleted and everything depending on it is cleaned up in one transaction: a live lot is cancelled, sales are reversed and refunded, league matches of a deleted team are removed, playoff matches are reset to upcoming (a playoff match is never removed because it belongs to the bracket), then standings and the bracket are recalculated. | The owner wants full freedom to delete players, teams and matches. Spec 6.1/6.4/7.3 asked for refusals; keeping them as the default and making the override explicit preserves the protection against accidental clicks. |
| 38 | Team force delete requires typing the team name in the UI; player and match force delete require ticking a box or a second confirmation. | Proportionate friction for irreversible actions. |
| 39 | `auction_bids.team_id` and `auction_transactions.team_id` cascade on team delete; `auction_lots.leading_team_id` is set to null. | A deleted team takes its own (already reversed) auction records with it; lot snapshots and the auction event log remain. |

## Divisions (Men / Women), added at the owner's request

| # | Decision | Reason |
| --- | --- | --- |
| 40 | A division is a tournament row (`division_label`, `is_default`, `sort_order`; migration `0010`). Several tournaments can be active at once; the original single-active index is replaced by a single-default index. | Every rule was already scoped by `tournament_id`, so each division automatically gets its own teams (10-team limit each), players, auction and purse, fixtures, live scoring, standings, playoffs and champion with no RPC changes. |
| 41 | The browser and server Supabase clients send `x-division: <id>` (from the `division` cookie). `active_tournament_id()` uses it, falling back to the default division. Read policies are scoped with `tournament_id = coalesce(read_scope(), tournament_id)`, where `read_scope()` is null when there are no request headers. | Scopes every existing query and RPC without touching them. Realtime (which carries no request headers) still delivers every division's changes, and pages refetch their own scoped data, so live updates keep working for every division. |
| 42 | Team, match and player links set the division from the entity (`division_of`, in middleware); `?division=women` (or an id) selects a division explicitly. | Shared links always open in the right division; a projector can be bookmarked to one division. |
| 43 | Name, tagline, logo, banner, time zone and currency are synced across divisions by a trigger; the default venue is per division. | One event brand. |
| 44 | Court/time clashes are checked across all divisions (auto-scheduling skips a court already used by another division; edit warnings name the other division). | Divisions share courts. |
| 45 | The existing tournament becomes the default "Men" division and an empty "Women" division is created by the migration. Divisions can be added (up to 6), renamed or removed (only when empty) in Admin → Tournament. | Matches the owner's request; other setups stay possible. |

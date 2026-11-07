# Testing

## Automated suites

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit (Vitest) | `pnpm test` / `pnpm test:coverage` | Round robin properties for n = 2…10 (single and double), standings worked examples 1–5 plus 3-way and 4-way ties, bracket formats and progression, clock maths and formatting, offset estimation, money rules and tier boundaries, colour contrast helpers, CSV formula-injection and BOM, ICS escaping and folding, roster PDF font choice (Devanagari), roster grouping, jersey conflicts, player filters, announcement link detection, player import parsing |
| Parity (Vitest + local DB) | part of `pnpm test` | The TypeScript copies agree with the SQL on the same inputs: `compute_standings` (order, notes, points, PD), `round_robin_pairs` (incl. seeded shuffle), `playoff_template`. Skipped automatically when the local database is not running. |
| Database (pgTAP) | `pnpm test:db` | 8 files, 271 assertions: security (4.6), every auction RPC and error code incl. all 5.9 edge cases, invariants after each step, a seeded random sequence of 200 auction operations with invariants after every step, team/player/icon/import rules, fixtures and scheduling, live scoring (clock, undo, periods, overtime, timeouts, completion, corrections, reopen, forfeit, standings untouched while live), standings recalculation and playoff progression/lock rules for every format |
| Concurrency | `pnpm test:concurrency` | Real parallel connections: 20 simultaneous bids (one wins, the rest `BID_STALE`), 10 simultaneous `mark_sold` (one wins, one roster row), parallel placements to one team never exceed purse or squad, 20 parallel scoring taps land with consecutive `seq` and the right total, parallel retries with one request id land once |
| End-to-end (Playwright) | `E2E_RESET=1 pnpm test:e2e` | `01-smoke` full tournament through the UI; `02-realtime` visitor sees bids, SOLD on the projector, roster and score/clock changes without reloading; `03-failure` offline scoring taps are queued and land once on Retry; `mobile` 390×844 layouts; `visitor-access` every public route without a session, every admin route redirects, admin RPCs fail for visitors |

`E2E_RESET=1` resets the local database and recreates the bootstrap admin before the run (never point it at production). Without it the specs adapt to the existing data and clean up after themselves.

Quality gates (CI, `.github/workflows/ci.yml`): `tsc --noEmit`, ESLint with no errors, Vitest with ≥ 90% line coverage on domain logic, `supabase test db`, concurrency tests, `next build`, Playwright.

---

## Manual QA script (a full tournament, about 60–90 minutes)

Use two devices or two browser windows: **A** = admin (signed in), **B** = spectator (private window, not signed in). Start from an empty local database (`pnpm db:reset && pnpm bootstrap-admin`).

### 1. Access
1. B: open every link in the top navigation. All load; *Admin Panel* goes to the sign-in page.
2. B: try `/admin/teams` directly → redirected to sign-in.
3. A: sign in with a wrong password → "Invalid email or password". Sign in correctly → dashboard.

### 2. Setup
4. A: *Tournament*: set name, tagline, upload a logo and a banner (PNG/JPEG/WebP). B: homepage shows them after refresh.
5. A: *Teams*: create 4 teams with logos, colours and owners. Pick two very similar colours once → warning shown, still saveable. B: `/teams` shows each card with logo, name, `Owner:`, `Icon Player 1: To be announced`, `Icon Player 2: To be announced`.
6. A: add one player by hand (try height `5'10"`), then *Import* the template with 23 more rows including one duplicate name and one invalid position → preview shows Warning and Error; import → result screen; download skipped rows.
7. A: on each team page set Icon Player 1 and 2. Try making a player an icon for a second team → refused. B: team cards show both icons with the gold ring and ICON badge.
8. A: try to add an 11th team (create 6 more quickly, or check the button label "Maximum 10 teams" when 10 exist).

### 3. Auction
9. Open `/auction/display` on B (press F).
10. A: *Auction → Settings*: purse 10,000, squad 4–8, tiers 0:+100, 2,000:+250. Save.
11. A: *Console → Start round 1*. Bring up a player. Bid with three different teams, undo once, then SOLD. B (display) shows the SOLD stamp within ~2 s; `/teams/<winner>` shows the player in the right position group with the price; the purse dropped.
12. A: bring up a player, mark UNSOLD with bids (confirm discard). Bring up another and Cancel lot → player still available.
13. A: give one team its maximum bid exactly (allowed), then one unit more (refused with the max bid shown).
14. A: sell every remaining player, *End round*, select the unsold player, *Start next round with selected*, sell them, *Complete auction*. Teams below the minimum squad are listed as warnings.
15. A: *History and corrections*: reverse one sale (reason required) and reassign one player to another team at a new price. Check purses and rosters on B.
16. B: `/auction` history, unsold tab and spending bars are correct; export CSV and Excel and open them (names in other scripts display correctly).

### 4. Fixtures
17. A: *Fixtures → Generate league → double*. 4 teams → 12 fixtures. *Auto-schedule* for Saturdays and Sundays, two courts. No team plays twice on one date.
18. A: edit one fixture's time to clash with another → warning, still saved. Postpone one with a reason, then reschedule it. B: `/fixtures` list and calendar both show it correctly; downloads (CSV, PDF, ICS) open.
19. A: set Match of the Day → B homepage banner shows it with a countdown.

### 5. Live scoring
20. A: *Live scoring → Start match* on the first fixture. B: `/live` and the match page show the scoreboard immediately.
21. A: score with buttons and keyboard (Z/X/C, B/N/M), add fouls (watch BONUS after 5), take a timeout (clocks stop), start/pause the clock (Space), Shot 24/14. B updates within ~2 s without refresh; the clock runs smoothly.
22. A: Undo several times — the button always says what it will undo.
23. A: End Q1, score a late basket in the break, start Q2; end Q2 → "Halftime"; continue to the end of Q4 level → End match refuses with the draw message → Start overtime → finish.
24. B: points table changed only now, and only for the two teams. Correct the result (note required) → table recalculates. Reopen the match → table reverts; complete it again.
25. A: turn the network off in DevTools, tap +2 twice → red "Not saved" banner; network on → Retry → score increased by exactly 4.
26. A: complete the remaining league matches (or use *Forfeit* for one) — B's points table updates after each.

### 6. Standings and playoffs
27. A: *Standings*: change win points to 3 → table recalculates; set it back. Reorder tiebreakers.
28. A: *Playoffs*: generate the bracket (top 4) before the league ends → B `/playoffs` shows *Provisional*. After the last league result the semifinal teams appear automatically (1 v 4, 2 v 3).
29. A: score Semifinal 1 → its winner appears in the final; correct SF1 to the other winner while the final is upcoming → the final updates; start the final, then try to correct SF1's winner again → refused (`PLAYOFF_RESULT_LOCKED`).
30. A: complete the final → B homepage and `/playoffs` show the champion banner with owner and icon players. Reopen the final → the banner disappears; complete it again.

### 7. Wrap-up
31. B: download each team's roster PDF (a Devanagari name prints correctly), share a match result (link copied or share sheet).
32. B at 390 px width (DevTools device mode): homepage, team page, fixtures, live scoreboard, points table, playoffs — no sideways scrolling.
33. A: *Announcements*: create one scheduled for tomorrow → B does not see it; publish now → B sees it pinned on the homepage.

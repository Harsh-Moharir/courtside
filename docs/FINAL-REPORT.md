# Final report

**Courtside** is one integrated basketball tournament application: team creation → player registration → live IPL-style auction → automatic rosters → fixtures → live scoring → points table → playoffs → champion. Next.js 15 + Tailwind on the front, Supabase (Postgres, Auth, Realtime, Storage) behind it, with every money/score/standings/bracket rule enforced inside Postgres functions.

## What was built (by stage)

| Stage | Delivered |
| --- | --- |
| 0 Foundation | 8 SQL migrations (schema, defaults, RLS/security + storage buckets, auction, fixtures, scoring, standings/playoffs, realtime + privileges), Supabase SSR clients, middleware + server-side admin guard, login/reset/sign-out, bootstrap/add-admin/seed scripts, env validation, CI workflow |
| 1 Layout | Dark NBA-style design system, sticky nav with live-match dot and mobile drawer, footer, homepage with all 9 sections (champion banner, hero counters, Match of the Day/next match with countdown, live now, upcoming, latest results with share, points table, auction feed, announcements) |
| 2 Teams & players | Team CRUD with logo/owner photo upload, colour contrast warnings, 10-team cap; icon players; player CRUD with photos, ft/in heights, server-side search/filter/pagination, bulk delete and base price; CSV/XLSX import with alias headers, preview, duplicates and skipped-row download; public Teams and Players pages (`TeamIdentity` block: logo, name, Owner, Icon Player 1, Icon Player 2) |
| 3 Auction | Atomic RPC engine (lots, bids with stale-check and idempotency, undo, SOLD/UNSOLD/cancel, rounds, unsold rules, price decay, reversal, reassignment, purse override, settings with tiers); admin console with team grid, max bids, keyboard shortcuts; public auction page with history, unsold, spending bars, CSV/Excel export; full-screen projector display with SOLD/UNSOLD stamps, purse strip, wake lock |
| 4 Rosters | Team pages grouped by position with filters, finance summary, admin corrections, roster PDF (Devanagari-capable) |
| 5 Fixtures | Circle-method single/double round robin, auto-scheduling by weekday/slots/courts in the tournament time zone, manual create/edit/postpone/reschedule/delete, Match of the Day, list + calendar views, CSV/PDF/ICS downloads |
| 6 Live scoring | Server-timestamp clocks (game + shot), periods/halftime/overtime, fouls/bonus, timeouts, undo, corrections, complete/forfeit/reopen/abandon; admin console with optimistic ordered request queue, offline banner + retry, shortcuts; public scoreboard, `/live`, shareable match pages with OG image |
| 7 Standings | Pure `compute_standings` (recursive head-to-head tiebreaks) mirrored in TypeScript, automatic recalculation only on completed league results, points/tiebreaker settings, manual tiebreak rank, Points Table page and widget |
| 8 Playoffs | Five formats (semis+final default, IPL page, direct final, top 6, top 8, optional 3rd place), automatic seeding when the league completes, automatic progression, lock rules, bracket page with connectors and mobile layout, champion banner |
| 9 Admin & polish | Dashboard with computed checklist and warnings, tournament settings and match rules, announcements (pinned/scheduled), account, admin list; robots, sitemap, not-found/error pages, security headers/CSP |
| 10 Verification | Test suites below; production build and production-mode run with no console errors |

## Test results (all run in this environment against a local Supabase stack)

| Suite | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | 0 errors |
| ESLint | 0 errors, 0 warnings |
| Vitest unit + TS/SQL parity | 98 passed; covered domain logic 99% lines |
| pgTAP (`supabase test db`) | 8 files, 271 assertions, all pass |
| Concurrency (20 parallel connections) | 14/14 checks pass |
| Playwright E2E (fresh database) | 33/33 pass: full smoke tournament through the UI, realtime (SOLD on projector < 2.5 s, score < 2.5 s), offline scoring retry, mobile 390×844, visitor access |
| `next build` + production server | All 34 routes build; public + admin pages load with no console errors; CSP active |

## What you still need to do (requires your accounts)

1. Create a Supabase project, copy the URL and anon key (README §2).
2. `pnpm supabase link --project-ref <ref>` then `pnpm supabase db push`.
3. In Supabase Auth: keep Email enabled, turn off "Allow new users to sign up", set Site URL / redirect URLs.
4. Put the service-role key and bootstrap admin email/password in `.env.local` and run `pnpm bootstrap-admin`.
5. Import the repository into Vercel with only the three `NEXT_PUBLIC_` variables and deploy.
6. Before the event: check Supabase Realtime and Vercel plan limits for your expected audience; take a `supabase db dump` backup.

## Known limitations

* Not deployed: no Supabase or Vercel credentials were available in this environment. Everything was verified on a local Supabase stack and a local production build; the README steps are the deployment path.
* PDF text in Devanagari uses the embedded Noto font, but jsPDF does not shape complex scripts, so some vowel signs/conjuncts may be positioned imperfectly in the PDF (on screen they render correctly).
* Lighthouse scores were not measured in this environment (no Lighthouse run); pages are server-rendered, export libraries are lazy-loaded, and the mobile E2E checks layout and touch targets.
* Safari on iPhone does not offer the Fullscreen API to web pages; the projector page works as a full-window page (Add to Home Screen).
* Realtime capacity is bounded by your Supabase plan; beyond it pages fall back to polling every 3–5 s.

## Deviations from the specification

All recorded with reasons in [`docs/DECISIONS.md`](DECISIONS.md). The notable ones: anonymous calls to admin RPCs fail at the privilege layer (`42501`) rather than inside the function; `undo_last_event` takes an optional expected sequence to make double clicks safe; `match_results.note` was added; standings/playoff triggers live in migration 0007; the playoff fixture CHECK allows two empty slots.

## Commands

```bash
pnpm install && pnpm db:start && pnpm db:reset && pnpm bootstrap-admin && pnpm seed --stage=league && pnpm dev
```

Public site: http://localhost:3000 · Admin: http://localhost:3000/admin (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env.local`).

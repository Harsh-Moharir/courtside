# Courtside: basketball tournament management

One integrated web app for a basketball tournament of up to 10 teams:

**team creation → player registration → live IPL-style auction → team rosters → fixtures → live match scoring → points table → playoffs → champion**

- Public spectator site (no login): teams, rosters, players, auction results, fixtures (list + calendar), live scoreboards, match pages, points table, playoff bracket, announcements.
- Admin panel (email + password): everything above is created and run from `/admin`.
- Stack: Next.js 15 (App Router, React 19), Tailwind CSS 3.4, Supabase (Postgres, Auth, Realtime, Storage). Every rule that touches money, rosters, scores, standings or the bracket runs inside Postgres functions in one transaction; the browser never computes authoritative state.

Documentation: [Architecture](docs/ARCHITECTURE.md) · [Decisions and deviations](docs/DECISIONS.md) · [Testing](docs/TESTING.md) · [Admin guide (non-technical)](docs/ADMIN-GUIDE.md) · [Final report](docs/FINAL-REPORT.md)

---

## 1. Run it locally (10 minutes)

Requirements: Node 20+, pnpm 9+, Docker (for the local Supabase stack).

```bash
pnpm install
```

```bash
pnpm db:start
```

`db:start` prints the local API URL and keys. They are already in `.env.example` form below; copy the file and fill it:

```bash
cp .env.example .env.local
```

| Variable | Local value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` key printed by `pnpm db:start` (or `supabase status`) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key printed by `supabase status` (local scripts only) |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | the first admin you want |

Apply the migrations, create the first admin and (optionally) load demo data:

```bash
pnpm db:reset
```

```bash
pnpm bootstrap-admin
```

```bash
pnpm seed --stage=league
```

(`pnpm seed` alone creates only 8 teams, owners, 40 players and icon players; `--stage=auction` adds a finished auction; `--stage=league` also generates and plays part of a double round robin with one live match.)

Start the app:

```bash
pnpm dev
```

Open http://localhost:3000 (public site) and http://localhost:3000/admin (sign in with the bootstrap admin).

> Behind a corporate proxy the Supabase CLI may fail to pull images from `public.ecr.aws`. Pull from Docker Hub instead: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm db:start`.

---

## 2. Obtaining and configuring credentials (production)

1. **Supabase project.** Create an account at https://supabase.com, choose *New project*, pick a region near the users (for Nagpur: Mumbai `ap-south-1`, or Singapore), set a strong database password and wait for provisioning.
2. **Keys.** *Project Settings → API*: copy the **Project URL** and the **anon / publishable** key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Copy the **service_role** key into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` — this is for the local scripts only and must never be put in Vercel or prefixed `NEXT_PUBLIC_`.
3. **Migrations.** Install the Supabase CLI (it is a dev dependency: `pnpm supabase ...`), then:
   ```bash
   pnpm supabase login
   ```
   ```bash
   pnpm supabase link --project-ref <your-project-ref>
   ```
   ```bash
   pnpm supabase db push
   ```
   This creates every table, function, RLS policy, the three storage buckets and the realtime publication.
4. **Auth settings.** *Authentication → Providers*: keep **Email** enabled and turn **OFF** "Allow new users to sign up". *Authentication → URL Configuration*: set **Site URL** to the production URL and add `http://localhost:3000` and your Vercel preview pattern (for example `https://*-yourteam.vercel.app/**`) to **Redirect URLs**.
5. **First admin.** With `.env.local` pointing at the production project:
   ```bash
   pnpm bootstrap-admin
   ```
   It creates the Auth user with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, inserts the `administrators` row and is safe to re-run. Sign in and change the password at `/admin/account`.
   More admins: add the user in *Authentication → Users → Add user*, then run `pnpm add-admin someone@example.com`.
6. **Vercel.** Import the Git repository at https://vercel.com/new, framework preset **Next.js**, add only the three `NEXT_PUBLIC_` variables (`NEXT_PUBLIC_SITE_URL` = your production URL) in *Project Settings → Environment Variables*, and deploy. **Do not add the service-role key.**
7. **Realtime limits.** Supabase Realtime has plan-based limits on concurrent connections and messages per second. Check the current limits on https://supabase.com/pricing before the event. If more spectators than your plan allows are expected, upgrade the plan; when the cap is reached, pages automatically fall back to polling every 3 to 5 seconds (they stay correct, a little slower), see *Realtime and polling* below.

---

## 3. Deployment checklist

1. Supabase project created in a nearby region; keys copied; `supabase link` and `supabase db push` completed without errors.
2. Auth: email sign-up disabled; Site URL and redirect URLs set for production and `localhost`.
3. Storage: buckets `team-logos`, `player-photos`, `tournament-assets` exist (2 MB, PNG/JPEG/WebP only); an admin test upload works; an anonymous upload is denied.
4. Realtime: the tables are in the `supabase_realtime` publication (migration `0008`); a second browser sees a score change in under 2 seconds.
5. First admin created with `pnpm bootstrap-admin`; password changed at first login.
6. Vercel project created; only the three `NEXT_PUBLIC_` variables set; `pnpm build` passes; no secret in the repository (`git grep -n "service_role\|SERVICE_ROLE_KEY=ey"` returns nothing but docs).
7. `/robots.txt` blocks `/admin` and `/login`; the Open Graph preview of a team link and a match link looks right (paste into a chat app).
8. Production smoke test (on a staging project, or before real data is entered): public pages load without login; admin login works; create and delete a test announcement; create a dummy fixture, start it, score it, complete it, then correct or delete it; watch the public pages reflect every step.
9. Capacity: Supabase realtime limits depend on the plan; Vercel's free Hobby tier is for personal, non-commercial use and has usage limits. Check the current terms before the event and upgrade if a large audience or paid entry is expected.
10. Backup before the event: `pnpm supabase db dump -f backup.sql` (see `docs/ADMIN-GUIDE.md`). Point-in-time recovery depends on the Supabase plan.

---

## 4. Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server on :3000 |
| `pnpm build && pnpm start` | Production build and server |
| `pnpm typecheck` / `pnpm lint` | TypeScript strict check / ESLint |
| `pnpm test` | Vitest unit tests (98; domain logic, parity with SQL when the local DB is up) |
| `pnpm test:coverage` | Unit tests with coverage (domain logic ≥ 90%) |
| `pnpm test:db` | pgTAP database tests (`supabase test db`) |
| `pnpm test:concurrency` | Multi-connection concurrency tests against the local DB |
| `pnpm test:e2e` | Playwright end-to-end tests (resets the local DB; see docs/TESTING.md) |
| `pnpm db:types` | Regenerate `src/types/database.ts` after a schema change |

## 5. Realtime and polling

Public pages subscribe to Supabase Realtime (Postgres Changes). Each page subscribes first, then fetches, and refetches everything on every reconnect. If a channel is not connected for more than 5 seconds, the page polls (every 3 s on match pages and the auction display, 5 s elsewhere) until realtime is back. A small *Live / Reconnecting* indicator shows the state.

## 6. Projector / TV mode for the auction

Open `/auction/display` on the screen the audience watches and press **F** (or the button in the top-right corner that appears when you move the mouse) for full screen. The admin bids from `/admin/auction` on another device. On iPhone/iPad Safari, full screen for web pages is limited: use landscape and *Share → Add to Home Screen*, then open it from the home screen for a chrome-less window.

## 7. Repository layout

```text
supabase/migrations   0001 schema … 0008 realtime (the source of truth for every rule)
supabase/tests        pgTAP tests
scripts/              bootstrap-admin.ts, add-admin.ts, seed.ts (service role, local only)
src/app/(public)      public pages        src/app/(admin)/admin   admin pages
src/components        ui, layout, team, player, auction, fixtures, scoreboard, standings, bracket, admin
src/lib               supabase clients, domain logic, queries, actions (RPC wrapper), import/export, realtime
tests/unit            Vitest     tests/concurrency    pg multi-connection tests     tests/e2e   Playwright
```

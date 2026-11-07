/**
 * Concurrency tests (12.3) with real, separate Postgres connections against the local Supabase database.
 * They create a throw-away tournament, make it active for the duration, and restore the previous one at the end.
 *   pnpm test:concurrency
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ADMIN_ID = 'eeeeeeee-0000-0000-0000-00000000c0c0';

let failures = 0;
function check(cond: boolean, label: string, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
}

async function adminConn(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  await c.query(`set role authenticated`);
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })]);
  return c;
}

async function rpc(c: pg.Client, sql: string, params: unknown[] = []): Promise<{ ok: boolean; data?: Record<string, unknown>; code?: string }> {
  try {
    const { rows } = await c.query(sql, params);
    return { ok: true, data: rows[0]?.r };
  } catch (e) {
    return { ok: false, code: (e as Error).message };
  }
}

async function main() {
  const root = new pg.Client({ connectionString: DB_URL });
  await root.connect();
  const { rows: prev } = await root.query(`select id from public.tournaments where is_active`);
  const previousActive: string | undefined = prev[0]?.id;
  await root.query(`insert into auth.users (id, email, aud, role) values ($1, 'concurrency@test.local', 'authenticated', 'authenticated') on conflict do nothing`, [ADMIN_ID]);
  await root.query(`insert into public.administrators values ($1, 'concurrency@test.local') on conflict do nothing`, [ADMIN_ID]);
  await root.query(`update public.tournaments set is_active = false where is_active`);
  const { rows: t } = await root.query(`insert into public.tournaments (name, slug) values ('Concurrency Cup', $1) returning id`, [`concurrency-${Date.now()}`]);
  const tid: string = t[0].id;
  await root.query(`select public.ensure_tournament_children($1)`, [tid]);

  const conns = await Promise.all(Array.from({ length: 20 }, adminConn));
  const a = conns[0]!;
  try {
    for (const [i, n] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
      await a.query(`insert into public.teams (tournament_id, name, short_name, sort_order) values ($1, $2, $3, $4)`, [tid, n, n.slice(0, 3).toUpperCase(), i]);
    }
    const rows = Array.from({ length: 12 }, (_, i) => ({ row_number: i + 1, full_name: `C Player ${i + 1}`, primary_position: 'PG', base_price: 100 }));
    await a.query(`select public.import_players($1::jsonb)`, [JSON.stringify(rows)]);
    await a.query(`select public.save_auction_settings('{"purse_per_team":1000,"min_squad_size":1,"max_squad_size":4}', null)`);
    await a.query(`select public.start_auction_round(true)`);
    const { rows: teams } = await a.query(`select id, name from public.teams where tournament_id = $1 order by name`, [tid]);
    const { rows: players } = await a.query(`select id from public.players where tournament_id = $1 order by full_name`, [tid]);

    // 1. 20 parallel bids with the same expected current bid
    const lot = (await a.query(`select public.open_lot($1) r`, [players[0].id])).rows[0].r.lot.id as string;
    const bids = await Promise.all(
      conns.map((c, i) => rpc(c, `select public.place_bid($1, $2, 100, null, $3) r`, [lot, teams[i % 3].id, randomUUID()])),
    );
    const okBids = bids.filter((b) => b.ok).length;
    check(okBids === 1, '20 parallel place_bid: exactly one succeeds', `${okBids} ok`);
    check(bids.filter((b) => !b.ok).every((b) => b.code === 'BID_STALE'), 'the rest fail with BID_STALE');
    const { rows: lr } = await a.query(`select current_bid, bid_count from public.auction_lots where id = $1`, [lot]);
    check(Number(lr[0].current_bid) === 100 && lr[0].bid_count === 1, 'no double increment');

    // 2. 10 parallel mark_sold on one lot
    const sales = await Promise.all(conns.slice(0, 10).map((c) => rpc(c, `select public.mark_sold($1) r`, [lot])));
    check(sales.filter((s) => s.ok).length === 1, '10 parallel mark_sold: exactly one succeeds');
    check(sales.filter((s) => !s.ok).every((s) => s.code === 'LOT_NOT_LIVE'), 'the rest fail with LOT_NOT_LIVE');
    const { rows: rr } = await a.query(`select count(*)::int n from public.team_players where player_id = $1`, [players[0].id]);
    check(rr[0].n === 1, 'player has exactly one roster row');

    // 3. parallel placements to the same team never exceed purse or squad
    const target = teams[1].id;
    const placements = await Promise.all(
      players.slice(1, 11).map((p, i) => rpc(conns[i]!, `select public.reassign_player($1, $2, 300, 'parallel') r`, [p.id, target])),
    );
    const { rows: tr } = await a.query(`select purse_total, purse_spent, public.team_squad_count(id) squad from public.teams where id = $1`, [target]);
    check(Number(tr[0].purse_spent) <= Number(tr[0].purse_total), 'purse_spent never exceeds purse_total', `${tr[0].purse_spent}/${tr[0].purse_total}`);
    check(tr[0].squad <= 4, 'squad never exceeds the maximum', `${tr[0].squad}`);
    check(placements.filter((p) => !p.ok).every((p) => p.code === 'BID_EXCEEDS_PURSE' || p.code === 'TEAM_SQUAD_FULL'), 'refusals are BID_EXCEEDS_PURSE or TEAM_SQUAD_FULL');
    const { rows: inv } = await a.query(
      `select (select count(*) from public.teams t where t.tournament_id = $1 and t.purse_spent <> coalesce((select sum(price) from public.team_players tp where tp.team_id = t.id), 0))::int bad`,
      [tid],
    );
    check(inv[0].bad === 0, 'purse equals the sum of roster prices for every team');

    // 4. parallel scoring taps
    await a.query(`select public.complete_auction()`);
    await a.query(`select public.generate_league_fixtures('single', null, false)`);
    const { rows: fx } = await a.query(`select id from public.fixtures where tournament_id = $1 order by match_number limit 1`, [tid]);
    const fid = fx[0].id as string;
    await a.query(`select public.start_match($1)`, [fid]);
    const taps = await Promise.all(conns.map((c, i) => rpc(c, `select public.score_points($1, $2, $3, $4) r`, [fid, i % 2 ? 'away' : 'home', (i % 3) + 1, randomUUID()])));
    check(taps.every((x) => x.ok), '20 parallel score taps all land');
    const expectedHome = conns.reduce((s, _, i) => s + (i % 2 ? 0 : (i % 3) + 1), 0);
    const expectedAway = conns.reduce((s, _, i) => s + (i % 2 ? (i % 3) + 1 : 0), 0);
    const { rows: ms } = await a.query(`select home_score, away_score, version from public.match_states where fixture_id = $1`, [fid]);
    check(ms[0].home_score === expectedHome && ms[0].away_score === expectedAway, 'final score equals the sum of taps', `${ms[0].home_score}-${ms[0].away_score}`);
    const { rows: seqs } = await a.query(`select array_agg(seq order by seq) s from public.live_scoring_events where fixture_id = $1`, [fid]);
    const s: number[] = seqs[0].s;
    check(s.every((v, i) => v === i + 1) && s.length === 21, 'consecutive seq values 1..21');
    // duplicate retry
    const crid = randomUUID();
    const d = await Promise.all(conns.slice(0, 5).map((c) => rpc(c, `select public.score_points($1, 'home', 2, $2) r`, [fid, crid])));
    const { rows: ms2 } = await a.query(`select home_score from public.match_states where fixture_id = $1`, [fid]);
    check(d.every((x) => x.ok) && ms2[0].home_score === expectedHome + 2, '5 parallel retries with one request id land once');
  } finally {
    await Promise.all(conns.map((c) => c.end()));
    await root.query(`delete from public.tournaments where id = $1`, [tid]);
    if (previousActive) await root.query(`update public.tournaments set is_active = true where id = $1`, [previousActive]);
    await root.query(`delete from public.administrators where user_id = $1`, [ADMIN_ID]);
    await root.query(`delete from auth.users where id = $1`, [ADMIN_ID]);
    await root.end();
  }
  console.log(failures === 0 ? '\nAll concurrency checks passed.' : `\n${failures} concurrency check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

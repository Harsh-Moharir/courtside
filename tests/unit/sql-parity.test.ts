/**
 * Parity tests: the TypeScript copies in src/lib/domain must agree with the authoritative SQL
 * (compute_standings, round_robin_pairs, playoff_template) on the same inputs. Needs the local
 * Supabase database (pnpm db:start); skipped when it is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { computeStandings } from '@/lib/domain/standings';
import { generateRoundRobin } from '@/lib/domain/roundRobin';
import { bracketTemplate, type PlayoffFormat } from '@/lib/domain/bracket';
import { STANDINGS_CASES } from './standings-cases';

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let client: pg.Client | null = null;

beforeAll(async () => {
  const c = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    client = c;
  } catch {
    client = null;
  }
});
afterAll(async () => {
  await client?.end();
});

const settings = { win_points: 2, loss_points: 0, draw_points: 1, tiebreaker_order: ['head_to_head', 'point_difference', 'points_for'] };

describe('TypeScript and SQL agree', () => {
  for (const c of STANDINGS_CASES) {
    it(`standings: ${c.name}`, async (ctx) => {
      if (!client) return ctx.skip();
      const s = c.settings
        ? { win_points: c.settings.winPoints, loss_points: c.settings.lossPoints, draw_points: c.settings.drawPoints, tiebreaker_order: c.settings.tiebreakerOrder }
        : settings;
      const teams = c.teams.map((t) => ({ id: t.id, name: t.name, manual_tiebreak_rank: t.manualTiebreakRank }));
      const matches = c.matches.map((m) => ({
        home_team_id: m.homeTeamId,
        away_team_id: m.awayTeamId,
        home_score: m.homeScore,
        away_score: m.awayScore,
        winner_team_id: m.winnerTeamId,
      }));
      const { rows } = await client.query('select public.compute_standings($1::jsonb, $2::jsonb, $3::jsonb) r', [
        JSON.stringify(teams),
        JSON.stringify(matches),
        JSON.stringify(s),
      ]);
      const sql = rows[0].r as { team_id: string; rank: number; league_points: number; point_diff: number; tiebreak_note: string | null }[];
      const ts = computeStandings(c.teams, c.matches, c.settings ?? { winPoints: 2, lossPoints: 0, drawPoints: 1, tiebreakerOrder: ['head_to_head', 'point_difference', 'points_for'] });
      expect(sql.map((r) => r.team_id)).toEqual(ts.map((r) => r.teamId));
      expect(sql.map((r) => r.team_id)).toEqual(c.expectedOrder);
      expect(sql.map((r) => r.tiebreak_note)).toEqual(ts.map((r) => r.tiebreakNote));
      expect(sql.map((r) => r.league_points)).toEqual(ts.map((r) => r.leaguePoints));
      expect(sql.map((r) => r.point_diff)).toEqual(ts.map((r) => r.pointDiff));
    });
  }

  for (const n of [2, 5, 8, 10]) {
    for (const seed of [null, 7]) {
      it(`round robin n=${n} seed=${seed}`, async (ctx) => {
        if (!client) return ctx.skip();
        const teams = Array.from({ length: n }, () => randomUUID());
        const { rows } = await client.query(
          'select round_number, pair_index, home::text, away::text from public.round_robin_pairs($1::uuid[], true, $2)',
          [teams, seed],
        );
        const ts = generateRoundRobin(teams, true, seed);
        expect(rows.map((r) => [r.round_number, r.pair_index, r.home, r.away])).toEqual(ts.map((p) => [p.round, p.pairIndex, p.home, p.away]));
      });
    }
  }

  for (const f of ['direct_final', 'semis_final', 'ipl_page', 'single_elim_6', 'single_elim_8'] as PlayoffFormat[]) {
    it(`playoff template ${f}`, async (ctx) => {
      if (!client) return ctx.skip();
      const { rows } = await client.query('select * from public.playoff_template($1, true)', [f]);
      const ts = bracketTemplate(f, true);
      expect(rows.map((r) => [r.code, r.label, r.round_order, r.pos, r.home_kind, r.home_ref, r.away_kind, r.away_ref, r.is_final, r.is_third_place])).toEqual(
        ts.map((d) => [d.code, d.label, d.roundOrder, d.position, d.homeKind, d.homeRef, d.awayKind, d.awayRef, d.isFinal, d.isThirdPlace]),
      );
    });
  }
});

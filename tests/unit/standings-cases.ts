import { expect } from 'vitest';
import type { StandingRow, StandingsMatch, StandingsSettings, StandingsTeam } from '@/lib/domain/standings';

const T = (ids: string[]): StandingsTeam[] => ids.map((id) => ({ id, name: id, manualTiebreakRank: null }));
const m = (h: string, hs: number, as: number, a: string): StandingsMatch => ({
  homeTeamId: h,
  awayTeamId: a,
  homeScore: hs,
  awayScore: as,
  winnerTeamId: hs > as ? h : as > hs ? a : null,
});

export interface StandingsCase {
  name: string;
  teams: StandingsTeam[];
  matches: StandingsMatch[];
  settings?: StandingsSettings;
  expectedOrder: string[];
  extra?: (rows: StandingRow[]) => void;
}

/** Shared by the TypeScript unit tests and the TypeScript-vs-SQL parity test. */
export const STANDINGS_CASES: StandingsCase[] = [
  {
    name: 'case 1: three-way tie broken by head-to-head mini-table difference',
    teams: T(['A', 'B', 'C']),
    matches: [m('A', 80, 70, 'B'), m('B', 75, 60, 'C'), m('C', 65, 64, 'A')],
    expectedOrder: ['A', 'B', 'C'],
    extra: (rows) => {
      expect(rows[1]!.tiebreakNote).toBe('Head-to-head vs A');
      expect(rows[2]!.tiebreakNote).toBe('Head-to-head vs B');
    },
  },
  {
    name: 'case 2: head-to-head beats overall difference',
    teams: T(['A', 'B', 'C', 'D']),
    matches: [m('A', 60, 59, 'B'), m('A', 70, 40, 'C'), m('D', 65, 60, 'A'), m('B', 90, 60, 'C'), m('B', 80, 70, 'D'), m('C', 55, 50, 'D')],
    expectedOrder: ['A', 'B', 'C', 'D'],
    extra: (rows) => {
      expect(rows.map((r) => r.leaguePoints)).toEqual([4, 4, 2, 2]);
      expect(rows.map((r) => r.pointDiff)).toEqual([26, 39, -55, -10]);
    },
  },
  {
    name: 'case 5: only completed matches are passed in (live/postponed excluded by the caller)',
    teams: T(['A', 'B', 'C']),
    matches: [m('A', 70, 60, 'B')],
    expectedOrder: ['A', 'C', 'B'],
  },
  {
    name: 'agent case: 3-way tie where h2h splits one team off, then re-applies h2h to the remaining two',
    // A, B, C all 2-2. Mini-table: A 2-0 vs B,C ... construct: A beats B, A beats C, B beats C, C beats A? keep simple:
    teams: T(['A', 'B', 'C', 'D']),
    matches: [
      m('A', 70, 60, 'B'), // A > B
      m('B', 80, 50, 'C'), // B > C big
      m('C', 61, 60, 'A'), // C > A by 1
      m('D', 40, 90, 'A'), // A beats D
      m('D', 40, 90, 'B'), // B beats D
      m('D', 40, 90, 'C'), // C beats D
    ],
    // all of A,B,C: 4 pts. Mini-table among A,B,C: A +9, B +20, C -29 -> B, A, C
    expectedOrder: ['B', 'A', 'C', 'D'],
  },
  {
    name: 'agent case: 4-way tie with nested sub-groups and fallback',
    teams: [
      { id: 'A', name: 'Alpha', manualTiebreakRank: null },
      { id: 'B', name: 'Bravo', manualTiebreakRank: null },
      { id: 'C', name: 'Charlie', manualTiebreakRank: 1 },
      { id: 'D', name: 'Delta', manualTiebreakRank: null },
    ],
    // cyclic results with identical margins: A>B, B>C, C>D, D>A each by 10; A-C and B-D drawn? draws off -> make A>C, B>D by 5 and C>A? keep: 
    matches: [m('A', 60, 50, 'B'), m('B', 60, 50, 'C'), m('C', 60, 50, 'D'), m('D', 60, 50, 'A')],
    // all 2 pts, h2h within all four: each +0 diff, 2 pts -> unsplit; PD all 0; PF all 110 -> fallback: C (rank 1), then Alpha, Bravo, Delta
    expectedOrder: ['C', 'A', 'B', 'D'],
    extra: (rows) => {
      for (const r of rows.slice(1)) expect(r.tiebreakNote).toContain('Level on all criteria');
    },
  },
  {
    name: 'agent case: double round robin aggregates both meetings in head-to-head',
    teams: T(['A', 'B', 'C']),
    matches: [m('A', 60, 50, 'B'), m('B', 70, 65, 'A'), m('A', 80, 40, 'C'), m('C', 50, 45, 'A'), m('B', 50, 49, 'C'), m('C', 52, 60, 'B')],
    // A: W,L,W,L = 4 pts; B: L,W,W,W = 6; C: L,W,L,L = 2 -> B, A, C
    expectedOrder: ['B', 'A', 'C'],
  },
];

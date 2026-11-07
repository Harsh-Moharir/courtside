import { describe, expect, it } from 'vitest';
import { computeStandings, FALLBACK_NOTE, type StandingsMatch, type StandingsSettings, type StandingsTeam } from '@/lib/domain/standings';
import { STANDINGS_CASES } from './standings-cases';

const settings: StandingsSettings = { winPoints: 2, lossPoints: 0, drawPoints: 1, tiebreakerOrder: ['head_to_head', 'point_difference', 'points_for'] };

describe('standings worked examples (9.6)', () => {
  for (const c of STANDINGS_CASES) {
    it(c.name, () => {
      const rows = computeStandings(c.teams, c.matches, c.settings ?? settings);
      expect(rows.map((r) => r.teamId)).toEqual(c.expectedOrder);
      c.extra?.(rows);
    });
  }

  it('case 3: forfeit counts as played with forfeit_score', () => {
    const teams: StandingsTeam[] = [
      { id: 'A', name: 'A', manualTiebreakRank: null },
      { id: 'B', name: 'B', manualTiebreakRank: null },
    ];
    const m: StandingsMatch[] = [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 20, awayScore: 0, winnerTeamId: 'A' }];
    const [a, b] = computeStandings(teams, m, settings);
    expect(a).toMatchObject({ teamId: 'A', played: 1, wins: 1, pointsFor: 20, pointsAgainst: 0, leaguePoints: 2 });
    expect(b).toMatchObject({ teamId: 'B', played: 1, losses: 1, pointsFor: 0, pointsAgainst: 20, leaguePoints: 0 });
  });

  it('case 4: no matches uses manual rank then name; every note is the fallback', () => {
    const rows = computeStandings(
      [
        { id: 'A', name: 'A', manualTiebreakRank: 2 },
        { id: 'B', name: 'B', manualTiebreakRank: 1 },
        { id: 'C', name: 'C', manualTiebreakRank: null },
      ],
      [],
      settings,
    );
    expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
    for (const r of rows) expect(r.tiebreakNote).toBe(FALLBACK_NOTE);
  });

  it('draws give draw points and do not change W/L', () => {
    const rows = computeStandings(
      [
        { id: 'A', name: 'A', manualTiebreakRank: null },
        { id: 'B', name: 'B', manualTiebreakRank: null },
      ],
      [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 50, awayScore: 50, winnerTeamId: null }],
      settings,
    );
    for (const r of rows) expect(r).toMatchObject({ draws: 1, wins: 0, losses: 0, leaguePoints: 1 });
  });

  it('ranks are unique and start at 1', () => {
    const rows = computeStandings(STANDINGS_CASES[1]!.teams, STANDINGS_CASES[1]!.matches, settings);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('supports every tiebreaker criterion', () => {
    const teams: StandingsTeam[] = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, manualTiebreakRank: null }));
    // A and B both 1-1 and never met; A scored more, B conceded less, equal PD.
    const matches: StandingsMatch[] = [
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 90, awayScore: 80, winnerTeamId: 'A' },
      { homeTeamId: 'A', awayTeamId: 'D', homeScore: 70, awayScore: 80, winnerTeamId: 'D' },
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 60, awayScore: 50, winnerTeamId: 'B' },
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 40, awayScore: 50, winnerTeamId: 'D' },
    ];
    const pf = computeStandings(teams, matches, { ...settings, tiebreakerOrder: ['points_for'] });
    expect(pf.findIndex((r) => r.teamId === 'A')).toBeLessThan(pf.findIndex((r) => r.teamId === 'B'));
    const pa = computeStandings(teams, matches, { ...settings, tiebreakerOrder: ['points_against_lowest'] });
    expect(pa.findIndex((r) => r.teamId === 'B')).toBeLessThan(pa.findIndex((r) => r.teamId === 'A'));
    const wins = computeStandings(teams, matches, { ...settings, tiebreakerOrder: ['wins', 'point_difference'] });
    expect(wins[0]!.teamId).toBe('D');
    const b = pa.find((r) => r.teamId === 'B')!;
    expect(b.tiebreakNote).toBe('Fewest points against');
  });
});

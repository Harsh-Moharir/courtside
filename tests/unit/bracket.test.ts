import { describe, expect, it } from 'vitest';
import { bracketTemplate, layoutBracket, resolveBracket, sourceText, supportsThirdPlace, FORMAT_TEAMS, type NodeResult, type PlayoffFormat } from '@/lib/domain/bracket';

const counts: Record<PlayoffFormat, [number, number]> = {
  direct_final: [1, 1],
  semis_final: [3, 4],
  ipl_page: [4, 4],
  single_elim_6: [5, 6],
  single_elim_8: [7, 8],
};

describe('bracket formats (10.1)', () => {
  for (const [format, [without, withThird]] of Object.entries(counts) as [PlayoffFormat, [number, number]][]) {
    it(`${format}: node counts and wiring`, () => {
      expect(bracketTemplate(format, false)).toHaveLength(without);
      expect(bracketTemplate(format, true)).toHaveLength(withThird);
      const defs = bracketTemplate(format, true);
      const codes = new Set(defs.map((d) => d.code));
      expect(defs.filter((d) => d.isFinal)).toHaveLength(1);
      for (const d of defs) {
        for (const [k, r] of [[d.homeKind, d.homeRef], [d.awayKind, d.awayRef]] as const) {
          if (k === 'seed') expect(Number(r)).toBeLessThanOrEqual(FORMAT_TEAMS[format]);
          else expect(codes.has(r)).toBe(true);
        }
      }
      const seeds = defs.flatMap((d) => [d.homeKind === 'seed' ? d.homeRef : null, d.awayKind === 'seed' ? d.awayRef : null]).filter(Boolean);
      expect(new Set(seeds).size).toBe(FORMAT_TEAMS[format]);
      const l = layoutBracket(defs);
      expect(l.nodes).toHaveLength(defs.length);
      expect(l.width).toBeGreaterThan(0);
    });
  }

  it('third place only for formats with semifinals', () => {
    expect(supportsThirdPlace('semis_final')).toBe(true);
    expect(supportsThirdPlace('ipl_page')).toBe(false);
    expect(supportsThirdPlace('direct_final')).toBe(false);
  });

  it('semis_final: winners and losers propagate', () => {
    const defs = bracketTemplate('semis_final', true);
    const seeds = ['S1', 'S2', 'S3', 'S4'];
    const results: Record<string, NodeResult> = {
      SF1: { status: 'completed', homeTeamId: 'S1', awayTeamId: 'S4', winnerTeamId: 'S4' },
      SF2: { status: 'upcoming', homeTeamId: null, awayTeamId: null, winnerTeamId: null },
    };
    let r = resolveBracket(defs, seeds, results);
    expect(r.SF1).toEqual({ home: 'S1', away: 'S4' });
    expect(r.SF2).toEqual({ home: 'S2', away: 'S3' });
    expect(r.F).toEqual({ home: 'S4', away: null });
    expect(r['3P']).toEqual({ home: 'S1', away: null });
    results.SF2 = { status: 'completed', homeTeamId: 'S2', awayTeamId: 'S3', winnerTeamId: 'S2' };
    r = resolveBracket(defs, seeds, results);
    expect(r.F).toEqual({ home: 'S4', away: 'S2' });
    expect(r['3P']).toEqual({ home: 'S1', away: 'S3' });
  });

  it('ipl_page: loser of Q1 goes to Q2, winner of Q1 straight to the final', () => {
    const defs = bracketTemplate('ipl_page', false);
    const r = resolveBracket(defs, ['A', 'B', 'C', 'D'], {
      Q1: { status: 'completed', homeTeamId: 'A', awayTeamId: 'B', winnerTeamId: 'A' },
      ELIM: { status: 'completed', homeTeamId: 'C', awayTeamId: 'D', winnerTeamId: 'D' },
    });
    expect(r.Q2).toEqual({ home: 'B', away: 'D' });
    expect(r.F).toEqual({ home: 'A', away: null });
  });

  it('single_elim_6 and single_elim_8 seed placement', () => {
    const r6 = resolveBracket(bracketTemplate('single_elim_6', false), ['1', '2', '3', '4', '5', '6'], {});
    expect(r6.QF1).toEqual({ home: '3', away: '6' });
    expect(r6.SF1).toEqual({ home: '1', away: null });
    const r8 = resolveBracket(bracketTemplate('single_elim_8', false), ['1', '2', '3', '4', '5', '6', '7', '8'], {});
    expect(r8.QF1).toEqual({ home: '1', away: '8' });
    expect(r8.QF4).toEqual({ home: '3', away: '6' });
  });

  it('empty seeds leave every slot empty; live fixtures are never rewritten', () => {
    const defs = bracketTemplate('semis_final', false);
    const r = resolveBracket(defs, [], { SF1: { status: 'live', homeTeamId: 'X', awayTeamId: 'Y', winnerTeamId: null } });
    expect(r.SF1).toEqual({ home: 'X', away: 'Y' });
    expect(r.SF2).toEqual({ home: null, away: null });
  });

  it('source text', () => {
    expect(sourceText('seed', '3')).toBe('Seed 3 (decided after the league)');
    expect(sourceText('winner_of', 'SF1')).toBe('Winner of SF1');
    expect(sourceText('loser_of', 'Q1')).toBe('Loser of Q1');
  });
});

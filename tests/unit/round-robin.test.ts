import { describe, expect, it } from 'vitest';
import { byesByRound, generateRoundRobin, seededShuffle } from '@/lib/domain/roundRobin';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

describe('round robin (7.1)', () => {
  for (let n = 2; n <= 10; n++) {
    for (const double of [false, true]) {
      it(`n=${n} ${double ? 'double' : 'single'}: properties hold`, () => {
        const ts = teams(n);
        const p = generateRoundRobin(ts, double);
        expect(p.length).toBe(double ? n * (n - 1) : (n * (n - 1)) / 2);

        // every pair meets once (single) or twice (double), each team at home once in double
        const meetings = new Map<string, number>();
        const homeIn = new Map<string, number>();
        for (const m of p) {
          const key = [m.home, m.away].sort().join('-');
          meetings.set(key, (meetings.get(key) ?? 0) + 1);
          homeIn.set(`${m.home}>${m.away}`, (homeIn.get(`${m.home}>${m.away}`) ?? 0) + 1);
        }
        expect(meetings.size).toBe((n * (n - 1)) / 2);
        for (const c of meetings.values()) expect(c).toBe(double ? 2 : 1);
        if (double) for (const c of homeIn.values()) expect(c).toBe(1);

        // no team plays twice in one round
        const byRound = new Map<number, string[]>();
        for (const m of p) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.home, m.away]);
        for (const list of byRound.values()) expect(new Set(list).size).toBe(list.length);

        // number of rounds: n-1 (even) or n (odd) per cycle
        const perCycle = n % 2 === 0 ? n - 1 : n;
        expect(byRound.size).toBe(double ? perCycle * 2 : perCycle);

        // home/away balance
        for (const t of ts) {
          const home = p.filter((m) => m.home === t).length;
          const away = p.filter((m) => m.away === t).length;
          if (double) expect(home).toBe(away);
          else expect(Math.abs(home - away)).toBeLessThanOrEqual(2);
        }

        // odd n: every team rests exactly once per cycle
        if (n % 2 === 1) {
          const byes = byesByRound(ts, p);
          const rests = new Map<string, number>();
          for (const list of byes.values()) for (const t of list) rests.set(t, (rests.get(t) ?? 0) + 1);
          for (const t of ts) expect(rests.get(t)).toBe(double ? 2 : 1);
        }
      });
    }
  }

  it('is deterministic and the seeded shuffle is a permutation', () => {
    const ts = teams(8);
    expect(generateRoundRobin(ts, false, 7)).toEqual(generateRoundRobin(ts, false, 7));
    const s = seededShuffle(ts, 12345);
    expect([...s].sort()).toEqual(ts);
    expect(s).not.toEqual(ts);
  });

  it('returns nothing for fewer than 2 teams', () => {
    expect(generateRoundRobin(['A'], false)).toEqual([]);
  });

  it('match order is round then pair position', () => {
    const p = generateRoundRobin(teams(6), true);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      expect(a.round < b.round || (a.round === b.round && a.pairIndex < b.pairIndex)).toBe(true);
    }
  });
});

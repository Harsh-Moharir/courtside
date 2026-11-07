/**
 * Circle-method round robin (7.1). Mirrors public.round_robin_pairs() in SQL exactly,
 * including the seeded shuffle (31-bit LCG with glibc constants).
 */
export interface Pairing {
  round: number; // 1-based
  pairIndex: number;
  home: string;
  away: string;
}

export function lcgNext(state: number): number {
  // (state * 1103515245 + 12345) mod 2^31, computed with BigInt to avoid precision loss.
  return Number((BigInt(state) * 1103515245n + 12345n) % 2147483648n);
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const t = [...items];
  let state = Math.abs(seed) % 2147483648;
  for (let i = t.length - 1; i >= 1; i--) {
    state = lcgNext(state);
    const j = state % (i + 1);
    [t[i], t[j]] = [t[j] as T, t[i] as T];
  }
  return t;
}

export function generateRoundRobin(teams: string[], double: boolean, seed: number | null = null): Pairing[] {
  if (teams.length < 2) return [];
  let t: (string | null)[] = seed === null ? [...teams] : seededShuffle(teams, seed);
  if (t.length % 2 === 1) t.push(null);
  const m = t.length;
  const homeCount = new Map<string, number>();
  const lastAway = new Map<string, boolean>();
  const out: Pairing[] = [];
  for (let r = 0; r <= m - 2; r++) {
    for (let i = 0; i <= m / 2 - 1; i++) {
      const a = t[i];
      const b = t[m - 1 - i];
      if (!a || !b) continue;
      const ha = homeCount.get(a) ?? 0;
      const hb = homeCount.get(b) ?? 0;
      const la = lastAway.get(a) ?? false;
      const lb = lastAway.get(b) ?? false;
      let home: string;
      let away: string;
      if (ha < hb) [home, away] = [a, b];
      else if (hb < ha) [home, away] = [b, a];
      else if (la && !lb) [home, away] = [a, b];
      else if (lb && !la) [home, away] = [b, a];
      else if ((r + i) % 2 === 0) [home, away] = [a, b];
      else [home, away] = [b, a];
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
      lastAway.set(home, false);
      lastAway.set(away, true);
      out.push({ round: r + 1, pairIndex: i, home, away });
    }
    t = [t[0] as string | null, t[m - 1] as string | null, ...t.slice(1, m - 1)];
  }
  if (double) {
    const firstLeg = [...out];
    for (const p of firstLeg) out.push({ round: p.round + (m - 1), pairIndex: p.pairIndex, home: p.away, away: p.home });
  }
  return out;
}

/** Teams resting in a round (odd team counts). */
export function byesByRound(teams: string[], pairings: Pairing[]): Map<number, string[]> {
  const rounds = new Map<number, Set<string>>();
  for (const p of pairings) {
    const s = rounds.get(p.round) ?? new Set<string>();
    s.add(p.home);
    s.add(p.away);
    rounds.set(p.round, s);
  }
  const out = new Map<number, string[]>();
  for (const [r, playing] of rounds) out.set(r, teams.filter((t) => !playing.has(t)));
  return out;
}

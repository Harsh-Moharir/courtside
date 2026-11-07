/**
 * TypeScript copy of the authoritative SQL function `compute_standings` (0007).
 * Used for unit tests, parity tests against SQL, and UI previews. Never authoritative.
 */
export type Tiebreaker = 'head_to_head' | 'point_difference' | 'points_for' | 'points_against_lowest' | 'wins';
export type Reason = Tiebreaker | 'fallback';

export interface StandingsTeam {
  id: string;
  name: string;
  manualTiebreakRank: number | null;
}

export interface StandingsMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  /** null means a draw */
  winnerTeamId: string | null;
}

export interface StandingsSettings {
  winPoints: number;
  lossPoints: number;
  drawPoints: number;
  tiebreakerOrder: Tiebreaker[];
}

export interface StandingRow {
  teamId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  leaguePoints: number;
  tiebreakNote: string | null;
}

export const FALLBACK_NOTE = 'Level on all criteria, ordered by admin ranking or name';

export function reasonLabel(reason: Reason, otherName: string): string {
  switch (reason) {
    case 'head_to_head':
      return `Head-to-head vs ${otherName}`;
    case 'point_difference':
      return 'Point difference';
    case 'points_for':
      return 'Points scored';
    case 'points_against_lowest':
      return 'Fewest points against';
    case 'wins':
      return 'Wins';
    case 'fallback':
      return FALLBACK_NOTE;
  }
}

interface Stat {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pf: number;
  pa: number;
  pts: number;
}

interface Ranked {
  id: string;
  reason: Reason | null;
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0); // descending
    if (d !== 0) return d;
  }
  return 0;
}

function sameKey(a: number[], b: number[]): boolean {
  return compareKeys(a, b) === 0;
}

/** Byte-wise comparison of lower-cased names, matching `lower(name) collate "C"` in SQL. */
function cmpText(a: string, b: string): number {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(ea.length, eb.length); i++) {
    if (ea[i] !== eb[i]) return (ea[i] as number) - (eb[i] as number);
  }
  return ea.length - eb.length;
}

export function computeStandings(
  teams: StandingsTeam[],
  matches: StandingsMatch[],
  settings: StandingsSettings,
): StandingRow[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const stats = new Map<string, Stat>();
  for (const t of teams) stats.set(t.id, { played: 0, wins: 0, losses: 0, draws: 0, pf: 0, pa: 0, pts: 0 });

  const counted = matches.filter((m) => stats.has(m.homeTeamId) && stats.has(m.awayTeamId));
  for (const m of counted) {
    for (const side of ['home', 'away'] as const) {
      const id = side === 'home' ? m.homeTeamId : m.awayTeamId;
      const s = stats.get(id) as Stat;
      s.played += 1;
      s.pf += side === 'home' ? m.homeScore : m.awayScore;
      s.pa += side === 'home' ? m.awayScore : m.homeScore;
      if (m.winnerTeamId === null) s.draws += 1;
      else if (m.winnerTeamId === id) s.wins += 1;
      else s.losses += 1;
    }
  }
  for (const s of stats.values()) {
    s.pts = s.wins * settings.winPoints + s.losses * settings.lossPoints + s.draws * settings.drawPoints;
  }

  const fallbackSort = (ids: string[]): string[] =>
    [...ids].sort((a, b) => {
      const ta = byId.get(a) as StandingsTeam;
      const tb = byId.get(b) as StandingsTeam;
      const ra = ta.manualTiebreakRank;
      const rb = tb.manualTiebreakRank;
      if (ra !== rb) {
        if (ra === null) return 1;
        if (rb === null) return -1;
        return ra - rb;
      }
      const n = cmpText(ta.name.toLowerCase(), tb.name.toLowerCase());
      if (n !== 0) return n;
      return cmpText(a, b);
    });

  const keyFor = (c: Tiebreaker, id: string, group: string[]): number[] => {
    const s = stats.get(id) as Stat;
    switch (c) {
      case 'head_to_head': {
        let pts = 0;
        let diff = 0;
        const inGroup = new Set(group);
        for (const m of counted) {
          if (!inGroup.has(m.homeTeamId) || !inGroup.has(m.awayTeamId)) continue;
          if (m.homeTeamId !== id && m.awayTeamId !== id) continue;
          const own = m.homeTeamId === id ? m.homeScore : m.awayScore;
          const opp = m.homeTeamId === id ? m.awayScore : m.homeScore;
          diff += own - opp;
          if (m.winnerTeamId === null) pts += settings.drawPoints;
          else if (m.winnerTeamId === id) pts += settings.winPoints;
          else pts += settings.lossPoints;
        }
        return [pts, diff];
      }
      case 'point_difference':
        return [s.pf - s.pa];
      case 'points_for':
        return [s.pf];
      case 'points_against_lowest':
        return [-s.pa];
      case 'wins':
        return [s.wins];
    }
  };

  const rankGroup = (group: string[], k: number): Ranked[] => {
    if (group.length === 1) return [{ id: group[0] as string, reason: null }];
    const order = settings.tiebreakerOrder;
    if (k >= order.length) {
      return fallbackSort(group).map((id, i) => ({ id, reason: i === 0 ? null : 'fallback' }));
    }
    const c = order[k] as Tiebreaker;
    const keyed = group.map((id) => ({ id, key: keyFor(c, id, group) }));
    keyed.sort((a, b) => compareKeys(a.key, b.key) || cmpText(a.id, b.id));
    const subgroups: string[][] = [];
    let prevKey: number[] | null = null;
    for (const item of keyed) {
      if (prevKey && sameKey(prevKey, item.key)) (subgroups[subgroups.length - 1] as string[]).push(item.id);
      else subgroups.push([item.id]);
      prevKey = item.key;
    }
    if (subgroups.length === 1) return rankGroup(group, k + 1);
    const out: Ranked[] = [];
    subgroups.forEach((sg, si) => {
      const sub = sg.length > 1 ? rankGroup(sg, 0) : [{ id: sg[0] as string, reason: null }];
      if (si > 0) (sub[0] as Ranked).reason = c;
      out.push(...sub);
    });
    return out;
  };

  // Group by league points (descending).
  const byPoints = [...teams.map((t) => t.id)].sort(
    (a, b) => (stats.get(b) as Stat).pts - (stats.get(a) as Stat).pts || cmpText(a, b),
  );
  const ordered: Ranked[] = [];
  let i = 0;
  while (i < byPoints.length) {
    const pts = (stats.get(byPoints[i] as string) as Stat).pts;
    const group: string[] = [];
    while (i < byPoints.length && (stats.get(byPoints[i] as string) as Stat).pts === pts) {
      group.push(byPoints[i] as string);
      i++;
    }
    const ranked = group.length > 1 ? rankGroup(group, 0) : [{ id: group[0] as string, reason: null }];
    (ranked[0] as Ranked).reason = null;
    ordered.push(...ranked);
  }

  return ordered.map((r, idx) => {
    const s = stats.get(r.id) as Stat;
    const above = ordered[idx - 1];
    const below = ordered[idx + 1];
    let note: string | null = null;
    if (above && (stats.get(above.id) as Stat).pts === s.pts && r.reason) {
      note = reasonLabel(r.reason, (byId.get(above.id) as StandingsTeam).name);
    } else if (below && (stats.get(below.id) as Stat).pts === s.pts && below.reason) {
      note = reasonLabel(below.reason, (byId.get(below.id) as StandingsTeam).name);
    }
    return {
      teamId: r.id,
      rank: idx + 1,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      pointsFor: s.pf,
      pointsAgainst: s.pa,
      pointDiff: s.pf - s.pa,
      leaguePoints: s.pts,
      tiebreakNote: note,
    };
  });
}

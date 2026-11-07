/** Playoff bracket formats, resolution and fixed-geometry layout (section 10). Mirrors SQL playoff_template(). */
export type PlayoffFormat = 'direct_final' | 'semis_final' | 'ipl_page' | 'single_elim_6' | 'single_elim_8';
export type SourceKind = 'seed' | 'winner_of' | 'loser_of';

export interface NodeDef {
  code: string;
  label: string;
  roundOrder: number;
  position: number;
  homeKind: SourceKind;
  homeRef: string;
  awayKind: SourceKind;
  awayRef: string;
  isFinal: boolean;
  isThirdPlace: boolean;
}

const n = (
  code: string,
  label: string,
  roundOrder: number,
  position: number,
  homeKind: SourceKind,
  homeRef: string,
  awayKind: SourceKind,
  awayRef: string,
  isFinal = false,
  isThirdPlace = false,
): NodeDef => ({ code, label, roundOrder, position, homeKind, homeRef, awayKind, awayRef, isFinal, isThirdPlace });

const TEMPLATES: Record<PlayoffFormat, NodeDef[]> = {
  direct_final: [n('F', 'Final', 1, 1, 'seed', '1', 'seed', '2', true)],
  semis_final: [
    n('SF1', 'Semifinal 1', 1, 1, 'seed', '1', 'seed', '4'),
    n('SF2', 'Semifinal 2', 1, 2, 'seed', '2', 'seed', '3'),
    n('F', 'Final', 2, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true),
    n('3P', 'Third place', 2, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true),
  ],
  ipl_page: [
    n('Q1', 'Qualifier 1', 1, 1, 'seed', '1', 'seed', '2'),
    n('ELIM', 'Eliminator', 1, 2, 'seed', '3', 'seed', '4'),
    n('Q2', 'Qualifier 2', 2, 1, 'loser_of', 'Q1', 'winner_of', 'ELIM'),
    n('F', 'Final', 3, 1, 'winner_of', 'Q1', 'winner_of', 'Q2', true),
  ],
  single_elim_6: [
    n('QF1', 'Quarterfinal 1', 1, 1, 'seed', '3', 'seed', '6'),
    n('QF2', 'Quarterfinal 2', 1, 2, 'seed', '4', 'seed', '5'),
    n('SF1', 'Semifinal 1', 2, 1, 'seed', '1', 'winner_of', 'QF2'),
    n('SF2', 'Semifinal 2', 2, 2, 'seed', '2', 'winner_of', 'QF1'),
    n('F', 'Final', 3, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true),
    n('3P', 'Third place', 3, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true),
  ],
  single_elim_8: [
    n('QF1', 'Quarterfinal 1', 1, 1, 'seed', '1', 'seed', '8'),
    n('QF2', 'Quarterfinal 2', 1, 2, 'seed', '4', 'seed', '5'),
    n('QF3', 'Quarterfinal 3', 1, 3, 'seed', '2', 'seed', '7'),
    n('QF4', 'Quarterfinal 4', 1, 4, 'seed', '3', 'seed', '6'),
    n('SF1', 'Semifinal 1', 2, 1, 'winner_of', 'QF1', 'winner_of', 'QF2'),
    n('SF2', 'Semifinal 2', 2, 2, 'winner_of', 'QF3', 'winner_of', 'QF4'),
    n('F', 'Final', 3, 1, 'winner_of', 'SF1', 'winner_of', 'SF2', true),
    n('3P', 'Third place', 3, 2, 'loser_of', 'SF1', 'loser_of', 'SF2', false, true),
  ],
};

export const FORMAT_TEAMS: Record<PlayoffFormat, number> = {
  direct_final: 2,
  semis_final: 4,
  ipl_page: 4,
  single_elim_6: 6,
  single_elim_8: 8,
};

export const FORMAT_LABELS: Record<PlayoffFormat, string> = {
  direct_final: 'Direct final (top 2)',
  semis_final: 'Semifinals and final (top 4)',
  ipl_page: 'IPL page playoff (top 4)',
  single_elim_6: 'Single elimination (top 6, byes for 1 and 2)',
  single_elim_8: 'Single elimination (top 8)',
};

export function supportsThirdPlace(f: PlayoffFormat): boolean {
  return f === 'semis_final' || f === 'single_elim_6' || f === 'single_elim_8';
}

export function bracketTemplate(format: PlayoffFormat, thirdPlace: boolean): NodeDef[] {
  return TEMPLATES[format].filter((d) => !d.isThirdPlace || (thirdPlace && supportsThirdPlace(format)));
}

export interface NodeResult {
  status: 'upcoming' | 'live' | 'completed' | 'postponed';
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
}

/** Re-derives the teams of every node from seeds and results (10.4). */
export function resolveBracket(
  defs: NodeDef[],
  seeds: (string | null)[],
  results: Record<string, NodeResult>,
): Record<string, { home: string | null; away: string | null }> {
  const out: Record<string, { home: string | null; away: string | null }> = {};
  const side = (kind: SourceKind, ref: string): string | null => {
    if (kind === 'seed') return seeds[Number(ref) - 1] ?? null;
    const r = results[ref];
    if (!r || r.status !== 'completed' || !r.winnerTeamId) return null;
    if (kind === 'winner_of') return r.winnerTeamId;
    return r.winnerTeamId === r.homeTeamId ? r.awayTeamId : r.homeTeamId;
  };
  const sorted = [...defs].sort((a, b) => a.roundOrder - b.roundOrder || a.position - b.position);
  for (const d of sorted) {
    const r = results[d.code];
    if (r && (r.status === 'live' || r.status === 'completed')) {
      out[d.code] = { home: r.homeTeamId, away: r.awayTeamId };
    } else {
      out[d.code] = { home: side(d.homeKind, d.homeRef), away: side(d.awayKind, d.awayRef) };
    }
    // Downstream nodes read results[] for completed nodes; keep team ids in sync for loser_of lookups.
    if (r) results[d.code] = { ...r, homeTeamId: out[d.code]!.home, awayTeamId: out[d.code]!.away };
  }
  return out;
}

export function sourceText(kind: SourceKind, ref: string): string {
  if (kind === 'seed') return `Seed ${ref} (decided after the league)`;
  return kind === 'winner_of' ? `Winner of ${ref}` : `Loser of ${ref}`;
}

export const CARD_W = 260;
export const CARD_H = 96;
export const GAP_Y = 24;
export const GAP_X = 48;

export interface LaidOutNode {
  code: string;
  x: number;
  y: number;
}

/**
 * Fixed geometry (10.6): one column per round; a later node is centred between the nodes that feed it
 * through winner_of; the third-place node sits below the final.
 */
export function layoutBracket(defs: NodeDef[]): { nodes: LaidOutNode[]; width: number; height: number; edges: { from: string; to: string; dashed: boolean }[] } {
  const rounds = [...new Set(defs.map((d) => d.roundOrder))].sort((a, b) => a - b);
  const pos = new Map<string, { x: number; y: number }>();
  const byCode = new Map(defs.map((d) => [d.code, d]));
  rounds.forEach((r, ri) => {
    const inRound = defs.filter((d) => d.roundOrder === r && !d.isThirdPlace).sort((a, b) => a.position - b.position);
    let nextFreeY = 0;
    inRound.forEach((d, i) => {
      const x = ri * (CARD_W + GAP_X);
      const feeders = [d.homeKind === 'winner_of' ? d.homeRef : null, d.awayKind === 'winner_of' ? d.awayRef : null]
        .filter((c): c is string => !!c && pos.has(c))
        .map((c) => (pos.get(c) as { y: number }).y);
      let y: number;
      if (feeders.length > 0) {
        y = feeders.reduce((a, b) => a + b, 0) / feeders.length;
        if (feeders.length === 1 && ri > 0) {
          // A node fed by one winner and one seed: place it level with its feeder.
          y = feeders[0] as number;
        }
      } else {
        y = i * (CARD_H + GAP_Y);
      }
      y = Math.max(y, nextFreeY);
      nextFreeY = y + CARD_H + GAP_Y;
      pos.set(d.code, { x, y });
    });
  });
  const third = defs.find((d) => d.isThirdPlace);
  const final = defs.find((d) => d.isFinal);
  if (third && final) {
    const fp = pos.get(final.code) ?? { x: 0, y: 0 };
    const maxY = Math.max(...[...pos.values()].map((p) => p.y));
    pos.set(third.code, { x: fp.x, y: Math.max(fp.y + CARD_H + GAP_Y * 2, maxY + CARD_H + GAP_Y) });
  }
  const nodes = defs.map((d) => ({ code: d.code, ...(pos.get(d.code) ?? { x: 0, y: 0 }) }));
  const edges: { from: string; to: string; dashed: boolean }[] = [];
  for (const d of defs) {
    for (const [kind, ref] of [
      [d.homeKind, d.homeRef],
      [d.awayKind, d.awayRef],
    ] as const) {
      if (kind !== 'seed' && byCode.has(ref)) edges.push({ from: ref, to: d.code, dashed: kind === 'loser_of' });
    }
  }
  const width = Math.max(...nodes.map((p) => p.x)) + CARD_W;
  const height = Math.max(...nodes.map((p) => p.y)) + CARD_H;
  return { nodes, width, height, edges };
}

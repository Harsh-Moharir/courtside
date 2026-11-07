'use client';
import { useMemo } from 'react';
import { CARD_H, CARD_W, GAP_X, layoutBracket, type NodeDef } from '@/lib/domain/bracket';
import type { PlayoffsData, PlayoffNodeView } from '@/lib/queries/playoffs';
import { BracketCard, nodeSides } from './bracket-card';

const HEADER = 36;

export function toDefs(nodes: PlayoffNodeView[]): NodeDef[] {
  return nodes.map((n) => ({
    code: n.code,
    label: n.label,
    roundOrder: n.round_order,
    position: n.position,
    homeKind: n.home_kind,
    homeRef: n.home_ref,
    awayKind: n.away_kind,
    awayRef: n.away_ref,
    isFinal: n.is_final,
    isThirdPlace: n.is_third_place,
  }));
}

export function roundName(nodes: PlayoffNodeView[]): string {
  const codes = nodes.filter((n) => !n.is_third_place).map((n) => n.code);
  if (nodes.some((n) => n.is_final)) return nodes.some((n) => n.is_third_place) ? 'Final & third place' : 'Final';
  if (codes.every((c) => c.startsWith('QF'))) return 'Quarterfinals';
  if (codes.every((c) => c.startsWith('SF'))) return 'Semifinals';
  return nodes.map((n) => n.label).join(' & ');
}

export function seedLookup(data: PlayoffsData): (teamId: string) => number | null {
  const seeds = Array.isArray(data.bracket?.seeds) ? (data.bracket?.seeds as { seed: number; team_id: string }[]) : [];
  const map = new Map(seeds.map((s) => [s.team_id, s.seed]));
  return (id) => map.get(id) ?? null;
}

/** Desktop: fixed geometry with SVG connectors. Mobile (<768px): stacked round sections without connectors (10.6). */
export function BracketView({ data }: { data: PlayoffsData }) {
  const defs = useMemo(() => toDefs(data.nodes), [data.nodes]);
  const layout = useMemo(() => (defs.length ? layoutBracket(defs) : null), [defs]);
  const seedOf = seedLookup(data);
  const rounds = [...new Set(data.nodes.map((n) => n.round_order))].sort((a, b) => a - b);
  if (!layout) return null;
  const byCode = new Map(data.nodes.map((n) => [n.code, n]));
  const pos = new Map(layout.nodes.map((p) => [p.code, p]));
  const sideY = (code: string, to: string) => {
    const target = byCode.get(to);
    const p = pos.get(to);
    if (!target || !p) return 0;
    const isHome = target.home_ref === code && target.home_kind !== 'seed';
    // header 24px, rows 34px each
    return HEADER + p.y + 24 + (isHome ? 17 : 51);
  };

  return (
    <>
      <div className="scrollbar-thin hidden overflow-x-auto pb-4 md:block">
        <div className="relative" style={{ width: layout.width, height: layout.height + HEADER }}>
          {rounds.map((r, i) => (
            <div
              key={r}
              className="absolute top-0 font-display text-sm font-bold uppercase tracking-wider text-muted"
              style={{ left: i * (CARD_W + GAP_X), width: CARD_W }}
            >
              {roundName(data.nodes.filter((n) => n.round_order === r))}
            </div>
          ))}
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height + HEADER} aria-hidden>
            {layout.edges.map((e) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + CARD_W;
              const y1 = HEADER + a.y + CARD_H / 2;
              const x2 = b.x;
              const y2 = sideY(e.from, e.to);
              const mid = x1 + GAP_X / 2;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M${x1} ${y1} H${mid} V${y2} H${x2}`}
                  fill="none"
                  stroke={e.dashed ? '#737373' : '#F97316'}
                  strokeOpacity={e.dashed ? 0.8 : 0.6}
                  strokeWidth={2}
                  strokeDasharray={e.dashed ? '5 5' : undefined}
                />
              );
            })}
          </svg>
          {data.nodes.map((n) => {
            const p = pos.get(n.code);
            if (!p) return null;
            return (
              <BracketCard
                key={n.id}
                node={n}
                sides={nodeSides(n, data.teams, seedOf)}
                quarters={data.quarters}
                className="absolute"
                style={{ left: p.x, top: HEADER + p.y, width: CARD_W, height: CARD_H }}
              />
            );
          })}
        </div>
      </div>
      <div className="space-y-6 md:hidden">
        {rounds.map((r) => {
          const nodes = data.nodes.filter((n) => n.round_order === r);
          return (
            <section key={r} aria-label={roundName(nodes)}>
              <h3 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-muted">{roundName(nodes)}</h3>
              <div className="space-y-3">
                {nodes.map((n) => (
                  <BracketCard key={n.id} node={n} sides={nodeSides(n, data.teams, seedOf)} quarters={data.quarters} compact={false} className="w-full" />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

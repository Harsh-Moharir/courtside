'use client';
import { useEffect, useMemo, useRef } from 'react';
import { FixtureRow } from './fixture-row';
import { EmptyState } from '@/components/ui/misc';
import { useTournament } from '@/components/providers/tournament-context';
import { dayKey, formatInTournamentTz } from '@/lib/format';
import type { FixtureTeam, FixtureView } from '@/lib/queries/fixtures';

export interface DateGroup {
  key: string; // yyyy-MM-dd or 'tba'
  label: string;
  fixtures: FixtureView[];
}

export function groupByDate(fixtures: FixtureView[], tz: string): DateGroup[] {
  const map = new Map<string, FixtureView[]>();
  for (const f of fixtures) {
    const k = f.scheduled_at ? dayKey(f.scheduled_at, tz) : 'tba';
    const g = map.get(k) ?? [];
    g.push(f);
    map.set(k, g);
  }
  const keys = [...map.keys()].filter((k) => k !== 'tba').sort();
  const out: DateGroup[] = keys.map((k) => {
    const list = (map.get(k) ?? []).sort(
      (a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') || a.match_number - b.match_number,
    );
    return { key: k, label: formatInTournamentTz(list[0]?.scheduled_at as string, 'EEEE d MMMM yyyy', tz), fixtures: list };
  });
  const tba = map.get('tba');
  if (tba) out.push({ key: 'tba', label: 'Date to be announced', fixtures: tba.sort((a, b) => a.match_number - b.match_number) });
  return out;
}

export function FixturesListView({
  fixtures,
  byes,
  autoScroll,
}: {
  fixtures: FixtureView[];
  byes: Map<number, FixtureTeam[]>;
  autoScroll: boolean;
}) {
  const t = useTournament();
  const groups = useMemo(() => groupByDate(fixtures, t.timezone), [fixtures, t.timezone]);
  const scrolled = useRef(false);
  const refs = useRef(new Map<string, HTMLElement>());

  // On load, scroll to the first date that has an upcoming or live fixture (7.5).
  useEffect(() => {
    if (!autoScroll || scrolled.current || groups.length === 0) return;
    const target = groups.find((g) => g.key !== 'tba' && g.fixtures.some((f) => f.status === 'upcoming' || f.status === 'live'));
    scrolled.current = true;
    if (!target) return;
    const el = refs.current.get(target.key);
    if (el && groups[0]?.key !== target.key) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, [groups, autoScroll]);

  if (fixtures.length === 0) return <EmptyState>No fixtures match these filters.</EmptyState>;

  return (
    <div className="space-y-8">
      {groups.map((g) => {
        const rounds = [...new Set(g.fixtures.filter((f) => f.stage === 'league' && f.round_number).map((f) => f.round_number as number))];
        const byeNotes = rounds.filter((r) => byes.has(r)).map((r) => ({ r, teams: byes.get(r) ?? [] }));
        return (
          <section
            key={g.key}
            ref={(el) => {
              if (el) refs.current.set(g.key, el);
            }}
            aria-labelledby={`d-${g.key}`}
            className="scroll-mt-20 lg:scroll-mt-44"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 id={`d-${g.key}`} className="font-display text-xl font-bold uppercase tracking-tight sm:text-2xl">
                {g.label}
              </h2>
              <span className="text-xs text-muted">
                {g.fixtures.length} {g.fixtures.length === 1 ? 'match' : 'matches'}
              </span>
            </div>
            {byeNotes.length > 0 && (
              <p className="mb-3 text-xs text-muted">
                {byeNotes.map((b) => (
                  <span key={b.r} className="mr-3 inline-block">
                    Round {b.r} · Bye: <span className="text-fg">{b.teams.map((x) => x.name).join(', ')}</span>
                  </span>
                ))}
              </p>
            )}
            <div className="space-y-3">
              {g.fixtures.map((f) => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

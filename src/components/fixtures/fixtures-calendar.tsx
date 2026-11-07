'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FixtureRow } from './fixture-row';
import { Button } from '@/components/ui/button';
import { EmptyState, LiveDot } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { dayKey } from '@/lib/format';
import type { FixtureView } from '@/lib/queries/fixtures';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

interface Ym {
  y: number;
  m: number; // 0-based
}

function parseKey(k: string): Ym & { d: number } {
  const [y, m, d] = k.split('-').map(Number) as [number, number, number];
  return { y, m: m - 1, d };
}

function longDate(k: string): string {
  const { y, m, d } = parseKey(k);
  const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
  const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd];
  return `${name} ${d} ${MONTHS[m]} ${y}`;
}

/** Month grid, week starting Monday; days are computed in the tournament time zone (7.5). */
export function FixturesCalendar({ fixtures }: { fixtures: FixtureView[] }) {
  const t = useTournament();
  const tz = t.timezone;
  const byDay = useMemo(() => {
    const m = new Map<string, FixtureView[]>();
    for (const f of fixtures) {
      if (!f.scheduled_at) continue;
      const k = dayKey(f.scheduled_at, tz);
      const list = m.get(k) ?? [];
      list.push(f);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') || a.match_number - b.match_number);
    return m;
  }, [fixtures, tz]);
  const unscheduled = fixtures.filter((f) => !f.scheduled_at).length;

  const [today, setToday] = useState<string | null>(null);
  const [month, setMonth] = useState<Ym | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Initial month: the month of the first upcoming/live fixture, else today (client only, avoids hydration drift).
  useEffect(() => {
    const now = dayKey(new Date(), tz);
    setToday(now);
    if (month) return;
    const next = fixtures
      .filter((f) => f.scheduled_at && (f.status === 'upcoming' || f.status === 'live'))
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))[0];
    const k = next?.scheduled_at ? dayKey(next.scheduled_at, tz) : now;
    const p = parseKey(k);
    setMonth({ y: p.y, m: p.m });
    setSelected(byDay.has(now) ? now : k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);

  if (!month) return <div className="h-96 animate-pulse rounded-card bg-surface" aria-hidden />;

  const first = new Date(Date.UTC(month.y, month.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => keyOf(month.y, month.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(month.y, month.m + delta, 1));
    setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    setSelected(null);
  };
  const goToday = () => {
    if (!today) return;
    const p = parseKey(today);
    setMonth({ y: p.y, m: p.m });
    setSelected(today);
  };

  const monthKeys = [...byDay.keys()].filter((k) => k.startsWith(`${month.y}-${pad(month.m + 1)}-`)).sort();
  const selectedList = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="md" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-[11rem] text-center font-display text-2xl font-bold uppercase" aria-live="polite">
          {MONTHS[month.m]} {month.y}
        </h2>
        <Button variant="secondary" size="md" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={goToday}>
          Today
        </Button>
        {unscheduled > 0 && <span className="ml-auto text-xs text-muted">{unscheduled} fixture(s) without a date are shown in the list view.</span>}
      </div>

      {/* Grid: 640px and wider */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted" aria-hidden>
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS[month.m]} ${month.y}`}>
          {cells.map((k, i) => {
            if (!k) return <div key={`e${i}`} className="min-h-[104px] rounded-btn bg-surface/40" aria-hidden />;
            const list = byDay.get(k) ?? [];
            const isToday = k === today;
            const isSel = k === selected;
            const hasLive = list.some((f) => f.status === 'live');
            return (
              <button
                type="button"
                key={k}
                onClick={() => setSelected(k)}
                aria-pressed={isSel}
                aria-label={`${longDate(k)}: ${list.length} ${list.length === 1 ? 'match' : 'matches'}`}
                className={cn(
                  'flex min-h-[104px] flex-col items-stretch gap-1 rounded-btn border p-1.5 text-left transition',
                  isSel ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/50',
                  list.length === 0 && 'opacity-70',
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold',
                      isToday ? 'bg-accent text-accent-contrast' : 'text-muted',
                    )}
                  >
                    {parseKey(k).d}
                  </span>
                  {hasLive && <LiveDot />}
                </span>
                {list.slice(0, 3).map((f) => (
                  <span
                    key={f.id}
                    className={cn(
                      'truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      f.status === 'completed' ? 'bg-surface-2 text-muted' : f.status === 'postponed' ? 'bg-warning/10 text-yellow-200 line-through' : f.status === 'live' ? 'bg-danger/20 text-red-200' : 'bg-surface-2 text-fg',
                    )}
                  >
                    {f.home?.short_name ?? 'TBD'} v {f.away?.short_name ?? 'TBD'}
                  </span>
                ))}
                {list.length > 3 && <span className="px-1.5 text-[11px] font-semibold text-accent">+{list.length - 3} more</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-6">
          {selected ? (
            <>
              <h3 className="mb-3 font-display text-xl font-bold uppercase">{longDate(selected)}</h3>
              {selectedList.length === 0 ? (
                <EmptyState>No matches on this day.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {selectedList.map((f) => (
                    <FixtureRow key={f.id} fixture={f} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Select a day to see its matches.</p>
          )}
        </div>
      </div>

      {/* Under 640px: agenda list for the month */}
      <div className="space-y-6 sm:hidden">
        {monthKeys.length === 0 ? (
          <EmptyState>No matches this month.</EmptyState>
        ) : (
          monthKeys.map((k) => (
            <section key={k}>
              <h3 className={cn('mb-2 font-display text-lg font-bold uppercase', k === today && 'text-accent')}>
                {longDate(k)}
                {k === today && ' · Today'}
              </h3>
              <div className="space-y-3">
                {(byDay.get(k) ?? []).map((f) => (
                  <FixtureRow key={f.id} fixture={f} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

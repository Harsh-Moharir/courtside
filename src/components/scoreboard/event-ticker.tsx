'use client';
import { cn } from '@/components/ui/cn';
import { breakLabel, formatGameClock, periodLabel } from '@/lib/domain/clock';
import type { ScoringEvent } from '@/lib/queries/matches';

interface Detail {
  desc?: string;
  period?: number;
  is_break?: boolean;
  clock_ms?: number | null;
  home?: number;
  away?: number;
  label?: string;
  reason?: string;
}

export function eventDetail(e: ScoringEvent): Detail {
  return (e.detail ?? {}) as Detail;
}

/** `Q2 4:12 · Tigers +3 · 45-42` */
export function eventLine(e: ScoringEvent, quarters: number): string {
  const d = eventDetail(e);
  const parts: string[] = [];
  if (d.period) {
    if (d.is_break) parts.push(breakLabel(quarters, d.period));
    else parts.push(`${periodLabel(quarters, d.period)}${typeof d.clock_ms === 'number' ? ` ${formatGameClock(d.clock_ms)}` : ''}`);
  }
  parts.push(d.desc ?? e.event_type.replace(/_/g, ' '));
  if (typeof d.home === 'number' && typeof d.away === 'number') parts.push(`${d.home}-${d.away}`);
  return parts.join(' · ');
}

const VISIBLE_TYPES = new Set(['points', 'foul', 'timeout', 'period_change', 'score_correction', 'match_started', 'match_ended']);

export function EventTicker({ events, quarters, limit = 5, className }: { events: ScoringEvent[]; quarters: number; limit?: number; className?: string }) {
  const list = events.filter((e) => !e.is_voided && VISIBLE_TYPES.has(e.event_type)).slice(0, limit);
  if (list.length === 0) return null;
  return (
    <div className={cn('rounded-card border border-border bg-surface p-4', className)}>
      <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-muted">Play by play</h2>
      <ol className="space-y-1.5">
        {list.map((e, i) => (
          <li key={e.id} className={cn('tabular text-sm', i === 0 ? 'font-semibold text-fg' : 'text-muted')}>
            {eventLine(e, quarters)}
          </li>
        ))}
      </ol>
    </div>
  );
}

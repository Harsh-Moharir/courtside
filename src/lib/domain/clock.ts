/** Clock maths (8.3). The server stores (remaining_ms, running, updated_at); clients derive the display. */
export interface ClockState {
  remainingMs: number;
  running: boolean;
  updatedAt: string | number; // ISO string or epoch ms (server time)
}

export function effectiveMs(c: ClockState, serverNowMs: number): number {
  if (!c.running) return Math.max(0, c.remainingMs);
  const at = typeof c.updatedAt === 'number' ? c.updatedAt : new Date(c.updatedAt).getTime();
  return Math.max(0, c.remainingMs - (serverNowMs - at));
}

/** Game clock: M:SS (floor) at 60 s or more, SS.t under 60 s; never negative. */
export function formatGameClock(ms: number): string {
  const v = Math.max(0, ms);
  if (v >= 60000) {
    const totalSec = Math.floor(v / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const tenths = Math.floor(v / 100);
  const s = Math.floor(tenths / 10);
  return `${String(s).padStart(2, '0')}.${tenths % 10}`;
}

/** Shot clock: whole seconds using ceiling (24 at start, 1 just before zero, 0 at zero). */
export function formatShotClock(ms: number): string {
  return String(Math.ceil(Math.max(0, ms) / 1000));
}

export function shotClockWarning(ms: number): 'none' | 'flash' | 'expired' {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  if (s <= 0) return 'expired';
  if (s <= 5) return 'flash';
  return 'none';
}

export function shouldHideShotClock(opts: {
  hideUnderGameClock: boolean;
  gameMs: number;
  shotMs: number;
  isBreak: boolean;
}): boolean {
  if (opts.isBreak) return true;
  return opts.hideUnderGameClock && opts.gameMs < opts.shotMs;
}

export interface OffsetSample {
  tSend: number; // client ms when request was sent
  tRecv: number; // client ms when response arrived
  server: number; // server ms
}

/** Keeps the sample with the smallest round trip; offset = server - (tSend + rtt/2). */
export function estimateOffset(samples: OffsetSample[]): number {
  if (samples.length === 0) return 0;
  const best = samples.reduce((a, b) => (b.tRecv - b.tSend < a.tRecv - a.tSend ? b : a));
  const rtt = best.tRecv - best.tSend;
  return best.server - (best.tSend + rtt / 2);
}

export function periodLabel(quarters: number, period: number): string {
  if (period > quarters) return `OT${period - quarters}`;
  if (quarters === 2) return `H${period}`;
  return `Q${period}`;
}

/** Label shown during a break: End Q1, Halftime, End Q3, End OT1. */
export function breakLabel(quarters: number, period: number): string {
  if (period > quarters) return `End OT${period - quarters}`;
  if (period === Math.floor(quarters / 2)) return 'Halftime';
  return `End ${periodLabel(quarters, period)}`;
}

export function timeoutPool(
  rules: { quarters: number; timeouts_first_half: number; timeouts_second_half: number; timeouts_per_overtime: number },
  period: number,
): number {
  if (period > rules.quarters) return rules.timeouts_per_overtime;
  if (period > Math.floor(rules.quarters / 2)) return rules.timeouts_second_half;
  return rules.timeouts_first_half;
}

/** Per-period points from cumulative totals: each period = difference between consecutive totals. */
export function periodBreakdown(
  periodScores: { period: number; home_total: number; away_total: number }[],
): { period: number; home: number; away: number }[] {
  const sorted = [...periodScores].sort((a, b) => a.period - b.period);
  let ph = 0;
  let pa = 0;
  return sorted.map((p) => {
    const row = { period: p.period, home: p.home_total - ph, away: p.away_total - pa };
    ph = p.home_total;
    pa = p.away_total;
    return row;
  });
}

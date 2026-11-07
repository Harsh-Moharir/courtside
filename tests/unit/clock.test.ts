import { describe, expect, it } from 'vitest';
import { breakLabel, effectiveMs, estimateOffset, formatGameClock, formatShotClock, periodBreakdown, periodLabel, shotClockWarning, shouldHideShotClock, timeoutPool } from '@/lib/domain/clock';

describe('clock maths (8.3)', () => {
  it('paused clocks do not move; running clocks count down and clamp at 0', () => {
    expect(effectiveMs({ remainingMs: 5000, running: false, updatedAt: 0 }, 99999)).toBe(5000);
    expect(effectiveMs({ remainingMs: 5000, running: true, updatedAt: 1000 }, 3000)).toBe(3000);
    expect(effectiveMs({ remainingMs: 5000, running: true, updatedAt: 1000 }, 60000)).toBe(0);
    expect(effectiveMs({ remainingMs: 5000, running: true, updatedAt: new Date(1000).toISOString() }, 2000)).toBe(4000);
  });

  it('game clock formatting: M:SS floor at >= 60 s, SS.t below, never negative', () => {
    expect(formatGameClock(600000)).toBe('10:00');
    expect(formatGameClock(60999)).toBe('1:00');
    expect(formatGameClock(60000)).toBe('1:00');
    expect(formatGameClock(59999)).toBe('59.9');
    expect(formatGameClock(5050)).toBe('05.0');
    expect(formatGameClock(0)).toBe('00.0');
    expect(formatGameClock(-500)).toBe('00.0');
  });

  it('shot clock formatting uses ceiling', () => {
    expect(formatShotClock(24000)).toBe('24');
    expect(formatShotClock(23001)).toBe('24');
    expect(formatShotClock(1)).toBe('1');
    expect(formatShotClock(0)).toBe('0');
    expect(formatShotClock(-10)).toBe('0');
    expect(shotClockWarning(6000)).toBe('none');
    expect(shotClockWarning(5000)).toBe('flash');
    expect(shotClockWarning(0)).toBe('expired');
  });

  it('shot clock hide rule', () => {
    expect(shouldHideShotClock({ hideUnderGameClock: true, gameMs: 10000, shotMs: 24000, isBreak: false })).toBe(true);
    expect(shouldHideShotClock({ hideUnderGameClock: false, gameMs: 10000, shotMs: 24000, isBreak: false })).toBe(false);
    expect(shouldHideShotClock({ hideUnderGameClock: true, gameMs: 100000, shotMs: 24000, isBreak: false })).toBe(false);
    expect(shouldHideShotClock({ hideUnderGameClock: false, gameMs: 100000, shotMs: 24000, isBreak: true })).toBe(true);
  });

  it('offset estimation keeps the smallest round trip (fake clock)', () => {
    const off = estimateOffset([
      { tSend: 1000, tRecv: 1400, server: 6000 },
      { tSend: 2000, tRecv: 2040, server: 7020 }, // rtt 40 -> offset 7020 - 2020 = 5000
      { tSend: 3000, tRecv: 3300, server: 8100 },
    ]);
    expect(off).toBe(5000);
    expect(estimateOffset([])).toBe(0);
  });

  it('period labels, break labels and timeout pools', () => {
    expect(periodLabel(4, 1)).toBe('Q1');
    expect(periodLabel(4, 5)).toBe('OT1');
    expect(periodLabel(2, 2)).toBe('H2');
    expect(breakLabel(4, 2)).toBe('Halftime');
    expect(breakLabel(4, 1)).toBe('End Q1');
    expect(breakLabel(4, 6)).toBe('End OT2');
    const rules = { quarters: 4, timeouts_first_half: 2, timeouts_second_half: 3, timeouts_per_overtime: 1 };
    expect(timeoutPool(rules, 2)).toBe(2);
    expect(timeoutPool(rules, 3)).toBe(3);
    expect(timeoutPool(rules, 5)).toBe(1);
  });

  it('per-period breakdown from cumulative totals', () => {
    expect(
      periodBreakdown([
        { period: 2, home_total: 40, away_total: 38 },
        { period: 1, home_total: 20, away_total: 18 },
      ]),
    ).toEqual([
      { period: 1, home: 20, away: 18 },
      { period: 2, home: 20, away: 20 },
    ]);
  });
});

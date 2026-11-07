import { describe, expect, it } from 'vitest';
import { bidAfterSteps, decayedPrice, describeTiers, maxBid, minimumNextBid, stepFor } from '@/lib/domain/money';
import { contrastRatio, readableTextOn, visibleOnDark, isValidHex, teamStyle } from '@/lib/color';

const tiers = [
  { from_amount: 0, step: 100 },
  { from_amount: 2000, step: 250 },
  { from_amount: 5000, step: 500 },
];

describe('money rules (5.3)', () => {
  it('step uses the greatest from_amount <= bid, including exact boundaries', () => {
    expect(stepFor(tiers, null)).toBe(100);
    expect(stepFor(tiers, 1999)).toBe(100);
    expect(stepFor(tiers, 2000)).toBe(250);
    expect(stepFor(tiers, 4999)).toBe(250);
    expect(stepFor(tiers, 5000)).toBe(500);
    expect(stepFor([], 10)).toBe(1);
  });
  it('minimum next bid and multi-step jumps', () => {
    expect(minimumNextBid(300, null, tiers)).toBe(300);
    expect(minimumNextBid(300, 1900, tiers)).toBe(2000);
    expect(minimumNextBid(300, 2000, tiers)).toBe(2250);
    expect(bidAfterSteps(300, 1900, tiers, 2)).toBe(2250);
    expect(bidAfterSteps(300, null, tiers, 5)).toBe(700);
  });
  it('max bid with reserve per slot, never negative', () => {
    expect(maxBid({ purseRemaining: 10000, reservePerSlot: 0, minSquadSize: 8, squadCount: 2 })).toBe(10000);
    expect(maxBid({ purseRemaining: 10000, reservePerSlot: 100, minSquadSize: 8, squadCount: 2 })).toBe(9500);
    expect(maxBid({ purseRemaining: 10000, reservePerSlot: 100, minSquadSize: 8, squadCount: 9 })).toBe(10000);
    expect(maxBid({ purseRemaining: 100, reservePerSlot: 100, minSquadSize: 8, squadCount: 0 })).toBe(0);
  });
  it('base price decay never drops below 1', () => {
    expect(decayedPrice(100, 25)).toBe(75);
    expect(decayedPrice(1, 90)).toBe(1);
    expect(decayedPrice(3, 90)).toBe(1);
  });
  it('tier preview text', () => {
    expect(describeTiers(tiers)).toBe('0 to 1,999: +100; 2,000 to 4,999: +250; 5,000+: +500');
  });
});

describe('colour helpers (11.2)', () => {
  it('contrast ratio extremes', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('readable text on navy, black, white, orange', () => {
    expect(readableTextOn('#0B1F4D')).toBe('#FFFFFF');
    expect(readableTextOn('#000000')).toBe('#FFFFFF');
    expect(readableTextOn('#FFFFFF')).toBe('#0A0A0A');
    expect(readableTextOn('#F97316')).toBe('#0A0A0A');
  });
  it('visibleOnDark lightens dark navy and black until 3:1, leaves bright colours alone', () => {
    const navy = visibleOnDark('#0B1F4D');
    expect(contrastRatio(navy, '#0A0A0A')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(visibleOnDark('#000000'), '#0A0A0A')).toBeGreaterThanOrEqual(3);
    expect(visibleOnDark('#F97316')).toBe('#F97316');
    expect(visibleOnDark('#FFFFFF')).toBe('#FFFFFF');
  });
  it('hex validation and team style variables', () => {
    expect(isValidHex('#A1B2C3')).toBe(true);
    expect(isValidHex('A1B2C3')).toBe(false);
    const s = teamStyle('#000000', 'bad') as Record<string, string>;
    expect(s['--team-primary']).toBe('#000000');
    expect(s['--team-secondary']).toBe('#111111');
    expect(s['--team-on-primary']).toBe('#FFFFFF');
  });
});

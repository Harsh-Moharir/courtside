import { describe, expect, it } from 'vitest';
import { csvCell, neutralizeFormula, toCsv } from '@/lib/export/csv';
import { buildIcs, foldLine, icsEscape } from '@/lib/export/ics';

describe('CSV export (4.5)', () => {
  it('neutralises formula injection', () => {
    for (const bad of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx']) expect(neutralizeFormula(bad).startsWith("'")).toBe(true);
    expect(neutralizeFormula('Tigers')).toBe('Tigers');
    expect(neutralizeFormula(null)).toBe('');
    expect(neutralizeFormula(-5)).toBe("'-5");
  });
  it('quotes cells with commas, quotes and newlines and starts with a BOM', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    const csv = toCsv(['name', 'price'], [['आदित्य कुलकर्णी', 100]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('आदित्य कुलकर्णी,100');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('ICS export (7.5)', () => {
  it('escapes text', () => {
    expect(icsEscape('a,b;c\nd\\e')).toBe('a\\,b\;c\\nd\\\\e');
  });
  it('folds lines at 75 octets, UTF-8 aware', () => {
    const long = 'SUMMARY:' + 'आ'.repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
  it('builds a calendar with UTC times and CRLF', () => {
    const ics = buildIcs(
      'Test Cup',
      [{ uid: 'abc@example.com', start: new Date('2026-12-05T03:30:00Z'), durationMinutes: 90, summary: 'Tigers vs Hawks, Match 1', location: 'Court A' }],
      new Date('2026-11-07T00:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20261205T033000Z');
    expect(ics).toContain('DTEND:20261205T050000Z');
    expect(ics).toContain('SUMMARY:Tigers vs Hawks\\, Match 1');
    expect(ics).toContain('UID:abc@example.com');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.includes('\n') && !/[^\r]\n/.test(ics)).toBe(true);
  });
});

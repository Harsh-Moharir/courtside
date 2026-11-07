import { describe, expect, it } from 'vitest';
import { pickFont } from '@/lib/export/roster-pdf';
import { linkifySegments } from '@/components/announcements/announcement-body';
import { groupRoster, jerseyConflicts, type RosterEntry } from '@/lib/queries/roster';
import { escapeLike, filtersToSearch, parsePlayerFilters } from '@/lib/queries/players';
import { contrastRatio } from '@/lib/color';
import { headerTint } from '@/components/team/team-header';

const entry = (id: string, pos: RosterEntry['player']['primary_position'], extra: Partial<RosterEntry> = {}, jersey: number | null = null): RosterEntry => ({
  id,
  source: 'auction',
  icon_slot: null,
  price: 100,
  purchase_order: 1,
  acquired_at: '2026-01-01T00:00:00Z',
  player: { id, full_name: id, photo_path: null, primary_position: pos, secondary_position: null, jersey_number: jersey },
  ...extra,
});

describe('roster PDF font choice (6.6)', () => {
  it('picks a font per string by script', () => {
    expect(pickFont('Aman Verma')).toBe('helvetica');
    expect(pickFont('José Álvarez')).toBe('helvetica');
    expect(pickFont('आदित्य कुलकर्णी')).toBe('NotoSansDevanagari');
    expect(pickFont('Łukasz Žák')).toBe('NotoSans');
    expect(pickFont(null)).toBe('helvetica');
  });
});

describe('announcement links (4.5)', () => {
  it('splits text and URLs without swallowing trailing punctuation', () => {
    expect(linkifySegments('See https://example.com/a. Thanks')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', value: 'https://example.com/a' },
      { type: 'text', value: '. Thanks' },
    ]);
    expect(linkifySegments('no links')).toEqual([{ type: 'text', value: 'no links' }]);
    expect(linkifySegments('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }]);
  });
});

describe('roster grouping (6.6)', () => {
  it('groups by position in order, icons first then price desc, empty groups hidden', () => {
    const groups = groupRoster([
      entry('cheap', 'PG', { price: 100 }),
      entry('icon', 'PG', { source: 'icon', icon_slot: 1, price: 0 }),
      entry('dear', 'PG', { price: 900 }),
      entry('big', 'C'),
    ]);
    expect(groups.map((g) => g.position)).toEqual(['PG', 'C']);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['icon', 'dear', 'cheap']);
  });
  it('flags shared jersey numbers', () => {
    const c = jerseyConflicts([entry('a', 'PG', {}, 7), entry('b', 'SG', {}, 7), entry('c', 'C', {}, 8), entry('d', 'C')]);
    expect([...c].sort()).toEqual(['a', 'b']);
  });
});

describe('player filters (6.4)', () => {
  it('round-trips through the URL and rejects junk', () => {
    const f = parsePlayerFilters({ q: 'aman', pos: 'PG', sec: '1', status: 'sold', sort: 'nope', page: '3', team: 'not-a-uuid' });
    expect(f).toMatchObject({ q: 'aman', pos: 'PG', sec: true, status: 'sold', sort: 'name', page: 3, team: null });
    expect(filtersToSearch(f)).toBe('?q=aman&pos=PG&sec=1&status=sold&page=3');
    expect(parsePlayerFilters(new URLSearchParams('pos=XX&page=-2'))).toMatchObject({ pos: null, page: 1 });
  });
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('team header tint (11.2)', () => {
  it('keeps white text at 4.5:1 or falls back', () => {
    for (const c of ['#F97316', '#FACC15', '#1D4ED8', '#FFFFFF']) {
      const t = headerTint(c);
      if (t) expect(contrastRatio(t, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
    expect(headerTint('bad')).toBeNull();
  });
});

'use client';
import { downloadBlob, downloadCsv, todayStamp } from '@/lib/export/csv';
import { buildIcs } from '@/lib/export/ics';
import { dayKey, formatInTournamentTz } from '@/lib/format';
import { fixtureScore, slotText, type FixtureView } from '@/lib/queries/fixtures';

export const FIXTURE_CSV_HEADERS = [
  'match_number',
  'stage',
  'round',
  'date',
  'time',
  'venue',
  'home',
  'away',
  'status',
  'home_score',
  'away_score',
];

const STATUS_TEXT: Record<FixtureView['status'], string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Completed',
  postponed: 'Postponed',
};

function teamName(f: FixtureView, side: 'home' | 'away'): string {
  const t = side === 'home' ? f.home : f.away;
  return t?.name ?? slotText(f, side);
}

function roundText(f: FixtureView): string {
  if (f.stage === 'playoff') return f.node?.label ?? `Playoff round ${f.round_number ?? ''}`.trim();
  return f.round_number ? String(f.round_number) : '';
}

export function fixtureCsvRows(fixtures: FixtureView[], tz: string): unknown[][] {
  return fixtures.map((f) => {
    const s = fixtureScore(f);
    return [
      f.match_number,
      f.stage,
      roundText(f),
      f.scheduled_at ? formatInTournamentTz(f.scheduled_at, 'yyyy-MM-dd', tz) : '',
      f.scheduled_at ? formatInTournamentTz(f.scheduled_at, 'HH:mm', tz) : '',
      f.venue ?? '',
      teamName(f, 'home'),
      teamName(f, 'away'),
      f.status,
      s ? s.home : '',
      s ? s.away : '',
    ];
  });
}

export function exportFixturesCsv(fixtures: FixtureView[], tz: string, slug: string): void {
  downloadCsv(`${slug}-fixtures-${todayStamp()}.csv`, FIXTURE_CSV_HEADERS, fixtureCsvRows(fixtures, tz));
}

/** ICS events: one VEVENT per scheduled, non-postponed fixture, 90 minutes (7.5). */
export function fixturesIcs(fixtures: FixtureView[], calName: string, host: string, now: Date = new Date()): string {
  const events = fixtures
    .filter((f) => f.scheduled_at && f.status !== 'postponed')
    .map((f) => ({
      uid: `${f.id}@${host}`,
      start: new Date(f.scheduled_at as string),
      durationMinutes: 90,
      summary: `M${f.match_number}: ${teamName(f, 'home')} vs ${teamName(f, 'away')}`,
      location: f.venue,
      description: f.stage === 'playoff' ? (f.node?.label ?? 'Playoff') : f.round_number ? `League round ${f.round_number}` : 'League',
    }));
  return buildIcs(calName, events, now);
}

export function exportFixturesIcs(fixtures: FixtureView[], calName: string, slug: string): void {
  const ics = fixturesIcs(fixtures, calName, window.location.hostname);
  downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${slug}-fixtures-${todayStamp()}.ics`);
}

/** PDF grouped by tournament-zone date (autotable). Libraries load only when the button is pressed (11.7). */
export async function exportFixturesPdf(fixtures: FixtureView[], tz: string, title: string, slug: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${title}: Fixtures`, 40, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Times in ${tz}. Start times are approximate. Exported ${formatInTournamentTz(new Date(), 'd MMM yyyy, h:mm a', tz)}.`, 40, 60);
  doc.setTextColor(0);

  const groups = new Map<string, FixtureView[]>();
  const sorted = [...fixtures].sort((a, b) => {
    if (!a.scheduled_at && !b.scheduled_at) return a.match_number - b.match_number;
    if (!a.scheduled_at) return 1;
    if (!b.scheduled_at) return -1;
    return a.scheduled_at.localeCompare(b.scheduled_at) || a.match_number - b.match_number;
  });
  for (const f of sorted) {
    const k = f.scheduled_at ? dayKey(f.scheduled_at, tz) : 'tba';
    const g = groups.get(k) ?? [];
    g.push(f);
    groups.set(k, g);
  }

  let y = 80;
  for (const [k, list] of groups) {
    const heading = k === 'tba' ? 'Date to be announced' : formatInTournamentTz(list[0]?.scheduled_at as string, 'EEEE d MMMM yyyy', tz);
    if (y > 520) {
      doc.addPage();
      y = 44;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(heading, 40, y);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: 40, right: 40 },
      head: [['#', 'Stage', 'Time', 'Home', 'Away', 'Venue', 'Status', 'Score']],
      body: list.map((f) => {
        const s = fixtureScore(f);
        return [
          String(f.match_number),
          f.stage === 'playoff' ? (f.node?.label ?? 'Playoff') : `Round ${f.round_number ?? '-'}`,
          f.scheduled_at ? `${f.status === 'upcoming' ? 'Approx. ' : ''}${formatInTournamentTz(f.scheduled_at, 'h:mm a', tz)}` : 'TBA',
          teamName(f, 'home'),
          teamName(f, 'away'),
          f.venue ?? '',
          f.status === 'postponed' && f.postponed_reason ? `Postponed: ${f.postponed_reason}` : STATUS_TEXT[f.status],
          s ? `${s.home} - ${s.away}` : '',
        ];
      }),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [249, 115, 22], textColor: [10, 10, 10] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y + 40) + 26;
  }
  if (groups.size === 0) {
    doc.setFontSize(12);
    doc.text('No fixtures yet.', 40, 90);
  }
  doc.save(`${slug}-fixtures-${todayStamp()}.pdf`);
}

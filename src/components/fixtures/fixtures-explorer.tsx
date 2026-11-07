'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileText, List, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { FixturesListView } from './fixtures-list-view';
import { FixturesCalendar } from './fixtures-calendar';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { ErrorState } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { byesForRounds, fetchAllFixtures, type FixtureTeam, type FixtureView } from '@/lib/queries/fixtures';
import { viewerZoneDiffers, zoneAbbreviation } from '@/lib/format';
import { exportFixturesCsv, exportFixturesIcs, exportFixturesPdf } from '@/lib/export/fixtures-export';

export type FixturesView = 'list' | 'calendar';
export interface FixtureFilters {
  team: string;
  status: string;
  stage: string;
}

const VIEW_PREF_KEY = 'courtside:fixtures-view';

export function FixturesExplorer({
  initialFixtures,
  teams,
  initialView,
  initialFilters,
}: {
  initialFixtures: FixtureView[];
  teams: FixtureTeam[];
  initialView: FixturesView | null;
  initialFilters: FixtureFilters;
}) {
  const t = useTournament();
  const [view, setView] = useState<FixturesView>(initialView ?? 'list');
  const [filters, setFilters] = useState<FixtureFilters>(initialFilters);
  const [zoneNote, setZoneNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, status, error, refetch } = useRealtimeQuery<FixtureView[]>({
    key: 'fixtures-page',
    initialData: initialFixtures,
    subscriptions: [{ table: 'fixtures' }, { table: 'match_states' }, { table: 'match_results' }],
    fetcher: () => fetchAllFixtures(getBrowserClient()),
    debounceMs: 400,
  });
  const fixtures = useMemo(() => data ?? [], [data]);

  // UI preference only (1.2): last-used view when the URL does not specify one.
  useEffect(() => {
    if (initialView) return;
    try {
      const v = window.localStorage.getItem(VIEW_PREF_KEY);
      if (v === 'calendar' || v === 'list') setView(v);
    } catch {
      /* storage unavailable */
    }
  }, [initialView]);

  useEffect(() => {
    if (viewerZoneDiffers(t.timezone)) setZoneNote(`Times shown in ${zoneAbbreviation(t.timezone)} (${t.timezone})`);
    else setZoneNote(null);
  }, [t.timezone]);

  // Keep the URL shareable without a navigation.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('view', view);
    if (filters.team) p.set('team', filters.team);
    if (filters.status) p.set('status', filters.status);
    if (filters.stage) p.set('stage', filters.stage);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [view, filters]);

  const chooseView = (v: FixturesView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_PREF_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const filtered = useMemo(
    () =>
      fixtures.filter(
        (f) =>
          (!filters.team || f.home_team_id === filters.team || f.away_team_id === filters.team) &&
          (!filters.status || f.status === filters.status) &&
          (!filters.stage || f.stage === filters.stage),
      ),
    [fixtures, filters],
  );
  const byes = useMemo(() => byesForRounds(fixtures, teams), [fixtures, teams]);

  async function download(kind: 'csv' | 'pdf' | 'ics') {
    if (filtered.length === 0) {
      toast.info('There are no fixtures to download.');
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'csv') exportFixturesCsv(filtered, t.timezone, t.slug);
      else if (kind === 'ics') exportFixturesIcs(filtered, t.name, t.slug);
      else await exportFixturesPdf(filtered, t.timezone, t.name, t.slug);
    } catch {
      toast.error('The download could not be created. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => {
    const c = { upcoming: 0, live: 0, completed: 0, postponed: 0 };
    for (const f of fixtures) c[f.status] += 1;
    return c;
  }, [fixtures]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        <span>
          <b className="text-fg">{fixtures.length}</b> matches
        </span>
        <span>
          <b className="text-fg">{counts.completed}</b> played
        </span>
        {counts.live > 0 && (
          <span className="text-red-300">
            <b>{counts.live}</b> live now
          </span>
        )}
        <span>
          <b className="text-fg">{counts.upcoming}</b> upcoming
        </span>
        {counts.postponed > 0 && (
          <span>
            <b className="text-fg">{counts.postponed}</b> postponed
          </span>
        )}
        <ConnectionIndicator status={status} className="ml-auto" />
      </div>

      <div className="z-20 -mx-4 mb-6 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur lg:sticky lg:top-16">
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-btn border border-border bg-surface p-1" role="group" aria-label="View">
            {(
              [
                ['list', 'List', List],
                ['calendar', 'Calendar', CalendarDays],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => chooseView(v)}
                aria-pressed={view === v}
                className={cn(
                  'inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold',
                  view === v ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <label className="min-w-[10rem] flex-1 sm:flex-none">
            <span className="sr-only">Team</span>
            <Select value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })}>
              <option value="">All teams</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-[8rem] flex-1 sm:flex-none">
            <span className="sr-only">Status</span>
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="postponed">Postponed</option>
            </Select>
          </label>
          <label className="min-w-[8rem] flex-1 sm:flex-none">
            <span className="sr-only">Stage</span>
            <Select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
              <option value="">League and playoffs</option>
              <option value="league">League</option>
              <option value="playoff">Playoffs</option>
            </Select>
          </label>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="secondary" size="sm" className="min-h-[44px]" loading={busy === 'csv'} onClick={() => void download('csv')}>
              <Sheet className="h-4 w-4" aria-hidden /> CSV
            </Button>
            <Button variant="secondary" size="sm" className="min-h-[44px]" loading={busy === 'pdf'} onClick={() => void download('pdf')}>
              <FileText className="h-4 w-4" aria-hidden /> PDF
            </Button>
            <Button variant="secondary" size="sm" className="min-h-[44px]" loading={busy === 'ics'} onClick={() => void download('ics')}>
              <Download className="h-4 w-4" aria-hidden /> Calendar (.ics)
            </Button>
          </div>
        </div>
        {zoneNote && <p className="mt-2 text-xs text-muted">{zoneNote}</p>}
      </div>

      {error && !data && <ErrorState message="Could not load fixtures." onRetry={() => void refetch()} />}
      {view === 'list' ? (
        <FixturesListView fixtures={filtered} byes={byes} autoScroll={!filters.status} />
      ) : (
        <FixturesCalendar fixtures={filtered} />
      )}
    </div>
  );
}

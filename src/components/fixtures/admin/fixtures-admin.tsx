'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ListOrdered, Star } from 'lucide-react';
import { toast } from 'sonner';
import { GenerateCard } from './generate-card';
import { ScheduleCard } from './schedule-card';
import { CreateFixtureCard } from './create-card';
import { AdminFixturesTable, type RowAction } from './fixtures-table';
import { DeleteFixtureDialog, EditFixtureDialog, PostponeDialog, RescheduleDialog } from './fixture-dialogs';
import { AdminCard, WarningsPanel, fixtureTitle, type RpcWarning } from './shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { ErrorState } from '@/components/ui/misc';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { rpc } from '@/lib/actions/rpc';
import { fetchAllFixtures, fetchFixtureTeams, type FixtureTeam, type FixtureView } from '@/lib/queries/fixtures';

export function FixturesAdmin({ initialFixtures, initialTeams }: { initialFixtures: FixtureView[]; initialTeams: FixtureTeam[] }) {
  const t = useTournament();
  const fx = useRealtimeQuery<FixtureView[]>({
    key: 'admin-fixtures',
    initialData: initialFixtures,
    subscriptions: [{ table: 'fixtures' }, { table: 'match_results' }, { table: 'match_states' }],
    fetcher: () => fetchAllFixtures(getBrowserClient()),
    debounceMs: 400,
  });
  const tm = useRealtimeQuery<FixtureTeam[]>({
    key: 'admin-fixture-teams',
    initialData: initialTeams,
    subscriptions: [{ table: 'teams' }],
    fetcher: () => fetchFixtureTeams(getBrowserClient()),
  });
  const fixtures = useMemo(() => fx.data ?? [], [fx.data]);
  const teams = useMemo(() => tm.data ?? [], [tm.data]);
  const refresh = () => void fx.refetch();

  const [editing, setEditing] = useState<FixtureView | null>(null);
  const [postponing, setPostponing] = useState<FixtureView | null>(null);
  const [rescheduling, setRescheduling] = useState<FixtureView | null>(null);
  const [deleting, setDeleting] = useState<FixtureView | null>(null);
  const [warnings, setWarnings] = useState<RpcWarning[]>([]);
  const [renumberOpen, setRenumberOpen] = useState(false);
  const [renumbering, setRenumbering] = useState(false);
  const [replaceRequested, setReplaceRequested] = useState(false);

  const league = fixtures.filter((f) => f.stage === 'league');
  const lockedCount = league.filter((f) => f.status === 'live' || f.status === 'completed').length;
  const unscheduled = league.filter((f) => f.status === 'upcoming' && !f.scheduled_at).length;
  const upcomingScheduled = league.filter((f) => f.status === 'upcoming' && f.scheduled_at).length;

  // 7.6 #1: teams added or deleted after generation.
  const teamsChanged = useMemo(() => {
    if (league.length === 0) return false;
    const inFixtures = new Set<string>();
    for (const f of league) {
      if (f.home_team_id) inFixtures.add(f.home_team_id);
      if (f.away_team_id) inFixtures.add(f.away_team_id);
    }
    const current = new Set(teams.map((x) => x.id));
    if (inFixtures.size !== current.size) return true;
    for (const id of current) if (!inFixtures.has(id)) return true;
    return false;
  }, [league, teams]);

  const featured = fixtures.find((f) => f.id === t.featured_fixture_id) ?? null;

  async function setFeatured(f: FixtureView | null) {
    const r = await rpc('set_featured_fixture', { p_fixture_id: (f?.id ?? null) as string });
    if (!r.ok) toast.error(r.message);
    else toast.success(f ? `M${f.match_number} is now the Match of the Day.` : 'Match of the Day cleared.');
  }

  function onAction(a: RowAction, f: FixtureView) {
    if (a === 'edit') setEditing(f);
    else if (a === 'postpone') setPostponing(f);
    else if (a === 'reschedule') setRescheduling(f);
    else if (a === 'delete') setDeleting(f);
    else void setFeatured(t.featured_fixture_id === f.id ? null : f);
  }

  async function renumber() {
    setRenumbering(true);
    const r = await rpc<{ renumbered: number }>('renumber_fixtures');
    setRenumbering(false);
    setRenumberOpen(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success(r.data.renumbered === 0 ? 'Match numbers were already in order.' : `${r.data.renumbered} match numbers updated.`);
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">Fixtures</h1>
          <p className="text-sm text-muted">
            {league.length} league · {fixtures.length - league.length} playoff · {unscheduled} without a date ·{' '}
            {fixtures.filter((f) => f.status === 'postponed').length} postponed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionIndicator status={fx.status} />
          <Button variant="secondary" onClick={() => setRenumberOpen(true)} disabled={fixtures.length === 0}>
            <ListOrdered className="h-4 w-4" aria-hidden /> Renumber
          </Button>
          <Link href="/fixtures" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-btn px-3 text-sm font-semibold text-accent hover:underline">
            Public page ↗
          </Link>
        </div>
      </div>

      {teamsChanged && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
          <p className="flex-1">
            <b>Teams changed since fixtures were generated.</b> Existing fixtures were not changed. Regenerate the league to include the current teams
            {lockedCount > 0 ? ' (not possible while live or completed league fixtures exist).' : '.'}
          </p>
          {lockedCount === 0 && (
            <Button
              size="sm"
              onClick={() => {
                setReplaceRequested(true);
                document.getElementById('generate-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Regenerate
            </Button>
          )}
        </div>
      )}

      {fx.error && !fx.data && <ErrorState message="Fixtures could not be loaded." onRetry={refresh} />}

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm">
        <Star className="h-4 w-4 text-gold" aria-hidden />
        <span className="text-muted">Match of the Day:</span>
        {featured ? (
          <>
            <b>{fixtureTitle(featured)}</b>
            {!(featured.status === 'upcoming' || featured.status === 'live') && (
              <span className="text-xs text-yellow-200">(not shown on the homepage: it is {featured.status})</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => void setFeatured(null)}>
              Clear
            </Button>
          </>
        ) : (
          <span>Automatic (the live match, else the next upcoming one). Use the star in the table to pick one.</span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div id="generate-card" className="scroll-mt-24">
          <GenerateCard
            teamCount={teams.length}
            leagueCount={league.length}
            lockedCount={lockedCount}
            replaceRequested={replaceRequested}
            onDone={() => {
              setReplaceRequested(false);
              refresh();
            }}
          />
        </div>
        <ScheduleCard unscheduled={unscheduled} upcomingScheduled={upcomingScheduled} onDone={refresh} />
        <CreateFixtureCard teams={teams} onDone={refresh} onWarnings={setWarnings} />
      </div>

      <AdminCard title="All fixtures" description="Edit, postpone, reschedule or delete fixtures. Completed fixtures are changed through result corrections in Live scoring.">
        <WarningsPanel title="Saved, with warnings" warnings={warnings} onDismiss={() => setWarnings([])} />
        <AdminFixturesTable fixtures={fixtures} teams={teams} featuredId={t.featured_fixture_id} onAction={onAction} />
      </AdminCard>

      <EditFixtureDialog fixture={editing} teams={teams} onClose={() => setEditing(null)} onDone={refresh} onWarnings={setWarnings} />
      <PostponeDialog fixture={postponing} onClose={() => setPostponing(null)} onDone={refresh} />
      <RescheduleDialog fixture={rescheduling} onClose={() => setRescheduling(null)} onDone={refresh} onWarnings={setWarnings} />
      <DeleteFixtureDialog fixture={deleting} onClose={() => setDeleting(null)} onDone={refresh} />
      <ConfirmDialog
        open={renumberOpen}
        onOpenChange={setRenumberOpen}
        title="Renumber fixtures?"
        description="League fixtures are numbered first in date order (unscheduled last), then playoff fixtures by round. Shared links keep working because they use the fixture id."
        confirmLabel="Renumber"
        loading={renumbering}
        onConfirm={renumber}
      />
    </div>
  );
}

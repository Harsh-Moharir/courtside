'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Play, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { SectionHeading } from '@/components/ui/card';
import { TeamLogo } from '@/components/ui/media';
import { ApproxTime, TzDate } from '@/components/ui/time';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { rpc, requestId } from '@/lib/actions/rpc';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import type { FixtureWithTeams } from '@/lib/queries/matches';
import { loadAdminLive, type AdminLiveData } from './load';
import { AbandonDialog, CompleteMatchDialog, CorrectResultDialog, ForfeitDialog, ReopenMatchDialog } from './result-dialogs';

type DialogState =
  | { kind: 'forfeit' | 'abandon' | 'manual'; fixture: FixtureWithTeams }
  | { kind: 'correct' | 'reopen'; fixture: FixtureWithTeams; home: number; away: number }
  | null;

function Teams({ f }: { f: FixtureWithTeams }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {[f.home, f.away].map((t, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          <TeamLogo logoPath={t?.logo_path} name={t?.name ?? 'TBD'} shortName={t?.short_name ?? 'TBD'} color={t?.primary_color} size={28} />
          <span className="truncate font-semibold" title={t?.name}>
            {t?.name ?? 'To be decided'}
          </span>
        </span>
      ))}
    </div>
  );
}

export function AdminLiveList({ initial }: { initial: AdminLiveData }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const { data, status, refetch } = useRealtimeQuery<AdminLiveData>({
    key: 'admin-live',
    initialData: initial,
    subscriptions: [{ table: 'fixtures' }, { table: 'match_results' }],
    fetcher: () => loadAdminLive(getBrowserClient()),
  });
  const d = data ?? initial;

  async function start(f: FixtureWithTeams) {
    setStarting(f.id);
    const r = await rpc('start_match', { p_fixture_id: f.id, p_client_request_id: requestId() });
    setStarting(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Match ${f.match_number} is live`);
    router.push(`/admin/live/${f.id}`);
  }

  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Matches to play" action={<ConnectionIndicator status={status} />} />
        {d.open.length === 0 ? (
          <EmptyState>No upcoming, live or postponed fixtures. Generate fixtures in the Fixtures section.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {d.open.map((f) => {
              const ready = !!f.home && !!f.away;
              return (
                <li key={f.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 sm:w-40 sm:flex-col sm:items-start sm:gap-1">
                    <span className="font-display text-lg font-bold">Match {f.match_number}</span>
                    <StatusChip status={f.status} />
                    {f.stage === 'playoff' && <Badge>Playoff</Badge>}
                  </div>
                  <Teams f={f} />
                  <div className="text-sm text-muted sm:w-52">
                    {f.scheduled_at ? (
                      <>
                        <TzDate iso={f.scheduled_at} pattern="EEE d MMM" /> · <ApproxTime iso={f.scheduled_at} />
                      </>
                    ) : (
                      'Date to be announced'
                    )}
                    {f.venue && <span className="block truncate">{f.venue}</span>}
                    {f.status === 'postponed' && f.postponed_reason && <span className="block truncate text-yellow-200">{f.postponed_reason}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {f.status === 'live' ? (
                      <>
                        <Link
                          href={`/admin/live/${f.id}`}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-btn bg-accent px-4 text-sm font-semibold text-accent-contrast"
                        >
                          <MonitorPlay className="h-4 w-4" aria-hidden /> Open console
                        </Link>
                        <Button variant="ghost" onClick={() => setDialog({ kind: 'abandon', fixture: f })}>
                          Abandon
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => start(f)} loading={starting === f.id} disabled={!ready} title={ready ? undefined : 'Both teams must be known'}>
                          <Play className="h-4 w-4" aria-hidden /> Start match
                        </Button>
                        <Button variant="secondary" disabled={!ready} onClick={() => setDialog({ kind: 'manual', fixture: f })}>
                          Enter result
                        </Button>
                        <Button variant="ghost" disabled={!ready} onClick={() => setDialog({ kind: 'forfeit', fixture: f })}>
                          Forfeit
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading title="Recent results" />
        {d.completed.length === 0 ? (
          <EmptyState>No completed matches yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {d.completed.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 sm:w-40 sm:flex-col sm:items-start sm:gap-1">
                  <span className="font-display text-lg font-bold">Match {f.match_number}</span>
                  <StatusChip status="completed" />
                  {f.result?.result_type === 'forfeit' && <Badge>Forfeit</Badge>}
                  {(f.result?.correction_count ?? 0) > 0 && <Badge>Corrected</Badge>}
                </div>
                <Teams f={f} />
                <div className="tabular font-display text-3xl font-bold sm:w-28 sm:text-center">
                  {f.result?.home_score}–{f.result?.away_score}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link href={`/admin/live/${f.id}`} className="inline-flex min-h-[44px] items-center rounded-btn border border-border px-4 text-sm font-semibold hover:border-accent">
                    Console
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => setDialog({ kind: 'correct', fixture: f, home: f.result?.home_score ?? 0, away: f.result?.away_score ?? 0 })}
                  >
                    Correct result
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!f.hasState}
                    title={f.hasState ? undefined : 'This result was entered without live scoring: correct it instead'}
                    onClick={() => setDialog({ kind: 'reopen', fixture: f, home: f.result?.home_score ?? 0, away: f.result?.away_score ?? 0 })}
                  >
                    Reopen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === 'forfeit' && (
        <ForfeitDialog open onOpenChange={close} fixture={dialog.fixture} forfeitScore={d.forfeitScore} onDone={() => void refetch()} />
      )}
      {dialog?.kind === 'abandon' && <AbandonDialog open onOpenChange={close} fixture={dialog.fixture} onDone={() => void refetch()} />}
      {dialog?.kind === 'manual' && (
        <CompleteMatchDialog open onOpenChange={close} fixture={dialog.fixture} initialHome={0} initialAway={0} allowDraws={d.allowDraws} onDone={() => void refetch()} />
      )}
      {dialog?.kind === 'correct' && (
        <CorrectResultDialog
          open
          onOpenChange={close}
          fixture={dialog.fixture}
          currentHome={dialog.home}
          currentAway={dialog.away}
          allowDraws={d.allowDraws}
          onDone={() => void refetch()}
        />
      )}
      {dialog?.kind === 'reopen' && (
        <ReopenMatchDialog
          open
          onOpenChange={close}
          fixture={dialog.fixture}
          currentHome={dialog.home}
          currentAway={dialog.away}
          onDone={() => router.push(`/admin/live/${dialog.fixture.id}`)}
        />
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { LiveScoreboardFull } from '@/components/scoreboard/live-scoreboard';
import { Scoreboard } from '@/components/scoreboard/scoreboard';
import { EmptyState } from '@/components/ui/misc';
import { SectionHeading } from '@/components/ui/card';
import { TeamLogo } from '@/components/ui/media';
import { ApproxTime, Countdown, TzDate } from '@/components/ui/time';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import type { FixtureWithTeams } from '@/lib/queries/matches';
import { loadLiveOverview, type LiveOverviewData } from './load';

function NextUp({ f }: { f: FixtureWithTeams }) {
  return (
    <Link href={`/matches/${f.id}`} className="block rounded-card border border-border bg-surface p-6 hover:border-accent/60">
      <p className="text-xs uppercase tracking-wide text-muted">Next match · Match {f.match_number}</p>
      <div className="mt-4 flex items-center justify-center gap-4 sm:gap-10">
        {[f.home, f.away].map((t, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamLogo logoPath={t?.logo_path} name={t?.name ?? 'TBD'} shortName={t?.short_name ?? 'TBD'} color={t?.primary_color} size={72} />
            <span className="w-full truncate font-display text-xl font-bold uppercase">{t?.name ?? 'TBD'}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 text-center">
        <p className="text-sm text-muted">
          <TzDate iso={f.scheduled_at} pattern="EEE d MMM" /> · <ApproxTime iso={f.scheduled_at} />
          {f.venue ? ` · ${f.venue}` : ''}
        </p>
        <Countdown iso={f.scheduled_at} className="tabular mt-1 block font-display text-4xl font-bold text-accent" />
      </div>
    </Link>
  );
}

export function LiveOverview({ initial }: { initial: LiveOverviewData }) {
  const { data } = useRealtimeQuery<LiveOverviewData>({
    key: 'live-overview',
    initialData: initial,
    subscriptions: [{ table: 'fixtures' }, { table: 'match_results' }],
    fetcher: () => loadLiveOverview(getBrowserClient()),
    onChange: (p) => p.table !== 'fixtures' || p.eventType !== 'UPDATE' || p.new?.status !== p.old?.status,
  });
  const d = data ?? initial;

  if (d.live.length > 0) {
    const [hero, ...rest] = d.live;
    return (
      <div className="space-y-6">
        {hero && (
          <div>
            <LiveScoreboardFull key={hero.fixture.id} fixtureId={hero.fixture.id} initial={hero} />
            <p className="mt-2 text-right">
              <Link href={`/matches/${hero.fixture.id}`} className="text-sm font-semibold text-accent hover:underline">
                Open match page and play-by-play →
              </Link>
            </p>
          </div>
        )}
        {rest.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {rest.map((b) => (
              <div key={b.fixture.id}>
                <LiveScoreboardFull fixtureId={b.fixture.id} initial={b} />
                <p className="mt-2 text-right">
                  <Link href={`/matches/${b.fixture.id}`} className="text-sm font-semibold text-accent hover:underline">
                    Match page →
                  </Link>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <EmptyState>No match is live right now. Scores appear here the moment a match starts.</EmptyState>
      <section>
        <SectionHeading title="Next up" />
        {d.next ? <NextUp f={d.next} /> : <EmptyState>No matches scheduled yet</EmptyState>}
      </section>
      <section>
        <SectionHeading
          title="Latest results"
          action={
            <Link href="/fixtures" className="text-sm font-semibold text-accent hover:underline">
              All fixtures
            </Link>
          }
        />
        {d.latest.length === 0 ? (
          <EmptyState>No results yet</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {d.latest.map((f) => (
              <Scoreboard
                key={f.id}
                variant="compact"
                linkToMatch
                bundle={{ fixture: f, state: null, result: f.result, events: [], rules: null, playoffLabel: null }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

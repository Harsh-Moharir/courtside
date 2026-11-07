'use client';
import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchSpotlight } from '@/lib/queries/home';
import type { MatchBundle, MatchTeam } from '@/lib/queries/matches';
import { LiveScoreboardCompact } from '@/components/scoreboard/live-scoreboard';
import { TeamLogo } from '@/components/ui/media';
import { ApproxTime, Countdown, TzDate } from '@/components/ui/time';
import { teamStyle } from '@/lib/color';

function Side({ team }: { team: MatchTeam | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center" style={teamStyle(team?.primary_color, team?.secondary_color)}>
      {team ? (
        <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={72} />
      ) : (
        <span className="h-[72px] w-[72px] rounded-full border border-dashed border-border" aria-hidden />
      )}
      <span className="w-full truncate font-display text-xl font-bold uppercase sm:text-2xl" title={team?.name}>
        {team?.name ?? 'TBD'}
      </span>
    </div>
  );
}

/** Match of the Day / next match banner (11.3 item 3). Hidden when there is nothing to show. */
export function Spotlight({ initial }: { initial: MatchBundle | null }) {
  const { data } = useRealtimeQuery<MatchBundle | null>({
    key: 'home-spotlight',
    initialData: initial,
    subscriptions: [{ table: 'fixtures' }, { table: 'tournaments' }],
    fetcher: () => fetchSpotlight(getBrowserClient()),
    onChange: (p) => p.table === 'tournaments' || p.eventType !== 'UPDATE' || p.new?.status !== p.old?.status || p.new?.scheduled_at !== p.old?.scheduled_at,
  });
  if (!data) return null;
  const f = data.fixture;
  const heading = f.status === 'live' ? 'Live now' : 'Next match';
  return (
    <section aria-labelledby="spotlight-heading">
      <div className="mb-3 flex items-center gap-2">
        <Star className="h-5 w-5 text-accent" aria-hidden />
        <h2 id="spotlight-heading" className="font-display text-2xl font-bold uppercase sm:text-3xl">
          Match of the day <span className="text-muted">· {heading}</span>
        </h2>
      </div>
      {f.status === 'live' ? (
        <LiveScoreboardCompact fixtureId={f.id} initial={data} />
      ) : (
        <Link
          href={`/matches/${f.id}`}
          className="block rounded-card border border-border bg-[linear-gradient(135deg,#1c1c1c,#141414)] p-5 transition hover:border-accent/60 sm:p-8"
        >
          <div className="flex items-center gap-4">
            <Side team={f.home} />
            <div className="flex shrink-0 flex-col items-center gap-1 text-center">
              <span className="font-display text-sm font-bold uppercase text-muted">Match {f.match_number}</span>
              <span className="font-display text-3xl font-extrabold uppercase text-accent sm:text-4xl">vs</span>
              <Countdown iso={f.scheduled_at} className="font-display text-xl font-bold tabular sm:text-2xl" />
            </div>
            <Side team={f.away} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted">
            {f.scheduled_at && <TzDate iso={f.scheduled_at} pattern="EEEE d MMMM" />}
            <ApproxTime iso={f.scheduled_at} className="font-semibold text-fg" />
            {f.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden /> {f.venue}
              </span>
            )}
          </div>
        </Link>
      )}
    </section>
  );
}

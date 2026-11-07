'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { Scoreboard, scoresOf } from '@/components/scoreboard/scoreboard';
import { EventTicker } from '@/components/scoreboard/event-ticker';
import { PeriodTable } from '@/components/scoreboard/period-table';
import { ShareButton } from '@/components/scoreboard/share-button';
import { useMatch } from '@/components/scoreboard/use-match';
import { Badge, StatusChip } from '@/components/ui/badge';
import { TeamLogo } from '@/components/ui/media';
import { ApproxTime, Countdown, TzDate } from '@/components/ui/time';
import { ErrorState } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { teamStyle } from '@/lib/color';
import { shareText, type MatchBundle, type MatchTeam } from '@/lib/queries/matches';

function PreTeam({ team, fallback }: { team: MatchTeam | null; fallback: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center" style={teamStyle(team?.primary_color, team?.secondary_color)}>
      <TeamLogo
        logoPath={team?.logo_path}
        name={team?.name ?? fallback}
        shortName={team?.short_name ?? 'TBD'}
        color={team?.primary_color ?? '#2A2A2A'}
        size={96}
        className="shadow-[0_0_48px_-8px_var(--team-visible)]"
      />
      <p className="line-clamp-2 w-full break-words font-display text-xl font-bold uppercase leading-tight sm:text-3xl" title={team?.name ?? fallback}>
        {team?.name ?? fallback}
      </p>
    </div>
  );
}

function PreMatchCard({ b }: { b: MatchBundle }) {
  const f = b.fixture;
  const postponed = f.status === 'postponed';
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface" aria-label="Match preview">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
        <span>
          Match {f.match_number}
          {b.playoffLabel ? ` · ${b.playoffLabel}` : ''}
        </span>
        <StatusChip status={f.status} />
      </div>
      <div className="px-4 py-8 sm:px-8">
        <div className="flex items-center gap-3 sm:gap-8">
          <PreTeam team={f.home} fallback="To be decided" />
          <span className="font-display text-3xl font-bold text-muted sm:text-5xl">VS</span>
          <PreTeam team={f.away} fallback="To be decided" />
        </div>
        <div className="mt-8 grid gap-3 text-center sm:grid-cols-3">
          <div className="rounded-btn bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Date</p>
            <p className={postponed ? 'mt-1 font-semibold text-muted line-through' : 'mt-1 font-semibold'}>
              {f.scheduled_at ? <TzDate iso={f.scheduled_at} pattern="EEEE, d MMMM yyyy" /> : 'To be announced'}
            </p>
          </div>
          <div className="rounded-btn bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Start</p>
            <p className={postponed ? 'mt-1 font-semibold text-muted line-through' : 'mt-1 font-semibold'}>
              <ApproxTime iso={f.scheduled_at} />
            </p>
          </div>
          <div className="rounded-btn bg-surface-2 px-3 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Venue</p>
            <p className="mt-1 truncate font-semibold">{f.venue ?? 'To be announced'}</p>
          </div>
        </div>
        {postponed ? (
          <p className="mt-6 rounded-btn border border-warning/40 bg-warning/10 px-4 py-3 text-center text-sm">
            Postponed{f.postponed_reason ? `: ${f.postponed_reason}` : ''}. A new date will be announced.
          </p>
        ) : (
          f.scheduled_at && (
            <p className="mt-6 text-center">
              <span className="block text-xs uppercase tracking-wide text-muted">Tip-off in</span>
              <Countdown iso={f.scheduled_at} className="tabular font-display text-4xl font-bold text-accent" />
            </p>
          )
        )}
      </div>
    </section>
  );
}

export function MatchView({ fixtureId, initial }: { fixtureId: string; initial: MatchBundle }) {
  const { data, status, error, refetch } = useMatch(fixtureId, initial);
  const b = data ?? initial;
  const f = b.fixture;
  const quarters = b.rules?.quarters ?? 4;
  const scores = scoresOf(b);
  const r = b.result;
  const text = scores ? shareText(f, scores.home, scores.away, f.status) : `${f.home?.name ?? 'TBD'} vs ${f.away?.name ?? 'TBD'}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/fixtures" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All fixtures
        </Link>
        <div className="flex items-center gap-3">
          {f.status !== 'live' && <ConnectionIndicator status={status} />}
          <ShareButton text={text} path={`/matches/${f.id}`} />
        </div>
      </div>
      {error && !data && <ErrorState message="Could not load the latest match data." onRetry={() => void refetch()} />}

      {f.status === 'upcoming' || f.status === 'postponed' ? (
        <PreMatchCard b={b} />
      ) : (
        <Scoreboard bundle={b} variant="full" connection={status} />
      )}

      {f.status === 'completed' && r && (
        <div className="flex flex-wrap items-center gap-2">
          {r.result_type === 'forfeit' && <Badge className="border-warning/50 bg-warning/10 text-yellow-200">Forfeit</Badge>}
          {r.correction_count > 0 && (
            <Badge className="border-accent/50 text-accent" title={r.correction_note ?? undefined}>
              Corrected
            </Badge>
          )}
          {r.correction_count > 0 && r.correction_note && <span className="text-sm text-muted">Note: {r.correction_note}</span>}
          {r.result_type === 'forfeit' && r.note && <span className="text-sm text-muted">{r.note}</span>}
        </div>
      )}

      {f.status === 'live' && <EventTicker events={b.events} quarters={quarters} />}

      {f.status === 'completed' && r && r.result_type !== 'forfeit' && (
        <section>
          <h2 className="mb-2 font-display text-xl font-bold uppercase">Score by period</h2>
          <PeriodTable fixture={f} periodScores={r.period_scores} quarters={quarters} finalHome={r.home_score} finalAway={r.away_score} />
        </section>
      )}

      {(f.status === 'live' || f.status === 'completed') && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {f.scheduled_at && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden />
              <TzDate iso={f.scheduled_at} pattern="EEE d MMM yyyy, h:mm a" />
            </span>
          )}
          {f.venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden />
              {f.venue}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

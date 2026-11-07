'use client';
import Link from 'next/link';
import { StatusChip } from '@/components/ui/badge';
import { TeamLogo } from '@/components/ui/media';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { approxTime, formatInTournamentTz } from '@/lib/format';
import { teamStyle } from '@/lib/color';
import { fixtureScore, slotText, type FixtureTeam, type FixtureView } from '@/lib/queries/fixtures';

function TeamSide({
  team,
  placeholder,
  align,
  winner,
  dim,
}: {
  team: FixtureTeam | null;
  placeholder: string;
  align: 'left' | 'right';
  winner: boolean;
  dim: boolean;
}) {
  if (!team) {
    return (
      <div className={cn('flex min-w-0 items-center gap-2.5', align === 'right' && 'sm:flex-row-reverse sm:text-right')}>
        <span className="inline-block h-9 w-9 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
        <span className="truncate text-sm italic text-muted" title={placeholder}>
          {placeholder}
        </span>
      </div>
    );
  }
  return (
    <div
      style={teamStyle(team.primary_color, team.secondary_color)}
      className={cn('flex min-w-0 items-center gap-2.5', align === 'right' && 'sm:flex-row-reverse sm:text-right')}
    >
      <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={36} />
      <span
        className={cn('truncate font-semibold', winner && 'text-fg', dim && 'text-muted')}
        title={team.name}
      >
        {team.name}
      </span>
    </div>
  );
}

export interface FixtureRowProps {
  fixture: FixtureView;
  /** Show the date (for lists not already grouped by date). */
  showDate?: boolean;
  className?: string;
}

/** One fixture as a clickable row (7.5). Links to the shareable match page. */
export function FixtureRow({ fixture: f, showDate = false, className }: FixtureRowProps) {
  const t = useTournament();
  const tz = t.timezone;
  const score = fixtureScore(f);
  const postponed = f.status === 'postponed';
  const winnerId = f.status === 'completed' ? (f.result?.winner_team_id ?? null) : null;
  const homeWin = !!winnerId && winnerId === f.home_team_id;
  const awayWin = !!winnerId && winnerId === f.away_team_id;
  const stageLabel = f.stage === 'playoff' ? (f.node?.label ?? 'Playoff') : f.round_number ? `Round ${f.round_number}` : 'League';
  const breakLabel = f.status === 'live' && f.live?.is_break ? 'halftime' : null;

  let when: React.ReactNode;
  if (!f.scheduled_at) when = <span className="text-muted">Date to be announced</span>;
  else if (postponed)
    when = (
      <span className="text-muted">
        <s>{formatInTournamentTz(f.scheduled_at, showDate ? 'EEE d MMM, h:mm a' : 'h:mm a', tz)}</s>
      </span>
    );
  else if (f.status === 'upcoming')
    when = (
      <span>
        {showDate && <span className="mr-1">{formatInTournamentTz(f.scheduled_at, 'EEE d MMM', tz)} ·</span>}
        <span className="font-semibold text-fg">{approxTime(f.scheduled_at, tz)}</span>
      </span>
    );
  else when = <span>{formatInTournamentTz(f.scheduled_at, showDate ? 'EEE d MMM, h:mm a' : 'h:mm a', tz)}</span>;

  return (
    <Link
      href={`/matches/${f.id}`}
      className={cn(
        'group block rounded-card border border-border bg-surface px-3 py-3 transition hover:border-accent/60 sm:px-4',
        f.status === 'live' && 'border-danger/50 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]',
        postponed && 'opacity-70',
        className,
      )}
      aria-label={`Match ${f.match_number}: ${f.home?.name ?? slotText(f, 'home')} versus ${f.away?.name ?? slotText(f, 'away')}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-display text-sm font-bold text-fg">M{f.match_number}</span>
        <span className={cn('uppercase tracking-wide', f.stage === 'playoff' && 'font-semibold text-accent')}>{stageLabel}</span>
        <span className="tabular">{when}</span>
        {f.venue && <span className="truncate">· {f.venue}</span>}
        <span className="ml-auto">
          <StatusChip status={breakLabel ? 'halftime' : f.status} label={breakLabel ? 'Break' : undefined} />
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_auto_1fr]">
        <TeamSide team={f.home} placeholder={slotText(f, 'home')} align="left" winner={homeWin} dim={awayWin} />
        {/* Mobile: score beside each team; desktop: centre score */}
        <span className={cn('tabular text-right font-display text-2xl font-bold sm:hidden', awayWin && 'text-muted')}>
          {score ? score.home : ''}
        </span>
        <div className="hidden min-w-[5.5rem] items-center justify-center gap-2 sm:flex">
          {score ? (
            <span className="tabular font-display text-3xl font-extrabold">
              <span className={cn(awayWin && 'text-muted')}>{score.home}</span>
              <span className="mx-1.5 text-muted">–</span>
              <span className={cn(homeWin && 'text-muted')}>{score.away}</span>
            </span>
          ) : (
            <span className="font-display text-lg font-bold uppercase text-muted">vs</span>
          )}
        </div>
        <TeamSide team={f.away} placeholder={slotText(f, 'away')} align="right" winner={awayWin} dim={homeWin} />
        <span className={cn('tabular text-right font-display text-2xl font-bold sm:hidden', homeWin && 'text-muted')}>
          {score ? score.away : ''}
        </span>
      </div>
      {postponed && f.postponed_reason && (
        <p className="mt-2 text-xs text-yellow-200/90">
          <span className="font-semibold">Postponed:</span> {f.postponed_reason}
        </p>
      )}
      {f.status === 'completed' && f.result?.result_type === 'forfeit' && (
        <p className="mt-2 text-xs text-muted">Result by forfeit</p>
      )}
    </Link>
  );
}

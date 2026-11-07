'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { TeamLogo } from '@/components/ui/media';
import { StatusChip } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { ApproxTime, TzDate } from '@/components/ui/time';
import { teamStyle } from '@/lib/color';
import {
  breakLabel,
  effectiveMs,
  formatGameClock,
  formatShotClock,
  periodLabel,
  shotClockWarning,
  shouldHideShotClock,
  timeoutPool,
} from '@/lib/domain/clock';
import { useServerNow } from '@/lib/realtime/server-clock';
import type { RealtimeStatus } from '@/lib/realtime/use-realtime-query';
import type { MatchBundle, MatchRules, MatchState, MatchTeam } from '@/lib/queries/matches';

export const DEFAULT_RULES = {
  quarters: 4,
  timeouts_first_half: 2,
  timeouts_second_half: 3,
  timeouts_per_overtime: 1,
  team_foul_bonus_threshold: 5,
  hide_shot_clock_under_game_clock: true,
  shot_clock_seconds: 24,
};

type RulesLike = Pick<
  MatchRules,
  'quarters' | 'timeouts_first_half' | 'timeouts_second_half' | 'timeouts_per_overtime' | 'team_foul_bonus_threshold' | 'hide_shot_clock_under_game_clock'
>;

export type ScoreboardStatus = 'upcoming' | 'live' | 'halftime' | 'completed' | 'postponed';

export function deriveStatus(b: MatchBundle): ScoreboardStatus {
  const f = b.fixture;
  if (f.status === 'live' && b.state?.is_break) {
    const q = b.rules?.quarters ?? 4;
    if (b.state.period === Math.floor(q / 2)) return 'halftime';
  }
  return f.status;
}

/** Period text: `Q2`, or the break label (`Halftime`, `End Q3`), or `Final`/`Final OT`. */
export function periodText(b: MatchBundle): string {
  const q = b.rules?.quarters ?? 4;
  const s = b.state;
  if (b.fixture.status === 'completed') {
    const played = b.result?.periods_played ?? s?.period ?? q;
    if (b.result?.result_type === 'forfeit') return 'Forfeit';
    return played > q ? `Final/${periodLabel(q, played)}` : 'Final';
  }
  if (!s) return '';
  return s.is_break ? breakLabel(q, s.period) : periodLabel(q, s.period);
}

export function scoresOf(b: MatchBundle): { home: number; away: number } | null {
  if (b.result) return { home: b.result.home_score, away: b.result.away_score };
  if (b.state) return { home: b.state.home_score, away: b.state.away_score };
  return null;
}

/** Live game clock and shot clock derived from server timestamps (8.3). */
export function useClocks(state: MatchState | null, rules: { hide_shot_clock_under_game_clock: boolean } | null) {
  const now = useServerNow(100);
  if (!state) return null;
  const game = effectiveMs({ remainingMs: state.clock_remaining_ms, running: state.clock_running, updatedAt: state.clock_updated_at }, now);
  const shot = effectiveMs(
    { remainingMs: state.shot_clock_remaining_ms, running: state.shot_clock_running, updatedAt: state.shot_clock_updated_at },
    now,
  );
  const hideShot = shouldHideShotClock({
    hideUnderGameClock: rules?.hide_shot_clock_under_game_clock ?? true,
    gameMs: game,
    shotMs: shot,
    isBreak: state.is_break,
  });
  return { game, shot, hideShot, gameText: formatGameClock(game), shotText: formatShotClock(shot), warn: shotClockWarning(shot) };
}

function ShotClock({ text, warn, size = 'md' }: { text: string; warn: 'none' | 'flash' | 'expired'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'tabular inline-flex items-center justify-center rounded-md border px-2 font-display font-bold',
        size === 'lg' ? 'min-w-[3.5rem] text-4xl' : size === 'md' ? 'min-w-[2.75rem] text-2xl' : 'min-w-[2rem] text-base',
        warn === 'expired' ? 'border-danger bg-danger/20 text-danger' : warn === 'flash' ? 'animate-pulse-dot border-warning text-warning' : 'border-border text-warning',
      )}
      aria-label={`Shot clock ${text}`}
    >
      {text}
    </span>
  );
}

/** Animated score number: a 600 ms highlight when it changes (CSS animation is disabled by reduced motion). */
function ScoreNumber({ value, className, winner }: { value: number; className?: string; winner?: boolean }) {
  const prev = useRef(value);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlashKey((k) => k + 1);
    }
  }, [value]);
  return (
    <span key={flashKey} className={cn('tabular inline-block font-display font-extrabold leading-none', flashKey > 0 && 'animate-score-flash', winner === false && 'text-muted', className)}>
      {value}
    </span>
  );
}

function TimeoutDots({ left, pool }: { left: number; pool: number }) {
  const total = Math.max(pool, left);
  if (total <= 0) return <span className="text-xs text-muted">No timeouts</span>;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${left} timeouts left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-2 w-2 rounded-full', i < left ? 'bg-[var(--team-visible)]' : 'border border-border')} />
      ))}
    </span>
  );
}

function FoulsLine({ fouls, bonus }: { fouls: number; bonus: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
      Fouls <span className="tabular font-bold text-fg">{fouls}</span>
      {bonus && <span className="rounded bg-warning px-1.5 py-px text-[10px] font-extrabold text-black">BONUS</span>}
    </span>
  );
}

function TeamName({ team, className }: { team: MatchTeam | null; className?: string }) {
  return (
    <span className={cn('block truncate font-display font-bold uppercase', className)} title={team?.name ?? 'To be decided'}>
      {team?.name ?? 'TBD'}
    </span>
  );
}

function liveAnnouncement(b: MatchBundle, scores: { home: number; away: number } | null, status: ScoreboardStatus): string {
  if (!scores) return '';
  const h = b.fixture.home?.name ?? 'Home';
  const a = b.fixture.away?.name ?? 'Away';
  const label = status === 'completed' ? 'Final' : periodText(b);
  return `${h} ${scores.home}, ${a} ${scores.away}. ${label}`;
}

function AriaLive({ text }: { text: string }) {
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </span>
  );
}

export interface ScoreboardProps {
  bundle: MatchBundle;
  variant?: 'full' | 'compact';
  connection?: RealtimeStatus;
  linkToMatch?: boolean;
  className?: string;
}

export function Scoreboard({ bundle, variant = 'full', connection, linkToMatch = false, className }: ScoreboardProps) {
  return variant === 'compact' ? (
    <CompactScoreboard bundle={bundle} connection={connection} linkToMatch={linkToMatch} className={className} />
  ) : (
    <FullScoreboard bundle={bundle} connection={connection} className={className} />
  );
}

function CompactScoreboard({ bundle, connection, linkToMatch, className }: Omit<ScoreboardProps, 'variant'>) {
  const b = bundle;
  const f = b.fixture;
  const status = deriveStatus(b);
  const scores = scoresOf(b);
  const rules: RulesLike = b.rules ?? DEFAULT_RULES;
  const clocks = useClocks(f.status === 'live' ? b.state : null, rules);
  const winnerId = b.result?.winner_team_id ?? null;
  const row = (team: MatchTeam | null, score: number | undefined, side: 'home' | 'away') => (
    <div className="flex min-w-0 items-center gap-2.5" style={teamStyle(team?.primary_color, team?.secondary_color)}>
      <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--team-visible)]" aria-hidden />
      <TeamLogo logoPath={team?.logo_path} name={team?.name ?? 'TBD'} shortName={team?.short_name ?? 'TBD'} color={team?.primary_color} size={32} />
      <TeamName team={team} className="min-w-0 flex-1 text-lg" />
      {score !== undefined && (
        <ScoreNumber
          value={score}
          className="text-3xl"
          winner={status === 'completed' && winnerId ? winnerId === (side === 'home' ? f.home_team_id : f.away_team_id) : undefined}
        />
      )}
    </div>
  );
  const body = (
    <div className={cn('rounded-card border border-border bg-surface p-3.5 transition hover:border-accent/50', className)}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          Match {f.match_number}
          {b.playoffLabel ? ` · ${b.playoffLabel}` : ''}
          {f.venue ? ` · ${f.venue}` : ''}
        </span>
        <StatusChip status={status} />
      </div>
      <div className="space-y-1.5">
        {row(f.home, scores?.home, 'home')}
        {row(f.away, scores?.away, 'away')}
      </div>
      <div className="mt-2 flex min-h-[22px] items-center justify-between gap-2 text-xs text-muted">
        {f.status === 'live' && clocks ? (
          <span className="inline-flex items-center gap-2 font-display text-base font-bold text-fg">
            <span>{periodText(b)}</span>
            {!b.state?.is_break && <span className="tabular">{clocks.gameText}</span>}
          </span>
        ) : f.status === 'completed' ? (
          <span className="font-display text-sm font-bold uppercase text-fg">{periodText(b)}</span>
        ) : (
          <span>
            {f.scheduled_at ? (
              <>
                <TzDate iso={f.scheduled_at} pattern="EEE d MMM" /> · <ApproxTime iso={f.scheduled_at} />
              </>
            ) : (
              'Date to be announced'
            )}
          </span>
        )}
        {connection && f.status === 'live' && <ConnectionIndicator status={connection} />}
      </div>
      <AriaLive text={f.status === 'live' ? liveAnnouncement(b, scores, status) : ''} />
    </div>
  );
  return linkToMatch ? (
    <Link href={`/matches/${f.id}`} className="block rounded-card" aria-label={`Match ${f.match_number}: ${f.home?.name ?? 'TBD'} vs ${f.away?.name ?? 'TBD'}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

function FullTeamPanel({
  team,
  side,
  b,
  rules,
  score,
  isWinner,
}: {
  team: MatchTeam | null;
  side: 'home' | 'away';
  b: MatchBundle;
  rules: RulesLike;
  score: number | undefined;
  isWinner: boolean | undefined;
}) {
  const s = b.state;
  const live = b.fixture.status === 'live' && s;
  const fouls = s ? (side === 'home' ? s.home_fouls : s.away_fouls) : 0;
  const oppFouls = s ? (side === 'home' ? s.away_fouls : s.home_fouls) : 0;
  const left = s ? (side === 'home' ? s.home_timeouts_left : s.away_timeouts_left) : 0;
  const pool = s ? timeoutPool(rules, s.period) : 0;
  return (
    <div
      className={cn('flex min-w-0 flex-1 items-center gap-3 md:flex-col md:gap-3', side === 'away' && 'md:items-center')}
      style={teamStyle(team?.primary_color, team?.secondary_color)}
    >
      <TeamLogo
        logoPath={team?.logo_path}
        name={team?.name ?? 'TBD'}
        shortName={team?.short_name ?? 'TBD'}
        color={team?.primary_color}
        size={88}
        className="hidden shadow-[0_0_48px_-8px_var(--team-visible)] md:inline-flex"
      />
      <TeamLogo logoPath={team?.logo_path} name={team?.name ?? 'TBD'} shortName={team?.short_name ?? 'TBD'} color={team?.primary_color} size={44} className="md:hidden" />
      <div className="min-w-0 flex-1 md:w-full md:flex-none md:text-center">
        <TeamName team={team} className={cn('text-xl sm:text-2xl md:text-3xl', isWinner && 'text-[var(--team-visible)]')} />
        {live && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-center">
            <FoulsLine fouls={fouls} bonus={oppFouls >= rules.team_foul_bonus_threshold} />
            <TimeoutDots left={left} pool={pool} />
          </div>
        )}
        {isWinner !== undefined && (
          <span
            className={cn('mt-1 inline-block rounded-full bg-success/15 px-2 py-0.5 text-xs font-bold uppercase text-green-300', !isWinner && 'invisible')}
            aria-hidden={!isWinner}
          >
            Winner
          </span>
        )}
      </div>
      {score !== undefined && (
        <ScoreNumber value={score} winner={isWinner} className="text-6xl sm:text-7xl md:hidden" />
      )}
    </div>
  );
}

function FullScoreboard({ bundle, connection, className }: Omit<ScoreboardProps, 'variant' | 'linkToMatch'>) {
  const b = bundle;
  const f = b.fixture;
  const status = deriveStatus(b);
  const scores = scoresOf(b);
  const rules: RulesLike = b.rules ?? DEFAULT_RULES;
  const clocks = useClocks(f.status === 'live' ? b.state : null, rules);
  const winnerId = b.result?.winner_team_id ?? null;
  const homeWin = status === 'completed' && winnerId ? winnerId === f.home_team_id : undefined;
  const awayWin = status === 'completed' && winnerId ? winnerId === f.away_team_id : undefined;
  const label = periodText(b);

  const clockBlock = clocks ? (
    <div className="flex items-center justify-center gap-3">
      <span className="font-display text-xl font-bold uppercase text-accent md:text-2xl">{label}</span>
      {!b.state?.is_break && (
        <span className={cn('tabular font-display text-4xl font-bold md:text-5xl', clocks.game === 0 && 'text-danger')} aria-label={`Game clock ${clocks.gameText}`}>
          {clocks.gameText}
        </span>
      )}
      {!clocks.hideShot && <ShotClock text={clocks.shotText} warn={clocks.warn} size="md" />}
    </div>
  ) : (
    <div className="text-center font-display text-2xl font-bold uppercase text-accent">{label || (f.status === 'upcoming' ? 'Upcoming' : '')}</div>
  );

  return (
    <section
      className={cn('relative overflow-hidden rounded-card border border-border bg-surface', className)}
      aria-label={`Scoreboard: ${f.home?.name ?? 'TBD'} vs ${f.away?.name ?? 'TBD'}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background: `linear-gradient(90deg, ${f.home?.primary_color ?? '#F97316'}33 0%, transparent 40%, transparent 60%, ${f.away?.primary_color ?? '#F97316'}33 100%)`,
        }}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
        <span className="truncate">
          Match {f.match_number}
          {b.playoffLabel ? ` · ${b.playoffLabel}` : ''}
          {f.venue ? ` · ${f.venue}` : ''}
        </span>
        <span className="flex items-center gap-3">
          {connection && f.status === 'live' && <ConnectionIndicator status={connection} />}
          <StatusChip status={status} />
        </span>
      </div>
      {/* Mobile: sticky clock bar */}
      {f.status === 'live' && (
        <div className="sticky top-16 z-10 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:hidden">{clockBlock}</div>
      )}
      <div className="relative px-4 py-5 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          <FullTeamPanel team={f.home} side="home" b={b} rules={rules} score={scores?.home} isWinner={homeWin} />
          <div className="hidden shrink-0 flex-col items-center gap-3 md:flex">
            {scores ? (
              <div className="flex items-center gap-4">
                <ScoreNumber value={scores.home} winner={homeWin} className="text-[clamp(64px,8vw,120px)]" />
                <span className="font-display text-4xl text-muted">–</span>
                <ScoreNumber value={scores.away} winner={awayWin} className="text-[clamp(64px,8vw,120px)]" />
              </div>
            ) : (
              <span className="font-display text-5xl font-bold text-muted">VS</span>
            )}
            {f.status === 'live' ? clockBlock : <div className="font-display text-xl font-bold uppercase text-accent">{label}</div>}
          </div>
          <FullTeamPanel team={f.away} side="away" b={b} rules={rules} score={scores?.away} isWinner={awayWin} />
        </div>
        {f.status !== 'live' && label && (
          <p className="mt-3 text-center font-display text-lg font-bold uppercase text-accent md:hidden">{label}</p>
        )}
      </div>
      <AriaLive text={liveAnnouncement(b, scores, status)} />
    </section>
  );
}

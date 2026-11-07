'use client';
import Link from 'next/link';
import { TeamLogo } from '@/components/ui/media';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { formatInTournamentTz } from '@/lib/format';
import { sourceText, type SourceKind } from '@/lib/domain/bracket';
import { periodLabel } from '@/lib/domain/clock';
import type { PlayoffNodeView } from '@/lib/queries/playoffs';
import type { TeamLite } from '@/lib/queries/standings';

export interface CardSide {
  team: TeamLite | null;
  seed: number | null;
  score: number | null;
  winner: boolean;
  loser: boolean;
  kind: SourceKind;
  ref: string;
}

export function nodeSides(node: PlayoffNodeView, teams: Record<string, TeamLite>, seedOf: (teamId: string) => number | null): [CardSide, CardSide] {
  const f = node.fixture;
  const winnerId = node.result?.winner_team_id ?? null;
  const side = (teamId: string | null | undefined, score: number | null, kind: SourceKind, ref: string): CardSide => ({
    team: teamId ? (teams[teamId] ?? null) : null,
    seed: teamId ? seedOf(teamId) : null,
    score,
    winner: !!winnerId && winnerId === teamId,
    loser: !!winnerId && !!teamId && winnerId !== teamId,
    kind,
    ref,
  });
  const hs = node.result ? node.result.home_score : node.live ? node.live.home_score : null;
  const as = node.result ? node.result.away_score : node.live ? node.live.away_score : null;
  return [side(f?.home_team_id, hs, node.home_kind, node.home_ref), side(f?.away_team_id, as, node.away_kind, node.away_ref)];
}

function TeamRow({ s, compact }: { s: CardSide; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 px-3', compact ? 'h-[34px]' : 'min-h-[44px] py-1.5', s.loser && 'opacity-55')}>
      {s.team ? (
        <>
          <TeamLogo logoPath={s.team.logo_path} name={s.team.name} shortName={s.team.short_name} color={s.team.primary_color} size={24} />
          {s.seed !== null && <span className="rounded bg-surface-2 px-1 font-display text-xs font-bold text-muted">#{s.seed}</span>}
          <span className={cn('min-w-0 flex-1 truncate text-sm', s.winner ? 'font-extrabold text-fg' : 'font-semibold')} title={s.team.name}>
            {s.team.name}
          </span>
        </>
      ) : (
        <>
          <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs italic text-muted" title={sourceText(s.kind, s.ref)}>
            {sourceText(s.kind, s.ref)}
          </span>
        </>
      )}
      {s.score !== null && (
        <span className={cn('font-display text-lg font-bold tabular', s.winner ? 'text-accent' : 'text-fg')}>{s.score}</span>
      )}
    </div>
  );
}

export function BracketCard({
  node,
  sides,
  quarters,
  compact = true,
  className,
  style,
}: {
  node: PlayoffNodeView;
  sides: [CardSide, CardSide];
  quarters: number;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useTournament();
  const f = node.fixture;
  const status = f?.status ?? 'upcoming';
  const isLive = status === 'live';
  const when =
    status === 'completed'
      ? 'Final'
      : isLive && node.live
        ? node.live.is_break
          ? 'Break'
          : `Live · ${periodLabel(quarters, node.live.period)}`
        : f?.scheduled_at
          ? `Approx. ${formatInTournamentTz(f.scheduled_at, compact ? 'd MMM, h:mm a' : 'EEE d MMM, h:mm a', t.timezone)}`
          : status === 'postponed'
            ? 'Postponed'
            : 'Date TBA';
  const body = (
    <>
      {isLive && <span className="pointer-events-none absolute inset-0 animate-pulse rounded-[12px] ring-2 ring-inset ring-[rgba(239,68,68,0.7)]" aria-hidden />}
      <div className="flex h-[24px] items-center gap-2 border-b border-[rgba(42,42,42,0.7)] px-3 text-[11px] uppercase tracking-wide">
        <span className="font-bold text-fg">{node.label}</span>
        {f && <span className="text-muted">M{f.match_number}</span>}
        <span
          className={cn(
            'ml-auto truncate normal-case',
            isLive ? 'font-semibold text-red-300' : status === 'completed' ? 'font-semibold text-green-300' : status === 'postponed' ? 'text-yellow-200' : 'text-muted',
          )}
        >
          {isLive && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-danger align-middle" aria-hidden />}
          {when}
        </span>
      </div>
      <TeamRow s={sides[0]} compact={compact} />
      <TeamRow s={sides[1]} compact={compact} />
    </>
  );
  const cls = cn(
    'relative block overflow-hidden rounded-[12px] border bg-surface transition hover:border-[rgba(249,115,22,0.7)]',
    isLive ? 'border-[rgba(239,68,68,0.7)]' : 'border-border',
    node.is_final && 'border-[rgba(249,115,22,0.6)]',
    className,
  );
  return f ? (
    <Link href={`/matches/${f.id}`} className={cls} style={style} aria-label={`${node.label}: ${sides.map((s) => s.team?.name ?? sourceText(s.kind, s.ref)).join(' versus ')}, ${when}`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

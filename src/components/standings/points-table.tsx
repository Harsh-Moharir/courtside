'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStandings, TIEBREAKER_LABELS, type StandingsData } from '@/lib/queries/standings';
import { TeamLogo } from '@/components/ui/media';
import { EmptyState, ErrorState, LiveDot } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { RelativeTime } from '@/components/ui/time';
import { cn } from '@/components/ui/cn';
import { signed } from '@/lib/format';
import { visibleOnDark } from '@/lib/color';
import { InfoTip } from './info-tip';

export const STANDINGS_SUBSCRIPTIONS = [
  { table: 'standings' },
  { table: 'fixtures' },
  { table: 'teams' },
  { table: 'points_settings' },
  { table: 'playoff_settings' },
];

export function PdCell({ pd }: { pd: number }) {
  return <span className={cn('tabular font-semibold', pd > 0 ? 'text-success' : pd < 0 ? 'text-red-400' : 'text-muted')}>{signed(pd)}</span>;
}

export function PointsTable({ initial }: { initial: StandingsData }) {
  const [showAll, setShowAll] = useState(false);
  const { data, status, error, refetch } = useRealtimeQuery<StandingsData>({
    key: 'points-table',
    initialData: initial,
    fetcher: () => fetchStandings(getBrowserClient()),
    subscriptions: STANDINGS_SUBSCRIPTIONS,
  });
  const d = data ?? initial;
  const n = d.qualifying;
  const allowDraws = d.settings?.allow_draws ?? false;
  const live = new Set(d.liveTeamIds);
  // Columns that collapse below 480px unless "Show all columns" is on.
  const opt = showAll ? 'table-cell' : 'hidden xs:table-cell';
  const th = 'px-2 py-3 text-right font-display text-sm font-bold uppercase tracking-wide text-muted';
  const td = 'px-2 py-3 text-right tabular';

  if (d.rows.length === 0) {
    return <EmptyState>No teams yet. The table appears as soon as teams are added.</EmptyState>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-muted">
          <ConnectionIndicator status={status} />
          {d.updatedAt && (
            <span>
              Updated <RelativeTime iso={d.updatedAt} />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-[40px] rounded-btn border border-border px-3 text-sm font-semibold xs:hidden"
          aria-pressed={showAll}
        >
          {showAll ? 'Show fewer columns' : 'Show all columns'}
        </button>
      </div>
      {error && <ErrorState message="Could not refresh the table." onRetry={() => void refetch()} />}
      {d.completedLeague === 0 && (
        <div role="status" className="mb-3 flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
          <AlertCircle className="h-4 w-4 text-accent" aria-hidden /> No matches completed yet. Teams are ordered by the tiebreak fallback (admin ranking, then name).
        </div>
      )}
      <div className="scrollbar-thin w-full overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <caption className="sr-only">League standings. The top {n} teams qualify for the playoffs.</caption>
          <thead className="border-b border-border bg-surface-2">
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-12 bg-surface-2 px-2 py-3 text-left font-display text-sm font-bold uppercase text-muted">
                #
              </th>
              <th scope="col" className="sticky left-12 z-10 bg-surface-2 px-2 py-3 text-left font-display text-sm font-bold uppercase text-muted">
                Team
              </th>
              <th scope="col" className={th} title="Matches played">MP</th>
              <th scope="col" className={th} title="Wins">W</th>
              <th scope="col" className={th} title="Losses">L</th>
              {allowDraws && <th scope="col" className={cn(th, opt)} title="Draws">D</th>}
              <th scope="col" className={cn(th, opt)} title="Points for">PF</th>
              <th scope="col" className={cn(th, opt)} title="Points against">PA</th>
              <th scope="col" className={th} title="Point difference">PD</th>
              <th scope="col" className={cn(th, 'text-fg')} title="League points">PTS</th>
              <th scope="col" className={cn(th, opt, 'pr-4')} title="Matches left">Left</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => {
              const q = r.rank <= n;
              const cut = r.rank === n && d.rows.length > n;
              const isLive = live.has(r.team_id);
              return (
                <tr
                  key={r.team_id}
                  className={cn('border-b border-[rgba(42,42,42,0.7)] transition-colors odd:bg-surface even:bg-[rgba(28,28,28,0.4)] hover:bg-surface-2', cut && 'border-b-2 border-dashed border-b-[rgba(249,115,22,0.7)]')}
                >
                  <td className={cn('sticky left-0 z-10 w-12 bg-inherit px-2 py-3 text-left', q ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-transparent')}>
                    <span className="flex items-center gap-1 font-display text-lg font-bold tabular">
                      {r.rank}
                      {q && (
                        <span className="rounded bg-accent px-1 text-[10px] font-extrabold leading-4 text-accent-contrast" title="Qualifies for playoffs">
                          Q
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="sticky left-12 z-10 max-w-[180px] bg-inherit px-2 py-2 sm:max-w-none">
                    <div className="flex items-center gap-2.5">
                      <TeamLogo logoPath={r.team.logo_path} name={r.team.name} shortName={r.team.short_name} color={r.team.primary_color} size={32} />
                      <Link
                        href={`/teams/${r.team_id}`}
                        className="min-w-0 truncate font-semibold hover:underline"
                        style={{ textDecorationColor: visibleOnDark(r.team.primary_color) }}
                        title={r.team.name}
                      >
                        <span className="hidden sm:inline">{r.team.name}</span>
                        <span className="sm:hidden">{r.team.short_name}</span>
                      </Link>
                      {isLive && (
                        <span title="Official standings update when the match is completed" className="inline-flex">
                          <LiveDot label="Playing now. Official standings update when the match is completed" />
                        </span>
                      )}
                      {r.tiebreak_note && <InfoTip text={r.tiebreak_note} label="Tiebreak" />}
                    </div>
                  </td>
                  <td className={td}>{r.played}</td>
                  <td className={td}>{r.wins}</td>
                  <td className={td}>{r.losses}</td>
                  {allowDraws && <td className={cn(td, opt)}>{r.draws}</td>}
                  <td className={cn(td, opt)}>{r.points_for}</td>
                  <td className={cn(td, opt)}>{r.points_against}</td>
                  <td className={td}>
                    <PdCell pd={r.point_diff ?? r.points_for - r.points_against} />
                  </td>
                  <td className={cn(td, 'font-display text-lg font-extrabold')}>{r.league_points}</td>
                  <td className={cn(td, opt, 'pr-4 text-muted')}>{r.remaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-muted">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-accent px-1 text-[10px] font-extrabold leading-4 text-accent-contrast">Q</span> = qualifies for playoffs (top {n})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LiveDot className="h-2 w-2" /> playing now; official standings update when the match is completed
          </span>
        </p>
        {d.settings && (
          <>
            <p>
              Points: Win {d.settings.win_points}, Loss {d.settings.loss_points}
              {d.settings.allow_draws ? `, Draw ${d.settings.draw_points}` : ''}. Forfeit wins count as {d.settings.forfeit_score}-0.
            </p>
            <p>
              Ties on points are broken by: {d.settings.tiebreaker_order.map((t) => TIEBREAKER_LABELS[t]).join(', ')}, then admin ranking, then name.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

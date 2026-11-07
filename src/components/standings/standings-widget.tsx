'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStandings, type StandingsData } from '@/lib/queries/standings';
import { TeamLogo } from '@/components/ui/media';
import { EmptyState, LiveDot } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { PdCell, STANDINGS_SUBSCRIPTIONS } from './points-table';

/** Compact homepage table (9.5): Rank, Team, MP, W, L, PD, PTS. */
export function StandingsWidget({ initial }: { initial: StandingsData }) {
  const { data } = useRealtimeQuery<StandingsData>({
    key: 'standings-widget',
    initialData: initial,
    fetcher: () => fetchStandings(getBrowserClient()),
    subscriptions: STANDINGS_SUBSCRIPTIONS,
  });
  const d = data ?? initial;
  const live = new Set(d.liveTeamIds);
  if (d.rows.length === 0) return <EmptyState>No teams yet.</EmptyState>;
  const th = 'px-2 py-2 text-right font-display text-xs font-bold uppercase text-muted';
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Points table summary</caption>
        <thead className="bg-surface-2">
          <tr>
            <th scope="col" className="w-10 px-3 py-2 text-left font-display text-xs font-bold uppercase text-muted">#</th>
            <th scope="col" className="px-2 py-2 text-left font-display text-xs font-bold uppercase text-muted">Team</th>
            <th scope="col" className={th}>MP</th>
            <th scope="col" className={th}>W</th>
            <th scope="col" className={th}>L</th>
            <th scope="col" className={th}>PD</th>
            <th scope="col" className={cn(th, 'pr-3 text-fg')}>PTS</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.team_id} className={cn('border-t border-[rgba(42,42,42,0.7)]', r.rank === d.qualifying && d.rows.length > d.qualifying && 'border-b-2 border-dashed border-b-[rgba(249,115,22,0.7)]')}>
              <td className={cn('px-3 py-2 font-display font-bold tabular', r.rank <= d.qualifying ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-transparent')}>
                {r.rank}
              </td>
              <td className="max-w-[160px] px-2 py-2">
                <Link href={`/teams/${r.team_id}`} className="flex items-center gap-2 hover:underline">
                  <TeamLogo logoPath={r.team.logo_path} name={r.team.name} shortName={r.team.short_name} color={r.team.primary_color} size={24} />
                  <span className="truncate font-semibold" title={r.team.name}>
                    <span className="hidden sm:inline">{r.team.name}</span>
                    <span className="sm:hidden">{r.team.short_name}</span>
                  </span>
                  {live.has(r.team_id) && <LiveDot className="h-2 w-2" label="Playing now" />}
                </Link>
              </td>
              <td className="px-2 py-2 text-right tabular">{r.played}</td>
              <td className="px-2 py-2 text-right tabular">{r.wins}</td>
              <td className="px-2 py-2 text-right tabular">{r.losses}</td>
              <td className="px-2 py-2 text-right">
                <PdCell pd={r.point_diff ?? r.points_for - r.points_against} />
              </td>
              <td className="px-2 py-2 pr-3 text-right font-display text-base font-extrabold tabular">{r.league_points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href="/points-table" className="flex min-h-[44px] items-center justify-center gap-1.5 border-t border-border text-sm font-semibold text-accent hover:bg-surface-2">
        Full points table <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

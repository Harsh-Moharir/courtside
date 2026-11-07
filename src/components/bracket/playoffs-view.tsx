'use client';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchPlayoffs, type PlayoffsData } from '@/lib/queries/playoffs';
import type { ChampionData } from '@/lib/queries/playoffs';
import { FORMAT_LABELS } from '@/lib/domain/bracket';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { TeamLogo } from '@/components/ui/media';
import { BracketView } from './bracket-view';
import { ChampionBanner } from './champion-banner';

export const PLAYOFF_SUBSCRIPTIONS = [
  { table: 'playoff_brackets' },
  { table: 'playoff_nodes' },
  { table: 'fixtures' },
  { table: 'match_results' },
  { table: 'match_states' },
  { table: 'standings' },
];

export function PlayoffsView({ initial, initialChampion }: { initial: PlayoffsData; initialChampion: ChampionData | null }) {
  const { data, status, error, refetch } = useRealtimeQuery<PlayoffsData>({
    key: 'playoffs',
    initialData: initial,
    fetcher: () => fetchPlayoffs(getBrowserClient()),
    subscriptions: PLAYOFF_SUBSCRIPTIONS,
    pollMs: 5000,
  });
  const d = data ?? initial;
  const n = d.bracket?.qualifying_teams ?? d.settings?.qualifying_teams ?? 4;
  const generated = d.nodes.length > 0;
  const seedsEmpty = !Array.isArray(d.bracket?.seeds) || (d.bracket?.seeds as unknown[]).length === 0;
  const provisional = !d.leagueComplete && !d.playoffsStarted;
  const top = d.standings.slice(0, n);

  return (
    <div className="space-y-6">
      <ChampionBanner initial={initialChampion} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {generated && d.bracket ? FORMAT_LABELS[d.bracket.format] : d.settings ? FORMAT_LABELS[d.settings.format] : null}
          {d.bracket?.third_place_match ? ' · with third-place match' : ''}
        </span>
        <ConnectionIndicator status={status} />
      </div>
      {error && <ErrorState message="Could not refresh the bracket." onRetry={() => void refetch()} />}

      {provisional && (
        <div className="rounded-card border border-[rgba(249,115,22,0.4)] bg-[rgba(249,115,22,0.1)] p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Info className="h-4 w-4 text-accent" aria-hidden /> Provisional: based on current standings
          </p>
          <p className="mt-1 text-sm text-muted">
            Playoff places are decided when every league match is completed. If the league ended today, these teams would qualify:
          </p>
          {top.length > 0 ? (
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {top.map((s) => {
                const t = d.teams[s.team_id];
                if (!t) return null;
                return (
                  <li key={s.team_id}>
                    <Link href={`/teams/${t.id}`} className="flex items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 hover:border-[rgba(249,115,22,0.6)]">
                      <span className="font-display text-lg font-bold text-accent">#{s.rank}</span>
                      <TeamLogo logoPath={t.logo_path} name={t.name} shortName={t.short_name} color={t.primary_color} size={28} />
                      <span className="min-w-0 flex-1 truncate font-semibold" title={t.name}>
                        {t.name}
                      </span>
                      <span className="text-xs text-muted">{s.league_points} pts</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">No standings yet.</p>
          )}
        </div>
      )}

      {!generated ? (
        <EmptyState>
          The playoff bracket has not been drawn yet. The top {n} teams of the league will qualify; the bracket appears here once the organisers
          generate it.
        </EmptyState>
      ) : (
        <>
          {d.leagueComplete && seedsEmpty && !d.playoffsStarted && (
            <p className="text-sm text-muted">The league is complete. Seeds will appear once the organisers refresh the bracket.</p>
          )}
          <BracketView data={d} />
          <p className="text-xs text-muted">
            Solid lines carry winners forward; dashed lines carry losers (third-place or second-chance matches). Times are approximate.
          </p>
        </>
      )}
    </div>
  );
}

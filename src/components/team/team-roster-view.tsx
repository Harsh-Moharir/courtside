'use client';
import { useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { TeamHeader } from '@/components/team/team-header';
import { FinanceSummary } from '@/components/team/finance-summary';
import { RosterPdfButton } from '@/components/team/roster-pdf-button';
import { RosterPlayerCard } from '@/components/player/roster-player-card';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchTeamWithIdentity, type TeamWithIdentity } from '@/lib/queries/teams';
import { fetchRoster, fetchTeamFinance, groupRoster, jerseyConflicts, type RosterEntry, type TeamFinance } from '@/lib/queries/roster';
import { POSITION_GROUPS, POSITIONS, type Position } from '@/lib/format';

export interface TeamPageData {
  team: TeamWithIdentity | null;
  roster: RosterEntry[];
  finance: TeamFinance | null;
}

export function TeamRosterView({ teamId, initial, isAdmin }: { teamId: string; initial: TeamPageData; isAdmin: boolean }) {
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');
  const { data, status, error, refetch } = useRealtimeQuery<TeamPageData>({
    key: `team:${teamId}`,
    initialData: initial,
    // Filtered channels do not deliver DELETE events, so players/auction_events also trigger a refetch:
    // a released icon or a reversed sale always changes the player's status and writes an event.
    subscriptions: [
      { table: 'team_players', filter: `team_id=eq.${teamId}` },
      { table: 'teams', filter: `id=eq.${teamId}` },
      { table: 'team_owners', filter: `team_id=eq.${teamId}` },
      { table: 'players' },
      { table: 'auction_events' },
    ],
    debounceMs: 250,
    fetcher: async () => {
      const supabase = getBrowserClient();
      const [team, roster, finance] = await Promise.all([
        fetchTeamWithIdentity(supabase, teamId),
        fetchRoster(supabase, teamId),
        fetchTeamFinance(supabase, teamId),
      ]);
      return { team, roster, finance };
    },
  });

  const team = data?.team ?? null;
  const roster = useMemo(() => data?.roster ?? [], [data]);
  const groups = useMemo(() => groupRoster(roster), [roster]);
  const conflicts = useMemo(() => (isAdmin ? jerseyConflicts(roster) : new Set<string>()), [roster, isAdmin]);
  const counts = useMemo(() => Object.fromEntries(POSITIONS.map((p) => [p, roster.filter((e) => e.player.primary_position === p).length])), [roster]);

  if (!team) notFound();
  const visible = filter === 'ALL' ? groups : groups.filter((g) => g.position === filter);

  return (
    <div className="space-y-8">
      <TeamHeader team={team}>
        <RosterPdfButton team={team} roster={roster} finance={data?.finance ?? null} />
      </TeamHeader>

      <FinanceSummary finance={data?.finance ?? null} />

      <section aria-labelledby="squad-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="squad-heading" className="font-display text-3xl font-bold uppercase">
            Squad <span className="text-muted">({roster.length})</span>
          </h2>
          <ConnectionIndicator status={status} />
        </div>
        <div className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by position">
          {(['ALL', ...POSITIONS] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilter(p)}
              aria-pressed={filter === p}
              className={cn(
                'min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold transition',
                filter === p ? 'border-accent bg-accent text-accent-contrast' : 'border-border text-muted hover:text-fg',
              )}
            >
              {p === 'ALL' ? 'All' : p}
              <span className="ml-1.5 tabular opacity-70">{p === 'ALL' ? roster.length : counts[p]}</span>
            </button>
          ))}
        </div>
        {error && <ErrorState message="Could not refresh the roster." onRetry={() => void refetch()} />}
        {roster.length === 0 ? (
          <EmptyState>No players on this roster yet. Purchases appear here the moment they are sold.</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>No {POSITION_GROUPS[filter as Position].toLowerCase()} on this roster.</EmptyState>
        ) : (
          <div className="space-y-8">
            {visible.map((g) => (
              <div key={g.position}>
                <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-muted">
                  <span className="text-team">{POSITION_GROUPS[g.position]}</span>
                  <span className="text-sm">({g.entries.length})</span>
                </h3>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <RosterPlayerCard entry={e} jerseyConflict={conflicts.has(e.player.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

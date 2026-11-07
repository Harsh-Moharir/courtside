'use client';
import { TeamCard } from '@/components/team/team-card';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchTeamsWithIdentity, type TeamWithIdentity } from '@/lib/queries/teams';
import { fetchAllFinance, type TeamFinance } from '@/lib/queries/roster';

interface Data {
  teams: TeamWithIdentity[];
  finance: Record<string, TeamFinance>;
}

export function TeamsGrid({ initial }: { initial: Data }) {
  const { data, status, error, refetch } = useRealtimeQuery<Data>({
    key: 'teams-grid',
    initialData: initial,
    subscriptions: [{ table: 'teams' }, { table: 'team_owners' }, { table: 'team_players' }, { table: 'players' }],
    fetcher: async () => {
      const supabase = getBrowserClient();
      const [teams, finance] = await Promise.all([fetchTeamsWithIdentity(supabase), fetchAllFinance(supabase)]);
      return { teams, finance };
    },
  });
  const teams = data?.teams ?? [];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'}
        </p>
        <ConnectionIndicator status={status} />
      </div>
      {error && <ErrorState message="Could not refresh the teams." onRetry={() => void refetch()} />}
      {teams.length === 0 ? (
        <EmptyState>No teams have been announced yet.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.map((t) => (
            <li key={t.id}>
              <TeamCard team={t} finance={data?.finance[t.id] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

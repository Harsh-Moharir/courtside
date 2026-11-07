'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { TeamIdentity } from '@/components/team/team-identity';
import { TeamForm } from './team-form';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchTeamsWithIdentity, type TeamWithIdentity } from '@/lib/queries/teams';
import { teamStyle } from '@/lib/color';
import type { Tables } from '@/types/database';

type Finance = Tables<'v_team_finance'>;

export function AdminTeamsList() {
  const t = useTournament();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data, loading, error, refetch } = useRealtimeQuery<{ teams: TeamWithIdentity[]; finance: Map<string, Finance> }>({
    key: 'admin-teams',
    subscriptions: [{ table: 'teams' }, { table: 'team_players' }, { table: 'team_owners' }],
    fetcher: async () => {
      const supabase = getBrowserClient();
      const [teams, fin] = await Promise.all([fetchTeamsWithIdentity(supabase), supabase.from('v_team_finance').select('*')]);
      if (fin.error) throw new Error(fin.error.message);
      return { teams, finance: new Map((fin.data ?? []).map((f) => [f.team_id, f])) };
    },
  });
  const teams = data?.teams ?? [];
  const full = teams.length >= 10;

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle={`${teams.length} of 10 teams`}
        action={
          <Button onClick={() => setOpen(true)} disabled={full || loading} title={full ? 'Maximum 10 teams' : undefined}>
            <Plus className="h-4 w-4" aria-hidden />
            {full ? 'Maximum 10 teams' : 'Add team'}
          </Button>
        }
      />
      {error && <ErrorState message="Could not load teams." onRetry={() => void refetch()} />}
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState>No teams yet. Add the first team to get started.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.map((team) => {
            const f = data?.finance.get(team.id);
            return (
              <Link
                key={team.id}
                href={`/admin/teams/${team.id}`}
                style={teamStyle(team.primary_color, team.secondary_color)}
                className="group flex flex-col rounded-card border border-border border-t-4 border-t-[var(--team-visible)] bg-surface p-5 transition hover:border-[var(--team-visible)]"
              >
                <TeamIdentity team={team} />
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                  <div>
                    <dt className="text-muted">Squad</dt>
                    <dd className="font-display text-lg font-bold tabular">
                      {f?.squad_count ?? 0}/{f?.max_squad_size ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Spent</dt>
                    <dd className="font-display text-lg font-bold">
                      <Money amount={f?.purse_spent ?? 0} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Left</dt>
                    <dd className="font-display text-lg font-bold">
                      <Money amount={f?.purse_remaining ?? 0} />
                    </dd>
                  </div>
                </dl>
                <span className="mt-3 text-center text-sm font-semibold text-accent group-hover:underline">Manage team →</span>
              </Link>
            );
          })}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Add team" className="max-w-2xl">
        <TeamForm
          tournamentId={t.id}
          otherTeams={teams}
          onCancel={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            void refetch();
            router.push(`/admin/teams/${id}`);
          }}
        />
      </Dialog>
    </div>
  );
}

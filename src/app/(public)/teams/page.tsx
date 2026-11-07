import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { TeamsGrid } from '@/components/team/teams-grid';
import { getServerClient } from '@/lib/supabase/server';
import { fetchTeamsWithIdentity } from '@/lib/queries/teams';
import { fetchAllFinance } from '@/lib/queries/roster';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Teams',
  description: 'Every team with its owner, icon players, squad size and remaining auction purse.',
  openGraph: { title: 'Teams' },
};

export default async function TeamsPage() {
  const supabase = await getServerClient();
  const [teams, finance] = await Promise.all([fetchTeamsWithIdentity(supabase), fetchAllFinance(supabase)]);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <PageHeader title="Teams" subtitle="Owners, icon players and squads. Tap a team for the full roster." />
      <TeamsGrid initial={{ teams, finance }} />
    </div>
  );
}

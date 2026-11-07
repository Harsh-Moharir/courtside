import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { fetchStandings } from '@/lib/queries/standings';
import { PointsTable } from '@/components/standings/points-table';
import { PageHeader } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Points Table',
  description: 'Official league standings: matches played, wins, losses, points difference and league points.',
  openGraph: { title: 'Points Table' },
};

export default async function PointsTablePage() {
  const supabase = await getServerClient();
  const data = await fetchStandings(supabase);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <PageHeader
        title="Points Table"
        subtitle="Official standings count completed league matches only. Live scores never change this table."
      />
      <PointsTable initial={data} />
    </div>
  );
}

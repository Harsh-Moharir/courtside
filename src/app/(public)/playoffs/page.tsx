import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { fetchChampion, fetchPlayoffs } from '@/lib/queries/playoffs';
import { PlayoffsView } from '@/components/bracket/playoffs-view';
import { PageHeader } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Playoffs',
  description: 'Playoff bracket, results and the tournament champion.',
  openGraph: { title: 'Playoffs' },
};

export default async function PlayoffsPage() {
  const supabase = await getServerClient();
  const [data, champion] = await Promise.all([fetchPlayoffs(supabase), fetchChampion(supabase)]);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <PageHeader title="Playoffs" subtitle="Single-match knockout rounds. Winners advance automatically as results come in." />
      <PlayoffsView initial={data} initialChampion={champion} />
    </div>
  );
}

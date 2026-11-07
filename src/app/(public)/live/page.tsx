import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { loadLiveOverview } from './load';
import { LiveOverview } from './live-overview';
import { PageHeader } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Live Scores',
  description: 'Live basketball scoreboards with game clock, shot clock, fouls and timeouts, updated in real time.',
};

export default async function LivePage() {
  const supabase = await getServerClient();
  const initial = await loadLiveOverview(supabase);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <PageHeader title="Live Scores" subtitle="Scores update automatically. No refresh needed." />
      <LiveOverview initial={initial} />
    </div>
  );
}

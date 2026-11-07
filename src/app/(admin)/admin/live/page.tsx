import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/card';
import { loadAdminLive } from './load';
import { AdminLiveList } from './admin-live-list';

export const metadata: Metadata = { title: 'Live scoring' };
export const dynamic = 'force-dynamic';

export default async function AdminLivePage() {
  const supabase = await getServerClient();
  const initial = await loadAdminLive(supabase);
  return (
    <div>
      <PageHeader title="Live scoring" subtitle="Start a match to open its scoring console. The public scoreboard goes live at the same moment." />
      <AdminLiveList initial={initial} />
    </div>
  );
}

import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAuctionHistory, fetchAuctionSnapshot } from '@/lib/queries/auction';
import { AdminAuction } from '@/components/auction/admin/admin-auction';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Auction console' };

export default async function AdminAuctionPage() {
  const supabase = await getServerClient();
  const [snapshot, history, { data: icons }] = await Promise.all([
    fetchAuctionSnapshot(supabase),
    fetchAuctionHistory(supabase),
    supabase.from('team_players').select('team_id').eq('source', 'icon'),
  ]);
  const iconCounts: Record<string, number> = {};
  for (const r of icons ?? []) iconCounts[r.team_id] = (iconCounts[r.team_id] ?? 0) + 1;
  return <AdminAuction initial={snapshot} initialHistory={history} initialIconCounts={iconCounts} />;
}

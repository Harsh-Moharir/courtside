import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAuctionHistory, fetchAuctionSnapshot, fetchPlayersByStatus } from '@/lib/queries/auction';
import { PublicAuction } from '@/components/auction/public-auction';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Auction',
  description: 'Live player auction, purchase history, unsold players and team spending.',
};

export default async function AuctionPage() {
  const supabase = await getServerClient();
  const [snapshot, history, unsold] = await Promise.all([
    fetchAuctionSnapshot(supabase),
    fetchAuctionHistory(supabase),
    fetchPlayersByStatus(supabase, 'unsold'),
  ]);
  return <PublicAuction initial={snapshot} initialHistory={history} initialUnsold={unsold} />;
}

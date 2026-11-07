import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAuctionSnapshot } from '@/lib/queries/auction';
import { DisplayScreen } from '@/components/auction/display-screen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Auction display', description: 'Full-screen live auction for projectors and TVs.' };

export default async function AuctionDisplayPage() {
  const supabase = await getServerClient();
  const snapshot = await fetchAuctionSnapshot(supabase, { events: 30 });
  return <DisplayScreen initial={snapshot} />;
}

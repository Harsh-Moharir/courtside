'use client';
import { useCallback } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { fetchAuctionHistory, fetchAuctionSnapshot, type AuctionSnapshot, type HistoryRow } from '@/lib/queries/auction';

/**
 * Live auction snapshot. Any change to state, lots, bids, events, transactions or team finances triggers a debounced
 * refetch of the whole snapshot, so voided bids (hidden from visitors by RLS) are reflected via the lot's bid_count.
 */
export function useAuctionSnapshot(initial?: AuctionSnapshot, opts: { pollMs?: number; events?: number; key?: string } = {}) {
  const fetcher = useCallback(() => fetchAuctionSnapshot(getBrowserClient(), { events: opts.events }), [opts.events]);
  return useRealtimeQuery<AuctionSnapshot>({
    key: opts.key ?? 'auction-snapshot',
    initialData: initial,
    fetcher,
    debounceMs: 120,
    pollMs: opts.pollMs ?? 3000,
    subscriptions: [
      { table: 'auction_state' },
      { table: 'auction_lots' },
      { table: 'auction_bids' },
      { table: 'auction_events' },
      { table: 'auction_transactions' },
      { table: 'teams' },
      { table: 'team_players' },
    ],
  });
}

export function useAuctionHistory(initial?: HistoryRow[]) {
  const fetcher = useCallback(() => fetchAuctionHistory(getBrowserClient()), []);
  return useRealtimeQuery<HistoryRow[]>({
    key: 'auction-history',
    initialData: initial,
    fetcher,
    debounceMs: 400,
    subscriptions: [{ table: 'auction_transactions' }, { table: 'auction_lots' }],
    onChange: (p) => p.table === 'auction_transactions' || p.new?.status !== 'live' || p.old?.status === 'live',
  });
}

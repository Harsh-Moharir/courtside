'use client';
import Link from 'next/link';
import { useCallback } from 'react';
import { Gavel, Pause, Play, RotateCcw, Trophy, XCircle, Flag, CircleDot } from 'lucide-react';
import { EmptyState, LiveDot } from '@/components/ui/misc';
import { RelativeTime } from '@/components/ui/time';
import { cn } from '@/components/ui/cn';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { FEED_TYPES, fetchAuctionFeed, type AuctionEvent } from '@/lib/queries/auction';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sold: Gavel,
  unsold: XCircle,
  sale_reversed: RotateCcw,
  round_started: Play,
  round_ended: Flag,
  auction_paused: Pause,
  auction_resumed: Play,
  auction_completed: Trophy,
};

interface FeedData {
  events: AuctionEvent[];
  live: boolean;
}

/** Latest auction updates for the homepage (11.3 item 8). Individual bids are not shown. */
export function AuctionFeed({ initialEvents, initialLive = false }: { initialEvents: AuctionEvent[]; initialLive?: boolean }) {
  const fetcher = useCallback(async (): Promise<FeedData> => {
    const supabase = getBrowserClient();
    const [events, { data: st }] = await Promise.all([fetchAuctionFeed(supabase), supabase.from('auction_state').select('status').maybeSingle()]);
    return { events, live: st?.status === 'live' };
  }, []);
  const { data } = useRealtimeQuery<FeedData>({
    key: 'auction-feed',
    initialData: { events: initialEvents, live: initialLive },
    fetcher,
    subscriptions: [{ table: 'auction_events' }, { table: 'auction_state' }],
    onChange: (p) => p.table === 'auction_state' || (FEED_TYPES as readonly string[]).includes(String(p.new?.event_type)),
  });
  const events = data?.events ?? [];
  return (
    <div>
      {data?.live && (
        <Link
          href="/auction"
          className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-btn bg-danger px-4 font-semibold text-white hover:brightness-110"
        >
          <LiveDot className="[&>span]:bg-white" /> Watch live
        </Link>
      )}
      {events.length === 0 ? (
        <EmptyState>No auction activity yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {events.map((e) => {
            const Icon = ICONS[e.event_type] ?? CircleDot;
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                <Icon
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0',
                    e.event_type === 'sold' ? 'text-success' : e.event_type === 'unsold' ? 'text-danger' : 'text-accent',
                  )}
                  aria-hidden
                />
                <p className="min-w-0 flex-1 text-sm">{e.message}</p>
                <RelativeTime iso={e.created_at} className="shrink-0 text-xs text-muted" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

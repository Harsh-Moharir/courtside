'use client';
import Link from 'next/link';
import { useCallback } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { fetchPlayersByStatus, type AuctionSnapshot, type HistoryRow, type UnsoldPlayer } from '@/lib/queries/auction';
import { AuctionStatusChip, LotStage } from './lot-stage';
import { HistoryTable } from './history-table';
import { SpendingChart } from './spending-chart';
import { PlayerList } from './player-list';
import { ExportButtons } from './export-buttons';
import { useAuctionHistory, useAuctionSnapshot } from './use-auction';

export function PublicAuction({
  initial,
  initialHistory,
  initialUnsold,
}: {
  initial: AuctionSnapshot;
  initialHistory: HistoryRow[];
  initialUnsold: UnsoldPlayer[];
}) {
  const snap = useAuctionSnapshot(initial, { pollMs: 5000, key: 'public-auction' });
  const history = useAuctionHistory(initialHistory);
  const unsoldFetcher = useCallback(() => fetchPlayersByStatus(getBrowserClient(), 'unsold'), []);
  const unsold = useRealtimeQuery<UnsoldPlayer[]>({
    key: 'auction-unsold',
    initialData: initialUnsold,
    fetcher: unsoldFetcher,
    subscriptions: [{ table: 'players' }],
    debounceMs: 500,
  });
  const s = snap.data ?? initial;
  const rows = history.data ?? [];
  const soldCount = rows.filter((r) => r.kind === 'sold' && r.status === 'Sold').length;
  const totalSpent = s.teams.reduce((a, t) => a + t.purse_spent, 0);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <PageHeader
        title="Player Auction"
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <AuctionStatusChip state={s.state} />
            <span>
              {soldCount} sold · {s.poolCount} in the pool
            </span>
            <ConnectionIndicator status={snap.status} />
          </span>
        }
        action={
          <Link
            href="/auction/display"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-border px-4 text-sm font-semibold hover:border-accent"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden /> Full-screen display
          </Link>
        }
      />
      {snap.error && !snap.data && <ErrorState message="Could not load the auction." onRetry={() => void snap.refetch()} />}

      {s.live && (
        <section aria-label="On the block" className="mb-8">
          <h2 className="mb-3 font-display text-2xl font-bold uppercase">On the block</h2>
          <LotStage view={s.live} teams={s.teams} state={s.state} />
        </section>
      )}

      <Tabs defaultValue="history">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <TabsList>
            <TabsTrigger value="history">Auction history</TabsTrigger>
            <TabsTrigger value="unsold">Unsold players ({unsold.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="spending">Team spending</TabsTrigger>
          </TabsList>
          <ExportButtons rows={rows} teams={s.teams} />
        </div>
        <TabsContent value="history">
          {history.loading && !history.data ? <Skeleton className="h-64" /> : <HistoryTable rows={rows} teams={s.teams} />}
        </TabsContent>
        <TabsContent value="unsold">
          <PlayerList players={unsold.data ?? []} empty="No unsold players." />
        </TabsContent>
        <TabsContent value="spending">
          <Card className="p-4 sm:p-6">
            <p className="mb-4 text-sm text-muted">
              Total spent across all teams: <Money amount={totalSpent} className="font-semibold text-fg" />
            </p>
            <SpendingChart teams={s.teams} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

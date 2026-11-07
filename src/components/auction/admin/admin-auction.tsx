'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { PageHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { ErrorState } from '@/components/ui/misc';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { AuctionSnapshot, HistoryRow } from '@/lib/queries/auction';
import { AuctionStatusChip } from '../lot-stage';
import { useAuctionHistory, useAuctionSnapshot } from '../use-auction';
import { AuctionConsole } from './console';
import { SettingsTab } from './settings-tab';
import { HistoryAdminTab, UnsoldPoolTab } from './corrections';

async function fetchIconCounts(): Promise<Record<string, number>> {
  const { data } = await getBrowserClient().from('team_players').select('team_id').eq('source', 'icon');
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.team_id] = (out[r.team_id] ?? 0) + 1;
  return out;
}

export function AdminAuction({
  initial,
  initialHistory,
  initialIconCounts,
}: {
  initial: AuctionSnapshot;
  initialHistory: HistoryRow[];
  initialIconCounts: Record<string, number>;
}) {
  const snap = useAuctionSnapshot(initial, { key: 'admin-auction' });
  const history = useAuctionHistory(initialHistory);
  const [iconCounts, setIconCounts] = useState(initialIconCounts);
  const s = snap.data ?? initial;
  const notStarted = s.state?.status === 'not_started';

  useEffect(() => {
    if (notStarted) void fetchIconCounts().then(setIconCounts);
  }, [notStarted, s.teams]);

  const refetchAll = useCallback(async () => {
    await Promise.all([snap.refetch(), history.refetch()]);
  }, [snap, history]);

  return (
    <div>
      <PageHeader
        title="Auction"
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <AuctionStatusChip state={s.state} />
            <ConnectionIndicator status={snap.status} />
          </span>
        }
        action={
          <Link
            href="/auction/display"
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-border px-4 text-sm font-semibold hover:border-accent"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden /> Open projector display
          </Link>
        }
      />
      {snap.error && <ErrorState message="Could not refresh the auction. Showing the last known state." onRetry={() => void snap.refetch()} />}
      <Tabs defaultValue="console">
        <TabsList>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">History and corrections</TabsTrigger>
          <TabsTrigger value="unsold">Unsold pool</TabsTrigger>
        </TabsList>
        <TabsContent value="console">
          <AuctionConsole snap={s} setData={snap.setData} refetch={refetchAll} iconCounts={iconCounts} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab snap={s} refetch={snap.refetch} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryAdminTab rows={history.data ?? []} teams={s.teams} refetch={() => void refetchAll()} />
        </TabsContent>
        <TabsContent value="unsold">
          <UnsoldPoolTab teams={s.teams} refetch={() => void refetchAll()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

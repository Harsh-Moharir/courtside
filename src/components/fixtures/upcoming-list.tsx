'use client';
import Link from 'next/link';
import { FixtureRow } from './fixture-row';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchLatestResults, fetchUpcomingFixtures, type FixtureView } from '@/lib/queries/fixtures';

/** The next `limit` upcoming fixtures that have a date (homepage section 11.3 #5). */
export function UpcomingList({ initial, limit = 5, showLink = true }: { initial?: FixtureView[]; limit?: number; showLink?: boolean }) {
  const { data, loading, error, refetch } = useRealtimeQuery<FixtureView[]>({
    key: `upcoming-${limit}`,
    initialData: initial,
    subscriptions: [{ table: 'fixtures' }],
    fetcher: () => fetchUpcomingFixtures(getBrowserClient(), limit),
  });
  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  if (error && !data) return <ErrorState message="Could not load upcoming matches." onRetry={() => void refetch()} />;
  const rows = data ?? [];
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <EmptyState>No matches scheduled yet</EmptyState>
      ) : (
        rows.map((f) => <FixtureRow key={f.id} fixture={f} showDate />)
      )}
      {showLink && (
        <Link href="/fixtures" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline">
          All fixtures →
        </Link>
      )}
    </div>
  );
}

/** The most recent completed fixtures with final scores (homepage section 11.3 #6). */
export function LatestResultsList({ initial, limit = 5 }: { initial?: FixtureView[]; limit?: number }) {
  const { data, loading, error, refetch } = useRealtimeQuery<FixtureView[]>({
    key: `results-${limit}`,
    initialData: initial,
    subscriptions: [{ table: 'match_results' }, { table: 'fixtures' }],
    fetcher: () => fetchLatestResults(getBrowserClient(), limit),
  });
  if (loading && !data) return <Skeleton className="h-48" />;
  if (error && !data) return <ErrorState message="Could not load results." onRetry={() => void refetch()} />;
  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState>No results yet</EmptyState>;
  return (
    <div className="space-y-3">
      {rows.map((f) => (
        <FixtureRow key={f.id} fixture={f} showDate />
      ))}
    </div>
  );
}

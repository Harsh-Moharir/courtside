'use client';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchLiveBundles } from '@/lib/queries/home';
import type { MatchBundle } from '@/lib/queries/matches';
import { LiveScoreboardCompact } from '@/components/scoreboard/live-scoreboard';
import { LiveDot } from '@/components/ui/misc';

/** One compact scoreboard per live match; hidden when nothing is live (11.3 item 4). */
export function LiveNow({ initial, excludeId }: { initial: MatchBundle[]; excludeId: string | null }) {
  const { data } = useRealtimeQuery<MatchBundle[]>({
    key: 'home-live',
    initialData: initial,
    subscriptions: [{ table: 'fixtures' }],
    fetcher: () => fetchLiveBundles(getBrowserClient(), excludeId),
    onChange: (p) => p.eventType !== 'UPDATE' || p.new?.status !== p.old?.status,
  });
  const live = data ?? [];
  if (live.length === 0) return null;
  return (
    <section aria-labelledby="live-heading">
      <h2 id="live-heading" className="mb-3 flex items-center gap-2 font-display text-2xl font-bold uppercase sm:text-3xl">
        <LiveDot /> Live now
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {live.map((b) => (
          <LiveScoreboardCompact key={b.fixture.id} fixtureId={b.fixture.id} initial={b} />
        ))}
      </div>
    </section>
  );
}

'use client';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchLatestResults, fixtureScore, type FixtureView } from '@/lib/queries/fixtures';
import { FixtureRow } from '@/components/fixtures/fixture-row';
import { ShareButton } from '@/components/scoreboard/share-button';
import { EmptyState } from '@/components/ui/misc';

/** The 5 most recent results, each with its final score, a link to the match page and a share button (11.3 item 6). */
export function LatestResults({ initial }: { initial: FixtureView[] }) {
  const { data } = useRealtimeQuery<FixtureView[]>({
    key: 'home-results',
    initialData: initial,
    subscriptions: [{ table: 'match_results' }, { table: 'fixtures' }],
    fetcher: () => fetchLatestResults(getBrowserClient(), 5),
  });
  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState>No results yet</EmptyState>;
  return (
    <ul className="space-y-3">
      {rows.map((f) => {
        const s = fixtureScore(f);
        const text = s ? `${f.home?.name ?? 'Home'} ${s.home} - ${s.away} ${f.away?.name ?? 'Away'} (Final)` : `Match ${f.match_number}`;
        return (
          <li key={f.id} className="relative">
            <FixtureRow fixture={f} showDate />
            <div className="mt-1 flex justify-end">
              <ShareButton text={text} path={`/matches/${f.id}`} title={text} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

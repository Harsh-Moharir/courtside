import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getServerClient } from '@/lib/supabase/server';
import { fetchChampion } from '@/lib/queries/playoffs';
import { fetchCounts, fetchLiveBundles, fetchSpotlight } from '@/lib/queries/home';
import { fetchLatestResults, fetchUpcomingFixtures } from '@/lib/queries/fixtures';
import { fetchStandings } from '@/lib/queries/standings';
import { fetchAuctionFeed } from '@/lib/queries/auction';
import { fetchAnnouncements } from '@/lib/queries/announcements';
import { ChampionBanner } from '@/components/bracket/champion-banner';
import { Hero } from '@/components/home/hero';
import { Spotlight } from '@/components/home/spotlight';
import { LiveNow } from '@/components/home/live-now';
import { LatestResults } from '@/components/home/latest-results';
import { UpcomingList } from '@/components/fixtures/upcoming-list';
import { StandingsWidget } from '@/components/standings/standings-widget';
import { AuctionFeed } from '@/components/auction/auction-feed';
import { AnnouncementsWidget } from '@/components/announcements/announcements-widget';

export const dynamic = 'force-dynamic';

function Section({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase sm:text-3xl">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-accent hover:underline">
            {linkLabel ?? 'See all'} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function HomePage() {
  const supabase = await getServerClient();
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };
  const [champion, counts, spotlight, upcoming, results, standings, feed, announcements, auctionState] = await Promise.all([
    safe(fetchChampion(supabase), null),
    safe(fetchCounts(supabase), { teams: 0, players: 0 }),
    safe(fetchSpotlight(supabase), null),
    safe(fetchUpcomingFixtures(supabase, 5), []),
    safe(fetchLatestResults(supabase, 5), []),
    safe(fetchStandings(supabase), null),
    safe(fetchAuctionFeed(supabase), []),
    safe(fetchAnnouncements(supabase, 5), []),
    supabase.from('auction_state').select('status').maybeSingle(),
  ]);
  const spotlightId = spotlight?.fixture.status === 'live' ? spotlight.fixture.id : null;
  const live = await safe(fetchLiveBundles(supabase, spotlightId), []);

  return (
    <div className="mx-auto max-w-[1440px] space-y-10 px-4 py-6 sm:py-8">
      <ChampionBanner initial={champion} />
      <Hero initialCounts={counts} />
      <Spotlight initial={spotlight} />
      <LiveNow initial={live} excludeId={spotlightId} />

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Upcoming matches" href="/fixtures" linkLabel="All fixtures">
          <UpcomingList initial={upcoming} limit={5} showLink={false} />
        </Section>
        <Section title="Latest results" href="/fixtures?status=completed" linkLabel="All results">
          <LatestResults initial={results} />
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <Section title="Points table" href="/points-table" linkLabel="Full table">
          {standings ? <StandingsWidget initial={standings} /> : <p className="text-muted">No standings yet.</p>}
        </Section>
        <Section title="Latest auction updates" href="/auction" linkLabel="Auction">
          <AuctionFeed initialEvents={feed} initialLive={auctionState.data?.status === 'live'} />
        </Section>
      </div>

      <Section title="Announcements" href="/announcements" linkLabel="All announcements">
        <AnnouncementsWidget initial={announcements} limit={5} />
      </Section>
    </div>
  );
}

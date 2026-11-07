import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  fetchFixturesWithTeams,
  fetchLatestResults,
  fetchMatchBundle,
  fetchNextUpcoming,
  type CompletedSummary,
  type FixtureWithTeams,
  type MatchBundle,
} from '@/lib/queries/matches';

export interface LiveOverviewData {
  live: MatchBundle[];
  next: FixtureWithTeams | null;
  latest: CompletedSummary[];
}

/** Works with both the server and the browser client. */
export async function loadLiveOverview(supabase: SupabaseClient<Database>): Promise<LiveOverviewData> {
  const liveFixtures = await fetchFixturesWithTeams(supabase, { statuses: ['live'] });
  const live = (await Promise.all(liveFixtures.map((f) => fetchMatchBundle(supabase, f.id, 1)))).filter((b): b is MatchBundle => !!b);
  // Earliest-started first.
  live.sort((a, b) => (a.state?.started_at ?? '').localeCompare(b.state?.started_at ?? ''));
  if (live.length > 0) return { live, next: null, latest: [] };
  const [next, latest] = await Promise.all([fetchNextUpcoming(supabase), fetchLatestResults(supabase, 3)]);
  return { live, next, latest };
}

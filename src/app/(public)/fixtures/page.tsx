import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/misc';
import { FixturesExplorer, type FixturesView } from '@/components/fixtures/fixtures-explorer';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAllFixtures, fetchFixtureTeams, type FixtureTeam, type FixtureView } from '@/lib/queries/fixtures';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Fixtures',
  description: 'Every league and playoff match: dates, approximate start times, venues, live scores and results.',
};

type SP = Promise<{ view?: string; team?: string; status?: string; stage?: string }>;

export default async function FixturesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view: FixturesView | null = sp.view === 'calendar' ? 'calendar' : sp.view === 'list' ? 'list' : null;
  const supabase = await getServerClient();
  let fixtures: FixtureView[] = [];
  let teams: FixtureTeam[] = [];
  let failed = false;
  try {
    [fixtures, teams] = await Promise.all([fetchAllFixtures(supabase), fetchFixtureTeams(supabase)]);
  } catch {
    failed = true;
  }
  const valid = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : '');
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <PageHeader title="Fixtures" subtitle="Start times are approximate: matches can slip if an earlier game runs long." />
      {failed ? (
        <ErrorState message="Fixtures could not be loaded. Refresh the page to try again." />
      ) : (
        <FixturesExplorer
          initialFixtures={fixtures}
          teams={teams}
          initialView={view}
          initialFilters={{
            team: valid(sp.team, teams.map((t) => t.id)),
            status: valid(sp.status, ['upcoming', 'live', 'completed', 'postponed']),
            stage: valid(sp.stage, ['league', 'playoff']),
          }}
        />
      )}
    </div>
  );
}

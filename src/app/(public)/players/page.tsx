import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { PlayersBrowser } from '@/components/player/players-browser';
import { getServerClient } from '@/lib/supabase/server';
import { fetchPlayersPage, fetchTeamOptions, parsePlayerFilters } from '@/lib/queries/players';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Players',
  description: 'Every registered player: positions, base prices, auction status and team.',
  openGraph: { title: 'Players' },
};

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parsePlayerFilters(await searchParams);
  const supabase = await getServerClient();
  const [page, teams] = await Promise.all([fetchPlayersPage(supabase, filters), fetchTeamOptions(supabase)]);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <PageHeader title="Players" subtitle="The central player registry: search, filter by position, status or team." />
      <PlayersBrowser initialFilters={filters} initial={page} teams={teams} />
    </div>
  );
}

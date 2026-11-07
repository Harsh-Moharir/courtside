import type { Metadata } from 'next';
import { FixturesAdmin } from '@/components/fixtures/admin/fixtures-admin';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAllFixtures, fetchFixtureTeams } from '@/lib/queries/fixtures';

export const metadata: Metadata = { title: 'Fixtures admin' };
export const dynamic = 'force-dynamic';

export default async function AdminFixturesPage() {
  const supabase = await getServerClient();
  const [fixtures, teams] = await Promise.all([fetchAllFixtures(supabase), fetchFixtureTeams(supabase)]);
  return <FixturesAdmin initialFixtures={fixtures} initialTeams={teams} />;
}

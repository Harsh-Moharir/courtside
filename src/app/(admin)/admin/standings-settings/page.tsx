import { getServerClient } from '@/lib/supabase/server';
import { fetchStandings } from '@/lib/queries/standings';
import { PageHeader } from '@/components/ui/card';
import { StandingsSettingsForm } from './standings-settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Standings settings' };

export default async function StandingsSettingsPage() {
  const supabase = await getServerClient();
  const data = await fetchStandings(supabase);
  return (
    <div>
      <PageHeader title="Standings" subtitle="Points system, tiebreakers and recovery tools. Every change recalculates the table from stored results." />
      <StandingsSettingsForm initial={data} />
    </div>
  );
}

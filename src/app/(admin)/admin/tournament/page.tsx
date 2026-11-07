import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/card';
import { TournamentForm } from '@/components/admin/tournament-form';
import { MatchRulesForm } from '@/components/admin/match-rules-form';

export const metadata: Metadata = { title: 'Tournament settings' };
export const dynamic = 'force-dynamic';

export default async function TournamentSettingsPage() {
  const supabase = await getServerClient();
  const { data: t } = await supabase.from('tournaments').select('*').eq('is_active', true).maybeSingle();
  if (!t) notFound();
  const { data: rules } = await supabase.from('match_rules').select('*').eq('tournament_id', t.id).maybeSingle();
  return (
    <div>
      <PageHeader title="Tournament" subtitle="Branding, time zone, currency and match rules" />
      <div className="grid gap-6 xl:grid-cols-2">
        <TournamentForm tournament={t} />
        {rules && <MatchRulesForm rules={rules} />}
      </div>
    </div>
  );
}

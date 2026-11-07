import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { fetchMatchBundle, isUuid } from '@/lib/queries/matches';
import { ScoringConsole } from './scoring-console';

export const metadata: Metadata = { title: 'Scoring console' };
export const dynamic = 'force-dynamic';

export default async function ConsolePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  if (!isUuid(fixtureId)) notFound();
  const supabase = await getServerClient();
  const [bundle, ps] = await Promise.all([
    fetchMatchBundle(supabase, fixtureId, 40, true),
    supabase.from('points_settings').select('allow_draws, forfeit_score').limit(1).maybeSingle(),
  ]);
  if (!bundle) notFound();
  return <ScoringConsole fixtureId={fixtureId} initial={bundle} allowDraws={ps.data?.allow_draws ?? false} />;
}

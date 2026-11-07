import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { fetchMatchBundle, isUuid, shareText } from '@/lib/queries/matches';
import { MatchView } from './match-view';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ fixtureId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { fixtureId } = await params;
  if (!isUuid(fixtureId)) return { title: 'Match not found' };
  const supabase = await getServerClient();
  const b = await fetchMatchBundle(supabase, fixtureId, 1).catch(() => null);
  if (!b) return { title: 'Match not found' };
  const f = b.fixture;
  const title = `${f.home?.name ?? 'TBD'} vs ${f.away?.name ?? 'TBD'}`;
  const score = b.result ?? b.state;
  const description = score
    ? shareText(f, score.home_score, score.away_score, f.status)
    : `Match ${f.match_number}${b.playoffLabel ? ` (${b.playoffLabel})` : ''}: ${title}`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `/matches/${f.id}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function MatchPage({ params }: Params) {
  const { fixtureId } = await params;
  if (!isUuid(fixtureId)) notFound();
  const supabase = await getServerClient();
  const bundle = await fetchMatchBundle(supabase, fixtureId, 8);
  if (!bundle) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <MatchView fixtureId={fixtureId} initial={bundle} />
    </div>
  );
}

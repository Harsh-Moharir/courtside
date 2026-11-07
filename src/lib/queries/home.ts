import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchMatchBundle, type MatchBundle } from '@/lib/queries/matches';

type Client = SupabaseClient<Database>;

/**
 * Match of the Day / next match (11.3): the featured fixture if it is upcoming or live; else the
 * earliest-started live fixture; else the upcoming fixture with the earliest date (7.5); else none.
 */
export async function fetchSpotlight(supabase: Client): Promise<MatchBundle | null> {
  const { data: t } = await supabase.from('tournaments').select('featured_fixture_id').eq('is_active', true).maybeSingle();
  let id: string | null = null;
  if (t?.featured_fixture_id) {
    const { data: f } = await supabase.from('fixtures').select('id, status').eq('id', t.featured_fixture_id).maybeSingle();
    if (f && (f.status === 'upcoming' || f.status === 'live')) id = f.id;
  }
  if (!id) {
    const { data: live } = await supabase
      .from('match_states')
      .select('fixture_id, started_at, fixtures!inner(status)')
      .eq('fixtures.status', 'live')
      .order('started_at', { ascending: true })
      .limit(1);
    id = live?.[0]?.fixture_id ?? null;
  }
  if (!id) {
    const { data: next } = await supabase
      .from('fixtures')
      .select('id')
      .eq('status', 'upcoming')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at', { ascending: true })
      .limit(1);
    id = next?.[0]?.id ?? null;
  }
  return id ? fetchMatchBundle(supabase, id, 1) : null;
}

export async function fetchLiveBundles(supabase: Client, excludeId?: string | null): Promise<MatchBundle[]> {
  const { data } = await supabase.from('fixtures').select('id').eq('status', 'live').order('match_number');
  const ids = (data ?? []).map((f) => f.id).filter((id) => id !== excludeId);
  const bundles = await Promise.all(ids.map((id) => fetchMatchBundle(supabase, id, 1)));
  return bundles.filter((b): b is MatchBundle => b !== null);
}

export async function fetchCounts(supabase: Client): Promise<{ teams: number; players: number }> {
  const [t, p] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }),
    supabase.from('players').select('id', { count: 'exact', head: true }),
  ]);
  return { teams: t.count ?? 0, players: p.count ?? 0 };
}

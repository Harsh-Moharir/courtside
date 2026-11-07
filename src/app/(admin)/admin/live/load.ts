import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { FIXTURE_TEAMS_SELECT, type FixtureWithTeams, type MatchResult } from '@/lib/queries/matches';

export interface AdminLiveData {
  open: FixtureWithTeams[];
  completed: (FixtureWithTeams & { result: MatchResult | null; hasState: boolean })[];
  allowDraws: boolean;
  forfeitScore: number;
}

export async function loadAdminLive(supabase: SupabaseClient<Database>): Promise<AdminLiveData> {
  const [openQ, doneQ, ps] = await Promise.all([
    supabase
      .from('fixtures')
      .select(FIXTURE_TEAMS_SELECT)
      .in('status', ['live', 'upcoming', 'postponed'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('match_number'),
    supabase.from('match_results').select('*').order('completed_at', { ascending: false }).limit(12),
    supabase.from('points_settings').select('allow_draws, forfeit_score').limit(1).maybeSingle(),
  ]);
  const open = (openQ.data as unknown as FixtureWithTeams[]) ?? [];
  // Live first, then upcoming by date, then postponed.
  const rank = { live: 0, upcoming: 1, postponed: 2, completed: 3 } as const;
  open.sort((a, b) => rank[a.status] - rank[b.status]);
  const results = doneQ.data ?? [];
  let completed: AdminLiveData['completed'] = [];
  if (results.length) {
    const ids = results.map((r) => r.fixture_id);
    const [fx, st] = await Promise.all([
      supabase.from('fixtures').select(FIXTURE_TEAMS_SELECT).in('id', ids),
      supabase.from('match_states').select('fixture_id').in('fixture_id', ids),
    ]);
    const byId = new Map(((fx.data as unknown as FixtureWithTeams[]) ?? []).map((f) => [f.id, f]));
    const withState = new Set((st.data ?? []).map((s) => s.fixture_id));
    completed = results.flatMap((r) => {
      const f = byId.get(r.fixture_id);
      return f ? [{ ...f, result: r, hasState: withState.has(f.id) }] : [];
    });
  }
  return { open, completed, allowDraws: ps.data?.allow_draws ?? false, forfeitScore: ps.data?.forfeit_score ?? 20 };
}

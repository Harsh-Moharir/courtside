import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';

type Client = SupabaseClient<Database>;

export type MatchState = Tables<'match_states'>;
export type MatchResult = Tables<'match_results'>;
export type ScoringEvent = Tables<'live_scoring_events'>;
export type MatchRules = Tables<'match_rules'>;

export interface MatchTeam {
  id: string;
  name: string;
  short_name: string;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
}

export interface FixtureWithTeams extends Tables<'fixtures'> {
  home: MatchTeam | null;
  away: MatchTeam | null;
}

export interface MatchBundle {
  fixture: FixtureWithTeams;
  state: MatchState | null;
  result: MatchResult | null;
  events: ScoringEvent[];
  rules: MatchRules | null;
  playoffLabel: string | null;
}

const TEAM_COLS = 'id, name, short_name, logo_path, primary_color, secondary_color';
export const FIXTURE_TEAMS_SELECT = `*, home:teams!fixtures_home_team_id_fkey(${TEAM_COLS}), away:teams!fixtures_away_team_id_fkey(${TEAM_COLS})`;

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function fetchFixture(supabase: Client, fixtureId: string): Promise<FixtureWithTeams | null> {
  const { data, error } = await supabase.from('fixtures').select(FIXTURE_TEAMS_SELECT).eq('id', fixtureId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FixtureWithTeams) ?? null;
}

/** Last N non-voided events (RLS hides voided ones from visitors; admins filter explicitly). */
export async function fetchEvents(supabase: Client, fixtureId: string, limit = 8, includeVoided = false): Promise<ScoringEvent[]> {
  let q = supabase.from('live_scoring_events').select('*').eq('fixture_id', fixtureId).order('seq', { ascending: false }).limit(limit);
  if (!includeVoided) q = q.eq('is_voided', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchRules(supabase: Client): Promise<MatchRules | null> {
  const { data } = await supabase.from('match_rules').select('*').limit(1).maybeSingle();
  return data ?? null;
}

export async function fetchMatchBundle(
  supabase: Client,
  fixtureId: string,
  eventLimit = 8,
  includeVoided = false,
): Promise<MatchBundle | null> {
  const fixture = await fetchFixture(supabase, fixtureId);
  if (!fixture) return null;
  const [st, rs, events, rules, node] = await Promise.all([
    supabase.from('match_states').select('*').eq('fixture_id', fixtureId).maybeSingle(),
    supabase.from('match_results').select('*').eq('fixture_id', fixtureId).maybeSingle(),
    fetchEvents(supabase, fixtureId, eventLimit, includeVoided),
    fetchRules(supabase),
    supabase.from('playoff_nodes').select('label').eq('fixture_id', fixtureId).maybeSingle(),
  ]);
  return {
    fixture,
    state: st.data ?? null,
    result: rs.data ?? null,
    events,
    rules,
    playoffLabel: node.data?.label ?? null,
  };
}

export async function fetchFixturesWithTeams(
  supabase: Client,
  opts: { statuses?: Database['public']['Enums']['fixture_status'][]; limit?: number; ascending?: boolean } = {},
): Promise<FixtureWithTeams[]> {
  let q = supabase.from('fixtures').select(FIXTURE_TEAMS_SELECT);
  if (opts.statuses) q = q.in('status', opts.statuses);
  q = q.order('scheduled_at', { ascending: opts.ascending ?? true, nullsFirst: false }).order('match_number');
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as unknown as FixtureWithTeams[]) ?? [];
}

export interface CompletedSummary extends FixtureWithTeams {
  result: MatchResult;
}

/** Most recent completed fixtures by completed_at. */
export async function fetchLatestResults(supabase: Client, limit = 3): Promise<CompletedSummary[]> {
  const { data: results, error } = await supabase
    .from('match_results')
    .select('*')
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!results?.length) return [];
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(FIXTURE_TEAMS_SELECT)
    .in(
      'id',
      results.map((r) => r.fixture_id),
    );
  const byId = new Map(((fixtures as unknown as FixtureWithTeams[]) ?? []).map((f) => [f.id, f]));
  return results.flatMap((r) => {
    const f = byId.get(r.fixture_id);
    return f && f.status === 'completed' ? [{ ...f, result: r }] : [];
  });
}

/** Next upcoming fixture: the earliest non-null scheduled_at, even if that time has passed (7.5). */
export async function fetchNextUpcoming(supabase: Client): Promise<FixtureWithTeams | null> {
  const { data } = await supabase
    .from('fixtures')
    .select(FIXTURE_TEAMS_SELECT)
    .eq('status', 'upcoming')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at')
    .order('match_number')
    .limit(1)
    .maybeSingle();
  return (data as unknown as FixtureWithTeams) ?? null;
}

export function shareText(f: FixtureWithTeams, home: number, away: number, status: string): string {
  const tag = status === 'completed' ? 'Final' : status === 'live' ? 'Live' : 'Upcoming';
  return `${f.home?.name ?? 'TBD'} ${home} - ${away} ${f.away?.name ?? 'TBD'} (${tag})`;
}

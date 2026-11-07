import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

export interface FixtureTeam {
  id: string;
  name: string;
  short_name: string;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
}

export interface FixtureView {
  id: string;
  match_number: number;
  stage: Enums['fixture_stage'];
  round_number: number | null;
  scheduled_at: string | null;
  venue: string | null;
  status: Enums['fixture_status'];
  postponed_reason: string | null;
  notes: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  updated_at: string;
  home: FixtureTeam | null;
  away: FixtureTeam | null;
  result: {
    home_score: number;
    away_score: number;
    winner_team_id: string | null;
    result_type: Enums['result_type'];
    completed_at: string;
  } | null;
  live: { home_score: number; away_score: number; period: number; is_break: boolean; version: number } | null;
  node: {
    code: string;
    label: string;
    home_kind: Enums['node_source_kind'];
    home_ref: string;
    away_kind: Enums['node_source_kind'];
    away_ref: string;
  } | null;
}

const TEAM_COLS = 'id, name, short_name, logo_path, primary_color, secondary_color';

export const FIXTURE_SELECT = `id, match_number, stage, round_number, scheduled_at, venue, status, postponed_reason, notes, home_team_id, away_team_id, updated_at,
  home:teams!fixtures_home_team_id_fkey(${TEAM_COLS}),
  away:teams!fixtures_away_team_id_fkey(${TEAM_COLS}),
  match_results(home_score, away_score, winner_team_id, result_type, completed_at),
  match_states(home_score, away_score, period, is_break, version),
  playoff_nodes(code, label, home_kind, home_ref, away_kind, away_ref)`;

type Raw = Omit<FixtureView, 'result' | 'live' | 'node'> & {
  match_results: FixtureView['result'] | FixtureView['result'][] | null;
  match_states: FixtureView['live'] | FixtureView['live'][] | null;
  playoff_nodes: FixtureView['node'] | FixtureView['node'][] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function toFixtureView(raw: Raw): FixtureView {
  const { match_results, match_states, playoff_nodes, ...rest } = raw;
  return {
    ...rest,
    home: one(rest.home),
    away: one(rest.away),
    result: one(match_results),
    live: one(match_states),
    node: one(playoff_nodes),
  };
}

function mapRows(data: unknown): FixtureView[] {
  return ((data ?? []) as Raw[]).map(toFixtureView);
}

/** Every fixture (league and playoff), ordered by match number. At most ~100 rows by design. */
export async function fetchAllFixtures(supabase: Client): Promise<FixtureView[]> {
  const { data, error } = await supabase.from('fixtures').select(FIXTURE_SELECT).order('match_number').limit(500);
  if (error) throw new Error(error.message);
  return mapRows(data);
}

/** The next `limit` upcoming fixtures that have a date. */
export async function fetchUpcomingFixtures(supabase: Client, limit = 5): Promise<FixtureView[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(FIXTURE_SELECT)
    .eq('status', 'upcoming')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at')
    .order('match_number')
    .limit(limit);
  if (error) throw new Error(error.message);
  return mapRows(data);
}

/** The `limit` most recently completed fixtures (by match_results.completed_at desc), with scores. */
export async function fetchLatestResults(supabase: Client, limit = 5): Promise<FixtureView[]> {
  const { data: res, error } = await supabase
    .from('match_results')
    .select('fixture_id, completed_at')
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const ids = (res ?? []).map((r) => r.fixture_id);
  if (ids.length === 0) return [];
  const { data, error: e2 } = await supabase.from('fixtures').select(FIXTURE_SELECT).in('id', ids).eq('status', 'completed');
  if (e2) throw new Error(e2.message);
  const rows = mapRows(data);
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * Next upcoming match (7.5): the `upcoming` fixture with the earliest non-null scheduled_at,
 * regardless of whether that time has already passed (a delayed match is still next).
 */
export async function fetchNextFixture(supabase: Client): Promise<FixtureView | null> {
  const rows = await fetchUpcomingFixtures(supabase, 1);
  return rows[0] ?? null;
}

export async function fetchFixture(supabase: Client, id: string): Promise<FixtureView | null> {
  const { data, error } = await supabase.from('fixtures').select(FIXTURE_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toFixtureView(data as unknown as Raw) : null;
}

export async function fetchFixtureTeams(supabase: Client): Promise<FixtureTeam[]> {
  const { data, error } = await supabase.from('teams').select(TEAM_COLS).order('sort_order').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as FixtureTeam[];
}

/** Score to show for a fixture: the official result when completed, the live state when live. */
export function fixtureScore(f: FixtureView): { home: number; away: number } | null {
  if (f.status === 'completed' && f.result) return { home: f.result.home_score, away: f.result.away_score };
  if (f.status === 'live' && f.live) return { home: f.live.home_score, away: f.live.away_score };
  return null;
}

/** Text for an empty playoff slot: `Winner of SF1`, `Seed 3 (decided after the league)`. */
export function slotText(f: FixtureView, side: 'home' | 'away'): string {
  const n = f.node;
  if (!n) return 'TBD';
  const kind = side === 'home' ? n.home_kind : n.away_kind;
  const ref = side === 'home' ? n.home_ref : n.away_ref;
  if (kind === 'seed') return `Seed ${ref}`;
  return kind === 'winner_of' ? `Winner of ${ref}` : `Loser of ${ref}`;
}

/** Teams resting in each league round (odd team counts). */
export function byesForRounds(fixtures: FixtureView[], teams: FixtureTeam[]): Map<number, FixtureTeam[]> {
  const playing = new Map<number, Set<string>>();
  for (const f of fixtures) {
    if (f.stage !== 'league' || f.round_number === null) continue;
    const s = playing.get(f.round_number) ?? new Set<string>();
    if (f.home_team_id) s.add(f.home_team_id);
    if (f.away_team_id) s.add(f.away_team_id);
    playing.set(f.round_number, s);
  }
  const out = new Map<number, FixtureTeam[]>();
  if (teams.length % 2 === 0) return out;
  for (const [r, s] of playing) {
    const rest = teams.filter((t) => !s.has(t.id));
    if (rest.length > 0 && rest.length < teams.length) out.set(r, rest);
  }
  return out;
}

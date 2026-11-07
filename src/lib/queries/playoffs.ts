import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';
import { TEAM_LITE_SELECT, type TeamLite } from './standings';
import { fetchTeamWithIdentity, type TeamWithIdentity } from './teams';

type Client = SupabaseClient<Database>;

export interface PlayoffNodeView extends Tables<'playoff_nodes'> {
  fixture: Tables<'fixtures'> | null;
  result: Tables<'match_results'> | null;
  live: { home_score: number; away_score: number; period: number; is_break: boolean } | null;
}

export interface PlayoffsData {
  bracket: Tables<'playoff_brackets'> | null;
  settings: Tables<'playoff_settings'> | null;
  nodes: PlayoffNodeView[];
  teams: Record<string, TeamLite>;
  standings: { team_id: string; rank: number; league_points: number; played: number; remaining: number }[];
  leagueComplete: boolean;
  leagueFixtures: number;
  playoffsStarted: boolean;
  quarters: number;
}

export async function fetchPlayoffs(supabase: Client): Promise<PlayoffsData> {
  const [br, ps, nodes, fx, teams, st, league, rules] = await Promise.all([
    supabase.from('playoff_brackets').select('*').limit(1).maybeSingle(),
    supabase.from('playoff_settings').select('*').limit(1).maybeSingle(),
    supabase.from('playoff_nodes').select('*').order('round_order').order('position').limit(20),
    supabase.from('fixtures').select('*').eq('stage', 'playoff').limit(20),
    supabase.from('teams').select(TEAM_LITE_SELECT).limit(20),
    supabase.from('standings').select('team_id, rank, league_points, played, remaining').order('rank').limit(20),
    supabase.from('fixtures').select('status').eq('stage', 'league').limit(200),
    supabase.from('match_rules').select('quarters').limit(1).maybeSingle(),
  ]);
  if (nodes.error) throw new Error(nodes.error.message);
  const fixtureIds = (fx.data ?? []).map((f) => f.id);
  const [results, states] = fixtureIds.length
    ? await Promise.all([
        supabase.from('match_results').select('*').in('fixture_id', fixtureIds),
        supabase.from('match_states').select('fixture_id, home_score, away_score, period, is_break').in('fixture_id', fixtureIds),
      ])
    : [{ data: [] as Tables<'match_results'>[] }, { data: [] as { fixture_id: string; home_score: number; away_score: number; period: number; is_break: boolean }[] }];
  const fxById = new Map((fx.data ?? []).map((f) => [f.id, f]));
  const resById = new Map((results.data ?? []).map((r) => [r.fixture_id, r]));
  const stById = new Map((states.data ?? []).map((s) => [s.fixture_id, s]));
  const bracketId = br.data?.id;
  const nodeViews: PlayoffNodeView[] = (nodes.data ?? [])
    .filter((n) => n.bracket_id === bracketId)
    .map((n) => {
      const f = n.fixture_id ? (fxById.get(n.fixture_id) ?? null) : null;
      return {
        ...n,
        fixture: f,
        result: f && f.status === 'completed' ? (resById.get(f.id) ?? null) : null,
        live: f && f.status === 'live' ? (stById.get(f.id) ?? null) : null,
      };
    });
  const leagueStatuses = (league.data ?? []).map((f) => f.status);
  const leagueComplete = leagueStatuses.length > 0 && leagueStatuses.every((s) => s === 'completed');
  return {
    bracket: br.data ?? null,
    settings: ps.data ?? null,
    nodes: nodeViews,
    teams: Object.fromEntries((teams.data ?? []).map((t) => [t.id, t as TeamLite])),
    standings: st.data ?? [],
    leagueComplete,
    leagueFixtures: leagueStatuses.length,
    playoffsStarted: nodeViews.some((n) => n.fixture && (n.fixture.status === 'live' || n.fixture.status === 'completed')),
    quarters: rules.data?.quarters ?? 4,
  };
}

export interface ChampionData {
  champion: TeamWithIdentity;
  runnerUp: TeamLite | null;
  third: TeamLite | null;
}

/** Champion with owner and icon players, plus runner-up (loser of the final) and third place (winner of 3P). */
export async function fetchChampion(supabase: Client): Promise<ChampionData | null> {
  const { data: t } = await supabase.from('tournaments').select('champion_team_id').eq('is_active', true).maybeSingle();
  const championId = t?.champion_team_id;
  if (!championId) return null;
  const champion = await fetchTeamWithIdentity(supabase, championId);
  if (!champion) return null;
  const { data: nodes } = await supabase.from('playoff_nodes').select('code, is_final, is_third_place, fixture_id');
  const finalNode = (nodes ?? []).find((n) => n.is_final);
  const thirdNode = (nodes ?? []).find((n) => n.is_third_place);
  const ids = [finalNode?.fixture_id, thirdNode?.fixture_id].filter((x): x is string => !!x);
  let runnerUpId: string | null = null;
  let thirdId: string | null = null;
  if (ids.length) {
    const [{ data: fxs }, { data: res }] = await Promise.all([
      supabase.from('fixtures').select('id, home_team_id, away_team_id, status').in('id', ids),
      supabase.from('match_results').select('fixture_id, winner_team_id').in('fixture_id', ids),
    ]);
    const f = fxs?.find((x) => x.id === finalNode?.fixture_id);
    if (f) runnerUpId = f.home_team_id === championId ? f.away_team_id : f.home_team_id;
    const tf = fxs?.find((x) => x.id === thirdNode?.fixture_id);
    if (tf && tf.status === 'completed') thirdId = res?.find((r) => r.fixture_id === tf.id)?.winner_team_id ?? null;
  }
  const others = [runnerUpId, thirdId].filter((x): x is string => !!x);
  const { data: lites } = others.length ? await supabase.from('teams').select(TEAM_LITE_SELECT).in('id', others) : { data: [] };
  const find = (id: string | null) => (id ? ((lites ?? []).find((x) => x.id === id) as TeamLite | undefined) ?? null : null);
  return { champion, runnerUp: find(runnerUpId), third: find(thirdId) };
}

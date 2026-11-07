import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';

type Client = SupabaseClient<Database>;

export interface TeamLite {
  id: string;
  name: string;
  short_name: string;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
  manual_tiebreak_rank: number | null;
}

export type StandingRowView = Tables<'standings'> & { team: TeamLite };

export interface StandingsData {
  rows: StandingRowView[];
  settings: Tables<'points_settings'> | null;
  qualifying: number;
  liveTeamIds: string[];
  completedLeague: number;
  updatedAt: string | null;
}

export const TEAM_LITE_SELECT = 'id, name, short_name, logo_path, primary_color, secondary_color, manual_tiebreak_rank';

/** Official standings with team info, points settings, qualifying count and teams currently in a live match. */
export async function fetchStandings(supabase: Client): Promise<StandingsData> {
  const [st, teams, ps, pls, live, done] = await Promise.all([
    supabase.from('standings').select('*').order('rank').limit(20),
    supabase.from('teams').select(TEAM_LITE_SELECT).limit(20),
    supabase.from('points_settings').select('*').limit(1).maybeSingle(),
    supabase.from('playoff_settings').select('qualifying_teams').limit(1).maybeSingle(),
    supabase.from('fixtures').select('home_team_id, away_team_id').eq('status', 'live').limit(20),
    supabase.from('fixtures').select('id', { count: 'exact', head: true }).eq('stage', 'league').eq('status', 'completed'),
  ]);
  if (st.error) throw new Error(st.error.message);
  if (teams.error) throw new Error(teams.error.message);
  const byId = new Map((teams.data ?? []).map((t) => [t.id, t as TeamLite]));
  const rows = (st.data ?? [])
    .filter((r) => byId.has(r.team_id))
    .map((r) => ({ ...r, team: byId.get(r.team_id) as TeamLite }));
  const liveTeamIds = (live.data ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]).filter((x): x is string => !!x);
  const updatedAt = rows.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null);
  return {
    rows,
    settings: ps.data ?? null,
    qualifying: pls.data?.qualifying_teams ?? 4,
    liveTeamIds,
    completedLeague: done.count ?? 0,
    updatedAt,
  };
}

export const TIEBREAKER_LABELS: Record<Database['public']['Enums']['tiebreaker'], string> = {
  head_to_head: 'Head-to-head',
  point_difference: 'Point difference',
  points_for: 'Points scored',
  points_against_lowest: 'Fewest points against',
  wins: 'Wins',
};

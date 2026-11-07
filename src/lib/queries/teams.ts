import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';

type Client = SupabaseClient<Database>;

export type TeamRow = Tables<'teams'>;
export interface IconPlayer {
  id: string;
  full_name: string;
  photo_path: string | null;
  primary_position: Database['public']['Enums']['player_position'];
  secondary_position: Database['public']['Enums']['player_position'] | null;
  jersey_number: number | null;
}
export interface TeamWithIdentity extends TeamRow {
  owner: { full_name: string; photo_path: string | null } | null;
  icon1: IconPlayer | null;
  icon2: IconPlayer | null;
}

export const TEAM_IDENTITY_SELECT =
  '*, team_owners(full_name, photo_path), team_players(source, icon_slot, players(id, full_name, photo_path, primary_position, secondary_position, jersey_number))';

type RawTeam = TeamRow & {
  team_owners: { full_name: string; photo_path: string | null } | { full_name: string; photo_path: string | null }[] | null;
  team_players: { source: string; icon_slot: number | null; players: IconPlayer | null }[] | null;
};

export function toTeamWithIdentity(raw: RawTeam): TeamWithIdentity {
  const { team_owners, team_players, ...team } = raw;
  const owner = Array.isArray(team_owners) ? (team_owners[0] ?? null) : team_owners;
  const icon = (slot: number) => team_players?.find((tp) => tp.source === 'icon' && tp.icon_slot === slot)?.players ?? null;
  return { ...team, owner, icon1: icon(1), icon2: icon(2) };
}

/** All teams with owner and icon players, ordered for display. Works with the server or the browser client. */
export async function fetchTeamsWithIdentity(supabase: Client): Promise<TeamWithIdentity[]> {
  const { data, error } = await supabase.from('teams').select(TEAM_IDENTITY_SELECT).order('sort_order').order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawTeam[]).map(toTeamWithIdentity);
}

export async function fetchTeamWithIdentity(supabase: Client, teamId: string): Promise<TeamWithIdentity | null> {
  const { data, error } = await supabase.from('teams').select(TEAM_IDENTITY_SELECT).eq('id', teamId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toTeamWithIdentity(data as unknown as RawTeam) : null;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

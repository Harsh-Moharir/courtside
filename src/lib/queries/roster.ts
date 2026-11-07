import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';
import { POSITIONS, type Position } from '@/lib/format';

type Client = SupabaseClient<Database>;
type PositionEnum = Database['public']['Enums']['player_position'];

export interface RosterPlayer {
  id: string;
  full_name: string;
  photo_path: string | null;
  primary_position: PositionEnum;
  secondary_position: PositionEnum | null;
  jersey_number: number | null;
}

export interface RosterEntry {
  id: string;
  source: Database['public']['Enums']['roster_source'];
  icon_slot: number | null;
  price: number;
  purchase_order: number | null;
  acquired_at: string;
  player: RosterPlayer;
}

export type TeamFinance = Tables<'v_team_finance'>;

const ROSTER_SELECT =
  'id, source, icon_slot, price, purchase_order, acquired_at, players(id, full_name, photo_path, primary_position, secondary_position, jersey_number)';

type RawEntry = Omit<RosterEntry, 'player'> & { players: RosterPlayer | RosterPlayer[] | null };

export async function fetchRoster(supabase: Client, teamId: string): Promise<RosterEntry[]> {
  const { data, error } = await supabase.from('team_players').select(ROSTER_SELECT).eq('team_id', teamId).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawEntry[])
    .map(({ players, ...rest }) => ({ ...rest, player: (Array.isArray(players) ? players[0] : players) as RosterPlayer }))
    .filter((e) => !!e.player);
}

export async function fetchTeamFinance(supabase: Client, teamId: string): Promise<TeamFinance | null> {
  const { data, error } = await supabase.from('v_team_finance').select('*').eq('team_id', teamId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAllFinance(supabase: Client): Promise<Record<string, TeamFinance>> {
  const { data, error } = await supabase.from('v_team_finance').select('*').limit(20);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((f) => [f.team_id, f]));
}

/** Sort inside a position group: icons first (by slot), then price descending, then name. */
export function compareRosterEntries(a: RosterEntry, b: RosterEntry): number {
  const ai = a.source === 'icon' ? 0 : 1;
  const bi = b.source === 'icon' ? 0 : 1;
  if (ai !== bi) return ai - bi;
  if (ai === 0) return (a.icon_slot ?? 0) - (b.icon_slot ?? 0);
  if (a.price !== b.price) return b.price - a.price;
  return a.player.full_name.localeCompare(b.player.full_name);
}

/** Groups by primary position in PG, SG, SF, PF, C order; empty groups are omitted. */
export function groupRoster(entries: RosterEntry[]): { position: Position; entries: RosterEntry[] }[] {
  return POSITIONS.map((position) => ({
    position,
    entries: entries.filter((e) => e.player.primary_position === position).sort(compareRosterEntries),
  })).filter((g) => g.entries.length > 0);
}

/** Player ids that share a jersey number with another roster player (admin-only warning, 6.6). */
export function jerseyConflicts(entries: RosterEntry[]): Set<string> {
  const byNumber = new Map<number, string[]>();
  for (const e of entries) {
    if (e.player.jersey_number === null) continue;
    byNumber.set(e.player.jersey_number, [...(byNumber.get(e.player.jersey_number) ?? []), e.player.id]);
  }
  const out = new Set<string>();
  for (const ids of byNumber.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

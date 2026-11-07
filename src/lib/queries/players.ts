import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { POSITIONS, type Position } from '@/lib/format';

type Client = SupabaseClient<Database>;
type PlayerStatus = Database['public']['Enums']['player_status'];

export const PLAYERS_PAGE_SIZE = 24;
export const PLAYER_STATUSES: PlayerStatus[] = ['available', 'sold', 'unsold', 'icon'];
export const PLAYER_SORTS = {
  name: 'Name (A to Z)',
  price_desc: 'Base price (high to low)',
  price_asc: 'Base price (low to high)',
  position: 'Position',
} as const;
export type PlayerSort = keyof typeof PLAYER_SORTS;

export interface PlayerFilters {
  q: string;
  pos: Position | null;
  sec: boolean;
  status: PlayerStatus | null;
  team: string | null;
  sort: PlayerSort;
  page: number;
}

export interface PlayerTeamRef {
  id: string;
  name: string;
  short_name: string;
  logo_path: string | null;
  primary_color: string;
}

export interface PlayerListItem {
  id: string;
  full_name: string;
  photo_path: string | null;
  primary_position: Position;
  secondary_position: Position | null;
  jersey_number: number | null;
  base_price: number;
  status: PlayerStatus;
  roster: { price: number; source: Database['public']['Enums']['roster_source']; team: PlayerTeamRef | null } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: Params, k: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

export function parsePlayerFilters(sp: Params): PlayerFilters {
  const pos = get(sp, 'pos');
  const status = get(sp, 'status');
  const team = get(sp, 'team');
  const sort = get(sp, 'sort');
  const page = Number.parseInt(get(sp, 'page') ?? '1', 10);
  return {
    q: (get(sp, 'q') ?? '').slice(0, 80),
    pos: pos && (POSITIONS as string[]).includes(pos) ? (pos as Position) : null,
    sec: get(sp, 'sec') === '1',
    status: status && (PLAYER_STATUSES as string[]).includes(status) ? (status as PlayerStatus) : null,
    team: team && UUID.test(team) ? team : null,
    sort: sort && sort in PLAYER_SORTS ? (sort as PlayerSort) : 'name',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

export function filtersToSearch(f: PlayerFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.pos) p.set('pos', f.pos);
  if (f.pos && f.sec) p.set('sec', '1');
  if (f.status) p.set('status', f.status);
  if (f.team) p.set('team', f.team);
  if (f.sort !== 'name') p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type RawRoster = { price: number; source: Database['public']['Enums']['roster_source']; teams: PlayerTeamRef | PlayerTeamRef[] | null };
type Raw = Omit<PlayerListItem, 'roster'> & { team_players: RawRoster | RawRoster[] | null };

/** One page of players, filtered and sorted server-side (6.4). Never loads the full list. */
export async function fetchPlayersPage(supabase: Client, f: PlayerFilters): Promise<{ rows: PlayerListItem[]; total: number }> {
  const rel = f.team ? 'team_players!inner' : 'team_players';
  let q = supabase
    .from('players')
    .select(
      `id, full_name, photo_path, primary_position, secondary_position, jersey_number, base_price, status, ${rel}(price, source, team_id, teams(id, name, short_name, logo_path, primary_color))`,
      { count: 'exact' },
    );
  if (f.q.trim()) q = q.ilike('full_name', `%${escapeLike(f.q.trim())}%`);
  if (f.pos) q = f.sec ? q.or(`primary_position.eq.${f.pos},secondary_position.eq.${f.pos}`) : q.eq('primary_position', f.pos);
  if (f.status) q = q.eq('status', f.status);
  if (f.team) q = q.eq('team_players.team_id', f.team);
  switch (f.sort) {
    case 'price_desc':
      q = q.order('base_price', { ascending: false }).order('full_name');
      break;
    case 'price_asc':
      q = q.order('base_price', { ascending: true }).order('full_name');
      break;
    case 'position':
      q = q.order('primary_position').order('full_name');
      break;
    default:
      q = q.order('full_name').order('id');
  }
  const from = (f.page - 1) * PLAYERS_PAGE_SIZE;
  const { data, error, count } = await q.range(from, from + PLAYERS_PAGE_SIZE - 1);
  if (error) {
    // Requesting a page past the end returns a range error: treat it as empty.
    if (error.code === 'PGRST103') return { rows: [], total: count ?? 0 };
    throw new Error(error.message);
  }
  const rows = ((data ?? []) as unknown as Raw[]).map(({ team_players, ...p }) => {
    const tp = Array.isArray(team_players) ? team_players[0] : team_players;
    const team = tp ? (Array.isArray(tp.teams) ? (tp.teams[0] ?? null) : tp.teams) : null;
    return { ...p, roster: tp ? { price: tp.price, source: tp.source, team } : null } as PlayerListItem;
  });
  return { rows, total: count ?? 0 };
}

export async function fetchTeamOptions(supabase: Client): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from('teams').select('id, name').order('sort_order').order('name');
  return data ?? [];
}

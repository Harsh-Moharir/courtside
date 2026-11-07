import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/types/database';

type Client = SupabaseClient<Database>;

// Functions that take a row type show up as computed fields in the generated types; strip them.
export type AuctionState = Omit<Tables<'auction_state'>, '_require_live'>;
export type AuctionLot = Tables<'auction_lots'>;
export type AuctionBid = Tables<'auction_bids'>;
export type AuctionEvent = Tables<'auction_events'>;
export type AuctionTxn = Tables<'auction_transactions'>;
export type AuctionSettings = Tables<'auction_settings'>;
export type Tier = { from_amount: number; step: number };
export type TeamFinance = Database['public']['Views']['v_team_finance']['Row'];
export type Position = Database['public']['Enums']['player_position'];

export interface AuctionTeam {
  id: string;
  name: string;
  short_name: string;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
  sort_order: number;
  purse_total: number;
  purse_spent: number;
  purse_remaining: number;
  squad_count: number;
  max_bid: number;
  slots_left: number;
  min_squad_size: number;
  max_squad_size: number;
}

export interface LotView {
  lot: AuctionLot;
  bids: AuctionBid[];
  player: { jersey_number: number | null; description: string | null; age: number | null; height_cm: number | null } | null;
}

export interface AuctionSnapshot {
  state: AuctionState | null;
  live: LotView | null;
  teams: AuctionTeam[];
  settings: AuctionSettings | null;
  tiers: Tier[];
  events: AuctionEvent[];
  poolCount: number;
}

export const FEED_TYPES = [
  'sold',
  'unsold',
  'sale_reversed',
  'round_started',
  'round_ended',
  'auction_paused',
  'auction_resumed',
  'auction_completed',
] as const;

/** Teams with finance figures (max bid comes from the server view, never computed in the browser). */
export async function fetchAuctionTeams(supabase: Client): Promise<AuctionTeam[]> {
  const [{ data: teams, error: e1 }, { data: fin, error: e2 }] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, short_name, logo_path, primary_color, secondary_color, sort_order, purse_total, purse_spent, purse_remaining')
      .order('sort_order')
      .order('name'),
    supabase.from('v_team_finance').select('*'),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const byId = new Map((fin ?? []).map((f) => [f.team_id, f]));
  return (teams ?? []).map((t) => {
    const f = byId.get(t.id);
    return {
      ...t,
      purse_remaining: t.purse_remaining ?? t.purse_total - t.purse_spent,
      squad_count: f?.squad_count ?? 0,
      max_bid: f?.max_bid ?? 0,
      slots_left: f?.slots_left ?? 0,
      min_squad_size: f?.min_squad_size ?? 0,
      max_squad_size: f?.max_squad_size ?? 0,
    };
  });
}

export async function fetchLotView(supabase: Client, lotId: string): Promise<LotView | null> {
  const [{ data: lot }, { data: bids }] = await Promise.all([
    supabase.from('auction_lots').select('*').eq('id', lotId).maybeSingle(),
    supabase.from('auction_bids').select('*').eq('lot_id', lotId).order('sequence', { ascending: false }).limit(50),
  ]);
  if (!lot) return null;
  let player: LotView['player'] = null;
  if (lot.player_id) {
    const { data } = await supabase.from('players').select('jersey_number, description, age, height_cm').eq('id', lot.player_id).maybeSingle();
    player = data ?? null;
  }
  return { lot, bids: bids ?? [], player };
}

/** Everything a live auction screen needs, rebuilt entirely from the database (5.9 item 3). */
export async function fetchAuctionSnapshot(supabase: Client, opts: { events?: number } = {}): Promise<AuctionSnapshot> {
  const [{ data: state }, teams, { data: settings }, { data: tiers }, { data: events }, { count }] = await Promise.all([
    supabase.from('auction_state').select('*').maybeSingle(),
    fetchAuctionTeams(supabase),
    supabase.from('auction_settings').select('*').maybeSingle(),
    supabase.from('auction_increment_tiers').select('from_amount, step').order('from_amount'),
    supabase
      .from('auction_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(opts.events ?? 20),
    supabase.from('players').select('id', { count: 'exact', head: true }).eq('status', 'available'),
  ]);
  const live = state?.current_lot_id ? await fetchLotView(supabase, state.current_lot_id) : null;
  return {
    state: state ?? null,
    live: live && live.lot.status === 'live' ? live : null,
    teams,
    settings: settings ?? null,
    tiers: tiers ?? [],
    events: events ?? [],
    poolCount: count ?? 0,
  };
}

export interface HistoryRow {
  kind: 'sold' | 'unsold';
  id: string;
  purchase_order: number | null;
  player_id: string | null;
  player_name: string;
  player_photo_path: string | null;
  primary_position: Position | null;
  secondary_position: Position | null;
  team_id: string | null;
  price: number | null;
  base_price: number | null;
  round: number | null;
  lot_number: number | null;
  status: 'Sold' | 'Unsold' | 'Reversed';
  txn_kind: 'auction' | 'manual' | null;
  reversal_reason: string | null;
  at: string;
}

/** Sold transactions (visitors only see active ones through RLS) plus unsold lots. */
export async function fetchAuctionHistory(supabase: Client): Promise<HistoryRow[]> {
  const [{ data: txns, error: e1 }, { data: lots, error: e2 }] = await Promise.all([
    supabase.from('auction_transactions').select('*').order('purchase_order', { ascending: false }).limit(1000),
    supabase
      .from('auction_lots')
      .select('id, lot_number, round_number, base_price, status, player_id, player_name, player_photo_path, primary_position, secondary_position, closed_at, opened_at')
      .in('status', ['sold', 'unsold'])
      .order('lot_number', { ascending: false })
      .limit(1000),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const lotById = new Map((lots ?? []).map((l) => [l.id, l]));
  const rows: HistoryRow[] = (txns ?? []).map((t) => {
    const l = t.lot_id ? lotById.get(t.lot_id) : undefined;
    return {
      kind: 'sold',
      id: t.id,
      purchase_order: t.purchase_order,
      player_id: t.player_id,
      player_name: t.player_name,
      player_photo_path: t.player_photo_path,
      primary_position: t.primary_position,
      secondary_position: t.secondary_position,
      team_id: t.team_id,
      price: t.price,
      base_price: l?.base_price ?? null,
      round: l?.round_number ?? null,
      lot_number: l?.lot_number ?? null,
      status: t.status === 'reversed' ? 'Reversed' : 'Sold',
      txn_kind: t.kind === 'manual' ? 'manual' : 'auction',
      reversal_reason: t.reversal_reason,
      at: t.created_at,
    };
  });
  for (const l of lots ?? []) {
    if (l.status !== 'unsold') continue;
    rows.push({
      kind: 'unsold',
      id: l.id,
      purchase_order: null,
      player_id: l.player_id,
      player_name: l.player_name,
      player_photo_path: l.player_photo_path,
      primary_position: l.primary_position,
      secondary_position: l.secondary_position,
      team_id: null,
      price: null,
      base_price: l.base_price,
      round: l.round_number,
      lot_number: l.lot_number,
      status: 'Unsold',
      txn_kind: null,
      reversal_reason: null,
      at: l.closed_at ?? l.opened_at,
    });
  }
  return rows;
}

export interface UnsoldPlayer {
  id: string;
  full_name: string;
  photo_path: string | null;
  primary_position: Position;
  secondary_position: Position | null;
  base_price: number;
  jersey_number: number | null;
}

export async function fetchPlayersByStatus(supabase: Client, status: 'unsold' | 'available'): Promise<UnsoldPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, full_name, photo_path, primary_position, secondary_position, base_price, jersey_number')
    .eq('status', status)
    .order('full_name')
    .limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAuctionFeed(supabase: Client, limit = 8): Promise<AuctionEvent[]> {
  const { data } = await supabase
    .from('auction_events')
    .select('*')
    .in('event_type', [...FEED_TYPES])
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export function auctionStatusLabel(state: Pick<AuctionState, 'status' | 'current_round' | 'between_rounds'> | null): string {
  if (!state) return 'Not started';
  switch (state.status) {
    case 'not_started':
      return 'Not started';
    case 'live':
      return `Live · Round ${state.current_round}`;
    case 'paused':
      return state.between_rounds ? `Between rounds · Round ${state.current_round} ended` : 'Paused';
    case 'completed':
      return 'Completed';
  }
}

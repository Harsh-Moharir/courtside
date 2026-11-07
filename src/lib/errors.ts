/** Maps stable machine-readable error codes (5.7) to short human sentences. */
export const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: 'Your session has expired or you are not an administrator. Please sign in again.',
  VALIDATION_FAILED: 'Some values are not valid. Check the highlighted fields.',
  NOT_FOUND: 'That item no longer exists. The page will refresh.',
  CONFLICT: 'That action is not possible in the current state.',
  TEAM_LIMIT_REACHED: 'The maximum of 10 teams has been reached.',
  TEAM_HAS_HISTORY: 'This team cannot be deleted because it already has fixtures or auction history.',
  PLAYER_IS_SOLD: 'This player has been sold. Reverse the sale first.',
  PLAYER_IS_ICON: 'This player is an icon player. Remove them from the icon slot first.',
  PLAYER_ON_LIVE_LOT: 'This player is on the auction block right now.',
  PLAYER_NOT_AVAILABLE: 'This player is not available for the auction.',
  ICON_PLAYER_INVALID: 'This player cannot be an icon player (already sold, an icon elsewhere, or this team’s other icon).',
  IMPORT_INVALID: 'Some rows are not valid. Nothing was imported.',
  AUCTION_NOT_LIVE: 'The auction is not live.',
  AUCTION_PAUSED: 'The auction is paused. Resume it first.',
  AUCTION_NEEDS_TEAMS: 'At least 2 teams are needed to start the auction.',
  POOL_EMPTY: 'There are no available players in the pool.',
  ICONS_INCOMPLETE: 'Some teams do not have two icon players yet.',
  ROUND_LIMIT_REACHED: 'No more rounds are allowed by the auction settings.',
  LIVE_LOT_EXISTS: 'Close the current lot first (SOLD, UNSOLD or cancel).',
  LOT_ALREADY_LIVE: 'A player is already on the block.',
  LOT_NOT_LIVE: 'This lot is already closed.',
  BID_STALE: 'The bid changed: check the new price.',
  BID_SAME_TEAM_LEADING: 'This team is already the highest bidder.',
  TEAM_SQUAD_FULL: 'This team’s squad is full.',
  BID_BELOW_MINIMUM: 'The bid is below the minimum next bid.',
  BID_EXCEEDS_PURSE: 'This team cannot afford that amount.',
  NOTHING_TO_UNDO: 'There is nothing to undo.',
  SOLD_WITHOUT_BID: 'A player can only be sold after a bid.',
  BIDS_EXIST: 'Bids exist on this lot. Confirm that they should be discarded.',
  SALE_INVALID: 'The sale is no longer valid (purse or squad changed). Nothing was saved.',
  PURSE_BELOW_SPENT: 'The purse cannot be lower than what the team has already spent or currently bid.',
  SETTINGS_CONFLICT: 'These settings conflict with existing data.',
  TXN_NOT_ACTIVE: 'This sale has already been reversed.',
  FIXTURES_EXIST: 'League fixtures already exist. Choose regenerate to replace them.',
  TEAMS_NOT_ENOUGH: 'Not enough teams for this action.',
  FIXTURE_NOT_EDITABLE: 'This fixture can no longer be changed in that way.',
  FIXTURE_TEAMS_INVALID: 'Pick two different teams.',
  FIXTURE_DUPLICATE: 'A fixture with the same home and away teams already exists.',
  MATCH_NOT_STARTABLE: 'This match cannot be started (both teams must be known).',
  MATCH_ALREADY_STARTED: 'This match has already started or finished.',
  MATCH_TEAM_BUSY: 'One of these teams is already playing a live match.',
  MATCH_NOT_LIVE: 'This match is not live.',
  INVALID_PERIOD_TRANSITION: 'That period change is not allowed right now.',
  CLOCK_RUNNING: 'Pause the clock first.',
  NO_TIMEOUTS_LEFT: 'No timeouts left for this team.',
  TIED_NO_DRAWS: 'The score is tied and draws are not allowed. Start overtime instead.',
  RESULT_INVALID: 'The result is not valid.',
  LEAGUE_INCOMPLETE: 'The league is not complete yet.',
  BRACKET_EXISTS: 'A bracket already exists. Choose regenerate to replace it.',
  BRACKET_LOCKED: 'Playoff matches have started, so the bracket can no longer be regenerated.',
  SEEDS_UNRESOLVED: 'Playoff seeds are not decided yet.',
  PLAYOFF_NOT_READY: 'The playoffs are not ready yet.',
  PLAYOFF_RESULT_LOCKED: 'A later playoff match depending on this result has already started.',
  NETWORK: 'Could not reach the server. Check the connection and retry.',
};

export interface AppError {
  code: string;
  message: string;
  detail: Record<string, unknown> | null;
}

export function messageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? `Something went wrong (${code})`;
}

function parseDetail(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

const KNOWN = new Set(Object.keys(ERROR_MESSAGES));

/** Turns a Supabase/PostgREST error into an AppError without leaking raw Postgres text. */
export function toAppError(err: unknown): AppError {
  const e = (err ?? {}) as { message?: string; code?: string; details?: unknown; status?: number; name?: string };
  const msg = e.message ?? '';
  if (KNOWN.has(msg)) {
    const detail = parseDetail(e.details);
    let message = messageFor(msg);
    const reason = detail && typeof detail.reason === 'string' ? detail.reason : null;
    if (reason) message = `${message} ${reason}`;
    return { code: msg, message, detail };
  }
  if (e.code === '42501' || e.status === 401 || /JWT|jwt expired|permission denied/i.test(msg)) {
    return { code: 'NOT_AUTHORIZED', message: messageFor('NOT_AUTHORIZED'), detail: null };
  }
  if (/Failed to fetch|NetworkError|network|fetch failed|Load failed/i.test(msg) || e.name === 'TypeError') {
    return { code: 'NETWORK', message: messageFor('NETWORK'), detail: null };
  }
  if (e.code === '23505') return { code: 'CONFLICT', message: 'That value is already used.', detail: null };
  if (e.code === '23514' || e.code === '22P02' || e.code === '23502') {
    return { code: 'VALIDATION_FAILED', message: messageFor('VALIDATION_FAILED'), detail: null };
  }
  return { code: e.code || 'UNKNOWN', message: messageFor(e.code || 'UNKNOWN'), detail: null };
}

/** Field errors from a VALIDATION_FAILED detail. */
export function fieldErrors(err: AppError | null): Record<string, string> {
  const f = err?.detail?.fields;
  return f && typeof f === 'object' ? (f as Record<string, string>) : {};
}

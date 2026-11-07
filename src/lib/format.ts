import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TZ = 'Asia/Kolkata';

/** The single helper for showing dates and times (11.8): always in the tournament time zone. */
export function formatInTournamentTz(date: string | Date | null | undefined, pattern: string, tz: string = DEFAULT_TZ): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, tz, pattern);
}

/** Tournament-zone calendar day key (yyyy-MM-dd). */
export function dayKey(date: string | Date, tz: string = DEFAULT_TZ): string {
  return formatInTournamentTz(date, 'yyyy-MM-dd', tz);
}

/** "Approx. 6:30 PM" for upcoming fixtures. */
export function approxTime(date: string | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!date) return 'Time to be announced';
  return `Approx. ${formatInTournamentTz(date, 'h:mm a', tz)}`;
}

/** Converts a tournament-zone wall clock (yyyy-MM-dd, HH:mm) to a UTC ISO string. */
export function zonedToUtcIso(dateStr: string, timeStr: string, tz: string = DEFAULT_TZ): string {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, tz).toISOString();
}

/** Splits a UTC timestamp into tournament-zone date and time input values. */
export function utcToZonedInputs(iso: string | null | undefined, tz: string = DEFAULT_TZ): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  return { date: formatInTournamentTz(iso, 'yyyy-MM-dd', tz), time: formatInTournamentTz(iso, 'HH:mm', tz) };
}

export function zoneAbbreviation(tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}

export function viewerZoneDiffers(tz: string = DEFAULT_TZ): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone !== tz;
  } catch {
    return false;
  }
}

export { toZonedTime };

const moneyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Whole-number money in the tournament unit (D3). */
export function formatMoney(amount: number | null | undefined, symbol = '₹'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${moneyFmt.format(Math.abs(amount))}`;
}

export function formatNumber(n: number): string {
  return moneyFmt.format(n);
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export const POSITION_LABELS = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C: 'Center',
} as const;

export const POSITION_GROUPS = {
  PG: 'Point Guards',
  SG: 'Shooting Guards',
  SF: 'Small Forwards',
  PF: 'Power Forwards',
  C: 'Centers',
} as const;

export type Position = keyof typeof POSITION_LABELS;
export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

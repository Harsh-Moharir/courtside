/** The division (Men, Women, …) a visitor is looking at. Stored in a cookie and sent to Supabase as `x-division`. */
export const DIVISION_COOKIE = 'division';
export const DIVISION_HEADER = 'x-division';

export interface Division {
  id: string;
  label: string;
  is_default: boolean;
  sort_order: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDivisionId(v: string | null | undefined): boolean {
  return !!v && UUID.test(v);
}

/** Browser only: the division id from document.cookie. */
export function readDivisionCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)division=([^;]+)/);
  const v = m ? decodeURIComponent(m[1] as string) : null;
  return isDivisionId(v) ? v : null;
}

/** Browser only: switch division and reload. Detail pages go back to their list (they belong to one division). */
export function switchDivision(id: string): void {
  document.cookie = `${DIVISION_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  const p = window.location.pathname;
  const target = p.startsWith('/teams/')
    ? '/teams'
    : p.startsWith('/matches/')
      ? '/live'
      : p.startsWith('/admin/teams/')
        ? '/admin/teams'
        : p.startsWith('/admin/live/')
          ? '/admin/live'
          : null;
  if (target) window.location.assign(target);
  else window.location.reload();
}

export function divisionHeaders(id: string | null | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  if (id) h[DIVISION_HEADER] = id;
  return h;
}

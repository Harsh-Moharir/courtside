import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { DIVISION_COOKIE, isDivisionId } from '@/lib/division';

const ENTITY = /^\/(?:admin\/)?(?:teams|matches|live)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Picks the division for this request when the URL says which one it is:
 *  - `?division=<id or name>` (for example a projector bookmarked at /auction/display?division=women)
 *  - a team or match link, which always opens in that team's or match's own division.
 */
async function divisionFromUrl(request: NextRequest): Promise<string | null> {
  const param = request.nextUrl.searchParams.get('division');
  if (param) {
    if (isDivisionId(param)) return param;
    const list = await callRpc<{ id: string; label: string }[]>('list_divisions', {});
    const hit = list?.find((d) => d.label.toLowerCase() === param.toLowerCase());
    if (hit) return hit.id;
  }
  const m = ENTITY.exec(request.nextUrl.pathname);
  if (m) {
    const id = await callRpc<string | null>('division_of', { p_id: m[1] });
    if (isDivisionId(id)) return id;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const division = await divisionFromUrl(request);
  if (division && request.cookies.get(DIVISION_COOKIE)?.value !== division) {
    request.cookies.set(DIVISION_COOKIE, division);
    const response = await updateSession(request);
    response.cookies.set(DIVISION_COOKIE, division, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|svg)$).*)'],
};

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from '@/types/database';
import { DIVISION_COOKIE, divisionHeaders, isDivisionId } from '@/lib/division';

export async function getServerClient() {
  const cookieStore = await cookies();
  const division = cookieStore.get(DIVISION_COOKIE)?.value;
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: divisionHeaders(isDivisionId(division) ? division : null) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}

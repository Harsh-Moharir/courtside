'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';
import { divisionHeaders, readDivisionCookie } from '@/lib/division';

export type DB = SupabaseClient<Database>;

let client: DB | null = null;

/** One shared Supabase browser client per tab (11.8). */
export function getBrowserClient(): DB {
  if (!client) {
    const division = readDivisionCookie();
    client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      // Every API request is scoped to the selected division (see migration 0010).
      global: { headers: divisionHeaders(division) },
    });
  }
  return client;
}

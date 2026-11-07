'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

export type DB = SupabaseClient<Database>;

let client: DB | null = null;

/** One shared Supabase browser client per tab (11.8). */
export function getBrowserClient(): DB {
  if (!client) {
    client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}

import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import type { Database } from '../../src/types/database';

config({ path: '.env.local' });

export const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@courtside.local';
export const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'ChangeMe-Local-123';

export async function login(page: Page) {
  await page.goto('/login?next=/admin');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/admin'), { timeout: 30_000 });
}

/** An admin Supabase client signed in with the bootstrap admin (used to drive RPCs "for speed"). */
export async function adminClient(): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw error;
  return c;
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

export async function rpcOk<T = unknown>(c: SupabaseClient<Database>, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await c.rpc(name as never, args as never);
  if (error) throw new Error(`${name}: ${error.message} ${error.details ?? ''}`);
  return data as T;
}

/** Collects console errors so a test can assert there were none. */
export function trackConsoleErrors(page: Page, ignore: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.some((r) => r.test(m.text()))) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

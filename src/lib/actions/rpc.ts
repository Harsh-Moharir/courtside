'use client';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fail, ok, type Result } from '@/lib/result';
import type { Database } from '@/types/database';
import { notifySessionExpired } from '@/lib/session-events';

type Fns = Database['public']['Functions'];
export type RpcName = keyof Fns;
export type RpcArgs<N extends RpcName> = Fns[N] extends { Args: infer A } ? A : never;

/**
 * Calls an RPC and returns a discriminated Result (11.8). Callers cast `data` to the documented jsonb shape.
 * NOT_AUTHORIZED triggers the global "Session expired" dialog without clearing any on-screen state.
 */
export async function rpc<T = unknown, N extends RpcName = RpcName>(name: N, args?: RpcArgs<N>): Promise<Result<T>> {
  try {
    const { data, error } = await getBrowserClient().rpc(name, (args ?? {}) as never);
    if (error) {
      const r = fail<T>(error);
      if (!r.ok && r.code === 'NOT_AUTHORIZED') notifySessionExpired();
      return r;
    }
    return ok(data as T);
  } catch (e) {
    return fail<T>(e);
  }
}

/** Wraps a direct table write (RLS-protected simple CRUD) the same way. */
export async function write<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<Result<T>> {
  try {
    const { data, error } = await p;
    if (error) {
      const r = fail<T>(error);
      if (!r.ok && r.code === 'NOT_AUTHORIZED') notifySessionExpired();
      return r;
    }
    return ok(data as T);
  } catch (e) {
    return fail<T>(e);
  }
}

export function requestId(): string {
  return crypto.randomUUID();
}

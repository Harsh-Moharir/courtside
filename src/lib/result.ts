import { toAppError, type AppError } from '@/lib/errors';

export type Result<T> = { ok: true; data: T } | ({ ok: false } & AppError);

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T>(err: unknown): Result<T> {
  return { ok: false, ...toAppError(err) };
}

/** Wraps a supabase-js call ({ data, error }) into a Result. Never throws. */
export async function run<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<Result<T>> {
  try {
    const { data, error } = await p;
    if (error) return fail<T>(error);
    return ok(data as T);
  } catch (e) {
    return fail<T>(e);
  }
}

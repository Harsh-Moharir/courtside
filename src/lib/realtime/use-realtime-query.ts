'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/browser';

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'polling';

export interface Subscription {
  table: string;
  /** Postgres Changes filter, e.g. `fixture_id=eq.<uuid>` */
  filter?: string;
}

export interface UseRealtimeQueryOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  subscriptions: Subscription[];
  initialData?: T;
  /** Polling interval used while the channel is not subscribed for more than 5 s (8.9). */
  pollMs?: number;
  debounceMs?: number;
  /** Optional hook to inspect raw changes; return false to skip the refetch for that change. */
  onChange?: (payload: { table: string; eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => boolean | void;
  enabled?: boolean;
}

let channelSeq = 0;

/**
 * Subscribe first, fetch second (8.9). Debounced refetch on any change, refetch on every (re)subscribe,
 * polling fallback when the channel is down, cleanup on unmount.
 */
export function useRealtimeQuery<T>({
  key,
  fetcher,
  subscriptions,
  initialData,
  pollMs = 5000,
  debounceMs = 300,
  onChange,
  enabled = true,
}: UseRealtimeQueryOptions<T>) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(initialData === undefined);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(0);

  const refetch = useCallback(async () => {
    const id = ++inflight.current;
    try {
      const next = await fetcherRef.current();
      if (id === inflight.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (id === inflight.current) setError(e instanceof Error ? e.message : 'Could not load data');
    } finally {
      if (id === inflight.current) setLoading(false);
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), debounceMs);
  }, [debounceMs, refetch]);

  const subsKey = JSON.stringify(subscriptions);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserClient();
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let downSince: number | null = Date.now();
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const startPolling = () => {
      if (pollTimer) return;
      setStatus('polling');
      pollTimer = setInterval(() => void refetch(), pollMs);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const subs: Subscription[] = JSON.parse(subsKey);
    channel = supabase.channel(`rq:${key}:${++channelSeq}`);
    for (const s of subs) {
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) } as never,
        ((payload: { table: string; eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const res = onChangeRef.current?.(payload);
          if (res !== false) scheduleRefetch();
        }) as never,
      );
    }
    channel.subscribe((st) => {
      if (disposed) return;
      if (st === 'SUBSCRIBED') {
        downSince = null;
        stopPolling();
        setStatus('live');
        void refetch(); // refetch everything on every transition to subscribed
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
        if (downSince === null) downSince = Date.now();
        setStatus((cur) => (cur === 'polling' ? cur : 'reconnecting'));
      }
    });
    // Fetch after subscribing (initial data may already exist from the server render).
    void refetch();
    watchdog = setInterval(() => {
      if (downSince !== null && Date.now() - downSince > 5000) startPolling();
    }, 1000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (watchdog) clearInterval(watchdog);
      stopPolling();
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [key, subsKey, enabled, pollMs, refetch, scheduleRefetch]);

  return { data, status, error, loading, refetch, setData };
}

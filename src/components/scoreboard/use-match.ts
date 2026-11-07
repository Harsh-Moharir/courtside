'use client';
import { useCallback, useRef } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { fetchMatchBundle, type MatchBundle, type MatchState } from '@/lib/queries/matches';

/**
 * Live data for one match (8.9): subscribe first, then fetch; match_states rows are applied only when their
 * `version` is higher than the one held; every version change refetches the last non-voided events.
 */
export function useMatch(fixtureId: string, initial: MatchBundle | null, opts: { eventLimit?: number; pollMs?: number; includeVoided?: boolean } = {}) {
  const versionRef = useRef<number>(initial?.state?.version ?? -1);
  const stateRef = useRef<MatchState | null>(initial?.state ?? null);
  const eventLimit = opts.eventLimit ?? 8;
  const includeVoided = opts.includeVoided ?? false;

  const fetcher = useCallback(async () => {
    const b = await fetchMatchBundle(getBrowserClient(), fixtureId, eventLimit, includeVoided);
    if (b && b.state && stateRef.current && b.state.version < versionRef.current) {
      // A realtime row newer than this fetch already arrived: keep it.
      b.state = stateRef.current;
    }
    if (b?.state) {
      versionRef.current = b.state.version;
      stateRef.current = b.state;
    } else if (b) {
      versionRef.current = -1;
      stateRef.current = null;
    }
    return b;
  }, [fixtureId, eventLimit, includeVoided]);

  const q = useRealtimeQuery<MatchBundle | null>({
    key: `match:${fixtureId}`,
    initialData: initial,
    pollMs: opts.pollMs ?? 3000,
    debounceMs: 150,
    subscriptions: [
      { table: 'match_states', filter: `fixture_id=eq.${fixtureId}` },
      { table: 'live_scoring_events', filter: `fixture_id=eq.${fixtureId}` },
      { table: 'fixtures', filter: `id=eq.${fixtureId}` },
      { table: 'match_results', filter: `fixture_id=eq.${fixtureId}` },
    ],
    fetcher,
    onChange: (p) => {
      if (p.table === 'match_states' && p.eventType !== 'DELETE') {
        const row = p.new as unknown as MatchState;
        if (row && typeof row.version === 'number' && row.version > versionRef.current) {
          versionRef.current = row.version;
          stateRef.current = row;
          // Fast path: show the new score immediately, then refetch events.
          setDataRef.current?.((prev) => (prev ? { ...prev, state: row } : prev));
        }
      }
      return true;
    },
  });
  const setDataRef = useRef(q.setData);
  setDataRef.current = q.setData;

  /** Applies a match_states row returned by an RPC, only if it is newer than the one held. */
  const applyState = useCallback((row: MatchState | null | undefined) => {
    if (!row || typeof row.version !== 'number' || row.version <= versionRef.current) return;
    versionRef.current = row.version;
    stateRef.current = row;
    setDataRef.current((prev) => (prev ? { ...prev, state: row } : prev));
  }, []);

  return { ...q, applyState };
}

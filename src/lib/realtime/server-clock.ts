'use client';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { estimateOffset, type OffsetSample } from '@/lib/domain/clock';

let sharedOffset = 0;
let lastMeasured = 0;
let measuring: Promise<number> | null = null;

/** Measures client-to-server clock offset: 3 samples, smallest RTT wins (8.3). */
export async function measureOffset(): Promise<number> {
  if (measuring) return measuring;
  measuring = (async () => {
    const supabase = getBrowserClient();
    const samples: OffsetSample[] = [];
    for (let i = 0; i < 3; i++) {
      const tSend = Date.now();
      const { data, error } = await supabase.rpc('server_time');
      const tRecv = Date.now();
      if (!error && data) samples.push({ tSend, tRecv, server: new Date(data as string).getTime() });
    }
    if (samples.length) {
      sharedOffset = estimateOffset(samples);
      lastMeasured = Date.now();
    }
    return sharedOffset;
  })().finally(() => {
    measuring = null;
  });
  return measuring;
}

export function serverNow(): number {
  return Date.now() + sharedOffset;
}

/** Returns a ticking estimate of server time, re-measured on load, every 5 minutes and when the tab is visible again. */
export function useServerNow(intervalMs = 100): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (Date.now() - lastMeasured > 60_000) void measureOffset();
    const remeasure = setInterval(() => void measureOffset(), 5 * 60_000);
    const tick = setInterval(() => setNow(serverNow()), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(serverNow());
        void measureOffset();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearInterval(remeasure);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [intervalMs]);
  return now;
}

'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/browser';

/** Re-renders the server dashboard when relevant tables change (debounced). */
export function DashboardRefresher() {
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = getBrowserClient();
    const ch = supabase.channel('admin-dashboard');
    for (const table of ['teams', 'players', 'auction_state', 'fixtures', 'standings', 'playoff_brackets', 'tournaments']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => router.refresh(), 800);
      });
    }
    ch.subscribe();
    return () => {
      if (t.current) clearTimeout(t.current);
      void supabase.removeChannel(ch);
    };
  }, [router]);
  return null;
}

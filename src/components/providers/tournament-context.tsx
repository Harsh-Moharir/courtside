'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Tables } from '@/types/database';
import { getBrowserClient } from '@/lib/supabase/browser';

export type Tournament = Tables<'tournaments'>;

const Ctx = createContext<Tournament | null>(null);

export function TournamentProvider({ initial, children }: { initial: Tournament | null; children: React.ReactNode }) {
  const [t, setT] = useState<Tournament | null>(initial);
  useEffect(() => {
    if (!initial) return;
    const supabase = getBrowserClient();
    const ch = supabase
      .channel(`tournament:${initial.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${initial.id}` }, (p) => {
        setT(p.new as Tournament);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [initial]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

/** The active tournament (D1). Falls back to safe defaults on an empty database. */
export function useTournament(): Tournament {
  const t = useContext(Ctx);
  return (
    t ?? {
      id: '',
      name: 'Basketball Tournament',
      slug: 'basketball-tournament',
      tagline: null,
      logo_path: null,
      banner_path: null,
      timezone: 'Asia/Kolkata',
      currency_symbol: '₹',
      venue_default: null,
      phase: 'setup',
      is_active: true,
      featured_fixture_id: null,
      champion_team_id: null,
      created_at: '',
      updated_at: '',
    }
  );
}

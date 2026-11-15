'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Tables } from '@/types/database';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { Division } from '@/lib/division';

export type Tournament = Tables<'tournaments'>;

const Ctx = createContext<Tournament | null>(null);
const DivCtx = createContext<Division[]>([]);

export function TournamentProvider({ initial, divisions = [], children }: { initial: Tournament | null; divisions?: Division[]; children: React.ReactNode }) {
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
  return (
    <Ctx.Provider value={t}>
      <DivCtx.Provider value={divisions}>{children}</DivCtx.Provider>
    </Ctx.Provider>
  );
}

/** All divisions of the event (Men, Women, …), in display order. */
export function useDivisions(): Division[] {
  return useContext(DivCtx);
}

/** The current division's tournament row (D1). Falls back to safe defaults on an empty database. */
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
      division_label: 'Open',
      is_default: true,
      sort_order: 0,
      featured_fixture_id: null,
      champion_team_id: null,
      created_at: '',
      updated_at: '',
    }
  );
}

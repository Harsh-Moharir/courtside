import 'server-only';
import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

/** The active tournament (D1), cached per request. */
export const getActiveTournament = cache(async (): Promise<Tables<'tournaments'> | null> => {
  const supabase = await getServerClient();
  const { data } = await supabase.from('tournaments').select('*').eq('is_active', true).maybeSingle();
  return data;
});

export const getIsAdmin = cache(async (): Promise<boolean> => {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc('is_admin');
  return data === true;
});

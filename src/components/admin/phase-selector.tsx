'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getBrowserClient } from '@/lib/supabase/browser';
import { write } from '@/lib/actions/rpc';
import { Select } from '@/components/ui/field';
import type { Database } from '@/types/database';

type Phase = Database['public']['Enums']['tournament_phase'];
const PHASES: { value: Phase; label: string }[] = [
  { value: 'setup', label: 'Setup' },
  { value: 'auction', label: 'Auction' },
  { value: 'league', label: 'League' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'completed', label: 'Completed' },
];

/** Informational phase shown in public banners; no business rule depends on it. */
export function PhaseSelector({ tournamentId, phase }: { tournamentId: string; phase: Phase }) {
  const router = useRouter();
  const [value, setValue] = useState<Phase>(phase);
  const [pending, setPending] = useState(false);
  async function change(next: Phase) {
    const prev = value;
    setValue(next);
    setPending(true);
    const r = await write(getBrowserClient().from('tournaments').update({ phase: next }).eq('id', tournamentId).select('id'));
    setPending(false);
    if (!r.ok) {
      setValue(prev);
      toast.error(r.message);
      return;
    }
    toast.success(`Phase set to ${PHASES.find((p) => p.value === next)?.label}`);
    router.refresh();
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Phase</span>
      <Select aria-label="Tournament phase" className="w-40" value={value} disabled={pending} onChange={(e) => void change(e.target.value as Phase)}>
        {PHASES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

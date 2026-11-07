'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { rpc } from '@/lib/actions/rpc';
import { fieldErrors } from '@/lib/errors';
import type { Tables } from '@/types/database';

type Rules = Tables<'match_rules'>;
type NumKey =
  | 'quarter_seconds'
  | 'overtime_seconds'
  | 'shot_clock_seconds'
  | 'shot_clock_short_reset_seconds'
  | 'timeouts_first_half'
  | 'timeouts_second_half'
  | 'timeouts_per_overtime'
  | 'team_foul_bonus_threshold';

const NUMS: { key: NumKey; label: string; hint: string; minutes?: boolean }[] = [
  { key: 'quarter_seconds', label: 'Period length (minutes)', hint: '1 to 60 minutes', minutes: true },
  { key: 'overtime_seconds', label: 'Overtime length (minutes)', hint: '1 to 30 minutes', minutes: true },
  { key: 'shot_clock_seconds', label: 'Shot clock (seconds)', hint: '10 to 60' },
  { key: 'shot_clock_short_reset_seconds', label: 'Short shot clock reset (seconds)', hint: '5 to the full shot clock' },
  { key: 'timeouts_first_half', label: 'Timeouts, first half', hint: '0 to 10 per team' },
  { key: 'timeouts_second_half', label: 'Timeouts, second half', hint: '0 to 10 per team' },
  { key: 'timeouts_per_overtime', label: 'Timeouts per overtime', hint: '0 to 5 per team' },
  { key: 'team_foul_bonus_threshold', label: 'Team foul bonus threshold', hint: 'Opponent is in the bonus at this many fouls' },
];

export function MatchRulesForm({ rules }: { rules: Rules }) {
  const [v, setV] = useState<Rules>(rules);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const r = await rpc<Rules>('save_match_rules', {
      p_rules: {
        quarters: v.quarters,
        quarter_seconds: v.quarter_seconds,
        overtime_seconds: v.overtime_seconds,
        shot_clock_seconds: v.shot_clock_seconds,
        shot_clock_short_reset_seconds: v.shot_clock_short_reset_seconds,
        timeouts_first_half: v.timeouts_first_half,
        timeouts_second_half: v.timeouts_second_half,
        timeouts_per_overtime: v.timeouts_per_overtime,
        team_foul_bonus_threshold: v.team_foul_bonus_threshold,
        hide_shot_clock_under_game_clock: v.hide_shot_clock_under_game_clock,
      },
    });
    setPending(false);
    if (!r.ok) {
      setErrors(fieldErrors(r));
      toast.error(r.message);
      return;
    }
    setV(r.data);
    toast.success('Match rules saved. They apply to future periods and matches.');
  }

  const num = (key: NumKey, minutes?: boolean) => ({
    value: minutes ? String(Math.round((v[key] as number) / 6) / 10) : String(v[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (Number.isNaN(n)) return;
      setV({ ...v, [key]: minutes ? Math.round(n * 60) : Math.round(n) });
    },
  });

  return (
    <Card className="p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Match rules</h2>
      <p className="mb-4 text-sm text-muted">FIBA-style defaults: four 10-minute quarters, 24-second shot clock. Changes never affect the clocks of a live match.</p>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Periods" htmlFor="r-quarters" error={errors.quarters}>
          <Select id="r-quarters" value={v.quarters} onChange={(e) => setV({ ...v, quarters: Number(e.target.value) })}>
            <option value={4}>4 quarters</option>
            <option value={3}>3 periods</option>
            <option value={2}>2 halves</option>
          </Select>
        </Field>
        {NUMS.map((n) => (
          <Field key={n.key} label={n.label} htmlFor={`r-${n.key}`} error={errors[n.key]} hint={n.hint}>
            <Input id={`r-${n.key}`} type="number" inputMode="decimal" step={n.minutes ? 0.5 : 1} min={0} {...num(n.key, n.minutes)} />
          </Field>
        ))}
        <label className="flex min-h-[44px] items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            checked={v.hide_shot_clock_under_game_clock}
            onChange={(e) => setV({ ...v, hide_shot_clock_under_game_clock: e.target.checked })}
          />
          <span className="text-sm">Hide the shot clock when less game time remains than shot clock time</span>
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            Save match rules
          </Button>
        </div>
      </form>
    </Card>
  );
}

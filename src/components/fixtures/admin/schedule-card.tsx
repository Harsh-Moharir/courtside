'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminCard } from './shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { cn } from '@/components/ui/cn';
import { rpc } from '@/lib/actions/rpc';
import { fieldErrors } from '@/lib/errors';
import { useTournament } from '@/components/providers/tournament-context';
import { formatInTournamentTz } from '@/lib/format';

const DAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
] as const;

export function ScheduleCard({ unscheduled, upcomingScheduled, onDone }: { unscheduled: number; upcomingScheduled: number; onDone: () => void }) {
  const t = useTournament();
  const [startDate, setStartDate] = useState(() => formatInTournamentTz(new Date(), 'yyyy-MM-dd', t.timezone));
  const [days, setDays] = useState<number[]>([6, 7]);
  const [firstStart, setFirstStart] = useState('17:00');
  const [slotMinutes, setSlotMinutes] = useState('90');
  const [slotsPerDay, setSlotsPerDay] = useState('3');
  const [courts, setCourts] = useState(t.venue_default ?? 'Court A');
  const [scope, setScope] = useState<'unscheduled' | 'all'>('unscheduled');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ scheduled: number; unscheduled: number } | null>(null);

  const courtList = courts
    .split(/[\n,]/)
    .map((c) => c.trim())
    .filter(Boolean);

  function toggleDay(d: number) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!startDate) local.start = 'Pick a start date';
    if (days.length === 0) local.game_days = 'Pick at least one weekday';
    if (courtList.length === 0) local.courts = 'Enter at least one court or venue';
    if (courtList.some((c) => c.length > 80)) local.courts = 'Court names are at most 80 characters';
    const sm = Number(slotMinutes);
    const spd = Number(slotsPerDay);
    if (!Number.isInteger(sm) || sm < 15 || sm > 600) local.slot_minutes = '15 to 600 minutes';
    if (!Number.isInteger(spd) || spd < 1 || spd > 24) local.slots_per_day = '1 to 24 slots';
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setPending(true);
    const r = await rpc<{ scheduled: number; unscheduled: number }>('auto_schedule_fixtures', {
      p_start_date: startDate,
      p_game_days: days,
      p_first_start: firstStart,
      p_slot_minutes: sm,
      p_courts: courtList,
      p_slots_per_day: spd,
      p_scope: scope,
    });
    setPending(false);
    if (!r.ok) {
      setErrors(fieldErrors(r));
      toast.error(r.message);
      return;
    }
    setResult(r.data);
    toast.success(`${r.data.scheduled} fixtures scheduled${r.data.unscheduled ? `, ${r.data.unscheduled} still without a date` : ''}.`);
    onDone();
  }

  return (
    <AdminCard
      title="Auto-schedule"
      description={`Assigns dates, approximate start times and courts in ${t.timezone}. A team plays at most once per day. Live, completed and postponed fixtures are never touched.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="as-start" error={errors.start}>
            <Input id="as-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="First start time" htmlFor="as-time">
            <Input id="as-time" type="time" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Game days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([d, label]) => (
              <label
                key={d}
                className={cn(
                  'inline-flex min-h-[44px] min-w-[52px] cursor-pointer items-center justify-center rounded-btn border px-2 text-sm font-semibold',
                  days.includes(d) ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface-2 text-muted',
                )}
              >
                <input type="checkbox" className="sr-only" checked={days.includes(d)} onChange={() => toggleDay(d)} />
                {label}
              </label>
            ))}
          </div>
          {errors.game_days && <p className="mt-1 text-xs text-red-300">{errors.game_days}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slot length (minutes)" htmlFor="as-slot" error={errors.slot_minutes}>
            <Input id="as-slot" type="number" min={15} max={600} value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)} />
          </Field>
          <Field label="Slots per day" htmlFor="as-slots" error={errors.slots_per_day}>
            <Input id="as-slots" type="number" min={1} max={24} value={slotsPerDay} onChange={(e) => setSlotsPerDay(e.target.value)} />
          </Field>
        </div>
        <Field label="Courts or venues" htmlFor="as-courts" hint="One per line (or comma separated). Courts are filled in this order in each slot." error={errors.courts}>
          <Textarea id="as-courts" rows={2} className="min-h-[64px]" value={courts} onChange={(e) => setCourts(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Which fixtures</legend>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === 'unscheduled'} onChange={() => setScope('unscheduled')} className="h-4 w-4 accent-[var(--accent)]" />
              Only fixtures without a date ({unscheduled})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} className="h-4 w-4 accent-[var(--accent)]" />
              All upcoming league fixtures ({unscheduled + upcomingScheduled}), replacing existing dates
            </label>
          </div>
        </fieldset>
        {errors.schedule && <p className="text-sm text-red-300">{errors.schedule}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} disabled={scope === 'unscheduled' && unscheduled === 0}>
            Schedule fixtures
          </Button>
          {result && (
            <span className="text-sm text-muted" role="status">
              Scheduled <b className="text-fg">{result.scheduled}</b>, without a date <b className="text-fg">{result.unscheduled}</b>
            </span>
          )}
          {scope === 'unscheduled' && unscheduled === 0 && <span className="text-sm text-muted">Every upcoming league fixture already has a date.</span>}
        </div>
      </form>
    </AdminCard>
  );
}

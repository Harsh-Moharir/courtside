'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminCard } from './shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { cn } from '@/components/ui/cn';
import { rpc } from '@/lib/actions/rpc';

interface Props {
  teamCount: number;
  leagueCount: number;
  lockedCount: number; // live or completed league fixtures
  replaceRequested: boolean;
  onDone: () => void;
}

export function GenerateCard({ teamCount, leagueCount, lockedCount, replaceRequested, onDone }: Props) {
  const [format, setFormat] = useState<'single' | 'double'>('single');
  const [seed, setSeed] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = teamCount;
  const expected = format === 'single' ? (n * (n - 1)) / 2 : n * (n - 1);
  const rounds = n < 2 ? 0 : (n % 2 === 0 ? n - 1 : n) * (format === 'double' ? 2 : 1);
  const exists = leagueCount > 0;
  const seedValid = seed.trim() === '' || /^-?\d{1,9}$/.test(seed.trim());

  async function run(replace: boolean) {
    setPending(true);
    setError(null);
    const res = await rpc('generate_league_fixtures', {
      p_format: format,
      p_shuffle_seed: seed.trim() === '' ? undefined : Number(seed.trim()),
      p_replace: replace,
    });
    const r = res as typeof res & { data: { created: number; teams: number } };
    setPending(false);
    setConfirm(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`${r.data.created} league fixtures created for ${r.data.teams} teams. Schedule them next.`);
    onDone();
  }

  return (
    <AdminCard
      title="Generate league"
      description="Balanced round robin (circle method). Fixtures are created without dates; schedule them below."
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Format</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['single', 'Single round robin', 'Each pair meets once'],
                ['double', 'Double round robin', 'Home and away legs'],
              ] as const
            ).map(([v, label, hint]) => (
              <label
                key={v}
                className={cn(
                  'flex cursor-pointer flex-col rounded-btn border p-3',
                  format === v ? 'border-accent bg-accent/10' : 'border-border bg-surface-2',
                )}
              >
                <input type="radio" name="format" value={v} checked={format === v} onChange={() => setFormat(v)} className="sr-only" />
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label="Shuffle seed (optional)"
          htmlFor="gen-seed"
          hint="Leave empty to order teams by display order. Any whole number gives a repeatable shuffled draw."
          error={seedValid ? null : 'Enter a whole number'}
        >
          <Input id="gen-seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 2026" />
        </Field>
        <p className="text-sm text-muted">
          {n < 2 ? (
            <span className="text-red-300">At least 2 teams are needed.</span>
          ) : (
            <>
              {n} teams → <b className="text-fg">{expected}</b> matches over <b className="text-fg">{rounds}</b> rounds
              {n % 2 === 1 && ' (each team rests once per cycle)'}.
            </>
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        {exists ? (
          <div className="space-y-2 rounded-btn border border-border bg-surface-2 p-3 text-sm">
            <p>
              {leagueCount} league fixtures already exist.
              {lockedCount > 0
                ? ` ${lockedCount} are live or completed, so the league cannot be regenerated until they are resolved.`
                : ' Regenerating deletes all upcoming and postponed league fixtures and creates new ones.'}
            </p>
            <Button
              variant={replaceRequested ? 'primary' : 'secondary'}
              disabled={n < 2 || !seedValid || lockedCount > 0}
              onClick={() => setConfirm(true)}
            >
              Regenerate league
            </Button>
          </div>
        ) : (
          <Button disabled={n < 2 || !seedValid} loading={pending} onClick={() => void run(false)}>
            Generate {expected > 0 ? `${expected} fixtures` : 'fixtures'}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Regenerate the league?"
        description={`All ${leagueCount} upcoming and postponed league fixtures (and their dates) will be deleted and ${expected} new fixtures created. Playoff fixtures are kept.`}
        confirmLabel="Regenerate"
        confirmVariant="danger"
        loading={pending}
        onConfirm={() => run(true)}
      />
    </AdminCard>
  );
}

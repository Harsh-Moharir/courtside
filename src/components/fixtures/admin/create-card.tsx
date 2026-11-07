'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminCard, announceWarnings, type RpcWarning, type WithWarnings } from './shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { rpc } from '@/lib/actions/rpc';
import { zonedToUtcIso } from '@/lib/format';
import { useTournament } from '@/components/providers/tournament-context';
import type { FixtureTeam } from '@/lib/queries/fixtures';

export function CreateFixtureCard({ teams, onDone, onWarnings }: { teams: FixtureTeam[]; onDone: () => void; onWarnings: (w: RpcWarning[]) => void }) {
  const t = useTournament();
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [round, setRound] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);

  const roundValid = round.trim() === '' || /^\d{1,3}$/.test(round.trim()) && Number(round) >= 1;
  const timeMissing = !!date !== !!time;

  async function create(allowDuplicate: boolean) {
    setPending(true);
    setError(null);
    const r = await rpc<WithWarnings>('create_fixture', {
      p_home: home,
      p_away: away,
      p_scheduled_at: date && time ? zonedToUtcIso(date, time, t.timezone) : undefined,
      p_venue: venue.trim() || undefined,
      p_round: round.trim() ? Number(round) : undefined,
      p_allow_duplicate: allowDuplicate,
    });
    setPending(false);
    if (!r.ok) {
      if (r.code === 'FIXTURE_DUPLICATE' && !allowDuplicate) {
        setDupConfirm(true);
        return;
      }
      setError(r.message);
      return;
    }
    setDupConfirm(false);
    toast.success(`Fixture M${(r.data.fixture as { match_number?: number } | null)?.match_number ?? ''} created.`);
    onWarnings(announceWarnings(r.data.warnings));
    setHome('');
    setAway('');
    setRound('');
    onDone();
  }

  const homeName = teams.find((x) => x.id === home)?.name ?? '';
  const awayName = teams.find((x) => x.id === away)?.name ?? '';

  return (
    <AdminCard title="Create fixture" description="Adds a single league fixture by hand. The match number follows the highest existing one.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (home && away && home !== away && roundValid && !timeMissing) void create(false);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Home (left)" htmlFor="cf-home">
            <Select id="cf-home" value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="">Choose team</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id} disabled={tm.id === away}>
                  {tm.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Away (right)" htmlFor="cf-away" error={home && away && home === away ? 'Pick two different teams' : null}>
            <Select id="cf-away" value={away} onChange={(e) => setAway(e.target.value)}>
              <option value="">Choose team</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id} disabled={tm.id === home}>
                  {tm.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Date (${t.timezone})`} htmlFor="cf-date" hint="Optional: leave empty to schedule later.">
            <Input id="cf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Approximate start" htmlFor="cf-time" error={timeMissing ? 'Enter both a date and a time, or neither' : null}>
            <Input id="cf-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Venue / court" htmlFor="cf-venue" hint={t.venue_default ? `Defaults to ${t.venue_default}` : undefined}>
            <Input id="cf-venue" maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} />
          </Field>
          <Field label="Round (optional)" htmlFor="cf-round" error={roundValid ? null : 'A whole number from 1'}>
            <Input id="cf-round" inputMode="numeric" value={round} onChange={(e) => setRound(e.target.value)} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" loading={pending} disabled={!home || !away || home === away || !roundValid || timeMissing}>
          Create fixture
        </Button>
      </form>
      <ConfirmDialog
        open={dupConfirm}
        onOpenChange={setDupConfirm}
        title="Duplicate fixture"
        description={`${homeName} vs ${awayName} (same home and away) already exists. Create another one anyway?`}
        confirmLabel="Create anyway"
        loading={pending}
        onConfirm={() => create(true)}
      />
    </AdminCard>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { announceWarnings, fixtureTitle, type RpcWarning, type WithWarnings } from './shared';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { rpc } from '@/lib/actions/rpc';
import { formatInTournamentTz, utcToZonedInputs, zonedToUtcIso } from '@/lib/format';
import { useTournament } from '@/components/providers/tournament-context';
import type { FixtureTeam, FixtureView } from '@/lib/queries/fixtures';

interface Base {
  fixture: FixtureView | null;
  onClose: () => void;
  onDone: () => void;
}

export function EditFixtureDialog({ fixture, onClose, onDone, teams, onWarnings }: Base & { teams: FixtureTeam[]; onWarnings: (w: RpcWarning[]) => void }) {
  const t = useTournament();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [notes, setNotes] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fixture) return;
    const z = utcToZonedInputs(fixture.scheduled_at, t.timezone);
    setDate(z.date);
    setTime(z.time);
    setVenue(fixture.venue ?? '');
    setNotes(fixture.notes ?? '');
    setHome(fixture.home_team_id ?? '');
    setAway(fixture.away_team_id ?? '');
    setError(null);
  }, [fixture, t.timezone]);

  const league = fixture?.stage === 'league';
  const timeMissing = !!date !== !!time;
  const sameTeams = league && home === away;

  async function save() {
    if (!fixture) return;
    setPending(true);
    setError(null);
    const r = await rpc('update_fixture', {
      p_fixture_id: fixture.id,
      p_scheduled_at: (date && time ? zonedToUtcIso(date, time, t.timezone) : null) as string,
      p_venue: (venue.trim() || null) as string,
      p_notes: (notes.trim() || null) as string,
      p_home: league ? home : undefined,
      p_away: league ? away : undefined,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(`M${fixture.match_number} updated.`);
    onWarnings(announceWarnings((r.data as WithWarnings).warnings));
    onDone();
    onClose();
  }

  return (
    <ConfirmDialog
      open={!!fixture}
      onOpenChange={(o) => !o && onClose()}
      title={fixture ? `Edit M${fixture.match_number}` : 'Edit fixture'}
      description={fixture ? fixtureTitle(fixture) : undefined}
      confirmLabel="Save changes"
      loading={pending}
      confirmDisabled={timeMissing || sameTeams}
      onConfirm={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {league && (
          <>
            <Field label="Home (left)" htmlFor="ef-home">
              <Select id="ef-home" value={home} onChange={(e) => setHome(e.target.value)}>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Away (right)" htmlFor="ef-away" error={sameTeams ? 'Pick two different teams' : null}>
              <Select id="ef-away" value={away} onChange={(e) => setAway(e.target.value)}>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label={`Date (${t.timezone})`} htmlFor="ef-date" hint="Clear date and time to mark it unscheduled.">
          <Input id="ef-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Approximate start" htmlFor="ef-time" error={timeMissing ? 'Enter both a date and a time, or neither' : null}>
          <Input id="ef-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Venue / court" htmlFor="ef-venue" className="sm:col-span-2">
          <Input id="ef-venue" maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
        <Field label="Notes (public)" htmlFor="ef-notes" className="sm:col-span-2" hint={`${notes.length}/200`}>
          <Textarea id="ef-notes" maxLength={200} rows={2} className="min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {!league && fixture && <p className="mt-3 text-xs text-muted">Playoff teams come from the bracket and cannot be changed here.</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function PostponeDialog({ fixture, onClose, onDone }: Base) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReason('');
    setError(null);
  }, [fixture]);
  async function save() {
    if (!fixture) return;
    setPending(true);
    const r = await rpc('postpone_fixture', { p_fixture_id: fixture.id, p_reason: reason.trim() });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(`M${fixture.match_number} postponed.`);
    onDone();
    onClose();
  }
  return (
    <ConfirmDialog
      open={!!fixture}
      onOpenChange={(o) => !o && onClose()}
      title="Postpone fixture"
      description={fixture ? `${fixtureTitle(fixture)}. The old time stays visible, struck through. It still counts as remaining in the points table.` : undefined}
      confirmLabel="Postpone"
      confirmVariant="danger"
      loading={pending}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={save}
    >
      <Field label="Reason (shown publicly)" htmlFor="pp-reason" hint={`${reason.length}/200`} error={error}>
        <Textarea id="pp-reason" maxLength={200} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rain on Court B" />
      </Field>
    </ConfirmDialog>
  );
}

export function RescheduleDialog({ fixture, onClose, onDone, onWarnings }: Base & { onWarnings: (w: RpcWarning[]) => void }) {
  const t = useTournament();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!fixture) return;
    const z = utcToZonedInputs(fixture.scheduled_at, t.timezone);
    setDate(z.date);
    setTime(z.time);
    setVenue(fixture.venue ?? '');
    setError(null);
  }, [fixture, t.timezone]);
  async function save() {
    if (!fixture) return;
    setPending(true);
    const r = await rpc<WithWarnings>('reschedule_fixture', {
      p_fixture_id: fixture.id,
      p_scheduled_at: zonedToUtcIso(date, time, t.timezone),
      p_venue: venue.trim() || undefined,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(`M${fixture.match_number} rescheduled.`);
    onWarnings(announceWarnings(r.data.warnings));
    onDone();
    onClose();
  }
  return (
    <ConfirmDialog
      open={!!fixture}
      onOpenChange={(o) => !o && onClose()}
      title="Reschedule fixture"
      description={
        fixture
          ? `${fixtureTitle(fixture)}${fixture.postponed_reason ? `. Postponed: ${fixture.postponed_reason}` : ''}. If the new date is not known yet, leave it postponed.`
          : undefined
      }
      confirmLabel="Reschedule"
      loading={pending}
      confirmDisabled={!date || !time}
      onConfirm={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`New date (${t.timezone})`} htmlFor="rs-date">
          <Input id="rs-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Approximate start" htmlFor="rs-time">
          <Input id="rs-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Venue / court" htmlFor="rs-venue" className="sm:col-span-2">
          <Input id="rs-venue" maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
      </div>
      {fixture?.scheduled_at && (
        <p className="mt-3 text-xs text-muted">Previously: {formatInTournamentTz(fixture.scheduled_at, 'EEE d MMM yyyy, h:mm a', t.timezone)}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function DeleteFixtureDialog({ fixture, onClose, onDone }: Base) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [fixture]);
  const playoff = fixture?.stage === 'playoff';
  const played = !!fixture && (fixture.status === 'live' || fixture.status === 'completed');
  const force = playoff || played;
  async function del() {
    if (!fixture) return;
    setPending(true);
    const r = await rpc<{ deleted?: string; reset?: string }>('delete_fixture', { p_fixture_id: fixture.id, p_force: force });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(r.data.reset ? `M${fixture.match_number} reset to upcoming.` : `M${fixture.match_number} deleted.`);
    onDone();
    onClose();
  }
  return (
    <ConfirmDialog
      open={!!fixture}
      onOpenChange={(o) => !o && onClose()}
      title={playoff ? 'Reset playoff match?' : 'Delete match?'}
      description={
        fixture
          ? playoff
            ? `${fixtureTitle(fixture)} is part of the playoff bracket, so it is not removed: its score and result are cleared and it goes back to upcoming. Teams are filled in again from the standings and earlier results.`
            : `${fixtureTitle(fixture)} will be removed permanently. Match numbers are not changed; use Renumber afterwards if you want no gaps.`
          : undefined
      }
      confirmLabel={playoff ? 'Reset match' : force ? 'Delete anyway' : 'Delete'}
      confirmVariant="danger"
      loading={pending}
      onConfirm={del}
    >
      {played && !playoff && (
        <p className="rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          This match is {fixture?.status === 'live' ? 'being played right now' : 'already played'}. Its score{fixture?.status === 'completed' ? ' and result' : ''} will be deleted and the points table recalculated.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { rpc } from '@/lib/actions/rpc';
import type { FixtureWithTeams } from '@/lib/queries/matches';

function winnerName(f: FixtureWithTeams, home: number, away: number): string {
  if (home > away) return f.home?.name ?? 'Home';
  if (away > home) return f.away?.name ?? 'Away';
  return 'Draw';
}

function ScoreInputs({
  f,
  home,
  away,
  setHome,
  setAway,
}: {
  f: FixtureWithTeams;
  home: string;
  away: string;
  setHome: (v: string) => void;
  setAway: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={f.home?.name ?? 'Home'} htmlFor="score-home">
        <Input id="score-home" type="number" inputMode="numeric" min={0} max={999} value={home} onChange={(e) => setHome(e.target.value)} className="text-center font-display text-3xl" />
      </Field>
      <Field label={f.away?.name ?? 'Away'} htmlFor="score-away">
        <Input id="score-away" type="number" inputMode="numeric" min={0} max={999} value={away} onChange={(e) => setAway(e.target.value)} className="text-center font-display text-3xl" />
      </Field>
    </div>
  );
}

function validScore(v: string): boolean {
  return /^\d{1,3}$/.test(v.trim());
}

/** End match (8.7) or enter a result manually for a fixture that was not scored live. */
export function CompleteMatchDialog({
  open,
  onOpenChange,
  fixture,
  initialHome,
  initialAway,
  allowDraws,
  disabled,
  onDone,
  onStartOvertime,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixture: FixtureWithTeams;
  initialHome: number;
  initialAway: number;
  allowDraws: boolean;
  disabled?: boolean;
  onDone?: () => void;
  onStartOvertime?: () => void;
}) {
  const [home, setHome] = useState(String(initialHome));
  const [away, setAway] = useState(String(initialAway));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setHome(String(initialHome));
      setAway(String(initialAway));
      setNote('');
      setError(null);
    }
  }, [open, initialHome, initialAway]);
  const h = Number(home);
  const a = Number(away);
  const valid = validScore(home) && validScore(away);
  const tieBlocked = valid && h === a && (fixture.stage === 'playoff' || !allowDraws);

  async function confirm() {
    setPending(true);
    setError(null);
    const r = await rpc('complete_match', { p_fixture_id: fixture.id, p_home_score: h, p_away_score: a, p_note: note.trim() || undefined });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(`Final: ${fixture.home?.name} ${h} - ${a} ${fixture.away?.name}`);
    onOpenChange(false);
    onDone?.();
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="End match"
      description="Confirm the final score. The points table and playoff bracket update when the match is completed."
      confirmLabel="Complete match"
      onConfirm={confirm}
      loading={pending}
      confirmDisabled={!valid || tieBlocked || disabled}
    >
      <ScoreInputs f={fixture} home={home} away={away} setHome={setHome} setAway={setAway} />
      <Field label="Note (optional)" htmlFor="complete-note" className="mt-3">
        <Input id="complete-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {valid && !tieBlocked && <p className="mt-3 text-sm text-muted">Winner: <span className="font-semibold text-fg">{winnerName(fixture, h, a)}</span></p>}
      {tieBlocked && (
        <div className="mt-3 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="alert">
          The score is tied and {fixture.stage === 'playoff' ? 'playoff matches cannot end level' : 'draws are not allowed'}. Start overtime instead.
          {onStartOvertime && (
            <button
              type="button"
              className="ml-2 font-semibold text-accent underline"
              onClick={() => {
                onOpenChange(false);
                onStartOvertime();
              }}
            >
              Start overtime
            </button>
          )}
        </div>
      )}
      {disabled && <p className="mt-3 text-sm text-warning">Waiting for pending actions to be saved…</p>}
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function CorrectResultDialog({
  open,
  onOpenChange,
  fixture,
  currentHome,
  currentAway,
  allowDraws,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixture: FixtureWithTeams;
  currentHome: number;
  currentAway: number;
  allowDraws: boolean;
  onDone?: () => void;
}) {
  const [home, setHome] = useState(String(currentHome));
  const [away, setAway] = useState(String(currentAway));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setHome(String(currentHome));
      setAway(String(currentAway));
      setNote('');
      setError(null);
    }
  }, [open, currentHome, currentAway]);
  const h = Number(home);
  const a = Number(away);
  const valid = validScore(home) && validScore(away) && note.trim().length > 0;
  const tieBlocked = validScore(home) && validScore(away) && h === a && (fixture.stage === 'playoff' || !allowDraws);
  const oldWinner = winnerName(fixture, currentHome, currentAway);
  const newWinner = winnerName(fixture, h, a);

  async function confirm() {
    setPending(true);
    setError(null);
    const r = await rpc('correct_match_result', { p_fixture_id: fixture.id, p_home_score: h, p_away_score: a, p_note: note.trim() });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success('Result corrected. Standings recalculated.');
    onOpenChange(false);
    onDone?.();
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Correct result"
      description={`Current result: ${fixture.home?.name} ${currentHome} - ${currentAway} ${fixture.away?.name}.`}
      confirmLabel="Save correction"
      onConfirm={confirm}
      loading={pending}
      confirmDisabled={!valid || tieBlocked}
    >
      <ScoreInputs f={fixture} home={home} away={away} setHome={setHome} setAway={setAway} />
      <Field label="Reason for the correction (required)" htmlFor="correct-note" className="mt-3">
        <Textarea id="correct-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Scorer missed a free throw in Q4" />
      </Field>
      <div className="mt-3 rounded-btn bg-surface-2 px-3 py-2 text-sm">
        <p>
          Winner: <span className="text-muted">{oldWinner}</span> → <span className="font-semibold">{newWinner}</span>
          {oldWinner !== newWinner && <span className="ml-2 text-warning">(winner changes)</span>}
        </p>
        <p className="text-muted">Standings will be recalculated.</p>
      </div>
      {tieBlocked && <p className="mt-2 text-sm text-warning">A tied result is not allowed here.</p>}
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function ReopenMatchDialog({
  open,
  onOpenChange,
  fixture,
  currentHome,
  currentAway,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixture: FixtureWithTeams;
  currentHome: number;
  currentAway: number;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  async function confirm() {
    setPending(true);
    setError(null);
    const r = await rpc('reopen_match', { p_fixture_id: fixture.id, p_reason: reason.trim() });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success('Match reopened. It is live again.');
    onOpenChange(false);
    onDone?.();
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reopen match"
      description="The official result is removed and the match becomes live again with its clocks paused."
      confirmLabel="Reopen match"
      confirmVariant="danger"
      onConfirm={confirm}
      loading={pending}
      confirmDisabled={!reason.trim()}
    >
      <div className="rounded-btn bg-surface-2 px-3 py-2 text-sm">
        <p>
          Winner: <span className="text-muted">{winnerName(fixture, currentHome, currentAway)}</span> → <span className="font-semibold">none (match live)</span>
        </p>
        <p className="text-muted">Standings will be recalculated.</p>
      </div>
      <Field label="Reason (required)" htmlFor="reopen-reason" className="mt-3">
        <Textarea id="reopen-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function ForfeitDialog({
  open,
  onOpenChange,
  fixture,
  forfeitScore,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixture: FixtureWithTeams;
  forfeitScore: number;
  onDone?: () => void;
}) {
  const [winner, setWinner] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setWinner('');
      setReason('');
      setError(null);
    }
  }, [open]);
  async function confirm() {
    setPending(true);
    setError(null);
    const r = await rpc('record_forfeit', { p_fixture_id: fixture.id, p_winner_team_id: winner, p_reason: reason.trim() });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success('Forfeit recorded.');
    onOpenChange(false);
    onDone?.();
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record forfeit"
      description={`The winner is awarded ${forfeitScore}-0. The match counts as played in the standings.`}
      confirmLabel="Record forfeit"
      confirmVariant="danger"
      onConfirm={confirm}
      loading={pending}
      confirmDisabled={!winner || !reason.trim()}
    >
      <Field label="Winner" htmlFor="forfeit-winner">
        <Select id="forfeit-winner" value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="">Choose the team awarded the win</option>
          {fixture.home && <option value={fixture.home.id}>{fixture.home.name}</option>}
          {fixture.away && <option value={fixture.away.id}>{fixture.away.name}</option>}
        </Select>
      </Field>
      <Field label="Reason (required)" htmlFor="forfeit-reason" className="mt-3">
        <Textarea id="forfeit-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

export function AbandonDialog({
  open,
  onOpenChange,
  fixture,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixture: FixtureWithTeams;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  async function confirm() {
    setPending(true);
    setError(null);
    const r = await rpc('abandon_match', { p_fixture_id: fixture.id, p_reason: reason.trim() });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success('Match abandoned and postponed.');
    onOpenChange(false);
    onDone?.();
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Abandon match"
      description="Use this when the wrong match was started or play is called off. The live score is discarded and the fixture becomes postponed. Standings are not affected."
      confirmLabel="Abandon match"
      confirmVariant="danger"
      onConfirm={confirm}
      loading={pending}
      confirmDisabled={!reason.trim()}
    >
      <Field label="Reason (required)" htmlFor="abandon-reason">
        <Textarea id="abandon-reason" maxLength={180} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

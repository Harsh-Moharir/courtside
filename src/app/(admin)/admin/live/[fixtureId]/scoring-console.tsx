'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Keyboard, MoreVertical, Pause, Play, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, StatusChip } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { Scoreboard, deriveStatus, useClocks } from '@/components/scoreboard/scoreboard';
import { useMatch } from '@/components/scoreboard/use-match';
import { eventDetail, eventLine } from '@/components/scoreboard/event-ticker';
import { rpc, requestId } from '@/lib/actions/rpc';
import { teamStyle } from '@/lib/color';
import { breakLabel, formatGameClock, periodLabel, timeoutPool } from '@/lib/domain/clock';
import type { MatchBundle, MatchRules, MatchState, MatchTeam, ScoringEvent } from '@/lib/queries/matches';
import { applyOptimistic, useActionQueue, type Action, type Side } from './queue';
import { AbandonDialog, CompleteMatchDialog, CorrectResultDialog, ReopenMatchDialog } from '../result-dialogs';

const FALLBACK_RULES: MatchRules = {
  tournament_id: '',
  quarters: 4,
  quarter_seconds: 600,
  overtime_seconds: 300,
  shot_clock_seconds: 24,
  shot_clock_short_reset_seconds: 14,
  timeouts_first_half: 2,
  timeouts_second_half: 3,
  timeouts_per_overtime: 1,
  team_foul_bonus_threshold: 5,
  hide_shot_clock_under_game_clock: true,
  created_at: '',
  updated_at: '',
};

const UNDOABLE = new Set(['points', 'foul', 'timeout', 'period_change', 'score_correction']);

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Parses `m:ss`, `m:ss.t` or `ss.t` / `ss` into milliseconds. */
export function parseClockInput(v: string): number | null {
  const s = v.trim();
  let m = /^(\d{1,2}):([0-5]\d)(?:\.(\d))?$/.exec(s);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000 + Number(m[3] ?? 0) * 100;
  m = /^(\d{1,3})(?:\.(\d))?$/.exec(s);
  if (m) return Number(m[1]) * 1000 + Number(m[2] ?? 0) * 100;
  return null;
}

function TimeoutDots({ left, pool }: { left: number; pool: number }) {
  const total = Math.max(pool, left);
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${left} of ${pool} timeouts left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-3 w-3 rounded-full', i < left ? 'bg-[var(--team-visible)]' : 'border border-border')} />
      ))}
    </span>
  );
}

function TeamPanel({
  side,
  team,
  state,
  rules,
  onAction,
  keys,
}: {
  side: Side;
  team: MatchTeam | null;
  state: MatchState;
  rules: MatchRules;
  onAction: (a: Action, label: string) => void;
  keys: [string, string, string];
}) {
  const name = team?.name ?? (side === 'home' ? 'Home' : 'Away');
  const score = side === 'home' ? state.home_score : state.away_score;
  const fouls = side === 'home' ? state.home_fouls : state.away_fouls;
  const oppFouls = side === 'home' ? state.away_fouls : state.home_fouls;
  const left = side === 'home' ? state.home_timeouts_left : state.away_timeouts_left;
  const pool = timeoutPool(rules, state.period);
  const bonus = oppFouls >= rules.team_foul_bonus_threshold;
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      style={teamStyle(team?.primary_color, team?.secondary_color)}
      aria-label={`${name} controls`}
    >
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className="h-10 w-1.5 rounded-full bg-[var(--team-visible)]" aria-hidden />
        <TeamLogo logoPath={team?.logo_path} name={name} shortName={team?.short_name} color={team?.primary_color} size={48} />
        <h2 className="min-w-0 flex-1 truncate font-display text-2xl font-bold uppercase" title={name}>
          {name}
        </h2>
        <span className="tabular font-display text-6xl font-extrabold leading-none" aria-label={`${name} score ${score}`}>
          {score}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {([1, 2, 3] as const).map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => onAction({ kind: 'score', side, points: p }, `${name} +${p}`)}
            className="relative min-h-[64px] rounded-btn border-2 border-[var(--team-visible)] bg-surface-2 font-display text-3xl font-extrabold transition hover:bg-[var(--team-primary)] hover:text-[var(--team-on-primary)] active:scale-[0.97]"
            aria-label={`${name} plus ${p} (key ${keys[i]})`}
          >
            +{p}
            <kbd className="absolute right-1.5 top-1 text-[10px] font-normal text-muted">{keys[i]}</kbd>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-2 text-sm">
          Fouls <span className="tabular font-display text-2xl font-bold">{fouls}</span>
          {bonus && <span className="rounded bg-warning px-1.5 py-px text-[11px] font-extrabold text-black">BONUS</span>}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onAction({ kind: 'foul', side, delta: 1 }, `${name} team foul`)}>
          Foul +
        </Button>
        <Button size="sm" variant="ghost" disabled={fouls <= 0} onClick={() => onAction({ kind: 'foul', side, delta: -1 }, `${name} foul removed`)}>
          Foul −
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TimeoutDots left={left} pool={pool} />
        <Button
          size="sm"
          variant="secondary"
          disabled={left <= 0}
          title={left <= 0 ? 'No timeouts left' : undefined}
          onClick={() => onAction({ kind: 'timeout', side, restore: false }, `${name} timeout`)}
        >
          Timeout ({left})
        </Button>
        <DM.Root>
          <DM.Trigger asChild>
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-btn text-muted hover:bg-surface-2 hover:text-fg" aria-label={`More ${name} timeout actions`}>
              <MoreVertical className="h-4 w-4" />
            </button>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content className="z-50 min-w-[180px] rounded-btn border border-border bg-surface-2 p-1 shadow-xl" sideOffset={4}>
              <DM.Item
                disabled={left >= pool}
                onSelect={() => onAction({ kind: 'timeout', side, restore: true }, `${name} timeout restored`)}
                className="cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface"
              >
                Restore a timeout
              </DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      </div>
    </section>
  );
}

function ClockPanel({
  state,
  rules,
  onAction,
  onAutoPause,
}: {
  state: MatchState;
  rules: MatchRules;
  onAction: (a: Action, label: string) => void;
  onAutoPause: () => void;
}) {
  const clocks = useClocks(state, rules);
  const [confirmReset, setConfirmReset] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const autoPausedFor = useRef<string | null>(null);
  const game = clocks?.game ?? 0;
  const periodLen = (state.period <= rules.quarters ? rules.quarter_seconds : rules.overtime_seconds) * 1000;

  useEffect(() => {
    if (state.clock_running && game === 0 && autoPausedFor.current !== state.clock_updated_at) {
      autoPausedFor.current = state.clock_updated_at;
      onAutoPause();
    }
  }, [state.clock_running, state.clock_updated_at, game, onAutoPause]);

  const running = state.clock_running;
  return (
    <section className="rounded-card border border-border bg-surface p-4" aria-label="Clocks">
      <div className="flex flex-wrap items-end justify-center gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">Game clock</p>
          <p className={cn('tabular font-display text-7xl font-extrabold leading-none', game === 0 ? 'text-danger' : running ? 'text-fg' : 'text-muted')}>
            {clocks?.gameText ?? formatGameClock(state.clock_remaining_ms)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">Shot clock</p>
          <p
            className={cn(
              'tabular font-display text-6xl font-extrabold leading-none',
              clocks?.warn === 'expired' ? 'text-danger' : clocks?.warn === 'flash' ? 'animate-pulse-dot text-warning' : 'text-warning',
            )}
          >
            {clocks?.shotText ?? '—'}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button
          size="lg"
          variant={running ? 'danger' : 'success'}
          className="col-span-2 sm:col-span-1"
          disabled={!running && (state.is_break || game === 0)}
          onClick={() => onAction({ kind: 'clock', action: running ? 'pause' : 'start' }, running ? 'Clock paused' : 'Clock started')}
          aria-keyshortcuts="Space"
        >
          {running ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
          {running ? 'Pause' : 'Start'}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onAction({ kind: 'clock', action: 'shot_reset' }, `Shot clock ${rules.shot_clock_seconds}`)} aria-keyshortcuts="R">
          Shot {rules.shot_clock_seconds}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onAction({ kind: 'clock', action: 'shot_reset_short' }, `Shot clock ${rules.shot_clock_short_reset_seconds}`)} aria-keyshortcuts="T">
          Shot {rules.shot_clock_short_reset_seconds}
        </Button>
        <Button size="lg" variant="ghost" disabled={running} title={running ? 'Pause the clock first' : undefined} onClick={() => setConfirmReset(true)}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset
        </Button>
        <Button
          size="lg"
          variant="ghost"
          disabled={running}
          title={running ? 'Pause the clock first' : undefined}
          onClick={() => {
            setValue(formatGameClock(state.clock_remaining_ms).replace(/^(\d+)\.(\d)$/, '0:$1.$2'));
            setErr(null);
            setSetOpen(true);
          }}
        >
          Set clock
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset clock"
        description={`Set the game clock back to ${formatGameClock(periodLen)} and the shot clock to ${rules.shot_clock_seconds}?`}
        confirmLabel="Reset clock"
        onConfirm={() => {
          onAction({ kind: 'clock', action: 'reset' }, 'Clock reset');
          setConfirmReset(false);
        }}
      />
      <ConfirmDialog
        open={setOpen}
        onOpenChange={setSetOpen}
        title="Set game clock"
        description={`Enter minutes:seconds (for example 4:12 or 0:08.5). Maximum ${formatGameClock(periodLen)}.`}
        confirmLabel="Set clock"
        onConfirm={() => {
          const ms = parseClockInput(value);
          if (ms === null || ms > periodLen) {
            setErr(`Use m:ss between 0:00 and ${formatGameClock(periodLen)}`);
            return;
          }
          onAction({ kind: 'clock', action: 'set', valueMs: ms }, `Clock set to ${formatGameClock(ms)}`);
          setSetOpen(false);
        }}
      >
        <Field label="Game clock" htmlFor="set-clock" error={err}>
          <Input id="set-clock" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="tabular text-center font-display text-3xl" autoFocus />
        </Field>
      </ConfirmDialog>
    </section>
  );
}

function EventLog({ events, quarters }: { events: ScoringEvent[]; quarters: number }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4" aria-label="Event log">
      <h2 className="mb-3 font-display text-xl font-bold uppercase">Event log</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted">No events yet.</p>
      ) : (
        <ol className="scrollbar-thin max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {events.map((e) => (
            <li key={e.id} className={cn('flex gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-surface-2', e.is_voided && 'text-muted line-through')}>
              <span className="tabular w-10 shrink-0 text-right text-xs text-muted">#{e.seq}</span>
              <span className="tabular min-w-0 flex-1">{eventLine(e, quarters)}</span>
              {e.is_voided && <span className="shrink-0 text-xs no-underline">undone</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ShortcutHelp() {
  return (
    <details className="relative">
      <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 rounded-btn border border-border px-3 text-sm font-semibold hover:border-accent">
        <Keyboard className="h-4 w-4" aria-hidden /> Shortcuts
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-card border border-border bg-surface-2 p-4 text-sm shadow-xl">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {[
            ['Z X C', 'Home +1 +2 +3'],
            ['B N M', 'Away +1 +2 +3'],
            ['Space', 'Start or pause clock'],
            ['R', 'Shot clock full reset'],
            ['T', 'Shot clock short reset'],
            ['U', 'Undo last action'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Shortcuts are off while typing in a field.</p>
      </div>
    </details>
  );
}

export function ScoringConsole({ fixtureId, initial, allowDraws }: { fixtureId: string; initial: MatchBundle; allowDraws: boolean }) {
  const router = useRouter();
  const { data, status, refetch, applyState } = useMatch(fixtureId, initial, { eventLimit: 40, includeVoided: true });
  const b = data ?? initial;
  const f = b.fixture;
  const rules = b.rules ?? FALLBACK_RULES;

  const q = useActionQueue({
    fixtureId,
    onState: applyState,
    onRejected: (m) => {
      toast.error(m);
      void refetch();
    },
    onSettled: () => void refetch(),
  });

  const confirmed = b.state;
  const display = useMemo(
    () => (confirmed ? q.queue.reduce((s, item) => applyOptimistic(s, item.action, rules), confirmed) : null),
    [confirmed, q.queue, rules],
  );

  const [dialog, setDialog] = useState<null | 'correct' | 'end' | 'abandon' | 'correct-result' | 'reopen'>(null);
  const [corr, setCorr] = useState({ home: '', away: '', reason: '' });
  const [starting, setStarting] = useState(false);

  const enqueue = q.enqueue;
  const onAction = useCallback((a: Action, label: string) => enqueue(a, label), [enqueue]);
  const onAutoPause = useCallback(() => enqueue({ kind: 'clock', action: 'pause' }, 'Clock paused at 0'), [enqueue]);

  // Undo target: the last pending undoable action, else the latest non-voided undoable event.
  const pendingUndoable = [...q.queue].reverse().find((i) => ['score', 'foul', 'timeout', 'period', 'correct'].includes(i.action.kind));
  const lastEvent = b.events.find((e) => !e.is_voided && UNDOABLE.has(e.event_type));
  const undoLabel = pendingUndoable?.label ?? (lastEvent ? (eventDetail(lastEvent).desc ?? lastEvent.event_type) : null);
  const undo = useCallback(() => {
    if (!undoLabel) return;
    enqueue({ kind: 'undo', expectedSeq: q.queue.length === 0 && lastEvent ? lastEvent.seq : null }, `Undo: ${undoLabel}`);
  }, [enqueue, undoLabel, q.queue.length, lastEvent]);

  // Keyboard shortcuts (8.10), disabled while typing or while a dialog is open.
  const live = f.status === 'live' && !!display;
  const keyState = useRef({ live, display, undo, onAction });
  keyState.current = { live, display, undo, onAction };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = keyState.current;
      if (!k.live || !k.display || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const key = e.key.toLowerCase();
      const home = f.home?.name ?? 'Home';
      const away = f.away?.name ?? 'Away';
      const map: Record<string, () => void> = {
        z: () => k.onAction({ kind: 'score', side: 'home', points: 1 }, `${home} +1`),
        x: () => k.onAction({ kind: 'score', side: 'home', points: 2 }, `${home} +2`),
        c: () => k.onAction({ kind: 'score', side: 'home', points: 3 }, `${home} +3`),
        b: () => k.onAction({ kind: 'score', side: 'away', points: 1 }, `${away} +1`),
        n: () => k.onAction({ kind: 'score', side: 'away', points: 2 }, `${away} +2`),
        m: () => k.onAction({ kind: 'score', side: 'away', points: 3 }, `${away} +3`),
        ' ': () => {
          const running = k.display!.clock_running;
          if (!running && k.display!.is_break) return;
          k.onAction({ kind: 'clock', action: running ? 'pause' : 'start' }, running ? 'Clock paused' : 'Clock started');
        },
        r: () => k.onAction({ kind: 'clock', action: 'shot_reset' }, 'Shot clock reset'),
        t: () => k.onAction({ kind: 'clock', action: 'shot_reset_short' }, 'Shot clock short reset'),
        u: () => k.undo(),
      };
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [f.home?.name, f.away?.name]);

  async function startMatch() {
    setStarting(true);
    const r = await rpc('start_match', { p_fixture_id: f.id, p_client_request_id: requestId() });
    setStarting(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success('Match started');
      void refetch();
    }
  }

  const header = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Link href="/admin/live" className="inline-flex min-h-[40px] items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Matches
      </Link>
      <h1 className="font-display text-3xl font-extrabold uppercase">Match {f.match_number}</h1>
      <StatusChip status={deriveStatus(b)} />
      {f.stage === 'playoff' && <Badge>{b.playoffLabel ?? 'Playoff'}</Badge>}
      <ConnectionIndicator status={status} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {live && <ShortcutHelp />}
        <a
          href={`/matches/${f.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-btn border border-border px-3 text-sm font-semibold hover:border-accent"
        >
          Open public scoreboard <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );

  if (f.status === 'upcoming' || f.status === 'postponed') {
    return (
      <div>
        {header}
        <Scoreboard bundle={b} variant="full" />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={startMatch} loading={starting} disabled={!f.home || !f.away}>
            <Play className="h-5 w-5" aria-hidden /> Start match
          </Button>
          {!f.home || !f.away ? <p className="text-sm text-muted">Both teams must be known before the match can start.</p> : null}
        </div>
      </div>
    );
  }

  if (f.status === 'completed' || !display) {
    const home = b.result?.home_score ?? b.state?.home_score ?? 0;
    const away = b.result?.away_score ?? b.state?.away_score ?? 0;
    return (
      <div>
        {header}
        <Scoreboard bundle={b} variant="full" />
        {b.result?.correction_count ? (
          <p className="mt-3 text-sm text-muted">
            Corrected {b.result.correction_count}×{b.result.correction_note ? `: ${b.result.correction_note}` : ''}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog('correct-result')} disabled={f.status !== 'completed'}>
            Correct result
          </Button>
          <Button
            variant="danger"
            onClick={() => setDialog('reopen')}
            disabled={f.status !== 'completed' || !b.state}
            title={b.state ? undefined : 'Entered without live scoring: correct the result instead'}
          >
            Reopen match
          </Button>
        </div>
        <div className="mt-6">
          <EventLog events={b.events} quarters={rules.quarters} />
        </div>
        <CorrectResultDialog
          open={dialog === 'correct-result'}
          onOpenChange={(o) => setDialog(o ? 'correct-result' : null)}
          fixture={f}
          currentHome={home}
          currentAway={away}
          allowDraws={allowDraws}
          onDone={() => void refetch()}
        />
        <ReopenMatchDialog
          open={dialog === 'reopen'}
          onOpenChange={(o) => setDialog(o ? 'reopen' : null)}
          fixture={f}
          currentHome={home}
          currentAway={away}
          onDone={() => void refetch()}
        />
      </div>
    );
  }

  const s = display;
  const tied = s.home_score === s.away_score;
  const regulationOver = s.period >= rules.quarters;
  const periodText = s.is_break ? breakLabel(rules.quarters, s.period) : periodLabel(rules.quarters, s.period);
  const nextLabel = regulationOver ? 'Start overtime' : `Start ${periodLabel(rules.quarters, s.period + 1)}`;

  return (
    <div className="pb-10">
      {header}

      {q.blocked ? (
        <div role="alert" className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-card border border-danger bg-danger/20 px-4 py-3">
          <span className="font-semibold">
            Not saved: {q.queue.length} action{q.queue.length === 1 ? '' : 's'} pending
          </span>
          <span className="text-sm text-muted">Check the connection. You can keep scoring; actions are kept in order.</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={q.retry}>
              Retry
            </Button>
            <Button size="sm" variant="secondary" onClick={q.discard}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        q.queue.length > 0 && (
          <p className="mb-2 text-right text-xs text-muted" role="status">
            Saving {q.queue.length}…
          </p>
        )
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TeamPanel side="home" team={f.home} state={s} rules={rules} onAction={onAction} keys={['Z', 'X', 'C']} />
        <TeamPanel side="away" team={f.away} state={s} rules={rules} onAction={onAction} keys={['B', 'N', 'M']} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ClockPanel state={s} rules={rules} onAction={onAction} onAutoPause={onAutoPause} />
        <section className="flex flex-col rounded-card border border-border bg-surface p-4" aria-label="Period">
          <p className="text-xs uppercase tracking-wide text-muted">Period</p>
          <p className="font-display text-5xl font-extrabold uppercase text-accent">{periodText}</p>
          <div className="mt-auto grid gap-2 pt-4">
            <Button size="lg" variant="secondary" disabled={s.is_break} onClick={() => onAction({ kind: 'period', action: 'end_period' }, `End of ${periodLabel(rules.quarters, s.period)}`)}>
              End period
            </Button>
            <Button
              size="lg"
              disabled={!s.is_break || (regulationOver && !tied)}
              onClick={() => onAction({ kind: 'period', action: 'start_next_period' }, nextLabel)}
            >
              {nextLabel}
            </Button>
            {s.is_break && regulationOver && !tied && <p className="text-xs text-muted">Not tied: end the match instead.</p>}
          </div>
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 rounded-card border border-border bg-surface p-3">
        <Button variant="secondary" size="lg" disabled={!undoLabel} onClick={undo} aria-keyshortcuts="U" className="min-w-0 max-w-full">
          <Undo2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}</span>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            setCorr({ home: String(s.home_score), away: String(s.away_score), reason: '' });
            setDialog('correct');
          }}
        >
          Correct score
        </Button>
        <Button variant="ghost" size="lg" onClick={() => setDialog('abandon')}>
          Abandon
        </Button>
        <Button variant="danger" size="lg" className="ml-auto" onClick={() => setDialog('end')}>
          End match
        </Button>
      </div>

      <div className="mt-4">
        <EventLog events={b.events} quarters={rules.quarters} />
      </div>

      <ConfirmDialog
        open={dialog === 'correct'}
        onOpenChange={(o) => setDialog(o ? 'correct' : null)}
        title="Correct score"
        description="Sets both live scores. This is recorded in the event log and can be undone."
        confirmLabel="Correct score"
        confirmDisabled={!/^\d{1,3}$/.test(corr.home) || !/^\d{1,3}$/.test(corr.away) || !corr.reason.trim()}
        onConfirm={() => {
          onAction(
            { kind: 'correct', home: Number(corr.home), away: Number(corr.away), reason: corr.reason.trim() },
            `Score corrected to ${corr.home}-${corr.away}`,
          );
          setDialog(null);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.home?.name ?? 'Home'} htmlFor="corr-home">
            <Input id="corr-home" type="number" min={0} max={999} value={corr.home} onChange={(e) => setCorr({ ...corr, home: e.target.value })} className="text-center font-display text-3xl" />
          </Field>
          <Field label={f.away?.name ?? 'Away'} htmlFor="corr-away">
            <Input id="corr-away" type="number" min={0} max={999} value={corr.away} onChange={(e) => setCorr({ ...corr, away: e.target.value })} className="text-center font-display text-3xl" />
          </Field>
        </div>
        <Field label="Reason (required)" htmlFor="corr-reason" className="mt-3">
          <Textarea id="corr-reason" maxLength={200} value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} />
        </Field>
      </ConfirmDialog>

      <CompleteMatchDialog
        open={dialog === 'end'}
        onOpenChange={(o) => setDialog(o ? 'end' : null)}
        fixture={f}
        initialHome={s.home_score}
        initialAway={s.away_score}
        allowDraws={allowDraws}
        disabled={q.queue.length > 0}
        onDone={() => {
          void refetch();
          router.refresh();
        }}
        onStartOvertime={
          regulationOver
            ? () => {
                if (!s.is_break) onAction({ kind: 'period', action: 'end_period' }, `End of ${periodLabel(rules.quarters, s.period)}`);
                onAction({ kind: 'period', action: 'start_next_period' }, 'Start overtime');
              }
            : undefined
        }
      />
      <AbandonDialog open={dialog === 'abandon'} onOpenChange={(o) => setDialog(o ? 'abandon' : null)} fixture={f} onDone={() => router.push('/admin/live')} />
    </div>
  );
}

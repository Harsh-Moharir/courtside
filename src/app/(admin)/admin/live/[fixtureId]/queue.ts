'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, requestId } from '@/lib/actions/rpc';
import { effectiveMs } from '@/lib/domain/clock';
import { serverNow } from '@/lib/realtime/server-clock';
import type { Result } from '@/lib/result';
import type { MatchRules, MatchState } from '@/lib/queries/matches';

export type Side = 'home' | 'away';
export type ClockAction = 'start' | 'pause' | 'reset' | 'set' | 'shot_reset' | 'shot_reset_short' | 'shot_set';

export type Action =
  | { kind: 'score'; side: Side; points: 1 | 2 | 3 }
  | { kind: 'foul'; side: Side; delta: 1 | -1 }
  | { kind: 'timeout'; side: Side; restore: boolean }
  | { kind: 'clock'; action: ClockAction; valueMs?: number }
  | { kind: 'period'; action: 'end_period' | 'start_next_period' }
  | { kind: 'correct'; home: number; away: number; reason: string }
  | { kind: 'undo'; expectedSeq: number | null };

export interface QueueItem {
  id: string;
  action: Action;
  label: string;
}

interface Payload {
  state: MatchState | null;
}

type Rules = Pick<MatchRules, 'quarters' | 'quarter_seconds' | 'overtime_seconds' | 'shot_clock_seconds' | 'shot_clock_short_reset_seconds' | 'timeouts_first_half' | 'timeouts_second_half' | 'timeouts_per_overtime'>;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function fold(s: MatchState, now: number): MatchState {
  const g = effectiveMs({ remainingMs: s.clock_remaining_ms, running: s.clock_running, updatedAt: s.clock_updated_at }, now);
  const sh = effectiveMs({ remainingMs: s.shot_clock_remaining_ms, running: s.shot_clock_running, updatedAt: s.shot_clock_updated_at }, now);
  return { ...s, clock_remaining_ms: g, clock_running: false, clock_updated_at: iso(now), shot_clock_remaining_ms: sh, shot_clock_running: false, shot_clock_updated_at: iso(now) };
}

function setLastPeriodTotals(s: MatchState, home: number, away: number): MatchState['period_scores'] {
  const ps = Array.isArray(s.period_scores) ? [...(s.period_scores as { period: number; home_total: number; away_total: number }[])] : [];
  if (!s.is_break || ps.length === 0) return s.period_scores;
  const last = ps[ps.length - 1]!;
  ps[ps.length - 1] = { ...last, home_total: home, away_total: away };
  return ps;
}

/** Mirrors the server effect of an action so the console updates instantly (8.10). The server response replaces it. */
export function applyOptimistic(s: MatchState, a: Action, rules: Rules): MatchState {
  const now = serverNow();
  const periodLen = (p: number) => (p <= rules.quarters ? rules.quarter_seconds : rules.overtime_seconds) * 1000;
  switch (a.kind) {
    case 'score': {
      const home = s.home_score + (a.side === 'home' ? a.points : 0);
      const away = s.away_score + (a.side === 'away' ? a.points : 0);
      return { ...s, home_score: home, away_score: away, period_scores: setLastPeriodTotals(s, home, away) };
    }
    case 'foul':
      return a.side === 'home' ? { ...s, home_fouls: Math.max(0, s.home_fouls + a.delta) } : { ...s, away_fouls: Math.max(0, s.away_fouls + a.delta) };
    case 'timeout': {
      const key = a.side === 'home' ? 'home_timeouts_left' : 'away_timeouts_left';
      if (a.restore) return { ...s, [key]: s[key] + 1 };
      return { ...fold(s, now), [key]: Math.max(0, s[key] - 1) };
    }
    case 'clock': {
      const f = fold(s, now);
      switch (a.action) {
        case 'start':
          if (s.clock_running || s.is_break || f.clock_remaining_ms <= 0) return s;
          return { ...f, clock_running: true, shot_clock_running: f.shot_clock_remaining_ms > 0 };
        case 'pause':
          return f;
        case 'reset':
          return { ...f, clock_remaining_ms: periodLen(s.period), shot_clock_remaining_ms: rules.shot_clock_seconds * 1000 };
        case 'set':
          return { ...f, clock_remaining_ms: a.valueMs ?? f.clock_remaining_ms };
        case 'shot_reset':
        case 'shot_reset_short':
        case 'shot_set': {
          const v = a.action === 'shot_reset' ? rules.shot_clock_seconds * 1000 : a.action === 'shot_reset_short' ? rules.shot_clock_short_reset_seconds * 1000 : (a.valueMs ?? 0);
          const running = s.clock_running && f.clock_remaining_ms > 0 && v > 0;
          return {
            ...s,
            clock_remaining_ms: f.clock_remaining_ms,
            clock_updated_at: iso(now),
            shot_clock_remaining_ms: v,
            shot_clock_running: running,
            shot_clock_updated_at: iso(now),
          };
        }
      }
      return s;
    }
    case 'period': {
      const f = fold(s, now);
      if (a.action === 'end_period') {
        if (s.is_break) return s;
        const ps = Array.isArray(s.period_scores) ? (s.period_scores as unknown[]) : [];
        return { ...f, is_break: true, clock_remaining_ms: 0, period_scores: [...ps, { period: s.period, home_total: s.home_score, away_total: s.away_score }] as MatchState['period_scores'] };
      }
      if (!s.is_break) return s;
      const next = s.period + 1;
      const half = Math.floor(rules.quarters / 2);
      const pool = next > rules.quarters ? rules.timeouts_per_overtime : next === half + 1 ? rules.timeouts_second_half : null;
      return {
        ...f,
        period: next,
        is_break: false,
        clock_remaining_ms: periodLen(next),
        shot_clock_remaining_ms: rules.shot_clock_seconds * 1000,
        home_fouls: next <= rules.quarters ? 0 : s.home_fouls,
        away_fouls: next <= rules.quarters ? 0 : s.away_fouls,
        home_timeouts_left: pool ?? s.home_timeouts_left,
        away_timeouts_left: pool ?? s.away_timeouts_left,
      };
    }
    case 'correct':
      return { ...s, home_score: a.home, away_score: a.away, period_scores: setLastPeriodTotals(s, a.home, a.away) };
    case 'undo':
      return s; // pessimistic: the server decides what is undone
  }
}

function send(fixtureId: string, item: QueueItem): Promise<Result<Payload>> {
  const a = item.action;
  const crid = item.id;
  switch (a.kind) {
    case 'score':
      return rpc('score_points', { p_fixture_id: fixtureId, p_side: a.side, p_points: a.points, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'foul':
      return rpc('add_foul', { p_fixture_id: fixtureId, p_side: a.side, p_delta: a.delta, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'timeout':
      return rpc('record_timeout', { p_fixture_id: fixtureId, p_side: a.side, p_restore: a.restore, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'clock':
      return rpc('clock_control', { p_fixture_id: fixtureId, p_action: a.action, p_value_ms: a.valueMs, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'period':
      return rpc('change_period', { p_fixture_id: fixtureId, p_action: a.action, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'correct':
      return rpc('correct_score', { p_fixture_id: fixtureId, p_home: a.home, p_away: a.away, p_reason: a.reason, p_client_request_id: crid }) as Promise<Result<Payload>>;
    case 'undo':
      return rpc('undo_last_event', { p_fixture_id: fixtureId, p_expected_seq: a.expectedSeq ?? undefined }) as Promise<Result<Payload>>;
  }
}

/**
 * One strictly ordered in-memory queue per fixture (8.10). Network failures (and expired sessions) stop the queue
 * and keep every action; server rejections drop just that action.
 */
export function useActionQueue(opts: {
  fixtureId: string;
  onState: (s: MatchState | null | undefined) => void;
  onRejected: (message: string) => void;
  onSettled: () => void;
}) {
  const queueRef = useRef<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const busy = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const sync = () => setQueue([...queueRef.current]);

  const pump = useCallback(async () => {
    if (busy.current || blockedRef.current) return;
    busy.current = true;
    try {
      while (queueRef.current.length > 0 && !blockedRef.current) {
        const item = queueRef.current[0]!;
        const res = await send(optsRef.current.fixtureId, item);
        if (res.ok) {
          optsRef.current.onState(res.data?.state);
          queueRef.current.shift();
          sync();
        } else if (res.code === 'NETWORK' || res.code === 'NOT_AUTHORIZED') {
          blockedRef.current = true;
          setBlocked(true);
        } else {
          queueRef.current.shift();
          sync();
          optsRef.current.onRejected(res.message);
        }
      }
    } finally {
      busy.current = false;
      if (queueRef.current.length === 0) optsRef.current.onSettled();
    }
  }, []);

  const enqueue = useCallback(
    (action: Action, label: string) => {
      queueRef.current.push({ id: requestId(), action, label });
      sync();
      void pump();
    },
    [pump],
  );

  const retry = useCallback(() => {
    blockedRef.current = false;
    setBlocked(false);
    void pump();
  }, [pump]);

  const discard = useCallback(() => {
    queueRef.current = [];
    blockedRef.current = false;
    setBlocked(false);
    sync();
    optsRef.current.onSettled();
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (queueRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return { queue, blocked, enqueue, retry, discard };
}

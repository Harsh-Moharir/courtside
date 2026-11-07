'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { PlayerAvatar, TeamLogo } from '@/components/ui/media';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { teamStyle } from '@/lib/color';
import { formatMoney, POSITION_LABELS } from '@/lib/format';
import { publicUrl } from '@/lib/storage';
import { measureOffset, serverNow } from '@/lib/realtime/server-clock';
import type { AuctionEvent, AuctionSnapshot, AuctionTeam, LotView } from '@/lib/queries/auction';
import { useAuctionSnapshot } from './use-auction';

const OVERLAY_MS = 6000;
const FRESH_MS = 10000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Animates a number up to its target in about 400 ms. */
function useCountUp(target: number, durationMs = 400): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      fromRef.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);
  return value;
}

interface Overlay {
  kind: 'sold' | 'unsold';
  event: AuctionEvent;
  lot: LotView['lot'] | null;
  until: number;
}

function Stamp({ overlay, team, symbol }: { overlay: Overlay; team: AuctionTeam | undefined; symbol: string }) {
  const sold = overlay.kind === 'sold';
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/95 backdrop-blur-md" role="status" aria-live="assertive">
      <div className="flex flex-col items-center gap-[2vh] text-center" style={team ? teamStyle(team.primary_color, team.secondary_color) : undefined}>
        {overlay.lot && <PlayerAvatar photoPath={overlay.lot.player_photo_path} name={overlay.lot.player_name} size={160} className="!h-[20vh] !w-[20vh]" />}
        <p className="font-display font-extrabold uppercase leading-none" style={{ fontSize: 'clamp(28px, 5vh, 96px)' }}>
          {overlay.lot?.player_name ?? ''}
        </p>
        <div
          className={cn(
            'animate-stamp rounded-[2vh] border-[1vh] px-[4vh] py-[1vh] font-display font-black uppercase tracking-wider',
            sold ? 'border-success text-success' : 'border-danger text-danger',
          )}
          style={{ fontSize: 'clamp(64px, 16vh, 320px)', lineHeight: 1 }}
        >
          {sold ? 'Sold' : 'Unsold'}
        </div>
        {sold && team && (
          <div className="flex items-center gap-[2vh]">
            <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={96} className="!h-[10vh] !w-[10vh]" />
            <div className="text-left">
              <p className="font-display font-extrabold uppercase text-team" style={{ fontSize: 'clamp(28px, 5vh, 96px)', lineHeight: 1 }}>
                {team.name}
              </p>
              <p className="font-display font-extrabold tabular" style={{ fontSize: 'clamp(28px, 6vh, 120px)', lineHeight: 1 }}>
                {formatMoney(overlay.event.amount, symbol)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DisplayScreen({ initial }: { initial: AuctionSnapshot }) {
  const t = useTournament();
  const { data, status } = useAuctionSnapshot(initial, { pollMs: 3000, events: 30, key: 'auction-display' });
  const s = data ?? initial;
  const live = s.live;
  const lot = live?.lot ?? null;
  const leader = s.teams.find((x) => x.id === lot?.leading_team_id);
  const amount = useCountUp(lot ? (lot.current_bid ?? lot.base_price) : 0);
  const symbol = t.currency_symbol;

  // --- SOLD / UNSOLD overlays: only for events that are fresh (< 10 s old) when they arrive ---
  const seen = useRef<Set<string>>(new Set(initial.events.map((e) => e.id)));
  const lotCache = useRef<Map<string, LotView['lot']>>(new Map());
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  useEffect(() => {
    void measureOffset();
  }, []);
  useEffect(() => {
    if (lot) lotCache.current.set(lot.id, lot);
  }, [lot]);
  useEffect(() => {
    const now = serverNow();
    for (const e of [...s.events].reverse()) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if ((e.event_type === 'sold' || e.event_type === 'unsold') && now - new Date(e.created_at).getTime() < FRESH_MS) {
        setOverlay({ kind: e.event_type, event: e, lot: (e.lot_id && lotCache.current.get(e.lot_id)) || null, until: Date.now() + OVERLAY_MS });
      }
    }
  }, [s.events]);
  // First load: replay an overlay only if the latest result is that recent.
  useEffect(() => {
    const now = serverNow();
    const e = initial.events.find((x) => x.event_type === 'sold' || x.event_type === 'unsold');
    if (e && now - new Date(e.created_at).getTime() < FRESH_MS) {
      setOverlay({ kind: e.event_type as 'sold' | 'unsold', event: e, lot: null, until: Date.now() + OVERLAY_MS });
    }
  }, [initial.events]);
  useEffect(() => {
    if (!overlay) return;
    const id = setTimeout(() => setOverlay(null), Math.max(0, overlay.until - Date.now()));
    return () => clearTimeout(id);
  }, [overlay]);
  // Fill in the player photo/name for an overlay whose lot was not cached (e.g. opened before page load).
  useEffect(() => {
    if (!overlay || overlay.lot || !overlay.event.lot_id) return;
    let cancelled = false;
    void import('@/lib/supabase/browser').then(async ({ getBrowserClient }) => {
      const { data: l } = await getBrowserClient().from('auction_lots').select('*').eq('id', overlay.event.lot_id as string).maybeSingle();
      if (!cancelled && l) setOverlay((o) => (o && o.event.id === overlay.event.id ? { ...o, lot: l } : o));
    });
    return () => {
      cancelled = true;
    };
  }, [overlay]);

  // --- Fullscreen, cursor hiding, wake lock ---
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      setActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(false), 3000);
    };
    bump();
    window.addEventListener('mousemove', bump);
    window.addEventListener('touchstart', bump);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') void toggleFs();
    };
    window.addEventListener('keydown', onKey);
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('touchstart', bump);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
    let lock: WakeLock | null = null;
    const acquire = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {
        /* not supported or denied */
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  async function toggleFs() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await (rootRef.current ?? document.documentElement).requestFullscreen();
    } catch {
      /* iOS Safari: works as a plain full-window page */
    }
  }

  const results = useMemo(() => s.events.filter((e) => e.event_type === 'sold' || e.event_type === 'unsold').slice(0, 5), [s.events]);
  const lastResult = results[0];
  const paused = s.state?.status === 'paused' && !s.state.between_rounds;
  const maxPurse = Math.max(1, ...s.teams.map((x) => x.purse_total));
  const logo = publicUrl('tournament-assets', t.logo_path);

  return (
    <div
      ref={rootRef}
      className={cn('relative flex h-[100dvh] w-full flex-col overflow-hidden bg-bg text-fg', !active && 'cursor-none')}
      style={{ fontSize: 'clamp(16px, 2.2vh, 48px)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: leader
            ? `radial-gradient(ellipse at 75% 40%, ${leader.primary_color}55, transparent 60%), radial-gradient(ellipse at 10% 100%, #f9731622, transparent 50%)`
            : 'radial-gradient(ellipse at 70% 30%, #f9731630, transparent 60%)',
          transition: 'background 600ms',
        }}
        aria-hidden
      />

      {/* Header */}
      <header className="relative z-10 flex items-center gap-[1.5vh] px-[3vw] pt-[2.5vh]">
        {logo ? (
          <img src={logo} alt="" className="h-[6vh] w-[6vh] rounded-full object-contain" />
        ) : (
          <span className="flex h-[6vh] w-[6vh] items-center justify-center rounded-full bg-accent text-[3vh]" aria-hidden>
            🏀
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display font-extrabold uppercase leading-none" style={{ fontSize: 'clamp(20px, 3.6vh, 72px)' }}>
            {t.name}
          </p>
          <p className="uppercase tracking-[0.2em] text-muted" style={{ fontSize: 'clamp(12px, 1.6vh, 32px)' }}>
            Player auction{s.state && s.state.current_round > 0 ? ` · Round ${s.state.current_round}` : ''}
            {lot ? ` · Lot ${lot.lot_number}` : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-[1.5vh]">
          <ConnectionIndicator status={status} className="opacity-60" />
          <button
            type="button"
            onClick={() => void toggleFs()}
            className={cn('rounded-btn border border-border bg-surface/80 p-[1vh] transition-opacity', active ? 'opacity-100' : 'pointer-events-none opacity-0')}
            aria-label={isFs ? 'Exit full screen' : 'Full screen'}
            title="Full screen (F)"
          >
            {isFs ? <Minimize className="h-[3vh] w-[3vh]" /> : <Maximize className="h-[3vh] w-[3vh]" />}
          </button>
        </div>
      </header>

      {/* Stage */}
      <section className="relative z-10 flex min-h-0 flex-1 items-center px-[3vw] py-[2vh]" aria-live="polite">
        {lot ? (
          <div className="grid h-full w-full grid-cols-[auto,1fr] items-center gap-[4vw]">
            <div className="flex h-full max-h-[58vh] items-center">
              <PlayerAvatar
                photoPath={lot.player_photo_path}
                name={lot.player_name}
                size={480}
                rounded="card"
                className="!h-[min(58vh,34vw)] !w-[min(48vh,28vw)] shadow-2xl"
              />
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-[2.5vh]">
              <div>
                <h1 className="font-display font-black uppercase leading-[0.9] [overflow-wrap:anywhere]" style={{ fontSize: 'clamp(40px, 9vh, 200px)' }}>
                  {lot.player_name}
                </h1>
                <div className="mt-[1.5vh] flex flex-wrap items-center gap-[1.2vh]" style={{ fontSize: 'clamp(16px, 2.6vh, 56px)' }}>
                  {lot.primary_position && (
                    <span className="rounded-[1vh] bg-accent px-[1.2vh] font-display font-bold text-accent-contrast">
                      {lot.primary_position} · {POSITION_LABELS[lot.primary_position]}
                    </span>
                  )}
                  {lot.secondary_position && (
                    <span className="rounded-[1vh] border border-border px-[1.2vh] font-display font-bold text-muted">
                      {lot.secondary_position} · {POSITION_LABELS[lot.secondary_position]}
                    </span>
                  )}
                  {live?.player?.jersey_number != null && <span className="font-display text-muted">#{live.player.jersey_number}</span>}
                  {lot.current_bid !== null && <span className="text-muted">Base {formatMoney(lot.base_price, symbol)}</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 items-stretch gap-[2vw] xl:grid-cols-[1fr,1fr]">
                <div>
                  <p className="font-semibold uppercase tracking-[0.25em] text-muted" style={{ fontSize: 'clamp(14px, 2.2vh, 44px)' }}>
                    {lot.current_bid === null ? 'Base price' : 'Current bid'}
                  </p>
                  <p className="font-display font-black leading-none text-accent tabular" style={{ fontSize: 'clamp(56px, 14vh, 320px)' }}>
                    {formatMoney(amount, symbol)}
                  </p>
                  <p className="text-muted" style={{ fontSize: 'clamp(14px, 2vh, 40px)' }}>
                    {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div
                  className="flex items-center gap-[2vh] rounded-[2vh] border p-[2vh]"
                  style={
                    leader
                      ? { ...teamStyle(leader.primary_color, leader.secondary_color), background: `linear-gradient(135deg, ${leader.primary_color}cc, #141414 85%)`, borderColor: 'var(--team-visible)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface)' }
                  }
                >
                  {leader ? (
                    <>
                      <TeamLogo logoPath={leader.logo_path} name={leader.name} shortName={leader.short_name} color={leader.primary_color} size={160} className="!h-[14vh] !w-[14vh] bg-black/30" />
                      <div className="min-w-0">
                        <p className="uppercase tracking-[0.25em] text-white/80" style={{ fontSize: 'clamp(12px, 1.8vh, 36px)' }}>
                          Leading
                        </p>
                        <p className="font-display font-black uppercase leading-none text-white [overflow-wrap:anywhere]" style={{ fontSize: 'clamp(28px, 6vh, 140px)', textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
                          {leader.name}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="font-display uppercase text-muted" style={{ fontSize: 'clamp(20px, 4vh, 90px)' }}>
                      Waiting for the first bid
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-[3vh] text-center">
            {s.state?.status === 'completed' ? (
              <p className="font-display font-black uppercase" style={{ fontSize: 'clamp(48px, 12vh, 260px)' }}>
                Auction complete
              </p>
            ) : s.state?.status === 'not_started' || !s.state ? (
              <>
                <p className="font-display font-black uppercase" style={{ fontSize: 'clamp(48px, 11vh, 240px)' }}>
                  The auction starts soon
                </p>
                <p className="text-muted">{s.poolCount} players in the pool</p>
              </>
            ) : (
              <>
                {lastResult && (
                  <div className="rounded-[2vh] border border-border bg-surface/80 px-[4vh] py-[2vh]">
                    <p className="uppercase tracking-[0.25em] text-muted" style={{ fontSize: 'clamp(12px, 1.8vh, 36px)' }}>
                      Last result
                    </p>
                    <p className="font-display font-bold" style={{ fontSize: 'clamp(24px, 4.5vh, 100px)' }}>
                      {lastResult.message}
                    </p>
                  </div>
                )}
                <p className="font-display font-black uppercase text-accent" style={{ fontSize: 'clamp(40px, 10vh, 220px)' }}>
                  {s.state.between_rounds ? `Round ${s.state.current_round} complete` : 'Next player coming up'}
                </p>
                <p className="text-muted">{s.poolCount} players left in the pool</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* Bottom strip: last 5 results + purse bars */}
      <footer className="relative z-10 grid grid-cols-[minmax(0,1fr),minmax(0,1.2fr)] gap-[2vw] border-t border-border bg-black/60 px-[3vw] py-[1.8vh]" style={{ fontSize: 'clamp(12px, 1.7vh, 34px)' }}>
        <div className="min-w-0">
          <p className="mb-[0.6vh] uppercase tracking-[0.2em] text-muted">Latest results</p>
          {results.length === 0 ? (
            <p className="text-muted">No results yet</p>
          ) : (
            <ul className="space-y-[0.3vh]">
              {results.map((e) => (
                <li key={e.id} className="flex items-center gap-[1vh] truncate">
                  <span className={cn('h-[1vh] w-[1vh] shrink-0 rounded-full', e.event_type === 'sold' ? 'bg-success' : 'bg-danger')} aria-hidden />
                  <span className="truncate">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <p className="mb-[0.6vh] uppercase tracking-[0.2em] text-muted">Purse remaining</p>
          <ul className="grid grid-cols-2 gap-x-[2vw] gap-y-[0.6vh]">
            {s.teams.map((tm) => (
              <li key={tm.id} className="flex items-center gap-[1vh]" style={teamStyle(tm.primary_color, tm.secondary_color)}>
                <span className="w-[4.5em] shrink-0 truncate font-display font-bold">{tm.short_name}</span>
                <span className="h-[1vh] flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full" style={{ width: `${(Math.max(0, tm.purse_remaining) / maxPurse) * 100}%`, background: 'var(--team-visible)' }} />
                </span>
                <span className="w-[6.5em] shrink-0 text-right tabular">{formatMoney(tm.purse_remaining, symbol)}</span>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {paused && !overlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="status">
          <p className="rounded-[2vh] border-[0.8vh] border-warning px-[5vh] py-[1vh] font-display font-black uppercase tracking-widest text-warning" style={{ fontSize: 'clamp(56px, 14vh, 300px)' }}>
            Paused
          </p>
        </div>
      )}
      {overlay && <Stamp overlay={overlay} team={s.teams.find((x) => x.id === overlay.event.team_id)} symbol={symbol} />}
    </div>
  );
}

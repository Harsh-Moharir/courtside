'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { AlertTriangle, CheckCircle2, Keyboard, MoreVertical, Pause, Play, RefreshCw, Search, Shuffle, Undo2, WifiOff, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { Money, useMoney } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { requestId } from '@/lib/actions/rpc';
import { bidAfterSteps, minimumNextBid, stepFor } from '@/lib/domain/money';
import { teamStyle } from '@/lib/color';
import { POSITIONS, type Position } from '@/lib/format';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { fetchPlayersByStatus, type AuctionSnapshot, type AuctionTeam, type UnsoldPlayer } from '@/lib/queries/auction';
import { LotStage } from '../lot-stage';
import { PlayerList } from '../player-list';
import { useAuctionActions, type LotResult, type Warnings } from './use-admin-auction';

type Disabled = { disabled: boolean; reason: string | null };

function teamBidState(t: AuctionTeam, leaderId: string | null, minNext: number): Disabled {
  if (t.id === leaderId) return { disabled: true, reason: 'Leading' };
  if (t.squad_count >= t.max_squad_size) return { disabled: true, reason: 'Squad full' };
  if (t.max_bid < minNext) return { disabled: true, reason: 'Cannot afford the minimum bid' };
  return { disabled: false, reason: null };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function AuctionConsole({
  snap,
  setData,
  refetch,
  iconCounts,
}: {
  snap: AuctionSnapshot;
  setData: (fn: (prev: AuctionSnapshot | undefined) => AuctionSnapshot | undefined) => void;
  refetch: () => Promise<void>;
  iconCounts: Record<string, number>;
}) {
  const money = useMoney();
  const { pending, run, retry, clearRetry } = useAuctionActions(setData, refetch);
  const state = snap.state;
  const status = state?.status ?? 'not_started';
  const lot = snap.live?.lot ?? null;
  const teams = snap.teams;
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [soldOpen, setSoldOpen] = useState(false);
  const [unsoldOpen, setUnsoldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [iconsConfirm, setIconsConfirm] = useState<{ name: string; icons: number }[] | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [endRoundOpen, setEndRoundOpen] = useState(false);
  const [warnings, setWarnings] = useState<Warnings | null>(null);

  const minNext = lot ? minimumNextBid(lot.base_price, lot.current_bid, snap.tiers) : 0;
  const step = lot && lot.current_bid !== null ? stepFor(snap.tiers, lot.current_bid) : null;
  const leader = teams.find((t) => t.id === lot?.leading_team_id) ?? null;
  const teamStates = useMemo(
    () => new Map(teams.map((t) => [t.id, teamBidState(t, lot?.leading_team_id ?? null, minNext)])),
    [teams, lot?.leading_team_id, minNext],
  );
  const eligible = teams.filter((t) => !teamStates.get(t.id)?.disabled);
  const selectedTeam = teams.find((t) => t.id === selected) ?? null;
  const selectedOk = !!selectedTeam && !teamStates.get(selectedTeam.id)?.disabled;

  // Drop the selection when it becomes invalid (e.g. after it took the lead) or the lot changes.
  useEffect(() => {
    if (selected && teamStates.get(selected)?.disabled) setSelected(null);
  }, [teamStates, selected]);
  useEffect(() => {
    setSelected(null);
    setCustom('');
  }, [lot?.id]);

  // Warnings (teams below minimum squad etc.) stay visible after completion.
  const loadWarnings = useCallback(async () => {
    const { data } = await getBrowserClient().rpc('auction_warnings');
    if (data) setWarnings(data as unknown as Warnings);
  }, []);
  useEffect(() => {
    if (status === 'completed' || state?.between_rounds) void loadWarnings();
  }, [status, state?.between_rounds, state?.updated_at, loadWarnings]);

  async function bid(amount: number) {
    if (!lot || !selectedTeam) return;
    const res = await run('bid', 'place_bid', {
      p_lot_id: lot.id,
      p_team_id: selectedTeam.id,
      p_amount: amount,
      p_expected_current_bid: lot.current_bid as number,
      p_client_request_id: requestId(),
    });
    if (res.ok) setCustom('');
    if (!res.ok && res.code === 'BID_STALE') {
      // message already shown: "The bid changed: check the new price."
    }
  }

  async function startRound(force: boolean) {
    const res = await run('start', 'start_auction_round', { p_force: force }, { success: 'Round 1 started', silent: true });
    if (!res.ok) {
      if (res.code === 'ICONS_INCOMPLETE') {
        const list = (res.detail?.teams as { name: string; icons: number }[] | undefined) ?? [];
        setIconsConfirm(list);
      } else {
        const { toast } = await import('sonner');
        toast.error(res.message);
      }
    } else setIconsConfirm(null);
  }

  // Keyboard shortcuts (disabled while typing or while a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (soldOpen || unsoldOpen || cancelOpen || completeOpen || endRoundOpen || iconsConfirm) return;
      if (!lot || status !== 'live') return;
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(k)) {
        const idx = k === '0' ? 9 : Number(k) - 1;
        const t = teams[idx];
        if (t && !teamStates.get(t.id)?.disabled) {
          setSelected(t.id);
          e.preventDefault();
        }
      } else if (k === 'b' && selectedOk && !pending) {
        e.preventDefault();
        void bid(minNext);
      } else if (k === 'u' && lot.bid_count > 0 && !pending) {
        e.preventDefault();
        void run('undo', 'undo_last_bid', { p_lot_id: lot.id });
      } else if (k === 's' && lot.current_bid !== null) {
        e.preventDefault();
        setSoldOpen(true);
      } else if (k === 'x') {
        e.preventDefault();
        setUnsoldOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const between = status === 'paused' && !!state?.between_rounds;

  return (
    <div className="space-y-5">
      {retry && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-[#ef444480] bg-[#ef44441a] px-4 py-3">
          <WifiOff className="h-5 w-5 text-danger" aria-hidden />
          <p className="flex-1 text-sm">Not saved: the last action did not reach the server. Retrying is safe (it will only apply once).</p>
          <Button size="sm" onClick={() => void retry.run()} loading={pending === retry.label}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={clearRetry}>
            Discard
          </Button>
        </div>
      )}

      {status === 'not_started' && (
        <PreStart snap={snap} iconCounts={iconCounts} pending={pending === 'start'} onStart={() => void startRound(false)} />
      )}

      {status !== 'not_started' && (
        <RoundControls
          snap={snap}
          pending={pending}
          onPause={() => void run('pause', 'pause_auction', undefined, { success: 'Auction paused' })}
          onResume={() => void run('resume', 'resume_auction', undefined, { success: 'Auction resumed' })}
          onEndRound={() => setEndRoundOpen(true)}
          onComplete={() => setCompleteOpen(true)}
          onReopen={() => void run('reopen', 'reopen_auction', undefined, { success: 'Auction reopened' })}
        />
      )}

      {warnings && (status === 'completed' || between) && warnings.teams_below_min.length > 0 && (
        <div className="rounded-card border border-[#eab30880] bg-[#eab3081a] px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-yellow-200">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Teams below the minimum squad size
          </p>
          <ul className="mt-1 list-inside list-disc text-muted">
            {warnings.teams_below_min.map((w) => (
              <li key={w.team_id}>
                {w.name}: {w.squad_count} of {w.min}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">
            {warnings.available_players} available and {warnings.unsold_players} unsold players remain.
          </p>
        </div>
      )}

      {between && <BetweenRounds snap={snap} pending={pending} run={run} />}

      {status !== 'not_started' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr),minmax(0,1fr)]">
          <div className="xl:col-start-1 xl:row-start-1">
            <LotStage view={snap.live} teams={teams} state={state} />
          </div>
          <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <TeamGrid teams={teams} states={teamStates} selected={selected} onSelect={setSelected} lotLive={!!lot && status === 'live'} leaderId={leader?.id ?? null} />
          </div>
          <div className="space-y-4 xl:col-start-1 xl:row-start-2">
            {lot && (
              <Card className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted">
                    Bidding for{' '}
                    {selectedTeam ? <span className="font-semibold text-fg">{selectedTeam.name}</span> : <span>— select a team on the right (keys 1–0)</span>}
                  </p>
                  <DM.Root>
                    <DM.Trigger asChild>
                      <button type="button" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-btn border border-border" aria-label="More lot actions">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DM.Trigger>
                    <DM.Portal>
                      <DM.Content align="end" className="z-50 min-w-[200px] rounded-btn border border-border bg-surface p-1 shadow-xl">
                        <DM.Item
                          onSelect={() => setCancelOpen(true)}
                          className="cursor-pointer rounded-[10px] px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2"
                        >
                          Cancel lot (wrong player)
                        </DM.Item>
                      </DM.Content>
                    </DM.Portal>
                  </DM.Root>
                </div>
                {status === 'live' && eligible.length === 0 && (
                  <p className="rounded-btn border border-[#eab30880] bg-[#eab3081a] px-3 py-2 text-sm text-yellow-200">
                    No eligible team can bid {money(minNext)}. {lot.current_bid === null ? 'Mark the player UNSOLD.' : 'Sell to the leader or mark UNSOLD.'}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    size="lg"
                    className="sm:col-span-1"
                    disabled={!selectedOk || status !== 'live' || (pending !== null && pending !== 'bid')}
                    loading={pending === 'bid'}
                    onClick={() => void bid(minNext)}
                  >
                    Bid {money(minNext)}
                    {step !== null && <span className="text-xs opacity-80">(+{money(step)})</span>}
                  </Button>
                  <Button size="lg" variant="secondary" disabled={!selectedOk || status !== 'live' || pending !== null} onClick={() => void bid(bidAfterSteps(lot.base_price, lot.current_bid, snap.tiers, 2))}>
                    +2 steps · {money(bidAfterSteps(lot.base_price, lot.current_bid, snap.tiers, 2))}
                  </Button>
                  <Button size="lg" variant="secondary" disabled={!selectedOk || status !== 'live' || pending !== null} onClick={() => void bid(bidAfterSteps(lot.base_price, lot.current_bid, snap.tiers, 5))}>
                    +5 steps · {money(bidAfterSteps(lot.base_price, lot.current_bid, snap.tiers, 5))}
                  </Button>
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(custom);
                    if (Number.isInteger(n) && n > 0) void bid(n);
                  }}
                >
                  <label className="sr-only" htmlFor="custom-bid">
                    Custom bid amount
                  </label>
                  <Input
                    id="custom-bid"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={`Custom amount (min ${minNext})`}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                  <Button type="submit" variant="secondary" className="whitespace-nowrap" disabled={!selectedOk || !custom || status !== 'live' || pending !== null}>
                    Place bid
                  </Button>
                </form>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={lot.bid_count === 0 || status !== 'live' || pending !== null}
                    loading={pending === 'undo'}
                    onClick={() => void run('undo', 'undo_last_bid', { p_lot_id: lot.id })}
                  >
                    <Undo2 className="h-4 w-4" aria-hidden /> Undo bid
                  </Button>
                  <Button variant="success" size="xl" disabled={lot.current_bid === null || status !== 'live' || pending !== null} onClick={() => setSoldOpen(true)}>
                    <CheckCircle2 className="h-6 w-6" aria-hidden /> Sold
                  </Button>
                  <Button variant="danger" size="xl" disabled={status !== 'live' || pending !== null} onClick={() => setUnsoldOpen(true)}>
                    <XCircle className="h-6 w-6" aria-hidden /> Unsold
                  </Button>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Keyboard className="h-3.5 w-3.5" aria-hidden /> 1–9, 0 select team · B bid next · U undo · S sold · X unsold
                </p>
              </Card>
            )}
            {!lot && status === 'live' && <NextPlayer snap={snap} pending={pending} run={run} />}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={soldOpen}
        onOpenChange={setSoldOpen}
        title="Confirm sale"
        description={lot && leader ? `Sold to ${leader.name} for ${money(lot.current_bid)}?` : 'No bid to sell.'}
        confirmLabel="Sold"
        confirmVariant="success"
        loading={pending === 'sold'}
        confirmDisabled={!lot || lot.current_bid === null}
        onConfirm={async () => {
          if (!lot) return;
          const name = lot.player_name;
          const res = await run('sold', 'mark_sold', { p_lot_id: lot.id }, { success: `${name} sold to ${leader?.name ?? ''}` });
          if (res.ok || res.code === 'LOT_NOT_LIVE') setSoldOpen(false);
        }}
      />
      <ConfirmDialog
        open={unsoldOpen}
        onOpenChange={setUnsoldOpen}
        title="Mark unsold"
        description={
          lot && lot.bid_count > 0
            ? `${lot.bid_count} bid${lot.bid_count === 1 ? '' : 's'} will be discarded and ${lot.player_name} will be marked UNSOLD.`
            : `${lot?.player_name ?? 'The player'} will be marked UNSOLD and can return in a later round.`
        }
        confirmLabel={lot && lot.bid_count > 0 ? 'Discard bids and mark unsold' : 'Mark unsold'}
        confirmVariant="danger"
        loading={pending === 'unsold'}
        onConfirm={async () => {
          if (!lot) return;
          const res = await run('unsold', 'mark_unsold', { p_lot_id: lot.id, p_discard_bids: lot.bid_count > 0 }, { success: `${lot.player_name} unsold` });
          if (res.ok || res.code === 'LOT_NOT_LIVE') setUnsoldOpen(false);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel lot"
        description="Use this when the wrong player was brought up. All bids are discarded and the player stays available."
        confirmLabel="Cancel lot"
        confirmVariant="danger"
        loading={pending === 'cancel'}
        onConfirm={async () => {
          if (!lot) return;
          const res = await run('cancel', 'cancel_lot', { p_lot_id: lot.id }, { success: 'Lot cancelled' });
          if (res.ok) setCancelOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!iconsConfirm}
        onOpenChange={(o) => !o && setIconsConfirm(null)}
        title="Icon players incomplete"
        description="These teams do not have two icon players yet. Start the auction anyway?"
        confirmLabel="Start anyway"
        loading={pending === 'start'}
        onConfirm={() => startRound(true)}
      >
        <ul className="list-inside list-disc text-sm">
          {iconsConfirm?.map((t) => (
            <li key={t.name}>
              {t.name}: {t.icons} of 2
            </li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={endRoundOpen}
        onOpenChange={setEndRoundOpen}
        title={`End round ${state?.current_round ?? ''}`}
        description={`Ends the round and applies the unsold rule (${snap.settings?.unsold_rule.replace('_', ' ') ?? ''}).`}
        confirmLabel="End round"
        loading={pending === 'endround'}
        onConfirm={async () => {
          const res = await run('endround', 'end_auction_round', undefined, {
            success: (d: LotResult & { auto_started?: boolean }) => (d.auto_started ? 'Round ended: next round started automatically' : 'Round ended'),
          });
          if (res.ok) setEndRoundOpen(false);
        }}
      />
      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Complete the auction"
        description="Teams below the minimum squad and players left in the pool are reported as warnings; they never block completion. You can reopen the auction later."
        confirmLabel="Complete auction"
        loading={pending === 'complete'}
        onConfirm={async () => {
          const res = await run<LotResult>('complete', 'complete_auction', undefined, { success: 'Auction completed' });
          if (res.ok) {
            setCompleteOpen(false);
            if (res.data.warnings) setWarnings(res.data.warnings);
          }
        }}
      />
    </div>
  );
}

function TeamGrid({
  teams,
  states,
  selected,
  onSelect,
  lotLive,
  leaderId,
}: {
  teams: AuctionTeam[];
  states: Map<string, Disabled>;
  selected: string | null;
  onSelect: (id: string) => void;
  lotLive: boolean;
  leaderId: string | null;
}) {
  if (teams.length === 0) return <EmptyState>No teams yet.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-2 self-start sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3" role="radiogroup" aria-label="Bidding team">
      {teams.map((t, i) => {
        const st = states.get(t.id);
        const isSel = selected === t.id;
        const leading = leaderId === t.id;
        const disabled = !lotLive || !!st?.disabled;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={isSel}
            disabled={disabled}
            title={st?.reason ?? (lotLive ? `Select ${t.name}` : 'No lot is live')}
            onClick={() => onSelect(t.id)}
            style={teamStyle(t.primary_color, t.secondary_color)}
            className={cn(
              'relative flex min-h-[112px] flex-col gap-1.5 rounded-card border bg-surface p-3 text-left transition',
              isSel ? 'border-[3px] border-accent shadow-[0_0_0_4px_rgba(249,115,22,.25)]' : 'border-border',
              leading && 'border-success',
              disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-[color:var(--team-visible)]',
            )}
          >
            <span className="absolute right-2 top-2 rounded-md bg-surface-2 px-1.5 text-xs font-bold text-muted">{i < 10 ? (i === 9 ? 0 : i + 1) : ''}</span>
            <span className="flex items-center gap-2">
              <TeamLogo logoPath={t.logo_path} name={t.name} shortName={t.short_name} color={t.primary_color} size={36} />
              <span className="font-display text-xl font-bold uppercase text-team">{t.short_name}</span>
            </span>
            <span className="text-xs text-muted">
              Max bid <Money amount={t.max_bid} className="font-semibold text-fg" />
            </span>
            <span className="flex justify-between text-xs text-muted">
              <span>
                Squad {t.squad_count}/{t.max_squad_size}
              </span>
              <span>
                Left <Money amount={t.purse_remaining} />
              </span>
            </span>
            {st?.reason && lotLive && <span className={cn('text-[11px] font-semibold uppercase', leading ? 'text-success' : 'text-yellow-200')}>{st.reason}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PreStart({
  snap,
  iconCounts,
  pending,
  onStart,
}: {
  snap: AuctionSnapshot;
  iconCounts: Record<string, number>;
  pending: boolean;
  onStart: () => void;
}) {
  const s = snap.settings;
  const missing = snap.teams.filter((t) => (iconCounts[t.id] ?? 0) < 2);
  const checks = [
    { ok: snap.teams.length >= 2, label: `${snap.teams.length} team${snap.teams.length === 1 ? '' : 's'} created (at least 2 needed)` },
    {
      ok: missing.length === 0,
      label: missing.length === 0 ? 'Every team has 2 icon players' : `Missing icon players: ${missing.map((t) => `${t.name} (${iconCounts[t.id] ?? 0}/2)`).join(', ')}`,
      warn: true,
    },
    { ok: snap.poolCount > 0, label: `${snap.poolCount} available players in the pool` },
  ];
  return (
    <Card className="p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Pre-start checklist</h2>
      <ul className="mt-3 space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-sm">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" aria-hidden /> : <AlertTriangle className={cn('mt-0.5 h-4 w-4', c.warn ? 'text-warning' : 'text-danger')} aria-hidden />}
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      {s && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-muted">Purse per team</dt>
            <dd className="font-semibold">
              <Money amount={s.purse_per_team} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Default base price</dt>
            <dd className="font-semibold">
              <Money amount={s.default_base_price} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Squad size</dt>
            <dd className="font-semibold">
              {s.min_squad_size} to {s.max_squad_size}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Rounds</dt>
            <dd className="font-semibold">{s.max_rounds}</dd>
          </div>
          <div>
            <dt className="text-muted">Unsold rule</dt>
            <dd className="font-semibold capitalize">{s.unsold_rule.replace('_', ' ')}</dd>
          </div>
        </dl>
      )}
      <Button size="lg" className="mt-5" loading={pending} disabled={snap.teams.length < 2 || snap.poolCount === 0} onClick={onStart}>
        <Play className="h-4 w-4" aria-hidden /> Start round 1
      </Button>
    </Card>
  );
}

function RoundControls({
  snap,
  pending,
  onPause,
  onResume,
  onEndRound,
  onComplete,
  onReopen,
}: {
  snap: AuctionSnapshot;
  pending: string | null;
  onPause: () => void;
  onResume: () => void;
  onEndRound: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  const st = snap.state;
  const status = st?.status;
  const hasLot = !!snap.live;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
      <span className="mr-2 text-sm text-muted">
        Round <span className="font-semibold text-fg">{st?.current_round}</span> of {snap.settings?.max_rounds} · Pool{' '}
        <span className="font-semibold text-fg">{snap.poolCount}</span>
      </span>
      {status === 'live' && (
        <Button size="sm" variant="secondary" onClick={onPause} loading={pending === 'pause'}>
          <Pause className="h-4 w-4" aria-hidden /> Pause
        </Button>
      )}
      {status === 'paused' && !st?.between_rounds && (
        <Button size="sm" onClick={onResume} loading={pending === 'resume'}>
          <Play className="h-4 w-4" aria-hidden /> Resume
        </Button>
      )}
      {status === 'live' && (
        <Button size="sm" variant="secondary" onClick={onEndRound} disabled={hasLot} title={hasLot ? 'Close the current lot first' : undefined}>
          End round
        </Button>
      )}
      {(status === 'live' || status === 'paused') && (
        <Button size="sm" variant="secondary" onClick={onComplete} disabled={hasLot} title={hasLot ? 'Close the current lot first' : undefined}>
          Complete auction
        </Button>
      )}
      {status === 'completed' && (
        <Button size="sm" variant="secondary" onClick={onReopen} loading={pending === 'reopen'}>
          Reopen auction
        </Button>
      )}
    </div>
  );
}

function NextPlayer({ snap, pending, run }: { snap: AuctionSnapshot; pending: string | null; run: ReturnType<typeof useAuctionActions>['run'] }) {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<'' | Position>('');
  const [randomPos, setRandomPos] = useState<'' | Position>('');
  const fetcher = useCallback(() => fetchPlayersByStatus(getBrowserClient(), 'available'), []);
  const { data: pool = [] } = useRealtimeQuery<UnsoldPlayer[]>({ key: 'console-pool', fetcher, subscriptions: [{ table: 'players' }], debounceMs: 400 });
  const filtered = pool
    .filter((p) => !pos || p.primary_position === pos)
    .filter((p) => !q.trim() || p.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl font-bold uppercase">Next player</h3>
          <p className="text-sm text-muted">{snap.poolCount} available in the pool</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Select value={randomPos} onChange={(e) => setRandomPos(e.target.value as '' | Position)} aria-label="Random within position" className="w-auto min-w-[150px] flex-1 sm:flex-none">
            <option value="">Any position</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Button
            loading={pending === 'random'}
            disabled={pending !== null || snap.poolCount === 0}
            onClick={() => void run('random', 'open_random_lot', randomPos ? { p_position: randomPos } : {})}
          >
            <Shuffle className="h-4 w-4" aria-hidden /> Random next
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,150px]">
        <label className="relative block">
          <span className="sr-only">Search available players</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="pl-9" placeholder="Search available players" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select value={pos} onChange={(e) => setPos(e.target.value as '' | Position)} aria-label="Filter by position">
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>
      <div className="scrollbar-thin mt-3 max-h-[420px] overflow-y-auto pr-1">
        <PlayerList
          players={filtered}
          empty={pool.length === 0 ? 'The pool is empty: end the round or complete the auction.' : 'No players match.'}
          renderAction={(p) => (
            <Button size="sm" loading={pending === `open:${p.id}`} disabled={pending !== null} onClick={() => void run(`open:${p.id}`, 'open_lot', { p_player_id: p.id })}>
              Bring up
            </Button>
          )}
        />
      </div>
    </Card>
  );
}

function BetweenRounds({ snap, pending, run }: { snap: AuctionSnapshot; pending: string | null; run: ReturnType<typeof useAuctionActions>['run'] }) {
  const fetcher = useCallback(() => fetchPlayersByStatus(getBrowserClient(), 'unsold'), []);
  const { data: unsold = [] } = useRealtimeQuery<UnsoldPlayer[]>({ key: 'console-unsold', fetcher, subscriptions: [{ table: 'players' }], debounceMs: 400 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const s = snap.settings;
  const st = snap.state;
  const limit = s && st ? st.current_round >= s.max_rounds || s.unsold_rule === 'no_reenter' : false;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl font-bold uppercase">Between rounds</h3>
          <p className="text-sm text-muted">
            {limit
              ? s?.unsold_rule === 'no_reenter'
                ? 'The unsold rule does not allow re-entry. Complete the auction or change the rule in Settings.'
                : 'The round limit is reached. Complete the auction or raise the limit in Settings.'
              : `Pick unsold players to bring back in round ${(st?.current_round ?? 0) + 1}${s?.unsold_base_price_reduction_pct ? ` (base price −${s.unsold_base_price_reduction_pct}%)` : ''}. Available players join automatically.`}
          </p>
        </div>
        {!limit && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(unsold.map((p) => p.id)))} disabled={unsold.length === 0}>
              Select all
            </Button>
            <Button
              loading={pending === 'nextround'}
              disabled={pending !== null || (picked.size === 0 && snap.poolCount === 0)}
              onClick={async () => {
                const res = await run('nextround', 'start_next_round', { p_player_ids: [...picked] }, { success: 'Next round started' });
                if (res.ok) setPicked(new Set());
              }}
            >
              Start next round with selected ({picked.size})
            </Button>
          </div>
        )}
      </div>
      {!limit && (
        <div className="mt-3">
          <PlayerList
            players={unsold}
            empty="No unsold players."
            leading={(p) => (
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={picked.has(p.id)}
                onChange={() => toggle(p.id)}
                aria-label={`Re-enter ${p.full_name}`}
              />
            )}
          />
        </div>
      )}
    </Card>
  );
}

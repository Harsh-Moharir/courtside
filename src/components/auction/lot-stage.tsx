'use client';
import { Gavel } from 'lucide-react';
import { Badge, PositionBadge } from '@/components/ui/badge';
import { PlayerAvatar, TeamLogo } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { cn } from '@/components/ui/cn';
import { teamStyle } from '@/lib/color';
import { auctionStatusLabel, type AuctionState, type AuctionTeam, type LotView } from '@/lib/queries/auction';
import { POSITION_LABELS } from '@/lib/format';

export function AuctionStatusChip({ state }: { state: AuctionState | null }) {
  const status = state?.status ?? 'not_started';
  const cls =
    status === 'live'
      ? 'border-[#ef444499] bg-[#ef444426] text-red-200'
      : status === 'paused'
        ? 'border-[#eab30899] bg-[#eab3081a] text-yellow-200'
        : status === 'completed'
          ? 'border-[#22c55e80] bg-[#22c55e1a] text-green-300'
          : 'border-border text-muted';
  return (
    <Badge className={cn('px-3 py-1 text-sm', cls)}>
      {status === 'live' && <span className="h-2 w-2 animate-pulse-dot rounded-full bg-danger" aria-hidden />}
      {auctionStatusLabel(state)}
    </Badge>
  );
}

/** The lot on the block. Shared by the admin console and the public auction page (read-only). */
export function LotStage({
  view,
  teams,
  state,
  className,
  showBids = true,
}: {
  view: LotView | null;
  teams: AuctionTeam[];
  state: AuctionState | null;
  className?: string;
  showBids?: boolean;
}) {
  if (!view) {
    return (
      <div className={cn('flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface p-6 text-center', className)}>
        <Gavel className="h-10 w-10 text-muted" aria-hidden />
        <p className="font-display text-2xl font-bold uppercase">No player on the block</p>
        <p className="text-sm text-muted">
          {state?.status === 'live' ? 'Next player coming up.' : state?.status === 'completed' ? 'The auction is complete.' : 'Waiting for the auctioneer.'}
        </p>
      </div>
    );
  }
  const { lot, bids } = view;
  const leader = teams.find((t) => t.id === lot.leading_team_id) ?? null;
  const visibleBids = bids.filter((b) => !b.is_voided);
  const paused = state?.status === 'paused';
  return (
    <div
      className={cn('relative overflow-hidden rounded-card border border-border bg-surface', className)}
      style={leader ? teamStyle(leader.primary_color, leader.secondary_color) : undefined}
    >
      {leader && (
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ background: 'radial-gradient(circle at 85% 20%, var(--team-primary), transparent 60%)' }}
          aria-hidden
        />
      )}
      <div className="relative grid gap-5 p-5 sm:grid-cols-[auto,1fr] sm:p-6">
        <div className="flex justify-center sm:block">
          <PlayerAvatar photoPath={lot.player_photo_path} name={lot.player_name} size={176} rounded="card" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-muted">
            <span>Lot {lot.lot_number}</span>
            <span aria-hidden>·</span>
            <span>Round {lot.round_number}</span>
            <Badge className={paused ? 'border-[#eab30899] text-yellow-200' : 'border-[#ef444499] bg-[#ef444426] text-red-200'}>
              {!paused && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-danger" aria-hidden />}
              {paused ? 'Paused' : 'Live'}
            </Badge>
          </div>
          <h2 className="mt-1 truncate font-display text-4xl font-extrabold uppercase leading-none sm:text-5xl" title={lot.player_name}>
            {lot.player_name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <PositionBadge position={lot.primary_position} />
            {lot.primary_position && <span className="text-muted">{POSITION_LABELS[lot.primary_position]}</span>}
            {lot.secondary_position && (
              <>
                <PositionBadge position={lot.secondary_position} secondary />
                <span className="text-muted">{POSITION_LABELS[lot.secondary_position]}</span>
              </>
            )}
            {view.player?.jersey_number != null && <span className="text-muted">#{view.player.jersey_number}</span>}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{lot.current_bid === null ? 'Base price' : 'Current bid'}</p>
              <p className="font-display text-5xl font-extrabold leading-none text-accent sm:text-6xl" aria-live="polite">
                <Money amount={lot.current_bid ?? lot.base_price} />
              </p>
              {lot.current_bid !== null && (
                <p className="mt-1 text-xs text-muted">
                  Base <Money amount={lot.base_price} /> · {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Leading</p>
              {leader ? (
                <div className="mt-1 flex items-center gap-3 rounded-btn border bg-black/30 p-2" style={{ borderColor: 'var(--team-visible)' }}>
                  <TeamLogo logoPath={leader.logo_path} name={leader.name} shortName={leader.short_name} color={leader.primary_color} size={48} />
                  <span className="truncate font-display text-2xl font-bold uppercase text-team" title={leader.name}>
                    {leader.name}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-muted">No bids yet</p>
              )}
            </div>
          </div>
          {showBids && visibleBids.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Recent bids">
              {visibleBids.slice(0, 6).map((b, i) => {
                const t = teams.find((x) => x.id === b.team_id);
                return (
                  <li
                    key={b.id}
                    className={cn('rounded-full border border-border px-2.5 py-1 text-xs', i === 0 ? 'bg-surface-2 text-fg' : 'text-muted')}
                  >
                    {t?.short_name ?? '—'} <Money amount={b.amount} />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

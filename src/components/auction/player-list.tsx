'use client';
import { PositionBadge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/misc';
import type { UnsoldPlayer } from '@/lib/queries/auction';

export function PlayerList({
  players,
  empty,
  renderAction,
  leading,
}: {
  players: UnsoldPlayer[];
  empty: string;
  renderAction?: (p: UnsoldPlayer) => React.ReactNode;
  leading?: (p: UnsoldPlayer) => React.ReactNode;
}) {
  if (players.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {players.map((p) => (
        <li key={p.id} className="flex min-h-[64px] items-center gap-3 rounded-btn border border-border bg-surface p-2.5">
          {leading?.(p)}
          <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" title={p.full_name}>
              {p.full_name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <PositionBadge position={p.primary_position} />
              <PositionBadge position={p.secondary_position} secondary />
              <span>
                Base <Money amount={p.base_price} />
              </span>
            </div>
          </div>
          {renderAction?.(p)}
        </li>
      ))}
    </ul>
  );
}

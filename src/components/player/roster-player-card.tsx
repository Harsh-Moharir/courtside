'use client';
import { AlertTriangle } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/media';
import { IconBadge, PositionBadge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { cn } from '@/components/ui/cn';
import type { RosterEntry } from '@/lib/queries/roster';

export function RosterPlayerCard({ entry, jerseyConflict = false }: { entry: RosterEntry; jerseyConflict?: boolean }) {
  const icon = entry.source === 'icon';
  const p = entry.player;
  return (
    <article
      className={cn(
        'flex h-[104px] items-center gap-4 rounded-card border bg-surface px-4',
        icon ? 'border-[#facc1580] bg-gradient-to-r from-[#facc151a] to-surface' : 'border-border',
      )}
    >
      <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={icon ? 72 : 60} icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-semibold" title={p.full_name}>
            {p.full_name}
          </h4>
          {p.jersey_number !== null && <span className="shrink-0 font-display text-lg font-bold text-muted tabular">#{p.jersey_number}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <PositionBadge position={p.primary_position} />
          <PositionBadge position={p.secondary_position} secondary />
          {icon && <IconBadge />}
          {jerseyConflict && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#eab30899] bg-[#eab3081a] px-2 py-0.5 text-[11px] font-semibold text-yellow-200" title="Another roster player wears this number (visible to admins only)">
              <AlertTriangle className="h-3 w-3" aria-hidden /> Jersey clash
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {icon ? (
          <span className="font-display text-xl font-bold uppercase text-gold">Icon</span>
        ) : (
          <>
            <Money amount={entry.price} className="font-display text-xl font-bold" />
            {entry.source === 'manual' && <p className="text-[11px] uppercase tracking-wide text-muted">Adjusted</p>}
          </>
        )}
      </div>
    </article>
  );
}

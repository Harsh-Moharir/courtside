'use client';
import Link from 'next/link';
import { PlayerAvatar, TeamLogo } from '@/components/ui/media';
import { PlayerStatusBadge, PositionBadge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { cn } from '@/components/ui/cn';
import type { PlayerListItem } from '@/lib/queries/players';

export function PlayerCard({ player }: { player: PlayerListItem }) {
  const icon = player.status === 'icon';
  const team = player.roster?.team ?? null;
  return (
    <article className={cn('flex h-full flex-col rounded-card border bg-surface p-4', icon ? 'border-[#facc1580]' : 'border-border')}>
      <div className="flex items-start gap-3">
        <PlayerAvatar photoPath={player.photo_path} name={player.full_name} size={64} icon={icon} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold" title={player.full_name}>
            {player.full_name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <PositionBadge position={player.primary_position} />
            <PositionBadge position={player.secondary_position} secondary />
            {player.jersey_number !== null && <span className="font-display text-base font-bold text-muted tabular">#{player.jersey_number}</span>}
          </div>
        </div>
        <PlayerStatusBadge status={player.status} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-muted">
          Base <Money amount={player.base_price} className="font-semibold text-fg" />
        </span>
      </div>
      <div className="mt-2 min-h-[44px]">
        {team && (player.status === 'sold' || player.status === 'icon') ? (
          <Link href={`/teams/${team.id}`} className="flex min-h-[44px] items-center gap-2 rounded-btn bg-surface-2 px-2.5 hover:bg-border">
            <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={team.name}>
              {team.name}
            </span>
            {icon ? (
              <span className="text-xs font-bold uppercase text-gold">Icon</span>
            ) : (
              <Money amount={player.roster?.price ?? 0} className="text-sm font-bold text-accent" />
            )}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

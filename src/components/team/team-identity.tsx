'use client';
import { TeamLogo, PlayerAvatar } from '@/components/ui/media';
import { IconBadge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import type { TeamWithIdentity, IconPlayer } from '@/lib/queries/teams';

function IconRow({ slot, player, compact }: { slot: 1 | 2; player: IconPlayer | null; compact: boolean }) {
  const size = compact ? 40 : 52;
  return (
    <div className="flex min-h-[56px] items-center gap-3">
      {player ? (
        <PlayerAvatar photoPath={player.photo_path} name={player.full_name} size={size} icon />
      ) : (
        <span className="inline-block shrink-0 rounded-full border border-dashed border-border" style={{ width: size, height: size }} aria-hidden />
      )}
      <div className="min-w-0 text-left">
        <p className="truncate text-sm" title={player?.full_name}>
          <span className="text-muted">Icon Player {slot}: </span>
          {player ? <span className="font-semibold">{player.full_name}</span> : <span className="text-muted">To be announced</span>}
        </p>
        {player && <IconBadge className="mt-1" />}
      </div>
    </div>
  );
}

/**
 * The single identity block shared by the Teams grid card and the team page header (6.2):
 * large logo, team name, then Owner, Icon Player 1, Icon Player 2 directly underneath.
 */
export function TeamIdentity({ team, size = 'card' }: { team: TeamWithIdentity; size?: 'card' | 'page' }) {
  const page = size === 'page';
  return (
    <div className={cn('flex flex-col items-center text-center', page ? 'gap-4' : 'gap-3')}>
      <TeamLogo
        logoPath={team.logo_path}
        name={team.name}
        shortName={team.short_name}
        color={team.primary_color}
        size={page ? 144 : 104}
        className="shadow-[0_0_40px_-10px_var(--team-visible)]"
      />
      <h2
        className={cn('w-full truncate font-display font-extrabold uppercase tracking-tight', page ? 'text-4xl sm:text-6xl' : 'text-3xl')}
        title={team.name}
      >
        {team.name}
      </h2>
      <div className={cn('w-full space-y-1.5', page ? 'max-w-md' : '')}>
        <p className="min-h-[24px] truncate text-sm">
          <span className="text-muted">Owner: </span>
          {team.owner?.full_name ? <span className="font-semibold">{team.owner.full_name}</span> : <span className="text-muted">To be announced</span>}
        </p>
        <div className="grid gap-1.5">
          <IconRow slot={1} player={team.icon1} compact={!page} />
          <IconRow slot={2} player={team.icon2} compact={!page} />
        </div>
      </div>
    </div>
  );
}

import { Star } from 'lucide-react';
import { cn } from './cn';

export function Badge({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide', className)}
    >
      {children}
    </span>
  );
}

export type FixtureStatus = 'upcoming' | 'live' | 'completed' | 'postponed';

export function StatusChip({ status, label }: { status: FixtureStatus | 'halftime'; label?: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    upcoming: { text: 'Upcoming', cls: 'border-border text-muted' },
    live: { text: 'Live', cls: 'border-danger/60 bg-danger/15 text-red-300' },
    halftime: { text: 'Halftime', cls: 'border-warning/60 bg-warning/10 text-yellow-200' },
    completed: { text: 'Final', cls: 'border-success/50 bg-success/10 text-green-300' },
    postponed: { text: 'Postponed', cls: 'border-warning/50 bg-warning/10 text-yellow-200' },
  };
  const m = map[status] ?? { text: status, cls: '' };
  return (
    <Badge className={m.cls}>
      {status === 'live' && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-danger" aria-hidden />}
      {label ?? m.text}
    </Badge>
  );
}

export type PlayerStatus = 'available' | 'sold' | 'unsold' | 'icon';

export function PlayerStatusBadge({ status }: { status: PlayerStatus }) {
  const map: Record<PlayerStatus, string> = {
    available: 'border-border text-fg',
    sold: 'border-success/50 bg-success/10 text-green-300',
    unsold: 'border-danger/50 bg-danger/10 text-red-300',
    icon: 'border-gold/60 bg-gold/10 text-gold',
  };
  const text: Record<PlayerStatus, string> = { available: 'Available', sold: 'Sold', unsold: 'Unsold', icon: 'Icon' };
  return <Badge className={map[status]}>{text[status]}</Badge>;
}

export function PositionBadge({ position, secondary = false }: { position: string | null | undefined; secondary?: boolean }) {
  if (!position) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 font-display text-sm font-bold',
        secondary ? 'border border-border text-muted' : 'bg-accent text-accent-contrast',
      )}
      title={secondary ? 'Secondary position' : 'Primary position'}
    >
      {position}
    </span>
  );
}

export function IconBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-black', className)}>
      <Star className="h-3 w-3 fill-black" aria-hidden />
      Icon
    </span>
  );
}

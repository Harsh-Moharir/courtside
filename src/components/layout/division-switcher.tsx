'use client';
import { useTournament } from '@/components/providers/tournament-context';
import { cn } from '@/components/ui/cn';
import { switchDivision, type Division } from '@/lib/division';

/** Men | Women (or any divisions) segmented switch. Hidden when only one division exists. */
export function DivisionSwitcher({ divisions, className, size = 'md' }: { divisions: Division[]; className?: string; size?: 'md' | 'lg' }) {
  const t = useTournament();
  if (divisions.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Division" className={cn('inline-flex shrink-0 rounded-full border border-border bg-surface p-1', className)}>
      {divisions.map((d) => {
        const active = d.id === t.id;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && switchDivision(d.id)}
            className={cn(
              'rounded-full font-display font-bold uppercase tracking-wide transition',
              size === 'lg' ? 'min-h-[44px] px-5 text-lg' : 'min-h-[36px] px-3.5 text-sm',
              active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-fg',
            )}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

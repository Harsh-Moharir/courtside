'use client';
import Link from 'next/link';
import { TeamIdentity } from '@/components/team/team-identity';
import { Money } from '@/components/ui/money';
import { teamStyle } from '@/lib/color';
import type { TeamWithIdentity } from '@/lib/queries/teams';
import type { TeamFinance } from '@/lib/queries/roster';

/** Teams grid card: the shared TeamIdentity block plus a squad / purse footer (11.4). */
export function TeamCard({ team, finance }: { team: TeamWithIdentity; finance: TeamFinance | null }) {
  return (
    <Link
      href={`/teams/${team.id}`}
      style={teamStyle(team.primary_color, team.secondary_color)}
      className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-[var(--team-visible)] hover:shadow-[0_0_36px_-8px_var(--team-visible)] focus-visible:border-[var(--team-visible)]"
      aria-label={`${team.name} team page`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-[var(--team-primary)]" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-25 transition group-hover:opacity-40"
        style={{ background: 'radial-gradient(ellipse at top, var(--team-visible), transparent 70%)' }}
      />
      <div className="relative flex-1 px-5 pb-5 pt-7">
        <TeamIdentity team={team} />
      </div>
      <div className="relative grid grid-cols-2 divide-x divide-border border-t border-border bg-[#1c1c1c99] text-center">
        <div className="px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">Squad</p>
          <p className="font-display text-2xl font-bold tabular">
            {finance?.squad_count ?? 0}
            <span className="text-base text-muted">/{finance?.max_squad_size ?? '—'}</span>
          </p>
        </div>
        <div className="px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">Purse left</p>
          <p className="font-display text-2xl font-bold">
            <Money amount={finance?.purse_remaining ?? team.purse_remaining} />
          </p>
        </div>
      </div>
    </Link>
  );
}

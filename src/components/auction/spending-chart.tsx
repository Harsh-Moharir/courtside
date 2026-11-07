'use client';
import Link from 'next/link';
import { TeamLogo } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/misc';
import { teamStyle } from '@/lib/color';
import type { AuctionTeam } from '@/lib/queries/auction';

/** Team-wise expenditure comparison drawn with plain CSS (11.5). */
export function SpendingChart({ teams }: { teams: AuctionTeam[] }) {
  if (teams.length === 0) return <EmptyState>No teams yet.</EmptyState>;
  const sorted = [...teams].sort((a, b) => b.purse_spent - a.purse_spent || a.name.localeCompare(b.name));
  const maxTotal = Math.max(1, ...sorted.map((t) => t.purse_total));
  return (
    <ul className="space-y-3">
      {sorted.map((t) => {
        const totalPct = (t.purse_total / maxTotal) * 100;
        const spentPct = t.purse_total > 0 ? (t.purse_spent / t.purse_total) * 100 : 0;
        return (
          <li key={t.id} style={teamStyle(t.primary_color, t.secondary_color)}>
            <Link href={`/teams/${t.id}`} className="group block rounded-btn p-2 hover:bg-surface-2">
              <div className="mb-1.5 flex items-center gap-2.5">
                <TeamLogo logoPath={t.logo_path} name={t.name} shortName={t.short_name} color={t.primary_color} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold group-hover:text-accent">{t.name}</span>
                <span className="text-sm tabular">
                  <Money amount={t.purse_spent} /> <span className="text-muted">spent</span>
                </span>
              </div>
              <div className="h-4 rounded-full bg-surface-2" style={{ width: `${totalPct}%` }}>
                <div
                  className="h-4 rounded-full transition-[width] duration-500"
                  style={{ width: `${spentPct}%`, background: 'var(--team-visible)' }}
                  role="img"
                  aria-label={`${t.name} spent ${Math.round(spentPct)}% of purse`}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                <Money amount={t.purse_remaining} /> remaining of <Money amount={t.purse_total} /> · squad {t.squad_count}/{t.max_squad_size}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

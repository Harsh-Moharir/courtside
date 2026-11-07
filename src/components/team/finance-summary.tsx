'use client';
import { Money } from '@/components/ui/money';
import { Card } from '@/components/ui/card';
import type { TeamFinance } from '@/lib/queries/roster';

export function FinanceSummary({ finance }: { finance: TeamFinance | null }) {
  if (!finance) return null;
  const total = finance.purse_total;
  const spent = finance.purse_spent;
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const squad = finance.squad_count ?? 0;
  const need = Math.max(0, finance.min_squad_size - squad);
  const stats: { label: string; value: React.ReactNode }[] = [
    { label: 'Initial purse', value: <Money amount={total} /> },
    { label: 'Total spent', value: <Money amount={spent} /> },
    { label: 'Remaining purse', value: <Money amount={finance.purse_remaining} className="text-accent" /> },
    { label: 'Players purchased', value: finance.purchased_count ?? 0 },
    { label: 'Squad size', value: `${squad} / ${finance.max_squad_size}` },
  ];
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-display text-2xl font-bold uppercase">Financial summary</h3>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs uppercase tracking-wide text-muted">{s.label}</dt>
            <dd className="font-display text-2xl font-bold tabular">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Spent vs purse</span>
          <span className="tabular">{pct}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Purse spent">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {need > 0 && (
        <p className="mt-3 text-sm font-semibold text-yellow-200">
          Needs {need} more {need === 1 ? 'player' : 'players'} to reach the minimum squad of {finance.min_squad_size}.
        </p>
      )}
    </Card>
  );
}

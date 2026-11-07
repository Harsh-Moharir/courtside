'use client';
import { useTournament } from '@/components/providers/tournament-context';
import { formatMoney } from '@/lib/format';
import { cn } from './cn';

export function Money({ amount, className }: { amount: number | null | undefined; className?: string }) {
  const t = useTournament();
  return <span className={cn('tabular', className)}>{formatMoney(amount, t.currency_symbol)}</span>;
}

/** Hook form for places that need a string (aria labels, exports). */
export function useMoney(): (n: number | null | undefined) => string {
  const t = useTournament();
  return (n) => formatMoney(n, t.currency_symbol);
}

import { periodBreakdown, periodLabel } from '@/lib/domain/clock';
import { TableWrap } from '@/components/ui/misc';
import type { FixtureWithTeams } from '@/lib/queries/matches';

/** Quarter-by-quarter table from cumulative period_scores (8.11). */
export function PeriodTable({
  fixture,
  periodScores,
  quarters,
  finalHome,
  finalAway,
}: {
  fixture: FixtureWithTeams;
  periodScores: unknown;
  quarters: number;
  finalHome: number;
  finalAway: number;
}) {
  const ps = Array.isArray(periodScores) ? (periodScores as { period: number; home_total: number; away_total: number }[]) : [];
  if (ps.length === 0) return null;
  const rows = periodBreakdown(ps);
  return (
    <TableWrap>
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">Points per period</caption>
        <thead className="bg-surface-2 text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Team</th>
            {rows.map((r) => (
              <th key={r.period} scope="col" className="px-3 py-2 text-center">
                {periodLabel(quarters, r.period)}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-center text-fg">Total</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {(['home', 'away'] as const).map((side) => (
            <tr key={side} className="border-t border-border">
              <th scope="row" className="max-w-[160px] truncate px-3 py-2 text-left font-semibold">
                {(side === 'home' ? fixture.home?.name : fixture.away?.name) ?? 'TBD'}
              </th>
              {rows.map((r) => (
                <td key={r.period} className="px-3 py-2 text-center">
                  {side === 'home' ? r.home : r.away}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-display text-lg font-bold">{side === 'home' ? finalHome : finalAway}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

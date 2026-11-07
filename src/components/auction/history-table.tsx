'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, PositionBadge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/field';
import { PlayerAvatar, TeamLogo } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { EmptyState, TableWrap } from '@/components/ui/misc';
import { TzDate } from '@/components/ui/time';
import { POSITIONS } from '@/lib/format';
import type { AuctionTeam, HistoryRow } from '@/lib/queries/auction';

export function HistoryTable({
  rows,
  teams,
  admin = false,
  renderActions,
}: {
  rows: HistoryRow[];
  teams: AuctionTeam[];
  admin?: boolean;
  renderActions?: (row: HistoryRow) => React.ReactNode;
}) {
  const [team, setTeam] = useState('');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => r.kind === 'sold')
      .filter((r) => (admin ? true : r.status !== 'Reversed'))
      .filter((r) => !team || r.team_id === team)
      .filter((r) => !pos || r.primary_position === pos || r.secondary_position === pos)
      .filter((r) => !needle || r.player_name.toLowerCase().includes(needle))
      .sort((a, b) => (b.purchase_order ?? 0) - (a.purchase_order ?? 0));
  }, [rows, team, pos, q, admin]);

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr,200px,160px]">
        <label className="relative block">
          <span className="sr-only">Search player</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player" className="pl-9" />
        </label>
        <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Filter by position">
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState>{rows.some((r) => r.kind === 'sold') ? 'No purchases match these filters.' : 'No players have been sold yet.'}</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Player</th>
                <th className="px-3 py-2.5">Pos</th>
                <th className="px-3 py-2.5">Team</th>
                <th className="px-3 py-2.5 text-right">Price</th>
                <th className="px-3 py-2.5">Status</th>
                {admin && <th className="px-3 py-2.5">Time</th>}
                {renderActions && <th className="px-3 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const t = r.team_id ? teamById.get(r.team_id) : undefined;
                return (
                  <tr key={r.id} className={`border-t border-border ${r.status === 'Reversed' ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 font-display text-lg font-bold tabular text-muted">{r.purchase_order}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar photoPath={r.player_photo_path} name={r.player_name} size={36} />
                        <span className="max-w-[220px] truncate font-semibold" title={r.player_name}>
                          {r.player_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <PositionBadge position={r.primary_position} />
                        <PositionBadge position={r.secondary_position} secondary />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {t ? (
                        <Link href={`/teams/${t.id}`} className="flex items-center gap-2 hover:text-accent">
                          <TeamLogo logoPath={t.logo_path} name={t.name} shortName={t.short_name} color={t.primary_color} size={28} />
                          <span className="max-w-[180px] truncate">{t.name}</span>
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-display text-lg font-bold">
                      <Money amount={r.price} />
                    </td>
                    <td className="px-3 py-2">
                      {r.status === 'Reversed' ? (
                        <Badge className="border-[#ef444480] text-red-300" title={r.reversal_reason ?? undefined}>
                          Reversed
                        </Badge>
                      ) : (
                        <Badge className="border-[#22c55e80] bg-[#22c55e1a] text-green-300">Sold</Badge>
                      )}
                      {r.txn_kind === 'manual' && <Badge className="ml-1 text-muted">Adjusted</Badge>}
                    </td>
                    {admin && (
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                        <TzDate iso={r.at} pattern="d MMM, h:mm a" />
                      </td>
                    )}
                    {renderActions && <td className="px-3 py-2 text-right">{renderActions(r)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

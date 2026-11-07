'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { useMoney } from '@/components/ui/money';
import { rpc } from '@/lib/actions/rpc';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { fetchPlayersByStatus, type AuctionTeam, type HistoryRow, type UnsoldPlayer } from '@/lib/queries/auction';
import { HistoryTable } from '../history-table';
import { PlayerList } from '../player-list';
import { ExportButtons } from '../export-buttons';

export interface ReassignTarget {
  playerId: string;
  playerName: string;
  currentTeamId: string | null;
  currentPrice: number | null;
}

export function ReverseDialog({ row, onClose, onDone }: { row: HistoryRow | null; onClose: () => void; onDone: () => void }) {
  const money = useMoney();
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState<'available' | 'unsold'>('available');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setReason('');
    setRet('available');
  }, [row?.id]);
  return (
    <ConfirmDialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title="Reverse sale"
      description={row ? `${row.player_name} leaves the team and ${money(row.price)} is refunded to its purse.` : ''}
      confirmLabel="Reverse sale"
      confirmVariant="danger"
      loading={pending}
      confirmDisabled={!reason.trim()}
      onConfirm={async () => {
        if (!row) return;
        setPending(true);
        const res = await rpc('reverse_sale', { p_transaction_id: row.id, p_reason: reason.trim(), p_return_status: ret });
        setPending(false);
        if (res.ok) {
          toast.success('Sale reversed');
          onDone();
          onClose();
        } else toast.error(res.message);
      }}
    >
      <div className="space-y-3">
        <Field label="Reason (required)" htmlFor="rev-reason">
          <Textarea id="rev-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="Player returns as" htmlFor="rev-status">
          <Select id="rev-status" value={ret} onChange={(e) => setRet(e.target.value as 'available' | 'unsold')}>
            <option value="available">Available (back in the pool)</option>
            <option value="unsold">Unsold</option>
          </Select>
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function ReassignDialog({
  target,
  teams,
  onClose,
  onDone,
}: {
  target: ReassignTarget | null;
  teams: AuctionTeam[];
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const [team, setTeam] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setTeam(target?.currentTeamId ?? '');
    setPrice(target?.currentPrice != null ? String(target.currentPrice) : '');
    setReason('');
  }, [target?.playerId, target?.currentTeamId, target?.currentPrice]);
  const tm = teams.find((t) => t.id === team);
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={target?.currentTeamId ? 'Reassign player' : 'Assign player to a team'}
      description={
        target
          ? target.currentTeamId
            ? `Moves ${target.playerName} (wrong team or wrong price). The old sale is reversed and a manual sale is recorded.`
            : `Places ${target.playerName} directly on a team as a manual sale.`
          : ''
      }
      confirmLabel="Save"
      loading={pending}
      confirmDisabled={!team || price === '' || !reason.trim()}
      onConfirm={async () => {
        if (!target) return;
        setPending(true);
        const res = await rpc('reassign_player', { p_player_id: target.playerId, p_to_team_id: team, p_price: Number(price), p_reason: reason.trim() });
        setPending(false);
        if (res.ok) {
          toast.success('Player assigned');
          onDone();
          onClose();
        } else toast.error(res.message + (res.code === 'BID_EXCEEDS_PURSE' && res.detail?.max_bid != null ? ` Maximum: ${money(Number(res.detail.max_bid))}.` : ''));
      }}
    >
      <div className="space-y-3">
        <Field label="Team" htmlFor="ra-team">
          <Select id="ra-team" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Choose a team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({money(t.purse_remaining)} left, squad {t.squad_count}/{t.max_squad_size})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price" htmlFor="ra-price" hint={tm ? `${tm.name} has ${money(tm.purse_remaining)} remaining.` : undefined}>
          <Input id="ra-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="Reason (required)" htmlFor="ra-reason">
          <Textarea id="ra-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function HistoryAdminTab({ rows, teams, refetch }: { rows: HistoryRow[]; teams: AuctionTeam[]; refetch: () => void }) {
  const [reverse, setReverse] = useState<HistoryRow | null>(null);
  const [reassign, setReassign] = useState<ReassignTarget | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Reversed sales stay in the list (admins only). Purchase order gaps after a reversal are expected.</p>
        <ExportButtons rows={rows} teams={teams} />
      </div>
      <HistoryTable
        rows={rows}
        teams={teams}
        admin
        renderActions={(r) =>
          r.status === 'Sold' && r.player_id ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="secondary" onClick={() => setReassign({ playerId: r.player_id as string, playerName: r.player_name, currentTeamId: r.team_id, currentPrice: r.price })}>
                Reassign
              </Button>
              <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setReverse(r)}>
                Reverse
              </Button>
            </div>
          ) : null
        }
      />
      <ReverseDialog row={reverse} onClose={() => setReverse(null)} onDone={refetch} />
      <ReassignDialog target={reassign} teams={teams} onClose={() => setReassign(null)} onDone={refetch} />
    </div>
  );
}

export function UnsoldPoolTab({ teams, refetch }: { teams: AuctionTeam[]; refetch: () => void }) {
  const fetcher = useCallback(() => fetchPlayersByStatus(getBrowserClient(), 'unsold'), []);
  const { data: unsold = [], refetch: refetchUnsold } = useRealtimeQuery<UnsoldPlayer[]>({
    key: 'admin-unsold',
    fetcher,
    subscriptions: [{ table: 'players' }],
    debounceMs: 400,
  });
  const [pending, setPending] = useState<string | null>(null);
  const [assign, setAssign] = useState<ReassignTarget | null>(null);
  return (
    <Card className="p-4">
      <h2 className="font-display text-2xl font-bold uppercase">Unsold pool</h2>
      <p className="mb-3 text-sm text-muted">
        Unsold players stay in the database. Return one to the pool (it can then be brought up in the current round) or place it directly on a team.
      </p>
      <PlayerList
        players={unsold}
        empty="No unsold players."
        renderAction={(p) => (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="secondary"
              loading={pending === p.id}
              onClick={async () => {
                setPending(p.id);
                const res = await rpc('set_player_status', { p_player_id: p.id, p_status: 'available' });
                setPending(null);
                if (res.ok) {
                  toast.success(`${p.full_name} is available again`);
                  void refetchUnsold();
                  refetch();
                } else toast.error(res.message);
              }}
            >
              Make available
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAssign({ playerId: p.id, playerName: p.full_name, currentTeamId: null, currentPrice: p.base_price })}>
              Assign
            </Button>
          </div>
        )}
      />
      <ReassignDialog
        target={assign}
        teams={teams}
        onClose={() => setAssign(null)}
        onDone={() => {
          void refetchUnsold();
          refetch();
        }}
      />
    </Card>
  );
}

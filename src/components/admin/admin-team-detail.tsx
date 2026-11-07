'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, IconBadge, PlayerStatusBadge, PositionBadge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton, TableWrap } from '@/components/ui/misc';
import { PlayerAvatar } from '@/components/ui/media';
import { Money, useMoney } from '@/components/ui/money';
import { TeamIdentity } from '@/components/team/team-identity';
import { TeamForm } from './team-form';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { rpc } from '@/lib/actions/rpc';
import { fetchTeamWithIdentity, type TeamWithIdentity } from '@/lib/queries/teams';
import { removeObject } from '@/lib/upload';
import { teamStyle } from '@/lib/color';
import type { Database, Tables } from '@/types/database';

type Finance = Tables<'v_team_finance'>;
type PlayerStatus = Database['public']['Enums']['player_status'];
interface RosterRow {
  id: string;
  source: Database['public']['Enums']['roster_source'];
  icon_slot: number | null;
  price: number;
  purchase_order: number | null;
  transaction_id: string | null;
  players: Pick<Tables<'players'>, 'id' | 'full_name' | 'photo_path' | 'primary_position' | 'secondary_position' | 'jersey_number' | 'status'> | null;
}
interface Data {
  team: TeamWithIdentity;
  owner: { id: string; full_name: string; photo_path: string | null } | null;
  finance: Finance | null;
  roster: RosterRow[];
  allTeams: Pick<Tables<'teams'>, 'id' | 'name' | 'primary_color' | 'purse_remaining'>[];
}

const HISTORY_TEXT: Record<string, string> = {
  fixtures: 'it already has fixtures',
  'roster purchases': 'it has bought players',
  'auction bids': 'it has auction bids',
  'auction transactions': 'it has auction transactions',
  'auction lots': 'it leads or led an auction lot',
};

export function AdminTeamDetail({ teamId }: { teamId: string }) {
  const tournament = useTournament();
  const router = useRouter();
  const money = useMoney();
  const { data, loading, error, refetch } = useRealtimeQuery<Data | null>({
    key: `admin-team-${teamId}`,
    subscriptions: [
      { table: 'teams' },
      { table: 'team_players', filter: `team_id=eq.${teamId}` },
      { table: 'team_owners', filter: `team_id=eq.${teamId}` },
      { table: 'players' },
    ],
    fetcher: async () => {
      const supabase = getBrowserClient();
      const team = await fetchTeamWithIdentity(supabase, teamId);
      if (!team) return null;
      const [owner, fin, roster, allTeams] = await Promise.all([
        supabase.from('team_owners').select('id, full_name, photo_path').eq('team_id', teamId).maybeSingle(),
        supabase.from('v_team_finance').select('*').eq('team_id', teamId).maybeSingle(),
        supabase
          .from('team_players')
          .select('id, source, icon_slot, price, purchase_order, transaction_id, players(id, full_name, photo_path, primary_position, secondary_position, jersey_number, status)')
          .eq('team_id', teamId),
        supabase.from('teams').select('id, name, primary_color, purse_remaining').order('sort_order').order('name'),
      ]);
      if (roster.error) throw new Error(roster.error.message);
      return {
        team,
        owner: owner.data ?? null,
        finance: fin.data ?? null,
        roster: (roster.data ?? []) as unknown as RosterRow[],
        allTeams: allTeams.data ?? [],
      };
    },
  });

  const [iconSlot, setIconSlot] = useState<1 | 2 | null>(null);
  const [reassign, setReassign] = useState<RosterRow | null>(null);
  const [reverse, setReverse] = useState<RosterRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [purse, setPurse] = useState('');
  const [purseSaving, setPurseSaving] = useState(false);

  useEffect(() => {
    if (data?.finance) setPurse(String(data.finance.purse_total));
  }, [data?.finance]);

  const jerseyConflicts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of data?.roster ?? []) {
      const j = r.players?.jersey_number;
      if (j !== null && j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, c]) => c > 1).map(([j]) => j));
  }, [data?.roster]);

  const sortedRoster = useMemo(
    () =>
      [...(data?.roster ?? [])].sort(
        (a, b) =>
          (a.source === 'icon' ? 0 : 1) - (b.source === 'icon' ? 0 : 1) ||
          (a.icon_slot ?? 0) - (b.icon_slot ?? 0) ||
          (b.price ?? 0) - (a.price ?? 0) ||
          (a.players?.full_name ?? '').localeCompare(b.players?.full_name ?? ''),
      ),
    [data?.roster],
  );

  if (loading && !data) return <Skeleton className="h-[60vh]" />;
  if (error && !data) return <ErrorState message="Could not load this team." onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <EmptyState>
        This team does not exist (it may have been deleted).{' '}
        <Link href="/admin/teams" className="text-accent underline">
          Back to teams
        </Link>
      </EmptyState>
    );
  }
  const { team, finance } = data;

  async function clearIcon(slot: 1 | 2) {
    const r = await rpc('set_icon_player', { p_team_id: teamId, p_slot: slot, p_player_id: null as unknown as string });
    if (!r.ok) toast.error(r.message);
    else {
      toast.success(`Icon player ${slot} cleared`);
      void refetch();
    }
  }

  async function savePurse(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(purse);
    if (!Number.isInteger(n) || n < 0) {
      toast.error('Enter a whole number.');
      return;
    }
    setPurseSaving(true);
    const r = await rpc('set_team_purse', { p_team_id: teamId, p_amount: n });
    setPurseSaving(false);
    if (!r.ok) {
      const min = r.detail?.minimum;
      toast.error(typeof min === 'number' ? `${r.message} Minimum: ${money(min)}.` : r.message);
      return;
    }
    toast.success('Purse updated');
    void refetch();
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    const r = await rpc<{ logo_path: string | null; owner_photo_path: string | null }>('delete_team', { p_team_id: teamId });
    setDeleting(false);
    if (!r.ok) {
      const reasons = Array.isArray(r.detail?.reasons) ? (r.detail?.reasons as string[]) : [];
      const msg =
        r.code === 'TEAM_HAS_HISTORY' && reasons.length
          ? `This team cannot be deleted because ${reasons.map((x) => HISTORY_TEXT[x] ?? x).join(', ')}.`
          : r.message;
      setDeleteError(msg);
      return;
    }
    void removeObject('team-logos', r.data.logo_path);
    void removeObject('team-logos', r.data.owner_photo_path);
    toast.success(`${team.name} deleted`);
    setConfirmDelete(false);
    router.push('/admin/teams');
  }

  const belowMin = finance && (finance.squad_count ?? 0) < finance.min_squad_size;

  return (
    <div style={teamStyle(team.primary_color, team.secondary_color)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/teams" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All teams
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/teams/${team.id}`}
            target="_blank"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border border-border px-4 text-sm font-semibold hover:border-accent"
          >
            Public page <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete team
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-display text-2xl font-bold uppercase">Edit team</h2>
            <TeamForm
              key={team.updated_at}
              tournamentId={tournament.id}
              team={team}
              owner={data.owner}
              otherTeams={data.allTeams}
              onSaved={() => void refetch()}
            />
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl font-bold uppercase">Icon players</h2>
            <p className="mb-4 text-sm text-muted">Two star players per team. Icon players are not auctioned and cost no purse.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([1, 2] as const).map((slot) => {
                const p = slot === 1 ? team.icon1 : team.icon2;
                return (
                  <div key={slot} className="flex items-center gap-3 rounded-btn border border-border bg-surface-2 p-3">
                    {p ? (
                      <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={52} icon />
                    ) : (
                      <span className="h-[52px] w-[52px] shrink-0 rounded-full border border-dashed border-border" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-muted">Icon Player {slot}</p>
                      <p className="truncate font-semibold" title={p?.full_name}>
                        {p?.full_name ?? <span className="font-normal text-muted">To be announced</span>}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setIconSlot(slot)}>
                        {p ? 'Change' : 'Assign'}
                      </Button>
                      {p && (
                        <Button size="sm" variant="ghost" onClick={() => void clearIcon(slot)} aria-label={`Clear icon player ${slot}`}>
                          <X className="h-4 w-4" aria-hidden /> Clear
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-bold uppercase">Roster</h2>
              <span className="text-sm text-muted">{data.roster.length} players</span>
            </div>
            {jerseyConflicts.size > 0 && (
              <p className="mb-3 flex items-center gap-2 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                Jersey conflict: {[...jerseyConflicts].map((j) => `#${j}`).join(', ')} used by more than one player (does not block anything).
              </p>
            )}
            {sortedRoster.length === 0 ? (
              <EmptyState>No players yet. Assign icon players above; auction purchases appear here automatically.</EmptyState>
            ) : (
              <TableWrap>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Pos</th>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedRoster.map((r) => {
                      const p = r.players;
                      if (!p) return null;
                      const conflict = p.jersey_number !== null && jerseyConflicts.has(p.jersey_number);
                      return (
                        <tr key={r.id}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={36} icon={r.source === 'icon'} />
                              <span className="max-w-[220px] truncate font-medium" title={p.full_name}>
                                {p.full_name}
                              </span>
                              {r.source === 'icon' && <IconBadge />}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex gap-1">
                              <PositionBadge position={p.primary_position} />
                              <PositionBadge position={p.secondary_position} secondary />
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular">
                            {p.jersey_number ?? '—'}
                            {conflict && (
                              <Badge className="ml-1 border-warning/50 text-yellow-200" title="Another roster player has the same jersey number">
                                Clash
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.source === 'icon' ? (
                              <span className="text-gold">Icon</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <Money amount={r.price} />
                                {r.source === 'manual' && <Badge className="text-[10px]">Adjusted</Badge>}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.source !== 'icon' && (
                              <span className="inline-flex gap-1">
                                <Button size="sm" variant="secondary" onClick={() => setReassign(r)}>
                                  Reassign
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setReverse(r)} disabled={!r.transaction_id}>
                                  Reverse sale
                                </Button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-t-4 border-t-[var(--team-visible)] p-5">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">Public card preview</p>
            <TeamIdentity team={team} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-2xl font-bold uppercase">Finance</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Initial purse', <Money key="a" amount={finance?.purse_total} />],
                ['Total spent', <Money key="b" amount={finance?.purse_spent} />],
                ['Remaining', <Money key="c" amount={finance?.purse_remaining} />],
                ['Max bid now', <Money key="d" amount={finance?.max_bid} />],
                ['Squad', `${finance?.squad_count ?? 0} / ${finance?.max_squad_size ?? '—'}`],
                ['Purchased', `${finance?.purchased_count ?? 0}`],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-btn bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-display text-xl font-bold tabular">{v}</dd>
                </div>
              ))}
            </dl>
            {finance && finance.purse_total > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, (finance.purse_spent / finance.purse_total) * 100)}%` }} />
              </div>
            )}
            {belowMin && (
              <p className="mt-3 text-sm text-yellow-200">
                Needs {(finance?.min_squad_size ?? 0) - (finance?.squad_count ?? 0)} more player(s) to reach the minimum squad.
              </p>
            )}
            <form onSubmit={savePurse} className="mt-4 flex items-end gap-2">
              <Field label={`Override purse (${tournament.currency_symbol})`} htmlFor="purse" className="flex-1" hint="Cannot be below what is already spent.">
                <Input id="purse" inputMode="numeric" value={purse} onChange={(e) => setPurse(e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
              <Button type="submit" variant="secondary" loading={purseSaving} className="mb-[22px]">
                Save
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {iconSlot && (
        <IconPicker
          teamId={teamId}
          slot={iconSlot}
          onClose={() => setIconSlot(null)}
          onDone={() => {
            setIconSlot(null);
            void refetch();
          }}
        />
      )}
      {reassign && (
        <ReassignDialog
          row={reassign}
          teams={data.allTeams}
          currentTeamId={teamId}
          onClose={() => setReassign(null)}
          onDone={() => {
            setReassign(null);
            void refetch();
          }}
        />
      )}
      {reverse && (
        <ReverseDialog
          row={reverse}
          teamName={team.name}
          onClose={() => setReverse(null)}
          onDone={() => {
            setReverse(null);
            void refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setDeleteError(null);
        }}
        title={`Delete ${team.name}?`}
        description="The team, its owner and logo are removed and its icon players become available again. Teams with fixtures or auction history cannot be deleted."
        confirmLabel="Delete team"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={doDelete}
      >
        {deleteError && (
          <p role="alert" className="rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {deleteError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

type PickPlayer = Pick<Tables<'players'>, 'id' | 'full_name' | 'photo_path' | 'primary_position' | 'secondary_position' | 'status'>;

function IconPicker({ teamId, slot, onClose, onDone }: { teamId: string; slot: 1 | 2; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickPlayer[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(async () => {
      let query = getBrowserClient()
        .from('players')
        .select('id, full_name, photo_path, primary_position, secondary_position, status')
        .in('status', ['available', 'unsold'])
        .order('full_name')
        .limit(20);
      const term = q.trim().replace(/[%_,()]/g, ' ');
      if (term) query = query.ilike('full_name', `%${term}%`);
      const { data } = await query;
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  async function pick(p: PickPlayer) {
    setPending(p.id);
    const r = await rpc('set_icon_player', { p_team_id: teamId, p_slot: slot, p_player_id: p.id });
    setPending(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${p.full_name} is icon player ${slot}`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Icon player ${slot}`} description="Only available or unsold players can become icon players.">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input autoFocus placeholder="Search players by name" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search players" />
      </div>
      <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-btn border border-border">
        {results === null ? (
          <li className="p-4 text-sm text-muted">Loading…</li>
        ) : results.length === 0 ? (
          <li className="p-4 text-sm text-muted">No available players match.</li>
        ) : (
          results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!!pending}
                onClick={() => void pick(p)}
                className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
              >
                <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={36} />
                <span className="min-w-0 flex-1 truncate font-medium">{p.full_name}</span>
                <PositionBadge position={p.primary_position} />
                <PlayerStatusBadge status={p.status as PlayerStatus} />
              </button>
            </li>
          ))
        )}
      </ul>
    </Dialog>
  );
}

function ReassignDialog({
  row,
  teams,
  currentTeamId,
  onClose,
  onDone,
}: {
  row: RosterRow;
  teams: Data['allTeams'];
  currentTeamId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [teamId, setTeamId] = useState(currentTeamId);
  const [price, setPrice] = useState(String(row.price));
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const money = useMoney();
  async function submit() {
    const n = Number(price);
    if (!Number.isInteger(n) || n < 0) {
      setErr('Enter a whole number price.');
      return;
    }
    if (!reason.trim()) {
      setErr('A reason is required.');
      return;
    }
    setPending(true);
    setErr(null);
    const r = await rpc('reassign_player', { p_player_id: row.players?.id ?? '', p_to_team_id: teamId, p_price: n, p_reason: reason.trim() });
    setPending(false);
    if (!r.ok) {
      const max = r.detail?.max_bid;
      setErr(typeof max === 'number' ? `${r.message} The team can spend at most ${money(max)}.` : r.message);
      return;
    }
    toast.success(`${row.players?.full_name} reassigned`);
    onDone();
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Reassign ${row.players?.full_name ?? 'player'}`}
      description="Reverses the current sale (refunding the purse) and records a manual assignment. Use the same team with a new price to fix a wrong price."
      confirmLabel="Reassign"
      loading={pending}
      onConfirm={submit}
    >
      <div className="space-y-3">
        <Field label="Team" htmlFor="ra-team">
          <Select id="ra-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === currentTeamId ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price" htmlFor="ra-price">
          <Input id="ra-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="Reason (required)" htmlFor="ra-reason">
          <Input id="ra-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-red-300">
            {err}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

function ReverseDialog({ row, teamName, onClose, onDone }: { row: RosterRow; teamName: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'available' | 'unsold'>('available');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!reason.trim()) {
      setErr('A reason is required.');
      return;
    }
    if (!row.transaction_id) return;
    setPending(true);
    setErr(null);
    const r = await rpc('reverse_sale', { p_transaction_id: row.transaction_id, p_reason: reason.trim(), p_return_status: status });
    setPending(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    toast.success(`Sale of ${row.players?.full_name} reversed`);
    onDone();
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reverse sale?"
      description={
        <>
          {row.players?.full_name} leaves {teamName} and <Money amount={row.price} /> is refunded to the purse.
        </>
      }
      confirmLabel="Reverse sale"
      confirmVariant="danger"
      loading={pending}
      onConfirm={submit}
    >
      <div className="space-y-3">
        <Field label="Player becomes" htmlFor="rv-status">
          <Select id="rv-status" value={status} onChange={(e) => setStatus(e.target.value as 'available' | 'unsold')}>
            <option value="available">Available (back in the auction pool)</option>
            <option value="unsold">Unsold</option>
          </Select>
        </Field>
        <Field label="Reason (required)" htmlFor="rv-reason">
          <Input id="rv-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-red-300">
            {err}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, PlayerStatusBadge, PositionBadge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton, TableWrap } from '@/components/ui/misc';
import { PlayerAvatar, TeamLogo } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { PlayerForm } from './player-form';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { rpc } from '@/lib/actions/rpc';
import { removeObject } from '@/lib/upload';
import { POSITIONS, POSITION_LABELS } from '@/lib/format';
import type { Database, Tables } from '@/types/database';

const PAGE_SIZE = 24;
type Status = Database['public']['Enums']['player_status'];
type Pos = Database['public']['Enums']['player_position'];
type TeamLink = { source: string; price: number; team_id: string; teams: Pick<Tables<'teams'>, 'name' | 'short_name' | 'logo_path' | 'primary_color'> | null };
type Row = Tables<'players'> & {
  /** player_id is unique on team_players, so PostgREST returns a single object (or null). */
  team_players: TeamLink | TeamLink[] | null;
};

function teamLink(r: Row): TeamLink | null {
  const tp = r.team_players;
  return Array.isArray(tp) ? (tp[0] ?? null) : tp;
}

interface Filters {
  q: string;
  position: Pos | '';
  includeSecondary: boolean;
  status: Status | '';
  teamId: string;
  sort: 'name' | 'price_desc' | 'price_asc' | 'position';
  page: number;
}

const INITIAL: Filters = { q: '', position: '', includeSecondary: false, status: '', teamId: '', sort: 'name', page: 1 };

export function AdminPlayers() {
  const t = useTournament();
  const [f, setF] = useState<Filters>(INITIAL);
  const [qInput, setQInput] = useState('');
  const [teams, setTeams] = useState<Pick<Tables<'teams'>, 'id' | 'name'>[]>([]);
  const [defaultBase, setDefaultBase] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Tables<'players'> | null | 'new'>(null);
  const [toDelete, setToDelete] = useState<Row[] | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);

  // Debounced server-side search (250 ms).
  useEffect(() => {
    const id = setTimeout(() => setF((cur) => (cur.q === qInput ? cur : { ...cur, q: qInput, page: 1 })), 250);
    return () => clearTimeout(id);
  }, [qInput]);

  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase
      .from('teams')
      .select('id, name')
      .order('sort_order')
      .order('name')
      .then(({ data }) => setTeams(data ?? []));
    void supabase
      .from('auction_settings')
      .select('default_base_price')
      .maybeSingle()
      .then(({ data }) => data && setDefaultBase(data.default_base_price));
  }, []);

  const fetcher = useCallback(async () => {
    const supabase = getBrowserClient();
    const sel = f.teamId
      ? '*, team_players!inner(source, price, team_id, teams(name, short_name, logo_path, primary_color))'
      : '*, team_players(source, price, team_id, teams(name, short_name, logo_path, primary_color))';
    let q = supabase.from('players').select(sel, { count: 'exact' });
    const term = f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    if (term) q = q.ilike('full_name', `%${term}%`);
    if (f.position) q = f.includeSecondary ? q.or(`primary_position.eq.${f.position},secondary_position.eq.${f.position}`) : q.eq('primary_position', f.position);
    if (f.status) q = q.eq('status', f.status);
    if (f.teamId) q = q.eq('team_players.team_id', f.teamId);
    if (f.sort === 'name') q = q.order('full_name');
    else if (f.sort === 'price_desc') q = q.order('base_price', { ascending: false }).order('full_name');
    else if (f.sort === 'price_asc') q = q.order('base_price').order('full_name');
    else q = q.order('primary_position').order('full_name');
    const from = (f.page - 1) * PAGE_SIZE;
    const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, [f]);

  const { data, loading, error, refetch } = useRealtimeQuery({
    key: `admin-players-${JSON.stringify(f)}`,
    subscriptions: [{ table: 'players' }, { table: 'team_players' }],
    fetcher,
    debounceMs: 500,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    setF((cur) => ({ ...cur, [k]: v, page: k === 'page' ? (v as number) : 1 }));
    if (k !== 'page') setSelected(new Set());
  }

  async function toggleStatus(r: Row) {
    const next: Status = r.status === 'available' ? 'unsold' : 'available';
    const res = await rpc('set_player_status', { p_player_id: r.id, p_status: next });
    if (!res.ok) toast.error(res.message);
    else {
      toast.success(`${r.full_name} marked ${next}`);
      void refetch();
    }
  }

  async function runDelete() {
    if (!toDelete) return;
    setDeleting(true);
    let deleted = 0;
    const refused: string[] = [];
    for (const r of toDelete) {
      const res = await rpc<{ photo_path: string | null }>('delete_player', { p_player_id: r.id, p_force: forceDelete });
      if (res.ok) {
        deleted++;
        void removeObject('player-photos', res.data.photo_path);
      } else refused.push(`${r.full_name}: ${res.message}`);
    }
    setDeleting(false);
    setToDelete(null);
    setForceDelete(false);
    setSelected(new Set());
    if (deleted) toast.success(`${deleted} player(s) deleted`);
    if (refused.length) toast.error(`${refused.length} refused. ${refused.slice(0, 3).join(' ')}${refused.length > 3 ? ' …' : ''}`, { duration: 10000 });
    void refetch();
  }

  return (
    <div>
      <PageHeader
        title="Players"
        subtitle={`${total} player${total === 1 ? '' : 's'}${f.q || f.position || f.status || f.teamId ? ' match the filters' : ' registered'}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/players/import"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-border bg-surface-2 px-4 text-sm hover:border-accent/60"
            >
              <Upload className="h-4 w-4" aria-hidden /> Import CSV / Excel
            </Link>
            <Button variant="secondary" onClick={() => setBulkPriceOpen(true)}>
              Set base price for all available
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden /> Add player
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search by name" placeholder="Search by name" value={qInput} onChange={(e) => setQInput(e.target.value)} className="pl-9" />
        </div>
        <div>
          <Select aria-label="Position" value={f.position} onChange={(e) => set('position', e.target.value as Pos | '')}>
            <option value="">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p} {POSITION_LABELS[p]}
              </option>
            ))}
          </Select>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={f.includeSecondary} onChange={(e) => set('includeSecondary', e.target.checked)} className="accent-[var(--accent)]" />
            Include secondary
          </label>
        </div>
        <Select aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value as Status | '')}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
          <option value="unsold">Unsold</option>
          <option value="icon">Icon</option>
        </Select>
        <Select aria-label="Team" value={f.teamId} onChange={(e) => set('teamId', e.target.value)}>
          <option value="">All teams</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" value={f.sort} onChange={(e) => set('sort', e.target.value as Filters['sort'])}>
          <option value="name">Sort: Name</option>
          <option value="price_desc">Sort: Base price (high to low)</option>
          <option value="price_asc">Sort: Base price (low to high)</option>
          <option value="position">Sort: Position</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-btn border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="danger" onClick={() => setToDelete(selectedRows)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {error && <ErrorState message="Could not load players." onRetry={() => void refetch()} />}
      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState>{total === 0 && !f.q && !f.position && !f.status && !f.teamId ? 'No players registered yet. Add one or import a CSV.' : 'No players match these filters.'}</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={(e) =>
                      setSelected((cur) => {
                        const n = new Set(cur);
                        pageIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id)));
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const tp = teamLink(r);
                return (
                  <tr key={r.id} className={selected.has(r.id) ? 'bg-accent/5' : undefined}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.full_name}`}
                        checked={selected.has(r.id)}
                        onChange={(e) =>
                          setSelected((cur) => {
                            const n = new Set(cur);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar photoPath={r.photo_path} name={r.full_name} size={36} icon={r.status === 'icon'} />
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate font-medium" title={r.full_name}>
                            {r.full_name}
                          </p>
                          <p className="text-xs text-muted">
                            {[r.age ? `${r.age} yrs` : null, r.height_cm ? `${r.height_cm} cm` : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1">
                        <PositionBadge position={r.primary_position} />
                        <PositionBadge position={r.secondary_position} secondary />
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular">{r.jersey_number ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Money amount={r.base_price} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <PlayerStatusBadge status={r.status} />
                        {(r.status === 'available' || r.status === 'unsold') && (
                          <button type="button" onClick={() => void toggleStatus(r)} className="text-xs text-muted underline hover:text-fg">
                            Mark {r.status === 'available' ? 'unsold' : 'available'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {tp?.teams ? (
                        <span className="inline-flex items-center gap-2">
                          <TeamLogo logoPath={tp.teams.logo_path} name={tp.teams.name} shortName={tp.teams.short_name} color={tp.teams.primary_color} size={24} />
                          <span className="max-w-[140px] truncate" title={tp.teams.name}>
                            {tp.teams.name}
                          </span>
                          {tp.source !== 'icon' && (
                            <Badge className="text-[10px]">
                              <Money amount={tp.price} />
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(r)} aria-label={`Edit ${r.full_name}`}>
                          <Pencil className="h-4 w-4" aria-hidden /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete([r])} aria-label={`Delete ${r.full_name}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-center gap-1">
          <Button size="sm" variant="ghost" disabled={f.page <= 1} onClick={() => set('page', f.page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - f.page) <= 2)
            .map((p, i, arr) => (
              <span key={p} className="inline-flex items-center">
                {i > 0 && p - (arr[i - 1] as number) > 1 && <span className="px-1 text-muted">…</span>}
                <Button size="sm" variant={p === f.page ? 'primary' : 'ghost'} aria-current={p === f.page ? 'page' : undefined} onClick={() => set('page', p)}>
                  {p}
                </Button>
              </span>
            ))}
          <Button size="sm" variant="ghost" disabled={f.page >= pages} onClick={() => set('page', f.page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? 'Add player' : 'Edit player'}
        className="max-w-xl"
      >
        {editing !== null && (
          <PlayerForm
            key={editing === 'new' ? 'new' : editing.id}
            tournamentId={t.id}
            player={editing === 'new' ? null : editing}
            defaultBasePrice={defaultBase}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void refetch();
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o) {
            setToDelete(null);
            setForceDelete(false);
          }
        }}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} players?` : `Delete ${toDelete?.[0]?.full_name ?? 'player'}?`}
        description="Auction history keeps its own copy of names and prices."
        confirmLabel={forceDelete ? 'Delete anyway' : 'Delete'}
        confirmVariant="danger"
        loading={deleting}
        onConfirm={runDelete}
      >
        {(() => {
          const locked = (toDelete ?? []).filter((r) => r.status === 'sold' || r.status === 'icon');
          return (
            <div className="space-y-3 text-sm">
              {locked.length > 0 && (
                <p className="rounded-btn border border-warning/40 bg-warning/10 px-3 py-2">
                  {locked.length === 1 ? `${locked[0]!.full_name} is` : `${locked.length} of these players are`} sold or an icon player.
                </p>
              )}
              <label className="flex items-start gap-3 rounded-btn border border-border bg-surface-2 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                />
                <span>
                  <span className="font-semibold">Delete even if sold, an icon, or on the auction block.</span>
                  <span className="block text-muted">
                    The sale is reversed and the team gets the money back; a live lot for the player is cancelled. Without this, such players are skipped.
                  </span>
                </span>
              </label>
            </div>
          );
        })()}
      </ConfirmDialog>

      {bulkPriceOpen && <BulkBasePrice defaultBase={defaultBase} onClose={() => setBulkPriceOpen(false)} onDone={() => void refetch()} />}
    </div>
  );
}

function BulkBasePrice({ defaultBase, onClose, onDone }: { defaultBase: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(defaultBase));
  const [count, setCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void getBrowserClient()
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available')
      .then(({ count: c }) => setCount(c ?? 0));
  }, []);
  async function run() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) {
      toast.error('Enter a whole number of at least 1.');
      return;
    }
    setPending(true);
    const r = await rpc<{ updated: number }>('bulk_set_base_price', { p_amount: n });
    setPending(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Base price updated for ${r.data.updated} player(s)`);
    onDone();
    onClose();
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Set base price for all available players"
      description={count === null ? 'Counting players…' : `This changes the base price of ${count} available player(s). Sold, unsold and icon players are not changed.`}
      confirmLabel={count === null ? 'Apply' : `Apply to ${count} player(s)`}
      loading={pending}
      confirmDisabled={count === 0}
      onConfirm={run}
    >
      <Field label="New base price" htmlFor="bulk-base">
        <Input id="bulk-base" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
      </Field>
    </ConfirmDialog>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { PlayerCard } from '@/components/player/player-card';
import { Input, Select } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { cn } from '@/components/ui/cn';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { POSITIONS, POSITION_LABELS } from '@/lib/format';
import {
  fetchPlayersPage,
  filtersToSearch,
  PLAYER_SORTS,
  PLAYERS_PAGE_SIZE,
  type PlayerFilters,
  type PlayerListItem,
  type PlayerSort,
} from '@/lib/queries/players';

interface PageData {
  rows: PlayerListItem[];
  total: number;
}

function pageList(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < last - 1) out.push('…');
  out.push(last);
  return out;
}

const STATUS_LABELS = { available: 'Available', sold: 'Sold', unsold: 'Unsold', icon: 'Icon' } as const;

export function PlayersBrowser({ initialFilters, initial, teams }: { initialFilters: PlayerFilters; initial: PageData; teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/players';
  const [filters, setFilters] = useState<PlayerFilters>(initialFilters);
  const [search, setSearch] = useState(initialFilters.q);
  const [pending, setPending] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const { data, status, error, refetch } = useRealtimeQuery<PageData>({
    key: 'players-page',
    initialData: initial,
    subscriptions: [{ table: 'players' }, { table: 'team_players' }],
    debounceMs: 500,
    fetcher: async () => {
      const res = await fetchPlayersPage(getBrowserClient(), filtersRef.current);
      setPending(false);
      return res;
    },
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.replace(`${pathname}${filtersToSearch(filters)}`, { scroll: false });
    setPending(true);
    void refetch();
  }, [filters, pathname, refetch, router]);

  // Debounced name search (250 ms).
  useEffect(() => {
    if (search === filters.q) return;
    const id = setTimeout(() => setFilters((f) => ({ ...f, q: search, page: 1 })), 250);
    return () => clearTimeout(id);
  }, [search, filters.q]);

  const update = useCallback((patch: Partial<PlayerFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch })), []);

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PLAYERS_PAGE_SIZE));
  const rows = data?.rows ?? [];
  const fromN = total === 0 ? 0 : (filters.page - 1) * PLAYERS_PAGE_SIZE + 1;
  const toN = Math.min(total, filters.page * PLAYERS_PAGE_SIZE);

  return (
    <div>
      <form className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="relative sm:col-span-2 lg:col-span-2">
          <label htmlFor="player-search" className="sr-only">
            Search players by name
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="player-search" type="search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" maxLength={80} />
        </div>
        <div>
          <label htmlFor="pos" className="sr-only">
            Position
          </label>
          <Select id="pos" value={filters.pos ?? ''} onChange={(e) => update({ pos: (e.target.value || null) as PlayerFilters['pos'] })}>
            <option value="">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p} {POSITION_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select id="status" value={filters.status ?? ''} onChange={(e) => update({ status: (e.target.value || null) as PlayerFilters['status'] })}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="team" className="sr-only">
            Team
          </label>
          <Select id="team" value={filters.team ?? ''} onChange={(e) => update({ team: e.target.value || null })}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">
            Sort
          </label>
          <Select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as PlayerSort })}>
            {Object.entries(PLAYER_SORTS).map(([v, l]) => (
              <option key={v} value={v}>
                Sort: {l}
              </option>
            ))}
          </Select>
        </div>
        <label className={cn('flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2 lg:col-span-6', !filters.pos && 'text-muted')}>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            checked={filters.sec}
            disabled={!filters.pos}
            onChange={(e) => update({ sec: e.target.checked })}
          />
          Include players whose secondary position matches
        </label>
      </form>

      <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {total === 0 ? 'No players' : `Showing ${fromN}–${toN} of ${total} players`}
        </p>
        <ConnectionIndicator status={status} />
      </div>

      {error && <ErrorState message="Could not load players." onRetry={() => void refetch()} />}
      {pending && rows.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>{filters.q || filters.pos || filters.status || filters.team ? 'No players match these filters.' : 'No players have been registered yet.'}</EmptyState>
      ) : (
        <ul className={cn('grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', pending && 'opacity-60')}>
          {rows.map((p) => (
            <li key={p.id}>
              <PlayerCard player={p} />
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-btn border border-border disabled:opacity-40"
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            disabled={filters.page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageList(filters.page, lastPage).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 text-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, page: p }))}
                aria-current={p === filters.page ? 'page' : undefined}
                className={cn(
                  'h-11 min-w-[44px] rounded-btn border px-3 text-sm font-semibold tabular',
                  p === filters.page ? 'border-accent bg-accent text-accent-contrast' : 'border-border hover:border-accent',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-btn border border-border disabled:opacity-40"
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            disabled={filters.page >= lastPage}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

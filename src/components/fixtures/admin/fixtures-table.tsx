'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarClock, PauseCircle, Pencil, Radio, Star, Trash2 } from 'lucide-react';
import { StatusChip } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/field';
import { EmptyState, TableWrap } from '@/components/ui/misc';
import { TeamLogo } from '@/components/ui/media';
import { cn } from '@/components/ui/cn';
import { useTournament } from '@/components/providers/tournament-context';
import { formatInTournamentTz } from '@/lib/format';
import { fixtureScore, slotText, type FixtureTeam, type FixtureView } from '@/lib/queries/fixtures';

export type RowAction = 'edit' | 'postpone' | 'reschedule' | 'delete' | 'feature';

function ActionButton({
  label,
  onClick,
  disabled,
  children,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-btn border border-border text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-30',
        active && 'border-gold/60 text-gold hover:text-gold',
        danger && 'hover:border-danger/60 hover:text-red-300',
      )}
    >
      {children}
    </button>
  );
}

function TeamCell({ team, f, side }: { team: FixtureTeam | null; f: FixtureView; side: 'home' | 'away' }) {
  if (!team) return <span className="italic text-muted">{slotText(f, side)}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={24} />
      <span className="truncate" title={team.name}>
        {team.name}
      </span>
    </span>
  );
}

export function AdminFixturesTable({
  fixtures,
  teams,
  featuredId,
  onAction,
}: {
  fixtures: FixtureView[];
  teams: FixtureTeam[];
  featuredId: string | null;
  onAction: (a: RowAction, f: FixtureView) => void;
}) {
  const t = useTournament();
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const num = q.trim().replace(/^m/i, '');
    return fixtures.filter(
      (f) =>
        (!team || f.home_team_id === team || f.away_team_id === team) &&
        (!status || f.status === status || (status === 'unscheduled' && !f.scheduled_at && f.status === 'upcoming')) &&
        (!stage || f.stage === stage) &&
        (!num || String(f.match_number) === num || (f.venue ?? '').toLowerCase().includes(q.trim().toLowerCase())),
    );
  }, [fixtures, team, status, stage, q]);

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="unscheduled">Upcoming without a date</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
          <option value="postponed">Postponed</option>
        </Select>
        <Select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">League and playoffs</option>
          <option value="league">League</option>
          <option value="playoff">Playoffs</option>
        </Select>
        <Input aria-label="Search match number or venue" placeholder="Match # or venue" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="mb-2 text-xs text-muted">
        Showing {rows.length} of {fixtures.length}. Times in {t.timezone}.
      </p>
      {rows.length === 0 ? (
        <EmptyState>No fixtures match these filters.</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Date and time</th>
                <th className="px-3 py-2.5">Home</th>
                <th className="px-3 py-2.5">Away</th>
                <th className="px-3 py-2.5">Venue</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Score</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const s = fixtureScore(f);
                const editable = f.status === 'upcoming' || f.status === 'postponed';
                const featured = featuredId === f.id;
                return (
                  <tr key={f.id} className={cn('border-t border-border', featured && 'bg-gold/5')}>
                    <td className="px-3 py-2 font-display text-base font-bold">
                      <Link href={`/matches/${f.id}`} className="hover:text-accent" target="_blank" rel="noopener noreferrer">
                        M{f.match_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{f.stage === 'playoff' ? (f.node?.label ?? 'Playoff') : f.round_number ? `Round ${f.round_number}` : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {f.scheduled_at ? (
                        <span className={cn(f.status === 'postponed' && 'text-muted line-through')}>
                          {formatInTournamentTz(f.scheduled_at, 'EEE d MMM, h:mm a', t.timezone)}
                        </span>
                      ) : (
                        <span className="text-yellow-200/90">No date</span>
                      )}
                    </td>
                    <td className="max-w-[180px] px-3 py-2">
                      <TeamCell team={f.home} f={f} side="home" />
                    </td>
                    <td className="max-w-[180px] px-3 py-2">
                      <TeamCell team={f.away} f={f} side="away" />
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-muted" title={f.venue ?? ''}>
                      {f.venue ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={f.status} />
                      {f.status === 'postponed' && f.postponed_reason && (
                        <p className="mt-1 max-w-[180px] truncate text-xs text-muted" title={f.postponed_reason}>
                          {f.postponed_reason}
                        </p>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-display text-base font-bold">{s ? `${s.home}–${s.away}` : ''}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <ActionButton label={featured ? 'Clear Match of the Day' : 'Set as Match of the Day'} active={featured} onClick={() => onAction('feature', f)}>
                          <Star className={cn('h-4 w-4', featured && 'fill-current')} />
                        </ActionButton>
                        <ActionButton label="Edit" disabled={!editable} onClick={() => onAction('edit', f)}>
                          <Pencil className="h-4 w-4" />
                        </ActionButton>
                        {f.status === 'postponed' ? (
                          <ActionButton label="Reschedule" onClick={() => onAction('reschedule', f)}>
                            <CalendarClock className="h-4 w-4" />
                          </ActionButton>
                        ) : (
                          <ActionButton label="Postpone" disabled={f.status !== 'upcoming'} onClick={() => onAction('postpone', f)}>
                            <PauseCircle className="h-4 w-4" />
                          </ActionButton>
                        )}
                        <ActionButton label={f.stage === 'playoff' ? 'Reset playoff match' : 'Delete'} danger onClick={() => onAction('delete', f)}>
                          <Trash2 className="h-4 w-4" />
                        </ActionButton>
                        <Link
                          href={`/admin/live/${f.id}`}
                          title="Open scoring console"
                          aria-label={`Open scoring console for M${f.match_number}`}
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-btn border border-border text-muted hover:text-fg',
                            f.status === 'live' && 'border-danger/60 text-red-300',
                          )}
                        >
                          <Radio className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
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

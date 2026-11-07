'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, RefreshCw, Shuffle, TriangleAlert, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { rpc } from '@/lib/actions/rpc';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchPlayoffs, type PlayoffsData } from '@/lib/queries/playoffs';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { FORMAT_LABELS, FORMAT_TEAMS, supportsThirdPlace, type PlayoffFormat } from '@/lib/domain/bracket';
import { PLAYOFF_SUBSCRIPTIONS } from '@/components/bracket/playoffs-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, StatusChip } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { EmptyState, TableWrap } from '@/components/ui/misc';
import { TzDate } from '@/components/ui/time';

const COUNTS = [2, 4, 6, 8] as const;
const FORMATS_BY_COUNT: Record<number, PlayoffFormat[]> = {
  2: ['direct_final'],
  4: ['semis_final', 'ipl_page'],
  6: ['single_elim_6'],
  8: ['single_elim_8'],
};

export function PlayoffsAdmin({ initial }: { initial: PlayoffsData }) {
  const { data, refetch } = useRealtimeQuery<PlayoffsData>({
    key: 'admin-playoffs',
    initialData: initial,
    fetcher: () => fetchPlayoffs(getBrowserClient()),
    subscriptions: [...PLAYOFF_SUBSCRIPTIONS, { table: 'playoff_settings' }, { table: 'teams' }],
  });
  const d = data ?? initial;
  const teamCount = Object.keys(d.teams).length;
  const s = d.settings;

  const [count, setCount] = useState<number>(s?.qualifying_teams ?? 4);
  const [format, setFormat] = useState<PlayoffFormat>(s?.format ?? 'semis_final');
  const [third, setThird] = useState<boolean>(s?.third_place_match ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const allowed = FORMATS_BY_COUNT[count] ?? [];
    if (!allowed.includes(format)) setFormat(allowed[0] ?? 'semis_final');
  }, [count, format]);

  const dirty = !!s && (s.format !== format || s.qualifying_teams !== count || s.third_place_match !== (third && supportsThirdPlace(format)));
  const generated = d.nodes.length > 0;
  const b = d.bracket;
  const settingsDiffer =
    generated && !!b && !!s && (b.format !== s.format || b.qualifying_teams !== s.qualifying_teams || b.third_place_match !== s.third_place_match);

  async function saveSettings() {
    setSaving(true);
    const res = await rpc('save_playoff_settings', {
      p_settings: { format, qualifying_teams: count, third_place_match: third && supportsThirdPlace(format) },
    });
    setSaving(false);
    if (!res.ok) toast.error(res.message);
    else {
      toast.success(generated ? 'Settings saved. Regenerate the bracket to apply them.' : 'Playoff settings saved.');
      void refetch();
    }
  }

  async function generate(replace: boolean) {
    setGenerating(true);
    const res = await rpc('generate_playoff_bracket', { p_replace: replace });
    setGenerating(false);
    setConfirmRegen(false);
    if (!res.ok) {
      toast.error(res.code === 'TEAMS_NOT_ENOUGH' ? `Not enough teams: the format needs ${count}.` : res.message);
      return;
    }
    toast.success(replace ? 'Bracket regenerated.' : 'Bracket generated.');
    void refetch();
  }

  async function refreshSeeds() {
    setRefreshing(true);
    const res = await rpc('refresh_seeds');
    setRefreshing(false);
    if (!res.ok) toast.error(res.message);
    else {
      toast.success(d.playoffsStarted ? 'Playoffs have started: seeds were kept, the bracket was re-checked.' : 'Seeds refreshed from the standings.');
      void refetch();
    }
  }

  const seeds = useMemo(() => (Array.isArray(b?.seeds) ? (b?.seeds as { seed: number; team_id: string }[]) : []), [b?.seeds]);
  const n = b?.qualifying_teams ?? count;
  const topNow = d.standings.slice(0, n);
  const seedDiff = useMemo(() => {
    if (!d.playoffsStarted || seeds.length === 0) return [];
    return topNow
      .map((st) => ({ rank: st.rank, now: st.team_id, seeded: seeds.find((x) => x.seed === st.rank)?.team_id ?? null }))
      .filter((x) => x.now !== x.seeded);
  }, [d.playoffsStarted, seeds, topNow]);
  const name = (id: string | null | undefined) => (id ? (d.teams[id]?.name ?? 'Unknown team') : 'TBD');

  return (
    <div className="space-y-6">
      {settingsDiffer && (
        <div role="alert" className="flex items-center gap-3 rounded-card border border-[rgba(234,179,8,0.5)] bg-[rgba(234,179,8,0.1)] p-4 text-sm">
          <TriangleAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden />
          <span className="flex-1">Settings changed: regenerate the bracket to apply them (only possible before any playoff match starts).</span>
        </div>
      )}
      {seedDiff.length > 0 && (
        <div role="alert" className="rounded-card border border-[rgba(234,179,8,0.5)] bg-[rgba(234,179,8,0.1)] p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-5 w-5 text-warning" aria-hidden /> League results changed after playoffs started: seeds were kept
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-8 text-muted">
            {seedDiff.map((x) => (
              <li key={x.rank}>
                Seed {x.rank}: bracket has <b className="text-fg">{name(x.seeded)}</b>, current standings have <b className="text-fg">{name(x.now)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Format</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Qualifying teams" htmlFor="q-count" hint={`${teamCount} team(s) exist`}>
              <Select id="q-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {COUNTS.filter((c) => c <= Math.max(teamCount, 2) || c === s?.qualifying_teams).map((c) => (
                  <option key={c} value={c} disabled={c > teamCount}>
                    Top {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" htmlFor="q-format">
              <Select id="q-format" value={format} onChange={(e) => setFormat(e.target.value as PlayoffFormat)}>
                {(FORMATS_BY_COUNT[count] ?? []).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className={`flex min-h-[44px] items-center gap-3 ${supportsThirdPlace(format) ? '' : 'opacity-50'}`}>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              disabled={!supportsThirdPlace(format)}
              checked={third && supportsThirdPlace(format)}
              onChange={(e) => setThird(e.target.checked)}
            />
            Third-place match {supportsThirdPlace(format) ? '' : '(only for formats with semifinals)'}
          </label>
          <p className="text-sm text-muted">
            {FORMAT_TEAMS[format]} teams qualify. Every round is a single match; playoff matches cannot end level. Saving does not change an existing
            bracket.
          </p>
          <Button onClick={saveSettings} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Bracket</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="font-semibold capitalize">{(b?.status ?? 'not_generated').replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted">Generated</dt>
              <dd className="font-semibold">{b?.generated_at ? <TzDate iso={b.generated_at} pattern="d MMM yyyy, h:mm a" /> : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">League</dt>
              <dd className="font-semibold">{d.leagueFixtures === 0 ? 'No fixtures yet' : d.leagueComplete ? 'Complete' : 'In progress'}</dd>
            </div>
            <div>
              <dt className="text-muted">Seeds</dt>
              <dd className="font-semibold">{seeds.length ? `${seeds.length} frozen` : 'Not decided yet'}</dd>
            </div>
          </dl>
          {seeds.length > 0 && (
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {seeds.map((x) => {
                const t = d.teams[x.team_id];
                return (
                  <li key={x.seed} className="flex items-center gap-2 rounded-btn bg-surface-2 px-2 py-1.5 text-sm">
                    <Badge>#{x.seed}</Badge>
                    {t && <TeamLogo logoPath={t.logo_path} name={t.name} shortName={t.short_name} color={t.primary_color} size={22} />}
                    <span className="truncate">{name(x.team_id)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            {generated ? (
              <Button variant="secondary" onClick={() => setConfirmRegen(true)} disabled={d.playoffsStarted} title={d.playoffsStarted ? 'Playoff matches have started' : undefined}>
                <Shuffle className="h-4 w-4" aria-hidden /> Regenerate bracket
              </Button>
            ) : (
              <Button onClick={() => generate(false)} loading={generating}>
                <Trophy className="h-4 w-4" aria-hidden /> Generate bracket
              </Button>
            )}
            <Button variant="secondary" onClick={refreshSeeds} loading={refreshing} disabled={!generated}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh seeds
            </Button>
            <Link href="/playoffs" target="_blank" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn px-3 text-sm text-muted hover:text-fg">
              Public bracket <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <p className="text-xs text-muted">
            Seeds fill automatically when the last league match is completed (and update after league corrections until a playoff match starts).
          </p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold uppercase">Playoff matches</h2>
        {!generated ? (
          <EmptyState>Generate the bracket to create the playoff fixtures.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2">Round</th>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Home</th>
                  <th className="px-3 py-2">Away</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {d.nodes.map((nd) => {
                  const f = nd.fixture;
                  const src = (kind: string, ref: string) => (kind === 'seed' ? `Seed ${ref}` : `${kind === 'winner_of' ? 'Winner' : 'Loser'} of ${ref}`);
                  return (
                    <tr key={nd.id} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold">{nd.label}</td>
                      <td className="px-3 py-2 text-muted">{f ? `#${f.match_number}` : '—'}</td>
                      <td className="px-3 py-2">{f?.home_team_id ? name(f.home_team_id) : <span className="text-muted">{src(nd.home_kind, nd.home_ref)}</span>}</td>
                      <td className="px-3 py-2">{f?.away_team_id ? name(f.away_team_id) : <span className="text-muted">{src(nd.away_kind, nd.away_ref)}</span>}</td>
                      <td className="px-3 py-2">{f?.scheduled_at ? <TzDate iso={f.scheduled_at} pattern="EEE d MMM, h:mm a" /> : <span className="text-muted">Not scheduled</span>}</td>
                      <td className="px-3 py-2">
                        {f && <StatusChip status={f.status} />}
                        {nd.result && (
                          <span className="ml-2 tabular text-muted">
                            {nd.result.home_score}-{nd.result.away_score}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Link href="/admin/fixtures" className="inline-flex min-h-[36px] items-center gap-1 rounded-btn border border-border px-2.5 text-xs font-semibold hover:border-accent">
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Schedule
                          </Link>
                          {f && (
                            <Link
                              href={`/admin/live/${f.id}`}
                              aria-disabled={!f.home_team_id || !f.away_team_id}
                              className={`inline-flex min-h-[36px] items-center rounded-btn border border-border px-2.5 text-xs font-semibold hover:border-accent ${!f.home_team_id || !f.away_team_id ? 'pointer-events-none opacity-40' : ''}`}
                            >
                              Score
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="Regenerate bracket?"
        description="All playoff fixtures will be deleted and recreated with the saved settings. Dates you set on them are lost. This is only possible before any playoff match starts."
        confirmLabel="Regenerate"
        confirmVariant="danger"
        loading={generating}
        onConfirm={() => generate(true)}
      />
    </div>
  );
}

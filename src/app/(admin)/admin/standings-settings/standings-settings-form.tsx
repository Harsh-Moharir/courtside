'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { rpc, write } from '@/lib/actions/rpc';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchStandings, TIEBREAKER_LABELS, type StandingsData } from '@/lib/queries/standings';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { FALLBACK_NOTE } from '@/lib/domain/standings';
import { fieldErrors } from '@/lib/errors';
import type { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { cn } from '@/components/ui/cn';

type Tiebreaker = Database['public']['Enums']['tiebreaker'];
const ALL: Tiebreaker[] = ['head_to_head', 'point_difference', 'points_for', 'points_against_lowest', 'wins'];

interface TbItem {
  key: Tiebreaker;
  enabled: boolean;
}

function initialItems(order: Tiebreaker[]): TbItem[] {
  return [...order.map((k) => ({ key: k, enabled: true })), ...ALL.filter((k) => !order.includes(k)).map((k) => ({ key: k, enabled: false }))];
}

export function StandingsSettingsForm({ initial }: { initial: StandingsData }) {
  const { data, refetch } = useRealtimeQuery<StandingsData>({
    key: 'admin-standings',
    initialData: initial,
    fetcher: () => fetchStandings(getBrowserClient()),
    subscriptions: [{ table: 'standings' }, { table: 'points_settings' }, { table: 'teams' }],
  });
  const d = data ?? initial;
  const s = d.settings;
  const [win, setWin] = useState(String(s?.win_points ?? 2));
  const [loss, setLoss] = useState(String(s?.loss_points ?? 0));
  const [draw, setDraw] = useState(String(s?.draw_points ?? 1));
  const [allowDraws, setAllowDraws] = useState(s?.allow_draws ?? false);
  const [forfeit, setForfeit] = useState(String(s?.forfeit_score ?? 20));
  const [items, setItems] = useState<TbItem[]>(initialItems(s?.tiebreaker_order ?? ['head_to_head', 'point_difference', 'points_for']));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const enabledCount = items.filter((i) => i.enabled).length;

  function move(i: number, dir: -1 | 1) {
    setItems((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j] as TbItem, next[i] as TbItem];
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const w = Number(win);
    const l = Number(loss);
    const dr = Number(draw);
    const f = Number(forfeit);
    const local: Record<string, string> = {};
    for (const [k, v] of Object.entries({ win_points: w, loss_points: l, draw_points: dr, forfeit_score: f })) {
      if (!Number.isInteger(v) || v < 0) local[k] = 'Whole number, 0 or more';
    }
    if (!local.draw_points && !(l <= dr && dr <= w)) local.draw_points = 'Loss ≤ draw ≤ win';
    if (!local.forfeit_score && (f < 1 || f > 999)) local.forfeit_score = '1 to 999';
    if (enabledCount < 1) local.tiebreaker_order = 'Enable at least one tiebreaker';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    const res = await rpc('save_points_settings', {
      p_settings: {
        win_points: w,
        loss_points: l,
        draw_points: dr,
        allow_draws: allowDraws,
        forfeit_score: f,
        tiebreaker_order: items.filter((i) => i.enabled).map((i) => i.key),
      },
    });
    setSaving(false);
    if (!res.ok) {
      setErrors(fieldErrors(res));
      const drawn = res.detail?.drawn_matches;
      setFormError(
        res.code === 'SETTINGS_CONFLICT' && Array.isArray(drawn)
          ? `Draws cannot be turned off while completed matches are drawn: match ${drawn.join(', ')}. Correct those results first.`
          : res.message,
      );
      return;
    }
    toast.success('Points settings saved. Standings recalculated.');
    void refetch();
  }

  async function rebuild() {
    setRebuilding(true);
    const res = await rpc('rebuild_standings');
    setRebuilding(false);
    if (!res.ok) toast.error(res.message);
    else {
      toast.success('Standings rebuilt from stored results.');
      void refetch();
    }
  }

  // Warning (9.4): ranks N and N+1 separated only by the fallback.
  const cutoffWarning = useMemo(() => {
    const n = d.qualifying;
    const a = d.rows.find((r) => r.rank === n);
    const b = d.rows.find((r) => r.rank === n + 1);
    if (!a || !b) return null;
    if (a.league_points === b.league_points && b.tiebreak_note === FALLBACK_NOTE) {
      return `${a.team.name} (rank ${n}) and ${b.team.name} (rank ${n + 1}) are level on every tiebreaker. The playoff cut-off is currently decided by the admin ranking or name. Set a manual tiebreak rank below to decide it explicitly.`;
    }
    return null;
  }, [d]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <form onSubmit={save} className="space-y-5" noValidate>
          <h2 className="font-display text-2xl font-bold uppercase">Points system</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Win" htmlFor="win" error={errors.win_points}>
              <Input id="win" inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} />
            </Field>
            <Field label="Loss" htmlFor="loss" error={errors.loss_points}>
              <Input id="loss" inputMode="numeric" value={loss} onChange={(e) => setLoss(e.target.value)} />
            </Field>
            <Field label="Draw" htmlFor="draw" error={errors.draw_points}>
              <Input id="draw" inputMode="numeric" value={draw} onChange={(e) => setDraw(e.target.value)} />
            </Field>
            <Field label="Forfeit score" htmlFor="forfeit" error={errors.forfeit_score} hint="Awarded as N-0">
              <Input id="forfeit" inputMode="numeric" value={forfeit} onChange={(e) => setForfeit(e.target.value)} />
            </Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={allowDraws} onChange={(e) => setAllowDraws(e.target.checked)} />
            <span>
              Allow draws <span className="text-sm text-muted">(off by default: basketball goes to overtime; playoffs never allow draws)</span>
            </span>
          </label>

          <div>
            <h3 className="font-display text-xl font-bold uppercase">Tiebreakers</h3>
            <p className="mb-3 text-sm text-muted">
              Applied in order to teams level on points; head-to-head is re-applied to the teams still tied (FIBA style). Teams level on every
              criterion are ordered by manual rank, then name.
            </p>
            <ol className="space-y-2">
              {items.map((it, i) => (
                <li key={it.key} className={cn('flex items-center gap-3 rounded-btn border border-border bg-surface-2 px-3 py-2', !it.enabled && 'opacity-60')}>
                  <span className="w-6 font-display text-lg font-bold text-accent">{it.enabled ? items.filter((x, j) => x.enabled && j <= i).length : '–'}</span>
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--accent)]"
                      checked={it.enabled}
                      onChange={(e) => setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, enabled: e.target.checked } : x)))}
                    />
                    {TIEBREAKER_LABELS[it.key]}
                  </label>
                  <Button size="sm" variant="ghost" aria-label={`Move ${TIEBREAKER_LABELS[it.key]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${TIEBREAKER_LABELS[it.key]} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
            {errors.tiebreaker_order && <p className="mt-2 text-xs text-red-300">{errors.tiebreaker_order}</p>}
          </div>
          {formError && (
            <p role="alert" className="rounded-btn border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-sm">
              {formError}
            </p>
          )}
          <Button type="submit" loading={saving} size="lg">
            Save and recalculate
          </Button>
        </form>
      </Card>

      <div className="space-y-6">
        {cutoffWarning && (
          <div role="alert" className="flex gap-3 rounded-card border border-[rgba(234,179,8,0.5)] bg-[rgba(234,179,8,0.1)] p-4 text-sm">
            <TriangleAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden />
            <p>{cutoffWarning}</p>
          </div>
        )}
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold uppercase">Manual tiebreak rank</h2>
            <Button variant="secondary" onClick={rebuild} loading={rebuilding}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Rebuild standings
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted">
            Last resort only: used when teams are level on points and every tiebreaker. Lower number ranks higher. Leave blank for alphabetical.
          </p>
          <ManualRanks data={d} onSaved={() => void refetch()} />
        </Card>
      </div>
    </div>
  );
}

function ManualRanks({ data, onSaved }: { data: StandingsData; onSaved: () => void }) {
  const teams = useMemo(() => [...data.rows].sort((a, b) => a.rank - b.rank), [data.rows]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map((r) => [r.team_id, r.team.manual_tiebreak_rank === null ? '' : String(r.team.manual_tiebreak_rank)])),
  );
  const [saving, setSaving] = useState(false);

  async function saveAll() {
    const changes = teams.filter((r) => {
      const v = values[r.team_id] ?? '';
      const cur = r.team.manual_tiebreak_rank === null ? '' : String(r.team.manual_tiebreak_rank);
      return v.trim() !== cur;
    });
    for (const r of changes) {
      const v = (values[r.team_id] ?? '').trim();
      if (v !== '' && (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 99)) {
        toast.error(`${r.team.name}: use a whole number from 1 to 99, or leave blank.`);
        return;
      }
    }
    if (!changes.length) {
      toast.message('Nothing to save.');
      return;
    }
    setSaving(true);
    const supabase = getBrowserClient();
    for (const r of changes) {
      const v = (values[r.team_id] ?? '').trim();
      const res = await write(supabase.from('teams').update({ manual_tiebreak_rank: v === '' ? null : Number(v) }).eq('id', r.team_id).select('id'));
      if (!res.ok) {
        setSaving(false);
        toast.error(`${r.team.name}: ${res.message}`);
        return;
      }
    }
    setSaving(false);
    toast.success('Manual ranks saved. Standings recalculated.');
    onSaved();
  }

  if (!teams.length) return <p className="text-sm text-muted">No teams yet.</p>;
  return (
    <div>
      <ul className="divide-y divide-border">
        {teams.map((r) => (
          <li key={r.team_id} className="flex items-center gap-3 py-2">
            <span className="w-6 text-right font-display font-bold text-muted">{r.rank}</span>
            <TeamLogo logoPath={r.team.logo_path} name={r.team.name} shortName={r.team.short_name} color={r.team.primary_color} size={28} />
            <span className="min-w-0 flex-1 truncate font-semibold" title={r.team.name}>
              {r.team.name}
            </span>
            <span className="hidden text-xs text-muted sm:inline">{r.league_points} pts</span>
            <label className="sr-only" htmlFor={`mr-${r.team_id}`}>
              Manual rank for {r.team.name}
            </label>
            <Input
              id={`mr-${r.team_id}`}
              inputMode="numeric"
              className="w-20 text-center"
              placeholder="—"
              value={values[r.team_id] ?? ''}
              onChange={(e) => setValues((cur) => ({ ...cur, [r.team_id]: e.target.value }))}
            />
          </li>
        ))}
      </ul>
      <Button className="mt-4" onClick={saveAll} loading={saving}>
        Save manual ranks
      </Button>
    </div>
  );
}

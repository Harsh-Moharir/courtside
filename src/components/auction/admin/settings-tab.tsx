'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { Money } from '@/components/ui/money';
import { rpc } from '@/lib/actions/rpc';
import { describeTiers } from '@/lib/domain/money';
import { fieldErrors } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useTournament } from '@/components/providers/tournament-context';
import type { Json } from '@/types/database';
import type { AuctionSnapshot, AuctionTeam } from '@/lib/queries/auction';

type Form = {
  purse_per_team: string;
  default_base_price: string;
  min_squad_size: string;
  max_squad_size: string;
  icon_counts_in_squad: boolean;
  reserve_per_slot: string;
  max_rounds: string;
  unsold_rule: 'manual_reenter' | 'auto_reenter' | 'no_reenter';
  unsold_base_price_reduction_pct: string;
};

function toForm(s: AuctionSnapshot['settings']): Form | null {
  if (!s) return null;
  return {
    purse_per_team: String(s.purse_per_team),
    default_base_price: String(s.default_base_price),
    min_squad_size: String(s.min_squad_size),
    max_squad_size: String(s.max_squad_size),
    icon_counts_in_squad: s.icon_counts_in_squad,
    reserve_per_slot: String(s.reserve_per_slot),
    max_rounds: String(s.max_rounds),
    unsold_rule: s.unsold_rule,
    unsold_base_price_reduction_pct: String(s.unsold_base_price_reduction_pct),
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function SettingsTab({ snap, refetch }: { snap: AuctionSnapshot; refetch: () => Promise<void> }) {
  const t = useTournament();
  const [form, setForm] = useState<Form | null>(() => toForm(snap.settings));
  const [tiers, setTiers] = useState<{ from_amount: string; step: string }[]>(() =>
    snap.tiers.map((x) => ({ from_amount: String(x.from_amount), step: String(x.step) })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setForm(toForm(snap.settings));
      setTiers(snap.tiers.map((x) => ({ from_amount: String(x.from_amount), step: String(x.step) })));
    }
  }, [snap.settings, snap.tiers, dirty]);

  if (!form) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setDirty(true);
    setForm({ ...form, [k]: v });
  };
  const parsedTiers = tiers
    .map((x) => ({ from_amount: Number(x.from_amount), step: Number(x.step) }))
    .filter((x) => Number.isFinite(x.from_amount) && Number.isFinite(x.step));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    const settings = {
      purse_per_team: num(form.purse_per_team),
      default_base_price: num(form.default_base_price),
      min_squad_size: num(form.min_squad_size),
      max_squad_size: num(form.max_squad_size),
      icon_counts_in_squad: form.icon_counts_in_squad,
      reserve_per_slot: num(form.reserve_per_slot),
      max_rounds: num(form.max_rounds),
      unsold_rule: form.unsold_rule,
      unsold_base_price_reduction_pct: num(form.unsold_base_price_reduction_pct),
    };
    const sortedTiers = [...parsedTiers].sort((a, b) => a.from_amount - b.from_amount);
    const res = await rpc('save_auction_settings', { p_settings: settings as unknown as Json, p_tiers: sortedTiers as unknown as Json });
    setSaving(false);
    if (res.ok) {
      toast.success('Auction settings saved');
      setDirty(false);
      void refetch();
    } else {
      setErrors(fieldErrors(res));
      const extra = res.code === 'SETTINGS_CONFLICT' && res.detail ? ` (${String(res.detail.field ?? '')})` : '';
      toast.error(res.message + extra);
    }
  }

  const notStarted = snap.state?.status === 'not_started';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr),minmax(0,1fr)]">
      <Card className="p-5">
        <form onSubmit={save} className="space-y-5" noValidate>
          <h2 className="font-display text-2xl font-bold uppercase">Auction settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Purse per team" htmlFor="purse" error={errors.purse_per_team} hint={notStarted ? 'Also updates every team now (auction not started).' : 'Only applies to teams created from now on. Use the per-team purse list to change existing teams.'}>
              <Input id="purse" inputMode="numeric" value={form.purse_per_team} onChange={(e) => set('purse_per_team', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Default base price" htmlFor="base" error={errors.default_base_price} hint="Prefilled for new players. Existing players are not changed.">
              <Input id="base" inputMode="numeric" value={form.default_base_price} onChange={(e) => set('default_base_price', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Minimum squad size" htmlFor="min" error={errors.min_squad_size}>
              <Input id="min" inputMode="numeric" value={form.min_squad_size} onChange={(e) => set('min_squad_size', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Maximum squad size" htmlFor="max" error={errors.max_squad_size}>
              <Input id="max" inputMode="numeric" value={form.max_squad_size} onChange={(e) => set('max_squad_size', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Reserve per open slot" htmlFor="reserve" error={errors.reserve_per_slot} hint="0 disables it. Keeps money back for each slot still needed to reach the minimum squad.">
              <Input id="reserve" inputMode="numeric" value={form.reserve_per_slot} onChange={(e) => set('reserve_per_slot', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Auction rounds" htmlFor="rounds" error={errors.max_rounds}>
              <Input id="rounds" inputMode="numeric" value={form.max_rounds} onChange={(e) => set('max_rounds', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="Unsold players rule" htmlFor="rule" error={errors.unsold_rule}>
              <Select id="rule" value={form.unsold_rule} onChange={(e) => set('unsold_rule', e.target.value as Form['unsold_rule'])}>
                <option value="manual_reenter">Admin picks who re-enters</option>
                <option value="auto_reenter">All unsold re-enter automatically</option>
                <option value="no_reenter">No re-entry</option>
              </Select>
            </Field>
            <Field label="Base price reduction on re-entry (%)" htmlFor="pct" error={errors.unsold_base_price_reduction_pct}>
              <Input id="pct" inputMode="numeric" value={form.unsold_base_price_reduction_pct} onChange={(e) => set('unsold_base_price_reduction_pct', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={form.icon_counts_in_squad} onChange={(e) => set('icon_counts_in_squad', e.target.checked)} />
            Icon players count toward the squad size limits
          </label>

          <div>
            <h3 className="font-display text-xl font-bold uppercase">Bid increments</h3>
            <p className="text-sm text-muted">The step for a bid is taken from the tier with the highest starting amount at or below the current bid.</p>
            <div className="mt-3 space-y-2">
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label={i === 0 ? 'From amount' : ''} htmlFor={`tier-from-${i}`} className="flex-1">
                    <Input
                      id={`tier-from-${i}`}
                      inputMode="numeric"
                      value={tier.from_amount}
                      disabled={i === 0}
                      aria-label="From amount"
                      onChange={(e) => {
                        setDirty(true);
                        setTiers(tiers.map((x, j) => (j === i ? { ...x, from_amount: e.target.value.replace(/[^0-9]/g, '') } : x)));
                      }}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Step' : ''} htmlFor={`tier-step-${i}`} className="flex-1">
                    <Input
                      id={`tier-step-${i}`}
                      inputMode="numeric"
                      value={tier.step}
                      aria-label="Step"
                      onChange={(e) => {
                        setDirty(true);
                        setTiers(tiers.map((x, j) => (j === i ? { ...x, step: e.target.value.replace(/[^0-9]/g, '') } : x)));
                      }}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    aria-label="Remove tier"
                    disabled={i === 0}
                    onClick={() => {
                      setDirty(true);
                      setTiers(tiers.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {errors.tiers && <p className="mt-1 text-xs text-red-300">{errors.tiers}</p>}
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => {
                setDirty(true);
                const last = parsedTiers[parsedTiers.length - 1];
                setTiers([...tiers, { from_amount: String((last?.from_amount ?? 0) + 1000), step: String(last?.step ?? 100) }]);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add tier
            </Button>
            <p className="mt-3 rounded-btn bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Preview: </span>
              {describeTiers([...parsedTiers].sort((a, b) => a.from_amount - b.from_amount), (n) => formatMoney(n, t.currency_symbol))}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDirty(false)}>
                Discard changes
              </Button>
            )}
          </div>
        </form>
      </Card>
      <TeamPurses teams={snap.teams} refetch={refetch} />
    </div>
  );
}

function TeamPurses({ teams, refetch }: { teams: AuctionTeam[]; refetch: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  return (
    <Card className="p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Team purses</h2>
      <p className="text-sm text-muted">Override one team’s total purse. It can never go below what the team has spent or is currently bidding.</p>
      <ul className="mt-4 space-y-3">
        {teams.map((tm) => (
          <li key={tm.id} className="rounded-btn border border-border p-3">
            <div className="flex items-center gap-2">
              <TeamLogo logoPath={tm.logo_path} name={tm.name} shortName={tm.short_name} color={tm.primary_color} size={28} />
              <span className="flex-1 truncate font-semibold">{tm.name}</span>
              <span className="text-xs text-muted">
                spent <Money amount={tm.purse_spent} /> of <Money amount={tm.purse_total} />
              </span>
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = Number(values[tm.id]);
                if (!Number.isInteger(v)) return;
                setPending(tm.id);
                const res = await rpc('set_team_purse', { p_team_id: tm.id, p_amount: v });
                setPending(null);
                if (res.ok) {
                  toast.success(`${tm.name} purse updated`);
                  setValues({ ...values, [tm.id]: '' });
                  void refetch();
                } else toast.error(res.message);
              }}
            >
              <Input
                inputMode="numeric"
                aria-label={`New purse for ${tm.name}`}
                placeholder={String(tm.purse_total)}
                value={values[tm.id] ?? ''}
                onChange={(e) => setValues({ ...values, [tm.id]: e.target.value.replace(/[^0-9]/g, '') })}
              />
              <Button type="submit" variant="secondary" loading={pending === tm.id} disabled={!values[tm.id]}>
                Set
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

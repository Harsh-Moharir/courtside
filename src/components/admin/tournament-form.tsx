'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ImageUploadField } from './image-upload-field';
import { getBrowserClient } from '@/lib/supabase/browser';
import { write } from '@/lib/actions/rpc';
import { fieldErrors } from '@/lib/errors';
import { replaceImage, removeObject } from '@/lib/upload';
import { formatMoney } from '@/lib/format';
import type { Tables } from '@/types/database';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'At most 80 characters'),
  tagline: z.string().trim().max(140, 'At most 140 characters'),
  timezone: z.string().trim().min(1, 'Time zone is required'),
  currency_symbol: z.string().trim().min(1, 'Required').max(4, 'At most 4 characters'),
  venue_default: z.string().trim().max(80, 'At most 80 characters'),
});
type FormValues = z.infer<typeof schema>;

const COMMON_ZONES = ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

function allZones(): string[] {
  let list: string[] = [];
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) list = fn('timeZone');
  } catch {
    // ignore
  }
  // Browsers may list legacy canonical names (Asia/Calcutta); keep the modern IANA names too.
  return [...new Set([...COMMON_ZONES, ...list])];
}

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function TournamentForm({ tournament }: { tournament: Tables<'tournaments'> }) {
  const router = useRouter();
  const [t, setT] = useState(tournament);
  const [busy, setBusy] = useState<'logo' | 'banner' | null>(null);
  const zones = useMemo(allZones, []);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: t.name,
      tagline: t.tagline ?? '',
      timezone: t.timezone,
      currency_symbol: t.currency_symbol,
      venue_default: t.venue_default ?? '',
    },
  });
  const { register, handleSubmit, formState, setError, watch } = form;

  async function save(v: FormValues) {
    if (!isValidZone(v.timezone)) {
      setError('timezone', { message: 'Pick a time zone from the list' });
      return;
    }
    const r = await write(
      getBrowserClient()
        .from('tournaments')
        .update({
          name: v.name,
          tagline: v.tagline || null,
          timezone: v.timezone,
          currency_symbol: v.currency_symbol,
          venue_default: v.venue_default || null,
        })
        .eq('id', t.id)
        .select('*')
        .single(),
    );
    if (!r.ok) {
      const fe = fieldErrors(r);
      Object.entries(fe).forEach(([k, m]) => setError(k as keyof FormValues, { message: m }));
      toast.error(r.message);
      return;
    }
    if (r.data) setT(r.data);
    toast.success('Tournament saved');
    router.refresh();
  }

  async function setImage(kind: 'logo' | 'banner', file: File | null) {
    setBusy(kind);
    const col = kind === 'logo' ? 'logo_path' : 'banner_path';
    const oldPath = t[col];
    const saveRow = (path: string | null) =>
      write(
        getBrowserClient()
          .from('tournaments')
          .update(kind === 'logo' ? { logo_path: path } : { banner_path: path })
          .eq('id', t.id)
          .select('id')
          .single(),
      );
    if (file) {
      const r = await replaceImage({
        bucket: 'tournament-assets',
        tournamentId: t.id,
        entityId: kind,
        file,
        maxSide: kind === 'logo' ? 512 : 1600,
        oldPath,
        save: saveRow,
      });
      if (!r.ok) toast.error(r.message);
      else {
        setT({ ...t, [col]: r.data });
        toast.success(kind === 'logo' ? 'Logo updated' : 'Banner updated');
      }
    } else {
      const r = await saveRow(null);
      if (!r.ok) toast.error(r.message);
      else {
        void removeObject('tournament-assets', oldPath);
        setT({ ...t, [col]: null });
        toast.success(kind === 'logo' ? 'Logo removed' : 'Banner removed');
      }
    }
    setBusy(null);
    router.refresh();
  }

  const e = formState.errors;
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-display text-2xl font-bold uppercase">Tournament details</h2>
      <div className="mb-5 grid gap-5 sm:grid-cols-2">
        <ImageUploadField
          label="Tournament logo"
          bucket="tournament-assets"
          path={t.logo_path}
          busy={busy === 'logo'}
          onPick={(f) => setImage('logo', f)}
          onRemove={() => setImage('logo', null)}
        />
        <ImageUploadField
          label="Homepage banner"
          bucket="tournament-assets"
          path={t.banner_path}
          shape="wide"
          busy={busy === 'banner'}
          onPick={(f) => setImage('banner', f)}
          onRemove={() => setImage('banner', null)}
          hint="Wide image, resized to at most 1600 px. Without a banner the homepage uses an orange gradient."
        />
      </div>
      <form onSubmit={handleSubmit(save)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" htmlFor="t-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="t-name" {...register('name')} maxLength={80} />
        </Field>
        <Field label="Tagline" htmlFor="t-tagline" error={e.tagline?.message} className="sm:col-span-2" hint="Optional, up to 140 characters">
          <Input id="t-tagline" {...register('tagline')} maxLength={140} />
        </Field>
        <Field label="Time zone" htmlFor="t-tz" error={e.timezone?.message} hint="Type to search. All dates and times are shown in this zone.">
          <Input id="t-tz" list="tz-list" autoComplete="off" {...register('timezone')} />
          <datalist id="tz-list">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
        <Field label="Currency symbol" htmlFor="t-cur" error={e.currency_symbol?.message} hint={`Preview: ${formatMoney(125000, watch('currency_symbol') || '₹')}`}>
          <Input id="t-cur" {...register('currency_symbol')} maxLength={4} />
        </Field>
        <Field label="Default venue" htmlFor="t-venue" error={e.venue_default?.message} className="sm:col-span-2" hint="Prefilled when fixtures are generated">
          <Input id="t-venue" {...register('venue_default')} maxLength={80} />
        </Field>
        <p className="text-xs text-muted sm:col-span-2">
          Slug <code className="rounded bg-surface-2 px-1">{t.slug}</code> is fixed.
        </p>
        <div className="sm:col-span-2">
          <Button type="submit" loading={formState.isSubmitting}>
            Save tournament
          </Button>
        </div>
      </form>
    </Card>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ImageUploadField } from './image-upload-field';
import { getBrowserClient } from '@/lib/supabase/browser';
import { write } from '@/lib/actions/rpc';
import { fieldErrors } from '@/lib/errors';
import { replaceImage, removeObject } from '@/lib/upload';
import { POSITIONS, POSITION_LABELS } from '@/lib/format';
import { cleanName, parseHeight, playerSchema } from '@/lib/import/players';
import type { Tables } from '@/types/database';

type Player = Tables<'players'>;

function cmToFtIn(cm: number | null): { ft: string; inch: string } {
  if (!cm) return { ft: '', inch: '' };
  const totalIn = Math.round(cm / 2.54);
  return { ft: String(Math.floor(totalIn / 12)), inch: String(totalIn % 12) };
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function PlayerForm({
  tournamentId,
  player,
  defaultBasePrice,
  onSaved,
  onCancel,
}: {
  tournamentId: string;
  player?: Player | null;
  defaultBasePrice: number;
  onSaved: (p: Player) => void;
  onCancel?: () => void;
}) {
  const editing = !!player;
  const [name, setName] = useState(player?.full_name ?? '');
  const [primary, setPrimary] = useState<string>(player?.primary_position ?? '');
  const [secondary, setSecondary] = useState<string>(player?.secondary_position ?? '');
  const [age, setAge] = useState(player?.age != null ? String(player.age) : '');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
  const [heightCm, setHeightCm] = useState(player?.height_cm != null ? String(player.height_cm) : '');
  const initialFt = cmToFtIn(player?.height_cm ?? null);
  const [ft, setFt] = useState(initialFt.ft);
  const [inch, setInch] = useState(initialFt.inch);
  const [jersey, setJersey] = useState(player?.jersey_number != null ? String(player.jersey_number) : '');
  const [description, setDescription] = useState(player?.description ?? '');
  const [basePrice, setBasePrice] = useState(String(player?.base_price ?? defaultBasePrice));
  const [photoPath, setPhotoPath] = useState<string | null>(player?.photo_path ?? null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  // Non-blocking duplicate-name warning (6.4).
  useEffect(() => {
    const n = cleanName(name);
    if (n.length < 2) {
      setDuplicate(false);
      return;
    }
    const id = setTimeout(async () => {
      const escaped = n.replace(/[%_\\]/g, (c) => `\\${c}`);
      let q = getBrowserClient().from('players').select('id').ilike('full_name', escaped).limit(1);
      if (player) q = q.neq('id', player.id);
      const { data } = await q;
      setDuplicate((data ?? []).length > 0);
    }, 300);
    return () => clearTimeout(id);
  }, [name, player]);

  const heightValue = useMemo(() => {
    if (heightUnit === 'cm') return heightCm.trim() ? parseHeight(heightCm) : null;
    if (!ft.trim() && !inch.trim()) return null;
    return parseHeight(`${ft || 0} ft ${inch || 0} in`);
  }, [heightUnit, heightCm, ft, inch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = {
      full_name: name,
      primary_position: primary || undefined,
      secondary_position: secondary || null,
      age: numOrNull(age),
      height_cm: heightValue === undefined ? NaN : heightValue,
      jersey_number: numOrNull(jersey),
      description: description || null,
      base_price: numOrNull(basePrice) ?? NaN,
    };
    const parsed = playerSchema.safeParse(candidate);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'form');
        if (!fe[k]) fe[k] = i.message;
      }
      if (heightValue === undefined) fe.height_cm = 'Enter the height in cm or feet and inches';
      setErrors(fe);
      return;
    }
    setErrors({});
    setSaving(true);
    const supabase = getBrowserClient();
    const v = parsed.data;
    const r = editing
      ? await write(supabase.from('players').update(v).eq('id', player!.id).select('*').single())
      : await write(supabase.from('players').insert({ ...v, tournament_id: tournamentId }).select('*').single());
    if (!r.ok || !r.data) {
      setSaving(false);
      if (!r.ok) {
        setErrors(fieldErrors(r));
        toast.error(r.message);
      }
      return;
    }
    let saved = r.data as Player;
    if (!editing && pendingPhoto) {
      const up = await replaceImage({
        bucket: 'player-photos',
        tournamentId,
        entityId: saved.id,
        file: pendingPhoto,
        maxSide: 800,
        oldPath: null,
        save: (path) => write(supabase.from('players').update({ photo_path: path }).eq('id', saved.id).select('id')),
      });
      if (up.ok) saved = { ...saved, photo_path: up.data };
      else toast.error(`Player saved, but the photo failed: ${up.message}`);
    }
    setSaving(false);
    toast.success(editing ? 'Player saved' : `${saved.full_name} added`);
    onSaved(saved);
  }

  async function changePhoto(file: File | null) {
    if (!player) {
      setPendingPhoto(file);
      return;
    }
    setPhotoBusy(true);
    const supabase = getBrowserClient();
    if (file) {
      const r = await replaceImage({
        bucket: 'player-photos',
        tournamentId,
        entityId: player.id,
        file,
        maxSide: 800,
        oldPath: photoPath,
        save: (path) => write(supabase.from('players').update({ photo_path: path }).eq('id', player.id).select('id')),
      });
      if (r.ok) {
        setPhotoPath(r.data);
        toast.success('Photo updated');
      } else toast.error(r.message);
    } else {
      const r = await write(supabase.from('players').update({ photo_path: null }).eq('id', player.id).select('id'));
      if (r.ok) {
        void removeObject('player-photos', photoPath);
        setPhotoPath(null);
        toast.success('Photo removed');
      } else toast.error(r.message);
    }
    setPhotoBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ImageUploadField
        label="Photo"
        bucket="player-photos"
        path={player ? photoPath : null}
        busy={photoBusy}
        shape="square"
        onPick={(f) => changePhoto(f)}
        onRemove={player ? () => changePhoto(null) : undefined}
        hint={!player && pendingPhoto ? `Selected: ${pendingPhoto.name} (uploaded on save)` : 'Optional. Without a photo the initials are shown.'}
      />
      <Field label="Full name" htmlFor="pl-name" error={errors.full_name}>
        <Input id="pl-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      {duplicate && (
        <p role="status" className="flex items-center gap-2 text-sm text-yellow-200">
          <AlertTriangle className="h-4 w-4" aria-hidden /> A player with this name already exists. Duplicates are allowed.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary position" htmlFor="pl-pp" error={errors.primary_position}>
          <Select
            id="pl-pp"
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              if (secondary === e.target.value) setSecondary('');
            }}
          >
            <option value="" disabled>
              Choose…
            </option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p} {POSITION_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Secondary position" htmlFor="pl-sp" error={errors.secondary_position}>
          <Select id="pl-sp" value={secondary} onChange={(e) => setSecondary(e.target.value)}>
            <option value="">None</option>
            {POSITIONS.filter((p) => p !== primary).map((p) => (
              <option key={p} value={p}>
                {p} {POSITION_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Age (optional)" htmlFor="pl-age" error={errors.age}>
          <Input id="pl-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="Jersey number (optional)" htmlFor="pl-jersey" error={errors.jersey_number}>
          <Input id="pl-jersey" inputMode="numeric" value={jersey} onChange={(e) => setJersey(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
          Height (optional)
          <span className="inline-flex rounded-btn border border-border p-0.5 text-xs">
            {(['cm', 'ftin'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  if (u === 'ftin' && heightValue) {
                    const f = cmToFtIn(heightValue);
                    setFt(f.ft);
                    setInch(f.inch);
                  }
                  if (u === 'cm' && heightValue) setHeightCm(String(heightValue));
                  setHeightUnit(u);
                }}
                className={`min-h-[32px] rounded-[10px] px-3 ${heightUnit === u ? 'bg-accent text-accent-contrast' : 'text-muted'}`}
                aria-pressed={heightUnit === u}
              >
                {u === 'cm' ? 'cm' : 'ft / in'}
              </button>
            ))}
          </span>
        </legend>
        {heightUnit === 'cm' ? (
          <Input aria-label="Height in centimetres" inputMode="numeric" value={heightCm} placeholder="e.g. 185" onChange={(e) => setHeightCm(e.target.value)} />
        ) : (
          <div className="flex gap-2">
            <Input aria-label="Feet" inputMode="numeric" value={ft} placeholder="ft" onChange={(e) => setFt(e.target.value.replace(/[^0-9]/g, ''))} />
            <Input aria-label="Inches" inputMode="numeric" value={inch} placeholder="in" onChange={(e) => setInch(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        )}
        <p className="mt-1 text-xs text-muted">
          {errors.height_cm ? <span className="text-red-300">{errors.height_cm}</span> : heightValue ? `Stored as ${heightValue} cm` : 'Stored in centimetres'}
        </p>
      </fieldset>
      <Field label="Short description (optional)" htmlFor="pl-desc" error={errors.description} hint={`${description.length}/280`}>
        <Textarea id="pl-desc" maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Base auction price" htmlFor="pl-base" error={errors.base_price}>
        <Input id="pl-base" inputMode="numeric" value={basePrice} onChange={(e) => setBasePrice(e.target.value.replace(/[^0-9]/g, ''))} />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={saving}>
          {editing ? 'Save player' : 'Add player'}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

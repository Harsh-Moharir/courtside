'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { TeamLogo } from '@/components/ui/media';
import { ImageUploadField } from './image-upload-field';
import { getBrowserClient } from '@/lib/supabase/browser';
import { rpc, write } from '@/lib/actions/rpc';
import { fieldErrors } from '@/lib/errors';
import { contrastRatio, isValidHex, readableTextOn } from '@/lib/color';
import { replaceImage, removeObject } from '@/lib/upload';
import type { Tables } from '@/types/database';

type Team = Tables<'teams'>;
type Owner = { id?: string; full_name: string; photo_path: string | null } | null;

export function suggestShortName(name: string): string {
  return name
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

function ColorInput({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const valid = isValidHex(value);
  return (
    <Field label={label} htmlFor={id} error={error ?? (valid ? null : 'Use a hex colour like #F97316')}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-btn border border-border bg-surface-2 p-1"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className="font-mono uppercase" />
      </div>
    </Field>
  );
}

export interface TeamFormProps {
  tournamentId: string;
  team?: Team | null;
  owner?: Owner;
  otherTeams: Pick<Team, 'id' | 'name' | 'primary_color'>[];
  onSaved: (teamId: string) => void;
  onCancel?: () => void;
}

/** Create or edit a team (6.1). On create: insert team, then owner; if the owner insert fails the team is deleted again. */
export function TeamForm({ tournamentId, team, owner, otherTeams, onSaved, onCancel }: TeamFormProps) {
  const editing = !!team;
  const [name, setName] = useState(team?.name ?? '');
  const [shortName, setShortName] = useState(team?.short_name ?? '');
  const [shortTouched, setShortTouched] = useState(editing);
  const [primary, setPrimary] = useState(team?.primary_color.toUpperCase() ?? '#F97316');
  const [secondary, setSecondary] = useState(team?.secondary_color.toUpperCase() ?? '#111111');
  const [ownerName, setOwnerName] = useState(owner?.full_name ?? '');
  const [logoPath, setLogoPath] = useState<string | null>(team?.logo_path ?? null);
  const [ownerPhoto, setOwnerPhoto] = useState<string | null>(owner?.photo_path ?? null);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [pendingOwnerPhoto, setPendingOwnerPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<'logo' | 'owner' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const lowContrast = isValidHex(primary) && isValidHex(secondary) && contrastRatio(primary, secondary) < 1.5;
  const sameColour = useMemo(
    () => otherTeams.find((o) => o.id !== team?.id && o.primary_color.toUpperCase() === primary.toUpperCase()),
    [otherTeams, primary, team?.id],
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    const n = name.replace(/\s+/g, ' ').trim();
    if (n.length < 2 || n.length > 40) e.name = 'Team name must be 2 to 40 characters';
    if (otherTeams.some((o) => o.id !== team?.id && o.name.toLowerCase() === n.toLowerCase())) e.name = 'Another team already uses this name';
    if (!/^[A-Z0-9]{2,4}$/.test(shortName)) e.short_name = '2 to 4 capital letters or digits';
    if (!isValidHex(primary)) e.primary_color = 'Use a hex colour like #F97316';
    if (!isValidHex(secondary)) e.secondary_color = 'Use a hex colour like #111111';
    if (ownerName.trim().length > 80) e.owner = 'At most 80 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function saveOwner(teamId: string): Promise<boolean> {
    const fullName = ownerName.replace(/\s+/g, ' ').trim();
    const supabase = getBrowserClient();
    if (!fullName) {
      if (owner?.id) {
        const r = await write(supabase.from('team_owners').delete().eq('team_id', teamId).select('id'));
        if (!r.ok) {
          toast.error(r.message);
          return false;
        }
        void removeObject('team-logos', ownerPhoto);
      }
      return true;
    }
    const r = await write(
      supabase
        .from('team_owners')
        .upsert({ tournament_id: tournamentId, team_id: teamId, full_name: fullName }, { onConflict: 'team_id' })
        .select('id')
        .single(),
    );
    if (!r.ok) {
      setErrors((e) => ({ ...e, owner: r.message }));
      toast.error(`Owner not saved: ${r.message}`);
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const supabase = getBrowserClient();
    const values = {
      name: name.replace(/\s+/g, ' ').trim(),
      short_name: shortName,
      primary_color: primary.toUpperCase(),
      secondary_color: secondary.toUpperCase(),
    };
    if (editing && team) {
      const r = await write(supabase.from('teams').update(values).eq('id', team.id).select('id').single());
      if (!r.ok) {
        setErrors(fieldErrors(r));
        toast.error(r.code === 'CONFLICT' ? 'Name or short name is already used by another team.' : r.message);
        setSaving(false);
        return;
      }
      const okOwner = await saveOwner(team.id);
      setSaving(false);
      if (okOwner) {
        toast.success('Team saved');
        onSaved(team.id);
      }
      return;
    }
    const created = await write(supabase.from('teams').insert({ tournament_id: tournamentId, ...values }).select('id').single());
    if (!created.ok) {
      setErrors(fieldErrors(created));
      toast.error(created.code === 'CONFLICT' ? 'Name or short name is already used by another team.' : created.message);
      setSaving(false);
      return;
    }
    const teamId = (created.data as { id: string } | null)?.id;
    if (!teamId) {
      setSaving(false);
      return;
    }
    if (ownerName.trim()) {
      const okOwner = await saveOwner(teamId);
      if (!okOwner) {
        // No half-created team: remove it again.
        await rpc('delete_team', { p_team_id: teamId });
        setSaving(false);
        return;
      }
    }
    if (pendingLogo) {
      const up = await replaceImage({
        bucket: 'team-logos',
        tournamentId,
        entityId: teamId,
        file: pendingLogo,
        maxSide: 512,
        oldPath: null,
        save: (path) => write(supabase.from('teams').update({ logo_path: path }).eq('id', teamId).select('id')),
      });
      if (!up.ok) toast.error(`Team created, but the logo failed: ${up.message}`);
    }
    if (pendingOwnerPhoto && ownerName.trim()) {
      const up = await replaceImage({
        bucket: 'team-logos',
        tournamentId,
        entityId: `owners/${teamId}`,
        file: pendingOwnerPhoto,
        maxSide: 512,
        oldPath: null,
        save: (path) => write(supabase.from('team_owners').update({ photo_path: path }).eq('team_id', teamId).select('id')),
      });
      if (!up.ok) toast.error(`Team created, but the owner photo failed: ${up.message}`);
    }
    setSaving(false);
    toast.success(`${values.name} created`);
    onSaved(teamId);
  }

  async function changeLogo(file: File | null) {
    if (!team) {
      setPendingLogo(file);
      return;
    }
    setBusy('logo');
    const supabase = getBrowserClient();
    if (file) {
      const r = await replaceImage({
        bucket: 'team-logos',
        tournamentId,
        entityId: team.id,
        file,
        maxSide: 512,
        oldPath: logoPath,
        save: (path) => write(supabase.from('teams').update({ logo_path: path }).eq('id', team.id).select('id')),
      });
      if (r.ok) {
        setLogoPath(r.data);
        toast.success('Logo updated');
      } else toast.error(r.message);
    } else {
      const r = await write(supabase.from('teams').update({ logo_path: null }).eq('id', team.id).select('id'));
      if (r.ok) {
        void removeObject('team-logos', logoPath);
        setLogoPath(null);
        toast.success('Logo removed');
      } else toast.error(r.message);
    }
    setBusy(null);
  }

  async function changeOwnerPhoto(file: File | null) {
    if (!team) {
      setPendingOwnerPhoto(file);
      return;
    }
    if (!owner?.id && !ownerName.trim()) {
      toast.error('Enter and save the owner name first.');
      return;
    }
    setBusy('owner');
    const supabase = getBrowserClient();
    if (!owner?.id) {
      const ok = await saveOwner(team.id);
      if (!ok) {
        setBusy(null);
        return;
      }
    }
    if (file) {
      const r = await replaceImage({
        bucket: 'team-logos',
        tournamentId,
        entityId: `owners/${team.id}`,
        file,
        maxSide: 512,
        oldPath: ownerPhoto,
        save: (path) => write(supabase.from('team_owners').update({ photo_path: path }).eq('team_id', team.id).select('id')),
      });
      if (r.ok) {
        setOwnerPhoto(r.data);
        toast.success('Owner photo updated');
      } else toast.error(r.message);
    } else {
      const r = await write(supabase.from('team_owners').update({ photo_path: null }).eq('team_id', team.id).select('id'));
      if (r.ok) {
        void removeObject('team-logos', ownerPhoto);
        setOwnerPhoto(null);
      } else toast.error(r.message);
    }
    setBusy(null);
  }

  const previewLocal = useMemo(() => (pendingLogo ? URL.createObjectURL(pendingLogo) : null), [pendingLogo]);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div
        className="flex items-center gap-3 rounded-card border border-border p-3"
        style={{ background: `linear-gradient(135deg, ${isValidHex(primary) ? primary : '#F97316'}, #141414 75%)` }}
      >
        {previewLocal ? (
          <img src={previewLocal} alt="New logo preview" className="h-14 w-14 rounded-full object-contain" />
        ) : (
          <TeamLogo logoPath={logoPath} name={name || 'Team'} shortName={shortName || null} color={isValidHex(primary) ? primary : null} size={56} />
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-extrabold uppercase" style={{ color: readableTextOn(isValidHex(primary) ? primary : '#F97316') }}>
            {name || 'Team name'}
          </p>
          <p className="text-xs text-white/80">Preview</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Team name" htmlFor="team-name" error={errors.name}>
          <Input
            id="team-name"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              if (!shortTouched) setShortName(suggestShortName(e.target.value));
            }}
          />
        </Field>
        <Field label="Short name" htmlFor="team-short" error={errors.short_name} hint="2 to 4 characters">
          <Input
            id="team-short"
            value={shortName}
            maxLength={4}
            className="font-mono uppercase"
            onChange={(e) => {
              setShortTouched(true);
              setShortName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            }}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorInput id="team-primary" label="Primary colour" value={primary} onChange={setPrimary} error={errors.primary_color} />
        <ColorInput id="team-secondary" label="Secondary colour" value={secondary} onChange={setSecondary} error={errors.secondary_color} />
      </div>
      {(lowContrast || sameColour) && (
        <div role="status" className="space-y-1 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {lowContrast && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> The two colours are very similar (contrast{' '}
              {contrastRatio(primary, secondary).toFixed(2)}:1). They may be hard to tell apart.
            </p>
          )}
          {sameColour && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> {sameColour.name} already uses this primary colour.
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageUploadField
          label="Team logo"
          bucket="team-logos"
          path={team ? logoPath : null}
          busy={busy === 'logo'}
          onPick={(f) => changeLogo(f)}
          onRemove={team ? () => changeLogo(null) : undefined}
          hint={!team && pendingLogo ? `Selected: ${pendingLogo.name} (uploaded on save)` : undefined}
        />
        <div className="space-y-3">
          <Field label="Owner name" htmlFor="team-owner" error={errors.owner} hint="Shown under the team name. No contact details are stored.">
            <Input id="team-owner" value={ownerName} maxLength={80} onChange={(e) => setOwnerName(e.target.value)} />
          </Field>
          <ImageUploadField
            label="Owner photo (optional)"
            bucket="team-logos"
            path={team ? ownerPhoto : null}
            busy={busy === 'owner'}
            onPick={(f) => changeOwnerPhoto(f)}
            onRemove={team ? () => changeOwnerPhoto(null) : undefined}
            hint={!team && pendingOwnerPhoto ? `Selected: ${pendingOwnerPhoto.name} (uploaded on save)` : undefined}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" loading={saving}>
          {editing ? 'Save team' : 'Create team'}
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

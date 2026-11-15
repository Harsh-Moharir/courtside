'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useDivisions, useTournament } from '@/components/providers/tournament-context';
import { rpc } from '@/lib/actions/rpc';
import { switchDivision, type Division } from '@/lib/division';

/** Add, rename and remove divisions (Men, Women, …). Each division has its own teams, auction, fixtures and playoffs. */
export function DivisionsManager() {
  const divisions = useDivisions();
  const current = useTournament();
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(divisions.map((d) => [d.id, d.label])));
  const [newLabel, setNewLabel] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Division | null>(null);

  async function rename(d: Division) {
    const label = (names[d.id] ?? '').trim();
    if (!label || label === d.label) return;
    setPending(`rename:${d.id}`);
    const r = await rpc('rename_division', { p_id: d.id, p_label: label });
    setPending(null);
    if (!r.ok) return void toast.error(r.message);
    toast.success(`Renamed to ${label}`);
    window.location.reload();
  }

  async function add() {
    const label = newLabel.trim();
    if (!label) return;
    setPending('add');
    const r = await rpc<{ id: string }>('create_division', { p_label: label });
    setPending(null);
    if (!r.ok) return void toast.error(r.message);
    toast.success(`${label} division added`);
    switchDivision(r.data.id);
  }

  async function remove() {
    if (!toDelete) return;
    setPending('delete');
    const r = await rpc('delete_division', { p_id: toDelete.id });
    setPending(null);
    if (!r.ok) return void toast.error(r.message);
    toast.success(`${toDelete.label} division removed`);
    const next = divisions.find((d) => d.id !== toDelete.id);
    setToDelete(null);
    if (toDelete.id === current.id && next) switchDivision(next.id);
    else window.location.reload();
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Divisions</h2>
      <p className="mt-1 text-sm text-muted">
        Each division (for example Men and Women) has its own teams, players, auction and purse, fixtures, points table, playoffs and champion.
        The tournament name, logo and banner are shared. Switch division with the buttons at the top of the page.
      </p>
      <ul className="mt-4 space-y-2">
        {divisions.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Name of the ${d.label} division`}
              value={names[d.id] ?? ''}
              maxLength={30}
              onChange={(e) => setNames((n) => ({ ...n, [d.id]: e.target.value }))}
              className="max-w-xs"
            />
            <Button variant="secondary" size="sm" loading={pending === `rename:${d.id}`} disabled={(names[d.id] ?? '').trim() === d.label} onClick={() => void rename(d)}>
              Rename
            </Button>
            {d.id === current.id && <span className="text-xs font-semibold uppercase text-accent">Current</span>}
            <Button variant="ghost" size="sm" className="ml-auto text-red-300" disabled={divisions.length <= 1} onClick={() => setToDelete(d)} aria-label={`Remove ${d.label}`}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input placeholder="New division, e.g. Under-18" value={newLabel} maxLength={30} onChange={(e) => setNewLabel(e.target.value)} className="max-w-xs" aria-label="New division name" />
        <Button type="submit" variant="secondary" loading={pending === 'add'} disabled={!newLabel.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> Add division
        </Button>
      </form>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Remove the ${toDelete?.label ?? ''} division?`}
        description="Only an empty division can be removed: delete its teams, players and matches first."
        confirmLabel="Remove division"
        confirmVariant="danger"
        loading={pending === 'delete'}
        onConfirm={remove}
      />
    </Card>
  );
}

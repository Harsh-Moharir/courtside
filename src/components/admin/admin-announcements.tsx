'use client';
import { useState } from 'react';
import { Clock, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { write } from '@/lib/actions/rpc';
import { formatInTournamentTz, utcToZonedInputs, zonedToUtcIso, zoneAbbreviation } from '@/lib/format';
import type { Tables } from '@/types/database';

type Announcement = Tables<'announcements'>;

export function AdminAnnouncements() {
  const t = useTournament();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data, loading, error, refetch } = useRealtimeQuery<Announcement[]>({
    key: 'admin-announcements',
    subscriptions: [{ table: 'announcements' }],
    fetcher: async () => {
      const { data: rows, error: e } = await getBrowserClient()
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(200);
      if (e) throw new Error(e.message);
      return rows ?? [];
    },
  });

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await write(getBrowserClient().from('announcements').delete().eq('id', toDelete.id).select('id'));
    setDeleting(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success('Announcement deleted');
    setToDelete(null);
    void refetch();
  }

  const now = Date.now();
  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Plain text; links are detected automatically. Scheduled announcements stay hidden until their publish time."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> New announcement
          </Button>
        }
      />
      {error && <ErrorState message="Could not load announcements." onRetry={() => void refetch()} />}
      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState>No announcements yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((a) => {
            const scheduled = new Date(a.published_at).getTime() > now;
            return (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {a.is_pinned && (
                          <Badge className="border-accent/60 text-accent">
                            <Pin className="h-3 w-3" aria-hidden /> Pinned
                          </Badge>
                        )}
                        {scheduled && (
                          <Badge className="border-warning/50 text-yellow-200">
                            <Clock className="h-3 w-3" aria-hidden /> Scheduled
                          </Badge>
                        )}
                        <span className="text-xs text-muted">
                          {scheduled ? 'Publishes' : 'Published'} {formatInTournamentTz(a.published_at, 'd MMM yyyy, h:mm a', t.timezone)}
                        </span>
                      </div>
                      <h2 className="truncate text-lg font-semibold" title={a.title}>
                        {a.title}
                      </h2>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{a.body}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                        <Pencil className="h-4 w-4" aria-hidden /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setToDelete(a)} aria-label={`Delete ${a.title}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'New announcement' : 'Edit announcement'}>
        {editing !== null && (
          <AnnouncementForm
            key={editing === 'new' ? 'new' : editing.id}
            tournamentId={t.id}
            timezone={t.timezone}
            initial={editing === 'new' ? null : editing}
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
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete announcement?"
        description={toDelete?.title}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function AnnouncementForm({
  tournamentId,
  timezone,
  initial,
  onSaved,
  onCancel,
}: {
  tournamentId: string;
  timezone: string;
  initial: Announcement | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const start = utcToZonedInputs(initial?.published_at ?? new Date().toISOString(), timezone);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.is_pinned ?? false);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!title.trim() || title.trim().length > 120) fe.title = 'Title must be 1 to 120 characters';
    if (body.length > 2000) fe.body = 'At most 2,000 characters';
    if (!body.trim()) fe.body = 'Write the announcement text';
    if (!date || !time) fe.publish = 'Pick a publish date and time';
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setPending(true);
    const values = { title: title.trim(), body: body.trim(), is_pinned: pinned, published_at: zonedToUtcIso(date, time, timezone) };
    const supabase = getBrowserClient();
    const r = initial
      ? await write(supabase.from('announcements').update(values).eq('id', initial.id).select('id'))
      : await write(supabase.from('announcements').insert({ ...values, tournament_id: tournamentId }).select('id'));
    setPending(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(initial ? 'Announcement saved' : 'Announcement created');
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="an-title" error={errors.title}>
        <Input id="an-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Text" htmlFor="an-body" error={errors.body} hint={`${body.length}/2000. Line breaks are kept.`}>
        <Textarea id="an-body" rows={6} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Publish date" htmlFor="an-date" error={errors.publish}>
          <Input id="an-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`Publish time (${zoneAbbreviation(timezone)})`} htmlFor="an-time" hint={`Tournament time zone: ${timezone}`}>
          <Input id="an-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        <span className="text-sm">Pin to the top</span>
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {initial ? 'Save' : 'Publish'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

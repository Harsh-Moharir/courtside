'use client';
import { Pin } from 'lucide-react';
import { AnnouncementBody } from '@/components/announcements/announcement-body';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';
import { RelativeTime, TzDate } from '@/components/ui/time';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchAnnouncements, type Announcement } from '@/lib/queries/announcements';

export function AnnouncementsList({ initial }: { initial: Announcement[] }) {
  const { data, status, error, refetch } = useRealtimeQuery<Announcement[]>({
    key: 'announcements-all',
    initialData: initial,
    subscriptions: [{ table: 'announcements' }],
    // Scheduled items become visible when their time passes, so also poll gently.
    pollMs: 60_000,
    fetcher: () => fetchAnnouncements(getBrowserClient(), 200),
  });
  const items = data ?? [];
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ConnectionIndicator status={status} />
      </div>
      {error && <ErrorState message="Could not refresh announcements." onRetry={() => void refetch()} />}
      {items.length === 0 ? (
        <EmptyState>No announcements yet.</EmptyState>
      ) : (
        <ol className="space-y-4">
          {items.map((a) => (
            <li key={a.id}>
              <article className={`rounded-card border bg-surface p-5 ${a.is_pinned ? 'border-[#f9731699]' : 'border-border'}`}>
                <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {a.is_pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase text-accent-contrast">
                      <Pin className="h-3 w-3" aria-hidden /> Pinned
                    </span>
                  )}
                  <h2 className="font-display text-2xl font-bold uppercase leading-tight">{a.title}</h2>
                </header>
                <p className="mb-3 text-xs text-muted">
                  <TzDate iso={a.published_at} pattern="EEE d MMM yyyy, h:mm a" /> · <RelativeTime iso={a.published_at} />
                </p>
                <AnnouncementBody text={a.body} className="text-[15px] leading-relaxed text-[#e5e5e5]" />
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

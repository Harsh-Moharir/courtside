'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import { AnnouncementBody } from '@/components/announcements/announcement-body';
import { EmptyState } from '@/components/ui/misc';
import { RelativeTime } from '@/components/ui/time';
import { cn } from '@/components/ui/cn';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchAnnouncements, type Announcement } from '@/lib/queries/announcements';

/** Homepage widget (11.3 item 9): pinned first, then newest, 5 items, each expandable. */
export function AnnouncementsWidget({ initial, limit = 5 }: { initial: Announcement[]; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useRealtimeQuery<Announcement[]>({
    key: 'announcements-widget',
    initialData: initial,
    subscriptions: [{ table: 'announcements' }],
    pollMs: 60_000,
    fetcher: () => fetchAnnouncements(getBrowserClient(), limit),
  });
  const items = (data ?? []).slice(0, limit);
  return (
    <div>
      {items.length === 0 ? (
        <EmptyState>No announcements yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((a) => {
            const expanded = open === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : a.id)}
                  aria-expanded={expanded}
                  aria-controls={`ann-${a.id}`}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  {a.is_pinned && <Pin className="h-4 w-4 shrink-0 text-accent" aria-label="Pinned" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" title={a.title}>
                      {a.title}
                    </span>
                    <RelativeTime iso={a.published_at} className="text-xs text-muted" />
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition', expanded && 'rotate-180')} aria-hidden />
                </button>
                {expanded && (
                  <div id={`ann-${a.id}`} className="px-4 pb-4">
                    <AnnouncementBody text={a.body} className="text-sm leading-relaxed text-[#e5e5e5]" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/announcements" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline">
        All announcements →
      </Link>
    </div>
  );
}

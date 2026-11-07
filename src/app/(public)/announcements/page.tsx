import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { AnnouncementsList } from '@/components/announcements/announcements-list';
import { getServerClient } from '@/lib/supabase/server';
import { fetchAnnouncements } from '@/lib/queries/announcements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Announcements', description: 'Tournament news and notices.', openGraph: { title: 'Announcements' } };

export default async function AnnouncementsPage() {
  const supabase = await getServerClient();
  const items = await fetchAnnouncements(supabase, 200);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Announcements" subtitle="Pinned notices first, then the latest news." />
      <AnnouncementsList initial={items} />
    </div>
  );
}

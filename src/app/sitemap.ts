import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const pages = ['', '/teams', '/players', '/auction', '/fixtures', '/live', '/points-table', '/playoffs', '/announcements'];
  const supabase = await getServerClient();
  const { data: teams } = await supabase.from('teams').select('id, updated_at').limit(10);
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'hourly' as const })),
    ...(teams ?? []).map((t) => ({ url: `${base}/teams/${t.id}`, lastModified: t.updated_at })),
  ];
}

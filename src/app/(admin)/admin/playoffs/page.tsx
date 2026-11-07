import { getServerClient } from '@/lib/supabase/server';
import { fetchPlayoffs } from '@/lib/queries/playoffs';
import { PageHeader } from '@/components/ui/card';
import { PlayoffsAdmin } from './playoffs-admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Playoffs admin' };

export default async function AdminPlayoffsPage() {
  const supabase = await getServerClient();
  const data = await fetchPlayoffs(supabase);
  return (
    <div>
      <PageHeader title="Playoffs" subtitle="Choose the format, generate the bracket and keep seeds in sync with the final league standings." />
      <PlayoffsAdmin initial={data} />
    </div>
  );
}

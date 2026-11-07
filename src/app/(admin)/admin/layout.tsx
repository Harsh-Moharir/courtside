import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/admin/admin-shell';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Mandatory server-side admin check (4.1 item 3); middleware alone is not sufficient. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) {
    redirect('/auth/signout?error=not_admin');
  }
  return <AdminShell email={user.email ?? ''}>{children}</AdminShell>;
}

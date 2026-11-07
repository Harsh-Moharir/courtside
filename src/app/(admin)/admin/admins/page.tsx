import type { Metadata } from 'next';
import { getServerClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui/card';
import { formatInTournamentTz } from '@/lib/format';
import { getActiveTournament } from '@/lib/queries/tournament';

export const metadata: Metadata = { title: 'Administrators' };
export const dynamic = 'force-dynamic';

export default async function AdminsPage() {
  const supabase = await getServerClient();
  const [{ data: admins }, t] = await Promise.all([
    supabase.from('administrators').select('user_id, email, created_at').order('created_at'),
    getActiveTournament(),
  ]);
  return (
    <div>
      <PageHeader title="Administrators" subtitle="Everyone listed here has full control of the tournament. This list is visible to admins only." />
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold uppercase">Current admins</h2>
          <ul className="divide-y divide-border">
            {(admins ?? []).map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="truncate font-medium" title={a.email}>
                  {a.email}
                </span>
                <span className="text-xs text-muted">since {formatInTournamentTz(a.created_at, 'd MMM yyyy', t?.timezone)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold uppercase">Add another admin</h2>
          <p className="mb-3 text-sm text-muted">
            For security, the website cannot create accounts (public sign-up is disabled and the service-role key never runs in the web app).
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              In the Supabase dashboard open <strong>Authentication → Users → Add user</strong>, enter the person&apos;s email and a temporary password, and tick
              &ldquo;Auto confirm user&rdquo;.
            </li>
            <li>
              On a computer with the project checked out and <code className="rounded bg-surface-2 px-1">.env.local</code> configured, run:
              <pre className="mt-2 overflow-x-auto rounded-btn bg-surface-2 p-3 text-xs">pnpm tsx scripts/add-admin.ts their@email.com</pre>
            </li>
            <li>Ask them to sign in at /login and change the password under Account.</li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            To remove an admin, delete the user in Authentication → Users (their administrator row is removed automatically).
          </p>
        </Card>
      </div>
    </div>
  );
}

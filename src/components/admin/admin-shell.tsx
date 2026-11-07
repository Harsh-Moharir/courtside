'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';
import { LoginForm } from '@/app/login/login-form';
import { onSessionExpired } from '@/lib/session-events';
import { getBrowserClient } from '@/lib/supabase/browser';
import { ADMIN_LINKS } from './admin-links';



export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const [expired, setExpired] = useState(false);

  useEffect(() => onSessionExpired(() => setExpired(true)), []);

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4">
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <span className="mr-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-extrabold uppercase text-accent-contrast">Admin</span>
        <nav aria-label="Admin" className="scrollbar-thin -mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
          {ADMIN_LINKS.map((l) => {
            const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[40px] items-center whitespace-nowrap rounded-btn px-3 text-sm font-semibold',
                  active ? 'bg-surface-2 text-accent' : 'text-muted hover:text-fg',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden max-w-[180px] shrink-0 truncate text-xs text-muted xl:inline" title={email}>
          {email}
        </span>
        <button type="button" onClick={signOut} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-btn border border-border px-3 text-sm font-semibold hover:border-accent">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
      {children}
      <Dialog
        open={expired}
        onOpenChange={setExpired}
        title="Session expired, sign in again"
        description="Your work on this screen is kept. Sign in and then retry the last action."
      >
        <LoginForm onSuccess={() => setExpired(false)} />
      </Dialog>
    </div>
  );
}

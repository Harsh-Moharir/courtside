'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_LINKS } from './nav-links';
import { cn } from '@/components/ui/cn';
import { LiveDot } from '@/components/ui/misc';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { publicUrl } from '@/lib/storage';

function isActive(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`) || (href === '/live' && path.startsWith('/matches'));
}

export function Navbar({ initialLiveCount }: { initialLiveCount: number }) {
  const pathname = usePathname() ?? '/';
  const t = useTournament();
  const [open, setOpen] = useState(false);
  const { data: liveCount } = useRealtimeQuery<number>({
    key: 'nav-live',
    initialData: initialLiveCount,
    subscriptions: [{ table: 'fixtures' }],
    fetcher: async () => {
      const { count } = await getBrowserClient().from('fixtures').select('id', { count: 'exact', head: true }).eq('status', 'live');
      return count ?? 0;
    },
    onChange: (p) => p.table === 'fixtures' && (p.new?.status === 'live' || p.old?.status === 'live' || p.eventType !== 'UPDATE'),
  });

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const logo = publicUrl('tournament-assets', t.logo_path);
  if (pathname.startsWith('/auction/display')) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4" aria-label="Main">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          {logo ? (
            <img src={logo} alt="" className="h-9 w-9 rounded-full object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-lg" aria-hidden>
              🏀
            </span>
          )}
          <span className="truncate font-display text-xl font-extrabold uppercase tracking-tight">{t.name}</span>
        </Link>
        <ul className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                prefetch={l.href === '/admin' ? false : undefined}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] items-center gap-1.5 rounded-btn px-3 text-sm font-semibold transition',
                  isActive(pathname, l.href) ? 'text-accent' : 'text-muted hover:text-fg',
                )}
              >
                {l.label}
                {l.href === '/live' && (liveCount ?? 0) > 0 && <LiveDot label={`${liveCount} live`} />}
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-btn border border-border lg:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
          {(liveCount ?? 0) > 0 && <LiveDot className="absolute right-3 top-3" label="Matches live" />}
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-bg lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <span className="font-display text-xl font-extrabold uppercase">{t.name}</span>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-btn border border-border" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-4">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                prefetch={l.href === '/admin' ? false : undefined}
                  className={cn(
                    'flex min-h-[56px] items-center gap-2 border-b border-border px-2 font-display text-2xl font-bold uppercase',
                    isActive(pathname, l.href) ? 'text-accent' : 'text-fg',
                  )}
                >
                  {l.label}
                  {l.href === '/live' && (liveCount ?? 0) > 0 && <LiveDot />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

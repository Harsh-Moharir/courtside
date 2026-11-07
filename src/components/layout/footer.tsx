'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from './nav-links';
import { useTournament } from '@/components/providers/tournament-context';
import { zoneAbbreviation } from '@/lib/format';

export function Footer() {
  const t = useTournament();
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/auction/display')) return null;
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-[1440px] px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="font-display text-2xl font-extrabold uppercase">{t.name}</p>
            {t.tagline && <p className="text-sm text-muted">{t.tagline}</p>}
            <p className="mt-2 text-xs text-muted">
              All times in {t.timezone} ({zoneAbbreviation(t.timezone)})
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} prefetch={l.href === '/admin' ? false : undefined} className="inline-flex min-h-[32px] items-center text-muted hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/announcements" className="inline-flex min-h-[32px] items-center text-muted hover:text-accent">
                Announcements
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

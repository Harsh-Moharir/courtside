/** Admin navigation (plain module so Server Components can import it). */
export const ADMIN_LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/tournament', label: 'Tournament' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/auction', label: 'Auction' },
  { href: '/admin/fixtures', label: 'Fixtures' },
  { href: '/admin/live', label: 'Live scoring' },
  { href: '/admin/standings-settings', label: 'Standings' },
  { href: '/admin/playoffs', label: 'Playoffs' },
  { href: '/admin/announcements', label: 'Announcements' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/account', label: 'Account' },
] as const;

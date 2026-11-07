/** Server-safe list of admin sections (admin-shell.tsx is a client module, so its export cannot be read on the server). */
export const ADMIN_SECTIONS = [
  { href: '/admin/tournament', label: 'Tournament' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/players/import', label: 'Import players' },
  { href: '/admin/auction', label: 'Auction' },
  { href: '/admin/fixtures', label: 'Fixtures' },
  { href: '/admin/live', label: 'Live scoring' },
  { href: '/admin/standings-settings', label: 'Standings' },
  { href: '/admin/playoffs', label: 'Playoffs' },
  { href: '/admin/announcements', label: 'Announcements' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/account', label: 'Account' },
] as const;

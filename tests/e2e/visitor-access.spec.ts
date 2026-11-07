import { expect, test } from '@playwright/test';
import { anonClient, trackConsoleErrors } from './helpers';

const PUBLIC = ['/', '/teams', '/players', '/auction', '/auction/display', '/fixtures', '/fixtures?view=calendar', '/live', '/points-table', '/playoffs', '/announcements', '/login'];
const ADMIN = ['/admin', '/admin/tournament', '/admin/teams', '/admin/players', '/admin/players/import', '/admin/auction', '/admin/fixtures', '/admin/live', '/admin/standings-settings', '/admin/playoffs', '/admin/announcements', '/admin/account', '/admin/admins'];

test.describe('visitor access (12.3 E2E 3)', () => {
  for (const path of PUBLIC) {
    test(`public ${path} loads without a session`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('main')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ADMIN) {
    test(`admin ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    });
  }

  test('nine nav links work', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Teams', 'Players', 'Auction', 'Fixtures', 'Live Scores', 'Points Table', 'Playoffs', 'Admin Panel']) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }
  });

  test('admin RPCs fail for visitors', async () => {
    const c = anonClient();
    for (const [fn, args] of [
      ['start_auction_round', { p_force: true }],
      ['generate_league_fixtures', { p_format: 'single' }],
      ['rebuild_standings', {}],
    ] as const) {
      const { error } = await c.rpc(fn as never, args as never);
      expect(error, fn).not.toBeNull();
    }
    const { error } = await c.from('teams').insert({ tournament_id: '00000000-0000-0000-0000-000000000000', name: 'X', short_name: 'XX' } as never);
    expect(error).not.toBeNull();
  });

  test('robots.txt blocks admin and login', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /login');
  });

  test('unknown team and match ids show not found', async ({ page }) => {
    expect((await page.goto('/teams/not-a-uuid'))?.status()).toBe(404);
    expect((await page.goto('/matches/00000000-0000-0000-0000-000000000000'))?.status()).toBe(404);
  });
});

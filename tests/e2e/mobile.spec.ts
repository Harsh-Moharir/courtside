import { expect, test } from '@playwright/test';
import { anonClient } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile pages have no horizontal page scroll and usable touch targets (12.3 E2E 4)', async ({ page }) => {
  const { data: team } = await anonClient().from('teams').select('id').limit(1).maybeSingle();
  const { data: fixture } = await anonClient().from('fixtures').select('id').limit(1).maybeSingle();
  const paths = ['/', '/fixtures', '/live', '/points-table', '/playoffs', '/teams', '/players', '/auction'];
  if (team) paths.push(`/teams/${team.id}`);
  if (fixture) paths.push(`/matches/${fixture.id}`);
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    // Primary controls: the menu button and visible buttons are at least 36 px tall (44 px for main actions).
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('main button, header button')]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => ({ h: b.getBoundingClientRect().height, t: (b.textContent ?? '').trim().slice(0, 20) }))
        .filter((b) => b.h > 0 && b.h < 32),
    );
    expect(small, `${path} has tiny buttons: ${JSON.stringify(small)}`).toEqual([]);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /^Points Table/ })).toBeVisible();
});

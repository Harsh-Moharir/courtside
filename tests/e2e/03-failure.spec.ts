import { expect, test } from '@playwright/test';
import { adminClient, login, rpcOk } from './helpers';

/** 12.3 E2E 5: block the network during a scoring tap; the banner appears; Retry lands the action once. */
test('scoring survives a network drop and lands each tap exactly once', async ({ page, context }) => {
  const admin = await adminClient();
  // Two teams that are not playing a live match right now.
  const { data: liveFx } = await admin.from('fixtures').select('home_team_id, away_team_id').eq('status', 'live');
  const busyIds = new Set((liveFx ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]));
  const { data: allTeams } = await admin.from('teams').select('id, name').order('sort_order');
  const free = (allTeams ?? []).filter((t) => !busyIds.has(t.id));
  const [home, away] = free;
  expect(away).toBeTruthy();
  const created = await rpcOk<{ fixture: { id: string } }>(admin, 'create_fixture', { p_home: home!.id, p_away: away!.id, p_allow_duplicate: true });
  const fixtureId = created.fixture.id;
  await rpcOk(admin, 'start_match', { p_fixture_id: fixtureId });

  try {
    await login(page);
    await page.goto(`/admin/live/${fixtureId}`);
    const plus2 = page.getByRole('button', { name: new RegExp(`^${home!.name} plus 2`) });
    await expect(plus2).toBeEnabled();

    await context.setOffline(true);
    await plus2.click();
    await plus2.click();
    await expect(page.getByText(/Not saved: 2 actions pending/)).toBeVisible({ timeout: 15000 });
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/Not saved/)).toBeHidden({ timeout: 15000 });

    const score = async () => (await admin.from('match_states').select('home_score').eq('fixture_id', fixtureId).maybeSingle()).data?.home_score;
    const pointEvents = async () =>
      (await admin.from('live_scoring_events').select('id', { count: 'exact', head: true }).eq('fixture_id', fixtureId).eq('event_type', 'points')).count;
    await expect.poll(score, { timeout: 15000 }).toBe(4);
    await page.waitForTimeout(2000); // nothing lands twice afterwards
    expect(await score()).toBe(4);
    expect(await pointEvents()).toBe(2);
  } finally {
    await rpcOk(admin, 'abandon_match', { p_fixture_id: fixtureId, p_reason: 'E2E cleanup' }).catch(() => undefined);
    await rpcOk(admin, 'delete_fixture', { p_fixture_id: fixtureId }).catch(() => undefined);
  }
});

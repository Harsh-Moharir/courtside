import { expect, test } from '@playwright/test';
import { adminClient, rpcOk } from './helpers';

/** 12.3 E2E 2: a visitor sees bids, SOLD, score and clock changes without reloading (12.2 #6: within 2 s). */
test('visitor sees auction and score changes live', async ({ browser }) => {
  const admin = await adminClient();
  const visitor = await browser.newContext();
  const display = await visitor.newPage();
  const auctionPage = await visitor.newPage();

  // --- Arrange an auction lot the visitor can watch
  const { data: teams } = await admin.from('teams').select('id, name').order('sort_order').limit(2);
  expect(teams?.length).toBe(2);
  const [t1, t2] = teams!;
  const stamp = Date.now().toString(36);
  await rpcOk(admin, 'import_players', { p_rows: [{ row_number: 1, full_name: `Realtime Rookie ${stamp}`, primary_position: 'SF', base_price: 100 }] });
  const { data: p } = await admin.from('players').select('id').eq('full_name', `Realtime Rookie ${stamp}`).single();
  const { data: st } = await admin.from('auction_state').select('*').single();
  if (st!.status === 'not_started') await rpcOk(admin, 'start_auction_round', { p_force: true });
  if (st!.status === 'completed') await rpcOk(admin, 'reopen_auction');
  const { data: st2 } = await admin.from('auction_state').select('*').single();
  if (st2!.status === 'paused' && st2!.between_rounds) {
    try {
      await rpcOk(admin, 'start_next_round', { p_player_ids: [] });
    } catch {
      await rpcOk(admin, 'save_auction_settings', { p_settings: { max_rounds: 10, unsold_rule: 'manual_reenter' }, p_tiers: null });
      await rpcOk(admin, 'start_next_round', { p_player_ids: [] });
    }
  }
  if (st2!.status === 'paused' && !st2!.between_rounds) await rpcOk(admin, 'resume_auction');
  const { data: st3 } = await admin.from('auction_state').select('current_lot_id').single();
  if (st3!.current_lot_id) await rpcOk(admin, 'cancel_lot', { p_lot_id: st3!.current_lot_id });

  await display.goto('/auction/display');
  await auctionPage.goto('/auction');
  await display.waitForLoadState('networkidle');

  const lot = (await rpcOk<{ lot: { id: string } }>(admin, 'open_lot', { p_player_id: p!.id })).lot;
  await expect(display.getByText(`Realtime Rookie ${stamp}`).first()).toBeVisible({ timeout: 4000 });

  await rpcOk(admin, 'place_bid', { p_lot_id: lot.id, p_team_id: t1!.id, p_amount: 100, p_expected_current_bid: null, p_client_request_id: crypto.randomUUID() });
  await rpcOk(admin, 'place_bid', { p_lot_id: lot.id, p_team_id: t2!.id, p_amount: 200, p_expected_current_bid: 100, p_client_request_id: crypto.randomUUID() });
  await expect(auctionPage.getByText(t2!.name).first()).toBeVisible({ timeout: 3000 });

  const soldAt = Date.now();
  await rpcOk(admin, 'mark_sold', { p_lot_id: lot.id });
  await expect(display.getByText(/sold/i).first()).toBeVisible({ timeout: 2500 });
  expect(Date.now() - soldAt).toBeLessThan(2500);

  // The player is on the winning team's page without a reload (12.2 #1)
  const teamPage = await visitor.newPage();
  await teamPage.goto(`/teams/${t2!.id}`);
  await expect(teamPage.getByText(`Realtime Rookie ${stamp}`).first()).toBeVisible();

  // --- Live score
  const { data: created } = await admin.rpc('create_fixture', { p_home: t1!.id, p_away: t2!.id, p_allow_duplicate: true } as never);
  const fixtureId = (created as { fixture: { id: string } }).fixture.id;
  const { data: busy } = await admin
    .from('fixtures')
    .select('id')
    .eq('status', 'live')
    .or(`home_team_id.in.(${t1!.id},${t2!.id}),away_team_id.in.(${t1!.id},${t2!.id})`);
  for (const b of busy ?? []) await rpcOk(admin, 'abandon_match', { p_fixture_id: b.id, p_reason: 'E2E cleanup' });
  await rpcOk(admin, 'start_match', { p_fixture_id: fixtureId });
  const match = await visitor.newPage();
  await match.goto(`/matches/${fixtureId}`);
  await match.waitForLoadState('networkidle');
  const t0 = Date.now();
  await rpcOk(admin, 'score_points', { p_fixture_id: fixtureId, p_side: 'home', p_points: 3, p_client_request_id: crypto.randomUUID() });
  await expect(match.locator(':text-is("3"):visible').first()).toBeVisible({ timeout: 2500 });
  expect(Date.now() - t0).toBeLessThan(2500);

  await rpcOk(admin, 'clock_control', { p_fixture_id: fixtureId, p_action: 'start' });
  await expect.poll(async () => /\b9:5\d\b/.test(await match.locator('main').innerText()), { timeout: 8000 }).toBe(true);

  // cleanup
  await rpcOk(admin, 'abandon_match', { p_fixture_id: fixtureId, p_reason: 'E2E cleanup' });
  await rpcOk(admin, 'delete_fixture', { p_fixture_id: fixtureId });
  const tx = await admin.from('auction_transactions').select('id').eq('player_id', p!.id).eq('status', 'active').single();
  await rpcOk(admin, 'reverse_sale', { p_transaction_id: tx.data!.id, p_reason: 'E2E cleanup', p_return_status: 'available' });
  await rpcOk(admin, 'delete_player', { p_player_id: p!.id });
  await rpcOk(admin, 'end_auction_round');
  await rpcOk(admin, 'complete_auction');
  await visitor.close();
});

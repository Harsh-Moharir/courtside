import { expect, test } from '@playwright/test';
import { adminClient, login, rpcOk } from './helpers';
import { computeStandings } from '../../src/lib/domain/standings';

/**
 * 12.3 E2E 1: the smoke tournament, end to end through the admin UI on a fresh database (E2E_RESET=1).
 * Integrations 12.2 #1-#9 are asserted along the way.
 */
test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_RESET !== '1', 'needs a freshly reset database (E2E_RESET=1)');

// 8x8 orange PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4/58BK2IYlRJGAQDZqG/BV6DwAgAAAABJRU5ErkJggg==',
  'base64',
);
const TEAMS = [
  { name: 'Smoke Tigers', short: 'STI', p: '#F97316', s: '#111111', owner: 'Owner One' },
  { name: 'Smoke Hawks', short: 'SHA', p: '#1D4ED8', s: '#FACC15', owner: 'Owner Two' },
  { name: 'Smoke Bulls', short: 'SBU', p: '#DC2626', s: '#FFFFFF', owner: 'Owner Three' },
  { name: 'Smoke Lions', short: 'SLI', p: '#16A34A', s: '#0A0A0A', owner: 'Owner Four' },
];
const POS = ['PG', 'SG', 'SF', 'PF', 'C'];

test('full tournament: teams → players → auction → rosters → fixtures → scoring → standings → playoffs → champion', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const admin = await adminClient();
  await login(page);

  // ---- Teams with owners, logos and colours (UI)
  const teamIds: string[] = [];
  for (const t of TEAMS) {
    await page.goto('/admin/teams');
    await page.getByRole('button', { name: 'Add team' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add team' });
    await dlg.locator('#team-name').fill(t.name);
    await dlg.locator('#team-short').fill(t.short);
    await dlg.locator('#team-primary').fill(t.p);
    await dlg.locator('#team-secondary').fill(t.s);
    await dlg.locator('#team-owner').fill(t.owner);
    await dlg.locator('input[aria-label="Team logo file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await dlg.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/admin\/teams\/[0-9a-f-]{36}$/, { timeout: 30000 });
    teamIds.push(page.url().split('/').pop()!);
  }
  const { data: dbTeams } = await admin.from('teams').select('id, logo_path, team_owners(full_name)');
  expect(dbTeams).toHaveLength(4);
  for (const t of dbTeams!) expect(t.logo_path).toBeTruthy();

  // ---- One player by hand, 23 by CSV import (UI)
  await page.goto('/admin/players');
  await page.getByRole('button', { name: 'Add player' }).first().click();
  const pdlg = page.getByRole('dialog', { name: 'Add player' });
  await pdlg.locator('#pl-name').fill('Hand Made Guard');
  await pdlg.locator('#pl-pp').selectOption('PG');
  await pdlg.locator('#pl-base').fill('100');
  await pdlg.getByRole('button', { name: 'Add player' }).click();
  await expect(pdlg).toBeHidden({ timeout: 15000 });

  const csv = ['Player Name,Position,Secondary,Height,Jersey,Base']
    .concat(Array.from({ length: 23 }, (_, i) => `Import Player ${String(i + 1).padStart(2, '0')},${POS[i % 5]},,${170 + i},${i},100`))
    .join('\n');
  await page.goto('/admin/players/import');
  await page.locator('input[aria-label="Choose a file to import"]').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: /Import 23 player/ }).click();
  await expect.poll(async () => (await admin.from('players').select('id', { count: 'exact', head: true })).count, { timeout: 20000 }).toBe(24);

  // ---- Two icon players per team (UI)
  for (const id of teamIds) {
    await page.goto(`/admin/teams/${id}`);
    const assign = page.getByRole('button', { name: 'Assign', exact: true });
    await expect(assign).toHaveCount(2);
    for (const left of [1, 0]) {
      await assign.first().click();
      const idlg = page.getByRole('dialog', { name: /Icon player [12]/ });
      await idlg.getByRole('button', { name: /Import Player/ }).first().click();
      await expect(idlg).toBeHidden({ timeout: 15000 });
      await expect(assign).toHaveCount(left, { timeout: 15000 });
    }
  }
  const { count: icons } = await admin.from('players').select('id', { count: 'exact', head: true }).eq('status', 'icon');
  expect(icons).toBe(8);

  // ---- Auction through the console: one UNSOLD, re-entry round, everyone else sold (UI)
  await page.goto('/admin/auction');
  await page.getByRole('button', { name: 'Start round 1' }).click();
  await expect(page.getByRole('button', { name: 'End round' })).toBeVisible({ timeout: 15000 });

  const sellCurrentLot = async (teamIndex: number) => {
    const team = TEAMS[teamIndex % 4]!;
    await page.getByRole('radio', { name: new RegExp(team.short) }).first().click();
    await page.getByRole('button', { name: /^Bid / }).click();
    await expect(page.getByRole('button', { name: /^Sold$/ })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: /^Sold$/ }).click();
    await page.getByRole('dialog', { name: 'Confirm sale' }).getByRole('button', { name: 'Sold' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm sale' })).toBeHidden({ timeout: 15000 });
  };

  // first lot: UNSOLD without bids
  await page.getByRole('button', { name: 'Bring up' }).first().click();
  await page.getByRole('button', { name: /^Unsold$/ }).click();
  await page.getByRole('dialog', { name: 'Mark unsold' }).getByRole('button', { name: 'Mark unsold' }).click();
  await expect(page.getByRole('dialog', { name: 'Mark unsold' })).toBeHidden({ timeout: 15000 });

  for (let i = 0; i < 15; i++) {
    await page.getByRole('button', { name: 'Bring up' }).first().click();
    await sellCurrentLot(i);
  }
  await page.getByRole('button', { name: 'End round' }).click();
  await page.getByRole('dialog', { name: /End round/ }).getByRole('button', { name: 'End round' }).click();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Start next round with selected \(1\)/ }).click();
  await page.getByRole('button', { name: 'Bring up' }).first().click();
  await sellCurrentLot(1);
  await page.getByRole('button', { name: 'Complete auction' }).click();
  await page.getByRole('dialog', { name: 'Complete the auction' }).getByRole('button', { name: 'Complete auction' }).click();
  await expect(page.getByRole('button', { name: 'Reopen auction' })).toBeVisible({ timeout: 15000 });

  // 12.2 #1-#3: rosters, purses, history
  const { data: fin } = await admin.from('v_team_finance').select('*');
  const { data: txns } = await admin.from('auction_transactions').select('team_id, price, purchase_order, status');
  expect(txns!.filter((x) => x.status === 'active')).toHaveLength(16);
  for (const f of fin!) {
    const spent = txns!.filter((x) => x.team_id === f.team_id && x.status === 'active').reduce((s, x) => s + Number(x.price), 0);
    expect(Number(f.purse_spent)).toBe(spent);
  }
  expect(fin!.map((f) => f.squad_count).sort()).toEqual([5, 6, 6, 7]); // 2 icons each + 4/5/4/3 purchases
  expect(txns!.map((x) => x.purchase_order).sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  await page.goto(`/teams/${teamIds[1]}`);
  await expect(page.getByText(/Import Player/).first()).toBeVisible();
  await page.goto('/auction');
  await expect(page.locator(':text("Smoke Hawks"):visible').first()).toBeVisible();

  // ---- Double round robin + auto-schedule (UI); 12.2 #4
  await page.goto('/admin/fixtures');
  await page.getByText('Double round robin').click();
  await page.getByRole('button', { name: 'Generate 12 fixtures' }).click();
  await expect.poll(async () => (await admin.from('fixtures').select('id', { count: 'exact', head: true })).count, { timeout: 15000 }).toBe(12);
  await page.getByRole('button', { name: 'Schedule fixtures' }).click();
  await expect.poll(async () => (await admin.from('fixtures').select('id', { count: 'exact', head: true }).is('scheduled_at', null)).count, { timeout: 15000 }).toBe(0);
  const { data: fx } = await admin.from('fixtures').select('id, home_team_id, away_team_id, match_number').order('match_number');
  expect(new Set(fx!.flatMap((f) => [f.home_team_id, f.away_team_id]))).toEqual(new Set(teamIds));

  // ---- Score match 1 fully through the console (UI); 12.2 #5 and #7
  const { data: before } = await admin.from('standings').select('*');
  const first = fx![0]!;
  await page.goto('/admin/live');
  await page.getByRole('button', { name: 'Start match' }).first().click();
  await page.waitForURL(/\/admin\/live\/[0-9a-f-]{36}$/);
  const liveId = page.url().split('/').pop()!;
  expect(liveId).toBe(first.id);
  const homeName = TEAMS[teamIds.indexOf(first.home_team_id!)]!.name;
  const awayName = TEAMS[teamIds.indexOf(first.away_team_id!)]!.name;
  for (const [team, pts] of [[homeName, 3], [awayName, 2], [homeName, 2], [homeName, 1], [awayName, 3], [homeName, 2]] as const) {
    await page.getByRole('button', { name: new RegExp(`^${team} plus ${pts}`) }).click();
  }
  await expect.poll(async () => (await admin.from('match_states').select('home_score, away_score').eq('fixture_id', liveId).single()).data, { timeout: 15000 }).toEqual({ home_score: 8, away_score: 5 });
  const pub = await page.context().browser()!.newPage();
  await pub.goto(`/matches/${liveId}`);
  await expect(pub.getByText(/live/i).first()).toBeVisible();
  const { data: mid } = await admin.from('standings').select('*');
  expect(mid).toEqual(before); // live scoring never changes official standings
  await page.getByRole('button', { name: /End period/ }).click();
  await page.getByRole('button', { name: /^End match/ }).click();
  await page.getByRole('dialog', { name: 'End match' }).getByRole('button', { name: 'Complete match' }).click();
  await expect.poll(async () => (await admin.from('fixtures').select('status').eq('id', liveId).single()).data?.status, { timeout: 15000 }).toBe('completed');
  const { data: after } = await admin.from('standings').select('*');
  const changed = after!.filter((a) => {
    const b = before!.find((x) => x.team_id === a.team_id)!;
    return a.played !== b.played || a.league_points !== b.league_points || a.points_for !== b.points_for;
  });
  expect(changed.map((c) => c.team_id).sort()).toEqual([first.home_team_id, first.away_team_id].sort());

  // ---- Remaining league matches via RPC for speed
  for (const [i, f] of fx!.slice(1).entries()) {
    await rpcOk(admin, 'complete_match', { p_fixture_id: f.id, p_home_score: 60 + ((i * 7) % 20), p_away_score: 61 + ((i * 11) % 23) === 60 + ((i * 7) % 20) ? 50 : 61 + ((i * 11) % 23), p_note: null });
  }
  // standings equal an independent computation from the stored results
  const { data: res } = await admin.from('match_results').select('fixture_id, home_score, away_score, winner_team_id');
  const expected = computeStandings(
    TEAMS.map((t, i) => ({ id: teamIds[i]!, name: t.name, manualTiebreakRank: null })),
    res!.map((r) => {
      const f = fx!.find((x) => x.id === r.fixture_id)!;
      return { homeTeamId: f.home_team_id!, awayTeamId: f.away_team_id!, homeScore: r.home_score, awayScore: r.away_score, winnerTeamId: r.winner_team_id };
    }),
    { winPoints: 2, lossPoints: 0, drawPoints: 1, tiebreakerOrder: ['head_to_head', 'point_difference', 'points_for'] },
  );
  const { data: table } = await admin.from('standings').select('team_id, rank, league_points, played').order('rank');
  expect(table!.map((r) => r.team_id)).toEqual(expected.map((r) => r.teamId));
  expect(table!.every((r) => r.played === 6)).toBe(true);
  await page.goto('/points-table');
  await expect(page.getByText(TEAMS[teamIds.indexOf(expected[0]!.teamId)]!.name).first()).toBeVisible();

  // ---- Bracket (UI) seeded from the final standings; 12.2 #8
  await page.goto('/admin/playoffs');
  await page.getByRole('button', { name: 'Generate bracket' }).click();
  await expect.poll(async () => (await admin.from('playoff_nodes').select('id', { count: 'exact', head: true })).count, { timeout: 15000 }).toBe(3);
  const node = async (code: string) => (await admin.from('playoff_nodes').select('fixture_id, fixtures(home_team_id, away_team_id)').eq('code', code).single()).data!;
  const sf1 = await node('SF1');
  const sf2 = await node('SF2');
  const seeds = expected.map((r) => r.teamId);
  expect(sf1.fixtures).toEqual({ home_team_id: seeds[0], away_team_id: seeds[3] });
  expect(sf2.fixtures).toEqual({ home_team_id: seeds[1], away_team_id: seeds[2] });

  // ---- Semifinals and final; 12.2 #9
  await rpcOk(admin, 'complete_match', { p_fixture_id: sf1.fixture_id, p_home_score: 70, p_away_score: 64, p_note: null });
  await rpcOk(admin, 'complete_match', { p_fixture_id: sf2.fixture_id, p_home_score: 55, p_away_score: 66, p_note: null });
  const fin1 = await node('F');
  expect(fin1.fixtures).toEqual({ home_team_id: seeds[0], away_team_id: seeds[2] });
  await rpcOk(admin, 'complete_match', { p_fixture_id: fin1.fixture_id, p_home_score: 81, p_away_score: 79, p_note: null });
  const champ = TEAMS[teamIds.indexOf(seeds[0]!)]!;
  await page.goto('/');
  await expect(page.getByText('Tournament Champions')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tournament champions' }).getByText(champ.name)).toBeVisible();
  await page.goto('/playoffs');
  await expect(page.getByText('Tournament Champions')).toBeVisible();
});

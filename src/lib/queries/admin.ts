import 'server-only';
import { getServerClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

const FALLBACK_NOTE = 'Level on all criteria, ordered by admin ranking or name';

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
  detail?: string;
}

export interface DashboardWarning {
  key: string;
  message: string;
  href: string;
}

export interface DashboardData {
  tournament: Tables<'tournaments'> | null;
  counts: {
    teams: number;
    players: { total: number; available: number; sold: number; unsold: number; icon: number };
    fixtures: { total: number; completed: number; league: number; leagueCompleted: number };
    live: number;
  };
  auction: { status: Tables<'auction_state'>['status']; current_round: number; between_rounds: boolean } | null;
  checklist: ChecklistItem[];
  warnings: DashboardWarning[];
}

/** Everything the admin dashboard shows; ticks and warnings are computed from data, never stored (11.6). */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await getServerClient();
  const [
    { data: tournament },
    { data: teams },
    { data: owners },
    { data: roster },
    { data: players },
    { data: auction },
    { data: auctionSettings },
    { data: fixtures },
    { data: finance },
    { data: standings },
    { data: bracket },
    { data: nodes },
    { data: playoffSettings },
  ] = await Promise.all([
    supabase.from('tournaments').select('*').eq('is_active', true).maybeSingle(),
    supabase.from('teams').select('id, name'),
    supabase.from('team_owners').select('team_id, full_name'),
    supabase.from('team_players').select('team_id, source, icon_slot, players(jersey_number, full_name)'),
    supabase.from('players').select('status'),
    supabase.from('auction_state').select('status, current_round, between_rounds').maybeSingle(),
    supabase.from('auction_settings').select('*').maybeSingle(),
    supabase.from('fixtures').select('id, stage, status, scheduled_at, home_team_id, away_team_id').limit(500),
    supabase.from('v_team_finance').select('*'),
    supabase.from('standings').select('team_id, rank, league_points, tiebreak_note').order('rank'),
    supabase.from('playoff_brackets').select('*').maybeSingle(),
    supabase.from('playoff_nodes').select('id, fixture_id'),
    supabase.from('playoff_settings').select('*').maybeSingle(),
  ]);

  const teamList = teams ?? [];
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));
  const p = players ?? [];
  const playerCounts = {
    total: p.length,
    available: p.filter((x) => x.status === 'available').length,
    sold: p.filter((x) => x.status === 'sold').length,
    unsold: p.filter((x) => x.status === 'unsold').length,
    icon: p.filter((x) => x.status === 'icon').length,
  };
  const fx = fixtures ?? [];
  const league = fx.filter((f) => f.stage === 'league');
  const counts = {
    teams: teamList.length,
    players: playerCounts,
    fixtures: {
      total: fx.length,
      completed: fx.filter((f) => f.status === 'completed').length,
      league: league.length,
      leagueCompleted: league.filter((f) => f.status === 'completed').length,
    },
    live: fx.filter((f) => f.status === 'live').length,
  };

  const ownerSet = new Set((owners ?? []).filter((o) => o.full_name).map((o) => o.team_id));
  const iconCount = new Map<string, number>();
  for (const r of roster ?? []) if (r.source === 'icon') iconCount.set(r.team_id, (iconCount.get(r.team_id) ?? 0) + 1);
  const teamsMissingSetup = teamList.filter((t) => !ownerSet.has(t.id) || (iconCount.get(t.id) ?? 0) < 2);
  const leagueComplete = league.length > 0 && !league.some((f) => ['upcoming', 'live', 'postponed'].includes(f.status));
  const settingsReviewed =
    !!auctionSettings && (auctionSettings.updated_at !== auctionSettings.created_at || (auction?.status ?? 'not_started') !== 'not_started');

  const checklist: ChecklistItem[] = [
    { key: 'teams', label: 'Teams created (at least 2)', done: teamList.length >= 2, href: '/admin/teams', detail: `${teamList.length}/10 teams` },
    {
      key: 'owners',
      label: 'Owners and icon players set',
      done: teamList.length > 0 && teamsMissingSetup.length === 0,
      href: '/admin/teams',
      detail: teamsMissingSetup.length ? `Missing for ${teamsMissingSetup.map((t) => t.name).join(', ')}` : undefined,
    },
    { key: 'players', label: 'Players registered', done: p.length > 0, href: '/admin/players', detail: `${p.length} players` },
    { key: 'auction-settings', label: 'Auction settings reviewed', done: settingsReviewed, href: '/admin/auction' },
    { key: 'auction', label: 'Auction completed', done: auction?.status === 'completed', href: '/admin/auction' },
    { key: 'fixtures', label: 'Fixtures generated', done: league.length > 0, href: '/admin/fixtures' },
    {
      key: 'scheduled',
      label: 'Fixtures scheduled',
      done: league.length > 0 && league.every((f) => f.scheduled_at || f.status === 'completed'),
      href: '/admin/fixtures',
      detail: league.length ? `${league.filter((f) => !f.scheduled_at && f.status !== 'completed').length} without a date` : undefined,
    },
    { key: 'league', label: 'League completed', done: leagueComplete, href: '/admin/live', detail: `${counts.fixtures.leagueCompleted}/${league.length} played` },
    { key: 'bracket', label: 'Playoff bracket generated', done: (nodes ?? []).length > 0, href: '/admin/playoffs' },
    {
      key: 'champion',
      label: 'Champion decided',
      done: !!tournament?.champion_team_id,
      href: '/admin/playoffs',
      detail: tournament?.champion_team_id ? teamName.get(tournament.champion_team_id) : undefined,
    },
  ];

  const warnings: DashboardWarning[] = [];

  if (auction?.status === 'completed' && auctionSettings) {
    for (const f of finance ?? []) {
      if ((f.squad_count ?? 0) < f.min_squad_size) {
        warnings.push({
          key: `min-${f.team_id}`,
          message: `${teamName.get(f.team_id) ?? 'A team'} has ${f.squad_count ?? 0} players, below the minimum of ${f.min_squad_size}.`,
          href: `/admin/teams/${f.team_id}`,
        });
      }
    }
  }

  const jerseys = new Map<string, string[]>();
  for (const r of (roster ?? []) as unknown as { team_id: string; players: { jersey_number: number | null; full_name: string } | null }[]) {
    const j = r.players?.jersey_number;
    if (j === null || j === undefined) continue;
    const key = `${r.team_id}:${j}`;
    jerseys.set(key, [...(jerseys.get(key) ?? []), r.players?.full_name ?? '']);
  }
  for (const [key, names] of jerseys) {
    if (names.length < 2) continue;
    const [teamId, num] = key.split(':') as [string, string];
    warnings.push({
      key: `jersey-${key}`,
      message: `Jersey #${num} is shared by ${names.join(' and ')} (${teamName.get(teamId) ?? 'team'}).`,
      href: `/admin/teams/${teamId}`,
    });
  }

  if (league.length > 0) {
    const inFixtures = new Set<string>();
    for (const f of league) {
      if (f.home_team_id) inFixtures.add(f.home_team_id);
      if (f.away_team_id) inFixtures.add(f.away_team_id);
    }
    const current = new Set(teamList.map((t) => t.id));
    const changed = inFixtures.size !== current.size || [...current].some((id) => !inFixtures.has(id));
    if (changed) warnings.push({ key: 'teams-changed', message: 'Teams changed since fixtures were generated.', href: '/admin/fixtures' });
  }

  const qualifying = playoffSettings?.qualifying_teams ?? 4;
  const st = standings ?? [];
  const atCut = st.find((s) => s.rank === qualifying);
  const belowCut = st.find((s) => s.rank === qualifying + 1);
  if (atCut && belowCut && atCut.league_points === belowCut.league_points && belowCut.tiebreak_note === FALLBACK_NOTE) {
    warnings.push({
      key: 'cutoff-fallback',
      message: `Places ${qualifying} and ${qualifying + 1} are separated only by the admin ranking / name fallback. Set a manual tiebreak rank if needed.`,
      href: '/admin/standings-settings',
    });
  }

  const nodeFixtureIds = new Set((nodes ?? []).map((n) => n.fixture_id));
  const playoffsStarted = fx.some((f) => f.stage === 'playoff' && nodeFixtureIds.has(f.id) && ['live', 'completed'].includes(f.status));
  const seeds = (Array.isArray(bracket?.seeds) ? bracket.seeds : []) as { seed: number; team_id: string }[];
  if (bracket && playoffsStarted && seeds.length > 0 && leagueComplete) {
    const top = st.filter((s) => s.rank <= bracket.qualifying_teams).map((s) => s.team_id);
    const seedIds = [...seeds].sort((a, b) => a.seed - b.seed).map((s) => s.team_id);
    if (top.join(',') !== seedIds.join(',')) {
      warnings.push({ key: 'seeds-kept', message: 'League results changed after playoffs started: seeds were kept.', href: '/admin/playoffs' });
    }
  }

  if (bracket && playoffSettings && (nodes ?? []).length > 0) {
    if (
      bracket.format !== playoffSettings.format ||
      bracket.qualifying_teams !== playoffSettings.qualifying_teams ||
      bracket.third_place_match !== playoffSettings.third_place_match
    ) {
      warnings.push({ key: 'bracket-stale', message: 'Playoff settings changed: regenerate the bracket.', href: '/admin/playoffs' });
    }
  }

  return { tournament: tournament ?? null, counts, auction: auction ?? null, checklist, warnings };
}

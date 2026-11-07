/**
 * Demo data for LOCAL development only (8 teams, 40 players). Refuses to run against a non-local project
 * unless --i-know-this-is-not-production is passed.
 *
 *   pnpm seed                 # teams, owners, players, icon players
 *   pnpm seed --stage=auction # + a completed auction
 *   pnpm seed --stage=league  # + double round robin, scheduled, ~60% played, one live match
 */
import { serviceClient } from './_client';

const stage = (process.argv.find((a) => a.startsWith('--stage='))?.split('=')[1] ?? 'base') as 'base' | 'auction' | 'league';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes('--i-know-this-is-not-production')) {
  console.error(`Refusing to seed ${url}: demo data must never be written to production.`);
  process.exit(1);
}

const supabase = serviceClient();

const TEAMS = [
  { name: 'Nagpur Tigers', short: 'NGT', p: '#F97316', s: '#111111', owner: 'Rohan Deshmukh' },
  { name: 'Mumbai Mavericks', short: 'MUM', p: '#1D4ED8', s: '#FACC15', owner: 'Ananya Iyer' },
  { name: 'Pune Phantoms', short: 'PUN', p: '#7C3AED', s: '#E5E7EB', owner: 'Kabir Malhotra' },
  { name: 'Delhi Dunkers', short: 'DEL', p: '#DC2626', s: '#FFFFFF', owner: 'Meera Kapoor' },
  { name: 'Chennai Chargers', short: 'CHE', p: '#EAB308', s: '#1E3A8A', owner: 'Arjun Raghavan' },
  { name: 'Kolkata Knights', short: 'KOL', p: '#0F172A', s: '#F59E0B', owner: 'Sneha Banerjee' },
  { name: 'Jaipur Jaguars', short: 'JAI', p: '#DB2777', s: '#111827', owner: 'Vikram Singh Rathore' },
  { name: 'Bengaluru Blaze', short: 'BLR', p: '#16A34A', s: '#0A0A0A', owner: 'Priya Nair' },
];

const FIRST = ['Aman', 'Rahul', 'Siddharth', 'Karan', 'Aditya', 'Nikhil', 'Varun', 'Ishaan', 'Arnav', 'Dev', 'Yash', 'Kunal', 'Rohit', 'Tanmay', 'Harsh', 'Omkar', 'Pranav', 'Sahil', 'Manav', 'Zubin'];
const LAST = ['Verma', 'Sharma', 'Patil', 'Joshi', 'Kulkarni', 'Mehta', 'Reddy', 'Gupta', 'Fernandes', 'Chatterjee', 'Bose', 'Khan', 'D’Souza', 'Pillai', 'Rao', 'Naidu', 'Saxena', 'Thakur', 'Gill', 'Menon'];
const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(`${name}: ${error.message} ${error.details ?? ''}`);
  return data as Record<string, unknown>;
}

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

async function main() {
  const { data: t } = await supabase.from('tournaments').select('*').eq('is_active', true).single();
  if (!t) throw new Error('No active tournament: apply the migrations first.');
  const tid = t.id;
  const { count } = await supabase.from('teams').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) {
    console.log('Teams already exist: skipping the base seed (run `pnpm db:reset` for a clean database).');
  } else {
    await supabase.from('tournaments').update({ name: 'Courtside Premier League', tagline: 'Ten-minute quarters. Twenty-four-second dreams.', venue_default: 'Main Court' }).eq('id', tid);
    for (const [i, team] of TEAMS.entries()) {
      const { data, error } = await supabase
        .from('teams')
        .insert({ tournament_id: tid, name: team.name, short_name: team.short, primary_color: team.p, secondary_color: team.s, sort_order: i })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('team_owners').insert({ tournament_id: tid, team_id: data.id, full_name: team.owner });
    }
    const r = rnd(42);
    const rows = Array.from({ length: 40 }, (_, i) => {
      const primary = POS[i % 5] as string;
      const sec = r() > 0.4 ? POS[(i + 1 + Math.floor(r() * 3)) % 5] : null;
      return {
        row_number: i + 1,
        full_name: i === 7 ? 'आदित्य कुलकर्णी' : i === 13 ? 'José Álvarez' : `${FIRST[i % 20]} ${LAST[(i * 7) % 20]}`,
        primary_position: primary,
        secondary_position: sec === primary ? null : sec,
        age: 18 + Math.floor(r() * 16),
        height_cm: 170 + Math.floor(r() * 40),
        jersey_number: Math.floor(r() * 100),
        description: r() > 0.6 ? 'Quick off the dribble, loves the corner three.' : null,
        base_price: [100, 100, 200, 300, 500][Math.floor(r() * 5)],
      };
    });
    await rpc('import_players', { p_rows: rows });
    const { data: teams } = await supabase.from('teams').select('id').order('sort_order');
    const { data: players } = await supabase.from('players').select('id').order('base_price', { ascending: false }).order('full_name');
    let k = 0;
    for (const team of teams ?? []) {
      for (const slot of [1, 2]) {
        await rpc('set_icon_player', { p_team_id: team.id, p_slot: slot, p_player_id: players?.[k++]?.id });
      }
    }
    console.log('✔ 8 teams, owners, 40 players, 16 icon players');
  }

  if (stage === 'auction' || stage === 'league') {
    const { data: st } = await supabase.from('auction_state').select('*').single();
    if (st?.status === 'not_started') {
      await rpc('save_auction_settings', { p_settings: { min_squad_size: 4, max_squad_size: 8 }, p_tiers: null });
      await rpc('start_auction_round', { p_force: true });
      const r = rnd(7);
      const { data: pool } = await supabase.from('players').select('id').eq('status', 'available').order('full_name');
      const { data: teams } = await supabase.from('teams').select('id').order('sort_order');
      for (const p of pool ?? []) {
        const lot = (await rpc('open_lot', { p_player_id: p.id })).lot as { id: string; base_price: number };
        if (r() < 0.12) {
          await rpc('mark_unsold', { p_lot_id: lot.id, p_discard_bids: true });
          continue;
        }
        let current: number | null = null;
        let leader: string | null = null;
        const nBids = 1 + Math.floor(r() * 5);
        for (let b = 0; b < nBids; b++) {
          const cands = (teams ?? []).filter((x) => x.id !== leader);
          const team = cands[Math.floor(r() * cands.length)]!;
          const amount: number = current === null ? lot.base_price : current + (current >= 2000 ? 250 : 100);
          try {
            await rpc('place_bid', { p_lot_id: lot.id, p_team_id: team.id, p_amount: amount, p_expected_current_bid: current, p_client_request_id: crypto.randomUUID() });
            current = amount;
            leader = team.id;
          } catch {
            /* squad full or purse: try another bid */
          }
        }
        if (current === null) await rpc('mark_unsold', { p_lot_id: lot.id, p_discard_bids: true });
        else await rpc('mark_sold', { p_lot_id: lot.id });
      }
      await rpc('end_auction_round');
      await rpc('complete_auction');
      console.log('✔ auction completed');
    } else {
      console.log(`Auction status is ${st?.status}: skipping the auction seed.`);
    }
  }

  if (stage === 'league') {
    const { count: fx } = await supabase.from('fixtures').select('id', { count: 'exact', head: true });
    if ((fx ?? 0) === 0) {
      await rpc('generate_league_fixtures', { p_format: 'double', p_shuffle_seed: 7, p_replace: false });
      const start = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
      await rpc('auto_schedule_fixtures', {
        p_start_date: start, p_game_days: [1, 2, 3, 4, 5, 6, 7], p_first_start: '17:00', p_slot_minutes: 90,
        p_courts: ['Court A', 'Court B'], p_slots_per_day: 2, p_scope: 'unscheduled',
      });
      const { data: fixtures } = await supabase.from('fixtures').select('id, match_number').eq('stage', 'league').order('match_number');
      const r = rnd(99);
      const played = Math.floor((fixtures?.length ?? 0) * 0.6);
      for (const f of (fixtures ?? []).slice(0, played)) {
        let h = 55 + Math.floor(r() * 35);
        const a = 55 + Math.floor(r() * 35);
        if (h === a) h += 2;
        await rpc('complete_match', { p_fixture_id: f.id, p_home_score: h, p_away_score: a, p_note: null });
      }
      const live = fixtures?.[played];
      if (live) {
        await rpc('start_match', { p_fixture_id: live.id });
        for (const [side, pts] of [['home', 2], ['away', 3], ['home', 2], ['home', 1], ['away', 2]] as const) {
          await rpc('score_points', { p_fixture_id: live.id, p_side: side, p_points: pts, p_client_request_id: crypto.randomUUID() });
        }
        await rpc('add_foul', { p_fixture_id: live.id, p_side: 'away', p_delta: 1 });
        await rpc('clock_control', { p_fixture_id: live.id, p_action: 'start' });
        await rpc('set_featured_fixture', { p_fixture_id: live.id });
      }
      await supabase.from('announcements').insert([
        { tournament_id: tid, title: 'Welcome to the Courtside Premier League', body: 'Eight teams, one trophy. Follow every auction bid and every basket live on this site.\nTickets are free for all league matches.', is_pinned: true },
        { tournament_id: tid, title: 'Court B lights upgraded', body: 'Evening games on Court B now start on time after the lighting upgrade.' },
      ]);
      console.log(`✔ league: ${fixtures?.length} fixtures, ${played} played, 1 live`);
    } else {
      console.log('Fixtures already exist: skipping the league seed.');
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

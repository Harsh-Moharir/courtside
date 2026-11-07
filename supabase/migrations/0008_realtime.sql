-- 0008_realtime.sql
-- Realtime publication, replica identity, and the final function privilege pass (4.3).

do $$
declare t text;
begin
  foreach t in array array['tournaments','teams','players','team_players','announcements','auction_state','auction_lots',
    'auction_bids','auction_events','auction_transactions','fixtures','match_states','live_scoring_events','match_results',
    'standings','playoff_brackets','playoff_nodes','team_owners']
  loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges. Every RPC: revoke from public and anon, grant to authenticated (the function still checks
-- is_admin()). Internal helpers (prefix "_", triggers, recalculation) are not callable by any client role.
-- Read-only public helpers are granted to anon as well.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname in (
      -- admin RPCs (each checks is_admin() itself)
      'start_auction_round','pause_auction','resume_auction','end_auction_round','start_next_round','complete_auction',
      'reopen_auction','auction_warnings','open_lot','open_random_lot','place_bid','undo_last_bid','mark_sold','mark_unsold',
      'cancel_lot','reverse_sale','reassign_player','set_team_purse','save_auction_settings','set_icon_player',
      'set_player_status','delete_player','delete_team','bulk_set_base_price','import_players',
      'generate_league_fixtures','auto_schedule_fixtures','create_fixture','update_fixture','delete_fixture',
      'renumber_fixtures','set_featured_fixture','postpone_fixture','reschedule_fixture',
      'start_match','score_points','add_foul','record_timeout','correct_score','clock_control','change_period',
      'undo_last_event','complete_match','record_forfeit','correct_match_result','reopen_match','abandon_match',
      'save_match_rules','rebuild_standings','save_points_settings','refresh_seeds','save_playoff_settings',
      'generate_playoff_bracket') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname in (
      -- public read helpers (used by RLS policies, views and spectators)
      'is_admin','active_tournament_id','server_time','team_max_bid','team_squad_count','bid_step',
      'compute_standings','round_robin_pairs','playoff_template') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

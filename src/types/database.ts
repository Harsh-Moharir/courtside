
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "administrators": {
                  Row: {
                    "created_at": string,"email": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"announcements": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"id": string,"is_pinned": boolean,"published_at": string,"title": string,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string,"title": string,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string,"title"?: string,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_bids": {
                  Row: {
                    "amount": number,"client_request_id": string | null,"created_at": string,"created_by": string,"id": string,"is_voided": boolean,"lot_id": string,"sequence": number,"team_id": string,"tournament_id": string,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"client_request_id"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"is_voided"?: boolean,"lot_id": string,"sequence": number,"team_id": string,"tournament_id": string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"client_request_id"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"is_voided"?: boolean,"lot_id"?: string,"sequence"?: number,"team_id"?: string,"tournament_id"?: string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_bids_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "auction_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_bids_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_bids_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "auction_bids_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_events": {
                  Row: {
                    "amount": number | null,"created_at": string,"created_by": string | null,"event_type": Database["public"]['Enums']["auction_event_type"],"id": string,"lot_id": string | null,"message": string,"payload": NonNullable<Json>,"player_id": string | null,"team_id": string | null,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"created_by"?: string | null,"event_type": Database["public"]['Enums']["auction_event_type"],"id"?: string,"lot_id"?: string | null,"message": string,"payload"?: NonNullable<Json>,"player_id"?: string | null,"team_id"?: string | null,"tournament_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"created_by"?: string | null,"event_type"?: Database["public"]['Enums']["auction_event_type"],"id"?: string,"lot_id"?: string | null,"message"?: string,"payload"?: NonNullable<Json>,"player_id"?: string | null,"team_id"?: string | null,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_events_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "auction_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_events_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_events_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_events_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "auction_events_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_increment_tiers": {
                  Row: {
                    "created_at": string,"from_amount": number,"id": string,"step": number,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_amount": number,"id"?: string,"step": number,"tournament_id": string
                  }
                  Update: {
                    "created_at"?: string,"from_amount"?: number,"id"?: string,"step"?: number,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_increment_tiers_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_lots": {
                  Row: {
                    "base_price": number,"bid_count": number,"closed_at": string | null,"closed_by": string | null,"created_at": string,"current_bid": number | null,"id": string,"leading_team_id": string | null,"lot_number": number,"opened_at": string,"player_id": string | null,"player_name": string,"player_photo_path": string | null,"primary_position": Database["public"]['Enums']["player_position"] | null,"round_number": number,"secondary_position": Database["public"]['Enums']["player_position"] | null,"status": Database["public"]['Enums']["lot_status"],"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_price": number,"bid_count"?: number,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"current_bid"?: number | null,"id"?: string,"leading_team_id"?: string | null,"lot_number": number,"opened_at"?: string,"player_id"?: string | null,"player_name": string,"player_photo_path"?: string | null,"primary_position"?: Database["public"]['Enums']["player_position"] | null,"round_number": number,"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["lot_status"],"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "base_price"?: number,"bid_count"?: number,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"current_bid"?: number | null,"id"?: string,"leading_team_id"?: string | null,"lot_number"?: number,"opened_at"?: string,"player_id"?: string | null,"player_name"?: string,"player_photo_path"?: string | null,"primary_position"?: Database["public"]['Enums']["player_position"] | null,"round_number"?: number,"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["lot_status"],"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_lots_leading_team_id_fkey"
      columns: ["leading_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_lots_leading_team_id_fkey"
      columns: ["leading_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "auction_lots_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_lots_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_settings": {
                  Row: {
                    "created_at": string,"default_base_price": number,"icon_counts_in_squad": boolean,"max_rounds": number,"max_squad_size": number,"min_squad_size": number,"purse_per_team": number,"reserve_per_slot": number,"tournament_id": string,"unsold_base_price_reduction_pct": number,"unsold_rule": Database["public"]['Enums']["unsold_rule"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_base_price"?: number,"icon_counts_in_squad"?: boolean,"max_rounds"?: number,"max_squad_size"?: number,"min_squad_size"?: number,"purse_per_team"?: number,"reserve_per_slot"?: number,"tournament_id": string,"unsold_base_price_reduction_pct"?: number,"unsold_rule"?: Database["public"]['Enums']["unsold_rule"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_base_price"?: number,"icon_counts_in_squad"?: boolean,"max_rounds"?: number,"max_squad_size"?: number,"min_squad_size"?: number,"purse_per_team"?: number,"reserve_per_slot"?: number,"tournament_id"?: string,"unsold_base_price_reduction_pct"?: number,"unsold_rule"?: Database["public"]['Enums']["unsold_rule"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_settings_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_state": {
                  Row: {
                    "between_rounds": boolean,"created_at": string,"current_lot_id": string | null,"current_round": number,"status": Database["public"]['Enums']["auction_status"],"tournament_id": string,"updated_at": string,"updated_by": string | null,"_require_live": undefined | null
                  }
                  ComputedFields: "_require_live"
                  Insert: {
                    "between_rounds"?: boolean,"created_at"?: string,"current_lot_id"?: string | null,"current_round"?: number,"status"?: Database["public"]['Enums']["auction_status"],"tournament_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "between_rounds"?: boolean,"created_at"?: string,"current_lot_id"?: string | null,"current_round"?: number,"status"?: Database["public"]['Enums']["auction_status"],"tournament_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_state_current_lot_id_fkey"
      columns: ["current_lot_id"]
isOneToOne: false
      referencedRelation: "auction_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_state_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"auction_transactions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": string,"lot_id": string | null,"player_id": string | null,"player_name": string,"player_photo_path": string | null,"price": number,"primary_position": Database["public"]['Enums']["player_position"] | null,"purchase_order": number,"reversal_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"secondary_position": Database["public"]['Enums']["player_position"] | null,"status": Database["public"]['Enums']["txn_status"],"team_id": string,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"lot_id"?: string | null,"player_id"?: string | null,"player_name": string,"player_photo_path"?: string | null,"price": number,"primary_position"?: Database["public"]['Enums']["player_position"] | null,"purchase_order": number,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["txn_status"],"team_id": string,"tournament_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"lot_id"?: string | null,"player_id"?: string | null,"player_name"?: string,"player_photo_path"?: string | null,"price"?: number,"primary_position"?: Database["public"]['Enums']["player_position"] | null,"purchase_order"?: number,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["txn_status"],"team_id"?: string,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auction_transactions_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: true
      referencedRelation: "auction_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_transactions_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_transactions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auction_transactions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "auction_transactions_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"fixtures": {
                  Row: {
                    "away_team_id": string | null,"created_at": string,"home_team_id": string | null,"id": string,"match_number": number,"notes": string | null,"postponed_reason": string | null,"round_number": number | null,"scheduled_at": string | null,"stage": Database["public"]['Enums']["fixture_stage"],"status": Database["public"]['Enums']["fixture_status"],"tournament_id": string,"updated_at": string,"venue": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_team_id"?: string | null,"created_at"?: string,"home_team_id"?: string | null,"id"?: string,"match_number": number,"notes"?: string | null,"postponed_reason"?: string | null,"round_number"?: number | null,"scheduled_at"?: string | null,"stage"?: Database["public"]['Enums']["fixture_stage"],"status"?: Database["public"]['Enums']["fixture_status"],"tournament_id": string,"updated_at"?: string,"venue"?: string | null
                  }
                  Update: {
                    "away_team_id"?: string | null,"created_at"?: string,"home_team_id"?: string | null,"id"?: string,"match_number"?: number,"notes"?: string | null,"postponed_reason"?: string | null,"round_number"?: number | null,"scheduled_at"?: string | null,"stage"?: Database["public"]['Enums']["fixture_stage"],"status"?: Database["public"]['Enums']["fixture_status"],"tournament_id"?: string,"updated_at"?: string,"venue"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixtures_away_team_id_fkey"
      columns: ["away_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixtures_away_team_id_fkey"
      columns: ["away_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "fixtures_home_team_id_fkey"
      columns: ["home_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixtures_home_team_id_fkey"
      columns: ["home_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "fixtures_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"live_scoring_events": {
                  Row: {
                    "client_request_id": string | null,"created_at": string,"created_by": string,"delta": number | null,"detail": NonNullable<Json>,"event_type": Database["public"]['Enums']["scoring_event_type"],"fixture_id": string,"id": number,"is_voided": boolean,"prev": Json | null,"seq": number,"side": Database["public"]['Enums']["team_side"] | null,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_request_id"?: string | null,"created_at"?: string,"created_by": string,"delta"?: number | null,"detail"?: NonNullable<Json>,"event_type": Database["public"]['Enums']["scoring_event_type"],"fixture_id": string,"id"?: never,"is_voided"?: boolean,"prev"?: Json | null,"seq": number,"side"?: Database["public"]['Enums']["team_side"] | null,"tournament_id": string
                  }
                  Update: {
                    "client_request_id"?: string | null,"created_at"?: string,"created_by"?: string,"delta"?: number | null,"detail"?: NonNullable<Json>,"event_type"?: Database["public"]['Enums']["scoring_event_type"],"fixture_id"?: string,"id"?: never,"is_voided"?: boolean,"prev"?: Json | null,"seq"?: number,"side"?: Database["public"]['Enums']["team_side"] | null,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_scoring_events_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_scoring_events_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"match_results": {
                  Row: {
                    "away_score": number,"completed_at": string,"completed_by": string | null,"correction_count": number,"correction_note": string | null,"created_at": string,"fixture_id": string,"home_score": number,"last_corrected_at": string | null,"last_corrected_by": string | null,"note": string | null,"period_scores": NonNullable<Json>,"periods_played": number,"result_type": Database["public"]['Enums']["result_type"],"tournament_id": string,"updated_at": string,"winner_team_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_score": number,"completed_at"?: string,"completed_by"?: string | null,"correction_count"?: number,"correction_note"?: string | null,"created_at"?: string,"fixture_id": string,"home_score": number,"last_corrected_at"?: string | null,"last_corrected_by"?: string | null,"note"?: string | null,"period_scores"?: NonNullable<Json>,"periods_played"?: number,"result_type"?: Database["public"]['Enums']["result_type"],"tournament_id": string,"updated_at"?: string,"winner_team_id"?: string | null
                  }
                  Update: {
                    "away_score"?: number,"completed_at"?: string,"completed_by"?: string | null,"correction_count"?: number,"correction_note"?: string | null,"created_at"?: string,"fixture_id"?: string,"home_score"?: number,"last_corrected_at"?: string | null,"last_corrected_by"?: string | null,"note"?: string | null,"period_scores"?: NonNullable<Json>,"periods_played"?: number,"result_type"?: Database["public"]['Enums']["result_type"],"tournament_id"?: string,"updated_at"?: string,"winner_team_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_results_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: true
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_results_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_results_winner_team_id_fkey"
      columns: ["winner_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_results_winner_team_id_fkey"
      columns: ["winner_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    }
                  ]
                },"match_rules": {
                  Row: {
                    "created_at": string,"hide_shot_clock_under_game_clock": boolean,"overtime_seconds": number,"quarter_seconds": number,"quarters": number,"shot_clock_seconds": number,"shot_clock_short_reset_seconds": number,"team_foul_bonus_threshold": number,"timeouts_first_half": number,"timeouts_per_overtime": number,"timeouts_second_half": number,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hide_shot_clock_under_game_clock"?: boolean,"overtime_seconds"?: number,"quarter_seconds"?: number,"quarters"?: number,"shot_clock_seconds"?: number,"shot_clock_short_reset_seconds"?: number,"team_foul_bonus_threshold"?: number,"timeouts_first_half"?: number,"timeouts_per_overtime"?: number,"timeouts_second_half"?: number,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"hide_shot_clock_under_game_clock"?: boolean,"overtime_seconds"?: number,"quarter_seconds"?: number,"quarters"?: number,"shot_clock_seconds"?: number,"shot_clock_short_reset_seconds"?: number,"team_foul_bonus_threshold"?: number,"timeouts_first_half"?: number,"timeouts_per_overtime"?: number,"timeouts_second_half"?: number,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_rules_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"match_states": {
                  Row: {
                    "away_fouls": number,"away_score": number,"away_timeouts_left": number,"clock_remaining_ms": number,"clock_running": boolean,"clock_updated_at": string,"created_at": string,"ended_at": string | null,"fixture_id": string,"home_fouls": number,"home_score": number,"home_timeouts_left": number,"is_break": boolean,"period": number,"period_scores": NonNullable<Json>,"shot_clock_remaining_ms": number,"shot_clock_running": boolean,"shot_clock_updated_at": string,"started_at": string,"tournament_id": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "away_fouls"?: number,"away_score"?: number,"away_timeouts_left": number,"clock_remaining_ms": number,"clock_running"?: boolean,"clock_updated_at"?: string,"created_at"?: string,"ended_at"?: string | null,"fixture_id": string,"home_fouls"?: number,"home_score"?: number,"home_timeouts_left": number,"is_break"?: boolean,"period"?: number,"period_scores"?: NonNullable<Json>,"shot_clock_remaining_ms": number,"shot_clock_running"?: boolean,"shot_clock_updated_at"?: string,"started_at"?: string,"tournament_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "away_fouls"?: number,"away_score"?: number,"away_timeouts_left"?: number,"clock_remaining_ms"?: number,"clock_running"?: boolean,"clock_updated_at"?: string,"created_at"?: string,"ended_at"?: string | null,"fixture_id"?: string,"home_fouls"?: number,"home_score"?: number,"home_timeouts_left"?: number,"is_break"?: boolean,"period"?: number,"period_scores"?: NonNullable<Json>,"shot_clock_remaining_ms"?: number,"shot_clock_running"?: boolean,"shot_clock_updated_at"?: string,"started_at"?: string,"tournament_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_states_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: true
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_states_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "age": number | null,"base_price": number,"created_at": string,"description": string | null,"full_name": string,"height_cm": number | null,"id": string,"jersey_number": number | null,"photo_path": string | null,"primary_position": Database["public"]['Enums']["player_position"],"secondary_position": Database["public"]['Enums']["player_position"] | null,"status": Database["public"]['Enums']["player_status"],"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age"?: number | null,"base_price": number,"created_at"?: string,"description"?: string | null,"full_name": string,"height_cm"?: number | null,"id"?: string,"jersey_number"?: number | null,"photo_path"?: string | null,"primary_position": Database["public"]['Enums']["player_position"],"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["player_status"],"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "age"?: number | null,"base_price"?: number,"created_at"?: string,"description"?: string | null,"full_name"?: string,"height_cm"?: number | null,"id"?: string,"jersey_number"?: number | null,"photo_path"?: string | null,"primary_position"?: Database["public"]['Enums']["player_position"],"secondary_position"?: Database["public"]['Enums']["player_position"] | null,"status"?: Database["public"]['Enums']["player_status"],"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"playoff_brackets": {
                  Row: {
                    "champion_team_id": string | null,"created_at": string,"format": Database["public"]['Enums']["playoff_format"],"generated_at": string | null,"id": string,"qualifying_teams": number,"seeds": NonNullable<Json>,"status": Database["public"]['Enums']["bracket_status"],"third_place_match": boolean,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "champion_team_id"?: string | null,"created_at"?: string,"format"?: Database["public"]['Enums']["playoff_format"],"generated_at"?: string | null,"id"?: string,"qualifying_teams"?: number,"seeds"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["bracket_status"],"third_place_match"?: boolean,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "champion_team_id"?: string | null,"created_at"?: string,"format"?: Database["public"]['Enums']["playoff_format"],"generated_at"?: string | null,"id"?: string,"qualifying_teams"?: number,"seeds"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["bracket_status"],"third_place_match"?: boolean,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playoff_brackets_champion_team_id_fkey"
      columns: ["champion_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playoff_brackets_champion_team_id_fkey"
      columns: ["champion_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "playoff_brackets_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"playoff_nodes": {
                  Row: {
                    "away_kind": Database["public"]['Enums']["node_source_kind"],"away_ref": string,"bracket_id": string,"code": string,"created_at": string,"fixture_id": string | null,"home_kind": Database["public"]['Enums']["node_source_kind"],"home_ref": string,"id": string,"is_final": boolean,"is_third_place": boolean,"label": string,"position": number,"round_order": number,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "away_kind": Database["public"]['Enums']["node_source_kind"],"away_ref": string,"bracket_id": string,"code": string,"created_at"?: string,"fixture_id"?: string | null,"home_kind": Database["public"]['Enums']["node_source_kind"],"home_ref": string,"id"?: string,"is_final"?: boolean,"is_third_place"?: boolean,"label": string,"position": number,"round_order": number,"tournament_id": string
                  }
                  Update: {
                    "away_kind"?: Database["public"]['Enums']["node_source_kind"],"away_ref"?: string,"bracket_id"?: string,"code"?: string,"created_at"?: string,"fixture_id"?: string | null,"home_kind"?: Database["public"]['Enums']["node_source_kind"],"home_ref"?: string,"id"?: string,"is_final"?: boolean,"is_third_place"?: boolean,"label"?: string,"position"?: number,"round_order"?: number,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playoff_nodes_bracket_id_fkey"
      columns: ["bracket_id"]
isOneToOne: false
      referencedRelation: "playoff_brackets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playoff_nodes_fixture_id_fkey"
      columns: ["fixture_id"]
isOneToOne: true
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playoff_nodes_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"playoff_settings": {
                  Row: {
                    "created_at": string,"format": Database["public"]['Enums']["playoff_format"],"qualifying_teams": number,"third_place_match": boolean,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"format"?: Database["public"]['Enums']["playoff_format"],"qualifying_teams"?: number,"third_place_match"?: boolean,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"format"?: Database["public"]['Enums']["playoff_format"],"qualifying_teams"?: number,"third_place_match"?: boolean,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playoff_settings_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"points_settings": {
                  Row: {
                    "allow_draws": boolean,"created_at": string,"draw_points": number,"forfeit_score": number,"loss_points": number,"tiebreaker_order": (Database["public"]['Enums']["tiebreaker"])[],"tournament_id": string,"updated_at": string,"win_points": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_draws"?: boolean,"created_at"?: string,"draw_points"?: number,"forfeit_score"?: number,"loss_points"?: number,"tiebreaker_order"?: (Database["public"]['Enums']["tiebreaker"])[],"tournament_id": string,"updated_at"?: string,"win_points"?: number
                  }
                  Update: {
                    "allow_draws"?: boolean,"created_at"?: string,"draw_points"?: number,"forfeit_score"?: number,"loss_points"?: number,"tiebreaker_order"?: (Database["public"]['Enums']["tiebreaker"])[],"tournament_id"?: string,"updated_at"?: string,"win_points"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "points_settings_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"standings": {
                  Row: {
                    "created_at": string,"draws": number,"league_points": number,"losses": number,"played": number,"point_diff": number | null,"points_against": number,"points_for": number,"rank": number,"remaining": number,"team_id": string,"tiebreak_note": string | null,"tournament_id": string,"updated_at": string,"wins": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"draws"?: number,"league_points"?: number,"losses"?: number,"played"?: number,"point_diff"?: never,"points_against"?: number,"points_for"?: number,"rank": number,"remaining"?: number,"team_id": string,"tiebreak_note"?: string | null,"tournament_id": string,"updated_at"?: string,"wins"?: number
                  }
                  Update: {
                    "created_at"?: string,"draws"?: number,"league_points"?: number,"losses"?: number,"played"?: number,"point_diff"?: never,"points_against"?: number,"points_for"?: number,"rank"?: number,"remaining"?: number,"team_id"?: string,"tiebreak_note"?: string | null,"tournament_id"?: string,"updated_at"?: string,"wins"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "standings_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "standings_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "standings_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"team_owners": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"photo_path": string | null,"team_id": string,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id"?: string,"photo_path"?: string | null,"team_id": string,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"photo_path"?: string | null,"team_id"?: string,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_owners_team_id_fkey"
      columns: ["team_id"]
isOneToOne: true
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_owners_team_id_fkey"
      columns: ["team_id"]
isOneToOne: true
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "team_owners_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"team_players": {
                  Row: {
                    "acquired_at": string,"created_at": string,"icon_slot": number | null,"id": string,"player_id": string,"price": number,"purchase_order": number | null,"source": Database["public"]['Enums']["roster_source"],"team_id": string,"tournament_id": string,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_at"?: string,"created_at"?: string,"icon_slot"?: number | null,"id"?: string,"player_id": string,"price"?: number,"purchase_order"?: number | null,"source": Database["public"]['Enums']["roster_source"],"team_id": string,"tournament_id": string,"transaction_id"?: string | null
                  }
                  Update: {
                    "acquired_at"?: string,"created_at"?: string,"icon_slot"?: number | null,"id"?: string,"player_id"?: string,"price"?: number,"purchase_order"?: number | null,"source"?: Database["public"]['Enums']["roster_source"],"team_id"?: string,"tournament_id"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_players_player_id_fkey"
      columns: ["player_id"]
isOneToOne: true
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_players_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_players_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "team_players_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_players_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "auction_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"id": string,"logo_path": string | null,"manual_tiebreak_rank": number | null,"name": string,"primary_color": string,"purse_remaining": number | null,"purse_spent": number,"purse_total": number,"secondary_color": string,"short_name": string,"sort_order": number,"tournament_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"logo_path"?: string | null,"manual_tiebreak_rank"?: number | null,"name": string,"primary_color"?: string,"purse_remaining"?: never,"purse_spent"?: number,"purse_total"?: number,"secondary_color"?: string,"short_name": string,"sort_order"?: number,"tournament_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"logo_path"?: string | null,"manual_tiebreak_rank"?: number | null,"name"?: string,"primary_color"?: string,"purse_remaining"?: never,"purse_spent"?: number,"purse_total"?: number,"secondary_color"?: string,"short_name"?: string,"sort_order"?: number,"tournament_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"tournaments": {
                  Row: {
                    "banner_path": string | null,"champion_team_id": string | null,"created_at": string,"currency_symbol": string,"featured_fixture_id": string | null,"id": string,"is_active": boolean,"logo_path": string | null,"name": string,"phase": Database["public"]['Enums']["tournament_phase"],"slug": string,"tagline": string | null,"timezone": string,"updated_at": string,"venue_default": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_path"?: string | null,"champion_team_id"?: string | null,"created_at"?: string,"currency_symbol"?: string,"featured_fixture_id"?: string | null,"id"?: string,"is_active"?: boolean,"logo_path"?: string | null,"name": string,"phase"?: Database["public"]['Enums']["tournament_phase"],"slug": string,"tagline"?: string | null,"timezone"?: string,"updated_at"?: string,"venue_default"?: string | null
                  }
                  Update: {
                    "banner_path"?: string | null,"champion_team_id"?: string | null,"created_at"?: string,"currency_symbol"?: string,"featured_fixture_id"?: string | null,"id"?: string,"is_active"?: boolean,"logo_path"?: string | null,"name"?: string,"phase"?: Database["public"]['Enums']["tournament_phase"],"slug"?: string,"tagline"?: string | null,"timezone"?: string,"updated_at"?: string,"venue_default"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournaments_champion_fk"
      columns: ["champion_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournaments_champion_fk"
      columns: ["champion_team_id"]
isOneToOne: false
      referencedRelation: "v_team_finance"
      referencedColumns: ["team_id"]
    },{
      foreignKeyName: "tournaments_featured_fixture_fk"
      columns: ["featured_fixture_id"]
isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_team_finance": {
                  Row: {
                    "max_bid": number | null,"max_squad_size": number,"min_squad_size": number,"purchased_count": number | null,"purse_remaining": number | null,"purse_spent": number,"purse_total": number,"slots_left": number | null,"squad_count": number | null,"team_id": string,"tournament_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "teams_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_auction_event":
{ Args: { "p_amount": number,"p_lot": string,"p_message": string,"p_payload"?: Json,"p_player": string,"p_team": string,"p_tid": string,"p_type": Database["public"]['Enums']["auction_event_type"] }; Returns: {
              "amount": number | null,
"created_at": string,
"created_by": string | null,
"event_type": Database["public"]['Enums']["auction_event_type"],
"id": string,
"lot_id": string | null,
"message": string,
"payload": NonNullable<Json>,
"player_id": string | null,
"team_id": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "auction_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"_auction_result":
{ Args: { "p_event": Omit<Database["public"]['Tables']["auction_events"]['Row'], Database["public"]['Tables']["auction_events"]['ComputedFields']>,"p_extra"?: Json,"p_lot": string,"p_team": string,"p_tid": string }; Returns: Json
                           },
"_auction_warnings":
{ Args: { "p_tid": string }; Returns: Json
                           },
"_check_scores":
{ Args: { "p_away": number,"p_home": number }; Returns: undefined
                           },
"_decayed_price":
{ Args: { "p_pct": number,"p_price": number }; Returns: number
                           },
"_do_reverse":
{ Args: { "p_reason": string,"p_return_status": Database["public"]['Enums']["player_status"],"p_tx": Omit<Database["public"]['Tables']["auction_transactions"]['Row'], Database["public"]['Tables']["auction_transactions"]['ComputedFields']> }; Returns: {
              "amount": number | null,
"created_at": string,
"created_by": string | null,
"event_type": Database["public"]['Enums']["auction_event_type"],
"id": string,
"lot_id": string | null,
"message": string,
"payload": NonNullable<Json>,
"player_id": string | null,
"team_id": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "auction_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"_eff_ms":
{ Args: { "p_at": string,"p_ms": number,"p_running": boolean }; Returns: number
                           },
"_fixture_warnings":
{ Args: { "p_fixture_id": string }; Returns: Json
                           },
"_fmt_money":
{ Args: { "p_amount": number,"p_tid": string }; Returns: string
                           },
"_is_on_live_lot":
{ Args: { "p_player_id": string }; Returns: boolean
                           },
"_lcg_next":
{ Args: { "p_state": number }; Returns: number
                           },
"_league_complete":
{ Args: { "p_tid": string }; Returns: boolean
                           },
"_lock_auction":
{ Args: { "p_tid": string }; Returns: {
              "between_rounds": boolean,
"created_at": string,
"current_lot_id": string | null,
"current_round": number,
"status": Database["public"]['Enums']["auction_status"],
"tournament_id": string,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "auction_state"
        isOneToOne: true
        isSetofReturn: false
      } },
"_lock_live_lot":
{ Args: { "p_lot_id": string,"p_tid": string }; Returns: {
              "base_price": number,
"bid_count": number,
"closed_at": string | null,
"closed_by": string | null,
"created_at": string,
"current_bid": number | null,
"id": string,
"leading_team_id": string | null,
"lot_number": number,
"opened_at": string,
"player_id": string | null,
"player_name": string,
"player_photo_path": string | null,
"primary_position": Database["public"]['Enums']["player_position"] | null,
"round_number": number,
"secondary_position": Database["public"]['Enums']["player_position"] | null,
"status": Database["public"]['Enums']["lot_status"],
"tournament_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "auction_lots"
        isOneToOne: true
        isSetofReturn: false
      } },
"_lock_match":
{ Args: { "p_fixture_id": string }; Returns: {
              "away_fouls": number,
"away_score": number,
"away_timeouts_left": number,
"clock_remaining_ms": number,
"clock_running": boolean,
"clock_updated_at": string,
"created_at": string,
"ended_at": string | null,
"fixture_id": string,
"home_fouls": number,
"home_score": number,
"home_timeouts_left": number,
"is_break": boolean,
"period": number,
"period_scores": NonNullable<Json>,
"shot_clock_remaining_ms": number,
"shot_clock_running": boolean,
"shot_clock_updated_at": string,
"started_at": string,
"tournament_id": string,
"updated_at": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "match_states"
        isOneToOne: true
        isSetofReturn: false
      } },
"_match_payload":
{ Args: { "p_extra"?: Json,"p_fixture_id": string }; Returns: Json
                           },
"_node_side_team":
{ Args: { "p_bracket": Omit<Database["public"]['Tables']["playoff_brackets"]['Row'], Database["public"]['Tables']["playoff_brackets"]['ComputedFields']>,"p_kind": Database["public"]['Enums']["node_source_kind"],"p_ref": string }; Returns: string
                           },
"_period_label":
{ Args: { "p_period": number,"p_quarters": number }; Returns: string
                           },
"_period_len_ms":
{ Args: { "p_period": number,"r": Omit<Database["public"]['Tables']["match_rules"]['Row'], Database["public"]['Tables']["match_rules"]['ComputedFields']> }; Returns: number
                           },
"_playoff_lock_check":
{ Args: { "p_fixture_id": string,"p_new_winner": string }; Returns: undefined
                           },
"_playoff_nodes_for":
{ Args: { "p_format": Database["public"]['Enums']["playoff_format"],"p_third": boolean }; Returns: {
              "away_kind": Database["public"]['Enums']["node_source_kind"],"away_ref": string,"code": string,"home_kind": Database["public"]['Enums']["node_source_kind"],"home_ref": string,"is_final": boolean,"is_third_place": boolean,"label": string,"pos": number,"round_order": number
            }[]
                           },
"_playoffs_started":
{ Args: { "p_tid": string }; Returns: boolean
                           },
"_reenter_players":
{ Args: { "p_ids": (string)[],"p_tid": string }; Returns: number
                           },
"_require_live":
{ Args: { "st": Omit<Database["public"]['Tables']["auction_state"]['Row'], Database["public"]['Tables']["auction_state"]['ComputedFields']> }; Returns: undefined
                           },
"_require_tournament":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_rules":
{ Args: { "p_tid": string }; Returns: {
              "created_at": string,
"hide_shot_clock_under_game_clock": boolean,
"overtime_seconds": number,
"quarter_seconds": number,
"quarters": number,
"shot_clock_seconds": number,
"shot_clock_short_reset_seconds": number,
"team_foul_bonus_threshold": number,
"timeouts_first_half": number,
"timeouts_per_overtime": number,
"timeouts_second_half": number,
"tournament_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "match_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"_scoring_dup":
{ Args: { "p_crid": string }; Returns: boolean
                           },
"_scoring_event":
{ Args: { "p_crid": string,"p_delta": number,"p_detail": Json,"p_fixture_id": string,"p_prev": Json,"p_side": Database["public"]['Enums']["team_side"],"p_type": Database["public"]['Enums']["scoring_event_type"] }; Returns: number
                           },
"_side_name":
{ Args: { "p_fixture_id": string,"p_side": Database["public"]['Enums']["team_side"] }; Returns: string
                           },
"_st_rank_group":
{ Args: { "p_group": (string)[],"p_k": number,"p_matches": Json,"p_settings": Json,"p_stats": Json }; Returns: Json
                           },
"_st_reason_label":
{ Args: { "p_other": string,"p_reason": string }; Returns: string
                           },
"_timeout_pool":
{ Args: { "p_period": number,"r": Omit<Database["public"]['Tables']["match_rules"]['Row'], Database["public"]['Tables']["match_rules"]['ComputedFields']> }; Returns: number
                           },
"abandon_match":
{ Args: { "p_fixture_id": string,"p_reason": string }; Returns: Json
                           },
"active_tournament_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"add_foul":
{ Args: { "p_client_request_id"?: string,"p_delta": number,"p_fixture_id": string,"p_side": Database["public"]['Enums']["team_side"] }; Returns: Json
                           },
"auction_warnings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"auto_schedule_fixtures":
{ Args: { "p_courts"?: (string)[],"p_first_start": string,"p_game_days": (number)[],"p_scope"?: string,"p_slot_minutes"?: number,"p_slots_per_day"?: number,"p_start_date": string }; Returns: Json
                           },
"bid_step":
{ Args: { "p_bid": number,"p_tid": string }; Returns: number
                           },
"bulk_set_base_price":
{ Args: { "p_amount": number }; Returns: Json
                           },
"cancel_lot":
{ Args: { "p_lot_id": string }; Returns: Json
                           },
"change_period":
{ Args: { "p_action": string,"p_client_request_id"?: string,"p_fixture_id": string }; Returns: Json
                           },
"clean_text":
{ Args: { "p": string }; Returns: string
                           },
"clock_control":
{ Args: { "p_action": string,"p_client_request_id"?: string,"p_fixture_id": string,"p_value_ms"?: number }; Returns: Json
                           },
"complete_auction":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"complete_match":
{ Args: { "p_away_score": number,"p_fixture_id": string,"p_home_score": number,"p_note"?: string }; Returns: Json
                           },
"compute_standings":
{ Args: { "p_matches": Json,"p_settings": Json,"p_teams": Json }; Returns: Json
                           },
"correct_match_result":
{ Args: { "p_away_score": number,"p_fixture_id": string,"p_home_score": number,"p_note": string }; Returns: Json
                           },
"correct_score":
{ Args: { "p_away": number,"p_client_request_id"?: string,"p_fixture_id": string,"p_home": number,"p_reason": string }; Returns: Json
                           },
"create_fixture":
{ Args: { "p_allow_duplicate"?: boolean,"p_away": string,"p_home": string,"p_round"?: number,"p_scheduled_at"?: string,"p_venue"?: string }; Returns: Json
                           },
"delete_fixture":
{ Args: { "p_fixture_id": string }; Returns: Json
                           },
"delete_player":
{ Args: { "p_player_id": string }; Returns: Json
                           },
"delete_team":
{ Args: { "p_team_id": string }; Returns: Json
                           },
"end_auction_round":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ensure_tournament_children":
{ Args: { "p_tournament_id": string }; Returns: undefined
                           },
"generate_league_fixtures":
{ Args: { "p_format": string,"p_replace"?: boolean,"p_shuffle_seed"?: number }; Returns: Json
                           },
"generate_playoff_bracket":
{ Args: { "p_replace"?: boolean }; Returns: Json
                           },
"import_players":
{ Args: { "p_rows": Json }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_sold":
{ Args: { "p_lot_id": string }; Returns: Json
                           },
"mark_unsold":
{ Args: { "p_discard_bids"?: boolean,"p_lot_id": string }; Returns: Json
                           },
"open_lot":
{ Args: { "p_player_id": string }; Returns: Json
                           },
"open_random_lot":
{ Args: { "p_position"?: Database["public"]['Enums']["player_position"] }; Returns: Json
                           },
"pause_auction":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"place_bid":
{ Args: { "p_amount": number,"p_client_request_id": string,"p_expected_current_bid": number,"p_lot_id": string,"p_team_id": string }; Returns: Json
                           },
"playoff_template":
{ Args: { "p_format": Database["public"]['Enums']["playoff_format"],"p_third": boolean }; Returns: {
              "away_kind": string,"away_ref": string,"code": string,"home_kind": string,"home_ref": string,"is_final": boolean,"is_third_place": boolean,"label": string,"pos": number,"round_order": number
            }[]
                           },
"postpone_fixture":
{ Args: { "p_fixture_id": string,"p_reason": string }; Returns: Json
                           },
"raise_err":
{ Args: { "p_code": string,"p_detail"?: Json }; Returns: undefined
                           },
"reassign_player":
{ Args: { "p_player_id": string,"p_price": number,"p_reason": string,"p_to_team_id": string }; Returns: Json
                           },
"rebuild_standings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"recalculate_standings":
{ Args: { "p_tid": string }; Returns: undefined
                           },
"record_forfeit":
{ Args: { "p_fixture_id": string,"p_reason": string,"p_winner_team_id": string }; Returns: Json
                           },
"record_timeout":
{ Args: { "p_client_request_id"?: string,"p_fixture_id": string,"p_restore"?: boolean,"p_side": Database["public"]['Enums']["team_side"] }; Returns: Json
                           },
"refresh_bracket_seeds":
{ Args: { "p_tid": string }; Returns: undefined
                           },
"refresh_seeds":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"renumber_fixtures":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reopen_auction":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reopen_match":
{ Args: { "p_fixture_id": string,"p_reason": string }; Returns: Json
                           },
"require_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"reschedule_fixture":
{ Args: { "p_fixture_id": string,"p_scheduled_at": string,"p_venue"?: string }; Returns: Json
                           },
"resolve_bracket":
{ Args: { "p_bracket_id": string }; Returns: undefined
                           },
"resume_auction":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reverse_sale":
{ Args: { "p_reason": string,"p_return_status"?: Database["public"]['Enums']["player_status"],"p_transaction_id": string }; Returns: Json
                           },
"round_robin_pairs":
{ Args: { "p_double": boolean,"p_seed"?: number,"p_teams": (string)[] }; Returns: {
              "away": string,"home": string,"pair_index": number,"round_number": number
            }[]
                           },
"save_auction_settings":
{ Args: { "p_settings": Json,"p_tiers": Json }; Returns: Json
                           },
"save_match_rules":
{ Args: { "p_rules": Json }; Returns: Json
                           },
"save_playoff_settings":
{ Args: { "p_settings": Json }; Returns: Json
                           },
"save_points_settings":
{ Args: { "p_settings": Json }; Returns: Json
                           },
"score_points":
{ Args: { "p_client_request_id"?: string,"p_fixture_id": string,"p_points": number,"p_side": Database["public"]['Enums']["team_side"] }; Returns: Json
                           },
"server_time":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"set_featured_fixture":
{ Args: { "p_fixture_id": string }; Returns: Json
                           },
"set_icon_player":
{ Args: { "p_player_id": string,"p_slot": number,"p_team_id": string }; Returns: Json
                           },
"set_player_status":
{ Args: { "p_player_id": string,"p_status": Database["public"]['Enums']["player_status"] }; Returns: Json
                           },
"set_team_purse":
{ Args: { "p_amount": number,"p_team_id": string }; Returns: Json
                           },
"start_auction_round":
{ Args: { "p_force"?: boolean }; Returns: Json
                           },
"start_match":
{ Args: { "p_client_request_id"?: string,"p_fixture_id": string }; Returns: Json
                           },
"start_next_round":
{ Args: { "p_player_ids": (string)[] }; Returns: Json
                           },
"team_max_bid":
{ Args: { "p_team_id": string }; Returns: number
                           },
"team_squad_count":
{ Args: { "p_team_id": string }; Returns: number
                           },
"undo_last_bid":
{ Args: { "p_lot_id": string }; Returns: Json
                           },
"undo_last_event":
{ Args: { "p_expected_seq"?: number,"p_fixture_id": string }; Returns: Json
                           },
"update_fixture":
{ Args: { "p_away"?: string,"p_fixture_id": string,"p_home"?: string,"p_notes": string,"p_scheduled_at": string,"p_venue": string }; Returns: Json
                           }
          }
          Enums: {
            "auction_event_type": "round_started"|"round_ended"|"lot_opened"|"bid_placed"|"bid_undone"|"sold"|"unsold"|"lot_cancelled"|"sale_reversed"|"player_reassigned"|"auction_paused"|"auction_resumed"|"auction_completed","auction_status": "not_started"|"live"|"paused"|"completed","bracket_status": "not_generated"|"generated"|"in_progress"|"completed","fixture_stage": "league"|"playoff","fixture_status": "upcoming"|"live"|"completed"|"postponed","lot_status": "live"|"sold"|"unsold"|"cancelled","node_source_kind": "seed"|"winner_of"|"loser_of","player_position": "PG"|"SG"|"SF"|"PF"|"C","player_status": "available"|"sold"|"unsold"|"icon","playoff_format": "semis_final"|"direct_final"|"single_elim_6"|"single_elim_8"|"ipl_page","result_type": "normal"|"forfeit","roster_source": "icon"|"auction"|"manual","scoring_event_type": "match_started"|"points"|"foul"|"timeout"|"period_change"|"clock_start"|"clock_pause"|"clock_set"|"shot_clock_set"|"score_correction"|"match_ended","team_side": "home"|"away","tiebreaker": "head_to_head"|"point_difference"|"points_for"|"points_against_lowest"|"wins","tournament_phase": "setup"|"auction"|"league"|"playoffs"|"completed","txn_status": "active"|"reversed","unsold_rule": "manual_reenter"|"auto_reenter"|"no_reenter"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "auction_event_type": ["round_started", "round_ended", "lot_opened", "bid_placed", "bid_undone", "sold", "unsold", "lot_cancelled", "sale_reversed", "player_reassigned", "auction_paused", "auction_resumed", "auction_completed"],"auction_status": ["not_started", "live", "paused", "completed"],"bracket_status": ["not_generated", "generated", "in_progress", "completed"],"fixture_stage": ["league", "playoff"],"fixture_status": ["upcoming", "live", "completed", "postponed"],"lot_status": ["live", "sold", "unsold", "cancelled"],"node_source_kind": ["seed", "winner_of", "loser_of"],"player_position": ["PG", "SG", "SF", "PF", "C"],"player_status": ["available", "sold", "unsold", "icon"],"playoff_format": ["semis_final", "direct_final", "single_elim_6", "single_elim_8", "ipl_page"],"result_type": ["normal", "forfeit"],"roster_source": ["icon", "auction", "manual"],"scoring_event_type": ["match_started", "points", "foul", "timeout", "period_change", "clock_start", "clock_pause", "clock_set", "shot_clock_set", "score_correction", "match_ended"],"team_side": ["home", "away"],"tiebreaker": ["head_to_head", "point_difference", "points_for", "points_against_lowest", "wins"],"tournament_phase": ["setup", "auction", "league", "playoffs", "completed"],"txn_status": ["active", "reversed"],"unsold_rule": ["manual_reenter", "auto_reenter", "no_reenter"]
          }
        }
} as const

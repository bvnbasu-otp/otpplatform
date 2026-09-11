export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      approval_instances: {
        Row: {
          id: string
          policy_id: string
          requested_at: string
          resolved_at: string | null
          rfq_id: string
          status: Database["public"]["Enums"]["approval_instance_status"]
        }
        Insert: {
          id?: string
          policy_id: string
          requested_at?: string
          resolved_at?: string | null
          rfq_id: string
          status?: Database["public"]["Enums"]["approval_instance_status"]
        }
        Update: {
          id?: string
          policy_id?: string
          requested_at?: string
          resolved_at?: string | null
          rfq_id?: string
          status?: Database["public"]["Enums"]["approval_instance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_instances_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "approval_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "approval_instances_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "approval_instances_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "approval_instances_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      approval_policies: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          organization_id: string
          policy_type: Database["public"]["Enums"]["approval_policy_type"]
          threshold: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          organization_id: string
          policy_type: Database["public"]["Enums"]["approval_policy_type"]
          threshold?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          organization_id?: string
          policy_type?: Database["public"]["Enums"]["approval_policy_type"]
          threshold?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          content_type: string
          created_at: string
          display_name: string
          duration_seconds: number | null
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          original_filename: string
          quote_id: string | null
          requirement_id: string | null
          rfq_id: string | null
          scope: Database["public"]["Enums"]["attachment_scope"]
          size_bytes: number
          storage_path: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          content_type: string
          created_at?: string
          display_name?: string
          duration_seconds?: number | null
          id?: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          original_filename: string
          quote_id?: string | null
          requirement_id?: string | null
          rfq_id?: string | null
          scope: Database["public"]["Enums"]["attachment_scope"]
          size_bytes?: number
          storage_path: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          display_name?: string
          duration_seconds?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
          original_filename?: string
          quote_id?: string | null
          requirement_id?: string | null
          rfq_id?: string | null
          scope?: Database["public"]["Enums"]["attachment_scope"]
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          correlation_id: string | null
          demo_run_id: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          occurred_at: string
          organization_id: string | null
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          correlation_id?: string | null
          demo_run_id?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          correlation_id?: string | null
          demo_run_id?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          awarded_at: string
          awarded_by: string
          id: string
          justification: Json
          quote_id: string
          revealed_at: string | null
          rfq_id: string
          status: Database["public"]["Enums"]["award_status"]
          vote_snapshot: Json
          votes_locked_at: string | null
        }
        Insert: {
          awarded_at?: string
          awarded_by: string
          id?: string
          justification: Json
          quote_id: string
          revealed_at?: string | null
          rfq_id: string
          status?: Database["public"]["Enums"]["award_status"]
          vote_snapshot?: Json
          votes_locked_at?: string | null
        }
        Update: {
          awarded_at?: string
          awarded_by?: string
          id?: string
          justification?: Json
          quote_id?: string
          revealed_at?: string | null
          rfq_id?: string
          status?: Database["public"]["Enums"]["award_status"]
          vote_snapshot?: Json
          votes_locked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "awards_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      buyer_type_config: {
        Row: {
          default_committee_size: number
          description: string | null
          label: string
          org_type: Database["public"]["Enums"]["org_type"]
          sort_order: number
          updated_at: string
          voting_power: number
        }
        Insert: {
          default_committee_size?: number
          description?: string | null
          label: string
          org_type: Database["public"]["Enums"]["org_type"]
          sort_order?: number
          updated_at?: string
          voting_power: number
        }
        Update: {
          default_committee_size?: number
          description?: string | null
          label?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          sort_order?: number
          updated_at?: string
          voting_power?: number
        }
        Relationships: []
      }
      capabilities: {
        Row: {
          capacity_attribute_code: string | null
          capacity_unit: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity_attribute_code?: string | null
          capacity_unit?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity_attribute_code?: string | null
          capacity_unit?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      category_attribute_definitions: {
        Row: {
          applies_to_modes: Database["public"]["Enums"]["requirement_mode"][]
          category_id: string | null
          code: string
          created_at: string
          data_type: Database["public"]["Enums"]["attribute_data_type"]
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          match_patterns: string[]
          options: Json
          placeholder: string | null
          sort_order: number
          subcategory_id: string | null
          unit: string | null
          updated_at: string
          validation: Json
        }
        Insert: {
          applies_to_modes?: Database["public"]["Enums"]["requirement_mode"][]
          category_id?: string | null
          code: string
          created_at?: string
          data_type: Database["public"]["Enums"]["attribute_data_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          match_patterns?: string[]
          options?: Json
          placeholder?: string | null
          sort_order?: number
          subcategory_id?: string | null
          unit?: string | null
          updated_at?: string
          validation?: Json
        }
        Update: {
          applies_to_modes?: Database["public"]["Enums"]["requirement_mode"][]
          category_id?: string | null
          code?: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["attribute_data_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          match_patterns?: string[]
          options?: Json
          placeholder?: string | null
          sort_order?: number
          subcategory_id?: string | null
          unit?: string | null
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "category_attribute_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "requirement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attribute_definitions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "requirement_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_assignments: {
        Row: {
          assigned_at: string
          id: string
          profile_id: string
          rfq_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          profile_id: string
          rfq_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          profile_id?: string
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_assignments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_assignments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_assignments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_assignments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_assignments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      committee_votes: {
        Row: {
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          cast_at: string
          choice: Database["public"]["Enums"]["vote_choice"]
          comment: string | null
          id: string
          locked_at: string | null
          profile_id: string
          recommended_quote_id: string | null
          rfq_id: string
          voting_power: number | null
        }
        Insert: {
          buyer_type?: Database["public"]["Enums"]["org_type"] | null
          cast_at?: string
          choice: Database["public"]["Enums"]["vote_choice"]
          comment?: string | null
          id?: string
          locked_at?: string | null
          profile_id: string
          recommended_quote_id?: string | null
          rfq_id: string
          voting_power?: number | null
        }
        Update: {
          buyer_type?: Database["public"]["Enums"]["org_type"] | null
          cast_at?: string
          choice?: Database["public"]["Enums"]["vote_choice"]
          comment?: string | null
          id?: string
          locked_at?: string | null
          profile_id?: string
          recommended_quote_id?: string | null
          rfq_id?: string
          voting_power?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      conflict_of_interest_declarations: {
        Row: {
          declared_at: string
          description: string | null
          id: string
          profile_id: string
          rfq_id: string
          status: Database["public"]["Enums"]["coi_status"]
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          declared_at?: string
          description?: string | null
          id?: string
          profile_id: string
          rfq_id: string
          status: Database["public"]["Enums"]["coi_status"]
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          declared_at?: string
          description?: string | null
          id?: string
          profile_id?: string
          rfq_id?: string
          status?: Database["public"]["Enums"]["coi_status"]
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conflict_of_interest_declarations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "conflict_of_interest_declarations_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_accounts: {
        Row: {
          created_at: string
          description: string | null
          email: string
          id: string
          is_active: boolean
          label: string
          organization_id: string | null
          persona: string
          profile_id: string | null
          scenario_code: string | null
          sort_order: number
          supplier_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email: string
          id?: string
          is_active?: boolean
          label: string
          organization_id?: string | null
          persona: string
          profile_id?: string | null
          scenario_code?: string | null
          sort_order?: number
          supplier_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string | null
          persona?: string
          profile_id?: string | null
          scenario_code?: string | null
          sort_order?: number
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_accounts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_price_anchors: {
        Row: {
          base_amount: number
          code: string | null
          id: string
          per_unit: boolean
          scope: string
          spread: number
          unit_hint: string | null
        }
        Insert: {
          base_amount: number
          code?: string | null
          id?: string
          per_unit?: boolean
          scope: string
          spread?: number
          unit_hint?: string | null
        }
        Update: {
          base_amount?: number
          code?: string | null
          id?: string
          per_unit?: boolean
          scope?: string
          spread?: number
          unit_hint?: string | null
        }
        Relationships: []
      }
      demo_scenarios: {
        Row: {
          buyer_type: Database["public"]["Enums"]["org_type"]
          code: string
          created_at: string
          invite_limit: number
          narrative: string
          organization_id: string | null
          requirement_id: string | null
          rfq_id: string | null
          sort_order: number
          stage_label: string
          target_stage: string
          title: string
        }
        Insert: {
          buyer_type: Database["public"]["Enums"]["org_type"]
          code: string
          created_at?: string
          invite_limit?: number
          narrative: string
          organization_id?: string | null
          requirement_id?: string | null
          rfq_id?: string | null
          sort_order?: number
          stage_label: string
          target_stage?: string
          title: string
        }
        Update: {
          buyer_type?: Database["public"]["Enums"]["org_type"]
          code?: string
          created_at?: string
          invite_limit?: number
          narrative?: string
          organization_id?: string | null
          requirement_id?: string | null
          rfq_id?: string | null
          sort_order?: number
          stage_label?: string
          target_stage?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scenarios_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      demo_settings: {
        Row: {
          current_run_id: string
          demo_mode_enabled: boolean
          demo_seed: string
          id: boolean
          last_reset_at: string | null
          updated_at: string
        }
        Insert: {
          current_run_id?: string
          demo_mode_enabled?: boolean
          demo_seed?: string
          id?: boolean
          last_reset_at?: string | null
          updated_at?: string
        }
        Update: {
          current_run_id?: string
          demo_mode_enabled?: boolean
          demo_seed?: string
          id?: boolean
          last_reset_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_criteria: {
        Row: {
          code: string
          created_at: string
          description: string | null
          direction: Database["public"]["Enums"]["criterion_direction"]
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          value_source: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          direction: Database["public"]["Enums"]["criterion_direction"]
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          value_source: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["criterion_direction"]
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          value_source?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string
          currency: string
          document_url: string | null
          id: string
          invoice_number: string
          status: Database["public"]["Enums"]["invoice_status"]
          submitted_at: string
          supplier_id: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string
          currency?: string
          document_url?: string | null
          id?: string
          invoice_number: string
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_at?: string
          supplier_id: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          currency?: string
          document_url?: string | null
          id?: string
          invoice_number?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_at?: string
          supplier_id?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_baselines: {
        Row: {
          category_key: string
          historical_price_max: number | null
          historical_price_min: number | null
          id: string
          location_city: string | null
          notes: string | null
          sample_size: number
          supplier_performance_avg: number | null
          typical_delivery_days_max: number | null
          typical_delivery_days_min: number | null
          typical_warranty_months_max: number | null
          typical_warranty_months_min: number | null
          updated_at: string
        }
        Insert: {
          category_key: string
          historical_price_max?: number | null
          historical_price_min?: number | null
          id?: string
          location_city?: string | null
          notes?: string | null
          sample_size?: number
          supplier_performance_avg?: number | null
          typical_delivery_days_max?: number | null
          typical_delivery_days_min?: number | null
          typical_warranty_months_max?: number | null
          typical_warranty_months_min?: number | null
          updated_at?: string
        }
        Update: {
          category_key?: string
          historical_price_max?: number | null
          historical_price_min?: number | null
          id?: string
          location_city?: string | null
          notes?: string | null
          sample_size?: number
          supplier_performance_avg?: number | null
          typical_delivery_days_max?: number | null
          typical_delivery_days_min?: number | null
          typical_warranty_months_max?: number | null
          typical_warranty_months_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      messaging_events: {
        Row: {
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at: string
          demo_run_id: string | null
          direction: Database["public"]["Enums"]["messaging_direction"]
          error_code: string | null
          external_message_id: string | null
          id: string
          is_demo: boolean
          normalized_message: string | null
          phone_e164: string | null
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["messaging_processing_status"]
          provider: Database["public"]["Enums"]["messaging_provider"]
          quote_id: string | null
          raw_payload: Json
          rfq_id: string | null
          supplier_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          demo_run_id?: string | null
          direction: Database["public"]["Enums"]["messaging_direction"]
          error_code?: string | null
          external_message_id?: string | null
          id?: string
          is_demo?: boolean
          normalized_message?: string | null
          phone_e164?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["messaging_processing_status"]
          provider: Database["public"]["Enums"]["messaging_provider"]
          quote_id?: string | null
          raw_payload?: Json
          rfq_id?: string | null
          supplier_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          demo_run_id?: string | null
          direction?: Database["public"]["Enums"]["messaging_direction"]
          error_code?: string | null
          external_message_id?: string | null
          id?: string
          is_demo?: boolean
          normalized_message?: string | null
          phone_e164?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["messaging_processing_status"]
          provider?: Database["public"]["Enums"]["messaging_provider"]
          quote_id?: string | null
          raw_payload?: Json
          rfq_id?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "messaging_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "messaging_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "messaging_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "messaging_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "messaging_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "messaging_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          event_type: string
          id: string
          payload: Json
          profile_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          profile_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          profile_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["org_member_role"]
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["org_member_role"]
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          tax_registration: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          tax_registration?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          tax_registration?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway_status: Database["public"]["Enums"]["payment_gateway_status"]
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          recorded_at: string
          recorded_by: string
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          gateway_status?: Database["public"]["Enums"]["payment_gateway_status"]
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          recorded_at?: string
          recorded_by: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway_status?: Database["public"]["Enums"]["payment_gateway_status"]
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          recorded_at?: string
          recorded_by?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_performance_records: {
        Row: {
          actual_delivery_days: number | null
          actual_total: number | null
          id: string
          organization_id: string
          quality_rating: number | null
          quoted_delivery_days: number
          quoted_total: number
          recorded_at: string
          rfq_id: string
          supplier_id: string
          variance: Json | null
        }
        Insert: {
          actual_delivery_days?: number | null
          actual_total?: number | null
          id?: string
          organization_id: string
          quality_rating?: number | null
          quoted_delivery_days: number
          quoted_total: number
          recorded_at?: string
          rfq_id: string
          supplier_id: string
          variance?: Json | null
        }
        Update: {
          actual_delivery_days?: number | null
          actual_total?: number | null
          id?: string
          organization_id?: string
          quality_rating?: number | null
          quoted_delivery_days?: number
          quoted_total?: number
          recorded_at?: string
          rfq_id?: string
          supplier_id?: string
          variance?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_performance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_performance_records_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "procurement_performance_records_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "procurement_performance_records_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "procurement_performance_records_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_performance_records_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "procurement_performance_records_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          is_demo: boolean
          profile_id: string
          role_code: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_demo?: boolean
          profile_id: string
          role_code: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_demo?: boolean
          profile_id?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          active_role_code: string | null
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_demo: boolean
          is_platform_admin: boolean
          updated_at: string
        }
        Insert: {
          active_role_code?: string | null
          auth_user_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_demo?: boolean
          is_platform_admin?: boolean
          updated_at?: string
        }
        Update: {
          active_role_code?: string | null
          auth_user_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_demo?: boolean
          is_platform_admin?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_role_code_fkey"
            columns: ["active_role_code"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["code"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          acknowledged_at: string | null
          award_id: string
          created_at: string
          currency: string
          id: string
          issued_at: string | null
          organization_id: string
          po_number: string
          rfq_id: string
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          award_id: string
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          organization_id: string
          po_number: string
          rfq_id: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          award_id?: string
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          organization_id?: string
          po_number?: string
          rfq_id?: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: true
            referencedRelation: "awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_evaluations: {
        Row: {
          breakdown: Json | null
          computed_at: string | null
          created_at: string
          evaluation_score: number
          id: string
          quote_id: string
          rfq_id: string
          status: Database["public"]["Enums"]["evaluation_status"]
          version_evaluated: number
        }
        Insert: {
          breakdown?: Json | null
          computed_at?: string | null
          created_at?: string
          evaluation_score: number
          id?: string
          quote_id: string
          rfq_id: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          version_evaluated: number
        }
        Update: {
          breakdown?: Json | null
          computed_at?: string | null
          created_at?: string
          evaluation_score?: number
          id?: string
          quote_id?: string
          rfq_id?: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          version_evaluated?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          quote_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quote_id: string
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quote_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          current_version: number
          evaluation_score: number | null
          id: string
          invitation_id: string
          received_at: string | null
          rfq_id: string
          source: Database["public"]["Enums"]["quote_source"]
          status: Database["public"]["Enums"]["quote_status"]
          submitted_at: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          evaluation_score?: number | null
          id?: string
          invitation_id: string
          received_at?: string | null
          rfq_id: string
          source?: Database["public"]["Enums"]["quote_source"]
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version?: number
          evaluation_score?: number | null
          id?: string
          invitation_id?: string
          received_at?: string | null
          rfq_id?: string
          source?: Database["public"]["Enums"]["quote_source"]
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "rfq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "rfq_invitations_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "rfq_invitations_manager"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "quotes_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          examples: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          examples?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          examples?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      requirement_subcategories: {
        Row: {
          category_id: string
          code: string
          created_at: string
          default_requirement_mode:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          description: string | null
          id: string
          is_active: boolean
          match_keywords: string[]
          name: string
          required_attribute_codes: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          code: string
          created_at?: string
          default_requirement_mode?:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_keywords?: string[]
          name: string
          required_attribute_codes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          code?: string
          created_at?: string
          default_requirement_mode?:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_keywords?: string[]
          name?: string
          required_attribute_codes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "requirement_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          attributes: Json
          cancelled_at: string | null
          category_id: string | null
          closed_at: string | null
          commercial: Json
          created_at: string
          created_by: string
          delivery_city: string | null
          delivery_line1: string | null
          delivery_pincode: string | null
          description: string | null
          fulfilment_mode: Database["public"]["Enums"]["fulfilment_mode"] | null
          id: string
          is_demo: boolean
          organization_id: string
          public_ref: string | null
          published_at: string | null
          quality: Json
          quantity: number | null
          required_by_date: string | null
          required_by_days: number | null
          required_by_mode:
            | Database["public"]["Enums"]["required_by_mode"]
            | null
          requirement_mode:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          requirement_type: Database["public"]["Enums"]["requirement_type"]
          site_notes: string | null
          status: Database["public"]["Enums"]["requirement_status"]
          structured_specs: Json | null
          subcategory_id: string | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          cancelled_at?: string | null
          category_id?: string | null
          closed_at?: string | null
          commercial?: Json
          created_at?: string
          created_by: string
          delivery_city?: string | null
          delivery_line1?: string | null
          delivery_pincode?: string | null
          description?: string | null
          fulfilment_mode?:
            | Database["public"]["Enums"]["fulfilment_mode"]
            | null
          id?: string
          is_demo?: boolean
          organization_id: string
          public_ref?: string | null
          published_at?: string | null
          quality?: Json
          quantity?: number | null
          required_by_date?: string | null
          required_by_days?: number | null
          required_by_mode?:
            | Database["public"]["Enums"]["required_by_mode"]
            | null
          requirement_mode?:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          requirement_type: Database["public"]["Enums"]["requirement_type"]
          site_notes?: string | null
          status?: Database["public"]["Enums"]["requirement_status"]
          structured_specs?: Json | null
          subcategory_id?: string | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          cancelled_at?: string | null
          category_id?: string | null
          closed_at?: string | null
          commercial?: Json
          created_at?: string
          created_by?: string
          delivery_city?: string | null
          delivery_line1?: string | null
          delivery_pincode?: string | null
          description?: string | null
          fulfilment_mode?:
            | Database["public"]["Enums"]["fulfilment_mode"]
            | null
          id?: string
          is_demo?: boolean
          organization_id?: string
          public_ref?: string | null
          published_at?: string | null
          quality?: Json
          quantity?: number | null
          required_by_date?: string | null
          required_by_days?: number | null
          required_by_mode?:
            | Database["public"]["Enums"]["required_by_mode"]
            | null
          requirement_mode?:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          requirement_type?: Database["public"]["Enums"]["requirement_type"]
          site_notes?: string | null
          status?: Database["public"]["Enums"]["requirement_status"]
          structured_specs?: Json | null
          subcategory_id?: string | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "requirement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "requirement_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_clarification_messages: {
        Row: {
          author_profile_id: string
          author_side: Database["public"]["Enums"]["clarification_author_side"]
          body: string
          created_at: string
          id: string
          invitation_id: string
          redactions: string[]
          rfq_id: string
        }
        Insert: {
          author_profile_id: string
          author_side: Database["public"]["Enums"]["clarification_author_side"]
          body: string
          created_at?: string
          id?: string
          invitation_id: string
          redactions?: string[]
          rfq_id: string
        }
        Update: {
          author_profile_id?: string
          author_side?: Database["public"]["Enums"]["clarification_author_side"]
          body?: string
          created_at?: string
          id?: string
          invitation_id?: string
          redactions?: string[]
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_clarification_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_manager"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_invitations: {
        Row: {
          anonymous_label: string
          decline_reason: string | null
          declined_at: string | null
          id: string
          invited_at: string
          match_reasons: string[] | null
          match_score: number | null
          rfq_id: string
          status: Database["public"]["Enums"]["invite_status"]
          supplier_id: string
          viewed_at: string | null
        }
        Insert: {
          anonymous_label: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          invited_at?: string
          match_reasons?: string[] | null
          match_score?: number | null
          rfq_id: string
          status?: Database["public"]["Enums"]["invite_status"]
          supplier_id: string
          viewed_at?: string | null
        }
        Update: {
          anonymous_label?: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          invited_at?: string
          match_reasons?: string[] | null
          match_score?: number | null
          rfq_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
          supplier_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          alias_salt: string
          bid_deadline: string | null
          buyer_anonymous_to_suppliers: boolean
          clarification_at: string | null
          created_at: string
          created_by: string
          evaluation_at: string | null
          evaluation_deadline: string | null
          evaluation_weights: Json
          evaluation_weights_source: string
          id: string
          is_demo: boolean
          min_quotes_required: number
          min_quotes_waived: boolean
          min_quotes_waiver_reason: string | null
          opened_at: string | null
          organization_id: string
          public_ref: string | null
          quote_deadline: string | null
          requirement_id: string
          reveal_status: Database["public"]["Enums"]["rfq_reveal_status"]
          revision_deadline: string | null
          sourcing_mode: Database["public"]["Enums"]["sourcing_mode"]
          status: Database["public"]["Enums"]["rfq_status"]
          title: string
          updated_at: string
        }
        Insert: {
          alias_salt?: string
          bid_deadline?: string | null
          buyer_anonymous_to_suppliers?: boolean
          clarification_at?: string | null
          created_at?: string
          created_by: string
          evaluation_at?: string | null
          evaluation_deadline?: string | null
          evaluation_weights?: Json
          evaluation_weights_source?: string
          id?: string
          is_demo?: boolean
          min_quotes_required?: number
          min_quotes_waived?: boolean
          min_quotes_waiver_reason?: string | null
          opened_at?: string | null
          organization_id: string
          public_ref?: string | null
          quote_deadline?: string | null
          requirement_id: string
          reveal_status?: Database["public"]["Enums"]["rfq_reveal_status"]
          revision_deadline?: string | null
          sourcing_mode?: Database["public"]["Enums"]["sourcing_mode"]
          status?: Database["public"]["Enums"]["rfq_status"]
          title: string
          updated_at?: string
        }
        Update: {
          alias_salt?: string
          bid_deadline?: string | null
          buyer_anonymous_to_suppliers?: boolean
          clarification_at?: string | null
          created_at?: string
          created_by?: string
          evaluation_at?: string | null
          evaluation_deadline?: string | null
          evaluation_weights?: Json
          evaluation_weights_source?: string
          id?: string
          is_demo?: boolean
          min_quotes_required?: number
          min_quotes_waived?: boolean
          min_quotes_waiver_reason?: string | null
          opened_at?: string | null
          organization_id?: string
          public_ref?: string | null
          quote_deadline?: string | null
          requirement_id?: string
          reveal_status?: Database["public"]["Enums"]["rfq_reveal_status"]
          revision_deadline?: string | null
          sourcing_mode?: Database["public"]["Enums"]["sourcing_mode"]
          status?: Database["public"]["Enums"]["rfq_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: true
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_requests: {
        Row: {
          business_name: string
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          category_codes: string[]
          contact_first_name: string
          contact_last_name: string
          coverage_city: string | null
          coverage_pincode: string | null
          created_at: string
          designation: string | null
          email: string
          id: string
          organization_id: string | null
          phone: string
          referral_code: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_code: string | null
          side: Database["public"]["Enums"]["signup_side"]
          status: Database["public"]["Enums"]["signup_status"]
          supplier_id: string | null
          tax_registration_id: string | null
          updated_at: string
          verification_channel: Database["public"]["Enums"]["verification_channel"]
          verified_at: string | null
        }
        Insert: {
          business_name: string
          buyer_type?: Database["public"]["Enums"]["org_type"] | null
          category_codes?: string[]
          contact_first_name: string
          contact_last_name: string
          coverage_city?: string | null
          coverage_pincode?: string | null
          created_at?: string
          designation?: string | null
          email: string
          id?: string
          organization_id?: string | null
          phone: string
          referral_code?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_code?: string | null
          side: Database["public"]["Enums"]["signup_side"]
          status?: Database["public"]["Enums"]["signup_status"]
          supplier_id?: string | null
          tax_registration_id?: string | null
          updated_at?: string
          verification_channel?: Database["public"]["Enums"]["verification_channel"]
          verified_at?: string | null
        }
        Update: {
          business_name?: string
          buyer_type?: Database["public"]["Enums"]["org_type"] | null
          category_codes?: string[]
          contact_first_name?: string
          contact_last_name?: string
          coverage_city?: string | null
          coverage_pincode?: string | null
          created_at?: string
          designation?: string | null
          email?: string
          id?: string
          organization_id?: string | null
          phone?: string
          referral_code?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_code?: string | null
          side?: Database["public"]["Enums"]["signup_side"]
          status?: Database["public"]["Enums"]["signup_status"]
          supplier_id?: string | null
          tax_registration_id?: string | null
          updated_at?: string
          verification_channel?: Database["public"]["Enums"]["verification_channel"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_requests_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "signup_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategory_capabilities: {
        Row: {
          capability_id: string
          created_at: string
          id: string
          is_primary: boolean
          subcategory_id: string
        }
        Insert: {
          capability_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subcategory_id: string
        }
        Update: {
          capability_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subcategory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategory_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcategory_capabilities_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "requirement_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategory_evaluation_suggestions: {
        Row: {
          created_at: string
          criterion_id: string
          id: string
          subcategory_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          criterion_id: string
          id?: string
          subcategory_id: string
          weight: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          id?: string
          subcategory_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategory_evaluation_suggestions_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcategory_evaluation_suggestions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "requirement_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_capabilities: {
        Row: {
          capability_id: string
          capacity_unit: string | null
          created_at: string
          id: string
          max_capacity_value: number | null
          notes: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          capability_id: string
          capacity_unit?: string | null
          created_at?: string
          id?: string
          max_capacity_value?: number | null
          notes?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          capability_id?: string
          capacity_unit?: string | null
          created_at?: string
          id?: string
          max_capacity_value?: number | null
          notes?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_capabilities_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_magic_links: {
        Row: {
          channel: Database["public"]["Enums"]["messaging_channel"] | null
          created_at: string
          expires_at: string
          id: string
          is_demo: boolean
          rfq_id: string
          supplier_id: string
          token_hash: string
          used_at: string | null
          used_from: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["messaging_channel"] | null
          created_at?: string
          expires_at: string
          id?: string
          is_demo?: boolean
          rfq_id: string
          supplier_id: string
          token_hash: string
          used_at?: string | null
          used_from?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["messaging_channel"] | null
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          rfq_id?: string
          supplier_id?: string
          token_hash?: string
          used_at?: string | null
          used_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_magic_links_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_magic_links_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_magic_links_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_magic_links_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_magic_links_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_magic_links_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_messaging_channels: {
        Row: {
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at: string
          id: string
          last_provider:
            | Database["public"]["Enums"]["messaging_provider"]
            | null
          phone_e164: string
          status: Database["public"]["Enums"]["messaging_channel_status"]
          supplier_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          id?: string
          last_provider?:
            | Database["public"]["Enums"]["messaging_provider"]
            | null
          phone_e164: string
          status?: Database["public"]["Enums"]["messaging_channel_status"]
          supplier_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          id?: string
          last_provider?:
            | Database["public"]["Enums"]["messaging_provider"]
            | null
          phone_e164?: string
          status?: Database["public"]["Enums"]["messaging_channel_status"]
          supplier_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_messaging_channels_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_notifications: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at: string
          delivered_at: string | null
          demo_run_id: string | null
          external_message_id: string | null
          failure_reason: string | null
          id: string
          invitation_id: string | null
          is_demo: boolean
          provider: Database["public"]["Enums"]["messaging_provider"]
          read_at: string | null
          rfq_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          supplier_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          delivered_at?: string | null
          demo_run_id?: string | null
          external_message_id?: string | null
          failure_reason?: string | null
          id?: string
          invitation_id?: string | null
          is_demo?: boolean
          provider: Database["public"]["Enums"]["messaging_provider"]
          read_at?: string | null
          rfq_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          supplier_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["messaging_channel"]
          created_at?: string
          delivered_at?: string | null
          demo_run_id?: string | null
          external_message_id?: string | null
          failure_reason?: string | null
          id?: string
          invitation_id?: string | null
          is_demo?: boolean
          provider?: Database["public"]["Enums"]["messaging_provider"]
          read_at?: string | null
          rfq_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          supplier_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "supplier_notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_manager"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "supplier_notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_demo: boolean
          last_seen_at: string | null
          magic_link_id: string | null
          revoked_at: string | null
          rfq_id: string
          supplier_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          magic_link_id?: string | null
          revoked_at?: string | null
          rfq_id: string
          supplier_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          magic_link_id?: string | null
          revoked_at?: string | null
          rfq_id?: string
          supplier_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_sessions_magic_link_id_fkey"
            columns: ["magic_link_id"]
            isOneToOne: false
            referencedRelation: "supplier_magic_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_quote_sessions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_service_areas: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          city: string | null
          created_at: string
          id: string
          is_primary: boolean
          pincode: string | null
          radius_km: number | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          pincode?: string | null
          radius_km?: number | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          pincode?: string | null
          radius_km?: number | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_service_areas_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_users: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["supplier_user_role"]
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["supplier_user_role"]
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["supplier_user_role"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_users_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: Json | null
          business_name: string
          capabilities: Json | null
          categories: string[]
          city: string | null
          completed_jobs: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          dispute_rate: number | null
          id: string
          is_demo: boolean
          on_time_percent: number | null
          pincode: string | null
          rating_avg: number | null
          service_area: Json | null
          source: Database["public"]["Enums"]["supplier_source"]
          source_ref: string | null
          status: Database["public"]["Enums"]["supplier_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["supplier_verification_status"]
        }
        Insert: {
          address?: Json | null
          business_name: string
          capabilities?: Json | null
          categories?: string[]
          city?: string | null
          completed_jobs?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          dispute_rate?: number | null
          id?: string
          is_demo?: boolean
          on_time_percent?: number | null
          pincode?: string | null
          rating_avg?: number | null
          service_area?: Json | null
          source?: Database["public"]["Enums"]["supplier_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["supplier_verification_status"]
        }
        Update: {
          address?: Json | null
          business_name?: string
          capabilities?: Json | null
          categories?: string[]
          city?: string | null
          completed_jobs?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          dispute_rate?: number | null
          id?: string
          is_demo?: boolean
          on_time_percent?: number | null
          pincode?: string | null
          rating_avg?: number | null
          service_area?: Json | null
          source?: Database["public"]["Enums"]["supplier_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["supplier_verification_status"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          code: string
          created_at: string
          description: string
          is_active: boolean
          label: string
          permissions: Database["public"]["Enums"]["role_permission"][]
          side: Database["public"]["Enums"]["signup_side"]
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          is_active?: boolean
          label: string
          permissions: Database["public"]["Enums"]["role_permission"][]
          side: Database["public"]["Enums"]["signup_side"]
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          is_active?: boolean
          label?: string
          permissions?: Database["public"]["Enums"]["role_permission"][]
          side?: Database["public"]["Enums"]["signup_side"]
          sort_order?: number
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          actual_start: string | null
          buyer_accepted_at: string | null
          completed_at: string | null
          created_at: string
          dispute_status: Database["public"]["Enums"]["dispute_status"]
          id: string
          inspection_notes: string | null
          progress_percent: number
          purchase_order_id: string
          scheduled_start: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          supplier_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_start?: string | null
          buyer_accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          inspection_notes?: string | null
          progress_percent?: number
          purchase_order_id: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          supplier_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_start?: string | null
          buyer_accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          inspection_notes?: string | null
          progress_percent?: number
          purchase_order_id?: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          supplier_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      demo_login_options: {
        Row: {
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          buyer_type_label: string | null
          description: string | null
          email: string | null
          label: string | null
          party_name: string | null
          persona: string | null
          scenario_code: string | null
          sort_order: number | null
          voting_power: number | null
        }
        Relationships: []
      }
      demo_scenario_board: {
        Row: {
          actual_stage: string | null
          award_status: Database["public"]["Enums"]["award_status"] | null
          awarded_at: string | null
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          buyer_type_label: string | null
          code: string | null
          default_committee_size: number | null
          has_purchase_order: boolean | null
          members_voted: number | null
          min_quotes_required: number | null
          narrative: string | null
          organization_name: string | null
          public_ref: string | null
          quotes_received: number | null
          requirement_id: string | null
          requirement_status:
            | Database["public"]["Enums"]["requirement_status"]
            | null
          reveal_status: Database["public"]["Enums"]["rfq_reveal_status"] | null
          revealed_at: string | null
          rfq_id: string | null
          rfq_status: Database["public"]["Enums"]["rfq_status"] | null
          sort_order: number | null
          stage_label: string | null
          suppliers_invited: number | null
          target_stage: string | null
          title: string | null
          voting_power: number | null
          weight_cast: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_scenarios_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scenarios_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      my_bid_outcome: {
        Row: {
          buyer_released: boolean | null
          decided_at: string | null
          my_alias: string | null
          outcome: string | null
          public_ref: string | null
          rfq_id: string | null
          title: string | null
        }
        Relationships: []
      }
      my_committee_vote: {
        Row: {
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          cast_at: string | null
          choice: Database["public"]["Enums"]["vote_choice"] | null
          comment: string | null
          recommended_alias: string | null
          recommended_quote_id: string | null
          rfq_id: string | null
          vote_id: string | null
          voting_power: number | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "committee_votes_recommended_quote_id_fkey"
            columns: ["recommended_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_votes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      quote_attachments_blind: {
        Row: {
          anonymous_label: string | null
          attachment_id: string | null
          content_type: string | null
          created_at: string | null
          display_name: string | null
          duration_seconds: number | null
          kind: Database["public"]["Enums"]["attachment_kind"] | null
          quote_id: string | null
          rfq_id: string | null
          size_bytes: number | null
          storage_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      quote_attachments_revealed: {
        Row: {
          anonymous_label: string | null
          attachment_id: string | null
          business_name: string | null
          content_type: string | null
          created_at: string | null
          display_name: string | null
          duration_seconds: number | null
          kind: Database["public"]["Enums"]["attachment_kind"] | null
          original_filename: string | null
          quote_id: string | null
          rfq_id: string | null
          size_bytes: number | null
          storage_path: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_evaluations_blind: {
        Row: {
          anonymous_label: string | null
          breakdown: Json | null
          computed_at: string | null
          evaluation_id: string | null
          evaluation_score: number | null
          quote_id: string | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["evaluation_status"] | null
          version_evaluated: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_blind"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_evaluations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_revealed"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      quotes_identity_protected: Database["public"]["Views"]["quotes_blind"]
      rfqs_supplier_masked: Database["public"]["Views"]["rfqs_supplier_blind"]
      rfq_clarifications_masked: Database["public"]["Views"]["rfq_clarification_blind"]
      quote_attachments_masked: Database["public"]["Views"]["quote_attachments_blind"]
      quote_evaluations_masked: Database["public"]["Views"]["quote_evaluations_blind"]
      rfq_invitations_masked: Database["public"]["Views"]["rfq_invitations_blind"]
      my_quote_outcome: Database["public"]["Views"]["my_bid_outcome"]
      quotes_blind: {
        Row: {
          anonymous_label: string | null
          base_price: number | null
          created_at: string | null
          delivery_days: number | null
          evaluation_score: number | null
          experience_band: string | null
          gst_amount: number | null
          on_time_band: number | null
          payment_terms_days: number | null
          quote_id: string | null
          rating_band: number | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          submitted_at: string | null
          total_cost: number | null
          transport_cost: number | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["supplier_verification_status"]
            | null
          version: number | null
          warranty_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      quotes_revealed: {
        Row: {
          address: Json | null
          anonymous_label: string | null
          base_price: number | null
          business_name: string | null
          created_at: string | null
          delivery_days: number | null
          email: string | null
          evaluation_score: number | null
          gst_amount: number | null
          phone: string | null
          quote_id: string | null
          rfq_id: string | null
          source: Database["public"]["Enums"]["supplier_source"] | null
          status: Database["public"]["Enums"]["quote_status"] | null
          submitted_at: string | null
          supplier_id: string | null
          supplier_rating: number | null
          total_cost: number | null
          transport_cost: number | null
          updated_at: string | null
          version: number | null
          warranty_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_attachments_shared: {
        Row: {
          attachment_id: string | null
          content_type: string | null
          created_at: string | null
          display_name: string | null
          duration_seconds: number | null
          kind: Database["public"]["Enums"]["attachment_kind"] | null
          requirement_id: string | null
          rfq_id: string | null
          scope: Database["public"]["Enums"]["attachment_scope"] | null
          size_bytes: number | null
          storage_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_buyer_revealed: {
        Row: {
          address: Json | null
          awarded_at: string | null
          awarded_by_email: string | null
          awarded_by_name: string | null
          buyer_organization: string | null
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          public_ref: string | null
          revealed_at: string | null
          rfq_id: string | null
          tax_registration: string | null
          title: string | null
        }
        Relationships: []
      }
      rfq_clarification_blind: {
        Row: {
          anonymous_label: string | null
          author_display: string | null
          author_side:
            | Database["public"]["Enums"]["clarification_author_side"]
            | null
          body: string | null
          created_at: string | null
          invitation_id: string | null
          message_id: string | null
          redactions: string[] | null
          rfq_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_manager"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_clarification_supplier: {
        Row: {
          author_display: string | null
          author_side:
            | Database["public"]["Enums"]["clarification_author_side"]
            | null
          body: string | null
          created_at: string | null
          invitation_id: string | null
          message_id: string | null
          redactions: string[] | null
          rfq_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfq_invitations_manager"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_invitations_blind: {
        Row: {
          anonymous_label: string | null
          declined_at: string | null
          invitation_id: string | null
          invited_at: string | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["invite_status"] | null
          viewed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_invitations_manager: {
        Row: {
          anonymous_label: string | null
          declined_at: string | null
          invitation_id: string | null
          invited_at: string | null
          match_reasons: string[] | null
          match_score: number | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["invite_status"] | null
          supplier_id: string | null
          viewed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_notification_status: {
        Row: {
          anonymous_label: string | null
          channel: Database["public"]["Enums"]["messaging_channel"] | null
          delivered_at: string | null
          failed: boolean | null
          read_at: string | null
          rfq_id: string | null
          sent_at: string | null
          status:
            | Database["public"]["Enums"]["notification_delivery_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_notifications_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_supplier_networks: {
        Row: {
          invited_count: number | null
          network: string | null
          quoted_count: number | null
          rfq_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "my_bid_outcome"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_buyer_revealed"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_vote_tally"
            referencedColumns: ["rfq_id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs_supplier_blind"
            referencedColumns: ["rfq_id"]
          },
        ]
      }
      rfq_vote_tally: {
        Row: {
          anonymous_label: string | null
          last_vote_at: string | null
          quote_id: string | null
          recommend_count: number | null
          recommend_weight: number | null
          rfq_id: string | null
          vote_count: number | null
          weighted_total: number | null
        }
        Relationships: []
      }
      rfqs_supplier_blind: {
        Row: {
          attributes: Json | null
          buyer_display_name: string | null
          buyer_type: Database["public"]["Enums"]["org_type"] | null
          category: string | null
          commercial: Json | null
          created_at: string | null
          delivery_city: string | null
          description: string | null
          evaluation_weights: Json | null
          fulfilment_mode: Database["public"]["Enums"]["fulfilment_mode"] | null
          invitation_id: string | null
          invited_at: string | null
          min_quotes_required: number | null
          my_alias: string | null
          my_invitation_status:
            | Database["public"]["Enums"]["invite_status"]
            | null
          public_ref: string | null
          quality: Json | null
          quantity: number | null
          quote_deadline: string | null
          required_by_date: string | null
          required_by_days: number | null
          required_by_mode:
            | Database["public"]["Enums"]["required_by_mode"]
            | null
          requirement_mode:
            | Database["public"]["Enums"]["requirement_mode"]
            | null
          rfq_id: string | null
          sourcing_mode: Database["public"]["Enums"]["sourcing_mode"] | null
          status: Database["public"]["Enums"]["rfq_status"] | null
          subcategory: string | null
          title: string | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_delivery_inspection: {
        Args: { p_notes?: string; p_work_order_id: string }
        Returns: undefined
      }
      admin_assign_profile_role: {
        Args: { p_code: string; p_make_active?: boolean; p_profile_id: string }
        Returns: Json
      }
      advance_rfq_phases: { Args: never; Returns: Json }
      assign_my_role: { Args: { p_code: string }; Returns: Json }
      backfill_taxonomy: { Args: never; Returns: Json }
      cast_committee_vote: {
        Args: {
          p_choice: Database["public"]["Enums"]["vote_choice"]
          p_comment?: string
          p_recommended_quote_id: string
          p_rfq_id: string
        }
        Returns: Json
      }
      classify_requirement_text: {
        Args: { p_text: string }
        Returns: {
          score: number
          subcategory_code: string
          subcategory_id: string
        }[]
      }
      close_clarification_for_evaluation: {
        Args: { p_rfq_id: string }
        Returns: undefined
      }
      close_initial_quoting: { Args: { p_rfq_id: string }; Returns: undefined }
      compute_quote_evaluations: { Args: { p_rfq_id: string }; Returns: Json }
      confirm_attachment_upload: {
        Args: { p_attachment_id: string; p_size_bytes?: number }
        Returns: undefined
      }
      create_attachment_slot: {
        Args: {
          p_content_type: string
          p_duration_seconds?: number
          p_kind: Database["public"]["Enums"]["attachment_kind"]
          p_original_filename: string
          p_quote_id: string
          p_requirement_id: string
          p_scope: Database["public"]["Enums"]["attachment_scope"]
          p_size_bytes?: number
        }
        Returns: Json
      }
      demo_generate_quotes: {
        Args: {
          p_count?: number
          p_rfq_id: string
          p_status?: Database["public"]["Enums"]["quote_status"]
        }
        Returns: Json
      }
      demo_generate_votes: { Args: { p_rfq_id: string }; Returns: Json }
      demo_may_simulate_messaging: {
        Args: { p_rfq_id: string }
        Returns: boolean
      }
      demo_messaging_outbox: { Args: { p_rfq_id: string }; Returns: Json }
      demo_messaging_recipients: { Args: { p_rfq_id: string }; Returns: Json }
      demo_messaging_sender: {
        Args: { p_alias: string; p_rfq_id: string }
        Returns: Json
      }
      demo_messaging_thread: { Args: { p_rfq_id: string }; Returns: Json }
      demo_record_reply: {
        Args: {
          p_alias: string
          p_body: string
          p_rfq_id: string
          p_template_id?: string
        }
        Returns: string
      }
      demo_reset: { Args: { p_restage?: boolean }; Returns: Json }
      demo_send_notification: {
        Args: {
          p_alias: string
          p_body: string
          p_rfq_id: string
          p_template_id?: string
        }
        Returns: string
      }
      demo_simulate_supplier_message: {
        Args: {
          p_alias: string
          p_body: string
          p_message_id?: string
          p_parsed?: Json
          p_rfq_id: string
        }
        Returns: Json
      }
      demo_stage_scenario: { Args: { p_code: string }; Returns: Json }
      demo_status: { Args: never; Returns: Json }
      discover_and_invite_for_rfq: {
        Args: { p_exclude?: string[]; p_limit?: number; p_rfq_id: string }
        Returns: Json
      }
      ingest_supplier_message: { Args: { p_message: Json }; Returns: Json }
      issue_supplier_magic_link: {
        Args: {
          p_channel?: Database["public"]["Enums"]["messaging_channel"]
          p_rfq_id: string
          p_supplier_id: string
          p_ttl?: string
        }
        Returns: string
      }
      lock_award: {
        Args: { p_justification: string; p_quote_id: string; p_rfq_id: string }
        Returns: Json
      }
      messaging_quote_context: {
        Args: { p_session_token: string }
        Returns: Json
      }
      my_demo_context: { Args: never; Returns: Json }
      my_role_context: { Args: never; Returns: Json }
      preview_discovery_reach: { Args: { p_rfq_id: string }; Returns: Json }
      publish_requirement: {
        Args: {
          p_min_quotes_required?: number
          p_quote_deadline_days?: number
          p_requirement_id: string
          p_sourcing_mode?: Database["public"]["Enums"]["sourcing_mode"]
          p_weights?: Json
          p_weights_source?: string
        }
        Returns: Json
      }
      record_buyer_performance_review: {
        Args: {
          p_actual_delivery_days: number
          p_notes?: string
          p_quality_rating: number
          p_rfq_id: string
        }
        Returns: string
      }
      record_notification_delivery: {
        Args: {
          p_external_message_id: string
          p_failure_reason?: string
          p_provider: Database["public"]["Enums"]["messaging_provider"]
          p_status: Database["public"]["Enums"]["notification_delivery_status"]
        }
        Returns: boolean
      }
      record_outbound_message: { Args: { p_message: Json }; Returns: string }
      record_supplier_notification: {
        Args: { p_notification: Json }
        Returns: string
      }
      redeem_supplier_magic_link: {
        Args: { p_from?: string; p_token: string }
        Returns: Json
      }
      refresh_supplier_performance: {
        Args: { p_supplier_id: string }
        Returns: undefined
      }
      reveal_award: { Args: { p_rfq_id: string }; Returns: Json }
      rfq_by_public_ref: { Args: { p_public_ref: string }; Returns: string }
      rfq_phase: { Args: { p_rfq_id: string }; Returns: Json }
      rfq_voting_summary: { Args: { p_rfq_id: string }; Returns: Json }
      role_catalog: {
        Args: { p_side?: Database["public"]["Enums"]["signup_side"] }
        Returns: Json
      }
      served_cities: {
        Args: never
        Returns: {
          city: string
        }[]
      }
      service_categories: {
        Args: never
        Returns: {
          code: string
          description: string
          name: string
          sort_order: number
        }[]
      }
      set_organization_credentials: {
        Args: {
          p_address?: Json
          p_city?: string
          p_contact_email?: string
          p_contact_person?: string
          p_contact_phone?: string
          p_organization_id: string
          p_tax_registration?: string
        }
        Returns: Json
      }
      set_rfq_evaluation_weights: {
        Args: { p_rfq_id: string; p_source?: string; p_weights: Json }
        Returns: Json
      }
      set_rfq_schedule: {
        Args: {
          p_bid_deadline?: string
          p_evaluation_deadline?: string
          p_revision_deadline?: string
          p_rfq_id: string
        }
        Returns: Json
      }
      subcategory_attribute_schema: {
        Args: { p_subcategory_id: string }
        Returns: {
          applies_to_modes: Database["public"]["Enums"]["requirement_mode"][]
          attribute_id: string
          code: string
          data_type: Database["public"]["Enums"]["attribute_data_type"]
          help_text: string
          is_required: boolean
          label: string
          match_patterns: string[]
          options: Json
          placeholder: string
          scope: string
          sort_order: number
          unit: string
          validation: Json
        }[]
      }
      submit_messaging_quote: {
        Args: { p_quote: Json; p_session_token: string }
        Returns: Json
      }
      submit_signup_request: { Args: { p_request: Json }; Returns: Json }
      suggest_evaluation_weights: {
        Args: { p_requirement_id: string }
        Returns: Json
      }
      supplier_message_queue: { Args: { p_rfq_id: string }; Returns: Json }
      supplier_rfq_message_payload: {
        Args: { p_rfq_id: string; p_supplier_id: string }
        Returns: Json
      }
      switch_active_role: { Args: { p_code: string }; Returns: Json }
    }
    Enums: {
      approval_instance_status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"
      approval_policy_type:
        | "COMMUNITY_SIMPLE_MAJORITY"
        | "UNANIMOUS"
        | "MANAGER_ONLY"
      attachment_kind:
        | "DRAWING"
        | "PHOTO"
        | "HANDWRITTEN"
        | "DOCUMENT"
        | "VOICE_NOTE"
      attachment_scope: "REQUIREMENT" | "QUOTE"
      attribute_data_type:
        | "TEXT"
        | "NUMBER"
        | "BOOLEAN"
        | "ENUM"
        | "MULTI_ENUM"
        | "DATE"
      award_status: "LOCKED" | "PENDING_REVEAL" | "REVEALED"
      clarification_author_side: "BUYER" | "SUPPLIER"
      coi_status: "DECLARED_NONE" | "DECLARED_CONFLICT" | "WAIVED"
      criterion_direction: "LOWER_IS_BETTER" | "HIGHER_IS_BETTER"
      dispute_status: "NONE" | "OPEN" | "RESOLVED"
      evaluation_status: "PENDING" | "COMPUTED" | "STALE"
      fulfilment_mode:
        | "SUPPLIER_DELIVERY"
        | "BUYER_PICKUP"
        | "SUPPLIER_ONSITE"
        | "REMOTE"
        | "LOGISTICS_REQUIRED"
      invite_status: "INVITED" | "VIEWED" | "DECLINED" | "QUOTED"
      invoice_status: "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID"
      messaging_channel: "SMS" | "WHATSAPP"
      messaging_channel_status: "PENDING" | "VERIFIED" | "SUSPENDED" | "RETIRED"
      messaging_direction: "INBOUND" | "OUTBOUND"
      messaging_processing_status:
        | "RECEIVED"
        | "ACCEPTED"
        | "REJECTED"
        | "UNPARSEABLE"
        | "DUPLICATE"
        | "FAILED"
      messaging_provider: "TWILIO" | "META" | "MOCK"
      notification_channel: "IN_APP" | "EMAIL"
      notification_delivery_status:
        | "QUEUED"
        | "SENT"
        | "DELIVERED"
        | "READ"
        | "FAILED"
      notification_status: "PENDING" | "SENT" | "READ" | "FAILED"
      org_member_role:
        | "OWNER"
        | "MANAGER"
        | "BUYER"
        | "APPROVER"
        | "COMMITTEE_MEMBER"
      org_type:
        | "INDIVIDUAL"
        | "MSME"
        | "COMMUNITY"
        | "ENTERPRISE"
        | "INSTITUTION"
      payment_gateway_status:
        | "NOT_APPLICABLE"
        | "PENDING"
        | "PROCESSING"
        | "SUCCEEDED"
        | "FAILED"
        | "CANCELLED"
      payment_method: "MANUAL" | "UPI" | "BANK_TRANSFER" | "OTHER"
      payment_status: "RECORDED" | "VERIFIED" | "DISPUTED"
      purchase_order_status:
        | "DRAFT"
        | "PENDING_APPROVAL"
        | "APPROVED"
        | "ISSUED"
        | "ACCEPTED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
      quote_source: "WEB" | "WHATSAPP" | "SMS" | "DEMO_GENERATED"
      quote_status:
        | "DRAFT"
        | "DRAFT_FROM_MESSAGING"
        | "SUBMITTED"
        | "REVISED"
        | "FINAL"
        | "SELECTED"
        | "NOT_SELECTED"
        | "WITHDRAWN"
      required_by_mode:
        | "IMMEDIATE"
        | "WITHIN_DAYS"
        | "SPECIFIC_DATE"
        | "FLEXIBLE"
      requirement_mode:
        | "PRODUCT_MATERIAL"
        | "SERVICE"
        | "REPAIR_MAINTENANCE"
        | "JOB_WORK"
        | "PROJECT_CONTRACT"
        | "RENTAL_HIRE"
        | "AMC"
        | "COMMODITY_TRADING"
        | "LOGISTICS"
        | "PROFESSIONAL_SERVICE"
        | "OTHER"
      requirement_status:
        | "DRAFT"
        | "SUBMITTED"
        | "RFQ_CREATED"
        | "QUOTING"
        | "NEGOTIATION"
        | "EVALUATION"
        | "AWARDED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
      requirement_type: "PRODUCT" | "SERVICE" | "PROJECT"
      rfq_reveal_status: "PROTECTED" | "REVEALED" | "BLIND"
      rfq_status:
        | "DRAFT"
        | "OPEN"
        | "CLARIFICATION"
        | "CLOSED"
        | "EVALUATING"
        | "AWARDED"
        | "CANCELLED"
      role_permission:
        | "READ"
        | "WRITE"
        | "PROPOSE"
        | "VOTE"
        | "APPROVE"
        | "AWARD"
      signup_side: "BUYER" | "SUPPLIER"
      signup_status:
        | "PENDING"
        | "CONTACTED"
        | "VERIFIED"
        | "ONBOARDED"
        | "REJECTED"
      sourcing_mode:
        | "OPEN_RFQ"
        | "IDENTITY_PROTECTED"
        | "INVITE_SELECTED"
        | "NETWORK_DISCOVERY"
        | "PREVIOUS_SUPPLIERS"
      supplier_source:
        | "DIRECT"
        | "ONDC"
        | "BNI"
        | "ASSOCIATION"
        | "REFERRAL"
        | "LOCAL_REGISTRY"
        | "OTHER"
      supplier_status: "PENDING" | "ACTIVE" | "SUSPENDED"
      supplier_user_role: "OWNER" | "MANAGER" | "OPERATOR"
      supplier_verification_status:
        | "UNVERIFIED"
        | "SELF_DECLARED"
        | "DOCUMENT_VERIFIED"
        | "PLATFORM_VERIFIED"
      verification_channel: "EMAIL" | "WHATSAPP"
      vote_choice: "RECOMMEND" | "ABSTAIN" | "OPPOSE"
      work_order_status:
        | "NOT_STARTED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "DISPUTED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      approval_instance_status: ["PENDING", "APPROVED", "REJECTED", "EXPIRED"],
      approval_policy_type: [
        "COMMUNITY_SIMPLE_MAJORITY",
        "UNANIMOUS",
        "MANAGER_ONLY",
      ],
      attachment_kind: [
        "DRAWING",
        "PHOTO",
        "HANDWRITTEN",
        "DOCUMENT",
        "VOICE_NOTE",
      ],
      attachment_scope: ["REQUIREMENT", "QUOTE"],
      attribute_data_type: [
        "TEXT",
        "NUMBER",
        "BOOLEAN",
        "ENUM",
        "MULTI_ENUM",
        "DATE",
      ],
      award_status: ["LOCKED", "PENDING_REVEAL", "REVEALED"],
      clarification_author_side: ["BUYER", "SUPPLIER"],
      coi_status: ["DECLARED_NONE", "DECLARED_CONFLICT", "WAIVED"],
      criterion_direction: ["LOWER_IS_BETTER", "HIGHER_IS_BETTER"],
      dispute_status: ["NONE", "OPEN", "RESOLVED"],
      evaluation_status: ["PENDING", "COMPUTED", "STALE"],
      fulfilment_mode: [
        "SUPPLIER_DELIVERY",
        "BUYER_PICKUP",
        "SUPPLIER_ONSITE",
        "REMOTE",
        "LOGISTICS_REQUIRED",
      ],
      invite_status: ["INVITED", "VIEWED", "DECLINED", "QUOTED"],
      invoice_status: ["SUBMITTED", "APPROVED", "REJECTED", "PAID"],
      messaging_channel: ["SMS", "WHATSAPP"],
      messaging_channel_status: ["PENDING", "VERIFIED", "SUSPENDED", "RETIRED"],
      messaging_direction: ["INBOUND", "OUTBOUND"],
      messaging_processing_status: [
        "RECEIVED",
        "ACCEPTED",
        "REJECTED",
        "UNPARSEABLE",
        "DUPLICATE",
        "FAILED",
      ],
      messaging_provider: ["TWILIO", "META", "MOCK"],
      notification_channel: ["IN_APP", "EMAIL"],
      notification_delivery_status: [
        "QUEUED",
        "SENT",
        "DELIVERED",
        "READ",
        "FAILED",
      ],
      notification_status: ["PENDING", "SENT", "READ", "FAILED"],
      org_member_role: [
        "OWNER",
        "MANAGER",
        "BUYER",
        "APPROVER",
        "COMMITTEE_MEMBER",
      ],
      org_type: [
        "INDIVIDUAL",
        "MSME",
        "COMMUNITY",
        "ENTERPRISE",
        "INSTITUTION",
      ],
      payment_gateway_status: [
        "NOT_APPLICABLE",
        "PENDING",
        "PROCESSING",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ],
      payment_method: ["MANUAL", "UPI", "BANK_TRANSFER", "OTHER"],
      payment_status: ["RECORDED", "VERIFIED", "DISPUTED"],
      purchase_order_status: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "ISSUED",
        "ACCEPTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      quote_source: ["WEB", "WHATSAPP", "SMS", "DEMO_GENERATED"],
      quote_status: [
        "DRAFT",
        "DRAFT_FROM_MESSAGING",
        "SUBMITTED",
        "REVISED",
        "FINAL",
        "SELECTED",
        "NOT_SELECTED",
        "WITHDRAWN",
      ],
      required_by_mode: [
        "IMMEDIATE",
        "WITHIN_DAYS",
        "SPECIFIC_DATE",
        "FLEXIBLE",
      ],
      requirement_mode: [
        "PRODUCT_MATERIAL",
        "SERVICE",
        "REPAIR_MAINTENANCE",
        "JOB_WORK",
        "PROJECT_CONTRACT",
        "RENTAL_HIRE",
        "AMC",
        "COMMODITY_TRADING",
        "LOGISTICS",
        "PROFESSIONAL_SERVICE",
        "OTHER",
      ],
      requirement_status: [
        "DRAFT",
        "SUBMITTED",
        "RFQ_CREATED",
        "QUOTING",
        "NEGOTIATION",
        "EVALUATION",
        "AWARDED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      requirement_type: ["PRODUCT", "SERVICE", "PROJECT"],
      rfq_reveal_status: ["PROTECTED", "REVEALED", "BLIND"],
      rfq_status: [
        "DRAFT",
        "OPEN",
        "CLARIFICATION",
        "CLOSED",
        "EVALUATING",
        "AWARDED",
        "CANCELLED",
      ],
      role_permission: ["READ", "WRITE", "PROPOSE", "VOTE", "APPROVE", "AWARD"],
      signup_side: ["BUYER", "SUPPLIER"],
      signup_status: [
        "PENDING",
        "CONTACTED",
        "VERIFIED",
        "ONBOARDED",
        "REJECTED",
      ],
      sourcing_mode: [
        "OPEN_RFQ",
        "IDENTITY_PROTECTED",
        "INVITE_SELECTED",
        "NETWORK_DISCOVERY",
        "PREVIOUS_SUPPLIERS",
      ],
      supplier_source: [
        "DIRECT",
        "ONDC",
        "BNI",
        "ASSOCIATION",
        "REFERRAL",
        "LOCAL_REGISTRY",
        "OTHER",
      ],
      supplier_status: ["PENDING", "ACTIVE", "SUSPENDED"],
      supplier_user_role: ["OWNER", "MANAGER", "OPERATOR"],
      supplier_verification_status: [
        "UNVERIFIED",
        "SELF_DECLARED",
        "DOCUMENT_VERIFIED",
        "PLATFORM_VERIFIED",
      ],
      verification_channel: ["EMAIL", "WHATSAPP"],
      vote_choice: ["RECOMMEND", "ABSTAIN", "OPPOSE"],
      work_order_status: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "COMPLETED",
        "DISPUTED",
      ],
    },
  },
} as const


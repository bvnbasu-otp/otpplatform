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
            "account_balance_snapshots": {
                  Row: {
                    "account_id": string,"balance_type": string,"created_at": string,"id": string,"net_balance": number,"organization_id": string,"period_id": string,"snapshot_date": string,"total_credits": number,"total_debits": number
                  }
                  Insert: {
                    "account_id": string,"balance_type": string,"created_at"?: string,"id"?: string,"net_balance"?: number,"organization_id": string,"period_id": string,"snapshot_date": string,"total_credits"?: number,"total_debits"?: number
                  }
                  Update: {
                    "account_id"?: string,"balance_type"?: string,"created_at"?: string,"id"?: string,"net_balance"?: number,"organization_id"?: string,"period_id"?: string,"snapshot_date"?: string,"total_credits"?: number,"total_debits"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_balance_snapshots_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_balance_snapshots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_balance_snapshots_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "accounting_periods"
      referencedColumns: ["id"]
    }
                  ]
                },"accounting_periods": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"created_at": string,"end_date": string,"id": string,"locked_at": string | null,"locked_by": string | null,"organization_id": string,"period_code": string,"period_name": string,"reopen_reason": string | null,"reopened_at": string | null,"reopened_by": string | null,"start_date": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"end_date": string,"id"?: string,"locked_at"?: string | null,"locked_by"?: string | null,"organization_id": string,"period_code": string,"period_name": string,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"start_date": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"end_date"?: string,"id"?: string,"locked_at"?: string | null,"locked_by"?: string | null,"organization_id"?: string,"period_code"?: string,"period_name"?: string,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"start_date"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounting_periods_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounting_periods_locked_by_fkey"
      columns: ["locked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounting_periods_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounting_periods_reopened_by_fkey"
      columns: ["reopened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_database_snapshots": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"label": string | null,"metadata": Json | null,"name": string,"records_count": number | null,"size_bytes": number,"snapshot_data": NonNullable<Json>,"snapshot_type": string,"table_counts": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"label"?: string | null,"metadata"?: Json | null,"name": string,"records_count"?: number | null,"size_bytes"?: number,"snapshot_data"?: NonNullable<Json>,"snapshot_type"?: string,"table_counts"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"label"?: string | null,"metadata"?: Json | null,"name"?: string,"records_count"?: number | null,"size_bytes"?: number,"snapshot_data"?: NonNullable<Json>,"snapshot_type"?: string,"table_counts"?: NonNullable<Json>
                  }
                  Relationships: [

                  ]
                },"announcements": {
                  Row: {
                    "acknowledgement_required": boolean,"action_label": string | null,"action_url": string | null,"audience": Database["public"]['Enums']["announcement_audience"],"category": Database["public"]['Enums']["announcement_category"],"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"message": string,"publish_at": string,"severity": Database["public"]['Enums']["announcement_severity"],"status": Database["public"]['Enums']["announcement_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "acknowledgement_required"?: boolean,"action_label"?: string | null,"action_url"?: string | null,"audience"?: Database["public"]['Enums']["announcement_audience"],"category"?: Database["public"]['Enums']["announcement_category"],"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"message": string,"publish_at"?: string,"severity"?: Database["public"]['Enums']["announcement_severity"],"status"?: Database["public"]['Enums']["announcement_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "acknowledgement_required"?: boolean,"action_label"?: string | null,"action_url"?: string | null,"audience"?: Database["public"]['Enums']["announcement_audience"],"category"?: Database["public"]['Enums']["announcement_category"],"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"message"?: string,"publish_at"?: string,"severity"?: Database["public"]['Enums']["announcement_severity"],"status"?: Database["public"]['Enums']["announcement_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"api_rate_limits": {
                  Row: {
                    "client_key": string,"created_at": string,"endpoint": string,"id": string,"request_count": number,"window_start": string
                  }
                  Insert: {
                    "client_key": string,"created_at"?: string,"endpoint": string,"id"?: string,"request_count"?: number,"window_start": string
                  }
                  Update: {
                    "client_key"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"request_count"?: number,"window_start"?: string
                  }
                  Relationships: [

                  ]
                },"approval_instances": {
                  Row: {
                    "id": string,"policy_id": string,"requested_at": string,"resolved_at": string | null,"rfq_id": string,"status": Database["public"]['Enums']["approval_instance_status"]
                  }
                  Insert: {
                    "id"?: string,"policy_id": string,"requested_at"?: string,"resolved_at"?: string | null,"rfq_id": string,"status"?: Database["public"]['Enums']["approval_instance_status"]
                  }
                  Update: {
                    "id"?: string,"policy_id"?: string,"requested_at"?: string,"resolved_at"?: string | null,"rfq_id"?: string,"status"?: Database["public"]['Enums']["approval_instance_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_instances_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "approval_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "approval_instances_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"approval_policies": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"organization_id": string,"policy_type": Database["public"]['Enums']["approval_policy_type"],"threshold": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"organization_id": string,"policy_type": Database["public"]['Enums']["approval_policy_type"],"threshold"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"organization_id"?: string,"policy_type"?: Database["public"]['Enums']["approval_policy_type"],"threshold"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "content_type": string,"created_at": string,"display_name": string,"duration_seconds": number | null,"id": string,"kind": Database["public"]['Enums']["attachment_kind"],"metadata_stripped": boolean | null,"original_filename": string,"processed_at": string | null,"quote_id": string | null,"requirement_id": string | null,"rfq_id": string | null,"scope": Database["public"]['Enums']["attachment_scope"],"size_bytes": number,"storage_path": string,"uploaded_at": string | null,"uploaded_by": string
                  }
                  Insert: {
                    "content_type": string,"created_at"?: string,"display_name"?: string,"duration_seconds"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["attachment_kind"],"metadata_stripped"?: boolean | null,"original_filename": string,"processed_at"?: string | null,"quote_id"?: string | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"scope": Database["public"]['Enums']["attachment_scope"],"size_bytes"?: number,"storage_path": string,"uploaded_at"?: string | null,"uploaded_by": string
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"display_name"?: string,"duration_seconds"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["attachment_kind"],"metadata_stripped"?: boolean | null,"original_filename"?: string,"processed_at"?: string | null,"quote_id"?: string | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"scope"?: Database["public"]['Enums']["attachment_scope"],"size_bytes"?: number,"storage_path"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_actor_identities": {
                  Row: {
                    "actor_id": string,"auth_user_id": string | null,"email": string | null,"full_name": string | null,"profile_deleted_at": string | null,"profile_id": string | null,"registered_at": string
                  }
                  Insert: {
                    "actor_id": string,"auth_user_id"?: string | null,"email"?: string | null,"full_name"?: string | null,"profile_deleted_at"?: string | null,"profile_id"?: string | null,"registered_at"?: string
                  }
                  Update: {
                    "actor_id"?: string,"auth_user_id"?: string | null,"email"?: string | null,"full_name"?: string | null,"profile_deleted_at"?: string | null,"profile_id"?: string | null,"registered_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_actor_identities_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "actor_id": string | null,"correlation_id": string | null,"demo_run_id": string | null,"entity_id": string,"entity_type": string,"event_type": string,"id": string,"is_demo": boolean,"occurred_at": string,"organization_id": string | null,"payload": NonNullable<Json>
                  }
                  Insert: {
                    "actor_id"?: string | null,"correlation_id"?: string | null,"demo_run_id"?: string | null,"entity_id": string,"entity_type": string,"event_type": string,"id"?: string,"is_demo"?: boolean,"occurred_at"?: string,"organization_id"?: string | null,"payload"?: NonNullable<Json>
                  }
                  Update: {
                    "actor_id"?: string | null,"correlation_id"?: string | null,"demo_run_id"?: string | null,"entity_id"?: string,"entity_type"?: string,"event_type"?: string,"id"?: string,"is_demo"?: boolean,"occurred_at"?: string,"organization_id"?: string | null,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "audit_actor_identities"
      referencedColumns: ["actor_id"]
    },{
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_pings": {
                  Row: {
                    "buyer_response": string | null,"created_at": string,"discrepancy_detected": boolean,"discrepancy_notes": string | null,"id": string,"organization_id": string,"ping_channel": string,"responded_at": string | null,"rfq_id": string,"scheduled_for": string,"sent_at": string | null,"status": string,"supplier_id": string | null,"supplier_response": string | null
                  }
                  Insert: {
                    "buyer_response"?: string | null,"created_at"?: string,"discrepancy_detected"?: boolean,"discrepancy_notes"?: string | null,"id"?: string,"organization_id": string,"ping_channel"?: string,"responded_at"?: string | null,"rfq_id": string,"scheduled_for": string,"sent_at"?: string | null,"status"?: string,"supplier_id"?: string | null,"supplier_response"?: string | null
                  }
                  Update: {
                    "buyer_response"?: string | null,"created_at"?: string,"discrepancy_detected"?: boolean,"discrepancy_notes"?: string | null,"id"?: string,"organization_id"?: string,"ping_channel"?: string,"responded_at"?: string | null,"rfq_id"?: string,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: string,"supplier_id"?: string | null,"supplier_response"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_pings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "audit_pings_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"awards": {
                  Row: {
                    "awarded_at": string,"awarded_by": string,"commitment_attestation": Json | null,"commitment_signed_at": string | null,"id": string,"justification": NonNullable<Json>,"quote_id": string,"revealed_at": string | null,"rfq_id": string,"status": Database["public"]['Enums']["award_status"],"unmasked_at": string | null,"unmasked_by": string | null,"vote_snapshot": NonNullable<Json>,"votes_locked_at": string | null
                  }
                  Insert: {
                    "awarded_at"?: string,"awarded_by": string,"commitment_attestation"?: Json | null,"commitment_signed_at"?: string | null,"id"?: string,"justification": NonNullable<Json>,"quote_id": string,"revealed_at"?: string | null,"rfq_id": string,"status"?: Database["public"]['Enums']["award_status"],"unmasked_at"?: string | null,"unmasked_by"?: string | null,"vote_snapshot"?: NonNullable<Json>,"votes_locked_at"?: string | null
                  }
                  Update: {
                    "awarded_at"?: string,"awarded_by"?: string,"commitment_attestation"?: Json | null,"commitment_signed_at"?: string | null,"id"?: string,"justification"?: NonNullable<Json>,"quote_id"?: string,"revealed_at"?: string | null,"rfq_id"?: string,"status"?: Database["public"]['Enums']["award_status"],"unmasked_at"?: string | null,"unmasked_by"?: string | null,"vote_snapshot"?: NonNullable<Json>,"votes_locked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "awards_awarded_by_fkey"
      columns: ["awarded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "awards_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "awards_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "awards_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "awards_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "awards_unmasked_by_fkey"
      columns: ["unmasked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bank_reconciliation_records": {
                  Row: {
                    "amount_difference": number,"bank_cleared_amount": number,"bank_cleared_date": string,"bank_name": string | null,"bank_reference": string | null,"buyer_recorded_amount": number,"buyer_recorded_date": string | null,"created_at": string,"date_drift_days": number,"discrepancy_details": string | null,"discrepancy_type": string,"id": string,"organization_id": string,"payment_id": string | null,"reconciled_at": string | null,"reconciled_by": string | null,"resolution_notes": string | null,"status": string,"updated_at": string,"utr_number": string
                  }
                  Insert: {
                    "amount_difference"?: number,"bank_cleared_amount"?: number,"bank_cleared_date": string,"bank_name"?: string | null,"bank_reference"?: string | null,"buyer_recorded_amount"?: number,"buyer_recorded_date"?: string | null,"created_at"?: string,"date_drift_days"?: number,"discrepancy_details"?: string | null,"discrepancy_type"?: string,"id"?: string,"organization_id": string,"payment_id"?: string | null,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"resolution_notes"?: string | null,"status"?: string,"updated_at"?: string,"utr_number": string
                  }
                  Update: {
                    "amount_difference"?: number,"bank_cleared_amount"?: number,"bank_cleared_date"?: string,"bank_name"?: string | null,"bank_reference"?: string | null,"buyer_recorded_amount"?: number,"buyer_recorded_date"?: string | null,"created_at"?: string,"date_drift_days"?: number,"discrepancy_details"?: string | null,"discrepancy_type"?: string,"id"?: string,"organization_id"?: string,"payment_id"?: string | null,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"resolution_notes"?: string | null,"status"?: string,"updated_at"?: string,"utr_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_reconciliation_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bank_reconciliation_records_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bank_reconciliation_records_reconciled_by_fkey"
      columns: ["reconciled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_addresses": {
                  Row: {
                    "address_line1": string,"address_line2": string | null,"address_type": string,"city": string,"contact_person": string | null,"contact_phone": string | null,"country": string,"created_at": string,"id": string,"is_active": boolean,"is_primary": boolean,"label": string,"landmark": string | null,"organization_id": string | null,"pincode": string,"profile_id": string | null,"state": string,"state_code": string | null,"updated_at": string
                  }
                  Insert: {
                    "address_line1": string,"address_line2"?: string | null,"address_type"?: string,"city": string,"contact_person"?: string | null,"contact_phone"?: string | null,"country"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"label"?: string,"landmark"?: string | null,"organization_id"?: string | null,"pincode": string,"profile_id"?: string | null,"state": string,"state_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address_line1"?: string,"address_line2"?: string | null,"address_type"?: string,"city"?: string,"contact_person"?: string | null,"contact_phone"?: string | null,"country"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"label"?: string,"landmark"?: string | null,"organization_id"?: string | null,"pincode"?: string,"profile_id"?: string | null,"state"?: string,"state_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "buyer_addresses_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buyer_addresses_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_reward_allocations": {
                  Row: {
                    "created_at": string,"fee_amount": number,"fee_rate": number,"id": string,"invoice_id": string | null,"organization_id": string,"platform_fee_tx_id": string | null,"procurement_base_amount": number,"purchase_order_id": string | null,"reward_amount": number,"reward_share_rate": number,"settlement_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"fee_amount": number,"fee_rate": number,"id"?: string,"invoice_id"?: string | null,"organization_id": string,"platform_fee_tx_id"?: string | null,"procurement_base_amount": number,"purchase_order_id"?: string | null,"reward_amount": number,"reward_share_rate": number,"settlement_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"fee_amount"?: number,"fee_rate"?: number,"id"?: string,"invoice_id"?: string | null,"organization_id"?: string,"platform_fee_tx_id"?: string | null,"procurement_base_amount"?: number,"purchase_order_id"?: string | null,"reward_amount"?: number,"reward_share_rate"?: number,"settlement_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "buyer_reward_allocations_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buyer_reward_allocations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buyer_reward_allocations_platform_fee_tx_id_fkey"
      columns: ["platform_fee_tx_id"]
isOneToOne: true
      referencedRelation: "platform_fee_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buyer_reward_allocations_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"buyer_type_config": {
                  Row: {
                    "default_committee_size": number,"description": string | null,"label": string,"org_type": Database["public"]['Enums']["org_type"],"sort_order": number,"updated_at": string,"voting_power": number
                  }
                  Insert: {
                    "default_committee_size"?: number,"description"?: string | null,"label": string,"org_type": Database["public"]['Enums']["org_type"],"sort_order"?: number,"updated_at"?: string,"voting_power": number
                  }
                  Update: {
                    "default_committee_size"?: number,"description"?: string | null,"label"?: string,"org_type"?: Database["public"]['Enums']["org_type"],"sort_order"?: number,"updated_at"?: string,"voting_power"?: number
                  }
                  Relationships: [

                  ]
                },"capabilities": {
                  Row: {
                    "capacity_attribute_code": string | null,"capacity_unit": string | null,"code": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "capacity_attribute_code"?: string | null,"capacity_unit"?: string | null,"code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "capacity_attribute_code"?: string | null,"capacity_unit"?: string | null,"code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"category_attribute_definitions": {
                  Row: {
                    "applies_to_modes": (Database["public"]['Enums']["requirement_mode"])[],"category_id": string | null,"code": string,"created_at": string,"data_type": Database["public"]['Enums']["attribute_data_type"],"help_text": string | null,"id": string,"is_active": boolean,"is_required": boolean,"label": string,"match_patterns": (string)[],"options": NonNullable<Json>,"placeholder": string | null,"sort_order": number,"subcategory_id": string | null,"unit": string | null,"updated_at": string,"validation": NonNullable<Json>
                  }
                  Insert: {
                    "applies_to_modes"?: (Database["public"]['Enums']["requirement_mode"])[],"category_id"?: string | null,"code": string,"created_at"?: string,"data_type": Database["public"]['Enums']["attribute_data_type"],"help_text"?: string | null,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"label": string,"match_patterns"?: (string)[],"options"?: NonNullable<Json>,"placeholder"?: string | null,"sort_order"?: number,"subcategory_id"?: string | null,"unit"?: string | null,"updated_at"?: string,"validation"?: NonNullable<Json>
                  }
                  Update: {
                    "applies_to_modes"?: (Database["public"]['Enums']["requirement_mode"])[],"category_id"?: string | null,"code"?: string,"created_at"?: string,"data_type"?: Database["public"]['Enums']["attribute_data_type"],"help_text"?: string | null,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"label"?: string,"match_patterns"?: (string)[],"options"?: NonNullable<Json>,"placeholder"?: string | null,"sort_order"?: number,"subcategory_id"?: string | null,"unit"?: string | null,"updated_at"?: string,"validation"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_attribute_definitions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "requirement_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "category_attribute_definitions_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "requirement_subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"committee_assignments": {
                  Row: {
                    "assigned_at": string,"id": string,"profile_id": string,"rfq_id": string
                  }
                  Insert: {
                    "assigned_at"?: string,"id"?: string,"profile_id": string,"rfq_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"id"?: string,"profile_id"?: string,"rfq_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "committee_assignments_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_assignments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"committee_votes": {
                  Row: {
                    "buyer_type": Database["public"]['Enums']["org_type"] | null,"cast_at": string,"choice": Database["public"]['Enums']["vote_choice"],"comment": string | null,"id": string,"locked_at": string | null,"profile_id": string,"recommended_quote_id": string | null,"rfq_id": string,"voting_power": number | null
                  }
                  Insert: {
                    "buyer_type"?: Database["public"]['Enums']["org_type"] | null,"cast_at"?: string,"choice": Database["public"]['Enums']["vote_choice"],"comment"?: string | null,"id"?: string,"locked_at"?: string | null,"profile_id": string,"recommended_quote_id"?: string | null,"rfq_id": string,"voting_power"?: number | null
                  }
                  Update: {
                    "buyer_type"?: Database["public"]['Enums']["org_type"] | null,"cast_at"?: string,"choice"?: Database["public"]['Enums']["vote_choice"],"comment"?: string | null,"id"?: string,"locked_at"?: string | null,"profile_id"?: string,"recommended_quote_id"?: string | null,"rfq_id"?: string,"voting_power"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "committee_votes_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"conflict_of_interest_declarations": {
                  Row: {
                    "declared_at": string,"description": string | null,"id": string,"profile_id": string,"rfq_id": string,"status": Database["public"]['Enums']["coi_status"],"waived_at": string | null,"waived_by": string | null
                  }
                  Insert: {
                    "declared_at"?: string,"description"?: string | null,"id"?: string,"profile_id": string,"rfq_id": string,"status": Database["public"]['Enums']["coi_status"],"waived_at"?: string | null,"waived_by"?: string | null
                  }
                  Update: {
                    "declared_at"?: string,"description"?: string | null,"id"?: string,"profile_id"?: string,"rfq_id"?: string,"status"?: Database["public"]['Enums']["coi_status"],"waived_at"?: string | null,"waived_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conflict_of_interest_declarations_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "conflict_of_interest_declarations_waived_by_fkey"
      columns: ["waived_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_enquiries": {
                  Row: {
                    "category": string,"created_at": string,"email": string,"id": string,"message": string,"name": string,"notification_attempted_at": string | null,"notification_status": string,"organisation": string | null,"payload_fingerprint": string,"phone": string | null,"reference": string,"retention_expires_at": string,"status": string,"subject": string,"submission_id": string,"updated_at": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"email": string,"id"?: string,"message": string,"name": string,"notification_attempted_at"?: string | null,"notification_status"?: string,"organisation"?: string | null,"payload_fingerprint": string,"phone"?: string | null,"reference": string,"retention_expires_at"?: string,"status"?: string,"subject": string,"submission_id": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"email"?: string,"id"?: string,"message"?: string,"name"?: string,"notification_attempted_at"?: string | null,"notification_status"?: string,"organisation"?: string | null,"payload_fingerprint"?: string,"phone"?: string | null,"reference"?: string,"retention_expires_at"?: string,"status"?: string,"subject"?: string,"submission_id"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"contact_enquiry_rate_limits": {
                  Row: {
                    "bucket_key": string,"id": string,"occurred_at": string,"scope": string
                  }
                  Insert: {
                    "bucket_key": string,"id"?: string,"occurred_at"?: string,"scope": string
                  }
                  Update: {
                    "bucket_key"?: string,"id"?: string,"occurred_at"?: string,"scope"?: string
                  }
                  Relationships: [

                  ]
                },"credit_debit_notes": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"invoice_id": string,"note_number": string,"note_type": string,"organization_id": string,"purchase_order_id": string | null,"reason": string,"status": string,"tax_amount": number,"updated_at": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id": string,"note_number": string,"note_type": string,"organization_id": string,"purchase_order_id"?: string | null,"reason": string,"status"?: string,"tax_amount"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id"?: string,"note_number"?: string,"note_type"?: string,"organization_id"?: string,"purchase_order_id"?: string | null,"reason"?: string,"status"?: string,"tax_amount"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_debit_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_debit_notes_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_debit_notes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_debit_notes_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_inspections": {
                  Row: {
                    "checklist_results": NonNullable<Json>,"created_at": string,"digital_signoff_hash": string,"id": string,"inspector_id": string,"passed": boolean,"rating_given": number | null,"work_order_id": string
                  }
                  Insert: {
                    "checklist_results"?: NonNullable<Json>,"created_at"?: string,"digital_signoff_hash": string,"id"?: string,"inspector_id": string,"passed": boolean,"rating_given"?: number | null,"work_order_id": string
                  }
                  Update: {
                    "checklist_results"?: NonNullable<Json>,"created_at"?: string,"digital_signoff_hash"?: string,"id"?: string,"inspector_id"?: string,"passed"?: boolean,"rating_given"?: number | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_inspections_inspector_id_fkey"
      columns: ["inspector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_inspections_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"demo_accounts": {
                  Row: {
                    "created_at": string,"description": string | null,"email": string,"id": string,"is_active": boolean,"label": string,"organization_id": string | null,"persona": string,"profile_id": string | null,"scenario_code": string | null,"sort_order": number,"supplier_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"email": string,"id"?: string,"is_active"?: boolean,"label": string,"organization_id"?: string | null,"persona": string,"profile_id"?: string | null,"scenario_code"?: string | null,"sort_order"?: number,"supplier_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"email"?: string,"id"?: string,"is_active"?: boolean,"label"?: string,"organization_id"?: string | null,"persona"?: string,"profile_id"?: string | null,"scenario_code"?: string | null,"sort_order"?: number,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "demo_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_accounts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_accounts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"demo_price_anchors": {
                  Row: {
                    "base_amount": number,"code": string | null,"id": string,"per_unit": boolean,"scope": string,"spread": number,"unit_hint": string | null
                  }
                  Insert: {
                    "base_amount": number,"code"?: string | null,"id"?: string,"per_unit"?: boolean,"scope": string,"spread"?: number,"unit_hint"?: string | null
                  }
                  Update: {
                    "base_amount"?: number,"code"?: string | null,"id"?: string,"per_unit"?: boolean,"scope"?: string,"spread"?: number,"unit_hint"?: string | null
                  }
                  Relationships: [

                  ]
                },"demo_scenarios": {
                  Row: {
                    "buyer_type": Database["public"]['Enums']["org_type"],"code": string,"created_at": string,"invite_limit": number,"narrative": string,"organization_id": string | null,"requirement_id": string | null,"rfq_id": string | null,"sort_order": number,"stage_label": string,"target_stage": string,"title": string
                  }
                  Insert: {
                    "buyer_type": Database["public"]['Enums']["org_type"],"code": string,"created_at"?: string,"invite_limit"?: number,"narrative": string,"organization_id"?: string | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"sort_order"?: number,"stage_label": string,"target_stage"?: string,"title": string
                  }
                  Update: {
                    "buyer_type"?: Database["public"]['Enums']["org_type"],"code"?: string,"created_at"?: string,"invite_limit"?: number,"narrative"?: string,"organization_id"?: string | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"sort_order"?: number,"stage_label"?: string,"target_stage"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "demo_scenarios_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_scenarios_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"demo_settings": {
                  Row: {
                    "current_run_id": string,"demo_mode_enabled": boolean,"demo_seed": string,"id": boolean,"last_reset_at": string | null,"maintenance_message": string | null,"maintenance_mode_enabled": boolean,"supplier_network_stub_enabled": boolean,"updated_at": string
                  }
                  Insert: {
                    "current_run_id"?: string,"demo_mode_enabled"?: boolean,"demo_seed"?: string,"id"?: boolean,"last_reset_at"?: string | null,"maintenance_message"?: string | null,"maintenance_mode_enabled"?: boolean,"supplier_network_stub_enabled"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "current_run_id"?: string,"demo_mode_enabled"?: boolean,"demo_seed"?: string,"id"?: boolean,"last_reset_at"?: string | null,"maintenance_message"?: string | null,"maintenance_mode_enabled"?: boolean,"supplier_network_stub_enabled"?: boolean,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"direct_supplier_invites": {
                  Row: {
                    "contact_kind": string,"contact_value": string,"created_at": string,"id": string,"invitation_id": string,"invited_by": string,"organization_id": string,"rfq_id": string,"supplier_id": string
                  }
                  Insert: {
                    "contact_kind": string,"contact_value": string,"created_at"?: string,"id"?: string,"invitation_id": string,"invited_by": string,"organization_id": string,"rfq_id": string,"supplier_id": string
                  }
                  Update: {
                    "contact_kind"?: string,"contact_value"?: string,"created_at"?: string,"id"?: string,"invitation_id"?: string,"invited_by"?: string,"organization_id"?: string,"rfq_id"?: string,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "direct_supplier_invites_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "direct_supplier_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_supplier_invites_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "direct_supplier_invites_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"dispute_events": {
                  Row: {
                    "actor_id": string,"actor_role": string,"created_at": string,"dispute_id": string,"event_type": string,"id": string,"new_escalation_level": number | null,"new_status": string | null,"notes": string | null,"payload": NonNullable<Json>,"previous_escalation_level": number | null,"previous_status": string | null
                  }
                  Insert: {
                    "actor_id": string,"actor_role": string,"created_at"?: string,"dispute_id": string,"event_type": string,"id"?: string,"new_escalation_level"?: number | null,"new_status"?: string | null,"notes"?: string | null,"payload"?: NonNullable<Json>,"previous_escalation_level"?: number | null,"previous_status"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"actor_role"?: string,"created_at"?: string,"dispute_id"?: string,"event_type"?: string,"id"?: string,"new_escalation_level"?: number | null,"new_status"?: string | null,"notes"?: string | null,"payload"?: NonNullable<Json>,"previous_escalation_level"?: number | null,"previous_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispute_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispute_events_dispute_id_fkey"
      columns: ["dispute_id"]
isOneToOne: false
      referencedRelation: "disputes"
      referencedColumns: ["id"]
    }
                  ]
                },"dispute_evidence": {
                  Row: {
                    "created_at": string,"description": string | null,"dispute_id": string,"file_name": string,"file_size_bytes": number,"file_url": string,"id": string,"is_immutable": boolean,"mime_type": string,"sha256_hash": string,"uploaded_by": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"dispute_id": string,"file_name": string,"file_size_bytes": number,"file_url": string,"id"?: string,"is_immutable"?: boolean,"mime_type": string,"sha256_hash": string,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"dispute_id"?: string,"file_name"?: string,"file_size_bytes"?: number,"file_url"?: string,"id"?: string,"is_immutable"?: boolean,"mime_type"?: string,"sha256_hash"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispute_evidence_dispute_id_fkey"
      columns: ["dispute_id"]
isOneToOne: false
      referencedRelation: "disputes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispute_evidence_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"disputes": {
                  Row: {
                    "assigned_to": string | null,"category": string,"counterparty_organization_id": string | null,"created_at": string,"currency": string,"description": string,"dispute_number": string,"disputed_amount": number,"entity_id": string,"entity_type": string,"escalation_level": number,"id": string,"opened_by": string,"organization_id": string,"resolution_category": string | null,"resolution_summary": string | null,"resolved_at": string | null,"resolved_by": string | null,"severity": string,"sla_deadline": string,"status": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "assigned_to"?: string | null,"category": string,"counterparty_organization_id"?: string | null,"created_at"?: string,"currency"?: string,"description": string,"dispute_number": string,"disputed_amount"?: number,"entity_id": string,"entity_type": string,"escalation_level"?: number,"id"?: string,"opened_by": string,"organization_id": string,"resolution_category"?: string | null,"resolution_summary"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"sla_deadline": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"category"?: string,"counterparty_organization_id"?: string | null,"created_at"?: string,"currency"?: string,"description"?: string,"dispute_number"?: string,"disputed_amount"?: number,"entity_id"?: string,"entity_type"?: string,"escalation_level"?: number,"id"?: string,"opened_by"?: string,"organization_id"?: string,"resolution_category"?: string | null,"resolution_summary"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"sla_deadline"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "disputes_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_counterparty_organization_id_fkey"
      columns: ["counterparty_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_opened_by_fkey"
      columns: ["opened_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"erp_export_manifests": {
                  Row: {
                    "batch_reference": string,"created_at": string,"export_type": string,"export_version": number,"exported_at": string,"exported_by": string | null,"id": string,"organization_id": string,"payload_checksum_sha256": string,"payment_id": string | null,"purchase_order_id": string | null,"record_count": number,"total_amount": number
                  }
                  Insert: {
                    "batch_reference": string,"created_at"?: string,"export_type": string,"export_version"?: number,"exported_at"?: string,"exported_by"?: string | null,"id"?: string,"organization_id": string,"payload_checksum_sha256": string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"record_count": number,"total_amount": number
                  }
                  Update: {
                    "batch_reference"?: string,"created_at"?: string,"export_type"?: string,"export_version"?: number,"exported_at"?: string,"exported_by"?: string | null,"id"?: string,"organization_id"?: string,"payload_checksum_sha256"?: string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"record_count"?: number,"total_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "erp_export_manifests_exported_by_fkey"
      columns: ["exported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "erp_export_manifests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "erp_export_manifests_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "erp_export_manifests_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"evaluation_criteria": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"direction": Database["public"]['Enums']["criterion_direction"],"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string,"value_source": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"direction": Database["public"]['Enums']["criterion_direction"],"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string,"value_source": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"direction"?: Database["public"]['Enums']["criterion_direction"],"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string,"value_source"?: string
                  }
                  Relationships: [

                  ]
                },"google_places_daily_budget": {
                  Row: {
                    "request_count": number,"usage_date": string
                  }
                  Insert: {
                    "request_count"?: number,"usage_date"?: string
                  }
                  Update: {
                    "request_count"?: number,"usage_date"?: string
                  }
                  Relationships: [

                  ]
                },"internal_group_permissions": {
                  Row: {
                    "group_id": string,"permission_id": string
                  }
                  Insert: {
                    "group_id": string,"permission_id": string
                  }
                  Update: {
                    "group_id"?: string,"permission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_group_permissions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "internal_permission_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_group_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "internal_permissions"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_profile_id": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invitation_token_hash": string,"invited_by": string,"revocation_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"role_id": string,"status": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_profile_id"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invitation_token_hash": string,"invited_by": string,"revocation_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"role_id": string,"status"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_profile_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invitation_token_hash"?: string,"invited_by"?: string,"revocation_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"role_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_invitations_accepted_profile_id_fkey"
      columns: ["accepted_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_invitations_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_invitations_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "internal_roles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_permission_groups": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"name": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [

                  ]
                },"internal_permissions": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"name": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [

                  ]
                },"internal_referral_achievements": {
                  Row: {
                    "authorized_at": string | null,"authorized_by": string | null,"awarded_amount_inr": number | null,"created_at": string,"employee_profile_id": string,"id": string,"plan_id": string,"referral_code": string,"referred_organization_id": string | null,"referred_supplier_id": string | null,"rejection_reason": string | null,"settled_at": string | null,"status": string,"target_kind": string
                  }
                  Insert: {
                    "authorized_at"?: string | null,"authorized_by"?: string | null,"awarded_amount_inr"?: number | null,"created_at"?: string,"employee_profile_id": string,"id"?: string,"plan_id": string,"referral_code": string,"referred_organization_id"?: string | null,"referred_supplier_id"?: string | null,"rejection_reason"?: string | null,"settled_at"?: string | null,"status"?: string,"target_kind": string
                  }
                  Update: {
                    "authorized_at"?: string | null,"authorized_by"?: string | null,"awarded_amount_inr"?: number | null,"created_at"?: string,"employee_profile_id"?: string,"id"?: string,"plan_id"?: string,"referral_code"?: string,"referred_organization_id"?: string | null,"referred_supplier_id"?: string | null,"rejection_reason"?: string | null,"settled_at"?: string | null,"status"?: string,"target_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_referral_achievements_authorized_by_fkey"
      columns: ["authorized_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_achievements_employee_profile_id_fkey"
      columns: ["employee_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_achievements_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "internal_referral_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_achievements_referred_organization_id_fkey"
      columns: ["referred_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_achievements_referred_supplier_id_fkey"
      columns: ["referred_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_referral_payouts": {
                  Row: {
                    "achievement_id": string,"cancellation_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"employee_profile_id": string,"finance_reference_id": string | null,"id": string,"payout_amount_inr": number,"processed_at": string | null,"processed_by": string | null,"reconciliation_evidence": Json | null,"status": string
                  }
                  Insert: {
                    "achievement_id": string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"employee_profile_id": string,"finance_reference_id"?: string | null,"id"?: string,"payout_amount_inr": number,"processed_at"?: string | null,"processed_by"?: string | null,"reconciliation_evidence"?: Json | null,"status"?: string
                  }
                  Update: {
                    "achievement_id"?: string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"employee_profile_id"?: string,"finance_reference_id"?: string | null,"id"?: string,"payout_amount_inr"?: number,"processed_at"?: string | null,"processed_by"?: string | null,"reconciliation_evidence"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_referral_payouts_achievement_id_fkey"
      columns: ["achievement_id"]
isOneToOne: false
      referencedRelation: "internal_referral_achievements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_payouts_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_payouts_employee_profile_id_fkey"
      columns: ["employee_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_referral_payouts_processed_by_fkey"
      columns: ["processed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_referral_plans": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"description": string | null,"fixed_bonus_inr": number | null,"id": string,"is_active": boolean,"title": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"fixed_bonus_inr"?: number | null,"id"?: string,"is_active"?: boolean,"title": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"fixed_bonus_inr"?: number | null,"id"?: string,"is_active"?: boolean,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_referral_plans_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_roles": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"is_system": boolean,"name": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_system"?: boolean,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_system"?: boolean,"name"?: string
                  }
                  Relationships: [

                  ]
                },"internal_user_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"id": string,"profile_id": string,"role_id": string
                  }
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"id"?: string,"profile_id": string,"role_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"id"?: string,"profile_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_user_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_assignments_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_assignments_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "internal_roles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_user_explicit_grants": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"permission_id": string,"profile_id": string
                  }
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"permission_id": string,"profile_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"permission_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_user_explicit_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_explicit_grants_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "internal_permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_explicit_grants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_user_group_memberships": {
                  Row: {
                    "group_id": string,"profile_id": string
                  }
                  Insert: {
                    "group_id": string,"profile_id": string
                  }
                  Update: {
                    "group_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_user_group_memberships_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "internal_permission_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_group_memberships_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_user_restrictions": {
                  Row: {
                    "permission_id": string,"profile_id": string,"restricted_at": string,"restricted_by": string | null
                  }
                  Insert: {
                    "permission_id": string,"profile_id": string,"restricted_at"?: string,"restricted_by"?: string | null
                  }
                  Update: {
                    "permission_id"?: string,"profile_id"?: string,"restricted_at"?: string,"restricted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_user_restrictions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "internal_permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_restrictions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_user_restrictions_restricted_by_fkey"
      columns: ["restricted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_line_items": {
                  Row: {
                    "cgst_amount": number,"cgst_rate": number,"created_at": string,"description": string,"gst_amount": number,"hsn_code": string | null,"id": string,"igst_amount": number,"igst_rate": number,"invoice_id": string,"line_index": number,"milestone_id": string | null,"po_line_item_id": string | null,"quantity": number,"sgst_amount": number,"sgst_rate": number,"taxable_amount": number,"total_amount": number,"unit_price": number,"updated_at": string,"utgst_amount": number,"utgst_rate": number
                  }
                  Insert: {
                    "cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"description": string,"gst_amount"?: number,"hsn_code"?: string | null,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"invoice_id": string,"line_index": number,"milestone_id"?: string | null,"po_line_item_id"?: string | null,"quantity": number,"sgst_amount"?: number,"sgst_rate"?: number,"taxable_amount": number,"total_amount": number,"unit_price": number,"updated_at"?: string,"utgst_amount"?: number,"utgst_rate"?: number
                  }
                  Update: {
                    "cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"description"?: string,"gst_amount"?: number,"hsn_code"?: string | null,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"invoice_id"?: string,"line_index"?: number,"milestone_id"?: string | null,"po_line_item_id"?: string | null,"quantity"?: number,"sgst_amount"?: number,"sgst_rate"?: number,"taxable_amount"?: number,"total_amount"?: number,"unit_price"?: number,"updated_at"?: string,"utgst_amount"?: number,"utgst_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_line_items_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_line_items_milestone_id_fkey"
      columns: ["milestone_id"]
isOneToOne: false
      referencedRelation: "work_order_milestones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_line_items_po_line_item_id_fkey"
      columns: ["po_line_item_id"]
isOneToOne: false
      referencedRelation: "purchase_order_line_items"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount": number,"approved_at": string | null,"balance_due": number,"cgst_total": number,"created_at": string,"currency": string,"document_url": string | null,"id": string,"igst_total": number,"invoice_number": string,"invoice_type": string,"is_demo": boolean,"milestone_id": string | null,"paid_amount": number,"place_of_supply_basis": string | null,"place_of_supply_state_code": string | null,"purchase_order_id": string | null,"sgst_total": number,"status": Database["public"]['Enums']["invoice_status"],"submitted_at": string,"supplier_id": string,"tax_snapshot": Json | null,"taxable_total": number,"updated_at": string,"utgst_total": number,"work_order_id": string
                  }
                  Insert: {
                    "amount": number,"approved_at"?: string | null,"balance_due"?: number,"cgst_total"?: number,"created_at"?: string,"currency"?: string,"document_url"?: string | null,"id"?: string,"igst_total"?: number,"invoice_number": string,"invoice_type"?: string,"is_demo"?: boolean,"milestone_id"?: string | null,"paid_amount"?: number,"place_of_supply_basis"?: string | null,"place_of_supply_state_code"?: string | null,"purchase_order_id"?: string | null,"sgst_total"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string,"supplier_id": string,"tax_snapshot"?: Json | null,"taxable_total"?: number,"updated_at"?: string,"utgst_total"?: number,"work_order_id": string
                  }
                  Update: {
                    "amount"?: number,"approved_at"?: string | null,"balance_due"?: number,"cgst_total"?: number,"created_at"?: string,"currency"?: string,"document_url"?: string | null,"id"?: string,"igst_total"?: number,"invoice_number"?: string,"invoice_type"?: string,"is_demo"?: boolean,"milestone_id"?: string | null,"paid_amount"?: number,"place_of_supply_basis"?: string | null,"place_of_supply_state_code"?: string | null,"purchase_order_id"?: string | null,"sgst_total"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string,"supplier_id"?: string,"tax_snapshot"?: Json | null,"taxable_total"?: number,"updated_at"?: string,"utgst_total"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_milestone_id_fkey"
      columns: ["milestone_id"]
isOneToOne: false
      referencedRelation: "work_order_milestones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"issued_document_id_counters": {
                  Row: {
                    "counter_key": string,"last_value": number,"organization_id": string,"updated_at": string
                  }
                  Insert: {
                    "counter_key": string,"last_value"?: number,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "counter_key"?: string,"last_value"?: number,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issued_document_id_counters_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"issued_document_personal_counters": {
                  Row: {
                    "counter_key": string,"last_value": number,"owner_profile_id": string,"updated_at": string
                  }
                  Insert: {
                    "counter_key": string,"last_value"?: number,"owner_profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "counter_key"?: string,"last_value"?: number,"owner_profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issued_document_personal_counters_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"issued_document_snapshots": {
                  Row: {
                    "created_at": string,"document_id": string,"document_kind": string,"document_number": string,"generated_at": string,"generated_by": string | null,"id": string,"idempotency_key": string,"identity_state": string,"organization_id": string | null,"owner_profile_id": string | null,"payload_json": NonNullable<Json>,"persona": string,"perspective": string,"schema_version": string,"source_entity_id": string,"source_entity_type": string,"source_supplier_id": string | null,"status": string,"supersedes_document_id": string | null,"template_version": string,"transaction_refs": NonNullable<Json>,"verification_algorithm": string,"verification_digest": string,"verification_ref": string | null,"visibility_context": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"document_id": string,"document_kind": string,"document_number": string,"generated_at": string,"generated_by"?: string | null,"id"?: string,"idempotency_key": string,"identity_state": string,"organization_id"?: string | null,"owner_profile_id"?: string | null,"payload_json": NonNullable<Json>,"persona": string,"perspective": string,"schema_version"?: string,"source_entity_id": string,"source_entity_type": string,"source_supplier_id"?: string | null,"status"?: string,"supersedes_document_id"?: string | null,"template_version"?: string,"transaction_refs"?: NonNullable<Json>,"verification_algorithm": string,"verification_digest": string,"verification_ref"?: string | null,"visibility_context"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"document_kind"?: string,"document_number"?: string,"generated_at"?: string,"generated_by"?: string | null,"id"?: string,"idempotency_key"?: string,"identity_state"?: string,"organization_id"?: string | null,"owner_profile_id"?: string | null,"payload_json"?: NonNullable<Json>,"persona"?: string,"perspective"?: string,"schema_version"?: string,"source_entity_id"?: string,"source_entity_type"?: string,"source_supplier_id"?: string | null,"status"?: string,"supersedes_document_id"?: string | null,"template_version"?: string,"transaction_refs"?: NonNullable<Json>,"verification_algorithm"?: string,"verification_digest"?: string,"verification_ref"?: string | null,"visibility_context"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "issued_document_snapshots_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_snapshots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_snapshots_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_snapshots_source_supplier_id_fkey"
      columns: ["source_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_snapshots_supersedes_document_id_fkey"
      columns: ["supersedes_document_id"]
isOneToOne: false
      referencedRelation: "issued_document_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"issued_document_status_audits": {
                  Row: {
                    "audit_event_id": string | null,"changed_at": string,"changed_by": string | null,"id": string,"new_status": string,"previous_status": string,"reason": string,"snapshot_id": string
                  }
                  Insert: {
                    "audit_event_id"?: string | null,"changed_at"?: string,"changed_by"?: string | null,"id"?: string,"new_status": string,"previous_status": string,"reason": string,"snapshot_id": string
                  }
                  Update: {
                    "audit_event_id"?: string | null,"changed_at"?: string,"changed_by"?: string | null,"id"?: string,"new_status"?: string,"previous_status"?: string,"reason"?: string,"snapshot_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issued_document_status_audits_audit_event_id_fkey"
      columns: ["audit_event_id"]
isOneToOne: false
      referencedRelation: "audit_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_status_audits_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issued_document_status_audits_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "issued_document_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_entries": {
                  Row: {
                    "created_at": string,"entry_date": string,"entry_type": string,"id": string,"idempotency_key": string | null,"journal_number": string,"narration": string,"organization_id": string,"period_id": string,"posted_at": string,"posted_by": string | null,"reversal_reason": string | null,"reversed_by_journal_id": string | null,"reverses_journal_id": string | null,"source_entity_id": string | null,"source_entity_type": string | null,"status": string,"total_credit": number,"total_debit": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"entry_date"?: string,"entry_type": string,"id"?: string,"idempotency_key"?: string | null,"journal_number": string,"narration": string,"organization_id": string,"period_id": string,"posted_at"?: string,"posted_by"?: string | null,"reversal_reason"?: string | null,"reversed_by_journal_id"?: string | null,"reverses_journal_id"?: string | null,"source_entity_id"?: string | null,"source_entity_type"?: string | null,"status"?: string,"total_credit"?: number,"total_debit"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"entry_date"?: string,"entry_type"?: string,"id"?: string,"idempotency_key"?: string | null,"journal_number"?: string,"narration"?: string,"organization_id"?: string,"period_id"?: string,"posted_at"?: string,"posted_by"?: string | null,"reversal_reason"?: string | null,"reversed_by_journal_id"?: string | null,"reverses_journal_id"?: string | null,"source_entity_id"?: string | null,"source_entity_type"?: string | null,"status"?: string,"total_credit"?: number,"total_debit"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_entries_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "accounting_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_posted_by_fkey"
      columns: ["posted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_reversed_by_journal_id_fkey"
      columns: ["reversed_by_journal_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_reverses_journal_id_fkey"
      columns: ["reverses_journal_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_lines": {
                  Row: {
                    "account_id": string,"created_at": string,"credit_amount": number,"currency": string,"debit_amount": number,"description": string | null,"id": string,"invoice_id": string | null,"journal_entry_id": string,"line_number": number,"payment_id": string | null,"purchase_order_id": string | null,"supplier_id": string | null
                  }
                  Insert: {
                    "account_id": string,"created_at"?: string,"credit_amount"?: number,"currency"?: string,"debit_amount"?: number,"description"?: string | null,"id"?: string,"invoice_id"?: string | null,"journal_entry_id": string,"line_number": number,"payment_id"?: string | null,"purchase_order_id"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"credit_amount"?: number,"currency"?: string,"debit_amount"?: number,"description"?: string | null,"id"?: string,"invoice_id"?: string | null,"journal_entry_id"?: string,"line_number"?: number,"payment_id"?: string | null,"purchase_order_id"?: string | null,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_journal_entry_id_fkey"
      columns: ["journal_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_accounts": {
                  Row: {
                    "account_code": string,"account_name": string,"classification": string,"created_at": string,"currency": string,"description": string | null,"id": string,"is_system_account": boolean,"organization_id": string,"status": string,"subtype": string,"updated_at": string
                  }
                  Insert: {
                    "account_code": string,"account_name": string,"classification": string,"created_at"?: string,"currency"?: string,"description"?: string | null,"id"?: string,"is_system_account"?: boolean,"organization_id": string,"status"?: string,"subtype": string,"updated_at"?: string
                  }
                  Update: {
                    "account_code"?: string,"account_name"?: string,"classification"?: string,"created_at"?: string,"currency"?: string,"description"?: string | null,"id"?: string,"is_system_account"?: boolean,"organization_id"?: string,"status"?: string,"subtype"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_acceptance_archives": {
                  Row: {
                    "acceptance_id": string,"acceptance_source": string,"accepted_at": string,"agreement_type": string,"archive_id": string,"archived_at": string,"document_hash": string,"profile_id": string,"version": string
                  }
                  Insert: {
                    "acceptance_id": string,"acceptance_source": string,"accepted_at": string,"agreement_type": string,"archive_id"?: string,"archived_at"?: string,"document_hash": string,"profile_id": string,"version": string
                  }
                  Update: {
                    "acceptance_id"?: string,"acceptance_source"?: string,"accepted_at"?: string,"agreement_type"?: string,"archive_id"?: string,"archived_at"?: string,"document_hash"?: string,"profile_id"?: string,"version"?: string
                  }
                  Relationships: [

                  ]
                },"legal_acceptances": {
                  Row: {
                    "acceptance_source": string,"accepted_at": string,"agreement_type": string,"created_at": string,"document_hash": string,"id": string,"profile_id": string,"signup_request_id": string | null,"version": string
                  }
                  Insert: {
                    "acceptance_source": string,"accepted_at"?: string,"agreement_type": string,"created_at"?: string,"document_hash": string,"id"?: string,"profile_id": string,"signup_request_id"?: string | null,"version": string
                  }
                  Update: {
                    "acceptance_source"?: string,"accepted_at"?: string,"agreement_type"?: string,"created_at"?: string,"document_hash"?: string,"id"?: string,"profile_id"?: string,"signup_request_id"?: string | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_acceptances_agreement_type_version_fkey"
      columns: ["agreement_type","version"]
isOneToOne: false
      referencedRelation: "legal_document_versions"
      referencedColumns: ["agreement_type","version"]
    },{
      foreignKeyName: "legal_acceptances_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "legal_acceptances_signup_request_id_fkey"
      columns: ["signup_request_id"]
isOneToOne: false
      referencedRelation: "signup_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_agreement_approvals": {
                  Row: {
                    "agreement_type": string,"approver_profile_id": string,"decided_at": string,"decision": string,"decision_seq": number,"document_hash": string,"external_record_ref": string,"id": string,"notes": string | null,"snapshot_id": string,"version": string
                  }
                  Insert: {
                    "agreement_type": string,"approver_profile_id": string,"decided_at"?: string,"decision": string,"decision_seq"?: never,"document_hash": string,"external_record_ref": string,"id"?: string,"notes"?: string | null,"snapshot_id": string,"version": string
                  }
                  Update: {
                    "agreement_type"?: string,"approver_profile_id"?: string,"decided_at"?: string,"decision"?: string,"decision_seq"?: never,"document_hash"?: string,"external_record_ref"?: string,"id"?: string,"notes"?: string | null,"snapshot_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_agreement_approvals_approver_profile_id_fkey"
      columns: ["approver_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "legal_agreement_approvals_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "legal_document_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_document_snapshots": {
                  Row: {
                    "agreement_type": string,"body": string,"created_at": string,"document_hash": string,"id": string,"version": string
                  }
                  Insert: {
                    "agreement_type": string,"body": string,"created_at"?: string,"document_hash": string,"id"?: string,"version": string
                  }
                  Update: {
                    "agreement_type"?: string,"body"?: string,"created_at"?: string,"document_hash"?: string,"id"?: string,"version"?: string
                  }
                  Relationships: [

                  ]
                },"legal_document_versions": {
                  Row: {
                    "agreement_type": string,"audience": string | null,"content_ref": string | null,"created_at": string,"document_hash": string,"effective_from": string,"id": string,"legal_approval_status": string,"reacceptance_policy": string,"retired_at": string | null,"snapshot_id": string | null,"title": string,"version": string
                  }
                  Insert: {
                    "agreement_type": string,"audience"?: never,"content_ref"?: string | null,"created_at"?: string,"document_hash": string,"effective_from"?: string,"id"?: string,"legal_approval_status"?: string,"reacceptance_policy"?: string,"retired_at"?: string | null,"snapshot_id"?: string | null,"title": string,"version": string
                  }
                  Update: {
                    "agreement_type"?: string,"audience"?: never,"content_ref"?: string | null,"created_at"?: string,"document_hash"?: string,"effective_from"?: string,"id"?: string,"legal_approval_status"?: string,"reacceptance_policy"?: string,"retired_at"?: string | null,"snapshot_id"?: string | null,"title"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_document_versions_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "legal_document_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_enforcement_config": {
                  Row: {
                    "activated_at": string | null,"enforcement_enabled": boolean,"grace_customer_snapshot_id": string | null,"grace_days": number,"grace_supplier_snapshot_id": string | null,"rollout_at": string | null,"singleton": boolean,"updated_at": string
                  }
                  Insert: {
                    "activated_at"?: string | null,"enforcement_enabled"?: boolean,"grace_customer_snapshot_id"?: string | null,"grace_days"?: number,"grace_supplier_snapshot_id"?: string | null,"rollout_at"?: string | null,"singleton"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "activated_at"?: string | null,"enforcement_enabled"?: boolean,"grace_customer_snapshot_id"?: string | null,"grace_days"?: number,"grace_supplier_snapshot_id"?: string | null,"rollout_at"?: string | null,"singleton"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_enforcement_config_grace_customer_snapshot_id_fkey"
      columns: ["grace_customer_snapshot_id"]
isOneToOne: false
      referencedRelation: "legal_document_snapshots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "legal_enforcement_config_grace_supplier_snapshot_id_fkey"
      columns: ["grace_supplier_snapshot_id"]
isOneToOne: false
      referencedRelation: "legal_document_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_review_grants": {
                  Row: {
                    "can_activate": boolean,"can_authorize": boolean,"can_decide": boolean,"can_register": boolean,"external_record_ref": string,"granted_at": string,"profile_id": string,"revoked_at": string | null
                  }
                  Insert: {
                    "can_activate"?: boolean,"can_authorize"?: boolean,"can_decide"?: boolean,"can_register"?: boolean,"external_record_ref": string,"granted_at"?: string,"profile_id": string,"revoked_at"?: string | null
                  }
                  Update: {
                    "can_activate"?: boolean,"can_authorize"?: boolean,"can_decide"?: boolean,"can_register"?: boolean,"external_record_ref"?: string,"granted_at"?: string,"profile_id"?: string,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "legal_review_grants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"location_pin_coverage_generation": {
                  Row: {
                    "completed_at": string | null,"error_code": string | null,"last_error": string | null,"lock_token": string,"manual_retry_at": string | null,"max_retries": number,"next_attempt_at": string | null,"recovered_at": string | null,"retry_count": number,"scope_key": string,"started_at": string,"status": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"error_code"?: string | null,"last_error"?: string | null,"lock_token": string,"manual_retry_at"?: string | null,"max_retries"?: number,"next_attempt_at"?: string | null,"recovered_at"?: string | null,"retry_count"?: number,"scope_key": string,"started_at"?: string,"status": string
                  }
                  Update: {
                    "completed_at"?: string | null,"error_code"?: string | null,"last_error"?: string | null,"lock_token"?: string,"manual_retry_at"?: string | null,"max_retries"?: number,"next_attempt_at"?: string | null,"recovered_at"?: string | null,"retry_count"?: number,"scope_key"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [

                  ]
                },"location_pin_coverage_scope": {
                  Row: {
                    "category": string,"city": string,"last_successful_discovery_at": string | null,"pincode": string,"scope_key": string,"state": string,"supplier_count": number,"updated_at": string
                  }
                  Insert: {
                    "category": string,"city": string,"last_successful_discovery_at"?: string | null,"pincode": string,"scope_key": string,"state": string,"supplier_count"?: number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"city"?: string,"last_successful_discovery_at"?: string | null,"pincode"?: string,"scope_key"?: string,"state"?: string,"supplier_count"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"location_pin_coverage_supplier": {
                  Row: {
                    "first_seen_at": string,"id": string,"last_seen_at": string,"place_id": string,"scope_key": string,"supplier_json": NonNullable<Json>
                  }
                  Insert: {
                    "first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"place_id": string,"scope_key": string,"supplier_json": NonNullable<Json>
                  }
                  Update: {
                    "first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"place_id"?: string,"scope_key"?: string,"supplier_json"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_pin_coverage_supplier_scope_key_fkey"
      columns: ["scope_key"]
isOneToOne: false
      referencedRelation: "location_pin_coverage_scope"
      referencedColumns: ["scope_key"]
    }
                  ]
                },"market_intelligence_baselines": {
                  Row: {
                    "category_key": string,"historical_price_max": number | null,"historical_price_min": number | null,"id": string,"location_city": string | null,"notes": string | null,"sample_size": number,"supplier_performance_avg": number | null,"typical_delivery_days_max": number | null,"typical_delivery_days_min": number | null,"typical_warranty_months_max": number | null,"typical_warranty_months_min": number | null,"updated_at": string
                  }
                  Insert: {
                    "category_key": string,"historical_price_max"?: number | null,"historical_price_min"?: number | null,"id"?: string,"location_city"?: string | null,"notes"?: string | null,"sample_size"?: number,"supplier_performance_avg"?: number | null,"typical_delivery_days_max"?: number | null,"typical_delivery_days_min"?: number | null,"typical_warranty_months_max"?: number | null,"typical_warranty_months_min"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "category_key"?: string,"historical_price_max"?: number | null,"historical_price_min"?: number | null,"id"?: string,"location_city"?: string | null,"notes"?: string | null,"sample_size"?: number,"supplier_performance_avg"?: number | null,"typical_delivery_days_max"?: number | null,"typical_delivery_days_min"?: number | null,"typical_warranty_months_max"?: number | null,"typical_warranty_months_min"?: number | null,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"market_intelligence_snapshots": {
                  Row: {
                    "category_key": string,"confidence_level": string,"confidence_methodology": string,"confidence_score": number,"created_at": string,"fair_price_max": number | null,"fair_price_median": number | null,"fair_price_min": number | null,"fallback_reason": string | null,"freshness_status": string,"id": string,"is_fallback": boolean,"location_city": string | null,"network_reliability_score": number | null,"observed_at": string,"organization_id": string | null,"quote_variance_percent": number | null,"requirement_id": string | null,"rfq_id": string | null,"sample_size": number,"source_provider_name": string,"source_type": string,"typical_delivery_days_max": number | null,"typical_delivery_days_min": number | null,"typical_warranty_months_max": number | null,"typical_warranty_months_min": number | null
                  }
                  Insert: {
                    "category_key": string,"confidence_level"?: string,"confidence_methodology": string,"confidence_score"?: number,"created_at"?: string,"fair_price_max"?: number | null,"fair_price_median"?: number | null,"fair_price_min"?: number | null,"fallback_reason"?: string | null,"freshness_status"?: string,"id"?: string,"is_fallback"?: boolean,"location_city"?: string | null,"network_reliability_score"?: number | null,"observed_at"?: string,"organization_id"?: string | null,"quote_variance_percent"?: number | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"sample_size"?: number,"source_provider_name"?: string,"source_type"?: string,"typical_delivery_days_max"?: number | null,"typical_delivery_days_min"?: number | null,"typical_warranty_months_max"?: number | null,"typical_warranty_months_min"?: number | null
                  }
                  Update: {
                    "category_key"?: string,"confidence_level"?: string,"confidence_methodology"?: string,"confidence_score"?: number,"created_at"?: string,"fair_price_max"?: number | null,"fair_price_median"?: number | null,"fair_price_min"?: number | null,"fallback_reason"?: string | null,"freshness_status"?: string,"id"?: string,"is_fallback"?: boolean,"location_city"?: string | null,"network_reliability_score"?: number | null,"observed_at"?: string,"organization_id"?: string | null,"quote_variance_percent"?: number | null,"requirement_id"?: string | null,"rfq_id"?: string | null,"sample_size"?: number,"source_provider_name"?: string,"source_type"?: string,"typical_delivery_days_max"?: number | null,"typical_delivery_days_min"?: number | null,"typical_warranty_months_max"?: number | null,"typical_warranty_months_min"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_intelligence_snapshots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "market_intelligence_snapshots_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"messaging_events": {
                  Row: {
                    "channel": Database["public"]['Enums']["messaging_channel"],"created_at": string,"demo_run_id": string | null,"direction": Database["public"]['Enums']["messaging_direction"],"error_code": string | null,"external_message_id": string | null,"id": string,"is_demo": boolean,"last_error": string | null,"max_retries": number,"next_retry_at": string | null,"normalized_message": string | null,"phone_e164": string | null,"processed_at": string | null,"processing_status": Database["public"]['Enums']["messaging_processing_status"],"provider": Database["public"]['Enums']["messaging_provider"],"quote_id": string | null,"raw_payload": NonNullable<Json>,"retry_count": number,"rfq_id": string | null,"supplier_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "channel": Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"demo_run_id"?: string | null,"direction": Database["public"]['Enums']["messaging_direction"],"error_code"?: string | null,"external_message_id"?: string | null,"id"?: string,"is_demo"?: boolean,"last_error"?: string | null,"max_retries"?: number,"next_retry_at"?: string | null,"normalized_message"?: string | null,"phone_e164"?: string | null,"processed_at"?: string | null,"processing_status"?: Database["public"]['Enums']["messaging_processing_status"],"provider": Database["public"]['Enums']["messaging_provider"],"quote_id"?: string | null,"raw_payload"?: NonNullable<Json>,"retry_count"?: number,"rfq_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"demo_run_id"?: string | null,"direction"?: Database["public"]['Enums']["messaging_direction"],"error_code"?: string | null,"external_message_id"?: string | null,"id"?: string,"is_demo"?: boolean,"last_error"?: string | null,"max_retries"?: number,"next_retry_at"?: string | null,"normalized_message"?: string | null,"phone_e164"?: string | null,"processed_at"?: string | null,"processing_status"?: Database["public"]['Enums']["messaging_processing_status"],"provider"?: Database["public"]['Enums']["messaging_provider"],"quote_id"?: string | null,"raw_payload"?: NonNullable<Json>,"retry_count"?: number,"rfq_id"?: string | null,"supplier_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messaging_events_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messaging_events_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "messaging_events_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "messaging_events_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "messaging_events_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"messaging_rate_limits": {
                  Row: {
                    "bucket": string,"hits": number,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"hits"?: number,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"hits"?: number,"window_start"?: string
                  }
                  Relationships: [

                  ]
                },"notification_dispatch_queue": {
                  Row: {
                    "category": string,"channel": string,"created_at": string,"delivery_confirmed_at": string | null,"error_log": NonNullable<Json>,"id": string,"idempotency_key": string,"is_identity_masked": boolean,"max_retries": number,"next_retry_at": string,"organization_id": string | null,"payload": NonNullable<Json>,"provider_message_id": string | null,"provider_response": Json | null,"recipient_address": string,"recipient_user_id": string | null,"redacted_payload": NonNullable<Json>,"retry_count": number,"status": string,"template_code": string | null,"template_version": number,"updated_at": string
                  }
                  Insert: {
                    "category": string,"channel": string,"created_at"?: string,"delivery_confirmed_at"?: string | null,"error_log"?: NonNullable<Json>,"id"?: string,"idempotency_key": string,"is_identity_masked"?: boolean,"max_retries"?: number,"next_retry_at"?: string,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"provider_message_id"?: string | null,"provider_response"?: Json | null,"recipient_address": string,"recipient_user_id"?: string | null,"redacted_payload"?: NonNullable<Json>,"retry_count"?: number,"status"?: string,"template_code"?: string | null,"template_version"?: number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"channel"?: string,"created_at"?: string,"delivery_confirmed_at"?: string | null,"error_log"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string,"is_identity_masked"?: boolean,"max_retries"?: number,"next_retry_at"?: string,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"provider_message_id"?: string | null,"provider_response"?: Json | null,"recipient_address"?: string,"recipient_user_id"?: string | null,"redacted_payload"?: NonNullable<Json>,"retry_count"?: number,"status"?: string,"template_code"?: string | null,"template_version"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_dispatch_queue_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_dispatch_queue_recipient_user_id_fkey"
      columns: ["recipient_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_dispatch_queue_template_code_fkey"
      columns: ["template_code"]
isOneToOne: false
      referencedRelation: "notification_templates"
      referencedColumns: ["template_code"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "category_opt_outs": (string)[],"channel_preferences": NonNullable<Json>,"created_at": string,"email": string | null,"id": string,"organization_id": string | null,"phone_number": string | null,"quiet_hours_end": string | null,"quiet_hours_start": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "category_opt_outs"?: (string)[],"channel_preferences"?: NonNullable<Json>,"created_at"?: string,"email"?: string | null,"id"?: string,"organization_id"?: string | null,"phone_number"?: string | null,"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category_opt_outs"?: (string)[],"channel_preferences"?: NonNullable<Json>,"created_at"?: string,"email"?: string | null,"id"?: string,"organization_id"?: string | null,"phone_number"?: string | null,"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_templates": {
                  Row: {
                    "body_template": string,"category": string,"channel": string,"created_at": string,"id": string,"is_active": boolean,"lifecycle_stages": (string)[],"requires_identity_redaction": boolean,"subject_template": string | null,"template_code": string,"updated_at": string,"variables_schema": NonNullable<Json>,"version": number
                  }
                  Insert: {
                    "body_template": string,"category": string,"channel": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"lifecycle_stages"?: (string)[],"requires_identity_redaction"?: boolean,"subject_template"?: string | null,"template_code": string,"updated_at"?: string,"variables_schema"?: NonNullable<Json>,"version"?: number
                  }
                  Update: {
                    "body_template"?: string,"category"?: string,"channel"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"lifecycle_stages"?: (string)[],"requires_identity_redaction"?: boolean,"subject_template"?: string | null,"template_code"?: string,"updated_at"?: string,"variables_schema"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [

                  ]
                },"notifications": {
                  Row: {
                    "action_type": string | null,"body": string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"event_type": string,"id": string,"is_demo": boolean,"link": string | null,"payload": NonNullable<Json>,"profile_id": string,"read_at": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"title": string | null,"updated_at": string
                  }
                  Insert: {
                    "action_type"?: string | null,"body"?: string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"event_type": string,"id"?: string,"is_demo"?: boolean,"link"?: string | null,"payload"?: NonNullable<Json>,"profile_id": string,"read_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "action_type"?: string | null,"body"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"event_type"?: string,"id"?: string,"is_demo"?: boolean,"link"?: string | null,"payload"?: NonNullable<Json>,"profile_id"?: string,"read_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ondc_discovery_callback_replays": {
                  Row: {
                    "body_digest": string,"callback_subscriber": string,"id": string,"message_id": string,"received_at": string,"transaction_id": string
                  }
                  Insert: {
                    "body_digest": string,"callback_subscriber": string,"id"?: string,"message_id": string,"received_at"?: string,"transaction_id": string
                  }
                  Update: {
                    "body_digest"?: string,"callback_subscriber"?: string,"id"?: string,"message_id"?: string,"received_at"?: string,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ondc_discovery_callback_replays_dispatch_fk"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "ondc_discovery_dispatches"
      referencedColumns: ["transaction_id"]
    }
                  ]
                },"ondc_discovery_dispatches": {
                  Row: {
                    "bound_participant_id": string | null,"buyer_requested_pin": string,"callback_digest": string | null,"canonical_observed_at": string | null,"category_label": string | null,"city": string,"correlation_id": string,"domain": string,"environment": string,"expected_bap_id": string,"failure_reason": string | null,"id": string,"idempotency_key": string,"initiated_at": string,"message_id": string,"observation_source": string,"operation": string,"otp_transaction_id": string,"provider": string,"real_network_verified": boolean,"requirement_mode": string | null,"status": string,"subcategory_code": string | null,"transaction_id": string,"updated_at": string
                  }
                  Insert: {
                    "bound_participant_id"?: string | null,"buyer_requested_pin": string,"callback_digest"?: string | null,"canonical_observed_at"?: string | null,"category_label"?: string | null,"city": string,"correlation_id": string,"domain": string,"environment": string,"expected_bap_id": string,"failure_reason"?: string | null,"id"?: string,"idempotency_key": string,"initiated_at"?: string,"message_id": string,"observation_source": string,"operation"?: string,"otp_transaction_id": string,"provider"?: string,"real_network_verified"?: boolean,"requirement_mode"?: string | null,"status"?: string,"subcategory_code"?: string | null,"transaction_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bound_participant_id"?: string | null,"buyer_requested_pin"?: string,"callback_digest"?: string | null,"canonical_observed_at"?: string | null,"category_label"?: string | null,"city"?: string,"correlation_id"?: string,"domain"?: string,"environment"?: string,"expected_bap_id"?: string,"failure_reason"?: string | null,"id"?: string,"idempotency_key"?: string,"initiated_at"?: string,"message_id"?: string,"observation_source"?: string,"operation"?: string,"otp_transaction_id"?: string,"provider"?: string,"real_network_verified"?: boolean,"requirement_mode"?: string | null,"status"?: string,"subcategory_code"?: string | null,"transaction_id"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"ondc_discovery_identities": {
                  Row: {
                    "created_at": string,"id": string,"provider": string,"provider_supplier_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"provider": string,"provider_supplier_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"provider"?: string,"provider_supplier_id"?: string
                  }
                  Relationships: [

                  ]
                },"ondc_discovery_observations": {
                  Row: {
                    "bpp_uri": string | null,"catalogue_id": string | null,"city_code": string | null,"correlation_id": string,"discovered_at": string,"display_name": string,"domain": string | null,"environment": string,"id": string,"identity_id": string,"location_id": string | null,"message_id": string | null,"provider_participant_id": string,"reported_email": string | null,"reported_phone": string | null,"requested_category": string | null,"requested_pin": string | null,"retained_at": string,"seller_city": string | null,"seller_country": string | null,"seller_locality": string | null,"seller_pin": string | null,"seller_state": string | null,"source": string
                  }
                  Insert: {
                    "bpp_uri"?: string | null,"catalogue_id"?: string | null,"city_code"?: string | null,"correlation_id": string,"discovered_at": string,"display_name": string,"domain"?: string | null,"environment": string,"id"?: string,"identity_id": string,"location_id"?: string | null,"message_id"?: string | null,"provider_participant_id": string,"reported_email"?: string | null,"reported_phone"?: string | null,"requested_category"?: string | null,"requested_pin"?: string | null,"retained_at"?: string,"seller_city"?: string | null,"seller_country"?: string | null,"seller_locality"?: string | null,"seller_pin"?: string | null,"seller_state"?: string | null,"source": string
                  }
                  Update: {
                    "bpp_uri"?: string | null,"catalogue_id"?: string | null,"city_code"?: string | null,"correlation_id"?: string,"discovered_at"?: string,"display_name"?: string,"domain"?: string | null,"environment"?: string,"id"?: string,"identity_id"?: string,"location_id"?: string | null,"message_id"?: string | null,"provider_participant_id"?: string,"reported_email"?: string | null,"reported_phone"?: string | null,"requested_category"?: string | null,"requested_pin"?: string | null,"retained_at"?: string,"seller_city"?: string | null,"seller_country"?: string | null,"seller_locality"?: string | null,"seller_pin"?: string | null,"seller_state"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ondc_discovery_observations_identity_id_fkey"
      columns: ["identity_id"]
isOneToOne: true
      referencedRelation: "ondc_discovery_identities"
      referencedColumns: ["id"]
    }
                  ]
                },"org_governance_action_audits": {
                  Row: {
                    "action": string,"actor_person_id": string,"authority_at_time": NonNullable<Json>,"entity_id": string,"entity_type": string,"id": string,"organization_id": string,"payload": NonNullable<Json>,"responsibility_at_time": string,"role_assignment_id": string | null,"role_at_time": string,"timestamp": string,"transaction_id": string | null
                  }
                  Insert: {
                    "action": string,"actor_person_id": string,"authority_at_time"?: NonNullable<Json>,"entity_id": string,"entity_type": string,"id"?: string,"organization_id": string,"payload"?: NonNullable<Json>,"responsibility_at_time": string,"role_assignment_id"?: string | null,"role_at_time": string,"timestamp"?: string,"transaction_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_person_id"?: string,"authority_at_time"?: NonNullable<Json>,"entity_id"?: string,"entity_type"?: string,"id"?: string,"organization_id"?: string,"payload"?: NonNullable<Json>,"responsibility_at_time"?: string,"role_assignment_id"?: string | null,"role_at_time"?: string,"timestamp"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_governance_action_audits_actor_person_id_fkey"
      columns: ["actor_person_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_governance_action_audits_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_governance_action_audits_role_assignment_id_fkey"
      columns: ["role_assignment_id"]
isOneToOne: false
      referencedRelation: "org_role_assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"org_role_assignments": {
                  Row: {
                    "appointed_by": string | null,"appointment_event": string,"authority_scope": NonNullable<Json>,"created_at": string,"effective_from": string,"effective_to": string | null,"id": string,"organization_id": string,"person_id": string | null,"predecessor_assignment_id": string | null,"removal_event": string | null,"removal_reason": string | null,"responsibility_scope": string,"role_category": string,"role_id": string,"role_name": string,"status": string,"term_duration_days": number,"updated_at": string
                  }
                  Insert: {
                    "appointed_by"?: string | null,"appointment_event"?: string,"authority_scope"?: NonNullable<Json>,"created_at"?: string,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"organization_id": string,"person_id"?: string | null,"predecessor_assignment_id"?: string | null,"removal_event"?: string | null,"removal_reason"?: string | null,"responsibility_scope"?: string,"role_category"?: string,"role_id": string,"role_name": string,"status"?: string,"term_duration_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "appointed_by"?: string | null,"appointment_event"?: string,"authority_scope"?: NonNullable<Json>,"created_at"?: string,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"organization_id"?: string,"person_id"?: string | null,"predecessor_assignment_id"?: string | null,"removal_event"?: string | null,"removal_reason"?: string | null,"responsibility_scope"?: string,"role_category"?: string,"role_id"?: string,"role_name"?: string,"status"?: string,"term_duration_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_role_assignments_appointed_by_fkey"
      columns: ["appointed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_role_assignments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_role_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_role_assignments_predecessor_assignment_id_fkey"
      columns: ["predecessor_assignment_id"]
isOneToOne: false
      referencedRelation: "org_role_assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_approval_policies": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"organization_id": string,"policy_name": string,"prevent_self_approval": boolean,"require_dual_signoff_above": number | null,"tiers": NonNullable<Json>,"updated_at": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"organization_id": string,"policy_name"?: string,"prevent_self_approval"?: boolean,"require_dual_signoff_above"?: number | null,"tiers"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"organization_id"?: string,"policy_name"?: string,"prevent_self_approval"?: boolean,"require_dual_signoff_above"?: number | null,"tiers"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_approval_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_delegations": {
                  Row: {
                    "created_at": string,"delegatee_id": string,"delegator_id": string,"expires_at": string,"id": string,"is_active": boolean,"notes": string | null,"organization_id": string,"permissions": (string)[],"revoked_at": string | null,"revoked_by": string | null,"spend_cap_amount": number | null,"starts_at": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"delegatee_id": string,"delegator_id": string,"expires_at": string,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"organization_id": string,"permissions"?: (string)[],"revoked_at"?: string | null,"revoked_by"?: string | null,"spend_cap_amount"?: number | null,"starts_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"delegatee_id"?: string,"delegator_id"?: string,"expires_at"?: string,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"organization_id"?: string,"permissions"?: (string)[],"revoked_at"?: string | null,"revoked_by"?: string | null,"spend_cap_amount"?: number | null,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_delegations_delegatee_id_fkey"
      columns: ["delegatee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_delegations_delegator_id_fkey"
      columns: ["delegator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_delegations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_delegations_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"claim_status": string,"claimed_at": string | null,"claimed_by_profile_id": string | null,"created_at": string,"expires_at": string,"id": string,"invited_by": string,"invited_email": string,"organization_id": string,"revoked_at": string | null,"revoked_by": string | null,"role": Database["public"]['Enums']["org_member_role"],"spend_limit": number | null,"status": string,"token_hash": string,"updated_at": string,"voting_weight": number | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"claim_status"?: string,"claimed_at"?: string | null,"claimed_by_profile_id"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"invited_by": string,"invited_email": string,"organization_id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: Database["public"]['Enums']["org_member_role"],"spend_limit"?: number | null,"status"?: string,"token_hash": string,"updated_at"?: string,"voting_weight"?: number | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"claim_status"?: string,"claimed_at"?: string | null,"claimed_by_profile_id"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"invited_email"?: string,"organization_id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: Database["public"]['Enums']["org_member_role"],"spend_limit"?: number | null,"status"?: string,"token_hash"?: string,"updated_at"?: string,"voting_weight"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_claimed_by_profile_id_fkey"
      columns: ["claimed_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "id": string,"joined_at": string,"organization_id": string,"profile_id": string,"role": Database["public"]['Enums']["org_member_role"]
                  }
                  Insert: {
                    "id"?: string,"joined_at"?: string,"organization_id": string,"profile_id": string,"role": Database["public"]['Enums']["org_member_role"]
                  }
                  Update: {
                    "id"?: string,"joined_at"?: string,"organization_id"?: string,"profile_id"?: string,"role"?: Database["public"]['Enums']["org_member_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_wallets": {
                  Row: {
                    "balance_credits": number,"created_at": string,"id": string,"organization_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "balance_credits"?: number,"created_at"?: string,"id"?: string,"organization_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "balance_credits"?: number,"created_at"?: string,"id"?: string,"organization_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_wallets_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address": Json | null,"blocked_at": string | null,"blocked_by": string | null,"blocked_reason": string | null,"city": string | null,"completed_pos_count": number,"contact_email": string | null,"contact_person": string | null,"contact_phone": string | null,"created_at": string,"deleted_at": string | null,"free_rfq_credits": number | null,"gst_verified": boolean | null,"id": string,"is_demo": boolean,"legal_name": string | null,"name": string,"org_type": Database["public"]['Enums']["org_type"],"pan": string | null,"payment_reference": string | null,"persona": string | null,"post_reveal_cancels_count": number,"purchased_rfq_credits": number,"purchased_rfq_credits_expires_at": string | null,"reliability_score": number,"reliability_tier": string,"rfq_credits_used": number | null,"state_code": string | null,"status": string,"subscription_expires_at": string | null,"subscription_plan": string | null,"subscription_started_at": string | null,"subscription_status": string | null,"subscription_tier": string | null,"tax_exempt": boolean | null,"tax_registration": string | null,"total_rfqs_launched": number,"updated_at": string
                  }
                  Insert: {
                    "address"?: Json | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"city"?: string | null,"completed_pos_count"?: number,"contact_email"?: string | null,"contact_person"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"free_rfq_credits"?: number | null,"gst_verified"?: boolean | null,"id"?: string,"is_demo"?: boolean,"legal_name"?: string | null,"name": string,"org_type": Database["public"]['Enums']["org_type"],"pan"?: string | null,"payment_reference"?: string | null,"persona"?: string | null,"post_reveal_cancels_count"?: number,"purchased_rfq_credits"?: number,"purchased_rfq_credits_expires_at"?: string | null,"reliability_score"?: number,"reliability_tier"?: string,"rfq_credits_used"?: number | null,"state_code"?: string | null,"status"?: string,"subscription_expires_at"?: string | null,"subscription_plan"?: string | null,"subscription_started_at"?: string | null,"subscription_status"?: string | null,"subscription_tier"?: string | null,"tax_exempt"?: boolean | null,"tax_registration"?: string | null,"total_rfqs_launched"?: number,"updated_at"?: string
                  }
                  Update: {
                    "address"?: Json | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"city"?: string | null,"completed_pos_count"?: number,"contact_email"?: string | null,"contact_person"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"free_rfq_credits"?: number | null,"gst_verified"?: boolean | null,"id"?: string,"is_demo"?: boolean,"legal_name"?: string | null,"name"?: string,"org_type"?: Database["public"]['Enums']["org_type"],"pan"?: string | null,"payment_reference"?: string | null,"persona"?: string | null,"post_reveal_cancels_count"?: number,"purchased_rfq_credits"?: number,"purchased_rfq_credits_expires_at"?: string | null,"reliability_score"?: number,"reliability_tier"?: string,"rfq_credits_used"?: number | null,"state_code"?: string | null,"status"?: string,"subscription_expires_at"?: string | null,"subscription_plan"?: string | null,"subscription_started_at"?: string | null,"subscription_status"?: string | null,"subscription_tier"?: string | null,"tax_exempt"?: boolean | null,"tax_registration"?: string | null,"total_rfqs_launched"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_blocked_by_fkey"
      columns: ["blocked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"otp_schema_migrations": {
                  Row: {
                    "applied_at": string,"version": string
                  }
                  Insert: {
                    "applied_at"?: string,"version": string
                  }
                  Update: {
                    "applied_at"?: string,"version"?: string
                  }
                  Relationships: [

                  ]
                },"password_reset_otps": {
                  Row: {
                    "attempt_count": number,"created_at": string | null,"email": string,"expires_at": string,"id": string,"otp_code": string | null,"otp_code_hash": string | null,"otp_salt": string | null,"phone": string | null,"purpose": string,"used_at": string | null
                  }
                  Insert: {
                    "attempt_count"?: number,"created_at"?: string | null,"email": string,"expires_at": string,"id"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"phone"?: string | null,"purpose"?: string,"used_at"?: string | null
                  }
                  Update: {
                    "attempt_count"?: number,"created_at"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"phone"?: string | null,"purpose"?: string,"used_at"?: string | null
                  }
                  Relationships: [

                  ]
                },"payment_allocations": {
                  Row: {
                    "allocated_amount": number,"allocated_at": string,"allocated_by": string | null,"created_at": string,"id": string,"idempotency_key": string | null,"invoice_id": string,"notes": string | null,"payment_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "allocated_amount": number,"allocated_at"?: string,"allocated_by"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key"?: string | null,"invoice_id": string,"notes"?: string | null,"payment_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allocated_amount"?: number,"allocated_at"?: string,"allocated_by"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key"?: string | null,"invoice_id"?: string,"notes"?: string | null,"payment_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_allocated_by_fkey"
      columns: ["allocated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"gateway": string | null,"gateway_event_id": string | null,"gateway_payload": Json | null,"gateway_status": Database["public"]['Enums']["payment_gateway_status"],"id": string,"invoice_id": string | null,"is_demo": boolean,"method": Database["public"]['Enums']["payment_method"],"purchase_order_id": string | null,"recorded_at": string,"recorded_by": string,"reference": string | null,"status": Database["public"]['Enums']["payment_status"],"unallocated_amount": number,"updated_at": string,"verified_at": string | null
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"currency"?: string,"gateway"?: string | null,"gateway_event_id"?: string | null,"gateway_payload"?: Json | null,"gateway_status"?: Database["public"]['Enums']["payment_gateway_status"],"id"?: string,"invoice_id"?: string | null,"is_demo"?: boolean,"method": Database["public"]['Enums']["payment_method"],"purchase_order_id"?: string | null,"recorded_at"?: string,"recorded_by": string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"unallocated_amount"?: number,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"gateway"?: string | null,"gateway_event_id"?: string | null,"gateway_payload"?: Json | null,"gateway_status"?: Database["public"]['Enums']["payment_gateway_status"],"id"?: string,"invoice_id"?: string | null,"is_demo"?: boolean,"method"?: Database["public"]['Enums']["payment_method"],"purchase_order_id"?: string | null,"recorded_at"?: string,"recorded_by"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"unallocated_amount"?: number,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_buyer_accounts": {
                  Row: {
                    "created_at": string,"profile_id": string
                  }
                  Insert: {
                    "created_at"?: string,"profile_id": string
                  }
                  Update: {
                    "created_at"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_buyer_accounts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_subscription_payment_logs": {
                  Row: {
                    "amount": number,"billing_cycle": string,"created_at": string,"currency": string,"gateway": string | null,"gateway_event_id": string,"gateway_payload": NonNullable<Json>,"id": string,"new_expires_at": string,"payment_reference": string | null,"previous_expires_at": string | null,"profile_id": string,"tier": string
                  }
                  Insert: {
                    "amount": number,"billing_cycle": string,"created_at"?: string,"currency": string,"gateway"?: string | null,"gateway_event_id": string,"gateway_payload"?: NonNullable<Json>,"id"?: string,"new_expires_at": string,"payment_reference"?: string | null,"previous_expires_at"?: string | null,"profile_id": string,"tier": string
                  }
                  Update: {
                    "amount"?: number,"billing_cycle"?: string,"created_at"?: string,"currency"?: string,"gateway"?: string | null,"gateway_event_id"?: string,"gateway_payload"?: NonNullable<Json>,"id"?: string,"new_expires_at"?: string,"payment_reference"?: string | null,"previous_expires_at"?: string | null,"profile_id"?: string,"tier"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_subscription_payment_logs_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_subscriptions": {
                  Row: {
                    "payment_reference": string | null,"profile_id": string,"purchased_rfq_credits": number,"purchased_rfq_credits_expires_at": string | null,"subscription_expires_at": string | null,"subscription_plan": string,"subscription_started_at": string,"subscription_status": string,"subscription_tier": string,"updated_at": string
                  }
                  Insert: {
                    "payment_reference"?: string | null,"profile_id": string,"purchased_rfq_credits"?: number,"purchased_rfq_credits_expires_at"?: string | null,"subscription_expires_at"?: string | null,"subscription_plan"?: string,"subscription_started_at"?: string,"subscription_status"?: string,"subscription_tier"?: string,"updated_at"?: string
                  }
                  Update: {
                    "payment_reference"?: string | null,"profile_id"?: string,"purchased_rfq_credits"?: number,"purchased_rfq_credits_expires_at"?: string | null,"subscription_expires_at"?: string | null,"subscription_plan"?: string,"subscription_started_at"?: string,"subscription_status"?: string,"subscription_tier"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pilot_purchase_attempts": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"credit_invalidated_at": string | null,"currency": string,"entitlement_expires_at": string | null,"entitlement_quantity": number,"gross_amount": number,"id": string,"idempotency_key": string,"initiated_by": string,"organization_id": string | null,"owner_key": string,"owner_profile_id": string | null,"plan_code": string,"product_type": string,"provider": string,"remaining_credit": number,"simulated": boolean,"status": string,"tax_amount": number,"tax_breakdown": NonNullable<Json>,"taxable_amount": number,"tier_code": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"credit_invalidated_at"?: string | null,"currency": string,"entitlement_expires_at"?: string | null,"entitlement_quantity"?: number,"gross_amount": number,"id"?: string,"idempotency_key": string,"initiated_by": string,"organization_id"?: string | null,"owner_key": string,"owner_profile_id"?: string | null,"plan_code": string,"product_type": string,"provider"?: string,"remaining_credit"?: number,"simulated"?: boolean,"status": string,"tax_amount": number,"tax_breakdown": NonNullable<Json>,"taxable_amount": number,"tier_code": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"credit_invalidated_at"?: string | null,"currency"?: string,"entitlement_expires_at"?: string | null,"entitlement_quantity"?: number,"gross_amount"?: number,"id"?: string,"idempotency_key"?: string,"initiated_by"?: string,"organization_id"?: string | null,"owner_key"?: string,"owner_profile_id"?: string | null,"plan_code"?: string,"product_type"?: string,"provider"?: string,"remaining_credit"?: number,"simulated"?: boolean,"status"?: string,"tax_amount"?: number,"tax_breakdown"?: NonNullable<Json>,"taxable_amount"?: number,"tier_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pilot_purchase_attempts_initiated_by_fkey"
      columns: ["initiated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pilot_purchase_attempts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pilot_purchase_attempts_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_environment_settings": {
                  Row: {
                    "environment": string,"id": string,"is_production": boolean,"lock_destructive_ops": boolean,"pilot_payment_simulation_enabled": boolean,"pilot_simulated_outcome": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "environment"?: string,"id"?: string,"is_production"?: boolean,"lock_destructive_ops"?: boolean,"pilot_payment_simulation_enabled"?: boolean,"pilot_simulated_outcome"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "environment"?: string,"id"?: string,"is_production"?: boolean,"lock_destructive_ops"?: boolean,"pilot_payment_simulation_enabled"?: boolean,"pilot_simulated_outcome"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [

                  ]
                },"platform_fee_policies": {
                  Row: {
                    "created_at": string,"description": string | null,"effective_from": string,"effective_to": string | null,"fee_type": string,"id": string,"max_fee_amount": number | null,"min_fee_amount": number | null,"policy_version": number,"rate": number,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"fee_type"?: string,"id"?: string,"max_fee_amount"?: number | null,"min_fee_amount"?: number | null,"policy_version": number,"rate": number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"fee_type"?: string,"id"?: string,"max_fee_amount"?: number | null,"min_fee_amount"?: number | null,"policy_version"?: number,"rate"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"platform_fee_transactions": {
                  Row: {
                    "created_at": string,"fee_amount": number,"fee_rate": number,"gross_amount": number,"id": string,"invoice_id": string | null,"net_settlement_amount": number,"notes": string | null,"organization_id": string,"payment_allocation_id": string | null,"payment_id": string | null,"policy_id": string,"policy_version": number,"purchase_order_id": string,"settled_at": string | null,"status": string,"supplier_id": string,"updated_at": string,"voided_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"fee_amount": number,"fee_rate": number,"gross_amount": number,"id"?: string,"invoice_id"?: string | null,"net_settlement_amount": number,"notes"?: string | null,"organization_id": string,"payment_allocation_id"?: string | null,"payment_id"?: string | null,"policy_id": string,"policy_version": number,"purchase_order_id": string,"settled_at"?: string | null,"status"?: string,"supplier_id": string,"updated_at"?: string,"voided_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"fee_amount"?: number,"fee_rate"?: number,"gross_amount"?: number,"id"?: string,"invoice_id"?: string | null,"net_settlement_amount"?: number,"notes"?: string | null,"organization_id"?: string,"payment_allocation_id"?: string | null,"payment_id"?: string | null,"policy_id"?: string,"policy_version"?: number,"purchase_order_id"?: string,"settled_at"?: string | null,"status"?: string,"supplier_id"?: string,"updated_at"?: string,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_fee_transactions_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_payment_allocation_id_fkey"
      columns: ["payment_allocation_id"]
isOneToOne: false
      referencedRelation: "payment_allocations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "platform_fee_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_fee_transactions_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_privilege_requests": {
                  Row: {
                    "claim": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"id": string,"initiated_by": string,"reason": string,"requested_value": boolean,"status": string,"subject_profile_id": string
                  }
                  Insert: {
                    "claim": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"initiated_by": string,"reason": string,"requested_value": boolean,"status"?: string,"subject_profile_id": string
                  }
                  Update: {
                    "claim"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"initiated_by"?: string,"reason"?: string,"requested_value"?: boolean,"status"?: string,"subject_profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_privilege_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_privilege_requests_initiated_by_fkey"
      columns: ["initiated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_privilege_requests_subject_profile_id_fkey"
      columns: ["subject_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"po_change_order_items": {
                  Row: {
                    "amount_delta": number,"change_order_id": string,"created_at": string,"description": string,"hsn_sac_code": string | null,"id": string,"item_index": number,"notes": string | null,"po_line_item_id": string | null,"quantity_delta": number,"tax_amount_delta": number,"total_delta": number,"unit": string,"unit_price": number,"updated_at": string
                  }
                  Insert: {
                    "amount_delta"?: number,"change_order_id": string,"created_at"?: string,"description": string,"hsn_sac_code"?: string | null,"id"?: string,"item_index": number,"notes"?: string | null,"po_line_item_id"?: string | null,"quantity_delta"?: number,"tax_amount_delta"?: number,"total_delta"?: number,"unit"?: string,"unit_price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount_delta"?: number,"change_order_id"?: string,"created_at"?: string,"description"?: string,"hsn_sac_code"?: string | null,"id"?: string,"item_index"?: number,"notes"?: string | null,"po_line_item_id"?: string | null,"quantity_delta"?: number,"tax_amount_delta"?: number,"total_delta"?: number,"unit"?: string,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "po_change_order_items_change_order_id_fkey"
      columns: ["change_order_id"]
isOneToOne: false
      referencedRelation: "po_change_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_change_order_items_po_line_item_id_fkey"
      columns: ["po_line_item_id"]
isOneToOne: false
      referencedRelation: "purchase_order_line_items"
      referencedColumns: ["id"]
    }
                  ]
                },"po_change_orders": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"change_order_number": string,"change_type": string,"committed_at": string | null,"committed_by": string | null,"created_at": string,"id": string,"net_amount_delta": number,"organization_id": string,"previous_po_total": number,"purchase_order_id": string,"reason": string,"rejection_reason": string | null,"requested_at": string,"requested_by": string,"revised_po_total": number,"sequence": number,"status": string,"tax_amount_delta": number,"title": string,"total_delta": number,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_order_number": string,"change_type"?: string,"committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"id"?: string,"net_amount_delta"?: number,"organization_id": string,"previous_po_total": number,"purchase_order_id": string,"reason": string,"rejection_reason"?: string | null,"requested_at"?: string,"requested_by": string,"revised_po_total": number,"sequence"?: number,"status"?: string,"tax_amount_delta"?: number,"title": string,"total_delta"?: number,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"change_order_number"?: string,"change_type"?: string,"committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"id"?: string,"net_amount_delta"?: number,"organization_id"?: string,"previous_po_total"?: number,"purchase_order_id"?: string,"reason"?: string,"rejection_reason"?: string | null,"requested_at"?: string,"requested_by"?: string,"revised_po_total"?: number,"sequence"?: number,"status"?: string,"tax_amount_delta"?: number,"title"?: string,"total_delta"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "po_change_orders_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_change_orders_committed_by_fkey"
      columns: ["committed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_change_orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_change_orders_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_change_orders_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"po_fee_snapshots": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"created_at": string,"estimated_fee_amount": number,"fee_type": string,"id": string,"is_acknowledged": boolean,"policy_id": string,"policy_version": number,"purchase_order_id": string,"rate": number,"updated_at": string
                  }
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"estimated_fee_amount"?: number,"fee_type"?: string,"id"?: string,"is_acknowledged"?: boolean,"policy_id": string,"policy_version": number,"purchase_order_id": string,"rate": number,"updated_at"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"estimated_fee_amount"?: number,"fee_type"?: string,"id"?: string,"is_acknowledged"?: boolean,"policy_id"?: string,"policy_version"?: number,"purchase_order_id"?: string,"rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "po_fee_snapshots_acknowledged_by_fkey"
      columns: ["acknowledged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_fee_snapshots_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "platform_fee_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_fee_snapshots_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: true
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"procurement_contracts": {
                  Row: {
                    "buyer_signature_hash": string | null,"buyer_signed_at": string | null,"buyer_signed_by": string | null,"contract_body_markdown": string,"contract_number": string,"created_at": string,"document_hash": string,"id": string,"organization_id": string,"purchase_order_id": string | null,"quote_id": string,"rfq_id": string,"status": string,"supplier_id": string,"supplier_signature_hash": string | null,"supplier_signed_at": string | null,"supplier_signed_by": string | null,"terms": NonNullable<Json>,"updated_at": string,"version": number
                  }
                  Insert: {
                    "buyer_signature_hash"?: string | null,"buyer_signed_at"?: string | null,"buyer_signed_by"?: string | null,"contract_body_markdown": string,"contract_number": string,"created_at"?: string,"document_hash": string,"id"?: string,"organization_id": string,"purchase_order_id"?: string | null,"quote_id": string,"rfq_id": string,"status"?: string,"supplier_id": string,"supplier_signature_hash"?: string | null,"supplier_signed_at"?: string | null,"supplier_signed_by"?: string | null,"terms"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "buyer_signature_hash"?: string | null,"buyer_signed_at"?: string | null,"buyer_signed_by"?: string | null,"contract_body_markdown"?: string,"contract_number"?: string,"created_at"?: string,"document_hash"?: string,"id"?: string,"organization_id"?: string,"purchase_order_id"?: string | null,"quote_id"?: string,"rfq_id"?: string,"status"?: string,"supplier_id"?: string,"supplier_signature_hash"?: string | null,"supplier_signed_at"?: string | null,"supplier_signed_by"?: string | null,"terms"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "procurement_contracts_buyer_signed_by_fkey"
      columns: ["buyer_signed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "procurement_contracts_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "procurement_contracts_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_contracts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_contracts_supplier_signed_by_fkey"
      columns: ["supplier_signed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"procurement_performance_records": {
                  Row: {
                    "actual_delivery_days": number | null,"actual_total": number | null,"id": string,"organization_id": string,"quality_rating": number | null,"quoted_delivery_days": number,"quoted_total": number,"recorded_at": string,"rfq_id": string,"supplier_id": string,"variance": Json | null
                  }
                  Insert: {
                    "actual_delivery_days"?: number | null,"actual_total"?: number | null,"id"?: string,"organization_id": string,"quality_rating"?: number | null,"quoted_delivery_days": number,"quoted_total": number,"recorded_at"?: string,"rfq_id": string,"supplier_id": string,"variance"?: Json | null
                  }
                  Update: {
                    "actual_delivery_days"?: number | null,"actual_total"?: number | null,"id"?: string,"organization_id"?: string,"quality_rating"?: number | null,"quoted_delivery_days"?: number,"quoted_total"?: number,"recorded_at"?: string,"rfq_id"?: string,"supplier_id"?: string,"variance"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "procurement_performance_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_performance_records_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"procurement_stage_events": {
                  Row: {
                    "actor_profile_id": string | null,"actor_role": string,"created_at": string,"event_payload": NonNullable<Json>,"id": string,"order_id": string | null,"requirement_id": string,"rfq_id": string | null,"step_code": string,"step_number": number,"step_title": string
                  }
                  Insert: {
                    "actor_profile_id"?: string | null,"actor_role"?: string,"created_at"?: string,"event_payload"?: NonNullable<Json>,"id"?: string,"order_id"?: string | null,"requirement_id": string,"rfq_id"?: string | null,"step_code": string,"step_number": number,"step_title": string
                  }
                  Update: {
                    "actor_profile_id"?: string | null,"actor_role"?: string,"created_at"?: string,"event_payload"?: NonNullable<Json>,"id"?: string,"order_id"?: string | null,"requirement_id"?: string,"rfq_id"?: string | null,"step_code"?: string,"step_number"?: number,"step_title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "procurement_stage_events_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_stage_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_stage_events_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "procurement_stage_events_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"profile_roles": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"id": string,"is_demo": boolean,"profile_id": string,"role_code": string
                  }
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"id"?: string,"is_demo"?: boolean,"profile_id": string,"role_code": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"id"?: string,"is_demo"?: boolean,"profile_id"?: string,"role_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_roles_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_roles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_roles_role_code_fkey"
      columns: ["role_code"]
isOneToOne: false
      referencedRelation: "user_roles"
      referencedColumns: ["code"]
    }
                  ]
                },"profile_verification_otps": {
                  Row: {
                    "attempt_count": number,"created_at": string | null,"credential_type": string,"credential_value": string,"expires_at": string,"id": string,"otp_code": string | null,"otp_code_hash": string | null,"otp_salt": string | null,"profile_id": string | null,"used_at": string | null
                  }
                  Insert: {
                    "attempt_count"?: number,"created_at"?: string | null,"credential_type": string,"credential_value": string,"expires_at": string,"id"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"profile_id"?: string | null,"used_at"?: string | null
                  }
                  Update: {
                    "attempt_count"?: number,"created_at"?: string | null,"credential_type"?: string,"credential_value"?: string,"expires_at"?: string,"id"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"profile_id"?: string | null,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_verification_otps_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active_organization_id": string | null,"active_portal_side": Database["public"]['Enums']["signup_side"] | null,"active_role_code": string | null,"auth_user_id": string,"avatar_url": string | null,"blocked_at": string | null,"blocked_by": string | null,"blocked_reason": string | null,"created_at": string,"deleted_at": string | null,"email": string,"full_name": string,"id": string,"is_demo": boolean,"is_founder": boolean,"is_platform_admin": boolean,"last_seen_at": string | null,"password_changed_at": string | null,"phone": string | null,"status": string,"title": string | null,"updated_at": string
                  }
                  Insert: {
                    "active_organization_id"?: string | null,"active_portal_side"?: Database["public"]['Enums']["signup_side"] | null,"active_role_code"?: string | null,"auth_user_id": string,"avatar_url"?: string | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email": string,"full_name": string,"id"?: string,"is_demo"?: boolean,"is_founder"?: boolean,"is_platform_admin"?: boolean,"last_seen_at"?: string | null,"password_changed_at"?: string | null,"phone"?: string | null,"status"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active_organization_id"?: string | null,"active_portal_side"?: Database["public"]['Enums']["signup_side"] | null,"active_role_code"?: string | null,"auth_user_id"?: string,"avatar_url"?: string | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"is_demo"?: boolean,"is_founder"?: boolean,"is_platform_admin"?: boolean,"last_seen_at"?: string | null,"password_changed_at"?: string | null,"phone"?: string | null,"status"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_active_organization_id_fkey"
      columns: ["active_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_active_role_code_fkey"
      columns: ["active_role_code"]
isOneToOne: false
      referencedRelation: "user_roles"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "profiles_blocked_by_fkey"
      columns: ["blocked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_order_line_items": {
                  Row: {
                    "cgst_amount": number,"cgst_rate": number,"created_at": string,"description": string,"gst_amount": number,"gst_rate": number,"hsn_code": string | null,"id": string,"igst_amount": number,"igst_rate": number,"item_index": number,"purchase_order_id": string,"quantity": number,"sgst_amount": number,"sgst_rate": number,"taxable_amount": number,"total_amount": number,"unit": string,"unit_price": number,"updated_at": string,"utgst_amount": number,"utgst_rate": number
                  }
                  Insert: {
                    "cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"description": string,"gst_amount"?: number,"gst_rate"?: number,"hsn_code"?: string | null,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"item_index": number,"purchase_order_id": string,"quantity": number,"sgst_amount"?: number,"sgst_rate"?: number,"taxable_amount": number,"total_amount": number,"unit"?: string,"unit_price": number,"updated_at"?: string,"utgst_amount"?: number,"utgst_rate"?: number
                  }
                  Update: {
                    "cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"description"?: string,"gst_amount"?: number,"gst_rate"?: number,"hsn_code"?: string | null,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"item_index"?: number,"purchase_order_id"?: string,"quantity"?: number,"sgst_amount"?: number,"sgst_rate"?: number,"taxable_amount"?: number,"total_amount"?: number,"unit"?: string,"unit_price"?: number,"updated_at"?: string,"utgst_amount"?: number,"utgst_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_order_line_items_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "acknowledged_at": string | null,"award_id": string,"billing_address_snapshot": Json | null,"cancellation_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"cgst_total": number,"created_at": string,"currency": string,"delivery_address_snapshot": Json | null,"id": string,"igst_total": number,"is_demo": boolean,"issued_at": string | null,"organization_id": string | null,"owner_profile_id": string | null,"payment_schedule": Json | null,"payment_structure": string | null,"payment_terms_text": string | null,"place_of_supply_basis": string | null,"place_of_supply_state_code": string | null,"po_number": string,"rfq_id": string,"sgst_total": number,"status": Database["public"]['Enums']["purchase_order_status"],"supplier_id": string,"tax_snapshot": Json | null,"taxable_total": number,"total_amount": number,"updated_at": string,"utgst_total": number
                  }
                  Insert: {
                    "acknowledged_at"?: string | null,"award_id": string,"billing_address_snapshot"?: Json | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cgst_total"?: number,"created_at"?: string,"currency"?: string,"delivery_address_snapshot"?: Json | null,"id"?: string,"igst_total"?: number,"is_demo"?: boolean,"issued_at"?: string | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"payment_schedule"?: Json | null,"payment_structure"?: string | null,"payment_terms_text"?: string | null,"place_of_supply_basis"?: string | null,"place_of_supply_state_code"?: string | null,"po_number": string,"rfq_id": string,"sgst_total"?: number,"status"?: Database["public"]['Enums']["purchase_order_status"],"supplier_id": string,"tax_snapshot"?: Json | null,"taxable_total"?: number,"total_amount": number,"updated_at"?: string,"utgst_total"?: number
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"award_id"?: string,"billing_address_snapshot"?: Json | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cgst_total"?: number,"created_at"?: string,"currency"?: string,"delivery_address_snapshot"?: Json | null,"id"?: string,"igst_total"?: number,"is_demo"?: boolean,"issued_at"?: string | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"payment_schedule"?: Json | null,"payment_structure"?: string | null,"payment_terms_text"?: string | null,"place_of_supply_basis"?: string | null,"place_of_supply_state_code"?: string | null,"po_number"?: string,"rfq_id"?: string,"sgst_total"?: number,"status"?: Database["public"]['Enums']["purchase_order_status"],"supplier_id"?: string,"tax_snapshot"?: Json | null,"taxable_total"?: number,"total_amount"?: number,"updated_at"?: string,"utgst_total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_award_id_fkey"
      columns: ["award_id"]
isOneToOne: true
      referencedRelation: "awards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "purchase_orders_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_evaluations": {
                  Row: {
                    "breakdown": Json | null,"computed_at": string | null,"created_at": string,"evaluation_score": number,"id": string,"quote_id": string,"rfq_id": string,"status": Database["public"]['Enums']["evaluation_status"],"version_evaluated": number
                  }
                  Insert: {
                    "breakdown"?: Json | null,"computed_at"?: string | null,"created_at"?: string,"evaluation_score": number,"id"?: string,"quote_id": string,"rfq_id": string,"status"?: Database["public"]['Enums']["evaluation_status"],"version_evaluated": number
                  }
                  Update: {
                    "breakdown"?: Json | null,"computed_at"?: string | null,"created_at"?: string,"evaluation_score"?: number,"id"?: string,"quote_id"?: string,"rfq_id"?: string,"status"?: Database["public"]['Enums']["evaluation_status"],"version_evaluated"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quote_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"notes": string | null,"quote_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"quote_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"quote_id"?: string,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "created_at": string,"current_version": number,"evaluation_score": number | null,"id": string,"invitation_id": string,"is_demo": boolean,"received_at": string | null,"rfq_id": string,"source": Database["public"]['Enums']["quote_source"],"status": Database["public"]['Enums']["quote_status"],"submitted_at": string | null,"supplier_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"current_version"?: number,"evaluation_score"?: number | null,"id"?: string,"invitation_id": string,"is_demo"?: boolean,"received_at"?: string | null,"rfq_id": string,"source"?: Database["public"]['Enums']["quote_source"],"status"?: Database["public"]['Enums']["quote_status"],"submitted_at"?: string | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_version"?: number,"evaluation_score"?: number | null,"id"?: string,"invitation_id"?: string,"is_demo"?: boolean,"received_at"?: string | null,"rfq_id"?: string,"source"?: Database["public"]['Enums']["quote_source"],"status"?: Database["public"]['Enums']["quote_status"],"submitted_at"?: string | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "quotes_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"requirement_categories": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"examples": string | null,"icon": string | null,"id": string,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"examples"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"examples"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"requirement_subcategories": {
                  Row: {
                    "category_id": string,"code": string,"created_at": string,"default_requirement_mode": Database["public"]['Enums']["requirement_mode"] | null,"description": string | null,"id": string,"is_active": boolean,"match_keywords": (string)[],"name": string,"required_attribute_codes": (string)[],"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "category_id": string,"code": string,"created_at"?: string,"default_requirement_mode"?: Database["public"]['Enums']["requirement_mode"] | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"match_keywords"?: (string)[],"name": string,"required_attribute_codes"?: (string)[],"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"code"?: string,"created_at"?: string,"default_requirement_mode"?: Database["public"]['Enums']["requirement_mode"] | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"match_keywords"?: (string)[],"name"?: string,"required_attribute_codes"?: (string)[],"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requirement_subcategories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "requirement_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"requirements": {
                  Row: {
                    "attributes": NonNullable<Json>,"cancelled_at": string | null,"category_id": string | null,"closed_at": string | null,"commercial": NonNullable<Json>,"created_at": string,"created_by": string,"delivery_city": string | null,"delivery_line1": string | null,"delivery_pincode": string | null,"delivery_state": string | null,"description": string | null,"fulfilment_mode": Database["public"]['Enums']["fulfilment_mode"] | null,"id": string,"is_demo": boolean,"market_intel_snapshot": Json | null,"organization_id": string | null,"owner_profile_id": string | null,"public_ref": string | null,"published_at": string | null,"quality": NonNullable<Json>,"quantity": number | null,"required_by_date": string | null,"required_by_days": number | null,"required_by_mode": Database["public"]['Enums']["required_by_mode"] | null,"requirement_mode": Database["public"]['Enums']["requirement_mode"] | null,"requirement_type": Database["public"]['Enums']["requirement_type"],"site_notes": string | null,"status": Database["public"]['Enums']["requirement_status"],"structured_specs": Json | null,"subcategory_id": string | null,"title": string,"unit": string | null,"updated_at": string
                  }
                  Insert: {
                    "attributes"?: NonNullable<Json>,"cancelled_at"?: string | null,"category_id"?: string | null,"closed_at"?: string | null,"commercial"?: NonNullable<Json>,"created_at"?: string,"created_by": string,"delivery_city"?: string | null,"delivery_line1"?: string | null,"delivery_pincode"?: string | null,"delivery_state"?: string | null,"description"?: string | null,"fulfilment_mode"?: Database["public"]['Enums']["fulfilment_mode"] | null,"id"?: string,"is_demo"?: boolean,"market_intel_snapshot"?: Json | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"public_ref"?: string | null,"published_at"?: string | null,"quality"?: NonNullable<Json>,"quantity"?: number | null,"required_by_date"?: string | null,"required_by_days"?: number | null,"required_by_mode"?: Database["public"]['Enums']["required_by_mode"] | null,"requirement_mode"?: Database["public"]['Enums']["requirement_mode"] | null,"requirement_type": Database["public"]['Enums']["requirement_type"],"site_notes"?: string | null,"status"?: Database["public"]['Enums']["requirement_status"],"structured_specs"?: Json | null,"subcategory_id"?: string | null,"title": string,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"cancelled_at"?: string | null,"category_id"?: string | null,"closed_at"?: string | null,"commercial"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"delivery_city"?: string | null,"delivery_line1"?: string | null,"delivery_pincode"?: string | null,"delivery_state"?: string | null,"description"?: string | null,"fulfilment_mode"?: Database["public"]['Enums']["fulfilment_mode"] | null,"id"?: string,"is_demo"?: boolean,"market_intel_snapshot"?: Json | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"public_ref"?: string | null,"published_at"?: string | null,"quality"?: NonNullable<Json>,"quantity"?: number | null,"required_by_date"?: string | null,"required_by_days"?: number | null,"required_by_mode"?: Database["public"]['Enums']["required_by_mode"] | null,"requirement_mode"?: Database["public"]['Enums']["requirement_mode"] | null,"requirement_type"?: Database["public"]['Enums']["requirement_type"],"site_notes"?: string | null,"status"?: Database["public"]['Enums']["requirement_status"],"structured_specs"?: Json | null,"subcategory_id"?: string | null,"title"?: string,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requirements_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "requirement_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "requirement_subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"rfq_allowance_consumptions": {
                  Row: {
                    "consumed_at": string,"entitlement_source": string,"id": string,"organization_id": string | null,"owner_profile_id": string | null,"pilot_purchase_attempt_id": string | null,"qualification_reason": string,"quote_id": string,"quote_version_id": string,"rfq_id": string,"used_quarterly_bonus": boolean
                  }
                  Insert: {
                    "consumed_at"?: string,"entitlement_source"?: string,"id"?: string,"organization_id"?: string | null,"owner_profile_id"?: string | null,"pilot_purchase_attempt_id"?: string | null,"qualification_reason"?: string,"quote_id": string,"quote_version_id": string,"rfq_id": string,"used_quarterly_bonus"?: boolean
                  }
                  Update: {
                    "consumed_at"?: string,"entitlement_source"?: string,"id"?: string,"organization_id"?: string | null,"owner_profile_id"?: string | null,"pilot_purchase_attempt_id"?: string | null,"qualification_reason"?: string,"quote_id"?: string,"quote_version_id"?: string,"rfq_id"?: string,"used_quarterly_bonus"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_allowance_consumptions_pilot_purchase_attempt_id_fkey"
      columns: ["pilot_purchase_attempt_id"]
isOneToOne: false
      referencedRelation: "pilot_purchase_attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_quote_version_id_fkey"
      columns: ["quote_version_id"]
isOneToOne: false
      referencedRelation: "quote_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_allowance_consumptions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: true
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_approval_route_evaluations": {
                  Row: {
                    "created_at": string,"evaluated_at": string,"evaluated_by": string | null,"evaluation_reason": string,"id": string,"is_delegation_allowed": boolean,"is_executive_gate": boolean,"is_quorum_required": boolean,"is_voting_required": boolean,"organization_id": string,"policy_snapshot": NonNullable<Json>,"policy_version": number,"procurement_amount": number,"required_approval_level": string,"required_approvers_count": number,"required_tier_levels": (string)[],"rfq_id": string
                  }
                  Insert: {
                    "created_at"?: string,"evaluated_at"?: string,"evaluated_by"?: string | null,"evaluation_reason": string,"id"?: string,"is_delegation_allowed"?: boolean,"is_executive_gate"?: boolean,"is_quorum_required"?: boolean,"is_voting_required"?: boolean,"organization_id": string,"policy_snapshot": NonNullable<Json>,"policy_version"?: number,"procurement_amount": number,"required_approval_level": string,"required_approvers_count"?: number,"required_tier_levels"?: (string)[],"rfq_id": string
                  }
                  Update: {
                    "created_at"?: string,"evaluated_at"?: string,"evaluated_by"?: string | null,"evaluation_reason"?: string,"id"?: string,"is_delegation_allowed"?: boolean,"is_executive_gate"?: boolean,"is_quorum_required"?: boolean,"is_voting_required"?: boolean,"organization_id"?: string,"policy_snapshot"?: NonNullable<Json>,"policy_version"?: number,"procurement_amount"?: number,"required_approval_level"?: string,"required_approvers_count"?: number,"required_tier_levels"?: (string)[],"rfq_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_approval_route_evaluations_evaluated_by_fkey"
      columns: ["evaluated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_route_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_approval_stages": {
                  Row: {
                    "approved_at": string | null,"approver_comments": string | null,"approver_profile_id": string | null,"approver_role": string | null,"created_at": string,"delegation_id": string | null,"delegator_profile_id": string | null,"digital_signature_hash": string | null,"id": string,"notes": string | null,"organization_id": string,"procurement_amount": number,"rejected_at": string | null,"rfq_id": string,"signature_mode": string | null,"stage_order": number,"status": string,"threshold_max_amount": number | null,"threshold_min_amount": number,"tier_level": string,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approver_comments"?: string | null,"approver_profile_id"?: string | null,"approver_role"?: string | null,"created_at"?: string,"delegation_id"?: string | null,"delegator_profile_id"?: string | null,"digital_signature_hash"?: string | null,"id"?: string,"notes"?: string | null,"organization_id": string,"procurement_amount": number,"rejected_at"?: string | null,"rfq_id": string,"signature_mode"?: string | null,"stage_order": number,"status"?: string,"threshold_max_amount"?: number | null,"threshold_min_amount"?: number,"tier_level": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approver_comments"?: string | null,"approver_profile_id"?: string | null,"approver_role"?: string | null,"created_at"?: string,"delegation_id"?: string | null,"delegator_profile_id"?: string | null,"digital_signature_hash"?: string | null,"id"?: string,"notes"?: string | null,"organization_id"?: string,"procurement_amount"?: number,"rejected_at"?: string | null,"rfq_id"?: string,"signature_mode"?: string | null,"stage_order"?: number,"status"?: string,"threshold_max_amount"?: number | null,"threshold_min_amount"?: number,"tier_level"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_approval_stages_approver_profile_id_fkey"
      columns: ["approver_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_stages_delegation_id_fkey"
      columns: ["delegation_id"]
isOneToOne: false
      referencedRelation: "organization_delegations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_stages_delegator_profile_id_fkey"
      columns: ["delegator_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_stages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_approval_stages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_cancellations": {
                  Row: {
                    "cancelled_by": string,"created_at": string,"detailed_notes": string,"id": string,"is_suspicious": boolean,"reason_code": Database["public"]['Enums']["exit_reason_code"],"rfq_id": string,"stage": Database["public"]['Enums']["cancellation_stage"],"supporting_doc_id": string | null,"suspicion_reasons": (string)[] | null
                  }
                  Insert: {
                    "cancelled_by": string,"created_at"?: string,"detailed_notes": string,"id"?: string,"is_suspicious"?: boolean,"reason_code": Database["public"]['Enums']["exit_reason_code"],"rfq_id": string,"stage": Database["public"]['Enums']["cancellation_stage"],"supporting_doc_id"?: string | null,"suspicion_reasons"?: (string)[] | null
                  }
                  Update: {
                    "cancelled_by"?: string,"created_at"?: string,"detailed_notes"?: string,"id"?: string,"is_suspicious"?: boolean,"reason_code"?: Database["public"]['Enums']["exit_reason_code"],"rfq_id"?: string,"stage"?: Database["public"]['Enums']["cancellation_stage"],"supporting_doc_id"?: string | null,"suspicion_reasons"?: (string)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_cancellations_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_cancellations_supporting_doc_id_fkey"
      columns: ["supporting_doc_id"]
isOneToOne: false
      referencedRelation: "attachments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_cancellations_supporting_doc_id_fkey"
      columns: ["supporting_doc_id"]
isOneToOne: false
      referencedRelation: "quote_attachments_blind"
      referencedColumns: ["attachment_id"]
    },{
      foreignKeyName: "rfq_cancellations_supporting_doc_id_fkey"
      columns: ["supporting_doc_id"]
isOneToOne: false
      referencedRelation: "quote_attachments_masked"
      referencedColumns: ["attachment_id"]
    },{
      foreignKeyName: "rfq_cancellations_supporting_doc_id_fkey"
      columns: ["supporting_doc_id"]
isOneToOne: false
      referencedRelation: "quote_attachments_revealed"
      referencedColumns: ["attachment_id"]
    },{
      foreignKeyName: "rfq_cancellations_supporting_doc_id_fkey"
      columns: ["supporting_doc_id"]
isOneToOne: false
      referencedRelation: "requirement_attachments_shared"
      referencedColumns: ["attachment_id"]
    }
                  ]
                },"rfq_clarification_messages": {
                  Row: {
                    "author_profile_id": string,"author_side": Database["public"]['Enums']["clarification_author_side"],"body": string,"created_at": string,"id": string,"inquiry_category": string,"invitation_id": string | null,"is_broadcast": boolean,"line_item_ref": string | null,"redactions": (string)[],"rfq_id": string
                  }
                  Insert: {
                    "author_profile_id": string,"author_side": Database["public"]['Enums']["clarification_author_side"],"body": string,"created_at"?: string,"id"?: string,"inquiry_category"?: string,"invitation_id"?: string | null,"is_broadcast"?: boolean,"line_item_ref"?: string | null,"redactions"?: (string)[],"rfq_id": string
                  }
                  Update: {
                    "author_profile_id"?: string,"author_side"?: Database["public"]['Enums']["clarification_author_side"],"body"?: string,"created_at"?: string,"id"?: string,"inquiry_category"?: string,"invitation_id"?: string | null,"is_broadcast"?: boolean,"line_item_ref"?: string | null,"redactions"?: (string)[],"rfq_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_clarification_messages_author_profile_id_fkey"
      columns: ["author_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_invitations": {
                  Row: {
                    "anonymous_label": string,"decline_reason": string | null,"declined_at": string | null,"id": string,"invited_at": string,"match_reasons": (string)[] | null,"match_score": number | null,"rfq_id": string,"status": Database["public"]['Enums']["invite_status"],"supplier_id": string,"viewed_at": string | null
                  }
                  Insert: {
                    "anonymous_label": string,"decline_reason"?: string | null,"declined_at"?: string | null,"id"?: string,"invited_at"?: string,"match_reasons"?: (string)[] | null,"match_score"?: number | null,"rfq_id": string,"status"?: Database["public"]['Enums']["invite_status"],"supplier_id": string,"viewed_at"?: string | null
                  }
                  Update: {
                    "anonymous_label"?: string,"decline_reason"?: string | null,"declined_at"?: string | null,"id"?: string,"invited_at"?: string,"match_reasons"?: (string)[] | null,"match_score"?: number | null,"rfq_id"?: string,"status"?: Database["public"]['Enums']["invite_status"],"supplier_id"?: string,"viewed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"rfqs": {
                  Row: {
                    "alias_salt": string,"bid_deadline": string | null,"billing_address_snapshot": Json | null,"buyer_anonymous_to_suppliers": boolean,"clarification_at": string | null,"created_at": string,"created_by": string,"delivery_address_snapshot": Json | null,"evaluation_at": string | null,"evaluation_deadline": string | null,"evaluation_weights": NonNullable<Json>,"evaluation_weights_source": string,"id": string,"is_demo": boolean,"is_purged": boolean,"legal_hold": boolean,"min_quotes_required": number,"min_quotes_waived": boolean,"min_quotes_waiver_reason": string | null,"opened_at": string | null,"organization_id": string | null,"owner_profile_id": string | null,"public_ref": string | null,"purge_audit_tombstone": Json | null,"purged_at": string | null,"quote_deadline": string | null,"requirement_id": string,"reveal_status": Database["public"]['Enums']["rfq_reveal_status"],"revision_deadline": string | null,"sourcing_mode": Database["public"]['Enums']["sourcing_mode"],"status": Database["public"]['Enums']["rfq_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "alias_salt"?: string,"bid_deadline"?: string | null,"billing_address_snapshot"?: Json | null,"buyer_anonymous_to_suppliers"?: boolean,"clarification_at"?: string | null,"created_at"?: string,"created_by": string,"delivery_address_snapshot"?: Json | null,"evaluation_at"?: string | null,"evaluation_deadline"?: string | null,"evaluation_weights"?: NonNullable<Json>,"evaluation_weights_source"?: string,"id"?: string,"is_demo"?: boolean,"is_purged"?: boolean,"legal_hold"?: boolean,"min_quotes_required"?: number,"min_quotes_waived"?: boolean,"min_quotes_waiver_reason"?: string | null,"opened_at"?: string | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"public_ref"?: string | null,"purge_audit_tombstone"?: Json | null,"purged_at"?: string | null,"quote_deadline"?: string | null,"requirement_id": string,"reveal_status"?: Database["public"]['Enums']["rfq_reveal_status"],"revision_deadline"?: string | null,"sourcing_mode"?: Database["public"]['Enums']["sourcing_mode"],"status"?: Database["public"]['Enums']["rfq_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "alias_salt"?: string,"bid_deadline"?: string | null,"billing_address_snapshot"?: Json | null,"buyer_anonymous_to_suppliers"?: boolean,"clarification_at"?: string | null,"created_at"?: string,"created_by"?: string,"delivery_address_snapshot"?: Json | null,"evaluation_at"?: string | null,"evaluation_deadline"?: string | null,"evaluation_weights"?: NonNullable<Json>,"evaluation_weights_source"?: string,"id"?: string,"is_demo"?: boolean,"is_purged"?: boolean,"legal_hold"?: boolean,"min_quotes_required"?: number,"min_quotes_waived"?: boolean,"min_quotes_waiver_reason"?: string | null,"opened_at"?: string | null,"organization_id"?: string | null,"owner_profile_id"?: string | null,"public_ref"?: string | null,"purge_audit_tombstone"?: Json | null,"purged_at"?: string | null,"quote_deadline"?: string | null,"requirement_id"?: string,"reveal_status"?: Database["public"]['Enums']["rfq_reveal_status"],"revision_deadline"?: string | null,"sourcing_mode"?: Database["public"]['Enums']["sourcing_mode"],"status"?: Database["public"]['Enums']["rfq_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfqs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfqs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfqs_owner_profile_id_fkey"
      columns: ["owner_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfqs_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: true
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    }
                  ]
                },"scorecard_dimension_history": {
                  Row: {
                    "calculated_by": string | null,"calculation_trigger": string,"created_at": string,"dimensions_snapshot": NonNullable<Json>,"id": string,"metrics_snapshot": NonNullable<Json>,"organization_id": string | null,"overall_score": number,"performance_tier": string,"scorecard_id": string,"supplier_id": string
                  }
                  Insert: {
                    "calculated_by"?: string | null,"calculation_trigger"?: string,"created_at"?: string,"dimensions_snapshot": NonNullable<Json>,"id"?: string,"metrics_snapshot": NonNullable<Json>,"organization_id"?: string | null,"overall_score": number,"performance_tier": string,"scorecard_id": string,"supplier_id": string
                  }
                  Update: {
                    "calculated_by"?: string | null,"calculation_trigger"?: string,"created_at"?: string,"dimensions_snapshot"?: NonNullable<Json>,"id"?: string,"metrics_snapshot"?: NonNullable<Json>,"organization_id"?: string | null,"overall_score"?: number,"performance_tier"?: string,"scorecard_id"?: string,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scorecard_dimension_history_calculated_by_fkey"
      columns: ["calculated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scorecard_dimension_history_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scorecard_dimension_history_scorecard_id_fkey"
      columns: ["scorecard_id"]
isOneToOne: false
      referencedRelation: "anonymized_supplier_badges"
      referencedColumns: ["scorecard_id"]
    },{
      foreignKeyName: "scorecard_dimension_history_scorecard_id_fkey"
      columns: ["scorecard_id"]
isOneToOne: false
      referencedRelation: "supplier_scorecards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scorecard_dimension_history_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"settlement_exception_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"event_type": string,"exception_id": string,"from_status": string | null,"id": string,"notes": string | null,"to_status": string | null
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"event_type": string,"exception_id": string,"from_status"?: string | null,"id"?: string,"notes"?: string | null,"to_status"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"event_type"?: string,"exception_id"?: string,"from_status"?: string | null,"id"?: string,"notes"?: string | null,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_exception_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exception_events_exception_id_fkey"
      columns: ["exception_id"]
isOneToOne: false
      referencedRelation: "settlement_exceptions"
      referencedColumns: ["id"]
    }
                  ]
                },"settlement_exceptions": {
                  Row: {
                    "amount_in_dispute": number,"assigned_to": string | null,"created_at": string,"exception_type": string,"id": string,"invoice_id": string | null,"organization_id": string,"payment_id": string | null,"purchase_order_id": string | null,"reason": string,"reconciliation_id": string,"resolution_notes": string | null,"resolved_at": string | null,"resolved_by": string | null,"severity": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "amount_in_dispute"?: number,"assigned_to"?: string | null,"created_at"?: string,"exception_type": string,"id"?: string,"invoice_id"?: string | null,"organization_id": string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"reason": string,"reconciliation_id": string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_in_dispute"?: number,"assigned_to"?: string | null,"created_at"?: string,"exception_type"?: string,"id"?: string,"invoice_id"?: string | null,"organization_id"?: string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"reason"?: string,"reconciliation_id"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_exceptions_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_reconciliation_id_fkey"
      columns: ["reconciliation_id"]
isOneToOne: false
      referencedRelation: "settlement_reconciliations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_exceptions_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"settlement_reconciliations": {
                  Row: {
                    "adjusted_gross_amount": number,"created_at": string,"discrepancy_details": string | null,"discrepancy_type": string,"id": string,"invoice_gross_amount": number,"invoice_id": string,"notes": string | null,"organization_id": string,"paid_allocated_amount": number,"payment_id": string | null,"platform_fee_amount": number,"purchase_order_id": string,"reconciled_at": string | null,"reconciled_by": string | null,"status": string,"supplier_id": string,"supplier_net_settlement_amount": number,"tds_amount": number,"updated_at": string,"utr_cleared_amount": number | null,"utr_number": string | null,"variance_amount": number
                  }
                  Insert: {
                    "adjusted_gross_amount": number,"created_at"?: string,"discrepancy_details"?: string | null,"discrepancy_type"?: string,"id"?: string,"invoice_gross_amount": number,"invoice_id": string,"notes"?: string | null,"organization_id": string,"paid_allocated_amount"?: number,"payment_id"?: string | null,"platform_fee_amount"?: number,"purchase_order_id": string,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"status"?: string,"supplier_id": string,"supplier_net_settlement_amount"?: number,"tds_amount"?: number,"updated_at"?: string,"utr_cleared_amount"?: number | null,"utr_number"?: string | null,"variance_amount"?: number
                  }
                  Update: {
                    "adjusted_gross_amount"?: number,"created_at"?: string,"discrepancy_details"?: string | null,"discrepancy_type"?: string,"id"?: string,"invoice_gross_amount"?: number,"invoice_id"?: string,"notes"?: string | null,"organization_id"?: string,"paid_allocated_amount"?: number,"payment_id"?: string | null,"platform_fee_amount"?: number,"purchase_order_id"?: string,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"status"?: string,"supplier_id"?: string,"supplier_net_settlement_amount"?: number,"tds_amount"?: number,"updated_at"?: string,"utr_cleared_amount"?: number | null,"utr_number"?: string | null,"variance_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_reconciliations_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_reconciliations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_reconciliations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_reconciliations_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_reconciliations_reconciled_by_fkey"
      columns: ["reconciled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_reconciliations_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"signup_requests": {
                  Row: {
                    "business_name": string,"buyer_type": Database["public"]['Enums']["org_type"] | null,"category_codes": (string)[],"contact_first_name": string,"contact_last_name": string,"coverage_city": string | null,"coverage_pincode": string | null,"created_at": string,"designation": string | null,"email": string,"eula_accepted_at": string | null,"eula_agreement_type": string | null,"eula_document_hash": string | null,"eula_version": string | null,"id": string,"organization_id": string | null,"phone": string,"referral_code": string | null,"review_notes": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"role_code": string | null,"side": Database["public"]['Enums']["signup_side"],"status": Database["public"]['Enums']["signup_status"],"supplier_id": string | null,"tax_registration_id": string | null,"updated_at": string,"verification_channel": Database["public"]['Enums']["verification_channel"],"verified_at": string | null
                  }
                  Insert: {
                    "business_name": string,"buyer_type"?: Database["public"]['Enums']["org_type"] | null,"category_codes"?: (string)[],"contact_first_name": string,"contact_last_name": string,"coverage_city"?: string | null,"coverage_pincode"?: string | null,"created_at"?: string,"designation"?: string | null,"email": string,"eula_accepted_at"?: string | null,"eula_agreement_type"?: string | null,"eula_document_hash"?: string | null,"eula_version"?: string | null,"id"?: string,"organization_id"?: string | null,"phone": string,"referral_code"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_code"?: string | null,"side": Database["public"]['Enums']["signup_side"],"status"?: Database["public"]['Enums']["signup_status"],"supplier_id"?: string | null,"tax_registration_id"?: string | null,"updated_at"?: string,"verification_channel"?: Database["public"]['Enums']["verification_channel"],"verified_at"?: string | null
                  }
                  Update: {
                    "business_name"?: string,"buyer_type"?: Database["public"]['Enums']["org_type"] | null,"category_codes"?: (string)[],"contact_first_name"?: string,"contact_last_name"?: string,"coverage_city"?: string | null,"coverage_pincode"?: string | null,"created_at"?: string,"designation"?: string | null,"email"?: string,"eula_accepted_at"?: string | null,"eula_agreement_type"?: string | null,"eula_document_hash"?: string | null,"eula_version"?: string | null,"id"?: string,"organization_id"?: string | null,"phone"?: string,"referral_code"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_code"?: string | null,"side"?: Database["public"]['Enums']["signup_side"],"status"?: Database["public"]['Enums']["signup_status"],"supplier_id"?: string | null,"tax_registration_id"?: string | null,"updated_at"?: string,"verification_channel"?: Database["public"]['Enums']["verification_channel"],"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "signup_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signup_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signup_requests_role_code_fkey"
      columns: ["role_code"]
isOneToOne: false
      referencedRelation: "user_roles"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "signup_requests_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"signup_verification_otps": {
                  Row: {
                    "attempt_count": number,"created_at": string,"expires_at": string,"otp_code": string | null,"otp_code_hash": string | null,"otp_salt": string | null,"phone": string
                  }
                  Insert: {
                    "attempt_count"?: number,"created_at"?: string,"expires_at"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"phone": string
                  }
                  Update: {
                    "attempt_count"?: number,"created_at"?: string,"expires_at"?: string,"otp_code"?: string | null,"otp_code_hash"?: string | null,"otp_salt"?: string | null,"phone"?: string
                  }
                  Relationships: [

                  ]
                },"subcategory_capabilities": {
                  Row: {
                    "capability_id": string,"created_at": string,"id": string,"is_primary": boolean,"subcategory_id": string
                  }
                  Insert: {
                    "capability_id": string,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"subcategory_id": string
                  }
                  Update: {
                    "capability_id"?: string,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"subcategory_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategory_capabilities_capability_id_fkey"
      columns: ["capability_id"]
isOneToOne: false
      referencedRelation: "capabilities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategory_capabilities_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "requirement_subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"subcategory_evaluation_suggestions": {
                  Row: {
                    "created_at": string,"criterion_id": string,"id": string,"subcategory_id": string,"weight": number
                  }
                  Insert: {
                    "created_at"?: string,"criterion_id": string,"id"?: string,"subcategory_id": string,"weight": number
                  }
                  Update: {
                    "created_at"?: string,"criterion_id"?: string,"id"?: string,"subcategory_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategory_evaluation_suggestions_criterion_id_fkey"
      columns: ["criterion_id"]
isOneToOne: false
      referencedRelation: "evaluation_criteria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategory_evaluation_suggestions_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "requirement_subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_payment_logs": {
                  Row: {
                    "amount": number,"billing_cycle": string,"created_at": string,"currency": string,"gateway": string | null,"gateway_event_id": string | null,"gateway_payload": Json | null,"id": string,"new_expires_at": string,"organization_id": string,"payment_method": string,"payment_reference": string,"previous_expires_at": string | null,"profile_id": string | null,"status": string,"tier": string,"upi_id": string | null,"validity_days": number
                  }
                  Insert: {
                    "amount": number,"billing_cycle": string,"created_at"?: string,"currency"?: string,"gateway"?: string | null,"gateway_event_id"?: string | null,"gateway_payload"?: Json | null,"id"?: string,"new_expires_at": string,"organization_id": string,"payment_method"?: string,"payment_reference": string,"previous_expires_at"?: string | null,"profile_id"?: string | null,"status"?: string,"tier": string,"upi_id"?: string | null,"validity_days": number
                  }
                  Update: {
                    "amount"?: number,"billing_cycle"?: string,"created_at"?: string,"currency"?: string,"gateway"?: string | null,"gateway_event_id"?: string | null,"gateway_payload"?: Json | null,"id"?: string,"new_expires_at"?: string,"organization_id"?: string,"payment_method"?: string,"payment_reference"?: string,"previous_expires_at"?: string | null,"profile_id"?: string | null,"status"?: string,"tier"?: string,"upi_id"?: string | null,"validity_days"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_payment_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_payment_logs_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "code": string,"created_at": string,"currency": string,"description": string | null,"features": NonNullable<Json>,"gst_rate": number | null,"id": string,"is_active": boolean,"name": string,"price_extra_rfq": number | null,"price_monthly": number,"price_yearly": number | null,"supplier_state_code": string | null,"tier_code": string | null,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"currency"?: string,"description"?: string | null,"features"?: NonNullable<Json>,"gst_rate"?: number | null,"id"?: string,"is_active"?: boolean,"name": string,"price_extra_rfq"?: number | null,"price_monthly"?: number,"price_yearly"?: number | null,"supplier_state_code"?: string | null,"tier_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"currency"?: string,"description"?: string | null,"features"?: NonNullable<Json>,"gst_rate"?: number | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price_extra_rfq"?: number | null,"price_monthly"?: number,"price_yearly"?: number | null,"supplier_state_code"?: string | null,"tier_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"supplier_capabilities": {
                  Row: {
                    "capability_id": string,"capacity_unit": string | null,"created_at": string,"id": string,"max_capacity_value": number | null,"notes": string | null,"supplier_id": string,"updated_at": string
                  }
                  Insert: {
                    "capability_id": string,"capacity_unit"?: string | null,"created_at"?: string,"id"?: string,"max_capacity_value"?: number | null,"notes"?: string | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "capability_id"?: string,"capacity_unit"?: string | null,"created_at"?: string,"id"?: string,"max_capacity_value"?: number | null,"notes"?: string | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_capabilities_capability_id_fkey"
      columns: ["capability_id"]
isOneToOne: false
      referencedRelation: "capabilities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_capabilities_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_magic_links": {
                  Row: {
                    "channel": Database["public"]['Enums']["messaging_channel"] | null,"created_at": string,"expires_at": string,"id": string,"is_demo": boolean,"rfq_id": string,"supplier_id": string,"token_hash": string,"used_at": string | null,"used_from": string | null
                  }
                  Insert: {
                    "channel"?: Database["public"]['Enums']["messaging_channel"] | null,"created_at"?: string,"expires_at": string,"id"?: string,"is_demo"?: boolean,"rfq_id": string,"supplier_id": string,"token_hash": string,"used_at"?: string | null,"used_from"?: string | null
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["messaging_channel"] | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"is_demo"?: boolean,"rfq_id"?: string,"supplier_id"?: string,"token_hash"?: string,"used_at"?: string | null,"used_from"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_magic_links_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_messaging_channels": {
                  Row: {
                    "channel": Database["public"]['Enums']["messaging_channel"],"created_at": string,"id": string,"last_provider": Database["public"]['Enums']["messaging_provider"] | null,"phone_e164": string,"status": Database["public"]['Enums']["messaging_channel_status"],"supplier_id": string,"updated_at": string,"verified_at": string | null
                  }
                  Insert: {
                    "channel": Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"id"?: string,"last_provider"?: Database["public"]['Enums']["messaging_provider"] | null,"phone_e164": string,"status"?: Database["public"]['Enums']["messaging_channel_status"],"supplier_id": string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"id"?: string,"last_provider"?: Database["public"]['Enums']["messaging_provider"] | null,"phone_e164"?: string,"status"?: Database["public"]['Enums']["messaging_channel_status"],"supplier_id"?: string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_messaging_channels_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_notifications": {
                  Row: {
                    "body": string | null,"channel": Database["public"]['Enums']["messaging_channel"],"created_at": string,"delivered_at": string | null,"demo_run_id": string | null,"external_message_id": string | null,"failure_reason": string | null,"id": string,"invitation_id": string | null,"is_demo": boolean,"provider": Database["public"]['Enums']["messaging_provider"],"read_at": string | null,"rfq_id": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_delivery_status"],"supplier_id": string,"template_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "body"?: string | null,"channel": Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"delivered_at"?: string | null,"demo_run_id"?: string | null,"external_message_id"?: string | null,"failure_reason"?: string | null,"id"?: string,"invitation_id"?: string | null,"is_demo"?: boolean,"provider": Database["public"]['Enums']["messaging_provider"],"read_at"?: string | null,"rfq_id": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_delivery_status"],"supplier_id": string,"template_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"channel"?: Database["public"]['Enums']["messaging_channel"],"created_at"?: string,"delivered_at"?: string | null,"demo_run_id"?: string | null,"external_message_id"?: string | null,"failure_reason"?: string | null,"id"?: string,"invitation_id"?: string | null,"is_demo"?: boolean,"provider"?: Database["public"]['Enums']["messaging_provider"],"read_at"?: string | null,"rfq_id"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_delivery_status"],"supplier_id"?: string,"template_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "supplier_notifications_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_provider_identities": {
                  Row: {
                    "correlation_id": string | null,"discovered_at": string,"id": string,"last_refresh_at": string,"provider": string,"provider_catalogue_id": string | null,"provider_participant_id": string | null,"provider_supplier_id": string | null,"supplier_id": string
                  }
                  Insert: {
                    "correlation_id"?: string | null,"discovered_at"?: string,"id"?: string,"last_refresh_at"?: string,"provider": string,"provider_catalogue_id"?: string | null,"provider_participant_id"?: string | null,"provider_supplier_id"?: string | null,"supplier_id": string
                  }
                  Update: {
                    "correlation_id"?: string | null,"discovered_at"?: string,"id"?: string,"last_refresh_at"?: string,"provider"?: string,"provider_catalogue_id"?: string | null,"provider_participant_id"?: string | null,"provider_supplier_id"?: string | null,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_provider_identities_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_quote_sessions": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"is_demo": boolean,"last_seen_at": string | null,"magic_link_id": string | null,"revoked_at": string | null,"rfq_id": string,"supplier_id": string,"token_hash": string
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"is_demo"?: boolean,"last_seen_at"?: string | null,"magic_link_id"?: string | null,"revoked_at"?: string | null,"rfq_id": string,"supplier_id": string,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"is_demo"?: boolean,"last_seen_at"?: string | null,"magic_link_id"?: string | null,"revoked_at"?: string | null,"rfq_id"?: string,"supplier_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_quote_sessions_magic_link_id_fkey"
      columns: ["magic_link_id"]
isOneToOne: false
      referencedRelation: "supplier_magic_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_quote_sessions_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_scorecards": {
                  Row: {
                    "average_closeout_rating": number,"change_order_frequency_percent": number,"commercial_score": number,"commercial_weight": number,"created_at": string,"critical_disputes_count": number,"delivery_score": number,"delivery_weight": number,"dispute_resolution_adherence": number,"id": string,"is_identity_masked": boolean,"last_calculated_at": string,"milestone_pass_rate": number,"on_time_delivery_percent": number,"organization_id": string | null,"overall_score": number,"performance_tier": string,"quality_score": number,"quality_weight": number,"quote_variance_percent": number,"rework_frequency_percent": number,"sla_dispute_score": number,"sla_dispute_weight": number,"supplier_id": string,"total_disputes_count": number,"total_orders_completed": number,"updated_at": string,"version": number
                  }
                  Insert: {
                    "average_closeout_rating"?: number,"change_order_frequency_percent"?: number,"commercial_score"?: number,"commercial_weight"?: number,"created_at"?: string,"critical_disputes_count"?: number,"delivery_score"?: number,"delivery_weight"?: number,"dispute_resolution_adherence"?: number,"id"?: string,"is_identity_masked"?: boolean,"last_calculated_at"?: string,"milestone_pass_rate"?: number,"on_time_delivery_percent"?: number,"organization_id"?: string | null,"overall_score"?: number,"performance_tier"?: string,"quality_score"?: number,"quality_weight"?: number,"quote_variance_percent"?: number,"rework_frequency_percent"?: number,"sla_dispute_score"?: number,"sla_dispute_weight"?: number,"supplier_id": string,"total_disputes_count"?: number,"total_orders_completed"?: number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "average_closeout_rating"?: number,"change_order_frequency_percent"?: number,"commercial_score"?: number,"commercial_weight"?: number,"created_at"?: string,"critical_disputes_count"?: number,"delivery_score"?: number,"delivery_weight"?: number,"dispute_resolution_adherence"?: number,"id"?: string,"is_identity_masked"?: boolean,"last_calculated_at"?: string,"milestone_pass_rate"?: number,"on_time_delivery_percent"?: number,"organization_id"?: string | null,"overall_score"?: number,"performance_tier"?: string,"quality_score"?: number,"quality_weight"?: number,"quote_variance_percent"?: number,"rework_frequency_percent"?: number,"sla_dispute_score"?: number,"sla_dispute_weight"?: number,"supplier_id"?: string,"total_disputes_count"?: number,"total_orders_completed"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_scorecards_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_scorecards_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: true
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_service_areas": {
                  Row: {
                    "center_lat": number | null,"center_lng": number | null,"city": string | null,"created_at": string,"id": string,"is_primary": boolean,"pincode": string | null,"radius_km": number | null,"supplier_id": string,"updated_at": string
                  }
                  Insert: {
                    "center_lat"?: number | null,"center_lng"?: number | null,"city"?: string | null,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"pincode"?: string | null,"radius_km"?: number | null,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "center_lat"?: number | null,"center_lng"?: number | null,"city"?: string | null,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"pincode"?: string | null,"radius_km"?: number | null,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_service_areas_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_users": {
                  Row: {
                    "created_at": string,"id": string,"profile_id": string,"role": Database["public"]['Enums']["supplier_user_role"],"supplier_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"profile_id": string,"role": Database["public"]['Enums']["supplier_user_role"],"supplier_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"profile_id"?: string,"role"?: Database["public"]['Enums']["supplier_user_role"],"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_users_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_users_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "address": Json | null,"blocked_at": string | null,"blocked_by": string | null,"blocked_reason": string | null,"business_name": string,"capabilities": Json | null,"categories": (string)[],"city": string | null,"completed_jobs": number,"contact_email": string | null,"contact_phone": string | null,"created_at": string,"deleted_at": string | null,"dispute_rate": number | null,"external_place_id": string | null,"gst_details": Json | null,"gst_status": string | null,"gst_verified": boolean | null,"gst_verified_at": string | null,"gstin": string | null,"id": string,"is_demo": boolean,"legacy_verification_status": string | null,"legal_business_name": string | null,"legal_name": string | null,"lifecycle_state": string,"on_time_percent": number | null,"onboarding_claim_token_hash": string | null,"pan": string | null,"pincode": string | null,"rating_avg": number | null,"registered_address": Json | null,"service_area": Json | null,"source": Database["public"]['Enums']["supplier_source"],"source_ref": string | null,"status": Database["public"]['Enums']["supplier_status"],"supply_gst_treatment": Database["public"]['Enums']["supply_gst_treatment"],"trade_name": string | null,"updated_at": string,"verification_notes": string | null,"verification_status": string,"verified_at": string | null
                  }
                  Insert: {
                    "address"?: Json | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"business_name": string,"capabilities"?: Json | null,"categories"?: (string)[],"city"?: string | null,"completed_jobs"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"dispute_rate"?: number | null,"external_place_id"?: string | null,"gst_details"?: Json | null,"gst_status"?: string | null,"gst_verified"?: boolean | null,"gst_verified_at"?: string | null,"gstin"?: string | null,"id"?: string,"is_demo"?: boolean,"legacy_verification_status"?: string | null,"legal_business_name"?: string | null,"legal_name"?: string | null,"lifecycle_state"?: string,"on_time_percent"?: number | null,"onboarding_claim_token_hash"?: string | null,"pan"?: string | null,"pincode"?: string | null,"rating_avg"?: number | null,"registered_address"?: Json | null,"service_area"?: Json | null,"source"?: Database["public"]['Enums']["supplier_source"],"source_ref"?: string | null,"status"?: Database["public"]['Enums']["supplier_status"],"supply_gst_treatment"?: Database["public"]['Enums']["supply_gst_treatment"],"trade_name"?: string | null,"updated_at"?: string,"verification_notes"?: string | null,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "address"?: Json | null,"blocked_at"?: string | null,"blocked_by"?: string | null,"blocked_reason"?: string | null,"business_name"?: string,"capabilities"?: Json | null,"categories"?: (string)[],"city"?: string | null,"completed_jobs"?: number,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"dispute_rate"?: number | null,"external_place_id"?: string | null,"gst_details"?: Json | null,"gst_status"?: string | null,"gst_verified"?: boolean | null,"gst_verified_at"?: string | null,"gstin"?: string | null,"id"?: string,"is_demo"?: boolean,"legacy_verification_status"?: string | null,"legal_business_name"?: string | null,"legal_name"?: string | null,"lifecycle_state"?: string,"on_time_percent"?: number | null,"onboarding_claim_token_hash"?: string | null,"pan"?: string | null,"pincode"?: string | null,"rating_avg"?: number | null,"registered_address"?: Json | null,"service_area"?: Json | null,"source"?: Database["public"]['Enums']["supplier_source"],"source_ref"?: string | null,"status"?: Database["public"]['Enums']["supplier_status"],"supply_gst_treatment"?: Database["public"]['Enums']["supply_gst_treatment"],"trade_name"?: string | null,"updated_at"?: string,"verification_notes"?: string | null,"verification_status"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_blocked_by_fkey"
      columns: ["blocked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "category": string,"created_at": string,"description": string,"id": string,"is_demo": boolean,"page_url": string | null,"priority": string,"resolution_notes": string | null,"resolved_at": string | null,"routed_email": string,"status": string,"subject": string,"ticket_number": string,"updated_at": string,"user_email": string | null,"user_role": string | null,"user_side": string | null
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"description": string,"id"?: string,"is_demo"?: boolean,"page_url"?: string | null,"priority"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"routed_email": string,"status"?: string,"subject": string,"ticket_number": string,"updated_at"?: string,"user_email"?: string | null,"user_role"?: string | null,"user_side"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"is_demo"?: boolean,"page_url"?: string | null,"priority"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"routed_email"?: string,"status"?: string,"subject"?: string,"ticket_number"?: string,"updated_at"?: string,"user_email"?: string | null,"user_role"?: string | null,"user_side"?: string | null
                  }
                  Relationships: [

                  ]
                },"tds_deductions": {
                  Row: {
                    "assessment_year": string,"certificate_number": string | null,"challan_bsr_code": string | null,"challan_date": string | null,"challan_number": string | null,"created_at": string,"created_by": string | null,"deductee_pan": string | null,"financial_year": string,"id": string,"invoice_id": string,"is_lower_deduction": boolean,"law_version": string,"lower_deduction_cert_number": string | null,"organization_id": string,"pan_status": string,"payment_id": string | null,"purchase_order_id": string | null,"section": string,"status": string,"supplier_id": string,"taxable_amount": number,"tds_amount": number,"tds_rate": number,"updated_at": string
                  }
                  Insert: {
                    "assessment_year": string,"certificate_number"?: string | null,"challan_bsr_code"?: string | null,"challan_date"?: string | null,"challan_number"?: string | null,"created_at"?: string,"created_by"?: string | null,"deductee_pan"?: string | null,"financial_year": string,"id"?: string,"invoice_id": string,"is_lower_deduction"?: boolean,"law_version"?: string,"lower_deduction_cert_number"?: string | null,"organization_id": string,"pan_status"?: string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"section": string,"status"?: string,"supplier_id": string,"taxable_amount": number,"tds_amount": number,"tds_rate": number,"updated_at"?: string
                  }
                  Update: {
                    "assessment_year"?: string,"certificate_number"?: string | null,"challan_bsr_code"?: string | null,"challan_date"?: string | null,"challan_number"?: string | null,"created_at"?: string,"created_by"?: string | null,"deductee_pan"?: string | null,"financial_year"?: string,"id"?: string,"invoice_id"?: string,"is_lower_deduction"?: boolean,"law_version"?: string,"lower_deduction_cert_number"?: string | null,"organization_id"?: string,"pan_status"?: string,"payment_id"?: string | null,"purchase_order_id"?: string | null,"section"?: string,"status"?: string,"supplier_id"?: string,"taxable_amount"?: number,"tds_amount"?: number,"tds_rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tds_deductions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tds_deductions_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tds_deductions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tds_deductions_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tds_deductions_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tds_deductions_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "code": string,"created_at": string,"description": string,"is_active": boolean,"label": string,"permissions": (Database["public"]['Enums']["role_permission"])[],"side": Database["public"]['Enums']["signup_side"],"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description": string,"is_active"?: boolean,"label": string,"permissions": (Database["public"]['Enums']["role_permission"])[],"side": Database["public"]['Enums']["signup_side"],"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string,"is_active"?: boolean,"label"?: string,"permissions"?: (Database["public"]['Enums']["role_permission"])[],"side"?: Database["public"]['Enums']["signup_side"],"sort_order"?: number
                  }
                  Relationships: [

                  ]
                },"wallet_transactions": {
                  Row: {
                    "amount": number,"closing_balance": number,"created_at": string,"id": string,"idempotency_key": string | null,"notes": string | null,"opening_balance": number,"organization_id": string,"source_entity_id": string | null,"source_entity_type": string,"tx_type": string,"wallet_id": string
                  }
                  Insert: {
                    "amount": number,"closing_balance": number,"created_at"?: string,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"opening_balance": number,"organization_id": string,"source_entity_id"?: string | null,"source_entity_type": string,"tx_type": string,"wallet_id": string
                  }
                  Update: {
                    "amount"?: number,"closing_balance"?: number,"created_at"?: string,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"opening_balance"?: number,"organization_id"?: string,"source_entity_id"?: string | null,"source_entity_type"?: string,"tx_type"?: string,"wallet_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wallet_transactions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wallet_transactions_wallet_id_fkey"
      columns: ["wallet_id"]
isOneToOne: false
      referencedRelation: "organization_wallets"
      referencedColumns: ["id"]
    }
                  ]
                },"work_order_inspection_items": {
                  Row: {
                    "category": string,"created_at": string,"description": string,"evidence_metadata": NonNullable<Json>,"evidence_urls": (string)[],"id": string,"inspection_id": string,"item_code": string,"notes": string | null,"score": number | null,"status": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"description": string,"evidence_metadata"?: NonNullable<Json>,"evidence_urls"?: (string)[],"id"?: string,"inspection_id": string,"item_code": string,"notes"?: string | null,"score"?: number | null,"status": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"description"?: string,"evidence_metadata"?: NonNullable<Json>,"evidence_urls"?: (string)[],"id"?: string,"inspection_id"?: string,"item_code"?: string,"notes"?: string | null,"score"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_inspection_items_inspection_id_fkey"
      columns: ["inspection_id"]
isOneToOne: false
      referencedRelation: "work_order_inspections"
      referencedColumns: ["id"]
    }
                  ]
                },"work_order_inspections": {
                  Row: {
                    "approved_at": string | null,"checklist_template_code": string,"created_at": string,"digital_signoff_hash": string | null,"evidence_version": number,"id": string,"inspection_type": string,"inspector_id": string,"milestone_id": string,"notes": string | null,"organization_id": string,"overall_score": number | null,"passed": boolean,"rejected_at": string | null,"rework_count": number,"rework_reason": string | null,"status": string,"updated_at": string,"work_order_id": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"checklist_template_code": string,"created_at"?: string,"digital_signoff_hash"?: string | null,"evidence_version"?: number,"id"?: string,"inspection_type": string,"inspector_id": string,"milestone_id": string,"notes"?: string | null,"organization_id": string,"overall_score"?: number | null,"passed"?: boolean,"rejected_at"?: string | null,"rework_count"?: number,"rework_reason"?: string | null,"status"?: string,"updated_at"?: string,"work_order_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"checklist_template_code"?: string,"created_at"?: string,"digital_signoff_hash"?: string | null,"evidence_version"?: number,"id"?: string,"inspection_type"?: string,"inspector_id"?: string,"milestone_id"?: string,"notes"?: string | null,"organization_id"?: string,"overall_score"?: number | null,"passed"?: boolean,"rejected_at"?: string | null,"rework_count"?: number,"rework_reason"?: string | null,"status"?: string,"updated_at"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_inspections_inspector_id_fkey"
      columns: ["inspector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_inspections_milestone_id_fkey"
      columns: ["milestone_id"]
isOneToOne: false
      referencedRelation: "work_order_milestones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_inspections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_inspections_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"work_order_milestones": {
                  Row: {
                    "allocated_amount": number,"buyer_notes": string | null,"created_at": string,"deliverable_photos": (string)[] | null,"id": string,"invoiced_amount": number,"is_invoiced": boolean,"milestone_index": number,"milestone_title": string,"status": string,"submitted_at": string | null,"supplier_notes": string | null,"target_percentage": number,"updated_at": string,"verified_at": string | null,"work_order_id": string
                  }
                  Insert: {
                    "allocated_amount"?: number,"buyer_notes"?: string | null,"created_at"?: string,"deliverable_photos"?: (string)[] | null,"id"?: string,"invoiced_amount"?: number,"is_invoiced"?: boolean,"milestone_index"?: number,"milestone_title": string,"status"?: string,"submitted_at"?: string | null,"supplier_notes"?: string | null,"target_percentage": number,"updated_at"?: string,"verified_at"?: string | null,"work_order_id": string
                  }
                  Update: {
                    "allocated_amount"?: number,"buyer_notes"?: string | null,"created_at"?: string,"deliverable_photos"?: (string)[] | null,"id"?: string,"invoiced_amount"?: number,"is_invoiced"?: boolean,"milestone_index"?: number,"milestone_title"?: string,"status"?: string,"submitted_at"?: string | null,"supplier_notes"?: string | null,"target_percentage"?: number,"updated_at"?: string,"verified_at"?: string | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_milestones_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"work_orders": {
                  Row: {
                    "actual_start": string | null,"buyer_accepted_at": string | null,"completed_at": string | null,"created_at": string,"dispute_status": Database["public"]['Enums']["dispute_status"],"id": string,"inspection_notes": string | null,"is_demo": boolean,"progress_percent": number,"purchase_order_id": string,"rating": number | null,"review_text": string | null,"scheduled_start": string | null,"status": Database["public"]['Enums']["work_order_status"],"supplier_id": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "actual_start"?: string | null,"buyer_accepted_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"dispute_status"?: Database["public"]['Enums']["dispute_status"],"id"?: string,"inspection_notes"?: string | null,"is_demo"?: boolean,"progress_percent"?: number,"purchase_order_id": string,"rating"?: number | null,"review_text"?: string | null,"scheduled_start"?: string | null,"status"?: Database["public"]['Enums']["work_order_status"],"supplier_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "actual_start"?: string | null,"buyer_accepted_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"dispute_status"?: Database["public"]['Enums']["dispute_status"],"id"?: string,"inspection_notes"?: string | null,"is_demo"?: boolean,"progress_percent"?: number,"purchase_order_id"?: string,"rating"?: number | null,"review_text"?: string | null,"scheduled_start"?: string | null,"status"?: Database["public"]['Enums']["work_order_status"],"supplier_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_orders_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "anonymized_supplier_badges": {
                  Row: {
                    "coarse_score_band": string | null,"completed_jobs_range": string | null,"is_identity_masked": boolean | null,"last_calculated_at": string | null,"on_time_delivery_band": string | null,"performance_tier": string | null,"quality_rating_band": string | null,"rfq_id": string | null,"scorecard_id": string | null,"supplier_alias": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"demo_login_options": {
                  Row: {
                    "buyer_type": Database["public"]['Enums']["org_type"] | null,"buyer_type_label": string | null,"description": string | null,"email": string | null,"label": string | null,"party_name": string | null,"persona": string | null,"scenario_code": string | null,"sort_order": number | null,"voting_power": number | null
                  }
                  Relationships: [

                  ]
                },"demo_scenario_board": {
                  Row: {
                    "actual_stage": string | null,"award_status": Database["public"]['Enums']["award_status"] | null,"awarded_at": string | null,"buyer_type": Database["public"]['Enums']["org_type"] | null,"buyer_type_label": string | null,"code": string | null,"default_committee_size": number | null,"has_purchase_order": boolean | null,"members_voted": number | null,"min_quotes_required": number | null,"narrative": string | null,"organization_name": string | null,"public_ref": string | null,"quotes_received": number | null,"requirement_id": string | null,"requirement_status": Database["public"]['Enums']["requirement_status"] | null,"reveal_status": Database["public"]['Enums']["rfq_reveal_status"] | null,"revealed_at": string | null,"rfq_id": string | null,"rfq_status": Database["public"]['Enums']["rfq_status"] | null,"sort_order": number | null,"stage_label": string | null,"suppliers_invited": number | null,"target_stage": string | null,"title": string | null,"voting_power": number | null,"weight_cast": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "demo_scenarios_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "demo_scenarios_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"my_bid_outcome": {
                  Row: {
                    "buyer_released": boolean | null,"decided_at": string | null,"my_alias": string | null,"outcome": string | null,"public_ref": string | null,"rfq_id": string | null,"title": string | null
                  }
                  Relationships: [

                  ]
                },"my_committee_vote": {
                  Row: {
                    "buyer_type": Database["public"]['Enums']["org_type"] | null,"cast_at": string | null,"choice": Database["public"]['Enums']["vote_choice"] | null,"comment": string | null,"recommended_alias": string | null,"recommended_quote_id": string | null,"rfq_id": string | null,"vote_id": string | null,"voting_power": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_recommended_quote_id_fkey"
      columns: ["recommended_quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "committee_votes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"my_quote_outcome": {
                  Row: {
                    "buyer_released": boolean | null,"decided_at": string | null,"my_alias": string | null,"outcome": string | null,"public_ref": string | null,"rfq_id": string | null,"title": string | null
                  }
                  Relationships: [

                  ]
                },"quote_attachments_blind": {
                  Row: {
                    "anonymous_label": string | null,"attachment_id": string | null,"content_type": string | null,"created_at": string | null,"display_name": string | null,"duration_seconds": number | null,"kind": Database["public"]['Enums']["attachment_kind"] | null,"quote_id": string | null,"rfq_id": string | null,"size_bytes": number | null,"storage_path": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quote_attachments_masked": {
                  Row: {
                    "anonymous_label": string | null,"attachment_id": string | null,"content_type": string | null,"created_at": string | null,"display_name": string | null,"duration_seconds": number | null,"kind": Database["public"]['Enums']["attachment_kind"] | null,"quote_id": string | null,"rfq_id": string | null,"size_bytes": number | null,"storage_path": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quote_attachments_revealed": {
                  Row: {
                    "anonymous_label": string | null,"attachment_id": string | null,"business_name": string | null,"content_type": string | null,"created_at": string | null,"display_name": string | null,"duration_seconds": number | null,"kind": Database["public"]['Enums']["attachment_kind"] | null,"original_filename": string | null,"quote_id": string | null,"rfq_id": string | null,"size_bytes": number | null,"storage_path": string | null,"supplier_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "attachments_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_evaluations_blind": {
                  Row: {
                    "anonymous_label": string | null,"breakdown": Json | null,"computed_at": string | null,"evaluation_id": string | null,"evaluation_score": number | null,"quote_id": string | null,"rfq_id": string | null,"status": Database["public"]['Enums']["evaluation_status"] | null,"version_evaluated": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quote_evaluations_masked": {
                  Row: {
                    "anonymous_label": string | null,"breakdown": Json | null,"computed_at": string | null,"evaluation_id": string | null,"evaluation_score": number | null,"quote_id": string | null,"rfq_id": string | null,"status": Database["public"]['Enums']["evaluation_status"] | null,"version_evaluated": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_blind"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_identity_protected"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes_revealed"
      referencedColumns: ["quote_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quote_evaluations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quotes_blind": {
                  Row: {
                    "anonymous_label": string | null,"base_price": number | null,"created_at": string | null,"delivery_days": number | null,"evaluation_score": number | null,"experience_band": string | null,"gst_amount": number | null,"is_gst_verified": boolean | null,"on_time_band": number | null,"payment_terms_days": number | null,"quote_id": string | null,"rating_band": number | null,"rfq_id": string | null,"status": Database["public"]['Enums']["quote_status"] | null,"submitted_at": string | null,"total_cost": number | null,"transport_cost": number | null,"updated_at": string | null,"verification_status": string | null,"version": number | null,"warranty_months": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quotes_identity_protected": {
                  Row: {
                    "anonymous_label": string | null,"base_price": number | null,"cgst_amount": number | null,"comparable_rank": number | null,"comparison_level": string | null,"created_at": string | null,"delivery_days": number | null,"eligible_quote_count": number | null,"evaluation_score": number | null,"experience_band": string | null,"gst_amount": number | null,"igst_amount": number | null,"is_gst_verified": boolean | null,"on_time_band": number | null,"payment_terms_days": number | null,"quote_id": string | null,"rating_band": number | null,"rfq_id": string | null,"sgst_amount": number | null,"status": Database["public"]['Enums']["quote_status"] | null,"submitted_at": string | null,"tax_structure": string | null,"total_cost": number | null,"transport_cost": number | null,"updated_at": string | null,"utgst_amount": number | null,"verification_status": string | null,"version": number | null,"warranty_months": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"quotes_revealed": {
                  Row: {
                    "address": Json | null,"anonymous_label": string | null,"base_price": number | null,"business_name": string | null,"created_at": string | null,"delivery_days": number | null,"email": string | null,"evaluation_score": number | null,"gst_amount": number | null,"gst_status": string | null,"gstin": string | null,"is_gst_verified": boolean | null,"legal_name": string | null,"phone": string | null,"quote_id": string | null,"rfq_id": string | null,"source": Database["public"]['Enums']["supplier_source"] | null,"status": Database["public"]['Enums']["quote_status"] | null,"submitted_at": string | null,"supplier_id": string | null,"supplier_rating": number | null,"total_cost": number | null,"trade_name": string | null,"transport_cost": number | null,"updated_at": string | null,"version": number | null,"warranty_months": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "quotes_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"requirement_attachments_shared": {
                  Row: {
                    "attachment_id": string | null,"content_type": string | null,"created_at": string | null,"display_name": string | null,"duration_seconds": number | null,"kind": Database["public"]['Enums']["attachment_kind"] | null,"requirement_id": string | null,"rfq_id": string | null,"scope": Database["public"]['Enums']["attachment_scope"] | null,"size_bytes": number | null,"storage_path": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    }
                  ]
                },"rfq_buyer_revealed": {
                  Row: {
                    "address": Json | null,"awarded_at": string | null,"awarded_by_email": string | null,"awarded_by_name": string | null,"buyer_organization": string | null,"buyer_type": Database["public"]['Enums']["org_type"] | null,"city": string | null,"contact_email": string | null,"contact_person": string | null,"contact_phone": string | null,"public_ref": string | null,"revealed_at": string | null,"rfq_id": string | null,"tax_registration": string | null,"title": string | null
                  }
                  Relationships: [

                  ]
                },"rfq_clarification_blind": {
                  Row: {
                    "anonymous_label": string | null,"author_display": string | null,"author_side": Database["public"]['Enums']["clarification_author_side"] | null,"body": string | null,"created_at": string | null,"inquiry_category": string | null,"invitation_id": string | null,"is_broadcast": boolean | null,"line_item_ref": string | null,"message_id": string | null,"redactions": (string)[] | null,"rfq_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_clarification_supplier": {
                  Row: {
                    "author_display": string | null,"author_side": Database["public"]['Enums']["clarification_author_side"] | null,"body": string | null,"created_at": string | null,"inquiry_category": string | null,"invitation_id": string | null,"is_broadcast": boolean | null,"line_item_ref": string | null,"message_id": string | null,"redactions": (string)[] | null,"rfq_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_clarifications_masked": {
                  Row: {
                    "anonymous_label": string | null,"author_display": string | null,"author_side": Database["public"]['Enums']["clarification_author_side"] | null,"body": string | null,"created_at": string | null,"inquiry_category": string | null,"invitation_id": string | null,"is_broadcast": boolean | null,"line_item_ref": string | null,"message_id": string | null,"redactions": (string)[] | null,"rfq_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_manager"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfq_invitations_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["invitation_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_clarification_messages_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_invitations_blind": {
                  Row: {
                    "anonymous_label": string | null,"declined_at": string | null,"invitation_id": string | null,"invited_at": string | null,"rfq_id": string | null,"status": Database["public"]['Enums']["invite_status"] | null,"viewed_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_invitations_manager": {
                  Row: {
                    "anonymous_label": string | null,"decline_reason": string | null,"declined_at": string | null,"invitation_id": string | null,"invited_at": string | null,"match_reasons": (string)[] | null,"match_score": number | null,"rfq_id": string | null,"status": Database["public"]['Enums']["invite_status"] | null,"supplier_id": string | null,"viewed_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_invitations_masked": {
                  Row: {
                    "anonymous_label": string | null,"declined_at": string | null,"invitation_id": string | null,"invited_at": string | null,"rfq_id": string | null,"status": Database["public"]['Enums']["invite_status"] | null,"viewed_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_notification_status": {
                  Row: {
                    "anonymous_label": string | null,"channel": Database["public"]['Enums']["messaging_channel"] | null,"delivered_at": string | null,"failed": boolean | null,"read_at": string | null,"rfq_id": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["notification_delivery_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "supplier_notifications_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_supplier_networks": {
                  Row: {
                    "invited_count": number | null,"network": string | null,"quoted_count": number | null,"rfq_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_bid_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "my_quote_outcome"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_buyer_revealed"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfq_vote_tally"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_blind"
      referencedColumns: ["rfq_id"]
    },{
      foreignKeyName: "rfq_invitations_rfq_id_fkey"
      columns: ["rfq_id"]
isOneToOne: false
      referencedRelation: "rfqs_supplier_masked"
      referencedColumns: ["rfq_id"]
    }
                  ]
                },"rfq_vote_tally": {
                  Row: {
                    "anonymous_label": string | null,"last_vote_at": string | null,"quote_id": string | null,"recommend_count": number | null,"recommend_weight": number | null,"rfq_id": string | null,"vote_count": number | null,"weighted_total": number | null
                  }
                  Relationships: [

                  ]
                },"rfqs_supplier_blind": {
                  Row: {
                    "attributes": Json | null,"buyer_display_name": string | null,"buyer_type": Database["public"]['Enums']["org_type"] | null,"category": string | null,"commercial": Json | null,"created_at": string | null,"delivery_city": string | null,"description": string | null,"evaluation_weights": Json | null,"fulfilment_mode": Database["public"]['Enums']["fulfilment_mode"] | null,"invitation_id": string | null,"invited_at": string | null,"min_quotes_required": number | null,"my_alias": string | null,"my_invitation_status": Database["public"]['Enums']["invite_status"] | null,"public_ref": string | null,"quality": Json | null,"quantity": number | null,"quote_deadline": string | null,"required_by_date": string | null,"required_by_days": number | null,"required_by_mode": Database["public"]['Enums']["required_by_mode"] | null,"requirement_mode": Database["public"]['Enums']["requirement_mode"] | null,"rfq_id": string | null,"sourcing_mode": Database["public"]['Enums']["sourcing_mode"] | null,"status": Database["public"]['Enums']["rfq_status"] | null,"subcategory": string | null,"title": string | null,"unit": string | null
                  }
                  Relationships: [

                  ]
                },"rfqs_supplier_masked": {
                  Row: {
                    "attributes": Json | null,"buyer_display_name": string | null,"buyer_type": Database["public"]['Enums']["org_type"] | null,"category": string | null,"commercial": Json | null,"created_at": string | null,"delivery_city": string | null,"description": string | null,"evaluation_weights": Json | null,"fulfilment_mode": Database["public"]['Enums']["fulfilment_mode"] | null,"invitation_id": string | null,"invited_at": string | null,"min_quotes_required": number | null,"my_alias": string | null,"my_invitation_status": Database["public"]['Enums']["invite_status"] | null,"public_ref": string | null,"quality": Json | null,"quantity": number | null,"quote_deadline": string | null,"required_by_date": string | null,"required_by_days": number | null,"required_by_mode": Database["public"]['Enums']["required_by_mode"] | null,"requirement_mode": Database["public"]['Enums']["requirement_mode"] | null,"rfq_id": string | null,"sourcing_mode": Database["public"]['Enums']["sourcing_mode"] | null,"status": Database["public"]['Enums']["rfq_status"] | null,"subcategory": string | null,"title": string | null,"unit": string | null
                  }
                  Relationships: [

                  ]
                }
          }
          Functions: {
            "accept_delivery_inspection":
{ Args: { "p_notes"?: string,"p_rating"?: number,"p_work_order_id": string }; Returns: undefined
                           },
"accept_internal_invitation_atomic":
{ Args: { "p_token": string }; Returns: Json
                           },
"accept_legal_agreement":
{ Args: { "p_agreement_type": string,"p_document_hash": string,"p_version": string }; Returns: Json
                           },
"accept_ondc_discovery_on_search":
{ Args: { "p_bap_id": string,"p_body_digest": string,"p_callback_subscriber": string,"p_candidates": Json,"p_domain": string,"p_environment": string,"p_message_id": string,"p_observation_source": string,"p_observed_at": string,"p_transaction_id": string }; Returns: Json
                           },
"accept_organization_invitation_atomic":
{ Args: { "p_token": string }; Returns: Json
                           },
"acknowledge_po_platform_fee_atomic":
{ Args: { "p_policy_id"?: string,"p_purchase_order_id": string }; Returns: Json
                           },
"activate_legal_enforcement":
{ Args: { "p_actor_profile_id": string,"p_rollout_at": string }; Returns: Json
                           },
"add_settlement_exception_event_atomic":
{ Args: { "p_event_type": string,"p_exception_id": string,"p_notes": string,"p_to_status"?: string }; Returns: Json
                           },
"admin_assign_profile_role":
{ Args: { "p_code": string,"p_make_active"?: boolean,"p_profile_id": string }; Returns: Json
                           },
"admin_bulk_block_organizations":
{ Args: { "p_is_supplier": boolean,"p_org_ids": (string)[],"p_reason": string }; Returns: Json
                           },
"admin_bulk_block_users":
{ Args: { "p_reason": string,"p_user_ids": (string)[] }; Returns: Json
                           },
"admin_bulk_delete_organizations":
{ Args: { "p_is_supplier": boolean,"p_org_ids": (string)[],"p_soft_delete"?: boolean }; Returns: Json
                           },
"admin_bulk_delete_users":
{ Args: { "p_soft_delete"?: boolean,"p_user_ids": (string)[] }; Returns: Json
                           },
"admin_bulk_unblock_organizations":
{ Args: { "p_is_supplier": boolean,"p_org_ids": (string)[] }; Returns: Json
                           },
"admin_bulk_unblock_users":
{ Args: { "p_user_ids": (string)[] }; Returns: Json
                           },
"admin_bypass_approval_gate":
{ Args: { "p_reason": string,"p_requirement_id": string }; Returns: Json
                           },
"admin_clear_audit_logs_and_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           } |
{ Args: { "p_mode"?: string }; Returns: Json
                           },
"admin_clear_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           } |
{ Args: { "p_mode"?: string,"p_profile_id"?: string }; Returns: Json
                           },
"admin_create_db_backup":
{ Args: { "p_name": string,"p_type"?: string }; Returns: Json
                           },
"admin_execute_service_action":
{ Args: { "p_action": string,"p_entity_id"?: string,"p_payload"?: Json }; Returns: Json
                           },
"admin_fix_buyer_issue":
{ Args: { "p_issue_type": string,"p_notes"?: string,"p_organization_id"?: string,"p_requirement_id"?: string }; Returns: Json
                           },
"admin_fix_seller_issue":
{ Args: { "p_issue_type": string,"p_notes"?: string,"p_rfq_id"?: string,"p_supplier_id"?: string }; Returns: Json
                           },
"admin_force_transition_order_state":
{ Args: { "p_reason": string,"p_requirement_id": string,"p_target_state": string }; Returns: Json
                           },
"admin_generate_proactive_maintenance_alerts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_all_notifications":
{ Args: { "p_filter"?: string,"p_limit"?: number,"p_offset"?: number }; Returns: Json
                           } |
{ Args: { "p_filter"?: string,"p_limit"?: number,"p_mode"?: string,"p_offset"?: number }; Returns: Json
                           },
"admin_get_audit_trail":
{ Args: { "p_correlation_id"?: string,"p_entity_type"?: string,"p_limit"?: number,"p_mode"?: string,"p_offset"?: number }; Returns: Json
                           },
"admin_get_db_backups":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_entity_audit_trail":
{ Args: { "p_entity_id": string }; Returns: Json
                           },
"admin_get_live_transactions":
{ Args: { "p_limit"?: number,"p_mode"?: string,"p_offset"?: number,"p_stalled_only"?: boolean,"p_status"?: string }; Returns: Json
                           },
"admin_get_seller_orders":
{ Args: { "p_limit"?: number,"p_mode"?: string,"p_offset"?: number,"p_status"?: string,"p_supplier_id"?: string }; Returns: Json
                           },
"admin_get_signup_requests":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"admin_get_support_tickets":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_mode"?: string,"p_offset"?: number,"p_status"?: string }; Returns: Json
                           },
"admin_get_system_alerts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_system_health":
{ Args: { "p_mode"?: string }; Returns: Json
                           },
"admin_get_system_mode":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_users_and_organizations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_list_contact_enquiries":
{ Args: { "p_limit"?: number,"p_status"?: string }; Returns: {
              "category": string,
"created_at": string,
"email": string,
"id": string,
"message": string,
"name": string,
"notification_attempted_at": string | null,
"notification_status": string,
"organisation": string | null,
"payload_fingerprint": string,
"phone": string | null,
"reference": string,
"retention_expires_at": string,
"status": string,
"subject": string,
"submission_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "contact_enquiries"
        isOneToOne: false
        isSetofReturn: true
      } },
"admin_list_duplicate_live_tds":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_manage_announcement":
{ Args: { "p_action": string,"p_id"?: string,"p_payload"?: Json }; Returns: Json
                           },
"admin_mark_all_notifications_read":
{ Args: { "p_filter"?: string }; Returns: Json
                           },
"admin_mark_notification_read":
{ Args: { "p_notification_id": string }; Returns: Json
                           },
"admin_purge_all_transactional_records":
{ Args: Record<PropertyKey, never>; Returns: Json
                           } |
{ Args: { "p_confirmation_token"?: string }; Returns: Json
                           },
"admin_resolve_support_ticket":
{ Args: { "p_notes"?: string,"p_status": string,"p_ticket_id": string }; Returns: Json
                           },
"admin_restore_db_backup":
{ Args: { "p_mode"?: string,"p_snapshot_id"?: string }; Returns: Json
                           },
"admin_retry_invoice_payment_webhook":
{ Args: { "p_invoice_id": string,"p_reason"?: string }; Returns: Json
                           },
"admin_review_signup_request":
{ Args: { "p_action"?: string,"p_initial_password"?: string,"p_notes"?: string,"p_request_id": string }; Returns: Json
                           },
"admin_run_buyer_diagnostics":
{ Args: { "p_organization_id"?: string,"p_requirement_id"?: string }; Returns: Json
                           },
"admin_run_diagnostic_query":
{ Args: { "p_sql": string }; Returns: Json
                           },
"admin_run_seller_diagnostics":
{ Args: { "p_rfq_id"?: string,"p_supplier_id"?: string }; Returns: Json
                           },
"admin_run_test_case":
{ Args: { "p_test_id": string,"p_test_name"?: string }; Returns: Json
                           },
"admin_search_entities":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: Json
                           } |
{ Args: { "p_limit"?: number,"p_mode"?: string,"p_query": string }; Returns: Json
                           },
"admin_set_contact_enquiry_status":
{ Args: { "p_id": string,"p_status": string }; Returns: undefined
                           },
"admin_simulate_po_acceptance":
{ Args: { "p_po_id": string,"p_reason"?: string }; Returns: Json
                           },
"admin_toggle_demo_mode":
{ Args: { "p_enabled": boolean }; Returns: Json
                           },
"admin_toggle_entity_gst_compliance":
{ Args: { "p_entity_id": string,"p_entity_type": string,"p_reason"?: string,"p_tax_exempt"?: boolean,"p_verified"?: boolean }; Returns: Json
                           },
"admin_toggle_maintenance_mode":
{ Args: { "p_enabled": boolean,"p_message"?: string }; Returns: Json
                           },
"admin_toggle_supplier_network_stub":
{ Args: { "p_enabled": boolean }; Returns: Json
                           },
"admin_unblock_sealed_quote":
{ Args: { "p_quote_id": string,"p_reason"?: string }; Returns: Json
                           },
"advance_ondc_discovery_dispatch":
{ Args: { "p_failure_reason": string,"p_message_id": string,"p_status": string,"p_transaction_id": string }; Returns: Json
                           },
"advance_procurement_step":
{ Args: { "p_expected_current_step": number,"p_next_step": number,"p_order_id"?: string,"p_payload"?: Json,"p_requirement_id": string,"p_rfq_id"?: string,"p_step_code": string,"p_step_title": string }; Returns: Json
                           },
"advance_rfq_phases":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"allocate_advance_payment_atomic":
{ Args: { "p_amount": number,"p_idempotency_key"?: string,"p_invoice_id": string,"p_notes"?: string,"p_payment_id": string }; Returns: Json
                           } |
{ Args: { "p_allocated_by"?: string,"p_amount": number,"p_idempotency_key"?: string,"p_invoice_id": string,"p_notes"?: string,"p_payment_id": string }; Returns: Json
                           },
"apply_platform_fee_deduction_atomic":
{ Args: { "p_gross_amount"?: number,"p_invoice_id": string,"p_organization_id": string,"p_payment_allocation_id"?: string,"p_payment_id"?: string,"p_purchase_order_id": string }; Returns: Json
                           },
"apply_tds_withholding_atomic":
{ Args: { "p_deductee_pan"?: string,"p_invoice_id": string,"p_is_lower_deduction"?: boolean,"p_law_version"?: string,"p_lower_deduction_cert"?: string,"p_organization_id": string,"p_pan_status"?: string,"p_section": string,"p_taxable_amount": number,"p_tds_rate": number }; Returns: Json
                           },
"apply_wallet_credits_to_subscription_atomic":
{ Args: { "p_credits_to_apply": number,"p_cycle": string,"p_idempotency_key"?: string,"p_org_id": string,"p_tier": string }; Returns: Json
                           },
"appoint_org_role_atomic":
{ Args: { "p_appointment_event"?: string,"p_authority_scope"?: Json,"p_effective_from"?: string,"p_effective_to"?: string,"p_organization_id": string,"p_person_id": string,"p_responsibility_scope"?: string,"p_role_category"?: string,"p_role_id": string,"p_role_name": string,"p_term_duration_days"?: number }; Returns: Json
                           },
"approve_milestone_inspection_atomic":
{ Args: { "p_approver_id": string,"p_digital_signoff_hash": string,"p_inspection_id": string,"p_notes"?: string }; Returns: Json
                           },
"approve_platform_privilege":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"assert_production_data_integrity":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"assign_my_role":
{ Args: { "p_code": string }; Returns: Json
                           },
"authorize_staff_referral_achievement":
{ Args: { "p_achievement_id": string,"p_amount_inr"?: number }; Returns: Json
                           },
"auto_submit_pilot_quotes":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"award_runner_up_quote":
{ Args: { "p_reason"?: string,"p_rfq_id": string }; Returns: Json
                           },
"backfill_taxonomy":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"bootstrap_platform_operators":
{ Args: { "p_founder": string,"p_reason": string,"p_second_admin": string }; Returns: undefined
                           },
"break_glass_platform_account":
{ Args: { "p_is_founder": boolean,"p_is_platform_admin": boolean,"p_reason": string,"p_status": string,"p_subject": string }; Returns: undefined
                           },
"cancel_purchase_order_atomic":
{ Args: { "p_po_id": string,"p_reason": string }; Returns: Json
                           },
"cancel_staff_referral_payout":
{ Args: { "p_payout_id": string,"p_reason": string }; Returns: Json
                           },
"cast_committee_vote":
{ Args: { "p_choice": Database["public"]['Enums']["vote_choice"],"p_comment"?: string,"p_recommended_quote_id": string,"p_rfq_id": string }; Returns: Json
                           },
"change_password_secure":
{ Args: { "p_current_password": string,"p_new_password": string }; Returns: Json
                           },
"check_and_increment_rate_limit":
{ Args: { "p_client_key": string,"p_endpoint": string,"p_max_requests": number,"p_window_seconds": number }; Returns: Json
                           },
"check_contact_enquiry_rate_limit":
{ Args: { "p_client_key": string }; Returns: Json
                           },
"check_supplier_award_eligibility_atomic":
{ Args: { "p_award_id": string }; Returns: Json
                           },
"classify_requirement_text":
{ Args: { "p_text": string }; Returns: {
              "score": number,"subcategory_code": string,"subcategory_id": string
            }[]
                           },
"clear_all_transactional_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"close_accounting_period_atomic":
{ Args: { "p_org_id": string,"p_period_id": string }; Returns: Json
                           },
"close_clarification_for_evaluation":
{ Args: { "p_rfq_id": string }; Returns: undefined
                           },
"close_initial_quoting":
{ Args: { "p_rfq_id": string }; Returns: undefined
                           },
"commit_po_change_order_atomic":
{ Args: { "p_change_order_id": string,"p_organization_id": string }; Returns: Json
                           },
"complete_supplier_onboarding_atomic":
{ Args: { "p_address": Json,"p_contact_email": string,"p_contact_person": string,"p_contact_phone": string,"p_gstin": string,"p_legal_name": string,"p_pan": string,"p_token": string,"p_trade_name": string }; Returns: Json
                           },
"compute_decision_receipt_digest_v1":
{ Args: { "p_receipt": Json }; Returns: string
                           },
"compute_procurement_a4_digest_v1":
{ Args: { "p_input": Json }; Returns: string
                           },
"compute_quote_evaluations":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"compute_supplier_scorecard_atomic":
{ Args: { "p_supplier_id": string,"p_trigger_type"?: string }; Returns: Json
                           },
"configure_approval_policy_atomic":
{ Args: { "p_organization_id": string,"p_policy_name": string,"p_prevent_self_approval"?: boolean,"p_require_dual_signoff_above"?: number,"p_tiers": Json }; Returns: Json
                           },
"confirm_attachment_upload":
{ Args: { "p_attachment_id": string,"p_size_bytes"?: number }; Returns: undefined
                           },
"confirm_intent_to_award_and_unmask":
{ Args: { "p_commitment_note"?: string,"p_quote_id": string,"p_rfq_id": string }; Returns: Json
                           },
"create_attachment_slot":
{ Args: { "p_content_type": string,"p_duration_seconds"?: number,"p_kind": Database["public"]['Enums']["attachment_kind"],"p_original_filename": string,"p_quote_id": string,"p_requirement_id": string,"p_scope": Database["public"]['Enums']["attachment_scope"],"p_size_bytes"?: number }; Returns: Json
                           },
"create_delegation_proxy_atomic":
{ Args: { "p_delegatee_id": string,"p_expires_at"?: string,"p_notes"?: string,"p_organization_id": string,"p_permissions": (string)[],"p_spend_cap"?: number,"p_starts_at"?: string }; Returns: Json
                           },
"create_internal_invitation_atomic":
{ Args: { "p_email": string,"p_role_id": string }; Returns: Json
                           },
"create_organization_invitation_atomic":
{ Args: { "p_email": string,"p_expires_days"?: number,"p_organization_id": string,"p_role"?: string }; Returns: Json
                           },
"create_purchase_order_from_award":
{ Args: { "p_award_id": string }; Returns: Json
                           },
"create_support_ticket":
{ Args: { "p_category": string,"p_description": string,"p_page_url"?: string,"p_priority"?: string,"p_subject": string,"p_user_email"?: string,"p_user_role"?: string,"p_user_side"?: string }; Returns: Json
                           },
"create_system_notification":
{ Args: { "p_action_type"?: string,"p_body": string,"p_event_type"?: string,"p_link"?: string,"p_payload"?: Json,"p_profile_id": string,"p_title": string }; Returns: string
                           },
"credit_buyer_settlement_reward_atomic":
{ Args: { "p_base_amount"?: number,"p_fee_rate"?: number,"p_idempotency_key"?: string,"p_org_id": string,"p_platform_fee_tx_id": string,"p_reward_share_rate"?: number,"p_settlement_id"?: string }; Returns: Json
                           },
"credit_otp_referral_bonus_atomic":
{ Args: { "p_beneficiary_org_id": string,"p_client_amount"?: number,"p_idempotency_key"?: string,"p_referred_org_id": string,"p_referred_profile_kind": string,"p_referrer_org_id": string,"p_referrer_persona": string,"p_referrer_supplier_id"?: string,"p_source_entity_id": string }; Returns: Json
                           },
"credit_supplier_wallet_event_atomic":
{ Args: { "p_beneficiary_org_id": string,"p_client_amount"?: number,"p_event_type": string,"p_idempotency_key"?: string,"p_referred_profile_kind"?: string,"p_source_entity_id": string }; Returns: Json
                           },
"current_legal_snapshot_text":
{ Args: { "p_agreement_type": string }; Returns: Json
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"deactivate_buyer_address_atomic":
{ Args: { "p_address_id": string,"p_replacement_address_id"?: string }; Returns: Json
                           },
"declared_payment_splits":
{ Args: { "p_structure": string }; Returns: Json
                           },
"demo_generate_quotes":
{ Args: { "p_count"?: number,"p_rfq_id": string,"p_status"?: Database["public"]['Enums']["quote_status"] }; Returns: Json
                           },
"demo_generate_votes":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"demo_may_simulate_messaging":
{ Args: { "p_rfq_id": string }; Returns: boolean
                           },
"demo_messaging_outbox":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"demo_messaging_recipients":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"demo_messaging_sender":
{ Args: { "p_alias": string,"p_rfq_id": string }; Returns: Json
                           },
"demo_messaging_thread":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"demo_record_reply":
{ Args: { "p_alias": string,"p_body": string,"p_rfq_id": string,"p_template_id"?: string }; Returns: string
                           },
"demo_reset":
{ Args: { "p_restage"?: boolean }; Returns: Json
                           },
"demo_send_notification":
{ Args: { "p_alias": string,"p_body": string,"p_rfq_id": string,"p_template_id"?: string }; Returns: string
                           },
"demo_simulate_supplier_message":
{ Args: { "p_alias": string,"p_body": string,"p_message_id"?: string,"p_parsed"?: Json,"p_rfq_id": string }; Returns: Json
                           },
"demo_stage_scenario":
{ Args: { "p_code": string }; Returns: Json
                           },
"demo_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"discover_and_invite_for_rfq":
{ Args: { "p_exclude"?: (string)[],"p_limit"?: number,"p_network"?: string,"p_rfq_id": string }; Returns: Json
                           },
"dispatch_notification_event_atomic":
{ Args: { "p_category": string,"p_channel": string,"p_idempotency_key"?: string,"p_is_identity_masked"?: boolean,"p_organization_id"?: string,"p_payload"?: Json,"p_recipient_address": string,"p_recipient_user_id": string,"p_template_code": string }; Returns: Json
                           },
"ensure_buyer_organization":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"escalate_dispute_atomic":
{ Args: { "p_actor_id": string,"p_actor_role": string,"p_assign_to"?: string,"p_dispute_id": string,"p_reason": string }; Returns: Json
                           },
"evaluate_and_stamp_approval_route_atomic":
{ Args: { "p_procurement_amount": number,"p_rfq_id": string }; Returns: Json
                           },
"execute_demo_user_deletion":
{ Args: { "p_confirmation_token": string,"p_outcome": string,"p_reason": string,"p_target_profile_id": string }; Returns: Json
                           },
"execute_settlement_reconciliation_atomic":
{ Args: { "p_invoice_id": string,"p_organization_id": string,"p_payment_id"?: string,"p_utr_amount"?: number,"p_utr_number"?: string }; Returns: Json
                           },
"find_ondc_discovery_dispatch":
{ Args: { "p_correlation_id"?: string,"p_idempotency_key"?: string,"p_transaction_id"?: string }; Returns: Json
                           },
"generate_procurement_contract_atomic":
{ Args: { "p_document_hash": string,"p_markdown_body": string,"p_quote_id": string,"p_rfq_id": string,"p_supplier_id": string,"p_terms": Json }; Returns: Json
                           },
"get_active_announcements":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_active_org_role_holder":
{ Args: { "p_at_time"?: string,"p_organization_id": string,"p_role_id": string }; Returns: Json
                           },
"get_buyer_addresses":
{ Args: { "p_org_id"?: string }; Returns: Json
                           },
"get_buyer_pilot_allowance":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"get_canonical_subscription_price":
{ Args: { "p_currency"?: string,"p_cycle": string,"p_tier": string }; Returns: Json
                           },
"get_current_procurement_step":
{ Args: { "p_requirement_id": string }; Returns: Json
                           },
"get_financial_observability_summary":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"get_founder_executive_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_founder_google_places_budget_today":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_ledger_balance_summary":
{ Args: { "p_org_id": string,"p_period_id"?: string }; Returns: Json
                           },
"get_maintenance_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_org_role_history":
{ Args: { "p_organization_id": string,"p_role_id"?: string }; Returns: Json
                           },
"get_organization_spend_analytics":
{ Args: { "p_from_date"?: string,"p_organization_id": string,"p_to_date"?: string }; Returns: Json
                           },
"get_organization_subscription":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"get_organization_wallet":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"get_po_settlement_summary":
{ Args: { "p_po_id": string }; Returns: Json
                           },
"get_purchase_order_invoicing_summary":
{ Args: { "p_po_id": string }; Returns: Json
                           },
"get_vendor_settlement_statement":
{ Args: { "p_from_date"?: string,"p_organization_id": string,"p_supplier_id": string,"p_to_date"?: string }; Returns: Json
                           },
"get_wallet_transactions":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_organization_id": string }; Returns: Json
                           },
"grant_legal_reviewer":
{ Args: { "p_actor": string,"p_can_activate": boolean,"p_can_authorize": boolean,"p_can_decide": boolean,"p_can_register": boolean,"p_external_record_ref": string,"p_grantee": string }; Returns: undefined
                           },
"individual_ownership_migration_report":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"infer_indian_state_from_pincode":
{ Args: { "p_pincode": string }; Returns: string
                           },
"ingest_supplier_message":
{ Args: { "p_message": Json }; Returns: Json
                           },
"initialize_standard_chart_of_accounts_atomic":
{ Args: { "p_org_id": string }; Returns: number
                           },
"initialize_work_order":
{ Args: { "p_po_id": string }; Returns: Json
                           },
"insert_ondc_discovery_dispatch":
{ Args: { "p_buyer_requested_pin": string,"p_category_label": string,"p_city": string,"p_correlation_id": string,"p_domain": string,"p_environment": string,"p_expected_bap_id": string,"p_idempotency_key": string,"p_message_id": string,"p_observation_source": string,"p_otp_transaction_id": string,"p_requirement_mode": string,"p_subcategory_code": string,"p_transaction_id": string }; Returns: Json
                           },
"invalidate_bank_reconciliation_atomic":
{ Args: { "p_reason": string,"p_reconciliation_id": string }; Returns: Json
                           },
"invite_direct_supplier":
{ Args: { "p_contact_kind": string,"p_contact_value": string,"p_rfq_id": string }; Returns: Json
                           },
"invite_org_member":
{ Args: { "p_email": string,"p_organization_id": string,"p_role"?: string }; Returns: Json
                           },
"issue_activation_credential_otp":
{ Args: { "p_email": string,"p_full_name": string,"p_phone": string }; Returns: Json
                           },
"issue_credit_debit_note_atomic":
{ Args: { "p_amount": number,"p_idempotency_key"?: string,"p_invoice_id": string,"p_note_number"?: string,"p_note_type": string,"p_organization_id": string,"p_reason"?: string,"p_tax_amount"?: number }; Returns: Json
                           },
"issue_document_snapshot_atomic":
{ Args: { "p_actor_profile_id"?: string,"p_document_kind": string,"p_document_number": string,"p_generated_at": string,"p_idempotency_key": string,"p_identity_state": string,"p_organization_id": string,"p_payload_json": Json,"p_persona": string,"p_perspective": string,"p_source_entity_id": string,"p_source_entity_type": string,"p_source_supplier_id": string,"p_supersede_prior_active"?: boolean,"p_template_version": string,"p_transaction_refs": Json,"p_verification_algorithm": string,"p_verification_digest": string,"p_visibility_context": Json }; Returns: Json
                           },
"issue_profile_credential_otp":
{ Args: { "p_credential_type": string,"p_credential_value": string,"p_profile_id": string }; Returns: Json
                           },
"issue_supplier_magic_link":
{ Args: { "p_channel"?: Database["public"]['Enums']["messaging_channel"],"p_rfq_id": string,"p_supplier_id": string,"p_ttl"?: string }; Returns: string
                           },
"list_org_delegations":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"list_org_invitations":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"list_org_members":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"location_pin_coverage_assert_generation_lock":
{ Args: { "p_lock_token": string,"p_scope_key": string }; Returns: boolean
                           },
"location_pin_coverage_assess":
{ Args: { "p_freshness_days"?: number,"p_scope_key": string }; Returns: Json
                           },
"location_pin_coverage_build_scope_key":
{ Args: { "p_category": string,"p_city": string,"p_pincode": string,"p_state": string }; Returns: string
                           },
"location_pin_coverage_complete_generation":
{ Args: { "p_error_code"?: string,"p_lock_token": string,"p_scope_key": string,"p_status": string }; Returns: boolean
                           },
"location_pin_coverage_drop_unreachable":
{ Args: { "p_place_ids": (string)[],"p_scope_key": string }; Returns: number
                           },
"location_pin_coverage_ensure_scope_row":
{ Args: { "p_category": string,"p_city": string,"p_pincode": string,"p_scope_key": string,"p_state": string }; Returns: undefined
                           },
"location_pin_coverage_list_due_retries":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"location_pin_coverage_list_recovery_jobs":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"location_pin_coverage_list_suppliers":
{ Args: { "p_scope_key": string }; Returns: Json
                           },
"location_pin_coverage_reserve_google_calls":
{ Args: { "p_calls": number,"p_daily_limit"?: number }; Returns: Json
                           },
"location_pin_coverage_retry_generation":
{ Args: { "p_scope_key": string }; Returns: boolean
                           },
"location_pin_coverage_try_acquire_generation":
{ Args: { "p_lock_token": string,"p_scope_key": string,"p_stale_minutes"?: number }; Returns: string
                           },
"location_pin_coverage_upsert_suppliers":
{ Args: { "p_category": string,"p_city": string,"p_pincode": string,"p_scope_key": string,"p_state": string,"p_suppliers": Json }; Returns: number
                           },
"lock_and_reveal_award_atomic":
{ Args: { "p_auto_reveal"?: boolean,"p_justification": string,"p_quote_id": string,"p_rfq_id": string }; Returns: Json
                           },
"lock_award":
{ Args: { "p_justification": string,"p_quote_id": string,"p_rfq_id": string }; Returns: Json
                           },
"log_client_audit_event":
{ Args: { "p_entity_id": string,"p_entity_type": string,"p_event_type": string,"p_is_demo"?: boolean,"p_organization_id"?: string,"p_payload"?: Json }; Returns: Json
                           },
"lookup_market_intelligence":
{ Args: { "p_category_code": string,"p_city"?: string,"p_subcategory_code": string }; Returns: Json
                           },
"mark_contact_enquiry_notification":
{ Args: { "p_id": string,"p_status": string }; Returns: undefined
                           },
"mark_my_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"messaging_quote_context":
{ Args: { "p_session_token": string }; Returns: Json
                           },
"my_demo_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_legal_acceptance_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_role_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"open_dispute_atomic":
{ Args: { "p_category": string,"p_counterparty_organization_id"?: string,"p_currency"?: string,"p_description": string,"p_disputed_amount"?: number,"p_entity_id": string,"p_entity_type": string,"p_opened_by": string,"p_organization_id": string,"p_severity": string,"p_title": string }; Returns: Json
                           },
"organization_rfq_quote_counts":
{ Args: { "p_organization_id": string }; Returns: {
              "quotes_count": number,"rfq_id": string
            }[]
                           },
"platform_admin_set_organization_subscription_status":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"platform_heartbeat":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"post_broadcast_clarification_atomic":
{ Args: { "p_body": string,"p_inquiry_category"?: string,"p_line_item_ref"?: string,"p_rfq_id": string }; Returns: Json
                           },
"post_journal_entry_atomic":
{ Args: { "p_entry_type": string,"p_idempotency_key"?: string,"p_lines"?: Json,"p_narration": string,"p_org_id": string,"p_period_id": string,"p_source_entity_id"?: string,"p_source_entity_type"?: string }; Returns: Json
                           },
"preview_demo_user_deletion":
{ Args: { "p_target_profile_id": string }; Returns: Json
                           },
"preview_discovery_reach":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"process_pilot_simulated_purchase":
{ Args: { "p_idempotency_key": string,"p_organization_id": string,"p_product_type": string }; Returns: Json
                           },
"process_rfq_cancellation":
{ Args: { "p_detailed_notes": string,"p_reason_code": Database["public"]['Enums']["exit_reason_code"],"p_rfq_id": string,"p_supporting_doc_id"?: string }; Returns: Json
                           },
"process_staff_referral_payout":
{ Args: { "p_finance_reference_id": string,"p_payout_id": string,"p_reconciliation_evidence"?: Json }; Returns: Json
                           },
"process_subscription_payment":
{ Args: { "p_amount": number,"p_cycle": string,"p_organization_id": string,"p_payment_ref": string,"p_tier": string,"p_upi_id"?: string }; Returns: Json
                           },
"publish_requirement":
{ Args: { "p_min_quotes_required"?: number,"p_quote_deadline_days"?: number,"p_requirement_id": string,"p_sourcing_mode"?: Database["public"]['Enums']["sourcing_mode"],"p_weights"?: Json,"p_weights_source"?: string }; Returns: Json
                           },
"purge_expired_contact_enquiries":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"purge_expired_unsuccessful_rfqs":
{ Args: { "p_retention_days"?: number }; Returns: Json
                           },
"reconcile_bank_utr_atomic":
{ Args: { "p_bank_name"?: string,"p_bank_reference"?: string,"p_cleared_amount": number,"p_cleared_date": string,"p_organization_id": string,"p_payment_id"?: string,"p_utr_number": string }; Returns: Json
                           },
"reconcile_internal_invitation_atomic":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"record_audit_ping_response":
{ Args: { "p_notes"?: string,"p_party_side": string,"p_ping_id": string,"p_response_code": string }; Returns: Json
                           },
"record_buyer_performance_review":
{ Args: { "p_actual_delivery_days": number,"p_notes"?: string,"p_quality_rating": number,"p_rfq_id": string }; Returns: string
                           },
"record_erp_export_manifest_atomic":
{ Args: { "p_batch_reference": string,"p_export_type": string,"p_organization_id": string,"p_payload_checksum_sha256": string,"p_payment_id"?: string,"p_purchase_order_id"?: string,"p_record_count": number,"p_total_amount": number }; Returns: Json
                           },
"record_invoice_payment_atomic":
{ Args: { "p_amount": number,"p_currency"?: string,"p_idempotency_key"?: string,"p_invoice_id": string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes"?: string,"p_purchase_order_id"?: string,"p_reference"?: string }; Returns: Json
                           },
"record_legal_decision":
{ Args: { "p_actor": string,"p_decision": string,"p_external_record_ref": string,"p_notes"?: string,"p_snapshot_id": string }; Returns: string
                           },
"record_notification_delivery":
{ Args: { "p_external_message_id": string,"p_failure_reason"?: string,"p_provider": Database["public"]['Enums']["messaging_provider"],"p_status": Database["public"]['Enums']["notification_delivery_status"] }; Returns: boolean
                           },
"record_notification_failure_with_backoff":
{ Args: { "p_error_msg": string,"p_event_id": string }; Returns: Json
                           },
"record_org_action_audit_atomic":
{ Args: { "p_action": string,"p_actor_person_id": string,"p_entity_id": string,"p_entity_type": string,"p_organization_id": string,"p_payload"?: Json,"p_transaction_id"?: string }; Returns: Json
                           },
"record_outbound_message":
{ Args: { "p_message": Json }; Returns: string
                           },
"record_supplier_notification":
{ Args: { "p_notification": Json }; Returns: string
                           },
"record_verified_payment":
{ Args: { "p_amount"?: number,"p_billing_cycle"?: string,"p_currency"?: string,"p_gateway"?: string,"p_gateway_event_id"?: string,"p_gateway_payload"?: Json,"p_invoice_id"?: string,"p_organization_id"?: string,"p_payment_reference"?: string,"p_payment_type": string,"p_tier"?: string }; Returns: Json
                           },
"record_verified_personal_subscription_payment":
{ Args: { "p_amount": number,"p_billing_cycle": string,"p_currency": string,"p_gateway": string,"p_gateway_event_id": string,"p_gateway_payload"?: Json,"p_payment_reference": string,"p_profile_id": string,"p_tier": string }; Returns: Json
                           },
"redact_message_body":
{ Args: { "p_body": string }; Returns: Json
                           },
"redeem_supplier_magic_link":
{ Args: { "p_from"?: string,"p_token": string }; Returns: Json
                           },
"refresh_supplier_performance":
{ Args: { "p_supplier_id": string }; Returns: undefined
                           },
"register_legal_snapshot":
{ Args: { "p_actor": string,"p_agreement_type": string,"p_body": string,"p_version": string }; Returns: string
                           },
"reject_milestone_inspection_atomic":
{ Args: { "p_inspection_id": string,"p_notes"?: string,"p_rejector_id": string,"p_rework_reason": string }; Returns: Json
                           },
"reject_staff_referral_achievement":
{ Args: { "p_achievement_id": string,"p_reason": string }; Returns: Json
                           },
"remove_org_member":
{ Args: { "p_organization_id": string,"p_profile_id": string }; Returns: Json
                           },
"renew_or_rotate_org_role_atomic":
{ Args: { "p_assignment_id": string,"p_continue_in_governance": boolean,"p_effective_date"?: string,"p_notes"?: string,"p_renewal_role_id"?: string,"p_renewal_role_name"?: string,"p_term_duration_days"?: number }; Returns: Json
                           },
"reopen_accounting_period_atomic":
{ Args: { "p_org_id": string,"p_period_id": string,"p_reason"?: string }; Returns: Json
                           },
"request_platform_privilege":
{ Args: { "p_claim": string,"p_reason": string,"p_subject": string,"p_value": boolean }; Returns: string
                           },
"request_profile_credential_otp":
{ Args: { "p_credential_type": string,"p_credential_value": string }; Returns: Json
                           },
"request_profile_verification_otp":
{ Args: { "p_phone": string }; Returns: Json
                           },
"request_whatsapp_password_reset":
{ Args: { "p_identifier": string }; Returns: Json
                           },
"resolve_audit_actor":
{ Args: { "p_actor_id": string }; Returns: {
              "actor_id": string,"auth_user_id": string,"email": string,"full_name": string,"profile_deleted_at": string,"profile_id": string
            }[]
                           },
"resolve_declared_payment_structure":
{ Args: { "p_terms": string }; Returns: string
                           },
"resolve_dispute_atomic":
{ Args: { "p_actor_role": string,"p_dispute_id": string,"p_resolution_category": string,"p_resolution_summary": string,"p_resolved_by": string }; Returns: Json
                           },
"resolve_settlement_exception_atomic":
{ Args: { "p_exception_id": string,"p_resolution_notes": string }; Returns: Json
                           },
"reveal_award":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"reverse_journal_entry_atomic":
{ Args: { "p_journal_id": string,"p_org_id": string,"p_reversal_reason"?: string }; Returns: Json
                           },
"reverse_payment_allocation_atomic":
{ Args: { "p_allocation_id": string,"p_idempotency_key"?: string,"p_reason": string }; Returns: Json
                           },
"review_signup_request":
{ Args: { "p_action": string,"p_initial_password"?: string,"p_notes"?: string,"p_request_id": string }; Returns: Json
                           },
"revise_supplier_quote_atomic":
{ Args: { "p_notes"?: string,"p_quote_id": string,"p_snapshot": Json }; Returns: Json
                           },
"revoke_delegation_proxy_atomic":
{ Args: { "p_delegation_id": string }; Returns: Json
                           },
"revoke_internal_invitation_atomic":
{ Args: { "p_invitation_id": string,"p_reason": string }; Returns: Json
                           },
"revoke_legal_reviewer":
{ Args: { "p_actor": string,"p_external_record_ref": string,"p_grantee": string }; Returns: undefined
                           },
"revoke_org_role_atomic":
{ Args: { "p_assignment_id": string,"p_effective_to"?: string,"p_removal_event"?: string,"p_removal_reason"?: string }; Returns: Json
                           },
"revoke_organization_invitation_atomic":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"rfq_by_public_ref":
{ Args: { "p_public_ref": string }; Returns: string
                           },
"rfq_phase":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"rfq_voting_summary":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"role_catalog":
{ Args: { "p_side"?: Database["public"]['Enums']["signup_side"] }; Returns: Json
                           },
"run_proactive_maintenance_scan":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"seed_simulated_quotes_for_rfq":
{ Args: { "p_count"?: number,"p_rfq_id": string }; Returns: Json
                           },
"served_cities":
{ Args: Record<PropertyKey, never>; Returns: {
              "city": string
            }[]
                           },
"service_categories":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"description": string,"name": string,"sort_order": number
            }[]
                           },
"set_organization_credentials":
{ Args: { "p_address"?: Json,"p_city"?: string,"p_contact_email"?: string,"p_contact_person"?: string,"p_contact_phone"?: string,"p_organization_id": string,"p_tax_registration"?: string }; Returns: Json
                           },
"set_password_secure":
{ Args: { "p_new_password": string }; Returns: Json
                           },
"set_rfq_evaluation_weights":
{ Args: { "p_rfq_id": string,"p_source"?: string,"p_weights": Json }; Returns: Json
                           },
"set_rfq_schedule":
{ Args: { "p_bid_deadline"?: string,"p_evaluation_deadline"?: string,"p_revision_deadline"?: string,"p_rfq_id": string }; Returns: Json
                           },
"sign_commercial_commitment_and_unmask":
{ Args: { "p_commitment_note"?: string,"p_quote_id": string,"p_rfq_id": string }; Returns: Json
                           },
"sign_procurement_contract_atomic":
{ Args: { "p_contract_id": string,"p_party_type": string,"p_signature_hash": string }; Returns: Json
                           },
"subcategory_attribute_schema":
{ Args: { "p_subcategory_id": string }; Returns: {
              "applies_to_modes": (Database["public"]['Enums']["requirement_mode"])[],"attribute_id": string,"code": string,"data_type": Database["public"]['Enums']["attribute_data_type"],"help_text": string,"is_required": boolean,"label": string,"match_patterns": (string)[],"options": Json,"placeholder": string,"scope": string,"sort_order": number,"unit": string,"validation": Json
            }[]
                           },
"submit_contact_enquiry":
{ Args: { "p_category": string,"p_email": string,"p_message": string,"p_name": string,"p_organisation": string,"p_phone": string,"p_subject": string,"p_submission_id": string }; Returns: Json
                           },
"submit_messaging_quote":
{ Args: { "p_quote": Json,"p_session_token": string }; Returns: Json
                           },
"submit_milestone_inspection_atomic":
{ Args: { "p_checklist_template_code": string,"p_inspection_type": string,"p_inspector_id": string,"p_items": Json,"p_milestone_id": string,"p_notes"?: string,"p_organization_id": string,"p_work_order_id": string }; Returns: Json
                           },
"submit_rfq_tier_approval_atomic":
{ Args: { "p_comments"?: string,"p_decision": string,"p_rfq_id": string,"p_signature_hash"?: string,"p_stage_order": number }; Returns: Json
                           } |
{ Args: { "p_delegation_id"?: string,"p_notes"?: string,"p_rfq_id": string,"p_tier_level": string }; Returns: Json
                           },
"submit_signup_request":
{ Args: { "p_request": Json }; Returns: Json
                           },
"submit_supplier_quote_atomic":
{ Args: { "p_invitation_id": string,"p_notes"?: string,"p_rfq_id": string,"p_snapshot": Json,"p_supplier_id": string }; Returns: Json
                           },
"subscription_pricing_report":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"suggest_evaluation_weights":
{ Args: { "p_requirement_id": string }; Returns: Json
                           },
"supplier_message_queue":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"supplier_rfq_message_payload":
{ Args: { "p_rfq_id": string,"p_supplier_id": string }; Returns: Json
                           },
"switch_active_organization":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"switch_active_role":
{ Args: { "p_code": string }; Returns: Json
                           },
"switch_portal_side":
{ Args: { "p_side": Database["public"]['Enums']["signup_side"] }; Returns: Json
                           },
"sync_po_settlement_reconciliations_atomic":
{ Args: { "p_po_id": string }; Returns: Json
                           },
"transfer_org_role_succession_atomic":
{ Args: { "p_authority_scope"?: Json,"p_effective_date"?: string,"p_organization_id": string,"p_predecessor_new_role"?: string,"p_predecessor_person_id"?: string,"p_reason"?: string,"p_responsibility_scope"?: string,"p_role_id": string,"p_role_name"?: string,"p_succession_event"?: string,"p_successor_person_id"?: string,"p_term_duration_days"?: number }; Returns: Json
                           },
"transition_purchase_order":
{ Args: { "p_expected_from_status"?: Database["public"]['Enums']["purchase_order_status"],"p_po_id": string,"p_to_status": Database["public"]['Enums']["purchase_order_status"] }; Returns: Json
                           },
"unlock_award_decision":
{ Args: { "p_rfq_id": string }; Returns: Json
                           },
"update_my_organization_name":
{ Args: { "p_organization_id"?: string,"p_organization_name": string }; Returns: Json
                           },
"update_my_profile":
{ Args: { "p_avatar_url"?: string,"p_full_name": string,"p_title"?: string }; Returns: Json
                           },
"update_notification_preferences_atomic":
{ Args: { "p_category_opt_outs"?: (string)[],"p_channel_preferences"?: Json,"p_email"?: string,"p_organization_id"?: string,"p_phone_number"?: string,"p_quiet_hours_end"?: string,"p_quiet_hours_start"?: string,"p_user_id": string }; Returns: Json
                           },
"update_team_member_role_atomic":
{ Args: { "p_new_role": string,"p_organization_id": string,"p_profile_id": string }; Returns: Json
                           },
"update_user_heartbeat":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"upsert_buyer_address_atomic":
{ Args: { "p_address_id"?: string,"p_address_type"?: string,"p_city": string,"p_contact_person"?: string,"p_contact_phone"?: string,"p_country"?: string,"p_is_primary"?: boolean,"p_label": string,"p_landmark"?: string,"p_line1": string,"p_line2"?: string,"p_org_id"?: string,"p_pincode": string,"p_state": string,"p_state_code"?: string }; Returns: Json
                           },
"upsert_supplier_business_address":
{ Args: { "p_city": string,"p_country"?: string,"p_line1": string,"p_line2": string,"p_pincode": string,"p_state": string,"p_supplier_id": string }; Returns: Json
                           },
"verify_and_update_profile_credential":
{ Args: { "p_credential_type": string,"p_credential_value": string,"p_otp_code": string }; Returns: Json
                           },
"verify_issued_document_digest":
{ Args: { "p_document_id": string }; Returns: Json
                           },
"verify_org_authority_at_time":
{ Args: { "p_amount"?: number,"p_at_time"?: string,"p_organization_id": string,"p_permission": string,"p_person_id": string }; Returns: Json
                           },
"verify_profile_verification_otp":
{ Args: { "p_otp_code": string,"p_phone": string }; Returns: Json
                           },
"verify_supplier_gstin":
{ Args: { "p_details"?: Json,"p_gstin": string,"p_supplier_id": string }; Returns: Json
                           },
"verify_whatsapp_password_reset":
{ Args: { "p_identifier": string,"p_new_password": string,"p_otp_code": string }; Returns: Json
                           },
"waive_rfq_quote_quorum":
{ Args: { "p_reason": string,"p_rfq_id": string }; Returns: Json
                           }
          }
          Enums: {
            "announcement_audience": "ALL"|"BUYER"|"SUPPLIER"|"ADMIN","announcement_category": "NEW_VERSION"|"NEW_FEATURE"|"BUG_FIX"|"SECURITY_UPDATE"|"BROWSER_SUPPORT"|"PLANNED_MAINTENANCE"|"EMERGENCY_MAINTENANCE"|"SERVICE_RESTORATION"|"PLATFORM_NOTICE","announcement_severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL","announcement_status": "DRAFT"|"SCHEDULED"|"PUBLISHED"|"EXPIRED"|"ARCHIVED","approval_instance_status": "PENDING"|"APPROVED"|"REJECTED"|"EXPIRED","approval_policy_type": "COMMUNITY_SIMPLE_MAJORITY"|"UNANIMOUS"|"MANAGER_ONLY","attachment_kind": "DRAWING"|"PHOTO"|"HANDWRITTEN"|"DOCUMENT"|"VOICE_NOTE","attachment_scope": "REQUIREMENT"|"QUOTE","attribute_data_type": "TEXT"|"NUMBER"|"BOOLEAN"|"ENUM"|"MULTI_ENUM"|"DATE","award_status": "LOCKED"|"PENDING_REVEAL"|"REVEALED","cancellation_stage": "PRE_QUOTE"|"POST_QUOTE_PRE_AWARD"|"POST_AWARD_PRE_REVEAL"|"POST_REVEAL_PRE_PO"|"POST_PO_EXECUTION","clarification_author_side": "BUYER"|"SUPPLIER","coi_status": "DECLARED_NONE"|"DECLARED_CONFLICT"|"WAIVED","criterion_direction": "LOWER_IS_BETTER"|"HIGHER_IS_BETTER","dispute_status": "NONE"|"OPEN"|"RESOLVED","evaluation_status": "PENDING"|"COMPUTED"|"STALE","exit_reason_code": "BUDGET_CANCELLED"|"INTERNAL_REORGANIZATION"|"SPECIFICATION_CHANGED"|"SUPPLIER_UNRESPONSIVE_POST_REVEAL"|"SUPPLIER_FAILED_SITE_INSPECTION"|"PROCUREMENT_TIMELINE_DEFERRED"|"PRICING_EXCEEDED_BUDGET_CEILING"|"OTHER","fulfilment_mode": "SUPPLIER_DELIVERY"|"BUYER_PICKUP"|"SUPPLIER_ONSITE"|"REMOTE"|"LOGISTICS_REQUIRED","invite_status": "INVITED"|"VIEWED"|"DECLINED"|"QUOTED","invoice_status": "SUBMITTED"|"APPROVED"|"REJECTED"|"PARTIALLY_PAID"|"PAID","messaging_channel": "SMS"|"WHATSAPP","messaging_channel_status": "PENDING"|"VERIFIED"|"SUSPENDED"|"RETIRED","messaging_direction": "INBOUND"|"OUTBOUND","messaging_processing_status": "RECEIVED"|"ACCEPTED"|"REJECTED"|"UNPARSEABLE"|"DUPLICATE"|"FAILED","messaging_provider": "TWILIO"|"META"|"MOCK"|"WAHA","notification_channel": "IN_APP"|"EMAIL","notification_delivery_status": "QUEUED"|"SENT"|"DELIVERED"|"READ"|"FAILED","notification_status": "PENDING"|"SENT"|"READ"|"FAILED","org_member_role": "OWNER"|"MANAGER"|"BUYER"|"APPROVER"|"COMMITTEE_MEMBER","org_type": "INDIVIDUAL"|"MSME"|"COMMUNITY"|"ENTERPRISE"|"INSTITUTION","payment_gateway_status": "NOT_APPLICABLE"|"PENDING"|"PROCESSING"|"SUCCEEDED"|"FAILED"|"CANCELLED","payment_method": "MANUAL"|"UPI"|"BANK_TRANSFER"|"OTHER","payment_status": "RECORDED"|"VERIFIED"|"DISPUTED","purchase_order_status": "DRAFT"|"PENDING_APPROVAL"|"APPROVED"|"ISSUED"|"ACCEPTED"|"IN_PROGRESS"|"COMPLETED"|"CANCELLED","quote_source": "WEB"|"WHATSAPP"|"SMS"|"DEMO_GENERATED","quote_status": "DRAFT"|"DRAFT_FROM_MESSAGING"|"SUBMITTED"|"REVISED"|"FINAL"|"SELECTED"|"NOT_SELECTED"|"WITHDRAWN","required_by_mode": "IMMEDIATE"|"WITHIN_DAYS"|"SPECIFIC_DATE"|"FLEXIBLE","requirement_mode": "PRODUCT_MATERIAL"|"SERVICE"|"REPAIR_MAINTENANCE"|"JOB_WORK"|"PROJECT_CONTRACT"|"RENTAL_HIRE"|"AMC"|"COMMODITY_TRADING"|"LOGISTICS"|"PROFESSIONAL_SERVICE"|"OTHER","requirement_status": "DRAFT"|"SUBMITTED"|"RFQ_CREATED"|"QUOTING"|"NEGOTIATION"|"EVALUATION"|"AWARDED"|"IN_PROGRESS"|"COMPLETED"|"CANCELLED","requirement_type": "PRODUCT"|"SERVICE"|"PROJECT","rfq_reveal_status": "BLIND"|"PROTECTED"|"REVEALED","rfq_status": "DRAFT"|"OPEN"|"CLARIFICATION"|"CLOSED"|"EVALUATING"|"AWARDED"|"CANCELLED"|"UNSUCCESSFUL"|"EXPIRED","role_permission": "READ"|"WRITE"|"PROPOSE"|"VOTE"|"APPROVE"|"AWARD","signup_side": "BUYER"|"SUPPLIER"|"CONSOLE","signup_status": "PENDING"|"CONTACTED"|"VERIFIED"|"ONBOARDED"|"REJECTED","sourcing_mode": "OPEN_RFQ"|"IDENTITY_PROTECTED"|"INVITE_SELECTED"|"NETWORK_DISCOVERY"|"PREVIOUS_SUPPLIERS"|"OPEN_RFQ_TENDER","supplier_source": "DIRECT"|"ONDC"|"BNI"|"ASSOCIATION"|"REFERRAL"|"LOCAL_REGISTRY"|"OTHER","supplier_status": "PENDING"|"ACTIVE"|"SUSPENDED","supplier_user_role": "OWNER"|"MANAGER"|"OPERATOR","supplier_verification_status": "UNVERIFIED"|"SELF_DECLARED"|"DOCUMENT_VERIFIED"|"PLATFORM_VERIFIED","supply_gst_treatment": "REGULAR_TAXABLE"|"UNREGISTERED"|"COMPOSITION"|"EXEMPT"|"NIL_RATED"|"ZERO_RATED"|"REVIEW_REQUIRED","verification_channel": "EMAIL"|"WHATSAPP","vote_choice": "RECOMMEND"|"ABSTAIN"|"OPPOSE","work_order_status": "NOT_STARTED"|"IN_PROGRESS"|"COMPLETED"|"DISPUTED"
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
            "announcement_audience": ["ALL", "BUYER", "SUPPLIER", "ADMIN"],"announcement_category": ["NEW_VERSION", "NEW_FEATURE", "BUG_FIX", "SECURITY_UPDATE", "BROWSER_SUPPORT", "PLANNED_MAINTENANCE", "EMERGENCY_MAINTENANCE", "SERVICE_RESTORATION", "PLATFORM_NOTICE"],"announcement_severity": ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],"announcement_status": ["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED", "ARCHIVED"],"approval_instance_status": ["PENDING", "APPROVED", "REJECTED", "EXPIRED"],"approval_policy_type": ["COMMUNITY_SIMPLE_MAJORITY", "UNANIMOUS", "MANAGER_ONLY"],"attachment_kind": ["DRAWING", "PHOTO", "HANDWRITTEN", "DOCUMENT", "VOICE_NOTE"],"attachment_scope": ["REQUIREMENT", "QUOTE"],"attribute_data_type": ["TEXT", "NUMBER", "BOOLEAN", "ENUM", "MULTI_ENUM", "DATE"],"award_status": ["LOCKED", "PENDING_REVEAL", "REVEALED"],"cancellation_stage": ["PRE_QUOTE", "POST_QUOTE_PRE_AWARD", "POST_AWARD_PRE_REVEAL", "POST_REVEAL_PRE_PO", "POST_PO_EXECUTION"],"clarification_author_side": ["BUYER", "SUPPLIER"],"coi_status": ["DECLARED_NONE", "DECLARED_CONFLICT", "WAIVED"],"criterion_direction": ["LOWER_IS_BETTER", "HIGHER_IS_BETTER"],"dispute_status": ["NONE", "OPEN", "RESOLVED"],"evaluation_status": ["PENDING", "COMPUTED", "STALE"],"exit_reason_code": ["BUDGET_CANCELLED", "INTERNAL_REORGANIZATION", "SPECIFICATION_CHANGED", "SUPPLIER_UNRESPONSIVE_POST_REVEAL", "SUPPLIER_FAILED_SITE_INSPECTION", "PROCUREMENT_TIMELINE_DEFERRED", "PRICING_EXCEEDED_BUDGET_CEILING", "OTHER"],"fulfilment_mode": ["SUPPLIER_DELIVERY", "BUYER_PICKUP", "SUPPLIER_ONSITE", "REMOTE", "LOGISTICS_REQUIRED"],"invite_status": ["INVITED", "VIEWED", "DECLINED", "QUOTED"],"invoice_status": ["SUBMITTED", "APPROVED", "REJECTED", "PARTIALLY_PAID", "PAID"],"messaging_channel": ["SMS", "WHATSAPP"],"messaging_channel_status": ["PENDING", "VERIFIED", "SUSPENDED", "RETIRED"],"messaging_direction": ["INBOUND", "OUTBOUND"],"messaging_processing_status": ["RECEIVED", "ACCEPTED", "REJECTED", "UNPARSEABLE", "DUPLICATE", "FAILED"],"messaging_provider": ["TWILIO", "META", "MOCK", "WAHA"],"notification_channel": ["IN_APP", "EMAIL"],"notification_delivery_status": ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"],"notification_status": ["PENDING", "SENT", "READ", "FAILED"],"org_member_role": ["OWNER", "MANAGER", "BUYER", "APPROVER", "COMMITTEE_MEMBER"],"org_type": ["INDIVIDUAL", "MSME", "COMMUNITY", "ENTERPRISE", "INSTITUTION"],"payment_gateway_status": ["NOT_APPLICABLE", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],"payment_method": ["MANUAL", "UPI", "BANK_TRANSFER", "OTHER"],"payment_status": ["RECORDED", "VERIFIED", "DISPUTED"],"purchase_order_status": ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],"quote_source": ["WEB", "WHATSAPP", "SMS", "DEMO_GENERATED"],"quote_status": ["DRAFT", "DRAFT_FROM_MESSAGING", "SUBMITTED", "REVISED", "FINAL", "SELECTED", "NOT_SELECTED", "WITHDRAWN"],"required_by_mode": ["IMMEDIATE", "WITHIN_DAYS", "SPECIFIC_DATE", "FLEXIBLE"],"requirement_mode": ["PRODUCT_MATERIAL", "SERVICE", "REPAIR_MAINTENANCE", "JOB_WORK", "PROJECT_CONTRACT", "RENTAL_HIRE", "AMC", "COMMODITY_TRADING", "LOGISTICS", "PROFESSIONAL_SERVICE", "OTHER"],"requirement_status": ["DRAFT", "SUBMITTED", "RFQ_CREATED", "QUOTING", "NEGOTIATION", "EVALUATION", "AWARDED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],"requirement_type": ["PRODUCT", "SERVICE", "PROJECT"],"rfq_reveal_status": ["BLIND", "PROTECTED", "REVEALED"],"rfq_status": ["DRAFT", "OPEN", "CLARIFICATION", "CLOSED", "EVALUATING", "AWARDED", "CANCELLED", "UNSUCCESSFUL", "EXPIRED"],"role_permission": ["READ", "WRITE", "PROPOSE", "VOTE", "APPROVE", "AWARD"],"signup_side": ["BUYER", "SUPPLIER", "CONSOLE"],"signup_status": ["PENDING", "CONTACTED", "VERIFIED", "ONBOARDED", "REJECTED"],"sourcing_mode": ["OPEN_RFQ", "IDENTITY_PROTECTED", "INVITE_SELECTED", "NETWORK_DISCOVERY", "PREVIOUS_SUPPLIERS", "OPEN_RFQ_TENDER"],"supplier_source": ["DIRECT", "ONDC", "BNI", "ASSOCIATION", "REFERRAL", "LOCAL_REGISTRY", "OTHER"],"supplier_status": ["PENDING", "ACTIVE", "SUSPENDED"],"supplier_user_role": ["OWNER", "MANAGER", "OPERATOR"],"supplier_verification_status": ["UNVERIFIED", "SELF_DECLARED", "DOCUMENT_VERIFIED", "PLATFORM_VERIFIED"],"supply_gst_treatment": ["REGULAR_TAXABLE", "UNREGISTERED", "COMPOSITION", "EXEMPT", "NIL_RATED", "ZERO_RATED", "REVIEW_REQUIRED"],"verification_channel": ["EMAIL", "WHATSAPP"],"vote_choice": ["RECOMMEND", "ABSTAIN", "OPPOSE"],"work_order_status": ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DISPUTED"]
          }
        }
} as const


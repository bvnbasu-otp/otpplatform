-- STATUS: UNAPPLIED
-- Review proposal only. This file is intentionally outside supabase/migrations.
-- It has not been applied to a local or hosted database.
--
-- Two-phase, server-authorized deletion for disposable demo/QA profiles only.
-- Eligibility is based solely on public.profiles.is_demo. Email, name, title,
-- and other caller-controlled strings are never used to classify a target.
--
-- The workflow inventories every direct foreign key to public.profiles(id) and
-- auth.users(id) and classifies each one only through the reviewed manifest in
-- private_security.demo_user_deletion_fk_manifest(). Table names are never
-- pattern-matched. Retained dependencies block deletion when populated. A
-- foreign key missing from the manifest, a composite foreign key, or a delete
-- action that differs from the reviewed action blocks even at zero rows.
-- No constraint is disabled, deferred, or dropped, and no DELETE statement uses
-- CASCADE. Deleting the auth.users row relies only on the existing CASCADE
-- actions of the manifest-listed Auth tables whose action matched at preview.
--
-- Manifest review basis: read-only pg_constraint inventory of the local schema
-- at migration 00313 plus the 00315 audit_actor_identities proposal.
--
-- Prerequisites: reviewed 00315 audit actor preservation, 00316 founder
-- SUPER_ADMIN guards, and 00321 immutable demo-marker guard. Promote 00321
-- before this proposal despite its later review number. This proposal refuses
-- installation without all three.

BEGIN;

DO $preconditions$
BEGIN
  IF to_regclass('public.audit_actor_identities') IS NULL
     OR to_regprocedure('private.maintain_audit_actor_identity()') IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_PRECONDITION_FAILED: reviewed 00315 audit actor preservation is required';
  END IF;
  IF to_regprocedure('private_security.guard_founder_superadmin_active_role()') IS NULL
     OR to_regprocedure('private_security.guard_founder_superadmin_profile_role()') IS NULL
     OR to_regprocedure('private_security.guard_founder_superadmin_internal_assignment()') IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_PRECONDITION_FAILED: reviewed 00316 founder SUPER_ADMIN guards are required';
  END IF;
  IF to_regprocedure('private_security.guard_profile_is_demo_marker()') IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_PRECONDITION_FAILED: reviewed 00321 immutable demo-marker guard is required';
  END IF;
END
$preconditions$;

CREATE TABLE private_security.demo_user_deletion_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,
  requester_profile_id uuid NOT NULL,
  target_profile_id uuid NOT NULL,
  target_auth_user_id uuid NOT NULL,
  state_fingerprint text NOT NULL,
  preview_payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  executed_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT demo_user_deletion_preview_expiry_order
    CHECK (expires_at > created_at)
);

COMMENT ON TABLE private_security.demo_user_deletion_previews IS
  'Short-lived server-side confirmation records for disposable demo/QA deletion. Target UUIDs deliberately have no foreign keys so execution can remove the target while retaining confirmation evidence.';

REVOKE ALL ON TABLE private_security.demo_user_deletion_previews FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private_security.effective_superadmin_requester()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $fn$
DECLARE
  v_requester uuid;
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(auth.role(), '') IS DISTINCT FROM 'authenticated'
     OR nullif(current_setting('request.jwt.claim.role', true), '') IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_DENIED: authenticated user context required'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id
    INTO v_requester
  FROM public.profiles p
  JOIN public.profile_roles pr
    ON pr.profile_id = p.id
   AND pr.role_code = 'SUPER_ADMIN'
  JOIN public.user_roles ur
    ON ur.code = pr.role_code
   AND ur.is_active IS TRUE
  JOIN public.internal_user_assignments ua
    ON ua.profile_id = p.id
  JOIN public.internal_roles ir
    ON ir.id = ua.role_id
   AND ir.code = 'SUPER_ADMIN'
  WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
    AND p.is_platform_admin IS TRUE
    AND p.active_role_code = 'SUPER_ADMIN'
    AND COALESCE(p.status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED')
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_DENIED: effective active SUPER_ADMIN holding required'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_requester;
END;
$fn$;

-- Non-blocking dispositions are limited to account-bound rows that the execute
-- step deletes explicitly, existing Auth session/credential cascades, the
-- target profile itself, and 00315 audit actor evidence that survives with a
-- null profile link. Every other row blocks deletion when populated.
-- self_exclusion_column: rows owned by the target through that column are
-- deleted by the plan, so only references from other accounts block.
CREATE FUNCTION private_security.demo_user_deletion_fk_manifest()
RETURNS TABLE (
  source_schema text,
  source_table text,
  source_column text,
  delete_action text,
  category text,
  disposition text,
  self_exclusion_column text
)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $manifest$
SELECT * FROM (VALUES
  ('auth', 'identities', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'mfa_factors', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'mfa_recovery_code_sets', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'oauth_authorizations', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'oauth_consents', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'one_time_tokens', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'sessions', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'webauthn_challenges', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'webauthn_credentials', 'user_id', 'CASCADE', 'auth_identity', 'existing_auth_ephemeral_cascade', NULL),
  ('auth', 'scim_users', 'user_id', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'profiles', 'auth_user_id', 'CASCADE', 'account_core', 'delete_target_profile_explicitly', NULL),
  ('private', 'password_history', 'profile_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'demo_accounts', 'profile_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'notification_preferences', 'user_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'profile_verification_otps', 'profile_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'profile_roles', 'profile_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'internal_user_assignments', 'profile_id', 'CASCADE', 'account_core', 'delete_allowlisted_before_profile', NULL),
  ('public', 'audit_actor_identities', 'profile_id', 'SET NULL', 'audit_history', 'preserve_evidence_set_null', NULL),
  ('public', 'attachments', 'uploaded_by', 'NO ACTION', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'audit_events', 'actor_id', 'NO ACTION', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'issued_document_snapshots', 'generated_by', 'NO ACTION', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'issued_document_snapshots', 'owner_profile_id', 'NO ACTION', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'issued_document_status_audits', 'changed_by', 'NO ACTION', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'org_governance_action_audits', 'actor_person_id', 'RESTRICT', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'procurement_stage_events', 'actor_profile_id', 'SET NULL', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'scorecard_dimension_history', 'calculated_by', 'SET NULL', 'audit_history', 'block_retained_dependency', NULL),
  ('public', 'legal_acceptances', 'profile_id', 'CASCADE', 'legal_evidence', 'block_retained_dependency', NULL),
  ('public', 'legal_agreement_approvals', 'approver_profile_id', 'RESTRICT', 'legal_evidence', 'block_retained_dependency', NULL),
  ('public', 'legal_review_grants', 'profile_id', 'RESTRICT', 'legal_evidence', 'block_retained_dependency', NULL),
  ('public', 'awards', 'awarded_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'awards', 'unmasked_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'committee_assignments', 'profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'committee_votes', 'profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'conflict_of_interest_declarations', 'profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'conflict_of_interest_declarations', 'waived_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'delivery_inspections', 'inspector_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'dispute_events', 'actor_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'dispute_evidence', 'uploaded_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'disputes', 'assigned_to', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'disputes', 'opened_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'disputes', 'resolved_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'pilot_purchase_attempts', 'initiated_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'pilot_purchase_attempts', 'owner_profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'po_change_orders', 'approved_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'po_change_orders', 'committed_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'po_change_orders', 'requested_by', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'procurement_contracts', 'buyer_signed_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'procurement_contracts', 'supplier_signed_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'purchase_orders', 'cancelled_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'purchase_orders', 'owner_profile_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'quote_versions', 'created_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'requirements', 'created_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'requirements', 'owner_profile_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfq_approval_route_evaluations', 'evaluated_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfq_approval_stages', 'approver_profile_id', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfq_approval_stages', 'delegator_profile_id', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfq_cancellations', 'cancelled_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfq_clarification_messages', 'author_profile_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfqs', 'created_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'rfqs', 'owner_profile_id', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'work_order_inspections', 'inspector_id', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'accounting_periods', 'closed_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'accounting_periods', 'locked_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'accounting_periods', 'reopened_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'bank_reconciliation_records', 'reconciled_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'credit_debit_notes', 'created_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'erp_export_manifests', 'exported_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_achievements', 'authorized_by', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_achievements', 'employee_profile_id', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_payouts', 'cancelled_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_payouts', 'employee_profile_id', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_payouts', 'processed_by', 'RESTRICT', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'internal_referral_plans', 'created_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'issued_document_personal_counters', 'owner_profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'journal_entries', 'posted_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'payment_allocations', 'allocated_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'payments', 'recorded_by', 'NO ACTION', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'personal_subscription_payment_logs', 'profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'personal_subscriptions', 'profile_id', 'CASCADE', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'po_fee_snapshots', 'acknowledged_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'settlement_exception_events', 'actor_id', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'settlement_exceptions', 'assigned_to', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'settlement_exceptions', 'resolved_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'settlement_reconciliations', 'reconciled_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'subscription_payment_logs', 'profile_id', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'tds_deductions', 'created_by', 'SET NULL', 'procurement_finance_tax', 'block_retained_dependency', NULL),
  ('public', 'buyer_addresses', 'profile_id', 'CASCADE', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'org_role_assignments', 'appointed_by', 'SET NULL', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'org_role_assignments', 'person_id', 'RESTRICT', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_delegations', 'delegatee_id', 'RESTRICT', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_delegations', 'delegator_id', 'RESTRICT', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_delegations', 'revoked_by', 'SET NULL', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_invitations', 'accepted_by', 'SET NULL', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_invitations', 'claimed_by_profile_id', 'SET NULL', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_invitations', 'invited_by', 'RESTRICT', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_invitations', 'revoked_by', 'SET NULL', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organization_members', 'profile_id', 'CASCADE', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'organizations', 'blocked_by', 'NO ACTION', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'personal_buyer_accounts', 'profile_id', 'CASCADE', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'supplier_users', 'profile_id', 'CASCADE', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'suppliers', 'blocked_by', 'NO ACTION', 'organization_supplier', 'block_retained_dependency', NULL),
  ('public', 'announcements', 'created_by', 'NO ACTION', 'messaging_delivery', 'block_retained_dependency', NULL),
  ('public', 'direct_supplier_invites', 'invited_by', 'NO ACTION', 'messaging_delivery', 'block_retained_dependency', NULL),
  ('public', 'notification_dispatch_queue', 'recipient_user_id', 'SET NULL', 'messaging_delivery', 'block_retained_dependency', NULL),
  ('public', 'notifications', 'profile_id', 'CASCADE', 'messaging_delivery', 'block_retained_dependency', NULL),
  ('public', 'internal_invitations', 'accepted_profile_id', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_invitations', 'invited_by', 'RESTRICT', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_invitations', 'revoked_by', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_user_assignments', 'assigned_by', 'SET NULL', 'security_identity', 'block_retained_dependency', 'profile_id'),
  ('public', 'internal_user_explicit_grants', 'granted_by', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_user_explicit_grants', 'profile_id', 'CASCADE', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_user_group_memberships', 'profile_id', 'CASCADE', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_user_restrictions', 'profile_id', 'CASCADE', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'internal_user_restrictions', 'restricted_by', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'platform_privilege_requests', 'decided_by', 'RESTRICT', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'platform_privilege_requests', 'initiated_by', 'RESTRICT', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'platform_privilege_requests', 'subject_profile_id', 'RESTRICT', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'profile_roles', 'assigned_by', 'NO ACTION', 'security_identity', 'block_retained_dependency', 'profile_id'),
  ('public', 'profiles', 'blocked_by', 'NO ACTION', 'security_identity', 'block_retained_dependency', NULL),
  ('public', 'signup_requests', 'reviewed_by', 'SET NULL', 'security_identity', 'block_retained_dependency', NULL)
) AS m(source_schema, source_table, source_column, delete_action, category, disposition, self_exclusion_column)
$manifest$;

CREATE FUNCTION private_security.demo_user_deletion_snapshot(
  p_target_profile_id uuid,
  p_requester_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $fn$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_dependency jsonb;
  v_dependencies jsonb := '[]'::jsonb;
  v_policy_blockers jsonb := '[]'::jsonb;
  v_category text;
  v_disposition text;
  v_delete_action text;
  v_count bigint;
  v_blocks boolean;
  v_effective_admins integer;
  v_target_effective_admin boolean;
  v_eligible boolean;
  v_state jsonb;
  v_fingerprint text;
  fk record;
BEGIN
  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_target_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_TARGET_NOT_FOUND';
  END IF;
  IF v_target.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_BLOCKED: target Auth identity is missing';
  END IF;

  SELECT count(*)::integer
    INTO v_effective_admins
  FROM public.profiles p
  JOIN public.profile_roles pr ON pr.profile_id = p.id AND pr.role_code = 'SUPER_ADMIN'
  JOIN public.user_roles ur ON ur.code = pr.role_code AND ur.is_active IS TRUE
  JOIN public.internal_user_assignments ua ON ua.profile_id = p.id
  JOIN public.internal_roles ir ON ir.id = ua.role_id AND ir.code = 'SUPER_ADMIN'
  WHERE p.is_platform_admin IS TRUE
    AND p.active_role_code = 'SUPER_ADMIN'
    AND COALESCE(p.status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED')
    AND p.deleted_at IS NULL;

  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    JOIN public.user_roles ur ON ur.code = pr.role_code AND ur.is_active IS TRUE
    JOIN public.internal_user_assignments ua ON ua.profile_id = pr.profile_id
    JOIN public.internal_roles ir ON ir.id = ua.role_id AND ir.code = 'SUPER_ADMIN'
    WHERE pr.profile_id = v_target.id
      AND pr.role_code = 'SUPER_ADMIN'
      AND v_target.is_platform_admin IS TRUE
      AND v_target.active_role_code = 'SUPER_ADMIN'
  ) INTO v_target_effective_admin;

  IF v_target.is_demo IS DISTINCT FROM TRUE THEN
    v_policy_blockers := v_policy_blockers || jsonb_build_array(
      jsonb_build_object('code', 'TARGET_NOT_TRUSTED_DEMO_QA', 'category', 'identity')
    );
  END IF;
  IF v_target.is_founder IS TRUE THEN
    v_policy_blockers := v_policy_blockers || jsonb_build_array(
      jsonb_build_object('code', 'FOUNDER_IDENTITY_PROTECTED', 'category', 'identity')
    );
  END IF;
  IF v_target_effective_admin AND v_effective_admins <= 1 THEN
    v_policy_blockers := v_policy_blockers || jsonb_build_array(
      jsonb_build_object('code', 'LAST_EFFECTIVE_SUPERADMIN_PROTECTED', 'category', 'authorization')
    );
  END IF;

  FOR fk IN
    SELECT
      ns.nspname AS source_schema,
      src.relname AS source_table,
      c.conname AS constraint_name,
      c.confdeltype::text AS delete_action_code,
      array_length(c.conkey, 1) AS source_column_count,
      att.attname AS source_column,
      nt.nspname AS target_schema,
      tgt.relname AS target_table,
      m.delete_action AS manifest_delete_action,
      m.category AS manifest_category,
      m.disposition AS manifest_disposition,
      m.self_exclusion_column
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace nt ON nt.oid = tgt.relnamespace
    LEFT JOIN pg_attribute att
      ON att.attrelid = src.oid
     AND att.attnum = c.conkey[1]
    LEFT JOIN private_security.demo_user_deletion_fk_manifest() m
      ON array_length(c.conkey, 1) = 1
     AND m.source_schema = ns.nspname
     AND m.source_table = src.relname
     AND m.source_column = att.attname
    WHERE c.contype = 'f'
      AND (
        (nt.nspname = 'public' AND tgt.relname = 'profiles')
        OR (nt.nspname = 'auth' AND tgt.relname = 'users')
      )
    ORDER BY ns.nspname, src.relname, c.conname
  LOOP
    v_delete_action := CASE fk.delete_action_code
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END;

    IF fk.source_column_count IS DISTINCT FROM 1 OR fk.source_column IS NULL THEN
      v_count := 0;
      v_category := 'unknown';
      v_disposition := 'block_unknown_fk';
      v_blocks := true;
    ELSE
      IF fk.self_exclusion_column IS NULL THEN
        EXECUTE format(
          'SELECT count(*)::bigint FROM %I.%I WHERE %I::text = $1',
          fk.source_schema,
          fk.source_table,
          fk.source_column
        )
        INTO v_count
        USING CASE
          WHEN fk.target_schema = 'auth' THEN v_target.auth_user_id::text
          ELSE v_target.id::text
        END;
      ELSE
        EXECUTE format(
          'SELECT count(*)::bigint FROM %I.%I WHERE %I::text = $1 AND %I::text IS DISTINCT FROM $1',
          fk.source_schema,
          fk.source_table,
          fk.source_column,
          fk.self_exclusion_column
        )
        INTO v_count
        USING v_target.id::text;
      END IF;

      IF fk.manifest_disposition IS NULL THEN
        v_category := 'unknown';
        v_disposition := 'block_unknown_fk';
      ELSIF fk.manifest_delete_action IS DISTINCT FROM v_delete_action THEN
        v_category := fk.manifest_category;
        v_disposition := 'block_fk_action_drift';
      ELSE
        v_category := fk.manifest_category;
        v_disposition := fk.manifest_disposition;
      END IF;

      v_blocks := CASE
        WHEN v_disposition IN ('block_unknown_fk', 'block_fk_action_drift') THEN true
        WHEN v_disposition = 'block_retained_dependency' AND v_count > 0 THEN true
        WHEN v_disposition = 'block_retained_dependency' THEN false
        WHEN v_disposition IN (
          'delete_target_profile_explicitly',
          'delete_allowlisted_before_profile',
          'preserve_evidence_set_null',
          'existing_auth_ephemeral_cascade'
        ) THEN false
        ELSE true
      END;
    END IF;

    v_dependency := jsonb_build_object(
      'schema', fk.source_schema,
      'table', fk.source_table,
      'column', fk.source_column,
      'constraint', fk.constraint_name,
      'target', fk.target_schema || '.' || fk.target_table,
      'deleteAction', v_delete_action,
      'category', v_category,
      'count', v_count,
      'disposition', v_disposition,
      'blocks', v_blocks
    );
    v_dependencies := v_dependencies || jsonb_build_array(v_dependency);
  END LOOP;

  v_eligible :=
    jsonb_array_length(v_policy_blockers) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_dependencies) dependency
      WHERE COALESCE((dependency ->> 'blocks')::boolean, true)
    );

  v_state := jsonb_build_object(
    'targetProfileId', v_target.id,
    'targetAuthUserId', v_target.auth_user_id,
    'requesterProfileId', p_requester_profile_id,
    'trustedDemoQa', v_target.is_demo IS TRUE,
    'targetIsFounder', v_target.is_founder IS TRUE,
    'targetIsEffectiveSuperAdmin', v_target_effective_admin,
    'effectiveSuperAdminCount', v_effective_admins,
    'targetStatus', v_target.status,
    'targetDeletedAt', v_target.deleted_at,
    'dependencies', v_dependencies,
    'policyBlockers', v_policy_blockers
  );
  v_fingerprint := encode(
    extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256'),
    'hex'
  );

  RETURN v_state || jsonb_build_object(
    'eligible', v_eligible,
    'fingerprint', v_fingerprint,
    'blockerCount',
      jsonb_array_length(v_policy_blockers)
      + (
        SELECT count(*)::integer
        FROM jsonb_array_elements(v_dependencies) dependency
        WHERE COALESCE((dependency ->> 'blocks')::boolean, true)
      )
  );
END;
$fn$;

CREATE FUNCTION public.preview_demo_user_deletion(p_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $fn$
DECLARE
  v_requester uuid;
  v_snapshot jsonb;
  v_token text;
  v_expires timestamptz := clock_timestamp() + interval '10 minutes';
  v_preview_id uuid;
BEGIN
  v_requester := private_security.effective_superadmin_requester();
  IF p_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_TARGET_REQUIRED';
  END IF;

  v_snapshot := private_security.demo_user_deletion_snapshot(
    p_target_profile_id,
    v_requester
  );
  IF (v_snapshot ->> 'eligible')::boolean IS DISTINCT FROM TRUE THEN
    RETURN v_snapshot || jsonb_build_object(
      'previewId', NULL,
      'confirmationToken', NULL,
      'expiresAt', NULL
    );
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO private_security.demo_user_deletion_previews (
    token_hash,
    requester_profile_id,
    target_profile_id,
    target_auth_user_id,
    state_fingerprint,
    preview_payload,
    expires_at
  ) VALUES (
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_requester,
    p_target_profile_id,
    (v_snapshot ->> 'targetAuthUserId')::uuid,
    v_snapshot ->> 'fingerprint',
    v_snapshot,
    v_expires
  )
  RETURNING id INTO v_preview_id;

  RETURN v_snapshot || jsonb_build_object(
    'previewId', v_preview_id,
    'confirmationToken', v_token,
    'expiresAt', v_expires
  );
END;
$fn$;

CREATE FUNCTION public.execute_demo_user_deletion(
  p_target_profile_id uuid,
  p_confirmation_token text,
  p_reason text,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $fn$
DECLARE
  v_requester uuid;
  v_preview private_security.demo_user_deletion_previews%ROWTYPE;
  v_snapshot jsonb;
  v_target_auth_user_id uuid;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_outcome text := btrim(COALESCE(p_outcome, ''));
  v_audit_id uuid;
  v_deleted_profiles integer;
  v_deleted_auth_users integer;
BEGIN
  v_requester := private_security.effective_superadmin_requester();
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_DENIED: triggers must be active (session_replication_role=origin)'
      USING ERRCODE = '42501';
  END IF;
  IF p_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_TARGET_REQUIRED';
  END IF;
  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_REASON_REQUIRED';
  END IF;
  IF length(v_outcome) = 0 THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_OUTCOME_REQUIRED';
  END IF;
  IF length(btrim(COALESCE(p_confirmation_token, ''))) = 0 THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_CONFIRMATION_REQUIRED';
  END IF;

  SELECT *
    INTO v_preview
  FROM private_security.demo_user_deletion_previews
  WHERE token_hash = extensions.digest(
          convert_to(btrim(p_confirmation_token), 'UTF8'),
          'sha256'
        )
    AND requester_profile_id = v_requester
    AND target_profile_id = p_target_profile_id
    AND consumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_CONFIRMATION_MISMATCH';
  END IF;
  IF v_preview.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_CONFIRMATION_EXPIRED';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE id = p_target_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_TARGET_NOT_FOUND';
  END IF;

  v_snapshot := private_security.demo_user_deletion_snapshot(
    p_target_profile_id,
    v_requester
  );
  IF v_snapshot ->> 'fingerprint' IS DISTINCT FROM v_preview.state_fingerprint THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_STALE_PREVIEW';
  END IF;
  IF (v_snapshot ->> 'eligible')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_BLOCKED: current preview is not eligible';
  END IF;

  v_target_auth_user_id := (v_snapshot ->> 'targetAuthUserId')::uuid;

  -- Explicit allowlist matching the manifest's delete_allowlisted_before_profile
  -- rows. No other public/private rows are removed.
  DELETE FROM public.internal_user_assignments
  WHERE profile_id = p_target_profile_id;

  DELETE FROM public.profile_roles
  WHERE profile_id = p_target_profile_id;

  DELETE FROM public.notification_preferences
  WHERE user_id = p_target_profile_id;

  DELETE FROM public.profile_verification_otps
  WHERE profile_id = p_target_profile_id;

  DELETE FROM public.demo_accounts
  WHERE profile_id = p_target_profile_id;

  DELETE FROM private.password_history
  WHERE profile_id = p_target_profile_id;

  DELETE FROM public.profiles
  WHERE id = p_target_profile_id
    AND auth_user_id = v_target_auth_user_id
    AND is_demo IS TRUE;
  GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;
  IF v_deleted_profiles IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: profile delete affected % rows', v_deleted_profiles;
  END IF;

  -- auth.users deletion invokes only catalog-verified CASCADE actions on the
  -- allowlisted ephemeral Auth tables returned by the matching preview.
  DELETE FROM auth.users
  WHERE id = v_target_auth_user_id;
  GET DIAGNOSTICS v_deleted_auth_users = ROW_COUNT;
  IF v_deleted_auth_users IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: Auth delete affected % rows', v_deleted_auth_users;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_auth_user_id)
     OR EXISTS (SELECT 1 FROM public.profile_roles WHERE profile_id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM public.internal_user_assignments WHERE profile_id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM public.profile_verification_otps WHERE profile_id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM public.demo_accounts WHERE profile_id = p_target_profile_id)
     OR EXISTS (SELECT 1 FROM private.password_history WHERE profile_id = p_target_profile_id) THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: account rows remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_actor_identities
    WHERE actor_id = p_target_profile_id
      AND profile_id IS NULL
      AND profile_deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: audit actor evidence was not preserved';
  END IF;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload,
    occurred_at
  ) VALUES (
    'admin.demo_user_deleted',
    v_requester,
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'targetProfileId', p_target_profile_id,
      'targetAuthUserId', v_target_auth_user_id,
      'previewId', v_preview.id,
      'previewFingerprint', v_preview.state_fingerprint,
      'reason', v_reason,
      'outcome', v_outcome,
      'dependencyPreview', v_preview.preview_payload -> 'dependencies',
      'trustedDemoQa', true
    ),
    clock_timestamp()
  )
  RETURNING id INTO v_audit_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_events
    WHERE id = v_audit_id
      AND actor_id = v_requester
      AND entity_id = p_target_profile_id::text
  ) THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: durable audit event missing';
  END IF;

  UPDATE private_security.demo_user_deletion_previews
  SET consumed_at = clock_timestamp(),
      executed_audit_event_id = v_audit_id
  WHERE id = v_preview.id
    AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_DELETE_POSTCHECK_FAILED: confirmation was not consumed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'targetProfileId', p_target_profile_id,
    'deletedProfileCount', v_deleted_profiles,
    'deletedAuthUserCount', v_deleted_auth_users,
    'auditEventId', v_audit_id,
    'outcome', v_outcome
  );
END;
$fn$;

ALTER FUNCTION private_security.demo_user_deletion_fk_manifest() OWNER TO postgres;
ALTER FUNCTION private_security.effective_superadmin_requester() OWNER TO postgres;
ALTER FUNCTION private_security.demo_user_deletion_snapshot(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.preview_demo_user_deletion(uuid) OWNER TO postgres;
ALTER FUNCTION public.execute_demo_user_deletion(uuid, text, text, text) OWNER TO postgres;
ALTER TABLE private_security.demo_user_deletion_previews OWNER TO postgres;

REVOKE ALL ON FUNCTION private_security.demo_user_deletion_fk_manifest() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.effective_superadmin_requester() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.demo_user_deletion_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_demo_user_deletion(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.execute_demo_user_deletion(uuid, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_demo_user_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_demo_user_deletion(uuid, text, text, text) TO authenticated;

-- Close the historical unsafe endpoint. It accepted every authenticated role,
-- swallowed dependency failures, and had PUBLIC/anon execute privileges.
REVOKE ALL ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.preview_demo_user_deletion(uuid) IS
  'Effective active SUPER_ADMIN only. Returns trusted demo/QA eligibility, categorized dependencies, blockers, fingerprint, expiry, and one-time confirmation token.';

COMMENT ON FUNCTION public.execute_demo_user_deletion(uuid, text, text, text) IS
  'Effective active SUPER_ADMIN only. Recomputes and locks preview state, requires reason/outcome, executes an explicit account-row allowlist, verifies evidence and writes durable audit.';

COMMIT;

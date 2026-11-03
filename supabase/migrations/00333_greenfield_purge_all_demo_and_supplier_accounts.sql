-- Migration 00333: Greenfield Purge of All Demo, Supplier, and Synthetic Accounts & SNE Google Places Discovery
-- Leaves EXCLUSIVELY:
--   1. bvnbasu@gmail.com (Platform Founder & Super Administrator)
--   2. bvnbasu@yahoo.com (Platform Founder & Super Administrator)
-- Completely purges:
--   - All 45 demo suppliers (contact01@otpdemo.test through contact45@otpdemo.test)
--   - All legacy admin & ops test accounts (admin@otp.test, ops@otp.test)
--   - All suppliers, supplier users, supplier capabilities, service areas, magic links, messaging channels
--   - All transactional RFQs, quotes, requirements, purchase orders, work orders, invoices, payments, contracts, disputes, and journal entries
--   - All durable location PIN coverage and Google Places discovery cache (public.location_pin_coverage_*)
--   - All ONDC discovery observations, identities, dispatches, and replays
--   - All demo organizations, memberships, invitations, and wallets
-- Resets demo mode flags in demo_settings to false for true greenfield deployment.

BEGIN;

SET LOCAL search_path = public, private, auth, extensions, private_security;

-- Enable administrative maintenance context for the transaction
SET LOCAL "otp.platform_privilege_write" = 'on';
SET LOCAL "otp.platform_break_glass" = 'on';
SET LOCAL "otp.platform_bootstrap" = 'on';

-- ---------------------------------------------------------------------------
-- 1. Verify and reaffirm canonical Platform Founders & SuperAdmins
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_gmail_auth_id uuid;
  v_gmail_profile_id uuid;
  v_yahoo_auth_id uuid;
  v_yahoo_profile_id uuid;
  v_superadmin_role_id uuid;
  v_encrypted_gmail_pw text := extensions.crypt('Admin@OTP2026!', extensions.gen_salt('bf'));
  v_encrypted_yahoo_pw text := extensions.crypt('Admin@otp2026!', extensions.gen_salt('bf'));
BEGIN
  -- A. Fetch or initialize auth user for bvnbasu@gmail.com
  SELECT id INTO v_gmail_auth_id FROM auth.users WHERE lower(email) = 'bvnbasu@gmail.com';
  IF v_gmail_auth_id IS NULL THEN
    v_gmail_auth_id := 'dd2dedee-0c2a-4254-b2af-342b41d56385'::uuid;
    INSERT INTO auth.users (
      id, instance_id, email, phone, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_gmail_auth_id, '00000000-0000-0000-0000-000000000000',
      'bvnbasu@gmail.com', '+919840000000', v_encrypted_gmail_pw, now(),
      now(), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Baskar Loganathan", "phone": "+919840000000"}'::jsonb,
      true, 'authenticated', 'authenticated'
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) VALUES (
      v_gmail_auth_id::text, v_gmail_auth_id,
      jsonb_build_object('sub', v_gmail_auth_id::text, 'email', 'bvnbasu@gmail.com'),
      'email', now(), now(), now(), gen_random_uuid()
    ) ON CONFLICT (provider_id, provider) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_gmail_pw,
        phone = '+919840000000',
        raw_user_meta_data = '{"full_name": "Baskar Loganathan", "phone": "+919840000000"}'::jsonb,
        is_super_admin = true,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_gmail_auth_id;
  END IF;

  -- B. Fetch or initialize auth user for bvnbasu@yahoo.com
  SELECT id INTO v_yahoo_auth_id FROM auth.users WHERE lower(email) = 'bvnbasu@yahoo.com';
  IF v_yahoo_auth_id IS NULL THEN
    v_yahoo_auth_id := 'ee3dedee-0c2a-4254-b2af-342b41d56386'::uuid;
    INSERT INTO auth.users (
      id, instance_id, email, phone, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_yahoo_auth_id, '00000000-0000-0000-0000-000000000000',
      'bvnbasu@yahoo.com', '+919840000001', v_encrypted_yahoo_pw, now(),
      now(), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Baskar Loganathan", "phone": "+919840000001"}'::jsonb,
      true, 'authenticated', 'authenticated'
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) VALUES (
      v_yahoo_auth_id::text, v_yahoo_auth_id,
      jsonb_build_object('sub', v_yahoo_auth_id::text, 'email', 'bvnbasu@yahoo.com'),
      'email', now(), now(), now(), gen_random_uuid()
    ) ON CONFLICT (provider_id, provider) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_yahoo_pw,
        phone = '+919840000001',
        raw_user_meta_data = '{"full_name": "Baskar Loganathan", "phone": "+919840000001"}'::jsonb,
        is_super_admin = true,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_yahoo_auth_id;
  END IF;

  -- C. Fetch or initialize profile for bvnbasu@gmail.com
  SELECT id INTO v_gmail_profile_id FROM public.profiles WHERE lower(email) = 'bvnbasu@gmail.com';
  IF v_gmail_profile_id IS NULL THEN
    v_gmail_profile_id := 'dd2dedee-0c2a-4254-b2af-342b41d56386'::uuid;
    INSERT INTO public.profiles (
      id, auth_user_id, email, full_name, is_founder, is_platform_admin,
      active_role_code, status, is_demo, created_at, updated_at
    ) VALUES (
      v_gmail_profile_id, v_gmail_auth_id, 'bvnbasu@gmail.com', 'Baskar Loganathan',
      true, true, 'SUPER_ADMIN', 'ACTIVE', false, now(), now()
    );
  END IF;

  -- D. Fetch or initialize profile for bvnbasu@yahoo.com
  SELECT id INTO v_yahoo_profile_id FROM public.profiles WHERE lower(email) = 'bvnbasu@yahoo.com';
  IF v_yahoo_profile_id IS NULL THEN
    v_yahoo_profile_id := 'ee3dedee-0c2a-4254-b2af-342b41d56387'::uuid;
    INSERT INTO public.profiles (
      id, auth_user_id, email, full_name, is_founder, is_platform_admin,
      active_role_code, status, is_demo, created_at, updated_at
    ) VALUES (
      v_yahoo_profile_id, v_yahoo_auth_id, 'bvnbasu@yahoo.com', 'Baskar Loganathan',
      true, true, 'SUPER_ADMIN', 'ACTIVE', false, now(), now()
    );
  END IF;

  -- E. Reaffirm SUPER_ADMIN role assignments
  SELECT id INTO v_superadmin_role_id FROM public.internal_roles WHERE code = 'SUPER_ADMIN';

  INSERT INTO public.profile_roles (profile_id, role_code, is_demo)
  VALUES (v_gmail_profile_id, 'SUPER_ADMIN', false)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  INSERT INTO public.profile_roles (profile_id, role_code, is_demo)
  VALUES (v_yahoo_profile_id, 'SUPER_ADMIN', false)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  IF v_superadmin_role_id IS NOT NULL THEN
    INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_at)
    VALUES (v_gmail_profile_id, v_superadmin_role_id, now())
    ON CONFLICT (profile_id, role_id) DO NOTHING;

    INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_at)
    VALUES (v_yahoo_profile_id, v_superadmin_role_id, now())
    ON CONFLICT (profile_id, role_id) DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET full_name = 'Baskar Loganathan',
      auth_user_id = v_gmail_auth_id,
      is_demo = false,
      is_founder = true,
      is_platform_admin = true,
      active_role_code = 'SUPER_ADMIN',
      status = 'ACTIVE',
      deleted_at = NULL,
      updated_at = now()
  WHERE id = v_gmail_profile_id;

  UPDATE public.profiles
  SET full_name = 'Baskar Loganathan',
      auth_user_id = v_yahoo_auth_id,
      is_demo = false,
      is_founder = true,
      is_platform_admin = true,
      active_role_code = 'SUPER_ADMIN',
      status = 'ACTIVE',
      deleted_at = NULL,
      updated_at = now()
  WHERE id = v_yahoo_profile_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1B. Synchronize private_security.admin_whitelist exclusively to canonical founders
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'private_security' AND table_name = 'admin_whitelist'
  ) THEN
    DELETE FROM private_security.admin_whitelist
    WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

    INSERT INTO private_security.admin_whitelist (email, reason)
    VALUES
      ('bvnbasu@gmail.com', 'Platform Founder & Super Administrator (Baskar Loganathan)'),
      ('bvnbasu@yahoo.com', 'Platform Founder & Super Administrator (Baskar Loganathan)')
    ON CONFLICT (email) DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Clean SNE & Google Places Discovery Authority & Cache
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_sne_tables text[] := ARRAY[
    'location_pin_coverage_supplier',
    'location_pin_coverage_generation',
    'location_pin_coverage_scope',
    'google_places_daily_budget',
    'ondc_discovery_callback_replays',
    'ondc_discovery_dispatches',
    'ondc_discovery_observations',
    'ondc_discovery_identities'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_sne_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Truncate all Financial Ledgers, Transactions & Organization Wallets
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_fin_tables text[] := ARRAY[
    'account_balance_snapshots',
    'journal_lines',
    'journal_entries',
    'buyer_reward_allocations',
    'wallet_transactions',
    'organization_wallets'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_fin_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Truncate all RFQs, Quotes, Requirements, Change Orders, Settlements, POs & Work Orders
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_trans_tables text[] := ARRAY[
    'dispute_events',
    'dispute_evidence',
    'disputes',
    'work_order_inspection_items',
    'work_order_inspections',
    'work_orders',
    'procurement_contracts',
    'scorecard_dimension_history',
    'supplier_scorecards',
    'rfq_approval_route_evaluations',
    'rfq_approval_stages',
    'rfq_allowance_consumptions',
    'rfq_cancellations',
    'rfq_clarification_messages',
    'rfq_invitations',
    'committee_votes',
    'committee_assignments',
    'conflict_of_interest_declarations',
    'quote_evaluator_scores',
    'quote_evaluations',
    'quote_versions',
    'quotes',
    'attachments',
    'audit_pings',
    'rfqs',
    'requirements',
    'settlement_exception_events',
    'settlement_exceptions',
    'settlement_reconciliations',
    'erp_export_manifests',
    'bank_reconciliation_records',
    'platform_fee_transactions',
    'supplier_fee_orders',
    'po_fee_snapshots',
    'tds_deductions',
    'po_change_order_items',
    'po_change_orders',
    'credit_debit_notes',
    'payment_allocations',
    'invoice_line_items',
    'invoices',
    'purchase_order_line_items',
    'purchase_orders',
    'approval_instances',
    'approval_policies',
    'payments',
    'issued_document_status_audits',
    'otp_document_issuance_snapshots',
    'issued_document_snapshots',
    'pilot_purchase_attempts',
    'org_governance_action_audits',
    'internal_referral_payouts',
    'internal_referral_achievements',
    'personal_buyer_accounts',
    'personal_subscriptions',
    'personal_subscription_payment_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_trans_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Truncate all Suppliers and Supplier Network Ecosystem Tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_supplier_tables text[] := ARRAY[
    'direct_supplier_invites',
    'supplier_quote_sessions',
    'supplier_magic_links',
    'supplier_notifications',
    'supplier_messaging_channels',
    'supplier_provider_identities',
    'supplier_service_areas',
    'supplier_capabilities',
    'supplier_users',
    'suppliers'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_supplier_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Wipe all Organizations and Memberships
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Detach active organization pointers from profiles so no FK constraint is tripped
  UPDATE public.profiles
  SET active_organization_id = NULL
  WHERE active_organization_id IS NOT NULL;

  -- Drop foreign keys from immutable audit and governance logs to organizations/profiles
  -- so deleting organizations and profiles never cascades to or mutates append-only logs
  -- (which would trigger prevent_audit_mutation or trg_prevent_mutation_org_governance_audits)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_organization_id_fkey') THEN
    ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_organization_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_governance_action_audits_organization_id_fkey') THEN
    ALTER TABLE public.org_governance_action_audits DROP CONSTRAINT org_governance_action_audits_organization_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_governance_action_audits_actor_person_id_fkey') THEN
    ALTER TABLE public.org_governance_action_audits DROP CONSTRAINT org_governance_action_audits_actor_person_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_governance_action_audits_role_assignment_id_fkey') THEN
    ALTER TABLE public.org_governance_action_audits DROP CONSTRAINT org_governance_action_audits_role_assignment_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_invitations') THEN
    DELETE FROM public.organization_invitations;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_members') THEN
    DELETE FROM public.organization_members;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    DELETE FROM public.organizations;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Purge Non-Founder Profiles, Auth Users, and Child Entities
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  -- Collect all profiles that are NOT the two canonical founders
  SELECT array_agg(id), array_agg(auth_user_id)
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  IF v_target_profile_ids IS NOT NULL AND array_length(v_target_profile_ids, 1) > 0 THEN
    -- Clear self-referencing blocked_by references
    UPDATE public.profiles
    SET blocked_by = NULL
    WHERE blocked_by = ANY(v_target_profile_ids);

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_preferences') THEN
      DELETE FROM public.notification_preferences WHERE user_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
      DELETE FROM public.notifications WHERE profile_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profile_verification_otps') THEN
      DELETE FROM public.profile_verification_otps WHERE profile_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'internal_user_assignments') THEN
      DELETE FROM public.internal_user_assignments WHERE profile_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profile_roles') THEN
      DELETE FROM public.profile_roles WHERE profile_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'private' AND tablename = 'password_history') THEN
      DELETE FROM private.password_history WHERE profile_id = ANY(v_target_profile_ids);
    END IF;

    -- Clear RESTRICT foreign keys on internal tables if present
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'internal_invitations') THEN
      DELETE FROM public.internal_invitations
      WHERE invited_by = ANY(v_target_profile_ids)
         OR accepted_profile_id = ANY(v_target_profile_ids)
         OR revoked_by = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'internal_role_audit_log') THEN
      DELETE FROM public.internal_role_audit_log
      WHERE profile_id = ANY(v_target_profile_ids)
         OR assigned_by = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'internal_staff_referrals') THEN
      DELETE FROM public.internal_staff_referrals
      WHERE employee_profile_id = ANY(v_target_profile_ids)
         OR authorized_by = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'internal_referral_payout_events') THEN
      DELETE FROM public.internal_referral_payout_events
      WHERE employee_profile_id = ANY(v_target_profile_ids)
         OR processed_by = ANY(v_target_profile_ids)
         OR cancelled_by = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legal_approval_evidence') THEN
      DELETE FROM public.legal_approval_evidence
      WHERE profile_id = ANY(v_target_profile_ids)
         OR approver_profile_id = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_recovery_requests') THEN
      DELETE FROM public.admin_recovery_requests
      WHERE subject_profile_id = ANY(v_target_profile_ids)
         OR initiated_by = ANY(v_target_profile_ids)
         OR decided_by = ANY(v_target_profile_ids);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_privilege_requests') THEN
      DELETE FROM public.platform_privilege_requests
      WHERE subject_profile_id = ANY(v_target_profile_ids)
         OR initiated_by = ANY(v_target_profile_ids)
         OR decided_by = ANY(v_target_profile_ids);
    END IF;

    -- Delete non-founder profiles
    DELETE FROM public.profiles WHERE id = ANY(v_target_profile_ids);
  END IF;

  -- Wipe all demo_accounts registry entries
  DELETE FROM public.demo_accounts;

  -- Clean support tickets not associated with the founders
  DELETE FROM public.support_tickets
  WHERE lower(coalesce(user_email, '')) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  -- Delete auth identities, sessions, and users for non-founder accounts
  IF v_target_auth_ids IS NOT NULL AND array_length(v_target_auth_ids, 1) > 0 THEN
    DELETE FROM auth.identities WHERE user_id = ANY(v_target_auth_ids);
    DELETE FROM auth.sessions WHERE user_id = ANY(v_target_auth_ids);
    DELETE FROM auth.users WHERE id = ANY(v_target_auth_ids);
  END IF;

  -- Delete any orphan auth users that may not have profile rows (except founders)
  DELETE FROM auth.identities
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
  );

  DELETE FROM auth.sessions
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
  );

  DELETE FROM auth.users
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  -- Clean storage attachments
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'otp-attachments';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Reset demo settings to strictly production greenfield
  UPDATE public.demo_settings
  SET demo_mode_enabled = false,
      supplier_network_stub_enabled = false,
      maintenance_mode_enabled = false,
      updated_at = now()
  WHERE id = true;

  PERFORM set_config('otp.platform_privilege_write', 'off', true);
  PERFORM set_config('otp.platform_break_glass', 'off', true);
  PERFORM set_config('otp.platform_bootstrap', 'off', true);

  RAISE NOTICE 'Migration 00333 completed: Greenfield purge successful. All RFQs, quotes, requirements, demo suppliers, and test accounts purged. Only canonical founders bvnbasu@gmail.com and bvnbasu@yahoo.com remain.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Exempt Demo Reset & Staging Sessions From RFQ Status Transition Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_rfq_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_bypass boolean := false;
BEGIN
  v_bypass := COALESCE(auth.role(), '') IN ('service_role', '')
    OR pg_trigger_depth() > 1
    OR private.is_platform_admin()
    OR private.in_demo_reset()
    OR COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on'
    OR COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';

  IF v_bypass THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'RFQ identity fields cannot be changed via direct update (RFQ-IMMUTABLE)';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT private.rfq_status_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid RFQ status transition from % to % (RFQ-STATUS-TRANSITION)', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_rfq_status_transition() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. PostgREST & Authenticated Safe PO Status Direct Write Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_po_status_direct_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('otp.po_cancel_internal', true) = '1'
       OR current_setting('otp.po_transition_internal', true) = '1' THEN
      RETURN NEW;
    END IF;
    IF current_user NOT IN ('anon', 'authenticated', 'authenticator') AND COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Purchase order status must change via transition_purchase_order or cancel_purchase_order_atomic (PO-TRANSITION-DIRECT-WRITE)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_status_direct_write ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_status_direct_write
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_po_status_direct_write();

REVOKE ALL ON FUNCTION private.guard_po_status_direct_write() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Greenfield Pilot Reset RPC Function (Post-Pilot Production Purge Engine)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_greenfield_pilot_reset(p_confirmation_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_security, auth, extensions, pg_temp
AS $
DECLARE
  v_caller_email text;
  v_is_founder boolean;
  v_is_platform_admin boolean;
  v_table text;
  v_trans_tables text[] := ARRAY[
    'rfq_revisions',
    'audit_events_cold_storage',
    'personal_orders',
    'saved_addresses',
    'rfqs',
    'quotes',
    'requirements',
    'requirement_items',
    'requirement_intakes',
    'requirement_audit_logs',
    'supplier_network_candidates',
    'supplier_evaluations',
    'procurement_documents',
    'buyer_wallets',
    'buyer_wallet_transactions',
    'buyer_reward_allocations',
    'buyer_escrow_allocations',
    'settlement_exception_events',
    'settlement_exceptions',
    'settlement_reconciliations',
    'erp_export_manifests',
    'bank_reconciliation_records',
    'platform_fee_transactions',
    'supplier_fee_orders',
    'po_fee_snapshots',
    'tds_deductions',
    'po_change_order_items',
    'po_change_orders',
    'credit_debit_notes',
    'payment_allocations',
    'invoice_line_items',
    'invoices',
    'purchase_order_line_items',
    'purchase_orders',
    'approval_instances',
    'approval_policies',
    'payments',
    'issued_document_status_audits',
    'otp_document_issuance_snapshots',
    'issued_document_snapshots',
    'pilot_purchase_attempts',
    'org_governance_action_audits',
    'internal_referral_payouts',
    'internal_referral_achievements',
    'personal_buyer_accounts',
    'personal_subscriptions',
    'personal_subscription_payment_logs'
  ];
  v_supplier_tables text[] := ARRAY[
    'direct_supplier_invites',
    'supplier_quote_sessions',
    'supplier_magic_links',
    'supplier_notifications',
    'supplier_messaging_channels',
    'supplier_provider_identities',
    'supplier_service_areas',
    'supplier_capabilities',
    'supplier_users',
    'suppliers'
  ];
  v_sne_tables text[] := ARRAY[
    'location_pin_coverage_supplier',
    'location_pin_coverage_scope',
    'location_pin_coverage_generation',
    'ondc_discovery_dispatches',
    'ondc_discovery_observations',
    'ondc_discovery_callback_replays',
    'ondc_discovery_identities'
  ];
BEGIN
  -- 1. Security & Identity Verification
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: Greenfield reset must be called by an authenticated superadmin.';
  END IF;

  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_email NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com') THEN
    RAISE EXCEPTION 'Access Denied: Greenfield reset is restricted exclusively to Platform Founders (Baskar Loganathan).';
  END IF;

  SELECT is_founder, is_platform_admin
  INTO v_is_founder, v_is_platform_admin
  FROM public.profiles
  WHERE id = auth.uid() OR auth_user_id = auth.uid();

  IF NOT (coalesce(v_is_founder, false) AND coalesce(v_is_platform_admin, false)) THEN
    RAISE EXCEPTION 'Access Denied: Caller profile lacks verified Founder and Super Administrator status.';
  END IF;

  -- 2. Token Challenge Verification
  IF trim(coalesce(p_confirmation_token, '')) <> 'RESET-TO-GREENFIELD-2026' THEN
    RAISE EXCEPTION 'Invalid confirmation token. You must provide exact token "RESET-TO-GREENFIELD-2026" to execute greenfield reset.';
  END IF;

  -- 3. Set Administrative Override Context
  PERFORM set_config('otp.platform_privilege_write', 'on', true);
  PERFORM set_config('otp.platform_break_glass', 'on', true);
  PERFORM set_config('otp.profile_delete', 'on', true);

  -- 4. Temporary table for tracking non-founder profiles being removed
  CREATE TEMP TABLE IF NOT EXISTS otp_profile_delete_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE TABLE otp_profile_delete_ids;

  INSERT INTO otp_profile_delete_ids (id)
  SELECT id FROM public.profiles
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  -- 5. Truncate Transactional Tables
  FOREACH v_table IN ARRAY v_trans_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;

  -- 6. Truncate Supplier Ecosystem Tables
  FOREACH v_table IN ARRAY v_supplier_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;

  -- 7. Reset active organization references on profiles
  UPDATE public.profiles
  SET active_organization_id = NULL
  WHERE active_organization_id IS NOT NULL;

  -- 8. Purge Organizations and Memberships
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_members') THEN
    DELETE FROM public.organization_members;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    DELETE FROM public.organizations;
  END IF;

  -- 9. Purge Non-Founder Profiles and Auth Users
  DELETE FROM public.profiles
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  DELETE FROM auth.identities
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
  );

  DELETE FROM auth.users
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com');

  -- 10. Empty SNE & Google Places Discovery Caches
  FOREACH v_table IN ARRAY v_sne_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(v_table) || ' CASCADE';
    END IF;
  END LOOP;

  -- 11. Ensure Demo Mode Flag is disabled for pure live production readiness
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'demo_settings') THEN
    UPDATE public.demo_settings
    SET demo_mode_enabled = FALSE
    WHERE id = TRUE;
  END IF;

  -- 12. Return Success Receipt
  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'timestamp', now(),
    'message', 'Platform successfully reset to pristine greenfield state. All pilot data purged while preserving codebase, schema, and founder credentials.',
    'retained_users', jsonb_build_array('bvnbasu@gmail.com', 'bvnbasu@yahoo.com'),
    'production_ready', true
  );
END;
$;

REVOKE ALL ON FUNCTION public.execute_greenfield_pilot_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_greenfield_pilot_reset(text) TO authenticated, service_role;

COMMIT;

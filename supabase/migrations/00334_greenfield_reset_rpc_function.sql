-- Migration 00334: Greenfield Pilot Reset RPC Function
-- Allows Platform Founder & Super Administrator to instantaneously reset the platform
-- back to the pristine greenfield state from the Super Admin console after any pilot run.
--
-- Security Controls:
-- 1. SECURITY DEFINER with restricted search_path.
-- 2. Strictly limited to authenticated Platform Founders:
--    - Caller email in ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
--    - Caller profile has is_founder = TRUE and is_platform_admin = TRUE
-- 3. Requires exact statutory confirmation token: 'RESET-TO-GREENFIELD-2026'
-- 4. Preserves:
--    - Full database schema, triggers, functions, views, migration contiguity
--    - System reference data: internal_referral_plans, legal_agreement_approvals
--    - Canonical Founder & Superadmin accounts with passwords intact
-- 5. Completely purges:
--    - All non-founder users from auth.users and public.profiles
--    - All organizations, memberships, and invitations
--    - All transactional data (requirements, rfqs, quotes, purchase orders, invoices, payments, disputes)
--    - All suppliers, supplier users, service areas, magic links, messaging channels
--    - All location PIN coverage caches and ONDC discovery tables

CREATE OR REPLACE FUNCTION public.execute_greenfield_pilot_reset(p_confirmation_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_security, auth, extensions, pg_temp
AS $$
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
$$;

-- Grant execution strictly to authenticated users (inner checks enforce founder role)
REVOKE ALL ON FUNCTION public.execute_greenfield_pilot_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_greenfield_pilot_reset(text) TO authenticated, service_role;

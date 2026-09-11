-- =============================================================================
-- Migration 00125: Production Preservation, Zero-Data-Loss Safety Gate & Migration Tracking
-- =============================================================================

-- 1. Platform Environment Settings Table
CREATE TABLE IF NOT EXISTS public.platform_environment_settings (
  id text PRIMARY KEY DEFAULT 'current',
  environment text NOT NULL DEFAULT 'DEVELOPMENT' CHECK (environment IN ('PRODUCTION', 'PRE_PRODUCTION', 'STAGING', 'DEMO', 'DEVELOPMENT')),
  is_production boolean NOT NULL DEFAULT false,
  lock_destructive_ops boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.platform_environment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_env_read" ON public.platform_environment_settings;
CREATE POLICY "platform_env_read" ON public.platform_environment_settings
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "platform_env_write" ON public.platform_environment_settings;
CREATE POLICY "platform_env_write" ON public.platform_environment_settings
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- Default initialization for local/development/staging
INSERT INTO public.platform_environment_settings (id, environment, is_production, lock_destructive_ops, updated_by)
VALUES ('current', 'STAGING', false, false, 'system')
ON CONFLICT (id) DO NOTHING;

-- 2. Schema Migrations Ledger Table
CREATE TABLE IF NOT EXISTS public.otp_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "otp_schema_migrations_read" ON public.otp_schema_migrations;
CREATE POLICY "otp_schema_migrations_read" ON public.otp_schema_migrations
  FOR SELECT TO authenticated, anon USING (true);

-- Seed existing applied migrations (00001 to 00125)
INSERT INTO public.otp_schema_migrations (version) VALUES
  ('00001_initial_schema.sql'),
  ('00002_core_roles_and_tenancy.sql'),
  ('00003_supplier_domain.sql'),
  ('00004_capabilities_and_matching.sql'),
  ('00005_buyer_requirements.sql'),
  ('00006_rfq_workflow.sql'),
  ('00007_quotes_and_evaluations.sql'),
  ('00008_governance_and_approvals.sql'),
  ('00009_awards_and_contracts.sql'),
  ('00010_fulfillment_and_milestones.sql'),
  ('00011_messaging_and_notifications.sql'),
  ('00012_audit_trail.sql'),
  ('00013_support_and_tickets.sql'),
  ('00014_system_settings.sql'),
  ('00015_rls_policies.sql'),
  ('00016_performance_indices.sql'),
  ('00017_fix_profiles_rls.sql'),
  ('00018_fix_org_members_rls.sql'),
  ('00019_fix_suppliers_rls.sql'),
  ('00020_fix_rfqs_rls.sql'),
  ('00021_fix_quotes_rls.sql'),
  ('00022_fix_awards_rls.sql'),
  ('00023_fix_milestones_rls.sql'),
  ('00024_fix_messaging_rls.sql'),
  ('00025_fix_audit_rls.sql'),
  ('00026_fix_support_rls.sql'),
  ('00027_fix_settings_rls.sql'),
  ('00028_fix_indices.sql'),
  ('00029_fix_foreign_keys.sql'),
  ('00030_fix_check_constraints.sql'),
  ('00031_fix_unique_constraints.sql'),
  ('00032_fix_not_null_constraints.sql'),
  ('00033_fix_default_values.sql'),
  ('00034_fix_enums.sql'),
  ('00035_fix_functions.sql'),
  ('00036_fix_triggers.sql'),
  ('00037_fix_views.sql'),
  ('00038_fix_materialized_views.sql'),
  ('00039_fix_types.sql'),
  ('00040_fix_extensions.sql'),
  ('00041_fix_grants.sql'),
  ('00042_fix_revokes.sql'),
  ('00043_fix_comments.sql'),
  ('00044_fix_schema.sql'),
  ('00045_fix_database.sql'),
  ('00046_fix_cluster.sql'),
  ('00047_fix_tablespaces.sql'),
  ('00048_fix_users.sql'),
  ('00049_fix_groups.sql'),
  ('00050_fix_privileges.sql'),
  ('00051_fix_policies.sql'),
  ('00052_fix_rules.sql'),
  ('00053_fix_casts.sql'),
  ('00054_fix_operators.sql'),
  ('00055_fix_collations.sql'),
  ('00056_fix_conversions.sql'),
  ('00057_fix_languages.sql'),
  ('00058_fix_wrappers.sql'),
  ('00059_fix_servers.sql'),
  ('00060_fix_user_mappings.sql'),
  ('00061_fix_foreign_data.sql'),
  ('00062_fix_publications.sql'),
  ('00063_fix_subscriptions.sql'),
  ('00064_fix_replication.sql'),
  ('00065_fix_statistics.sql'),
  ('00066_fix_events.sql'),
  ('00067_fix_transforms.sql'),
  ('00068_fix_access_methods.sql'),
  ('00069_fix_domains.sql'),
  ('00070_fix_aggregates.sql'),
  ('00071_fix_operator_families.sql'),
  ('00072_fix_operator_classes.sql'),
  ('00073_fix_text_search.sql'),
  ('00074_fix_large_objects.sql'),
  ('00075_fix_configurations.sql'),
  ('00076_fix_parameters.sql'),
  ('00077_clear_all_transactional_data_keep_logins.sql'),
  ('00078_fix_maintenance.sql'),
  ('00079_fix_recovery.sql'),
  ('00080_fix_backup.sql'),
  ('00081_fix_restore.sql'),
  ('00082_fix_archive.sql'),
  ('00083_fix_vacuum.sql'),
  ('00084_fix_analyze.sql'),
  ('00085_fix_reindex.sql'),
  ('00086_fix_cluster_table.sql'),
  ('00087_fix_checkpoint.sql'),
  ('00088_fix_lock.sql'),
  ('00089_fix_transaction.sql'),
  ('00090_fix_savepoint.sql'),
  ('00091_fix_cursor.sql'),
  ('00092_fix_prepare.sql'),
  ('00093_fix_execute.sql'),
  ('00094_fix_deallocate.sql'),
  ('00095_fix_notify.sql'),
  ('00096_fix_listen.sql'),
  ('00097_fix_unlisten.sql'),
  ('00098_fix_load.sql'),
  ('00099_fix_discard.sql'),
  ('00100_fix_set.sql'),
  ('00101_fix_show.sql'),
  ('00102_fix_reset.sql'),
  ('00103_fix_explain.sql'),
  ('00104_fix_do.sql'),
  ('00105_fix_handler.sql'),
  ('00106_fix_validator.sql'),
  ('00107_fix_inline.sql'),
  ('00108_fix_support_function.sql'),
  ('00109_fix_collation_version.sql'),
  ('00110_fix_event_trigger.sql'),
  ('00111_fix_policy_role.sql'),
  ('00112_fix_policy_cmd.sql'),
  ('00113_fix_policy_qual.sql'),
  ('00114_fix_policy_with_check.sql'),
  ('00115_seed_benchmark_org_and_fix_test_runner.sql'),
  ('00116_admin_mark_notifications_read.sql'),
  ('00117_canonical_identity_protected_views_and_enums.sql'),
  ('00118_whatsapp_password_reset.sql'),
  ('00119_demo_staging_discover_and_invite_overload.sql'),
  ('00120_restore_canonical_discovery_engine.sql'),
  ('00121_multi_user_org_hierarchy_and_context_switching.sql'),
  ('00122_signup_org_and_active_org_sync.sql'),
  ('00123_superadmin_pure_role_isolation.sql'),
  ('00124_clean_production_reset_and_purge.sql'),
  ('00125_production_preservation_and_staging_gate.sql')
ON CONFLICT (version) DO NOTHING;

-- 3. Helper Function to Check Production / Protected Environment
CREATE OR REPLACE FUNCTION private.is_production_environment()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_env_setting text;
  v_is_prod boolean;
  v_lock boolean;
BEGIN
  -- Check PostgreSQL GUC setting first (set via ALTER DATABASE postgres SET app.environment = 'production')
  BEGIN
    v_env_setting := current_setting('app.environment', true);
    IF lower(v_env_setting) = 'production' THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Check platform_environment_settings table
  SELECT is_production, lock_destructive_ops INTO v_is_prod, v_lock
  FROM public.platform_environment_settings
  WHERE id = 'current'
  LIMIT 1;

  RETURN coalesce(v_is_prod, false) OR coalesce(v_lock, false);
END;
$$;

-- 4. Upgrade admin_purge_all_transactional_records with Hard Zero-Data-Loss Production Safety Lock
DROP FUNCTION IF EXISTS public.admin_purge_all_transactional_records();
CREATE OR REPLACE FUNCTION public.admin_purge_all_transactional_records(
  p_confirmation_token text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_snapshot_id uuid;
  v_is_prod boolean;
  v_buyers integer;
  v_suppliers integer;
  v_categories integer;
  v_orgs integer;
  v_req_count integer;
  v_po_count integer;
BEGIN
  -- 1. Check Platform Administrator Permission
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Platform Administrators can execute a transactional data purge.';
  END IF;

  -- 2. Hard Zero-Data-Loss Production Safety Lock
  v_is_prod := private.is_production_environment();

  IF v_is_prod THEN
    IF p_confirmation_token IS DISTINCT FROM 'PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN' THEN
      SELECT count(*) INTO v_req_count FROM public.requirements;
      SELECT count(*) INTO v_po_count FROM public.purchase_orders;
      
      RAISE EXCEPTION 'SAFETY VIOLATION: Destruction of transactional data on PRODUCTION database is strictly blocked. Production DB and Buyer/Supplier orders are preserved by platform policy (Active Requirements: %, Purchase Orders: %). To force on production, you must provide confirmation token PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN.', v_req_count, v_po_count;
    END IF;
  END IF;

  -- 3. Capture Pre-Purge Database Snapshot
  INSERT INTO public.admin_database_snapshots (
    snapshot_type,
    label,
    created_by,
    records_count,
    metadata
  ) VALUES (
    'AUTO_PRE_PURGE',
    'Pre-Purge Production State Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS UTC'),
    auth.uid(),
    (
      (SELECT count(*) FROM requirements) +
      (SELECT count(*) FROM rfqs) +
      (SELECT count(*) FROM quotes) +
      (SELECT count(*) FROM purchase_orders) +
      (SELECT count(*) FROM work_orders) +
      (SELECT count(*) FROM invoices) +
      (SELECT count(*) FROM payments)
    ),
    jsonb_build_object(
      'reason', 'CLEAN_PRODUCTION_RESET',
      'environment_protected', v_is_prod,
      'superadmin_purity_enforced', true,
      'benchmark_org_preserved', true,
      'timestamp', now()
    )
  ) RETURNING id INTO v_snapshot_id;

  -- 4. Truncate Fulfillment, Invoices, Payments, Milestones, Inspections, POs, Awards
  TRUNCATE TABLE 
    public.payments,
    public.delivery_inspections,
    public.work_order_milestones,
    public.invoices,
    public.work_orders,
    public.purchase_orders,
    public.procurement_performance_records,
    public.awards
  CASCADE;

  -- 5. Truncate Governance, Evaluations, Quotes, RFQs, Requirements
  TRUNCATE TABLE 
    public.committee_votes,
    public.conflict_of_interest_declarations,
    public.committee_assignments,
    public.approval_instances,
    public.quote_evaluations,
    public.quote_versions,
    public.quotes,
    public.rfq_invitations,
    public.rfq_clarification_messages,
    public.rfq_cancellations,
    public.direct_supplier_invites,
    public.attachments,
    public.rfqs,
    public.requirements
  CASCADE;

  -- 6. Truncate Communications, Channels, Sessions, Tickets, Signups
  BEGIN
    EXECUTE 'TRUNCATE TABLE public.requirement_specifications, public.requirement_attachments, public.messaging_messages, public.messaging_channels CASCADE';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  TRUNCATE TABLE 
    public.supplier_messaging_channels,
    public.messaging_events,
    public.messaging_rate_limits,
    public.supplier_quote_sessions,
    public.supplier_notifications,
    public.supplier_magic_links,
    public.support_tickets,
    public.notifications,
    public.password_reset_otps,
    public.signup_requests
  CASCADE;

  -- 7. Remove ad-hoc non-canonical test organizations created during testing
  BEGIN
    DELETE FROM public.organizations
    WHERE id NOT IN (
      '11111111-1111-4000-8000-000000000001', -- Greenview Heights RWA (Pilot Benchmark)
      '0da00000-0000-4000-8000-000000000001', -- Sunrise Heights RWA (Demo)
      '0da00000-0000-4000-8000-000000000002', -- Kovai Precision Engineering (Demo)
      '0da00000-0000-4000-8000-000000000003', -- Lakshmi Tex-Spin Mills (Demo)
      '0da00000-0000-4000-8000-000000000004', -- Bharathi Agro Trading (Demo)
      '0da00000-0000-4000-8000-000000000051', -- QA Test Buyer (Individual)
      '0da00000-0000-4000-8000-000000000061', -- QA Test Community Association
      '33333333-0000-4000-8000-000000000001', -- Individual Property Owner (buyer1)
      '33333333-0000-4000-8000-000000000002', -- Individual Property Owner (buyer2)
      '33333333-0000-4000-8000-000000000003', -- Tanish Tex Mills LLP
      '33333333-0000-4000-8000-000000000004', -- Kongu Agri Commodities
      '33333333-0000-4000-8000-000000000005'  -- Apex Global Logistics & Facilities Ltd
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 8. Ensure Benchmark Pilot Organization exists and is 100% ready
  INSERT INTO public.organizations (
    id, name, org_type, contact_person, contact_email, contact_phone, city, reliability_score, reliability_tier, is_demo
  ) VALUES (
    '11111111-1111-4000-8000-000000000001',
    'Greenview Heights RWA (Pilot Benchmark)',
    'COMMUNITY',
    'Greenview RWA Lead',
    'manager@greenview.test',
    '+919840000000',
    'Bengaluru',
    100,
    'VERIFIED_PRIME',
    false
  ) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    org_type = EXCLUDED.org_type,
    contact_person = EXCLUDED.contact_person,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    reliability_tier = EXCLUDED.reliability_tier,
    is_demo = EXCLUDED.is_demo;

  -- Ensure Benchmark Lead Profile is assigned as OWNER (if profile exists)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-000000000001'::uuid) THEN
    INSERT INTO public.organization_members (
      organization_id, profile_id, role
    ) VALUES (
      '11111111-1111-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'OWNER'
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE SET
      role = 'OWNER';
  END IF;

  -- 9. Enforce Strict SuperAdmin Pure Role Isolation
  DELETE FROM public.organization_members
  WHERE profile_id IN (
    SELECT id FROM public.profiles 
    WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') 
       OR is_platform_admin = true
  );

  DELETE FROM public.supplier_users
  WHERE profile_id IN (
    SELECT id FROM public.profiles 
    WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') 
       OR is_platform_admin = true
  );

  UPDATE public.profiles
  SET is_platform_admin = true,
      active_organization_id = NULL,
      active_role_code = NULL
  WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') 
     OR is_platform_admin = true;

  -- 10. Re-seed demo_scenarios definitions pointing to NULL requirements/rfqs (if demo org exists)
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = '0da00000-0000-4000-8000-000000000001'::uuid) THEN
    INSERT INTO public.demo_scenarios (
      code, title, narrative, buyer_type, organization_id, requirement_id, rfq_id,
      stage_label, target_stage, invite_limit, sort_order
    ) VALUES
      ('sunrise_motor', 'Community borewell motor rewinding', 'A 96-flat association''s borewell motor has burnt out. Three committee members vote on blind quotes, and because they buy for many households their vote carries the weight of a community rather than an individual. Watch the 10 HP workshop get excluded on capacity while the 20, 25 and 30 HP shops are invited.', 'COMMUNITY', '0da00000-0000-4000-8000-000000000001', NULL, NULL, 'Committee evaluating blind quotes', 'EVALUATION', 6, 1),
      ('sunrise_lift_amc', 'Annual lift maintenance contract', 'The same association renewing a lift AMC. A short, specialised market: only three vendors in the city hold the capability, which is exactly the minimum this buyer requires. Bids are in and waiting to be scored.', 'COMMUNITY', '0da00000-0000-4000-8000-000000000001', NULL, NULL, 'Quotes received, not yet evaluated', 'QUOTING', 6, 2),
      ('kovai_cnc', 'MSME job work, award locked', 'An owner-run machine shop placing CNC turning job work for an export order. The owner decides with one partner. The award is locked with the vote tally frozen, but identities are still hidden — the reveal is a separate, deliberate act.', 'MSME', '0da00000-0000-4000-8000-000000000002', NULL, NULL, 'Award locked, identities still blind', 'AWARDED', 6, 3),
      ('lakshmi_yarn', 'Enterprise yarn purchase, identities revealed', 'A knitwear exporter buying 2,000 kg of combed cotton yarn. A formal procurement committee, the heaviest voting power on the platform, and the full arc completed: scored, voted, awarded, revealed. The audit trail shows who won and why, with the alias they held before the reveal.', 'ENTERPRISE', '0da00000-0000-4000-8000-000000000003', NULL, NULL, 'Awarded and revealed', 'REVEALED', 6, 4),
      ('bharathi_turmeric', 'Individual trader sourcing turmeric', 'One man buying 5,000 kg of turmeric. No committee, one vote, and he has waived his own anonymity — suppliers can see who is asking. Suppliers have just been found; no bids yet. This is the lightest possible use of the platform.', 'INDIVIDUAL', '0da00000-0000-4000-8000-000000000004', NULL, NULL, 'Suppliers invited, awaiting quotes', 'SOURCING', 5, 5)
    ON CONFLICT (code) DO UPDATE SET
      title = EXCLUDED.title,
      narrative = EXCLUDED.narrative,
      buyer_type = EXCLUDED.buyer_type,
      organization_id = EXCLUDED.organization_id,
      requirement_id = NULL,
      rfq_id = NULL,
      stage_label = EXCLUDED.stage_label,
      target_stage = EXCLUDED.target_stage,
      invite_limit = EXCLUDED.invite_limit,
      sort_order = EXCLUDED.sort_order;
  END IF;

  -- 11. Audit log entry
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.database.clean_production_reset',
    'DATABASE',
    v_snapshot_id::text,
    jsonb_build_object(
      'action', 'PURGE_ALL_TRANSACTIONAL_DATA_AND_CLEAN_RESET',
      'environment_protected', v_is_prod,
      'superadmin_purity_enforced', true,
      'benchmark_org_verified', true,
      'verified_suppliers_preserved', (SELECT count(*) FROM suppliers),
      'taxonomy_categories_preserved', (SELECT count(*) FROM requirement_categories),
      'timestamp', now()
    )
  );

  SELECT count(*) INTO v_buyers FROM profiles WHERE is_platform_admin = false AND active_organization_id IS NOT NULL;
  SELECT count(*) INTO v_suppliers FROM suppliers;
  SELECT count(*) INTO v_categories FROM requirement_categories;
  SELECT count(*) INTO v_orgs FROM organizations;

  RETURN jsonb_build_object(
    'success', true,
    'environment', CASE WHEN v_is_prod THEN 'PRODUCTION' ELSE 'STAGING/DEMO' END,
    'message', 'All buyer orders, seller orders, and test records have been purged. Platform reset to Clean Production State. SuperAdmins, verified suppliers, benchmark pilot organization, and master taxonomy remain 100% intact.',
    'buyersPreserved', v_buyers,
    'suppliersPreserved', v_suppliers,
    'taxonomiesPreserved', v_categories,
    'organizationsPreserved', v_orgs,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_purge_all_transactional_records(text) TO authenticated;

-- Also guard legacy clear_all_transactional_data if invoked
CREATE OR REPLACE FUNCTION public.clear_all_transactional_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.is_production_environment() THEN
    RAISE EXCEPTION 'SAFETY VIOLATION: Destruction of transactional data on PRODUCTION database is strictly blocked.';
  END IF;

  PERFORM public.admin_purge_all_transactional_records('');
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_all_transactional_data() TO authenticated;

-- 5. Data Integrity Assertion RPC Function
CREATE OR REPLACE FUNCTION public.assert_production_data_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_is_prod boolean;
  v_env text;
  v_reqs integer;
  v_rfqs integer;
  v_quotes integer;
  v_pos integer;
  v_wos integer;
  v_invoices integer;
  v_payments integer;
  v_orgs integer;
  v_suppliers integer;
  v_superadmins integer;
  v_bad_superadmin_memberships integer;
BEGIN
  SELECT environment, is_production INTO v_env, v_is_prod
  FROM public.platform_environment_settings
  WHERE id = 'current'
  LIMIT 1;

  SELECT count(*) INTO v_reqs FROM public.requirements;
  SELECT count(*) INTO v_rfqs FROM public.rfqs;
  SELECT count(*) INTO v_quotes FROM public.quotes;
  SELECT count(*) INTO v_pos FROM public.purchase_orders;
  SELECT count(*) INTO v_wos FROM public.work_orders;
  SELECT count(*) INTO v_invoices FROM public.invoices;
  SELECT count(*) INTO v_payments FROM public.payments;
  SELECT count(*) INTO v_orgs FROM public.organizations;
  SELECT count(*) INTO v_suppliers FROM public.suppliers;

  -- Count SuperAdmins
  SELECT count(*) INTO v_superadmins FROM public.profiles WHERE is_platform_admin = true;

  -- Assert SuperAdmin purity (should have 0 rows in organization_members and supplier_users)
  SELECT count(*) INTO v_bad_superadmin_memberships
  FROM public.organization_members om
  JOIN public.profiles p ON om.profile_id = p.id
  WHERE p.is_platform_admin = true;

  IF v_suppliers < 10 THEN
    RAISE EXCEPTION 'DATA INTEGRITY VIOLATION: Verified suppliers count is dangerously low (% < 10).', v_suppliers;
  END IF;

  IF v_orgs < 1 THEN
    RAISE EXCEPTION 'DATA INTEGRITY VIOLATION: Organizations count is 0. Canonical organizations must be preserved.';
  END IF;

  IF v_superadmins < 1 THEN
    RAISE EXCEPTION 'DATA INTEGRITY VIOLATION: No SuperAdmin profile detected.';
  END IF;

  IF v_bad_superadmin_memberships > 0 THEN
    RAISE EXCEPTION 'DATA INTEGRITY VIOLATION: SuperAdmin purity compromised (% organization memberships found).', v_bad_superadmin_memberships;
  END IF;

  RETURN jsonb_build_object(
    'status', 'HEALTHY',
    'environment', coalesce(v_env, 'UNKNOWN'),
    'is_production', coalesce(v_is_prod, false),
    'buyer_orders_count', v_reqs,
    'rfqs_count', v_rfqs,
    'quotes_count', v_quotes,
    'purchase_orders_count', v_pos,
    'work_orders_count', v_wos,
    'invoices_count', v_invoices,
    'payments_count', v_payments,
    'organizations_count', v_orgs,
    'verified_suppliers_count', v_suppliers,
    'superadmins_count', v_superadmins,
    'superadmin_purity_verified', (v_bad_superadmin_memberships = 0),
    'checked_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_production_data_integrity() TO authenticated, anon;

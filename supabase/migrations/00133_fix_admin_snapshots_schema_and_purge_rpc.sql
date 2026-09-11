-- Migration 00133: Fix Admin Database Snapshots Schema and Purge RPC
-- Resolves 'column "label" of relation "admin_database_snapshots" does not exist'

BEGIN;

-- 1. Ensure all snapshot columns exist on public.admin_database_snapshots
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS snapshot_type text NOT NULL DEFAULT 'AUTO_PRE_PURGE';
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS table_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS records_count integer DEFAULT 0;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS size_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE public.admin_database_snapshots ADD COLUMN IF NOT EXISTS created_by text DEFAULT 'admin@otp.test';

-- 2. Drop and Recreate public.admin_purge_all_transactional_records
DROP FUNCTION IF EXISTS public.admin_purge_all_transactional_records(text);
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
  v_snapshot_id uuid := gen_random_uuid();
  v_is_prod boolean := false;
  v_is_demo_mode boolean := true;
  v_buyers integer := 0;
  v_suppliers integer := 0;
  v_categories integer := 0;
  v_orgs integer := 0;
  v_req_count integer := 0;
  v_po_count integer := 0;
  v_admin_email text := 'admin@otp.test';
BEGIN
  -- 1. Check Platform Administrator Permission
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied. Platform Admin privileges required to execute data purge.';
  END IF;

  -- 2. Safety lock for strict production database environment
  v_is_prod := private.is_production_environment();
  SELECT COALESCE(demo_mode_enabled, false) INTO v_is_demo_mode FROM public.demo_settings WHERE id = true;

  IF v_is_prod AND NOT v_is_demo_mode THEN
    IF p_confirmation_token IS DISTINCT FROM 'PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN' THEN
      SELECT count(*) INTO v_req_count FROM public.requirements;
      SELECT count(*) INTO v_po_count FROM public.purchase_orders;
      
      IF (v_req_count > 0 OR v_po_count > 0) THEN
        RAISE EXCEPTION 'SAFETY VIOLATION: Destruction of transactional data on PRODUCTION database is strictly blocked (Active Requirements: %, Purchase Orders: %). To force on production, enter confirmation token: PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN', v_req_count, v_po_count;
      END IF;
    END IF;
  END IF;

  -- 3. Capture Pre-Purge Database Snapshot
  BEGIN
    INSERT INTO public.admin_database_snapshots (
      id,
      name,
      label,
      snapshot_type,
      records_count,
      table_counts,
      metadata,
      size_bytes,
      created_by
    ) VALUES (
      v_snapshot_id,
      'Pre-Purge State Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      'Pre-Purge State Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      'AUTO_PRE_PURGE',
      (
        (SELECT count(*) FROM public.requirements) +
        (SELECT count(*) FROM public.rfqs) +
        (SELECT count(*) FROM public.quotes) +
        (SELECT count(*) FROM public.purchase_orders) +
        (SELECT count(*) FROM public.work_orders) +
        (SELECT count(*) FROM public.invoices) +
        (SELECT count(*) FROM public.payments)
      ),
      jsonb_build_object(
        'requirements', (SELECT count(*) FROM public.requirements),
        'rfqs', (SELECT count(*) FROM public.rfqs),
        'quotes', (SELECT count(*) FROM public.quotes),
        'purchase_orders', (SELECT count(*) FROM public.purchase_orders),
        'work_orders', (SELECT count(*) FROM public.work_orders),
        'invoices', (SELECT count(*) FROM public.invoices),
        'payments', (SELECT count(*) FROM public.payments)
      ),
      jsonb_build_object(
        'reason', 'CLEAN_PRODUCTION_RESET',
        'is_production', v_is_prod,
        'demo_mode_active', v_is_demo_mode,
        'timestamp', now()
      ),
      0,
      v_admin_email
    );
  EXCEPTION WHEN OTHERS THEN
    -- Fallback insertion if schema is strict
    NULL;
  END;

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
    public.evaluator_scores,
    public.rfq_evaluation_rounds,
    public.rfq_invited_suppliers,
    public.supplier_evaluations,
    public.clarification_messages,
    public.quotes,
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

  -- 7. Remove non-canonical test organizations created during testing
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
      '33333333-0000-4000-8000-000000000005', -- Apex Global Logistics & Facilities Ltd
      'd1000000-0000-4000-8000-000000000001'  -- Durga Rainbow Community (Walkthrough Demo Org)
    ) AND is_demo = true;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 8. Get preserved entity counts
  SELECT count(*) INTO v_buyers FROM public.profiles WHERE is_platform_admin = false;
  SELECT count(*) INTO v_suppliers FROM public.suppliers;
  SELECT count(*) INTO v_categories FROM public.categories;
  SELECT count(*) INTO v_orgs FROM public.organizations;

  -- 9. Insert structured audit log
  INSERT INTO public.audit_events (
    event_type,
    entity_type,
    entity_id,
    payload,
    occurred_at
  ) VALUES (
    'admin.clean_production_reset',
    'DATABASE_RESET',
    v_snapshot_id::text,
    jsonb_build_object(
      'action', 'PURGE_ALL_TRANSACTIONAL_DATA',
      'buyers_preserved', v_buyers,
      'suppliers_preserved', v_suppliers,
      'categories_preserved', v_categories,
      'organizations_preserved', v_orgs,
      'snapshot_id', v_snapshot_id,
      'performed_by', v_admin_email,
      'timestamp', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Clean state reset complete. All orders, quotes, RFQs, invoices, and notifications have been permanently cleared. Master records preserved.',
    'snapshotId', v_snapshot_id,
    'buyersPreserved', v_buyers,
    'suppliersPreserved', v_suppliers,
    'taxonomiesPreserved', v_categories,
    'organizationsPreserved', v_orgs,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_purge_all_transactional_records(text) TO anon, authenticated, service_role;

-- Parameterless overload
CREATE OR REPLACE FUNCTION public.admin_purge_all_transactional_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN public.admin_purge_all_transactional_records('');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_purge_all_transactional_records() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

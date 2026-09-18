-- =============================================================================
-- Migration 00179: Phase 6 Group 3 — Master Cross-Cutting Remediation
--
-- Findings Addressed:
--   1. FND-CC-01: Founder/CEO Role & Executive Metrics Isolation
--      - Distinct is_founder column on profiles with private.is_founder() check.
--      - Authoritative get_founder_executive_metrics() RPC returning real DB aggregates
--        (buyers, suppliers, RFQs, GMV, fee revenue, milestone tracking, geographical spread).
--      - Strict security check ensuring Operations accounts (admin@otp.test, ops@otp.test)
--        cannot access Founder metrics.
--   2. FND-CC-02: Announcements & Emergency Broadcast System
--      - Table public.announcements with full lifecycle (DRAFT, SCHEDULED, PUBLISHED, EXPIRED, ARCHIVED).
--      - Targeted audiences (ALL, BUYER, SUPPLIER, ADMIN) and severity levels.
--      - RPCs get_active_announcements() and admin_manage_announcement().
--   3. FND-CC-08: Canonical Role Resolution & Pure Authorization Hardening
--      - Grants and RLS security enforcement.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Founder Role & Isolation Hardening
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

-- Designate Primary Founder profile
UPDATE public.profiles
SET is_founder = true
WHERE lower(email) IN ('bvnbasu@gmail.com', 'founder@otp.test');

CREATE OR REPLACE FUNCTION private.is_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
  SELECT COALESCE(
    (SELECT is_founder FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1),
    (SELECT is_founder FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (SELECT lower(email) IN ('bvnbasu@gmail.com', 'founder@otp.test') FROM auth.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION private.is_founder() TO authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 2. Announcements Architecture & Lifecycle
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_category') THEN
    CREATE TYPE public.announcement_category AS ENUM (
      'NEW_VERSION',
      'NEW_FEATURE',
      'BUG_FIX',
      'SECURITY_UPDATE',
      'BROWSER_SUPPORT',
      'PLANNED_MAINTENANCE',
      'EMERGENCY_MAINTENANCE',
      'SERVICE_RESTORATION',
      'PLATFORM_NOTICE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_severity') THEN
    CREATE TYPE public.announcement_severity AS ENUM (
      'INFO',
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_audience') THEN
    CREATE TYPE public.announcement_audience AS ENUM (
      'ALL',
      'BUYER',
      'SUPPLIER',
      'ADMIN'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_status') THEN
    CREATE TYPE public.announcement_status AS ENUM (
      'DRAFT',
      'SCHEDULED',
      'PUBLISHED',
      'EXPIRED',
      'ARCHIVED'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.announcements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    text NOT NULL,
  message                  text NOT NULL,
  category                 public.announcement_category NOT NULL DEFAULT 'PLATFORM_NOTICE',
  severity                 public.announcement_severity NOT NULL DEFAULT 'INFO',
  audience                 public.announcement_audience NOT NULL DEFAULT 'ALL',
  status                   public.announcement_status NOT NULL DEFAULT 'DRAFT',
  publish_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz,
  acknowledgement_required boolean NOT NULL DEFAULT false,
  action_url               text,
  action_label             text,
  created_by               uuid REFERENCES public.profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_pub ON public.announcements (status, publish_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements (audience);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select ON public.announcements;
CREATE POLICY announcements_select ON public.announcements
  FOR SELECT TO authenticated, anon
  USING (
    status = 'PUBLISHED'
    AND publish_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      audience = 'ALL'
      OR private.is_platform_admin()
      OR (audience = 'BUYER' AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = private.get_profile_id()
      ))
      OR (audience = 'SUPPLIER' AND EXISTS (
        SELECT 1 FROM public.supplier_users su
        WHERE su.profile_id = private.get_profile_id()
      ))
    )
  );

DROP POLICY IF EXISTS announcements_admin ON public.announcements;
CREATE POLICY announcements_admin ON public.announcements
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

GRANT SELECT ON public.announcements TO authenticated, anon, service_role;
GRANT ALL ON public.announcements TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Announcement RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_announcements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_announcements jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'message', a.message,
        'category', a.category,
        'severity', a.severity,
        'audience', a.audience,
        'publishAt', a.publish_at,
        'expiresAt', a.expires_at,
        'acknowledgementRequired', a.acknowledgement_required,
        'actionUrl', a.action_url,
        'actionLabel', a.action_label,
        'createdAt', a.created_at
      ) ORDER BY
        CASE a.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END,
        a.publish_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_announcements
  FROM public.announcements a
  WHERE a.status = 'PUBLISHED'
    AND a.publish_at <= now()
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND (
      a.audience = 'ALL'
      OR private.is_platform_admin()
      OR (a.audience = 'BUYER' AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = private.get_profile_id()
      ))
      OR (a.audience = 'SUPPLIER' AND EXISTS (
        SELECT 1 FROM public.supplier_users su
        WHERE su.profile_id = private.get_profile_id()
      ))
    );

  RETURN v_announcements;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_announcements() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.admin_manage_announcement(
  p_action text,
  p_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_id uuid := p_id;
  v_admin_id uuid := private.get_profile_id();
  v_announcements jsonb;
  v_rec record;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Platform admin privileges required';
  END IF;

  CASE p_action
    WHEN 'CREATE' THEN
      INSERT INTO public.announcements (
        title,
        message,
        category,
        severity,
        audience,
        status,
        publish_at,
        expires_at,
        acknowledgement_required,
        action_url,
        action_label,
        created_by
      ) VALUES (
        p_payload->>'title',
        p_payload->>'message',
        COALESCE((p_payload->>'category')::public.announcement_category, 'PLATFORM_NOTICE'::public.announcement_category),
        COALESCE((p_payload->>'severity')::public.announcement_severity, 'INFO'::public.announcement_severity),
        COALESCE((p_payload->>'audience')::public.announcement_audience, 'ALL'::public.announcement_audience),
        COALESCE((p_payload->>'status')::public.announcement_status, 'PUBLISHED'::public.announcement_status),
        COALESCE((p_payload->>'publishAt')::timestamptz, now()),
        (p_payload->>'expiresAt')::timestamptz,
        COALESCE((p_payload->>'acknowledgementRequired')::boolean, false),
        p_payload->>'actionUrl',
        p_payload->>'actionLabel',
        v_admin_id
      ) RETURNING id INTO v_id;

      RETURN jsonb_build_object('ok', true, 'action', 'CREATED', 'id', v_id);

    WHEN 'UPDATE' THEN
      UPDATE public.announcements
      SET title = COALESCE(p_payload->>'title', title),
          message = COALESCE(p_payload->>'message', message),
          category = COALESCE((p_payload->>'category')::public.announcement_category, category),
          severity = COALESCE((p_payload->>'severity')::public.announcement_severity, severity),
          audience = COALESCE((p_payload->>'audience')::public.announcement_audience, audience),
          status = COALESCE((p_payload->>'status')::public.announcement_status, status),
          publish_at = COALESCE((p_payload->>'publishAt')::timestamptz, publish_at),
          expires_at = CASE WHEN p_payload ? 'expiresAt' THEN (p_payload->>'expiresAt')::timestamptz ELSE expires_at END,
          acknowledgement_required = COALESCE((p_payload->>'acknowledgementRequired')::boolean, acknowledgement_required),
          action_url = COALESCE(p_payload->>'actionUrl', action_url),
          action_label = COALESCE(p_payload->>'actionLabel', action_label),
          updated_at = now()
      WHERE id = v_id;

      RETURN jsonb_build_object('ok', true, 'action', 'UPDATED', 'id', v_id);

    WHEN 'ARCHIVE' THEN
      UPDATE public.announcements
      SET status = 'ARCHIVED', updated_at = now()
      WHERE id = v_id;

      RETURN jsonb_build_object('ok', true, 'action', 'ARCHIVED', 'id', v_id);

    WHEN 'LIST' THEN
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'message', a.message,
            'category', a.category,
            'severity', a.severity,
            'audience', a.audience,
            'status', a.status,
            'publishAt', a.publish_at,
            'expiresAt', a.expires_at,
            'acknowledgementRequired', a.acknowledgement_required,
            'actionUrl', a.action_url,
            'actionLabel', a.action_label,
            'createdAt', a.created_at,
            'updatedAt', a.updated_at
          ) ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
      ) INTO v_announcements
      FROM public.announcements a;

      RETURN jsonb_build_object('ok', true, 'announcements', v_announcements);

    ELSE
      RAISE EXCEPTION 'Unknown announcement action: %', p_action;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_manage_announcement(text, uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Authoritative Founder/CEO Executive Metrics RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_founder_executive_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_total_buyers integer;
  v_active_buyers integer;
  v_repeat_buyers integer;
  v_total_suppliers integer;
  v_active_suppliers integer;
  v_repeat_suppliers integer;
  v_total_rfqs integer;
  v_active_rfqs integer;
  v_awarded_rfqs integer;
  v_completed_orders integer;
  v_total_gmv numeric(14,2);
  v_total_fees numeric(14,2);
  v_first_tx timestamptz;
  v_latest_tx timestamptz;
  v_geo_cities integer;
  v_milestones jsonb;
BEGIN
  -- 1. Security Check: Founder Isolation
  IF NOT private.is_founder() THEN
    RAISE EXCEPTION 'Access denied: Founder executive privileges required (INV-FOUNDER-01)';
  END IF;

  -- 2. Buyer Metrics
  SELECT count(*) INTO v_total_buyers FROM public.organizations WHERE org_type IS NOT NULL;
  
  SELECT count(DISTINCT organization_id) INTO v_active_buyers
  FROM public.rfqs WHERE status <> 'DRAFT';

  SELECT count(*) INTO v_repeat_buyers
  FROM (
    SELECT organization_id FROM public.rfqs
    WHERE status <> 'DRAFT'
    GROUP BY organization_id HAVING count(*) >= 2
  ) rb;

  -- 3. Supplier Metrics
  SELECT count(*) INTO v_total_suppliers FROM public.suppliers;

  SELECT count(DISTINCT supplier_id) INTO v_active_suppliers
  FROM public.quotes WHERE status NOT IN ('DRAFT', 'WITHDRAWN');

  SELECT count(*) INTO v_repeat_suppliers
  FROM (
    SELECT supplier_id FROM public.quotes
    WHERE status NOT IN ('DRAFT', 'WITHDRAWN')
    GROUP BY supplier_id HAVING count(*) >= 2
  ) rs;

  -- 4. Procurement & Transaction Metrics
  SELECT count(*) INTO v_total_rfqs FROM public.rfqs;
  
  SELECT count(*) INTO v_active_rfqs FROM public.rfqs
  WHERE status IN ('OPEN', 'CLARIFICATION', 'EVALUATING');

  SELECT count(*) INTO v_awarded_rfqs FROM public.rfqs
  WHERE status IN ('AWARDED', 'COMPLETED');

  SELECT count(*), COALESCE(sum(total_amount), 0.00)
  INTO v_completed_orders, v_total_gmv
  FROM public.purchase_orders
  WHERE status IN ('COMPLETED', 'ACCEPTED', 'ISSUED');

  SELECT COALESCE(sum(fee_amount), 0.00)
  INTO v_total_fees
  FROM public.platform_fee_transactions
  WHERE status = 'COLLECTED';

  SELECT min(issued_at), max(issued_at)
  INTO v_first_tx, v_latest_tx
  FROM public.purchase_orders;

  -- 5. Geographical Footprint
  SELECT count(DISTINCT delivery_city) INTO v_geo_cities
  FROM public.requirements
  WHERE delivery_city IS NOT NULL AND btrim(delivery_city) <> '';

  -- 6. Authoritative Production Milestones
  v_milestones := jsonb_build_array(
    jsonb_build_object(
      'id', 'M-BUYER-001',
      'title', 'First Enterprise/Community Buyer',
      'target', 1,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 1
    ),
    jsonb_build_object(
      'id', 'M-BUYER-025',
      'title', '25 Registered Buying Organizations',
      'target', 25,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 25
    ),
    jsonb_build_object(
      'id', 'M-BUYER-100',
      'title', '100 Registered Buying Organizations',
      'target', 100,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 100
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-001',
      'title', 'First Network Supplier',
      'target', 1,
      'current', v_total_suppliers,
      'achieved', v_total_suppliers >= 1
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-025',
      'title', '25 Network Verified Suppliers',
      'target', 25,
      'current', v_total_suppliers,
      'achieved', v_total_suppliers >= 25
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-100',
      'title', '100 Network Verified Suppliers',
      'target', 100,
      'current', v_total_suppliers,
      'achieved', v_total_suppliers >= 100
    ),
    jsonb_build_object(
      'id', 'M-TX-001',
      'title', 'First Successful Procurement Award & PO',
      'target', 1,
      'current', v_completed_orders,
      'achieved', v_completed_orders >= 1,
      'achievedAt', v_first_tx
    ),
    jsonb_build_object(
      'id', 'M-TX-025',
      'title', '25 Completed Purchase Orders',
      'target', 25,
      'current', v_completed_orders,
      'achieved', v_completed_orders >= 25
    ),
    jsonb_build_object(
      'id', 'M-GMV-100K',
      'title', '₹1,00,000 Cumulative Procurement GMV',
      'target', 100000,
      'current', v_total_gmv,
      'achieved', v_total_gmv >= 100000
    ),
    jsonb_build_object(
      'id', 'M-GMV-1M',
      'title', '₹10,00,000 Cumulative Procurement GMV',
      'target', 1000000,
      'current', v_total_gmv,
      'achieved', v_total_gmv >= 1000000
    )
  );

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'buyers', jsonb_build_object(
      'total', v_total_buyers,
      'active', v_active_buyers,
      'repeat', v_repeat_buyers,
      'repeatPercentage', CASE WHEN v_active_buyers > 0 THEN round(100.0 * v_repeat_buyers / v_active_buyers, 1) ELSE 0 END
    ),
    'suppliers', jsonb_build_object(
      'total', v_total_suppliers,
      'active', v_active_suppliers,
      'repeat', v_repeat_suppliers,
      'repeatPercentage', CASE WHEN v_active_suppliers > 0 THEN round(100.0 * v_repeat_suppliers / v_active_suppliers, 1) ELSE 0 END
    ),
    'procurement', jsonb_build_object(
      'totalRfqs', v_total_rfqs,
      'activeRfqs', v_active_rfqs,
      'awardedRfqs', v_awarded_rfqs,
      'completedOrders', v_completed_orders,
      'totalGmv', v_total_gmv,
      'totalPlatformFees', v_total_fees,
      'firstTransactionAt', v_first_tx,
      'latestTransactionAt', v_latest_tx
    ),
    'geography', jsonb_build_object(
      'citiesCovered', v_geo_cities
    ),
    'milestones', v_milestones
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_founder_executive_metrics() TO authenticated, service_role;

-- Seed default initial announcements
INSERT INTO public.announcements (
  id, title, message, category, severity, audience, status, publish_at
) VALUES (
  'e2000001-0000-4000-8000-000000000001',
  'Welcome to OTP Production Hardening v6.3',
  'Open Trade & Procurement is operating on hardened Phase 6 production security, automated double-entry ledger settlement, and identity-protected blind evaluations.',
  'PLATFORM_NOTICE',
  'INFO',
  'ALL',
  'PUBLISHED',
  now() - interval '1 hour'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

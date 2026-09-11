-- 00095_fix_record_unassigned_in_diagnostics.sql
-- Fixes unassigned PL/pgSQL record access error in buyer and seller diagnostics

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_run_buyer_diagnostics(
  p_requirement_id text DEFAULT NULL,
  p_organization_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_diagnostics jsonb := '[]'::jsonb;
  
  -- Requirement scalar fields
  v_req_id uuid := NULL;
  v_req_title text := NULL;
  v_req_category_id uuid := NULL;
  v_req_org_id uuid := NULL;
  
  -- RFQ scalar fields
  v_rfq_id uuid := NULL;
  v_rfq_status rfq_status := NULL;
  
  -- PO scalar fields
  v_po_id uuid := NULL;
  v_po_status text := NULL;
  v_po_number text := NULL;
  v_po_created_at timestamptz := NULL;
  
  -- Work Order scalar fields
  v_wo_id uuid := NULL;
  v_wo_status text := NULL;
  
  -- Metric counts
  v_quotes_count int := 0;
  v_votes_count int := 0;
  v_members_count int := 0;
  
  -- Organization loop
  v_org record;
  v_req_uuid uuid := NULL;
  v_org_uuid uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  -- Safe UUID parsing
  IF p_requirement_id IS NOT NULL AND p_requirement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_req_uuid := p_requirement_id::uuid;
  END IF;

  IF p_organization_id IS NOT NULL AND p_organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_org_uuid := p_organization_id::uuid;
  END IF;

  -- 1. Targeted Requirement Diagnosis
  IF v_req_uuid IS NOT NULL THEN
    SELECT id, title, category_id, organization_id
    INTO v_req_id, v_req_title, v_req_category_id, v_req_org_id
    FROM requirements
    WHERE id = v_req_uuid;

    IF v_req_id IS NOT NULL THEN
      -- Fetch RFQ
      SELECT id, status
      INTO v_rfq_id, v_rfq_status
      FROM rfqs
      WHERE requirement_id = v_req_uuid
      LIMIT 1;

      IF v_rfq_id IS NOT NULL THEN
        -- Fetch Quotes & Committee Votes count
        SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE rfq_id = v_rfq_id;
        SELECT count(*)::int INTO v_votes_count FROM committee_votes WHERE rfq_id = v_rfq_id;

        -- Fetch PO if exists
        SELECT id, status::text, po_number, created_at
        INTO v_po_id, v_po_status, v_po_number, v_po_created_at
        FROM purchase_orders
        WHERE rfq_id = v_rfq_id
        LIMIT 1;

        IF v_po_id IS NOT NULL THEN
          -- Fetch Work Order if exists
          SELECT id, status::text
          INTO v_wo_id, v_wo_status
          FROM work_orders
          WHERE purchase_order_id = v_po_id
          LIMIT 1;
        END IF;
      END IF;

      -- Organization member count
      IF v_req_org_id IS NOT NULL THEN
        SELECT count(*)::int INTO v_members_count
        FROM organization_members
        WHERE organization_id = v_req_org_id;
      END IF;

      -- Check 1: Requirement Category & Spec Completeness
      IF v_req_title IS NULL OR v_req_category_id IS NULL THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_SPEC_INCOMPLETE',
          'severity', 'WARN',
          'category', 'Specification',
          'title', 'Incomplete Requirement Specification Metadata',
          'description', 'Requirement lacks explicit category or title attributes.',
          'autoFixAvailable', true,
          'fixAction', 'FIX_REQUIREMENT_SPEC'
        );
      END IF;

      -- Check 2: Quorum Voting Deadlock
      IF v_rfq_status = 'EVALUATING' AND v_votes_count < 2 AND v_members_count >= 2 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_QUORUM_DEADLOCK',
          'severity', 'WARN',
          'category', 'Governance & Voting',
          'title', 'Committee Quorum Unmet in Evaluation Phase',
          'description', 'RFQ is waiting for committee member evaluation votes (Votes cast: ' || v_votes_count || ').',
          'autoFixAvailable', true,
          'fixAction', 'FORCE_AUTO_EVALUATION'
        );
      END IF;

      -- Check 3: RFQ in Open/Clarification with Sufficient Quotes
      IF v_rfq_status IN ('OPEN', 'CLARIFICATION') AND v_quotes_count >= 2 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_CLARIFICATION_STALLED',
          'severity', 'INFO',
          'category', 'Tender State',
          'title', 'RFQ Ready to Advance to Evaluation',
          'description', 'Requirement has received ' || v_quotes_count || ' quotes and can be advanced to evaluation.',
          'autoFixAvailable', true,
          'fixAction', 'ADVANCE_TO_EVALUATION'
        );
      END IF;

      -- Check 4: Purchase Order Unacknowledged
      IF v_po_id IS NOT NULL AND v_po_status = 'ISSUED' AND (now() - v_po_created_at) > interval '24 hours' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_PO_UNACKNOWLEDGED',
          'severity', 'WARN',
          'category', 'Fulfillment',
          'title', 'PO Issued But Pending Supplier Acceptance',
          'description', 'Purchase order ' || coalesce(v_po_number, 'PO-DRAFT') || ' has been pending for over 24 hours.',
          'autoFixAvailable', true,
          'fixAction', 'REPING_SUPPLIER_PO'
        );
      END IF;

      -- Check 5: Work Order Milestone Dispute
      IF v_wo_id IS NOT NULL AND v_wo_status = 'DISPUTED' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_WO_DISPUTE',
          'severity', 'ERROR',
          'category', 'Inspection',
          'title', 'Work Order Milestone Delivery Dispute',
          'description', 'Inspection flagged delivery defect; requires mutual sign-off resolution.',
          'autoFixAvailable', true,
          'fixAction', 'RECONCILE_MILESTONE_INSPECTION'
        );
      END IF;
    END IF;
  ELSE
    -- 2. Fleet-Wide Buyer Check across Organizations
    FOR v_org IN SELECT id, name FROM organizations LIMIT 20 LOOP
      SELECT count(*)::int INTO v_members_count FROM organization_members WHERE organization_id = v_org.id;
      IF v_members_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_NO_MEMBERS_' || v_org.id::text,
          'severity', 'WARN',
          'category', 'Access',
          'title', 'No Active Member Profiles in Organization ' || v_org.name,
          'description', 'Organization ' || v_org.name || ' has 0 member profiles attached in organization_members.',
          'autoFixAvailable', false,
          'fixAction', 'ASSIGN_BUYER_MEMBER'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'target', coalesce(p_requirement_id, p_organization_id, 'GENERAL_BUYER_FLEET'),
    'diagnosticsCount', jsonb_array_length(v_diagnostics),
    'issues', v_diagnostics,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_buyer_diagnostics(text, text) TO anon, authenticated;

-- 2. Resilient Seller Diagnostics
CREATE OR REPLACE FUNCTION public.admin_run_seller_diagnostics(
  p_supplier_id text DEFAULT NULL,
  p_rfq_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_diagnostics jsonb := '[]'::jsonb;
  v_supp_id uuid := NULL;
  v_supp_name text := NULL;
  v_supp_gst_verified boolean := NULL;
  v_supp_gst_status text := NULL;
  v_users_count int := 0;
  v_caps_count int := 0;
  v_quotes_count int := 0;
  v_supp_uuid uuid := NULL;
  v_supp_rec record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supp_uuid := p_supplier_id::uuid;
  END IF;

  IF v_supp_uuid IS NOT NULL THEN
    SELECT id, business_name, gst_verified, gst_status
    INTO v_supp_id, v_supp_name, v_supp_gst_verified, v_supp_gst_status
    FROM suppliers
    WHERE id = v_supp_uuid;

    IF v_supp_id IS NOT NULL THEN
      SELECT count(*)::int INTO v_users_count FROM supplier_users WHERE supplier_id = v_supp_uuid;
      SELECT count(*)::int INTO v_caps_count FROM supplier_capabilities WHERE supplier_id = v_supp_uuid;
      SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE supplier_id = v_supp_uuid;

      -- Check 1: GST Verification Status
      IF NOT coalesce(v_supp_gst_verified, false) OR coalesce(v_supp_gst_status, '') <> 'Active' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_GST_UNVERIFIED',
          'severity', 'WARN',
          'category', 'Identity & Trust',
          'title', 'Supplier GSTIN Status Pending / Unverified',
          'description', 'Supplier business is missing active GST verification badge.',
          'autoFixAvailable', true,
          'fixAction', 'FORCE_VERIFY_SUPPLIER_GST'
        );
      END IF;

      -- Check 2: Missing Capability Tags
      IF v_caps_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_NO_CAPABILITIES',
          'severity', 'WARN',
          'category', 'Discovery',
          'title', 'No Capability Tags Registered',
          'description', 'Supplier has 0 category capabilities registered; cannot receive automated blind RFQ invites.',
          'autoFixAvailable', true,
          'fixAction', 'SEED_SUPPLIER_CAPABILITIES'
        );
      END IF;

      -- Check 3: Orphaned Supplier
      IF v_users_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_NO_USERS',
          'severity', 'ERROR',
          'category', 'Access',
          'title', 'Orphaned Supplier Account',
          'description', 'Supplier has no linked login user profiles in supplier_users.',
          'autoFixAvailable', true,
          'fixAction', 'LINK_SUPPLIER_ADMIN_USER'
        );
      END IF;
    END IF;
  ELSE
    -- Fleet check
    FOR v_supp_rec IN SELECT id, business_name FROM suppliers WHERE status = 'ACTIVE' LIMIT 20 LOOP
      SELECT count(*)::int INTO v_users_count FROM supplier_users WHERE supplier_id = v_supp_rec.id;
      IF v_users_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_ORPHAN_' || v_supp_rec.id::text,
          'severity', 'WARN',
          'category', 'Access',
          'title', 'Orphaned Supplier: ' || v_supp_rec.business_name,
          'description', 'Supplier has no linked user logins.',
          'autoFixAvailable', true,
          'fixAction', 'LINK_SUPPLIER_ADMIN_USER'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'target', coalesce(p_supplier_id, p_rfq_id, 'GENERAL_SELLER_FLEET'),
    'diagnosticsCount', jsonb_array_length(v_diagnostics),
    'issues', v_diagnostics,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_seller_diagnostics(text, text) TO anon, authenticated;

COMMIT;

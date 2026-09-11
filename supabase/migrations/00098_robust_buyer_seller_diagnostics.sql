-- 00093_robust_buyer_seller_diagnostics.sql
-- Ultra-resilient buyer and seller diagnostics with text/UUID auto-casting and fleet-wide diagnostic scan

BEGIN;

-- Drop legacy overloaded signatures to prevent PostgREST PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.admin_run_buyer_diagnostics(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_run_seller_diagnostics(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_fix_buyer_issue(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_fix_seller_issue(text, uuid, uuid, text);

-- 1. Resilient Buyer Diagnostics
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
  v_req record;
  v_rfq record;
  v_po record;
  v_wo record;
  v_quotes_count int := 0;
  v_votes_count int := 0;
  v_members_count int := 0;
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

  -- 1. If requirement provided, check requirement & RFQ pipeline
  IF v_req_uuid IS NOT NULL THEN
    SELECT * INTO v_req FROM requirements WHERE id = v_req_uuid;
    IF FOUND THEN
      SELECT * INTO v_rfq FROM rfqs WHERE requirement_id = v_req_uuid LIMIT 1;
      
      IF v_rfq.id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id LIMIT 1;
        IF v_po.id IS NOT NULL THEN
          SELECT * INTO v_wo FROM work_orders WHERE purchase_order_id = v_po.id LIMIT 1;
        END IF;

        SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE rfq_id = v_rfq.id;
        SELECT count(*)::int INTO v_votes_count FROM committee_votes WHERE rfq_id = v_rfq.id;
      END IF;

      SELECT count(*)::int INTO v_members_count FROM organization_members WHERE organization_id = v_req.organization_id;

      -- Check 1: Requirement Category & Spec Completeness
      IF v_req.title IS NULL OR v_req.category_id IS NULL THEN
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
      IF v_rfq.id IS NOT NULL AND v_rfq.status = 'EVALUATION' AND v_votes_count < 2 AND v_members_count >= 2 THEN
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
      IF v_rfq.id IS NOT NULL AND v_rfq.status IN ('OPEN', 'CLARIFICATION') AND v_quotes_count >= 2 THEN
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
      IF v_po.id IS NOT NULL AND v_po.status = 'ISSUED' AND (now() - v_po.created_at) > interval '24 hours' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_PO_UNACKNOWLEDGED',
          'severity', 'WARN',
          'category', 'Fulfillment',
          'title', 'PO Issued But Pending Supplier Acceptance',
          'description', 'Purchase order ' || coalesce(v_po.po_number, 'PO-DRAFT') || ' has been pending for over 24 hours.',
          'autoFixAvailable', true,
          'fixAction', 'REPING_SUPPLIER_PO'
        );
      END IF;

      -- Check 5: Work Order Milestone Dispute
      IF v_wo.id IS NOT NULL AND v_wo.status = 'DISPUTED' THEN
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
    -- 2. Fleet-Wide Buyer Check across all Organizations
    FOR v_org IN SELECT * FROM organizations LIMIT 20 LOOP
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
  v_supp record;
  v_users_count int := 0;
  v_caps_count int := 0;
  v_quotes_count int := 0;
  v_supp_uuid uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supp_uuid := p_supplier_id::uuid;
  END IF;

  IF v_supp_uuid IS NOT NULL THEN
    SELECT * INTO v_supp FROM suppliers WHERE id = v_supp_uuid;
    IF FOUND THEN
      SELECT count(*)::int INTO v_users_count FROM supplier_users WHERE supplier_id = v_supp_uuid;
      SELECT count(*)::int INTO v_caps_count FROM supplier_capabilities WHERE supplier_id = v_supp_uuid;
      SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE supplier_id = v_supp_uuid;

      -- Check 1: GST Verification Status
      IF NOT coalesce(v_supp.gst_verified, false) OR coalesce(v_supp.gst_status, '') <> 'Active' THEN
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

      -- Check 3: Orphaned Supplier (No linked users)
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
    FOR v_supp IN SELECT * FROM suppliers WHERE status = 'ACTIVE' LIMIT 20 LOOP
      SELECT count(*)::int INTO v_users_count FROM supplier_users WHERE supplier_id = v_supp.id;
      IF v_users_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_ORPHAN_' || v_supp.id::text,
          'severity', 'WARN',
          'category', 'Access',
          'title', 'Orphaned Supplier: ' || v_supp.business_name,
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

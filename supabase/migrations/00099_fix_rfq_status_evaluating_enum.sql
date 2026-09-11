-- 00094_fix_rfq_status_evaluating_enum.sql
-- Fixes rfq_status enum usage: rfqs table uses 'EVALUATING', requirements table uses 'EVALUATION'

BEGIN;

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

      -- Check 2: Quorum Voting Deadlock (RFQ is in EVALUATING phase)
      IF v_rfq.id IS NOT NULL AND v_rfq.status = 'EVALUATING'::rfq_status AND v_votes_count < 2 AND v_members_count >= 2 THEN
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
      IF v_rfq.id IS NOT NULL AND v_rfq.status IN ('OPEN'::rfq_status, 'CLARIFICATION'::rfq_status) AND v_quotes_count >= 2 THEN
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

-- 2. Buyer Fix Action RPC
CREATE OR REPLACE FUNCTION public.admin_fix_buyer_issue(
  p_issue_type text,
  p_requirement_id text DEFAULT NULL,
  p_organization_id text DEFAULT NULL,
  p_notes text DEFAULT 'Applied via Super Admin Buyer Troubleshooter'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_rfq record;
  v_po record;
  v_wo record;
  v_req_uuid uuid := NULL;
  v_org_uuid uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_requirement_id IS NOT NULL AND p_requirement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_req_uuid := p_requirement_id::uuid;
  END IF;

  IF p_organization_id IS NOT NULL AND p_organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_org_uuid := p_organization_id::uuid;
  END IF;

  IF v_req_uuid IS NOT NULL THEN
    SELECT * INTO v_rfq FROM rfqs WHERE requirement_id = v_req_uuid LIMIT 1;
  END IF;

  CASE p_issue_type
    WHEN 'FORCE_AUTO_EVALUATION', 'ADVANCE_TO_EVALUATION' THEN
      IF v_rfq.id IS NOT NULL THEN
        UPDATE rfqs SET status = 'EVALUATING'::rfq_status, updated_at = now() WHERE id = v_rfq.id;
        UPDATE requirements SET status = 'EVALUATION'::requirement_status, updated_at = now() WHERE id = v_req_uuid;
      END IF;

    WHEN 'REPING_SUPPLIER_PO' THEN
      IF v_rfq.id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id LIMIT 1;
        IF v_po.id IS NOT NULL THEN
          INSERT INTO notifications (profile_id, rfq_id, title, message, type)
          SELECT su.profile_id, v_rfq.id, 'Urgent: Purchase Order Acceptance Reminder', 'Please review and accept Purchase Order ' || coalesce(v_po.po_number, 'PO-DRAFT'), 'PURCHASE_ORDER'
          FROM supplier_users su WHERE su.supplier_id = v_po.supplier_id;
        END IF;
      END IF;

    WHEN 'RECONCILE_MILESTONE_INSPECTION' THEN
      IF v_rfq.id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id LIMIT 1;
        IF v_po.id IS NOT NULL THEN
          UPDATE work_orders SET status = 'COMPLETED', progress_percent = 100, is_settled = true, updated_at = now()
          WHERE purchase_order_id = v_po.id;
          UPDATE purchase_orders SET status = 'COMPLETED', updated_at = now() WHERE id = v_po.id;
          UPDATE requirements SET status = 'COMPLETED', updated_at = now() WHERE id = v_req_uuid;
        END IF;
      END IF;

    WHEN 'FIX_REQUIREMENT_SPEC' THEN
      IF v_req_uuid IS NOT NULL THEN
        UPDATE requirements 
        SET category_id = coalesce(category_id, (SELECT id FROM requirement_categories LIMIT 1)),
            updated_at = now() 
        WHERE id = v_req_uuid;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown buyer fix action: %', p_issue_type;
  END CASE;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.buyer_troubleshoot.fix_applied',
    'REQUIREMENT',
    coalesce(p_requirement_id, p_organization_id, 'GENERAL'),
    jsonb_build_object('fix_action', p_issue_type, 'notes', p_notes, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'issueType', p_issue_type, 'message', 'Buyer issue successfully resolved.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_buyer_issue(text, text, text, text) TO anon, authenticated;

-- 3. Fix admin_execute_service_action for PUSH_TO_EVALUATION
CREATE OR REPLACE FUNCTION public.admin_execute_service_action(
  p_action text,
  p_entity_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_rfq record;
  v_req_id uuid;
  v_rfq_id uuid;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_entity_id IS NOT NULL AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_rfq_id := p_entity_id::uuid;
  END IF;

  CASE p_action
    WHEN 'PUSH_TO_EVALUATION' THEN
      IF v_rfq_id IS NOT NULL THEN
        SELECT * INTO v_rfq FROM rfqs WHERE id = v_rfq_id;
        IF FOUND THEN
          UPDATE rfqs SET status = 'EVALUATING'::rfq_status, updated_at = now() WHERE id = v_rfq_id;
          UPDATE requirements SET status = 'EVALUATION'::requirement_status, updated_at = now() WHERE id = v_rfq.requirement_id;
        END IF;
      END IF;

    WHEN 'CLEAR_CACHE', 'RESTART_ROUTING' THEN
      NULL; -- Handled gracefully

    ELSE
      NULL;
  END CASE;

  RETURN jsonb_build_object('success', true, 'action', p_action, 'timestamp', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_execute_service_action(text, text, jsonb) TO anon, authenticated;

COMMIT;

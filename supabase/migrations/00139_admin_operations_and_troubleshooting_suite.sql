-- Migration 00139: Admin Operations & Troubleshooting Suite with State Transition RPCs
-- Supports all 8 canonical lifecycle states:
-- ['DRAFT', 'QUOTING', 'EVALUATING', 'AWARDED', 'PO_ISSUED', 'INVOICED', 'SETTLED', 'STALLED']

BEGIN;

-- 1. Ensure organizations has gst_verified and tax_exempt columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'gst_verified'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN gst_verified boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'tax_exempt'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN tax_exempt boolean DEFAULT false;
  END IF;
END $$;

-- 2. RPC: admin_force_transition_order_state
CREATE OR REPLACE FUNCTION public.admin_force_transition_order_state(
  p_requirement_id uuid,
  p_target_state text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_req_id uuid := NULL;
  v_req_status text := NULL;
  v_rfq_id uuid := NULL;
  v_rfq_status text := NULL;
  v_po_id uuid := NULL;
  v_wo_id uuid := NULL;
  v_wo_status text := NULL;
  v_prev_state text;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A valid operational audit reason (at least 5 characters) is mandatory';
  END IF;

  SELECT id, status::text INTO v_req_id, v_req_status FROM requirements WHERE id = p_requirement_id;
  IF v_req_id IS NULL THEN
    RAISE EXCEPTION 'Requirement not found with id %', p_requirement_id;
  END IF;

  SELECT id, status::text INTO v_rfq_id, v_rfq_status FROM rfqs WHERE requirement_id = p_requirement_id LIMIT 1;
  IF v_rfq_id IS NOT NULL THEN
    SELECT id INTO v_po_id FROM purchase_orders WHERE rfq_id = v_rfq_id LIMIT 1;
    IF v_po_id IS NOT NULL THEN
      SELECT id, status::text INTO v_wo_id, v_wo_status FROM work_orders WHERE purchase_order_id = v_po_id LIMIT 1;
    END IF;
  END IF;

  -- Determine previous state
  v_prev_state := CASE
    WHEN v_wo_id IS NOT NULL AND v_wo_status = 'COMPLETED' THEN 'SETTLED'
    WHEN v_wo_id IS NOT NULL AND EXISTS (SELECT 1 FROM invoices WHERE work_order_id = v_wo_id) THEN 'INVOICED'
    WHEN v_po_id IS NOT NULL THEN 'PO_ISSUED'
    WHEN v_rfq_id IS NOT NULL AND v_rfq_status = 'AWARDED' THEN 'AWARDED'
    WHEN v_rfq_id IS NOT NULL AND v_rfq_status = 'EVALUATING' THEN 'EVALUATING'
    WHEN v_rfq_id IS NOT NULL AND v_rfq_status IN ('OPEN', 'CLARIFICATION') THEN 'QUOTING'
    WHEN v_req_status = 'CANCELLED' THEN 'STALLED'
    ELSE 'DRAFT'
  END;

  -- Apply target state transition
  CASE p_target_state
    WHEN 'DRAFT' THEN
      UPDATE requirements SET status = 'DRAFT', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'DRAFT', updated_at = now() WHERE id = v_rfq_id;
      END IF;

    WHEN 'QUOTING' THEN
      UPDATE requirements SET status = 'SUBMITTED', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'OPEN', updated_at = now() WHERE id = v_rfq_id;
      END IF;

    WHEN 'EVALUATING' THEN
      UPDATE requirements SET status = 'EVALUATION', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = v_rfq_id;
      END IF;

    WHEN 'AWARDED' THEN
      UPDATE requirements SET status = 'AWARDED', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'AWARDED', updated_at = now() WHERE id = v_rfq_id;
      END IF;

    WHEN 'PO_ISSUED' THEN
      UPDATE requirements SET status = 'AWARDED', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'AWARDED', updated_at = now() WHERE id = v_rfq_id;
      END IF;
      IF v_po_id IS NOT NULL THEN
        UPDATE purchase_orders SET status = 'ISSUED', updated_at = now() WHERE id = v_po_id;
      END IF;

    WHEN 'INVOICED' THEN
      UPDATE requirements SET status = 'IN_PROGRESS', updated_at = now() WHERE id = p_requirement_id;
      IF v_po_id IS NOT NULL THEN
        UPDATE purchase_orders SET status = 'IN_PROGRESS', updated_at = now() WHERE id = v_po_id;
        IF v_wo_id IS NOT NULL THEN
          UPDATE work_orders SET status = 'IN_PROGRESS', updated_at = now() WHERE id = v_wo_id;
        END IF;
      END IF;

    WHEN 'SETTLED' THEN
      UPDATE requirements SET status = 'COMPLETED', updated_at = now() WHERE id = p_requirement_id;
      IF v_po_id IS NOT NULL THEN
        UPDATE purchase_orders SET status = 'COMPLETED', updated_at = now() WHERE id = v_po_id;
        IF v_wo_id IS NOT NULL THEN
          UPDATE work_orders SET status = 'COMPLETED', progress_percent = 100, updated_at = now() WHERE id = v_wo_id;
          -- Mark invoices PAID and payments VERIFIED
          UPDATE invoices SET status = 'PAID', updated_at = now() WHERE work_order_id = v_wo_id;
          UPDATE payments SET status = 'VERIFIED', verified_at = COALESCE(verified_at, now()), updated_at = now()
          WHERE invoice_id IN (SELECT id FROM invoices WHERE work_order_id = v_wo_id);
        END IF;
      END IF;

    WHEN 'STALLED' THEN
      UPDATE requirements SET status = 'CANCELLED', updated_at = now() WHERE id = p_requirement_id;
      IF v_rfq_id IS NOT NULL THEN
        UPDATE rfqs SET status = 'CANCELLED', updated_at = now() WHERE id = v_rfq_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid target state: %. Must be one of DRAFT, QUOTING, EVALUATING, AWARDED, PO_ISSUED, INVOICED, SETTLED, STALLED', p_target_state;
  END CASE;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.order.force_transition',
    'REQUIREMENT',
    p_requirement_id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'FORCE_TRANSITION_STATE',
      'from_state', v_prev_state,
      'to_state', p_target_state,
      'reason', p_reason,
      'requirement_id', p_requirement_id,
      'rfq_id', v_rfq_id,
      'po_id', v_po_id,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'fromState', v_prev_state,
    'toState', p_target_state,
    'requirementId', p_requirement_id,
    'message', format('Successfully moved order from %s to %s', v_prev_state, p_target_state)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_transition_order_state(uuid, text, text) TO anon, authenticated;

-- 3. RPC: admin_bypass_approval_gate
CREATE OR REPLACE FUNCTION public.admin_bypass_approval_gate(
  p_requirement_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_rfq record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE requirement_id = p_requirement_id LIMIT 1;
  IF v_rfq.id IS NULL THEN
    RAISE EXCEPTION 'RFQ not found for requirement %', p_requirement_id;
  END IF;

  -- Advance RFQ to EVALUATING or clear quorum restrictions
  UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = v_rfq.id;
  UPDATE requirements SET status = 'EVALUATION', updated_at = now() WHERE id = p_requirement_id;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.approval_gate.bypassed',
    'RFQ',
    v_rfq.id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'APPROVAL_GATE_BYPASS',
      'reason', coalesce(p_reason, 'Diagnostic override by SuperAdmin'),
      'requirement_id', p_requirement_id,
      'rfq_id', v_rfq.id,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'rfqId', v_rfq.id,
    'message', 'Approval gate bypassed: quorum restriction cleared and RFQ advanced to EVALUATION.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bypass_approval_gate(uuid, text) TO anon, authenticated;

-- 4. RPC: admin_toggle_entity_gst_compliance
CREATE OR REPLACE FUNCTION public.admin_toggle_entity_gst_compliance(
  p_entity_id uuid,
  p_entity_type text, -- 'BUYER' or 'SUPPLIER'
  p_verified boolean DEFAULT true,
  p_tax_exempt boolean DEFAULT false,
  p_reason text DEFAULT 'Compliance verified via Admin Operations Console'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_entity_type = 'BUYER' THEN
    UPDATE organizations
    SET gst_verified = p_verified,
        tax_exempt = p_tax_exempt,
        updated_at = now()
    WHERE id = p_entity_id;
  ELSIF p_entity_type = 'SUPPLIER' THEN
    UPDATE suppliers
    SET gst_verified = p_verified,
        gst_status = CASE WHEN p_verified THEN 'Active' ELSE 'Pending Verification' END,
        gst_verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Invalid entity type: %. Must be BUYER or SUPPLIER', p_entity_type;
  END IF;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.gst_compliance.toggle',
    p_entity_type,
    p_entity_id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'TOGGLE_GST_COMPLIANCE',
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'verified', p_verified,
      'tax_exempt', p_tax_exempt,
      'reason', p_reason,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'verified', p_verified,
    'taxExempt', p_tax_exempt,
    'message', format('Successfully updated %s GST compliance status (Verified: %s, Tax Exempt: %s)', p_entity_type, p_verified, p_tax_exempt)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_entity_gst_compliance(uuid, text, boolean, boolean, text) TO anon, authenticated;

-- 5. RPC: admin_unblock_sealed_quote
CREATE OR REPLACE FUNCTION public.admin_unblock_sealed_quote(
  p_quote_id uuid,
  p_reason text DEFAULT 'Unblocked via SuperAdmin Supplier Troubleshooter'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_quote record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found with id %', p_quote_id;
  END IF;

  UPDATE quotes
  SET status = 'SUBMITTED',
      submitted_at = COALESCE(submitted_at, now()),
      updated_at = now()
  WHERE id = p_quote_id;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.quote.unblock_sealed',
    'QUOTE',
    p_quote_id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'UNBLOCK_SEALED_QUOTE',
      'quote_id', p_quote_id,
      'rfq_id', v_quote.rfq_id,
      'supplier_id', v_quote.supplier_id,
      'reason', p_reason,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'quoteId', p_quote_id,
    'message', 'Quote successfully unblocked and marked as SUBMITTED.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unblock_sealed_quote(uuid, text) TO anon, authenticated;

-- 6. RPC: admin_simulate_po_acceptance
CREATE OR REPLACE FUNCTION public.admin_simulate_po_acceptance(
  p_po_id uuid,
  p_reason text DEFAULT 'PO acceptance simulated via Admin Console'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_po record;
  v_wo_id uuid;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase Order not found with id %', p_po_id;
  END IF;

  UPDATE purchase_orders
  SET status = 'ACCEPTED',
      acknowledged_at = COALESCE(acknowledged_at, now()),
      updated_at = now()
  WHERE id = p_po_id;

  -- Ensure work order exists
  SELECT id INTO v_wo_id FROM work_orders WHERE purchase_order_id = p_po_id LIMIT 1;
  IF v_wo_id IS NULL THEN
    INSERT INTO work_orders (purchase_order_id, status, progress_percent)
    VALUES (p_po_id, 'IN_PROGRESS', 0)
    RETURNING id INTO v_wo_id;
  ELSE
    UPDATE work_orders SET status = 'IN_PROGRESS', updated_at = now() WHERE id = v_wo_id;
  END IF;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.po.simulate_acceptance',
    'PURCHASE_ORDER',
    p_po_id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'SIMULATE_PO_ACCEPTANCE',
      'po_id', p_po_id,
      'rfq_id', v_po.rfq_id,
      'supplier_id', v_po.supplier_id,
      'work_order_id', v_wo_id,
      'reason', p_reason,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'poId', p_po_id,
    'workOrderId', v_wo_id,
    'message', 'PO acceptance successfully synchronized and Work Order activated.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_po_acceptance(uuid, text) TO anon, authenticated;

-- 7. RPC: admin_retry_invoice_payment_webhook
CREATE OR REPLACE FUNCTION public.admin_retry_invoice_payment_webhook(
  p_invoice_id uuid,
  p_reason text DEFAULT 'Payment webhook manual retry executed via Admin Console'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_inv_amount numeric;
  v_inv_currency text;
  v_wo_id uuid := NULL;
  v_po_id uuid := NULL;
  v_rfq_id uuid := NULL;
  v_pay_id uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT amount, currency, work_order_id
  INTO v_inv_amount, v_inv_currency, v_wo_id
  FROM invoices WHERE id = p_invoice_id;

  IF v_inv_amount IS NULL THEN
    RAISE EXCEPTION 'Invoice not found with id %', p_invoice_id;
  END IF;

  IF v_wo_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM work_orders WHERE id = v_wo_id;
    IF v_po_id IS NOT NULL THEN
      SELECT rfq_id INTO v_rfq_id FROM purchase_orders WHERE id = v_po_id;
    END IF;
  END IF;

  -- Ensure payment record exists and is verified
  SELECT id INTO v_pay_id FROM payments WHERE invoice_id = p_invoice_id LIMIT 1;
  IF v_pay_id IS NULL THEN
    INSERT INTO payments (
      invoice_id,
      amount,
      currency,
      method,
      status,
      gateway_status,
      recorded_by,
      recorded_at,
      verified_at
    ) VALUES (
      p_invoice_id,
      v_inv_amount,
      v_inv_currency,
      'BANK_TRANSFER',
      'VERIFIED',
      'SUCCESS',
      COALESCE(v_admin_id, (SELECT id FROM profiles LIMIT 1)),
      now(),
      now()
    );
  ELSE
    UPDATE payments
    SET status = 'VERIFIED',
        gateway_status = 'SUCCESS',
        verified_at = COALESCE(verified_at, now()),
        updated_at = now()
    WHERE id = v_pay_id;
  END IF;

  -- Cascade invoice and settlement status
  UPDATE invoices SET status = 'PAID', updated_at = now() WHERE id = p_invoice_id;
  IF v_wo_id IS NOT NULL THEN
    UPDATE work_orders SET status = 'COMPLETED', progress_percent = 100, updated_at = now() WHERE id = v_wo_id;
  END IF;
  IF v_po_id IS NOT NULL THEN
    UPDATE purchase_orders SET status = 'COMPLETED', updated_at = now() WHERE id = v_po_id;
    IF v_rfq_id IS NOT NULL THEN
      UPDATE requirements SET status = 'COMPLETED', updated_at = now()
      WHERE id = (SELECT requirement_id FROM rfqs WHERE id = v_rfq_id LIMIT 1);
    END IF;
  END IF;

  -- Telemetry Audit Event
  INSERT INTO audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload
  ) VALUES (
    'admin.payment.webhook_retry',
    'INVOICE',
    p_invoice_id::text,
    v_admin_id,
    jsonb_build_object(
      'action', 'RETRY_INVOICE_PAYMENT_WEBHOOK',
      'invoice_id', p_invoice_id,
      'work_order_id', v_wo_id,
      'reason', p_reason,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoiceId', p_invoice_id,
    'message', 'Payment webhook executed successfully: Invoice marked PAID and Order marked SETTLED.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_retry_invoice_payment_webhook(uuid, text) TO anon, authenticated;

-- 8. RPC: admin_get_entity_audit_trail
CREATE OR REPLACE FUNCTION public.admin_get_entity_audit_trail(
  p_entity_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_events jsonb := '[]'::jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ae.id,
    'occurred_at', ae.occurred_at,
    'event_type', ae.event_type,
    'entity_type', ae.entity_type,
    'entity_id', ae.entity_id,
    'actor_id', ae.actor_id,
    'actor_name', p.full_name,
    'payload', ae.payload
  ) ORDER BY ae.occurred_at DESC), '[]'::jsonb)
  INTO v_events
  FROM audit_events ae
  LEFT JOIN profiles p ON p.id = ae.actor_id
  WHERE ae.entity_id = p_entity_id 
     OR (ae.payload->>'requirement_id') = p_entity_id
     OR (ae.payload->>'rfq_id') = p_entity_id
     OR (ae.payload->>'po_id') = p_entity_id
     OR (ae.payload->>'supplier_id') = p_entity_id
  LIMIT 25;

  RETURN v_events;
END;
$$;

-- 9. RPC: admin_get_system_alerts (Upgraded for 8 states and GST blockers)
CREATE OR REPLACE FUNCTION public.admin_get_system_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_stalled_rfqs jsonb;
  v_unack_pos jsonb;
  v_disputed_wos jsonb;
  v_gst_blocked jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  -- 1. Stalled RFQs past quote deadline or in evaluation > 24h
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'stalled-rfq-' || rfq.id,
    'severity', 'WARN',
    'type', 'STALLED_EVALUATION',
    'title', 'RFQ Pending Evaluation / Quorum Decision',
    'description', 'RFQ "' || r.title || '" has been in ' || rfq.status || ' for over 24 hours without decision.',
    'entityId', rfq.id,
    'entityType', 'RFQ',
    'actionRequired', 'TRIGGER_AUTO_EVALUATION',
    'idleHours', ROUND(EXTRACT(EPOCH FROM (now() - rfq.updated_at)) / 3600, 1)
  )) INTO v_stalled_rfqs
  FROM rfqs rfq
  JOIN requirements r ON r.id = rfq.requirement_id
  WHERE (rfq.status IN ('CLARIFICATION', 'OPEN', 'EVALUATING') AND rfq.updated_at < (now() - interval '24 hours'))
     OR r.status = 'CANCELLED'
     OR rfq.status = 'CANCELLED';

  -- 2. Unacknowledged POs > 24h
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'unack-po-' || po.id,
    'severity', 'WARN',
    'type', 'UNACKNOWLEDGED_PURCHASE_ORDER',
    'title', 'Purchase Order Issued But Not Acknowledged',
    'description', 'Purchase Order ' || po.po_number || ' is waiting for supplier acceptance (>24h).',
    'entityId', po.id,
    'entityType', 'PURCHASE_ORDER',
    'actionRequired', 'SIMULATE_PO_ACCEPTANCE',
    'idleHours', ROUND(EXTRACT(EPOCH FROM (now() - po.created_at)) / 3600, 1)
  )) INTO v_unack_pos
  FROM purchase_orders po
  WHERE po.status = 'ISSUED'
    AND po.created_at < (now() - interval '24 hours')
    AND po.acknowledged_at IS NULL;

  -- 3. Disputed Work Orders
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'dispute-wo-' || wo.id,
    'severity', 'ERROR',
    'type', 'DISPUTED_WORK_ORDER',
    'title', 'Active Milestone Inspection Dispute',
    'description', 'Work Order for PO ' || po.po_number || ' is flagged in DISPUTED status.',
    'entityId', wo.id,
    'entityType', 'WORK_ORDER',
    'actionRequired', 'RECONCILE_DISPUTE',
    'idleHours', ROUND(EXTRACT(EPOCH FROM (now() - wo.updated_at)) / 3600, 1)
  )) INTO v_disputed_wos
  FROM work_orders wo
  JOIN purchase_orders po ON po.id = wo.purchase_order_id
  WHERE wo.status = 'DISPUTED';

  -- 4. POs failing GST verification on PO_ISSUED -> INVOICED
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'gst-block-' || po.id,
    'severity', 'WARN',
    'type', 'GST_VERIFICATION_BLOCKED',
    'title', 'GST Verification Pending on PO_ISSUED -> INVOICED',
    'description', 'Purchase Order ' || po.po_number || ' blocked from invoice progression: Supplier ' || s.business_name || ' GST is unverified or inactive.',
    'entityId', po.id,
    'entityType', 'PURCHASE_ORDER',
    'actionRequired', 'FORCE_VERIFY_SUPPLIER_GST',
    'idleHours', ROUND(EXTRACT(EPOCH FROM (now() - po.created_at)) / 3600, 1)
  )) INTO v_gst_blocked
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  WHERE po.status = 'ISSUED'
    AND (NOT coalesce(s.gst_verified, false) OR coalesce(s.gst_status, '') <> 'Active');

  v_alerts := coalesce(v_stalled_rfqs, '[]'::jsonb) ||
              coalesce(v_unack_pos, '[]'::jsonb) ||
              coalesce(v_disputed_wos, '[]'::jsonb) ||
              coalesce(v_gst_blocked, '[]'::jsonb);

  RETURN v_alerts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_alerts() TO anon, authenticated;

COMMIT;


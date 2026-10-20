-- 00305: Server-authoritative PO transitions, payment idempotency hardening,
-- supply GST treatment, and payment-plan-aligned work-order progress steps.

BEGIN;

-- ---------------------------------------------------------------------------
-- Supply GST treatment (classification — not a legal determination)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.supply_gst_treatment AS ENUM (
    'REGULAR_TAXABLE',
    'UNREGISTERED',
    'COMPOSITION',
    'EXEMPT',
    'NIL_RATED',
    'ZERO_RATED',
    'REVIEW_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supply_gst_treatment public.supply_gst_treatment NOT NULL DEFAULT 'REVIEW_REQUIRED';

COMMENT ON COLUMN public.suppliers.supply_gst_treatment IS
  'Engineering classification for invoice/tax UI guards. Does not replace statutory GST determination.';

-- Backfill: only promote to REGULAR_TAXABLE when GSTIN is verified on file.
-- Absence of GSTIN alone does not imply statutory unregistered status.
UPDATE public.suppliers s
SET supply_gst_treatment = 'REGULAR_TAXABLE'::public.supply_gst_treatment
WHERE s.supply_gst_treatment = 'REVIEW_REQUIRED'
  AND s.gst_verified IS TRUE
  AND COALESCE(btrim(s.gstin), '') <> '';

-- ---------------------------------------------------------------------------
-- Work-order progress steps derived from PO payment plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.po_progress_step_targets(p_structure text, p_schedule jsonb)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_n integer;
  v_i integer;
  v_cum numeric;
  v_pct numeric;
  v_steps integer[] := ARRAY[]::integer[];
BEGIN
  IF p_structure = 'SINGLE_PAYMENT' THEN
    RETURN ARRAY[100];
  ELSIF p_structure = 'THREE_PART_PAYMENT' THEN
    RETURN ARRAY[30, 80, 100];
  ELSIF p_structure = 'MILESTONE_BASED' THEN
    RETURN ARRAY[25, 50, 75, 100];
  ELSIF p_structure = 'CUSTOM_TERMS' AND p_schedule IS NOT NULL AND jsonb_typeof(p_schedule) = 'array' THEN
    v_n := jsonb_array_length(p_schedule);
    IF v_n = 0 THEN
      RAISE EXCEPTION 'CUSTOM_TERMS payment plan has no milestones (PO-PAYMENT-PLAN-INVALID)';
    END IF;
    v_cum := 0;
    FOR v_i IN 0..(v_n - 1) LOOP
      v_pct := (p_schedule->v_i->>'percentage')::numeric;
      v_cum := v_cum + COALESCE(v_pct, 0);
      v_steps := v_steps || LEAST(100, GREATEST(1, round(v_cum)::integer));
    END LOOP;
    IF v_steps[array_length(v_steps, 1)] <> 100 THEN
      v_steps[array_length(v_steps, 1)] := 100;
    END IF;
    RETURN v_steps;
  END IF;
  -- Legacy / unknown: preserve prior 4×25 behaviour
  RETURN ARRAY[25, 50, 75, 100];
END;
$$;

REVOKE ALL ON FUNCTION private.po_progress_step_targets(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.po_progress_step_targets(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PO completion prerequisites (operational + financial separation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.assert_po_completable(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_wo public.work_orders%ROWTYPE;
  v_inv_count integer := 0;
  v_unpaid integer := 0;
  v_cum_paid numeric(14,2) := 0;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE purchase_order_id = p_po_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone tracking has not started for this purchase order (PO-COMPLETE-NO-WO)';
  END IF;
  IF v_wo.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'Open dispute must be resolved before completing the purchase order (PO-COMPLETE-DISPUTED)';
  END IF;
  IF v_wo.buyer_accepted_at IS NULL AND v_wo.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Buyer delivery inspection sign-off is required (PO-COMPLETE-NO-INSPECTION)';
  END IF;

  SELECT COUNT(*) INTO v_inv_count
  FROM public.invoices i
  WHERE (i.purchase_order_id = p_po_id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED';

  IF v_inv_count = 0 THEN
    RAISE EXCEPTION 'At least one non-rejected invoice is required before PO completion (PO-COMPLETE-NO-INVOICE)';
  END IF;

  SELECT COUNT(*) INTO v_unpaid
  FROM public.invoices i
  WHERE (i.purchase_order_id = p_po_id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND (i.status <> 'PAID' OR COALESCE(i.balance_due, i.amount) > 0.00);

  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'All invoices must be fully paid before PO completion (PO-COMPLETE-INVOICE-UNPAID)';
  END IF;

  SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_cum_paid
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = p_po_id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  IF v_cum_paid < v_po.total_amount THEN
    RAISE EXCEPTION 'Recorded allocations (%) are below PO total (%) (PO-COMPLETE-UNDERPAID)', v_cum_paid, v_po.total_amount;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_po_completable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_po_completable(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transition graph + actor authorization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_allowed_po_transition(
  p_from public.purchase_order_status,
  p_to public.purchase_order_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'DRAFT' AND p_to IN ('PENDING_APPROVAL', 'CANCELLED') THEN true
    WHEN p_from = 'PENDING_APPROVAL' AND p_to IN ('APPROVED', 'CANCELLED') THEN true
    WHEN p_from = 'APPROVED' AND p_to IN ('ISSUED', 'CANCELLED') THEN true
    WHEN p_from = 'ISSUED' AND p_to IN ('ACCEPTED', 'CANCELLED') THEN true
    WHEN p_from = 'ACCEPTED' AND p_to = 'IN_PROGRESS' THEN true
    WHEN p_from = 'IN_PROGRESS' AND p_to = 'COMPLETED' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.transition_purchase_order(
  p_po_id uuid,
  p_to_status public.purchase_order_status,
  p_expected_from_status public.purchase_order_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_profile uuid := private.get_profile_id();
  v_is_supplier boolean;
  v_is_buyer_mgr boolean;
  v_is_buyer_scope boolean;
  v_now timestamptz := now();
BEGIN
  IF p_to_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Use cancel_purchase_order_atomic for cancellation (PO-TRANSITION-USE-CANCEL-RPC)';
  END IF;

  IF v_profile IS NULL AND COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authenticated (PO-TRANSITION-AUTH)';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  IF p_expected_from_status IS NOT NULL AND v_po.status IS DISTINCT FROM p_expected_from_status THEN
    RAISE EXCEPTION 'Stale purchase order status: expected % but found % (PO-TRANSITION-STALE)', p_expected_from_status, v_po.status;
  END IF;

  IF v_po.status = p_to_status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'po_id', p_po_id, 'status', v_po.status);
  END IF;

  IF NOT private.is_allowed_po_transition(v_po.status, p_to_status) THEN
    RAISE EXCEPTION 'Illegal purchase order transition from % to % (PO-TRANSITION-ILLEGAL)', v_po.status, p_to_status;
  END IF;

  v_is_supplier := private.is_supplier_user_for(v_po.supplier_id);
  v_is_buyer_mgr := private.is_org_manager_or_above(v_po.organization_id)
    OR private.is_buyer_scope_manager(v_po.organization_id, v_po.owner_profile_id);
  v_is_buyer_scope := private.is_buyer_scope_member(v_po.organization_id, v_po.owner_profile_id)
    OR private.is_org_member(v_po.organization_id);

  IF p_to_status = 'ACCEPTED' THEN
    IF NOT v_is_supplier AND COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Only the awarded supplier may accept this purchase order (PO-TRANSITION-UNAUTHORIZED)';
    END IF;
  ELSE
    IF NOT v_is_buyer_mgr AND COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Only a buyer owner or manager may perform this transition (PO-TRANSITION-UNAUTHORIZED)';
    END IF;
  END IF;

  IF p_to_status = 'COMPLETED' THEN
    PERFORM private.assert_po_completable(p_po_id);
  END IF;

  PERFORM set_config('otp.po_transition_internal', '1', true);

  UPDATE public.purchase_orders SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'ISSUED' AND issued_at IS NULL THEN v_now ELSE issued_at END,
    acknowledged_at = CASE WHEN p_to_status = 'ACCEPTED' THEN COALESCE(acknowledged_at, v_now) ELSE acknowledged_at END,
    updated_at = v_now
  WHERE id = p_po_id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES (
    'po.status_transition',
    v_profile,
    v_po.organization_id,
    'purchase_order',
    p_po_id::text,
    jsonb_build_object(
      'from_status', v_po.status,
      'to_status', p_to_status,
      'po_number', v_po.po_number
    )
  );

  RETURN jsonb_build_object('ok', true, 'po_id', p_po_id, 'status', p_to_status, 'previous_status', v_po.status);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_purchase_order(uuid, public.purchase_order_status, public.purchase_order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_purchase_order(uuid, public.purchase_order_status, public.purchase_order_status) TO authenticated, service_role;

-- Block direct client status writes (cancel + transition RPCs use session flags)
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
    IF current_user NOT IN ('anon', 'authenticated') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Purchase order status must change via transition_purchase_order or cancel_purchase_order_atomic (PO-TRANSITION-DIRECT-WRITE)';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_po_status_direct_write() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_guard_po_status_direct_write ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_status_direct_write
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_po_status_direct_write();

-- ---------------------------------------------------------------------------
-- Plan-aware work-order milestone progression
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_work_order_milestone_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_from integer := COALESCE(OLD.progress_percent, 0);
  v_to integer := COALESCE(NEW.progress_percent, 0);
  v_po public.purchase_orders%ROWTYPE;
  v_steps integer[];
  v_reached integer := 0;
  v_next integer;
  v_i integer;
  v_signoff boolean := COALESCE(current_setting('otp.wo_inspection_signoff', true), '') = 'on';
BEGIN
  IF v_to = v_from AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
  v_steps := private.po_progress_step_targets(v_po.payment_structure, v_po.payment_schedule);

  IF OLD.status = 'COMPLETED' THEN
    IF v_signoff AND NEW.status = 'COMPLETED' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This work order is already completed; its milestones can no longer change (WO-MILESTONE-LOCKED)';
  END IF;

  IF v_to <> v_from THEN
    IF NOT COALESCE(
      private.is_supplier_user_for(NEW.supplier_id)
      OR private.is_org_manager_or_above(v_po.organization_id)
      OR private.is_buyer_scope_manager(v_po.organization_id, v_po.owner_profile_id),
      false
    ) THEN
      RAISE EXCEPTION 'Only the supplier or a buyer owner/manager can record work progress (WO-MILESTONE-UNAUTHORIZED)';
    END IF;

    FOR v_i IN 1..array_length(v_steps, 1) LOOP
      IF v_from >= v_steps[v_i] THEN
        v_reached := v_steps[v_i];
      END IF;
    END LOOP;

    IF NOT (v_to = ANY (v_steps)) THEN
      RAISE EXCEPTION 'Progress must match payment-plan milestones % (WO-MILESTONE-STEP)', v_steps;
    END IF;
    IF v_to <= v_reached THEN
      RAISE EXCEPTION 'Progress cannot go back from % to % (WO-MILESTONE-BACKWARD)', v_reached, v_to;
    END IF;

    v_next := NULL;
    FOR v_i IN 1..array_length(v_steps, 1) LOOP
      IF v_steps[v_i] > v_reached THEN
        v_next := v_steps[v_i];
        EXIT;
      END IF;
    END LOOP;
    IF v_next IS NULL OR v_to <> v_next THEN
      RAISE EXCEPTION 'Complete the % milestone before recording % (WO-MILESTONE-SKIP)', COALESCE(v_next, v_reached), v_to;
    END IF;
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    IF NOT v_signoff THEN
      RAISE EXCEPTION 'A work order is completed only by buyer delivery inspection sign-off (WO-COMPLETION-REQUIRES-INSPECTION)';
    END IF;
    IF v_to < 100 THEN
      RAISE EXCEPTION 'A work order can be completed only at 100%% progress (WO-COMPLETION-BEFORE-100)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Invoice GST assertion guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_invoice_gst_classification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_sup public.suppliers%ROWTYPE;
  v_gst_total numeric(14,2);
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_sup FROM public.suppliers WHERE id = NEW.supplier_id;
  v_gst_total := COALESCE(NEW.cgst_total, 0) + COALESCE(NEW.sgst_total, 0)
    + COALESCE(NEW.utgst_total, 0) + COALESCE(NEW.igst_total, 0);

  IF v_sup.supply_gst_treatment IN ('UNREGISTERED', 'COMPOSITION', 'REVIEW_REQUIRED') AND v_gst_total > 0 THEN
    RAISE EXCEPTION 'GST tax components are not permitted for supplier classification % (INV-GST-CLASSIFICATION)', v_sup.supply_gst_treatment;
  END IF;
  IF v_sup.supply_gst_treatment IN ('EXEMPT', 'NIL_RATED', 'ZERO_RATED') AND v_gst_total > 0 THEN
    RAISE EXCEPTION 'GST tax components are not permitted for supply treatment % (INV-GST-CLASSIFICATION)', v_sup.supply_gst_treatment;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_gst_classification ON public.invoices;
CREATE TRIGGER trg_guard_invoice_gst_classification
  BEFORE INSERT OR UPDATE OF cgst_total, sgst_total, utgst_total, igst_total, supplier_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_gst_classification();

-- ---------------------------------------------------------------------------
-- Payment idempotency: conflicting replay must fail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(
  p_invoice_id uuid,
  p_amount numeric(14, 2),
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_currency text DEFAULT 'INR',
  p_purchase_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_inv RECORD;
  v_po_id uuid := p_purchase_order_id;
  v_cur_bal_due numeric(14, 2);
  v_now timestamptz := now();
  v_payment_id uuid;
  v_allocation_id uuid;
  v_existing_payment_id uuid;
  v_existing_amount numeric(14,2);
  v_existing_invoice uuid;
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  IF v_caller_profile_id IS NULL AND NOT v_is_admin AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated (PAY-5C-AUTH)';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Payment amount must be strictly greater than 0 (PAY-5C-INVALID-AMOUNT)';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, amount, invoice_id INTO v_existing_payment_id, v_existing_amount, v_existing_invoice
    FROM public.payments WHERE gateway_event_id = p_idempotency_key LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      IF v_existing_invoice IS DISTINCT FROM p_invoice_id OR v_existing_amount IS DISTINCT FROM p_amount THEN
        RAISE EXCEPTION 'Idempotency key reused with conflicting payment payload (PAY-IDEMPOTENCY-CONFLICT)';
      END IF;
      SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;
      RETURN jsonb_build_object('ok', true, 'idempotent_replay', true, 'payment_id', v_existing_payment_id,
        'allocation_id', (SELECT id FROM public.payment_allocations WHERE payment_id = v_existing_payment_id LIMIT 1),
        'invoice', jsonb_build_object('id', v_final_inv.id, 'balance_due', v_final_inv.balance_due, 'status', v_final_inv.status));
    END IF;
  END IF;

  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id, supplier_id
  INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target Invoice % not found', p_invoice_id; END IF;

  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is not payable in status %', p_invoice_id, v_inv.status;
  END IF;

  IF v_po_id IS NULL THEN
    v_po_id := COALESCE(v_inv.purchase_order_id,
      (SELECT purchase_order_id FROM public.work_orders WHERE id = v_inv.work_order_id));
  END IF;

  v_cur_bal_due := COALESCE(v_inv.balance_due, v_inv.amount);
  IF p_amount > v_cur_bal_due THEN
    RAISE EXCEPTION 'Payment amount exceeds invoice balance due (PAY-OVERPAYMENT)';
  END IF;

  IF NOT v_is_admin AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_po_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = v_po_id
        AND (
          private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')
          OR private.get_buyer_scope_role(po.organization_id, po.owner_profile_id) IN ('OWNER', 'MANAGER', 'APPROVER')
        )
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized to record payment for this invoice (PAY-UNAUTHORIZED)';
    END IF;
  END IF;

  INSERT INTO public.payments (
    invoice_id, purchase_order_id, amount, unallocated_amount, currency, method, status,
    reference, gateway_event_id, recorded_by, recorded_at
  ) VALUES (
    p_invoice_id, v_po_id, p_amount, 0.00, COALESCE(p_currency, 'INR'), p_method, 'RECORDED',
    p_reference, COALESCE(p_idempotency_key, p_reference), v_caller_profile_id, v_now
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (
    payment_id, invoice_id, allocated_amount, allocated_at, status, allocated_by, notes
  ) VALUES (
    v_payment_id, p_invoice_id, p_amount, v_now, 'ALLOCATED', v_caller_profile_id, p_notes
  ) RETURNING id INTO v_allocation_id;

  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_payment_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)
  VALUES ('PAYMENT_RECORDED_ATOMIC', 'PAYMENT', v_payment_id,
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount, 'allocation_id', v_allocation_id),
    v_caller_profile_id);

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'allocation_id', v_allocation_id,
    'invoice', jsonb_build_object('id', v_final_inv.id, 'balance_due', v_final_inv.balance_due, 'status', v_final_inv.status));
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text) TO authenticated, service_role;

COMMIT;

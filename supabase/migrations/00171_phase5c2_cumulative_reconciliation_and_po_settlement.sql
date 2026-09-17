-- =============================================================================
-- Migration 00171: Phase 5C.2 — Cumulative Financial Reconciliation & Settlement Controls
--
-- Description:
--   1. Harmonizes Legacy Over-invoicing Tolerance:
--      - Updates validate_invoice_allocation_integrity() to remove legacy five paise tolerance.
--      - Enforces exact zero-tolerance ceiling: sum(non-rejected invoices) <= PO.total_amount
--        and milestone invoice ceiling <= milestone.allocated_amount.
--   2. Authoritative PostgreSQL RPC: public.get_po_settlement_summary(p_po_id uuid)
--      - SECURITY DEFINER SET search_path = public, private, pg_temp
--      - Access control: Platform Admin, Buyer Org Member, or Assigned Supplier User.
--      - Computes complete exact-arithmetic PoSettlementSummary (poAuthorizedTotal,
--        cumulativeInvoicedAmount, cumulativePaidAmount, cumulativeAllocatedAmount,
--        invoicedOutstandingAmount, uninvoicedAuthorizationBalance, unallocatedAdvanceAmount,
--        contractualExposure, settlementAmount, settledAmount, remainingSettlementAmount,
--        isFullyReconciled, isFullySettled, counts, taxTotals).
--   3. Database PO Completion Guard:
--      - Trigger trg_validate_po_status_transition on public.purchase_orders
--      - Enforces that transitioning to 'COMPLETED' requires:
--        * At least one valid invoice exists.
--        * Zero non-rejected invoices in status <> 'PAID' or with balance_due > 0.
--        * Cumulative paid/allocated amount >= PO.total_amount.
--      - Raises exception PO-5C2-NOT-SETTLED if condition not met.
--   4. Atomic Advance Payment Allocation RPC: public.allocate_advance_payment_atomic(...)
--      - SECURITY DEFINER SET search_path = public, private, pg_temp
--      - Locks payment and invoice rows with SELECT FOR UPDATE.
--      - Validates buyer authorization, tenant alignment, amount > 0,
--        amount <= payment.unallocated_amount, amount <= invoice.balance_due,
--        and invoice status IN ('APPROVED', 'PARTIALLY_PAID').
--      - Inserts payment_allocations record, triggering state synchronization.
--      - Emits audit event ADVANCE_PAYMENT_ALLOCATED.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Harmonize Legacy Over-invoicing Tolerance (INV-5A-OVERINVOICE Zero Tolerance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_invoice_allocation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_po_id uuid;
  v_po_total numeric(14, 2);
  v_cumulative_invoiced numeric(14, 2);
  v_milestone_allocated numeric(14, 2);
  v_milestone_invoiced numeric(14, 2);
BEGIN
  -- Resolve purchase_order_id
  IF NEW.purchase_order_id IS NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = NEW.work_order_id;
    NEW.purchase_order_id := v_po_id;
  ELSE
    v_po_id := NEW.purchase_order_id;
  END IF;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Invoice must be associated with a valid Purchase Order (INV-5A-01)';
  END IF;

  -- Lock PO row to serialize concurrent progressive invoice submissions
  SELECT total_amount INTO v_po_total
  FROM public.purchase_orders
  WHERE id = v_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated Purchase Order not found (INV-5A-02)';
  END IF;

  -- Calculate cumulative non-rejected invoiced amount including current invoice
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_cumulative_invoiced
  FROM public.invoices
  WHERE purchase_order_id = v_po_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status <> 'REJECTED';

  -- Exact zero-tolerance ceiling: sum(invoices) <= PO.total_amount
  IF (v_cumulative_invoiced + NEW.amount) > v_po_total THEN
    RAISE EXCEPTION 'Over-invoicing violation: Cumulative invoice total (₹%) exceeds PO authorized amount (₹%) (INV-5A-OVERINVOICE)',
      (v_cumulative_invoiced + NEW.amount), v_po_total;
  END IF;

  -- If tied to a milestone, validate milestone cap with exact zero tolerance
  IF NEW.milestone_id IS NOT NULL THEN
    SELECT allocated_amount INTO v_milestone_allocated
    FROM public.work_order_milestones
    WHERE id = NEW.milestone_id
    FOR UPDATE;

    IF FOUND AND v_milestone_allocated > 0 THEN
      SELECT COALESCE(SUM(amount), 0.00)
      INTO v_milestone_invoiced
      FROM public.invoices
      WHERE milestone_id = NEW.milestone_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status <> 'REJECTED';

      IF (v_milestone_invoiced + NEW.amount) > v_milestone_allocated THEN
        RAISE EXCEPTION 'Milestone over-invoicing violation: Cumulative milestone invoiced (₹%) exceeds milestone allocated amount (₹%) (INV-5A-MILESTONE-OVERINVOICE)',
          (v_milestone_invoiced + NEW.amount), v_milestone_allocated;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_allocation_integrity ON public.invoices;
CREATE TRIGGER trg_validate_invoice_allocation_integrity
  BEFORE INSERT OR UPDATE OF amount, purchase_order_id, milestone_id, status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status <> 'REJECTED')
  EXECUTE FUNCTION public.validate_invoice_allocation_integrity();

-- ---------------------------------------------------------------------------
-- 2. Authoritative PostgreSQL RPC: public.get_po_settlement_summary(p_po_id uuid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_po_settlement_summary(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_po RECORD;
  v_is_admin boolean := private.is_platform_admin();
  v_cum_invoiced numeric(14, 2) := 0.00;
  v_cum_paid numeric(14, 2) := 0.00;
  v_invoiced_outstanding numeric(14, 2) := 0.00;
  v_uninvoiced_bal numeric(14, 2) := 0.00;
  v_unalloc_advance numeric(14, 2) := 0.00;
  v_contract_exposure numeric(14, 2) := 0.00;
  v_inv_count int := 0;
  v_paid_inv_count int := 0;
  v_partially_paid_inv_count int := 0;
  v_unpaid_inv_count int := 0;
  v_rejected_inv_count int := 0;
  v_payment_count int := 0;
  v_alloc_count int := 0;
  v_is_fully_reconciled boolean := true;
  v_is_fully_settled boolean := false;
  v_taxable_total numeric(14, 2) := 0.00;
  v_cgst_total numeric(14, 2) := 0.00;
  v_sgst_total numeric(14, 2) := 0.00;
  v_utgst_total numeric(14, 2) := 0.00;
  v_igst_total numeric(14, 2) := 0.00;
  v_inv RECORD;
  v_pay RECORD;
  v_inv_paid numeric(14, 2);
  v_inv_bal numeric(14, 2);
BEGIN
  -- 1. Fetch Purchase Order
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found (PO-5C2-NOT-FOUND)');
  END IF;

  -- 2. Authorization Check
  IF NOT v_is_admin THEN
    IF NOT (
      private.is_org_member(v_po.organization_id)
      OR private.is_supplier_user_for(v_po.supplier_id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized access to purchase order settlement (PO-5C2-UNAUTHORIZED)');
    END IF;
  END IF;

  -- 3. Invoices Aggregation & Analysis
  FOR v_inv IN
    SELECT id, amount, status, paid_amount, balance_due, taxable_amount, cgst_amount, sgst_amount, utgst_amount, igst_amount
    FROM public.invoices
    WHERE purchase_order_id = p_po_id
       OR (purchase_order_id IS NULL AND work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = p_po_id))
  LOOP
    IF v_inv.status = 'REJECTED' THEN
      v_rejected_inv_count := v_rejected_inv_count + 1;
    ELSE
      v_inv_count := v_inv_count + 1;
      v_cum_invoiced := v_cum_invoiced + v_inv.amount;

      -- Calculate active allocations for this invoice
      SELECT COALESCE(SUM(allocated_amount), 0.00)
      INTO v_inv_paid
      FROM public.payment_allocations
      WHERE invoice_id = v_inv.id AND status = 'ALLOCATED';

      v_inv_bal := GREATEST(0.00, v_inv.amount - v_inv_paid);
      v_invoiced_outstanding := v_invoiced_outstanding + v_inv_bal;

      IF v_inv_paid >= v_inv.amount AND v_inv.amount > 0 THEN
        v_paid_inv_count := v_paid_inv_count + 1;
      ELSIF v_inv_paid > 0.00 THEN
        v_partially_paid_inv_count := v_partially_paid_inv_count + 1;
      ELSE
        v_unpaid_inv_count := v_unpaid_inv_count + 1;
      END IF;

      IF v_inv_paid > v_inv.amount THEN
        v_is_fully_reconciled := false;
      END IF;
    END IF;
  END LOOP;

  -- 4. Allocations & Payments Aggregation
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00), COUNT(pa.id)
  INTO v_cum_paid, v_alloc_count
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = p_po_id OR i.work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = p_po_id))
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  -- Payments linked to PO
  FOR v_pay IN
    SELECT id, amount, unallocated_amount
    FROM public.payments
    WHERE purchase_order_id = p_po_id
  LOOP
    v_payment_count := v_payment_count + 1;
    v_unalloc_advance := v_unalloc_advance + COALESCE(v_pay.unallocated_amount, 0.00);
  END LOOP;

  -- 5. Derived Balances
  v_uninvoiced_bal := GREATEST(0.00, v_po.total_amount - v_cum_invoiced);
  v_contract_exposure := GREATEST(0.00, v_po.total_amount - v_cum_paid);

  -- Tax totals from PO or fallback
  v_taxable_total := COALESCE(v_po.taxable_total, 0.00);
  v_cgst_total := COALESCE(v_po.cgst_total, 0.00);
  v_sgst_total := COALESCE(v_po.sgst_total, 0.00);
  v_utgst_total := COALESCE(v_po.utgst_total, 0.00);
  v_igst_total := COALESCE(v_po.igst_total, 0.00);

  -- 6. Settlement Predicate
  v_is_fully_settled := (
    v_inv_count > 0
    AND v_cum_invoiced >= v_po.total_amount
    AND v_invoiced_outstanding = 0.00
    AND v_cum_paid >= v_po.total_amount
    AND v_paid_inv_count = v_inv_count
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purchaseOrderId', v_po.id,
    'poAuthorizedTotal', v_po.total_amount,
    'cumulativeInvoicedAmount', v_cum_invoiced,
    'cumulativePaidAmount', v_cum_paid,
    'cumulativeAllocatedAmount', v_cum_paid,
    'invoicedOutstandingAmount', v_invoiced_outstanding,
    'uninvoicedAuthorizationBalance', v_uninvoiced_bal,
    'unallocatedAdvanceAmount', v_unalloc_advance,
    'contractualExposure', v_contract_exposure,
    'settlementAmount', v_invoiced_outstanding,
    'settledAmount', v_cum_paid,
    'remainingSettlementAmount', v_invoiced_outstanding,
    'isFullyReconciled', v_is_fully_reconciled,
    'isFullySettled', v_is_fully_settled,
    'counts', jsonb_build_object(
      'invoiceCount', v_inv_count,
      'paidInvoiceCount', v_paid_inv_count,
      'partiallyPaidInvoiceCount', v_partially_paid_inv_count,
      'unpaidInvoiceCount', v_unpaid_inv_count,
      'rejectedInvoiceCount', v_rejected_inv_count,
      'paymentCount', v_payment_count,
      'allocationCount', v_alloc_count
    ),
    'taxTotals', jsonb_build_object(
      'taxableTotal', v_taxable_total,
      'cgstTotal', v_cgst_total,
      'sgstTotal', v_sgst_total,
      'utgstTotal', v_utgst_total,
      'igstTotal', v_igst_total
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_po_settlement_summary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Database PO Completion Guard: Trigger trg_validate_po_status_transition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_po_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_inv_count int := 0;
  v_unpaid_inv_count int := 0;
  v_cum_paid numeric(14, 2) := 0.00;
  v_invoiced_outstanding numeric(14, 2) := 0.00;
BEGIN
  -- Validate transition to COMPLETED
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status <> 'COMPLETED') THEN
    -- Count non-rejected invoices
    SELECT COUNT(*) INTO v_inv_count
    FROM public.invoices
    WHERE (purchase_order_id = NEW.id OR work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = NEW.id))
      AND status <> 'REJECTED';

    IF v_inv_count = 0 THEN
      RAISE EXCEPTION 'PO-5C2-NOT-SETTLED: Purchase order cannot be marked COMPLETED without any non-rejected invoices';
    END IF;

    -- Check for any unpaid / partially paid invoices
    SELECT
      COUNT(*) FILTER (WHERE status <> 'PAID' OR balance_due > 0.00),
      COALESCE(SUM(balance_due), 0.00)
    INTO v_unpaid_inv_count, v_invoiced_outstanding
    FROM public.invoices
    WHERE (purchase_order_id = NEW.id OR work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = NEW.id))
      AND status <> 'REJECTED';

    IF v_unpaid_inv_count > 0 OR v_invoiced_outstanding > 0.00 THEN
      RAISE EXCEPTION 'PO-5C2-NOT-SETTLED: Purchase order cannot be marked COMPLETED until all invoices are PAID and financial obligations are settled (outstanding: ₹%)',
        v_invoiced_outstanding;
    END IF;

    -- Check cumulative allocated payments satisfy PO total amount
    SELECT COALESCE(SUM(pa.allocated_amount), 0.00)
    INTO v_cum_paid
    FROM public.payment_allocations pa
    JOIN public.invoices i ON i.id = pa.invoice_id
    WHERE (i.purchase_order_id = NEW.id OR i.work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = NEW.id))
      AND i.status <> 'REJECTED'
      AND pa.status = 'ALLOCATED';

    IF v_cum_paid < NEW.total_amount THEN
      RAISE EXCEPTION 'PO-5C2-NOT-SETTLED: Purchase order cannot be marked COMPLETED until all invoices are PAID and financial obligations are settled (total paid: ₹%, required: ₹%)',
        v_cum_paid, NEW.total_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_po_status_transition ON public.purchase_orders;
CREATE TRIGGER trg_validate_po_status_transition
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_po_status_transition();

-- ---------------------------------------------------------------------------
-- 4. Atomic Advance Allocation RPC: public.allocate_advance_payment_atomic(...)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_advance_payment_atomic(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric(14, 2),
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
  v_pay RECORD;
  v_inv RECORD;
  v_po_id uuid;
  v_allocation_id uuid;
  v_existing_alloc_id uuid;
  v_now timestamptz := now();
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate Amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Allocation amount must be strictly greater than 0 (ADV-5C2-INVALID-AMOUNT)';
  END IF;

  -- 2. Lock Payment Row Pessimistically
  SELECT id, amount, unallocated_amount, purchase_order_id, invoice_id, status
  INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found (ADV-5C2-PAY-NOT-FOUND)', p_payment_id;
  END IF;

  -- 3. Lock Invoice Row Pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id, supplier_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found (ADV-5C2-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 4. Resolve and Match PO / Tenant alignment
  v_po_id := v_inv.purchase_order_id;
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_pay.purchase_order_id IS NOT NULL AND v_po_id IS NOT NULL THEN
    IF v_pay.purchase_order_id <> v_po_id THEN
      RAISE EXCEPTION 'Payment purchase order (%) does not match invoice purchase order (%) (ADV-5C2-PO-MISMATCH)',
        v_pay.purchase_order_id, v_po_id;
    END IF;
  END IF;

  -- 5. Authorization Check: Platform Admin or Buyer Owner/Manager for PO
  IF NOT v_is_admin THEN
    IF v_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = v_po_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can allocate advance payments (ADV-5C2-UNAUTHORIZED)';
      END IF;
    END IF;
  END IF;

  -- 6. Validate Invoice State Eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is in status %, but must be APPROVED or PARTIALLY_PAID to receive advance allocation (ADV-5C2-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- 7. Validate Caps: Payment Unallocated Amount & Invoice Balance Due
  IF p_amount > v_pay.unallocated_amount THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds available payment unallocated balance (₹%) (ADV-5C2-PAY-OVERALLOC)',
      p_amount, v_pay.unallocated_amount;
  END IF;

  IF p_amount > v_inv.balance_due THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds invoice balance due (₹%) (ADV-5C2-INV-OVERALLOC)',
      p_amount, v_inv.balance_due;
  END IF;

  -- 8. Insert Payment Allocation Record (Triggers validate integrity and sync balances)
  INSERT INTO public.payment_allocations (
    payment_id,
    invoice_id,
    allocated_amount,
    allocated_at,
    status,
    notes
  ) VALUES (
    p_payment_id,
    p_invoice_id,
    p_amount,
    v_now,
    'ALLOCATED',
    COALESCE(p_notes, 'Advance payment balance allocation')
  ) RETURNING id INTO v_allocation_id;

  -- 9. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = p_payment_id;

  -- 10. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ADVANCE_PAYMENT_ALLOCATED',
    'PAYMENT_ALLOCATION',
    v_allocation_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'allocated_amount', p_amount,
      'notes', p_notes,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', v_allocation_id,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'allocated_amount', p_amount,
    'payment', jsonb_build_object(
      'id', v_final_pay.id,
      'amount', v_final_pay.amount,
      'unallocated_amount', v_final_pay.unallocated_amount,
      'status', v_final_pay.status
    ),
    'invoice', jsonb_build_object(
      'id', v_final_inv.id,
      'amount', v_final_inv.amount,
      'paid_amount', v_final_inv.paid_amount,
      'balance_due', v_final_inv.balance_due,
      'status', v_final_inv.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_advance_payment_atomic TO authenticated, service_role;

COMMIT;

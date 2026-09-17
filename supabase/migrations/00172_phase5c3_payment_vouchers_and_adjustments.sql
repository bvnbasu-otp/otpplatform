-- =============================================================================
-- Migration 00172: Phase 5C.3 — Financial Adjustments, Payment Reversals & Vendor Settlement
--
-- Description:
--   1. Table public.credit_debit_notes:
--      - Tracks formal statutory debit notes and credit notes against invoices.
--      - Full multi-tenant isolation, unique note_number per org, status lifecycle.
--      - RLS policies protecting buyer and supplier visibility.
--   2. Atomic Credit/Debit Note RPC: public.issue_credit_debit_note_atomic(...)
--      - SECURITY DEFINER SET search_path = public, private, pg_temp
--      - Locks target invoice row pessimistically.
--      - Validates caller authority (Buyer OWNER/MANAGER or Platform Admin).
--      - Enforces debit note cap (cannot exceed invoice total / remaining balance).
--      - Emits audit event CREDIT_DEBIT_NOTE_ISSUED.
--   3. Atomic Payment Allocation Reversal RPC: public.reverse_payment_allocation_atomic(...)
--      - SECURITY DEFINER SET search_path = public, private, pg_temp
--      - Locks allocation, payment, and invoice rows with SELECT FOR UPDATE.
--      - Closed PO Guard: Rejects reversals on COMPLETED purchase orders (REV-5C3-PO-CLOSED).
--      - Reversal guard: Rejects already reversed/voided allocations (REV-5C3-ALREADY-REVERSED).
--      - Restores payment unallocated_amount and decrements invoice paid_amount atomically.
--      - Recomputes invoice status (APPROVED / PARTIALLY_PAID).
--      - Emits audit event PAYMENT_ALLOCATION_REVERSED.
--   4. Multi-PO Vendor Settlement Statement RPC: public.get_vendor_settlement_statement(...)
--      - SECURITY DEFINER SET search_path = public, private, pg_temp
--      - Multi-tenant access check.
--      - Aggregates multi-PO commitments, invoices (excluding REJECTED), payments, allocations,
--        unallocated advances, and active credit/debit notes into canonical settlement ledger.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper Functions: Organization and Supplier Membership Sets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.profile_id = private.get_profile_id();
$$;

CREATE OR REPLACE FUNCTION private.get_user_supplier_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.supplier_id
  FROM supplier_users su
  WHERE su.profile_id = private.get_profile_id();
$$;

GRANT EXECUTE ON FUNCTION private.get_user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_supplier_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Create public.credit_debit_notes Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_debit_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id        uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  note_number       text NOT NULL,
  note_type         text NOT NULL CHECK (note_type IN ('DEBIT_NOTE', 'CREDIT_NOTE')),
  amount            numeric(14, 2) NOT NULL CHECK (amount > 0),
  tax_amount        numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('DRAFT', 'ISSUED', 'APPLIED', 'CANCELLED')),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_debit_notes_org_number UNIQUE (organization_id, note_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_invoice ON public.credit_debit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_po ON public.credit_debit_notes(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_org ON public.credit_debit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_status ON public.credit_debit_notes(status);

DROP TRIGGER IF EXISTS credit_debit_notes_updated_at ON public.credit_debit_notes;
CREATE TRIGGER credit_debit_notes_updated_at
  BEFORE UPDATE ON public.credit_debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Row Level Security
ALTER TABLE public.credit_debit_notes ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS credit_debit_notes_select ON public.credit_debit_notes;
CREATE POLICY credit_debit_notes_select ON public.credit_debit_notes
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
    OR EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = credit_debit_notes.purchase_order_id
        AND po.supplier_id IN (SELECT private.get_user_supplier_ids())
    )
    OR EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = credit_debit_notes.invoice_id
        AND inv.supplier_id IN (SELECT private.get_user_supplier_ids())
    )
  );

-- INSERT / UPDATE Policy
DROP POLICY IF EXISTS credit_debit_notes_mutate ON public.credit_debit_notes;
CREATE POLICY credit_debit_notes_mutate ON public.credit_debit_notes
  FOR ALL
  USING (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  );

-- ---------------------------------------------------------------------------
-- 2. Atomic Credit / Debit Note Issuance RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_credit_debit_note_atomic(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_note_type text,
  p_amount numeric(14, 2),
  p_tax_amount numeric(14, 2) DEFAULT 0.00,
  p_reason text DEFAULT '',
  p_note_number text DEFAULT NULL,
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
  v_caller_role text;
  v_invoice RECORD;
  v_po_id uuid;
  v_existing_debits numeric(14, 2);
  v_prefix text;
  v_note_number text;
  v_note RECORD;
BEGIN
  -- 1. Validate Input Parameters
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Note amount must be strictly greater than 0 (CDN-5C3-INVALID-AMOUNT)';
  END IF;

  IF p_note_type NOT IN ('DEBIT_NOTE', 'CREDIT_NOTE') THEN
    RAISE EXCEPTION 'Note type must be DEBIT_NOTE or CREDIT_NOTE (CDN-5C3-INVALID-TYPE)';
  END IF;

  IF p_tax_amount IS NULL OR p_tax_amount < 0.00 THEN
    RAISE EXCEPTION 'Tax amount must be non-negative (CDN-5C3-INVALID-TAX)';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required when issuing a credit or debit note (CDN-5C3-INVALID-REASON)';
  END IF;

  -- 2. Validate Authorization
  v_caller_role := private.get_org_role(p_organization_id);
  IF NOT v_is_admin AND (v_caller_role IS NULL OR v_caller_role NOT IN ('OWNER', 'MANAGER')) THEN
    RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can issue credit/debit notes (CDN-5C3-UNAUTHORIZED)';
  END IF;

  -- 3. Lock Target Invoice Pessimistically
  SELECT id, purchase_order_id, work_order_id, amount, paid_amount, balance_due, status, supplier_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Invoice % not found (CDN-5C3-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  IF v_invoice.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Cannot issue credit or debit note against a REJECTED invoice (CDN-5C3-INVOICE-REJECTED)';
  END IF;

  -- Resolve PO id
  v_po_id := v_invoice.purchase_order_id;
  IF v_po_id IS NULL AND v_invoice.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_invoice.work_order_id;
  END IF;

  -- 4. Validate Debit Note Balance Cap (5C3-RED-04)
  IF p_note_type = 'DEBIT_NOTE' THEN
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_existing_debits
    FROM public.credit_debit_notes
    WHERE invoice_id = p_invoice_id
      AND note_type = 'DEBIT_NOTE'
      AND status IN ('ISSUED', 'APPLIED');

    IF (v_existing_debits + p_amount) > v_invoice.amount THEN
      RAISE EXCEPTION 'Debit note amount (₹%) exceeds permitted invoice ceiling of ₹% (CDN-5C3-EXCEEDS-BALANCE)',
        (v_existing_debits + p_amount), v_invoice.amount;
    END IF;
  END IF;

  -- 5. Format Note Number
  v_prefix := CASE WHEN p_note_type = 'DEBIT_NOTE' THEN 'DN' ELSE 'CN' END;
  v_note_number := COALESCE(
    p_note_number,
    v_prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))
  );

  -- 6. Insert Credit / Debit Note
  INSERT INTO public.credit_debit_notes (
    organization_id,
    purchase_order_id,
    invoice_id,
    note_number,
    note_type,
    amount,
    tax_amount,
    reason,
    status,
    created_by
  ) VALUES (
    p_organization_id,
    v_po_id,
    p_invoice_id,
    v_note_number,
    p_note_type,
    p_amount,
    p_tax_amount,
    p_reason,
    'ISSUED',
    v_caller_profile_id
  ) RETURNING * INTO v_note;

  -- 7. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'CREDIT_DEBIT_NOTE_ISSUED',
    'CREDIT_DEBIT_NOTE',
    v_note.id,
    jsonb_build_object(
      'note_number', v_note_number,
      'note_type', p_note_type,
      'amount', p_amount,
      'tax_amount', p_tax_amount,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'reason', p_reason,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'note', row_to_json(v_note)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Atomic Payment Allocation Reversal RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payment_allocation_atomic(
  p_allocation_id uuid,
  p_reason text,
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
  v_alloc RECORD;
  v_pay RECORD;
  v_inv RECORD;
  v_po RECORD;
  v_po_id uuid;
  v_org_id uuid;
  v_new_paid numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_new_status public.invoice_status;
  v_final_inv RECORD;
  v_final_pay RECORD;
  v_final_alloc RECORD;
BEGIN
  -- 1. Validate Input Parameters
  IF p_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Allocation ID is required (REV-5C3-INVALID-ID)';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversal reason is required (REV-5C3-INVALID-REASON)';
  END IF;

  -- 2. Lock Allocation Row Pessimistically
  SELECT * INTO v_alloc
  FROM public.payment_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment allocation % not found (REV-5C3-NOT-FOUND)', p_allocation_id;
  END IF;

  -- 5C3-RED-01: Check if already reversed or voided
  IF v_alloc.status IN ('REVERSED', 'VOIDED') THEN
    RAISE EXCEPTION 'Payment allocation % is already % (REV-5C3-ALREADY-REVERSED)',
      p_allocation_id, v_alloc.status;
  END IF;

  -- 3. Lock Payment Row Pessimistically
  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = v_alloc.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated payment % not found (REV-5C3-PAY-NOT-FOUND)', v_alloc.payment_id;
  END IF;

  -- 4. Lock Invoice Row Pessimistically
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = v_alloc.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated invoice % not found (REV-5C3-INV-NOT-FOUND)', v_alloc.invoice_id;
  END IF;

  -- 5. Resolve PO
  v_po_id := COALESCE(v_inv.purchase_order_id, v_pay.purchase_order_id);
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
    IF FOUND THEN
      v_org_id := v_po.organization_id;
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    SELECT po.organization_id INTO v_org_id
    FROM public.invoices inv
    JOIN public.work_orders wo ON inv.work_order_id = wo.id
    JOIN public.purchase_orders po ON wo.purchase_order_id = po.id
    WHERE inv.id = v_alloc.invoice_id;
  END IF;

  -- 5C3-RED-03: Authorization check (Buyer OWNER/MANAGER or Platform Admin)
  IF NOT v_is_admin THEN
    IF v_org_id IS NULL OR private.get_org_role(v_org_id) NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can reverse payment allocations (REV-5C3-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 5C3-RED-02: Closed PO Guard (Cannot reverse on COMPLETED PO)
  IF v_po.id IS NOT NULL AND v_po.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot reverse payment allocation on a COMPLETED purchase order (REV-5C3-PO-CLOSED)';
  END IF;

  -- 5C3-RED-08 & 5C3-RED-09: Balance conservation invariant checks
  IF v_inv.paid_amount < v_alloc.allocated_amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: allocation ₹% exceeds invoice paid balance ₹% (REV-5C3-INVALID-INVOICE-PAID)',
      v_alloc.allocated_amount, v_inv.paid_amount;
  END IF;

  IF (v_pay.unallocated_amount + v_alloc.allocated_amount) > v_pay.amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: resulting unallocated amount (₹%) exceeds payment total (₹%) (REV-5C3-INVALID-PAYMENT-UNALLOC)',
      (v_pay.unallocated_amount + v_alloc.allocated_amount), v_pay.amount;
  END IF;

  -- 6. Execute Reversal Updates
  -- Update Allocation
  UPDATE public.payment_allocations
  SET status = 'REVERSED',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[REVERSED: ' || p_reason || ']'
        ELSE notes || ' [REVERSED: ' || p_reason || ']'
      END,
      updated_at = now()
  WHERE id = p_allocation_id;

  -- Update Payment unallocated_amount
  UPDATE public.payments
  SET unallocated_amount = LEAST(v_pay.amount, unallocated_amount + v_alloc.allocated_amount),
      updated_at = now()
  WHERE id = v_alloc.payment_id;

  -- Update Invoice paid_amount, balance_due, and status
  v_new_paid := GREATEST(0.00, v_inv.paid_amount - v_alloc.allocated_amount);
  v_new_bal := GREATEST(0.00, v_inv.amount - v_new_paid);
  v_new_status := CASE
    WHEN v_new_paid = 0.00 THEN 'APPROVED'::public.invoice_status
    ELSE 'PARTIALLY_PAID'::public.invoice_status
  END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      balance_due = v_new_bal,
      status = v_new_status,
      updated_at = now()
  WHERE id = v_alloc.invoice_id;

  -- 7. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PAYMENT_ALLOCATION_REVERSED',
    'PAYMENT_ALLOCATION',
    p_allocation_id,
    jsonb_build_object(
      'payment_id', v_alloc.payment_id,
      'invoice_id', v_alloc.invoice_id,
      'purchase_order_id', v_po_id,
      'reversed_amount', v_alloc.allocated_amount,
      'reason', p_reason,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  -- 8. Fetch Final Synchronized State
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_alloc.invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_alloc.payment_id;
  SELECT * INTO v_final_alloc FROM public.payment_allocations WHERE id = p_allocation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', p_allocation_id,
    'allocation', row_to_json(v_final_alloc),
    'payment', row_to_json(v_final_pay),
    'invoice', row_to_json(v_final_inv)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Multi-PO Cumulative Vendor Settlement Statement RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vendor_settlement_statement(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_is_buyer boolean;
  v_is_supplier boolean;
  v_total_po_authorized numeric(14, 2) := 0.00;
  v_total_invoiced numeric(14, 2) := 0.00;
  v_total_paid numeric(14, 2) := 0.00;
  v_total_outstanding numeric(14, 2) := 0.00;
  v_total_unallocated_adv numeric(14, 2) := 0.00;
  v_total_debit_notes numeric(14, 2) := 0.00;
  v_total_credit_notes numeric(14, 2) := 0.00;
  v_net_payable numeric(14, 2) := 0.00;
  v_po_summaries jsonb := '[]'::jsonb;
  v_notes_json jsonb := '[]'::jsonb;
  v_po RECORD;
  v_summary_res jsonb;
BEGIN
  -- 1. Multi-Tenant Access Control
  IF NOT v_is_admin THEN
    v_is_buyer := (private.get_org_role(p_organization_id) IS NOT NULL);
    v_is_supplier := (p_supplier_id IN (SELECT private.get_user_supplier_ids()));

    IF NOT v_is_buyer AND NOT v_is_supplier THEN
      RAISE EXCEPTION 'Unauthorized: Caller cannot access vendor settlement statements for org % and supplier % (VSS-5C3-UNAUTHORIZED)',
        p_organization_id, p_supplier_id;
    END IF;
  END IF;

  -- 2. Aggregate Purchase Orders for this Org & Supplier
  FOR v_po IN
    SELECT po.id, po.po_number, po.total_amount
    FROM public.purchase_orders po
    WHERE po.organization_id = p_organization_id
      AND po.supplier_id = p_supplier_id
      AND (p_from_date IS NULL OR po.created_at >= p_from_date)
      AND (p_to_date IS NULL OR po.created_at <= p_to_date)
    ORDER BY po.created_at ASC
  LOOP
    v_total_po_authorized := v_total_po_authorized + v_po.total_amount;
    
    -- Fetch individual PO settlement summary via existing RPC
    SELECT public.get_po_settlement_summary(v_po.id) INTO v_summary_res;
    IF v_summary_res IS NOT NULL THEN
      v_po_summaries := v_po_summaries || jsonb_build_array(v_summary_res);
    END IF;
  END LOOP;

  -- 3. Calculate Cumulative Non-Rejected Invoiced Total (5C3-RED-10)
  SELECT COALESCE(SUM(inv.amount), 0.00)
  INTO v_total_invoiced
  FROM public.invoices inv
  JOIN public.purchase_orders po ON (inv.purchase_order_id = po.id OR inv.work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = po.id))
  WHERE po.organization_id = p_organization_id
    AND po.supplier_id = p_supplier_id
    AND inv.status <> 'REJECTED'
    AND (p_from_date IS NULL OR inv.created_at >= p_from_date)
    AND (p_to_date IS NULL OR inv.created_at <= p_to_date);

  -- 4. Calculate Cumulative Paid / Allocated Total
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00)
  INTO v_total_paid
  FROM public.payment_allocations pa
  JOIN public.invoices inv ON pa.invoice_id = inv.id
  JOIN public.purchase_orders po ON (inv.purchase_order_id = po.id OR inv.work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = po.id))
  WHERE po.organization_id = p_organization_id
    AND po.supplier_id = p_supplier_id
    AND inv.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED'
    AND (p_from_date IS NULL OR pa.allocated_at >= p_from_date)
    AND (p_to_date IS NULL OR pa.allocated_at <= p_to_date);

  v_total_outstanding := GREATEST(0.00, v_total_invoiced - v_total_paid);

  -- 5. Calculate Total Unallocated Advances Across Payments
  SELECT COALESCE(SUM(pay.unallocated_amount), 0.00)
  INTO v_total_unallocated_adv
  FROM public.payments pay
  JOIN public.purchase_orders po ON pay.purchase_order_id = po.id
  WHERE po.organization_id = p_organization_id
    AND po.supplier_id = p_supplier_id
    AND (p_from_date IS NULL OR pay.recorded_at >= p_from_date)
    AND (p_to_date IS NULL OR pay.recorded_at <= p_to_date);

  -- 6. Aggregate Active Credit / Debit Notes
  SELECT
    COALESCE(SUM(CASE WHEN note_type = 'DEBIT_NOTE' THEN amount ELSE 0.00 END), 0.00),
    COALESCE(SUM(CASE WHEN note_type = 'CREDIT_NOTE' THEN amount ELSE 0.00 END), 0.00)
  INTO v_total_debit_notes, v_total_credit_notes
  FROM public.credit_debit_notes cdn
  WHERE cdn.organization_id = p_organization_id
    AND cdn.status IN ('ISSUED', 'APPLIED')
    AND (p_from_date IS NULL OR cdn.created_at >= p_from_date)
    AND (p_to_date IS NULL OR cdn.created_at <= p_to_date);

  -- Itemize Credit / Debit Notes JSON
  SELECT COALESCE(jsonb_agg(row_to_json(cdn)), '[]'::jsonb)
  INTO v_notes_json
  FROM (
    SELECT *
    FROM public.credit_debit_notes
    WHERE organization_id = p_organization_id
      AND (p_from_date IS NULL OR created_at >= p_from_date)
      AND (p_to_date IS NULL OR created_at <= p_to_date)
    ORDER BY created_at DESC
  ) cdn;

  -- 7. Net Payable Calculation
  v_net_payable := GREATEST(
    0.00,
    v_total_outstanding - v_total_debit_notes + v_total_credit_notes - v_total_unallocated_adv
  );

  RETURN jsonb_build_object(
    'buyerOrganizationId', p_organization_id,
    'supplierId', p_supplier_id,
    'periodStart', p_from_date,
    'periodEnd', p_to_date,
    'poSummaries', v_po_summaries,
    'creditDebitNotes', v_notes_json,
    'totalPoAuthorized', v_total_po_authorized,
    'totalInvoiced', v_total_invoiced,
    'totalPaid', v_total_paid,
    'totalOutstanding', v_total_outstanding,
    'totalUnallocatedAdvance', v_total_unallocated_adv,
    'totalDebitNotes', v_total_debit_notes,
    'totalCreditNotes', v_total_credit_notes,
    'netPayable', v_net_payable,
    'generatedAt', now()
  );
END;
$$;

COMMIT;

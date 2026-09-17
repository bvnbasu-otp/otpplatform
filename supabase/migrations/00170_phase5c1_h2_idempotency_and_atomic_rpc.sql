-- =============================================================================
-- Migration 00170: Phase 5C.1-H2 — Database Idempotency Guarantee & Fail-Closed Atomic Payment RPC
--
-- Description:
--   1. Ensures strict unique constraint on public.payments (gateway_event_id) WHERE gateway_event_id IS NOT NULL.
--   2. Updates record_invoice_payment_atomic RPC:
--      - Explicitly includes ON CONFLICT (gateway_event_id) WHERE gateway_event_id IS NOT NULL DO NOTHING
--        or deterministic lookup to handle concurrent duplicate idempotency keys.
--      - If duplicate detected concurrently during insertion, cleanly returns the existing payment and allocation.
--      - Enforces SECURITY DEFINER SET search_path = public, private, pg_temp.
--      - Validates caller authorization (Platform Admin or Buyer Owner/Manager).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Database Idempotency Guarantee: Unique Partial Index on gateway_event_id
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_event_id_unique
  ON public.payments (gateway_event_id)
  WHERE gateway_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Enhanced Atomic RPC with Fail-Closed Idempotency & Safe Concurrent Handling
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
  v_existing_alloc_id uuid;
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate payment amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Payment amount must be strictly greater than 0 (PAY-5C-INVALID-AMOUNT)';
  END IF;

  -- 2. Check Idempotency (Pre-check if key provided)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id
    FROM public.payments
    WHERE gateway_event_id = p_idempotency_key
    LIMIT 1;

    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id INTO v_existing_alloc_id
      FROM public.payment_allocations
      WHERE payment_id = v_existing_payment_id AND invoice_id = p_invoice_id AND status = 'ALLOCATED'
      LIMIT 1;

      SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'payment_id', v_existing_payment_id,
        'allocation_id', v_existing_alloc_id,
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
    END IF;
  END IF;

  -- 3. Lock target invoice row pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Invoice % not found (PAY-5C-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 4. Validate Invoice eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % status is %, but must be APPROVED or PARTIALLY_PAID before payment (PAY-5C-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- Resolve purchase order id
  IF v_po_id IS NULL THEN
    IF v_inv.purchase_order_id IS NOT NULL THEN
      v_po_id := v_inv.purchase_order_id;
    ELSIF v_inv.work_order_id IS NOT NULL THEN
      SELECT purchase_order_id INTO v_po_id
      FROM public.work_orders
      WHERE id = v_inv.work_order_id;
    END IF;
  END IF;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Associated Purchase Order could not be resolved for invoice % (PAY-5C-NO-PO)', p_invoice_id;
  END IF;

  -- 5. Authorization check: Platform Admin or Buyer Owner/Manager for PO
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = v_po_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can record invoice payments (PAY-5C-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 6. Validate exact balance due ceiling
  v_cur_bal_due := COALESCE(v_inv.balance_due, v_inv.amount - COALESCE(v_inv.paid_amount, 0.00));
  IF p_amount > v_cur_bal_due THEN
    RAISE EXCEPTION 'Payment amount (₹%) exceeds invoice balance due (₹%) (PAY-5C-INVOICE-OVERALLOC)',
      p_amount, v_cur_bal_due;
  END IF;

  -- 7. Insert Payment record (handling concurrent idempotency conflict)
  BEGIN
    INSERT INTO public.payments (
      invoice_id,
      purchase_order_id,
      amount,
      unallocated_amount,
      currency,
      method,
      status,
      reference,
      gateway_event_id,
      recorded_by,
      recorded_at
    ) VALUES (
      p_invoice_id,
      v_po_id,
      p_amount,
      0.00,
      COALESCE(p_currency, 'INR'),
      p_method,
      'RECORDED',
      p_reference,
      p_idempotency_key,
      v_caller_profile_id,
      v_now
    ) RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_payment_id
        FROM public.payments
        WHERE gateway_event_id = p_idempotency_key
        LIMIT 1;

        IF v_existing_payment_id IS NOT NULL THEN
          SELECT id INTO v_existing_alloc_id
          FROM public.payment_allocations
          WHERE payment_id = v_existing_payment_id AND invoice_id = p_invoice_id AND status = 'ALLOCATED'
          LIMIT 1;

          SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
          SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;

          RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'payment_id', v_existing_payment_id,
            'allocation_id', v_existing_alloc_id,
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
        END IF;
      END IF;
      RAISE;
  END;

  -- 8. Insert Payment Allocation record (Triggers validate integrity and synchronize invoice/payment state)
  INSERT INTO public.payment_allocations (
    payment_id,
    invoice_id,
    allocated_amount,
    allocated_at,
    status,
    notes
  ) VALUES (
    v_payment_id,
    p_invoice_id,
    p_amount,
    v_now,
    'ALLOCATED',
    COALESCE(p_notes, 'Atomic invoice payment remittance')
  ) RETURNING id INTO v_allocation_id;

  -- 9. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_payment_id;

  -- 10. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PAYMENT_RECORDED_ATOMIC',
    'PAYMENT',
    v_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'amount', p_amount,
      'allocation_id', v_allocation_id,
      'method', p_method,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'payment_id', v_payment_id,
    'allocation_id', v_allocation_id,
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

GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic TO authenticated, service_role;

COMMIT;

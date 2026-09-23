-- =============================================================================
-- Migration 00193: Fix accept_delivery_inspection PO Completion Lifecycle Guard
--
-- Prevents premature PO status transition to COMPLETED during delivery inspection
-- sign-off when invoice settlement has not yet completed (which triggers the
-- Phase 5C.2 database guard trg_validate_po_status_transition PO-5C2-NOT-SETTLED).
--
-- Work Order is marked COMPLETED with rating and inspection notes recorded.
-- Purchase Order status is only transitioned to COMPLETED if all Phase 5C.2
-- financial obligations (invoices PAID, balance_due = 0, cumulative paid >= total)
-- are fully settled. Otherwise, PO remains in active execution state to allow
-- invoice submission and settlement to proceed normally.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_delivery_inspection(
  p_work_order_id uuid,
  p_notes text DEFAULT NULL,
  p_rating numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $BODY$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_avg_rating numeric;
  v_completed_count integer;
  v_inv_count integer := 0;
  v_unpaid_count integer := 0;
  v_cum_paid numeric(14, 2) := 0.00;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_wo.purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_po.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only buyer managers can accept delivery';
  END IF;

  IF v_wo.status <> 'COMPLETED' AND v_wo.progress_percent < 100 THEN
    RAISE EXCEPTION 'Work order must be completed before inspection';
  END IF;

  -- 1. Update Work Order with star rating & review
  UPDATE work_orders
  SET buyer_accepted_at = COALESCE(buyer_accepted_at, now()),
      inspection_notes = COALESCE(p_notes, inspection_notes),
      review_text = COALESCE(p_notes, review_text),
      rating = COALESCE(p_rating, rating),
      status = 'COMPLETED',
      progress_percent = 100,
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_work_order_id;

  -- 2. Recalculate Supplier's Average Rating & Completed Jobs
  IF p_rating IS NOT NULL THEN
    SELECT COALESCE(AVG(rating), p_rating), COUNT(*)
    INTO v_avg_rating, v_completed_count
    FROM work_orders
    WHERE supplier_id = v_wo.supplier_id AND rating IS NOT NULL;

    UPDATE suppliers
    SET rating_avg = ROUND(v_avg_rating, 2),
        completed_jobs = GREATEST(COALESCE(completed_jobs, 0), v_completed_count),
        updated_at = now()
    WHERE id = v_wo.supplier_id;
  END IF;

  -- 3. Check Phase 5C.2 financial settlement status
  -- Count valid non-rejected invoices
  SELECT COUNT(*) INTO v_inv_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED';

  -- Count any unpaid or partial invoices
  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED'
    AND (status <> 'PAID' OR balance_due > 0.00);

  -- Cumulative allocated payments
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00) INTO v_cum_paid
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = v_po.id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  -- Only transition PO to COMPLETED if financial settlement criteria are fully satisfied
  IF v_inv_count > 0 AND v_unpaid_count = 0 AND v_cum_paid >= v_po.total_amount THEN
    UPDATE purchase_orders
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_po.id;

    SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
    IF FOUND THEN
      UPDATE requirements
      SET status = 'COMPLETED',
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  ELSE
    -- Keep PO in active/in-progress state; do not trigger premature PO-5C2-NOT-SETTLED guard
    UPDATE purchase_orders
    SET updated_at = now()
    WHERE id = v_po.id;
  END IF;
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) TO authenticated;

COMMIT;

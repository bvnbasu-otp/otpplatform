-- Migration 00057: Auto complete Purchase Order, Requirement, and save Supplier Star Rating & Review on Delivery Inspection

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS rating numeric(2,1);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS review_text text;

CREATE OR REPLACE FUNCTION public.accept_delivery_inspection(
  p_work_order_id uuid,
  p_notes text DEFAULT NULL,
  p_rating numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_avg_rating numeric;
  v_completed_count integer;
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

  -- 3. Update Purchase Order
  UPDATE purchase_orders
  SET status = 'COMPLETED',
      updated_at = now()
  WHERE id = v_po.id;

  -- 4. Update RFQ & Requirement
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
  IF FOUND THEN
    UPDATE requirements
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_rfq.requirement_id;
  END IF;
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) TO authenticated;

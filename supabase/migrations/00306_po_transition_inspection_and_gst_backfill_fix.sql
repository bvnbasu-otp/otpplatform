-- 00306: Allow accept_delivery_inspection to complete PO under direct-write guard;
-- correct GST treatment rows that were inferred only from missing GSTIN (00305 first apply).

BEGIN;

UPDATE public.suppliers s
SET supply_gst_treatment = 'REVIEW_REQUIRED'::public.supply_gst_treatment
WHERE s.supply_gst_treatment = 'UNREGISTERED'::public.supply_gst_treatment
  AND COALESCE(btrim(s.gstin), '') = ''
  AND COALESCE(s.gst_verified, false) IS NOT TRUE;

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
  RETURN ARRAY[25, 50, 75, 100];
END;
$$;

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

  IF NOT private.is_buyer_scope_member(v_po.organization_id, v_po.owner_profile_id)
     AND NOT private.is_org_member(v_po.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only authorized buyer organization members can accept delivery';
  END IF;

  IF v_wo.status <> 'COMPLETED' AND COALESCE(v_wo.progress_percent, 0) < 100 THEN
    RAISE EXCEPTION 'Delivery can be inspected only after the supplier records 100%% completion (WO-INSPECTION-BEFORE-100)';
  END IF;

  PERFORM set_config('otp.wo_inspection_signoff', 'on', true);

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

  PERFORM set_config('otp.wo_inspection_signoff', '', true);

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

  SELECT COUNT(*) INTO v_inv_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED';

  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED'
    AND (status <> 'PAID' OR balance_due > 0.00);

  SELECT COALESCE(SUM(pa.allocated_amount), 0.00) INTO v_cum_paid
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = v_po.id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  IF v_inv_count > 0 AND v_unpaid_count = 0 AND v_cum_paid >= v_po.total_amount THEN
    PERFORM set_config('otp.po_transition_internal', '1', true);
    UPDATE purchase_orders
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_po.id;
    PERFORM set_config('otp.po_transition_internal', '', true);

    SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
    IF FOUND THEN
      UPDATE requirements
      SET status = 'COMPLETED',
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  ELSE
    UPDATE purchase_orders
    SET updated_at = now()
    WHERE id = v_po.id;
  END IF;
END;
$BODY$;

REVOKE ALL ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) TO authenticated, service_role;

COMMIT;

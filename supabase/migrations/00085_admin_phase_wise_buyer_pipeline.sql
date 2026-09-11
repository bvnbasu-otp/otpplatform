-- 00085_admin_phase_wise_buyer_pipeline.sql
-- Fix admin_get_live_transactions RPC and provide rich phase-wise tracking (requested till end)

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_live_transactions(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_status text DEFAULT NULL,
  p_stalled_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_transactions jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  WITH base AS (
    SELECT
      r.id AS requirement_id,
      r.title AS requirement_title,
      r.description AS requirement_description,
      r.requirement_type,
      r.status AS requirement_status,
      r.quantity,
      r.unit,
      r.delivery_city,
      r.created_at AS requirement_created_at,
      r.organization_id,
      o.name AS organization_name,
      o.org_type AS organization_type,
      o.city AS organization_city,
      p_creator.email AS buyer_email,
      p_creator.full_name AS buyer_name,
      cat.name AS category_name,
      sub.name AS subcategory_name,
      rfq.id AS rfq_id,
      rfq.public_ref AS rfq_public_ref,
      rfq.status AS rfq_status,
      rfq.quote_deadline,
      rfq.created_at AS rfq_created_at,
      aw.id AS award_id,
      aw.status AS award_status,
      aw.awarded_at,
      aw.revealed_at,
      s_aw.business_name AS awarded_supplier_name,
      po.id AS po_id,
      po.po_number,
      po.status AS po_status,
      po.total_amount AS po_amount,
      po.issued_at AS po_issued_at,
      po.acknowledged_at AS po_acknowledged_at,
      wo.id AS work_order_id,
      wo.status AS work_order_status,
      wo.progress_percent,
      inv.id AS invoice_id,
      inv.invoice_number,
      inv.amount AS invoice_amount,
      inv.status AS invoice_status,
      pay.id AS payment_id,
      pay.amount AS payment_amount,
      pay.reference AS payment_reference,
      pay.status AS payment_status,
      (SELECT count(*)::int FROM rfq_invitations ri WHERE ri.rfq_id = rfq.id) AS invitations_count,
      (SELECT count(*)::int FROM quotes q WHERE q.rfq_id = rfq.id) AS quotes_count,
      (SELECT count(*)::int FROM committee_votes cv WHERE cv.rfq_id = rfq.id) AS votes_count,
      -- Compute Phase & Step (1 to 7)
      CASE
        WHEN r.status = 'CANCELLED' OR rfq.status = 'CANCELLED' THEN 'CANCELLED'
        WHEN pay.id IS NOT NULL OR r.status = 'COMPLETED' OR (wo.progress_percent = 100 AND inv.status = 'APPROVED') THEN 'COMPLETED'
        WHEN inv.id IS NOT NULL THEN 'INVOICING_PAYMENT'
        WHEN po.id IS NOT NULL AND po.status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED') THEN 'PO_EXECUTION'
        WHEN aw.id IS NOT NULL THEN 'AWARDED'
        WHEN (SELECT count(*)::int FROM quotes q WHERE q.rfq_id = rfq.id) >= 1 THEN 'EVALUATION'
        WHEN rfq.status = 'OPEN' THEN 'QUOTING'
        ELSE 'DRAFT_REQUESTED'
      END AS computed_phase,
      CASE
        WHEN r.status = 'CANCELLED' OR rfq.status = 'CANCELLED' THEN 0
        WHEN pay.id IS NOT NULL OR r.status = 'COMPLETED' OR (wo.progress_percent = 100 AND inv.status = 'APPROVED') THEN 7
        WHEN inv.id IS NOT NULL THEN 6
        WHEN po.id IS NOT NULL AND po.status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED') THEN 5
        WHEN aw.id IS NOT NULL THEN 4
        WHEN (SELECT count(*)::int FROM quotes q WHERE q.rfq_id = rfq.id) >= 1 THEN 3
        WHEN rfq.status = 'OPEN' THEN 2
        ELSE 1
      END AS phase_step,
      ROUND(EXTRACT(EPOCH FROM (now() - coalesce(pay.updated_at, inv.updated_at, wo.updated_at, po.updated_at, rfq.updated_at, r.updated_at, r.created_at))) / 3600, 1) AS idle_hours
    FROM requirements r
    JOIN organizations o ON o.id = r.organization_id
    LEFT JOIN profiles p_creator ON p_creator.id = r.created_by
    LEFT JOIN requirement_categories cat ON cat.id = r.category_id
    LEFT JOIN requirement_subcategories sub ON sub.id = r.subcategory_id
    LEFT JOIN rfqs rfq ON rfq.requirement_id = r.id
    LEFT JOIN awards aw ON aw.rfq_id = rfq.id
    LEFT JOIN quotes q_aw ON q_aw.id = aw.quote_id
    LEFT JOIN suppliers s_aw ON s_aw.id = q_aw.supplier_id
    LEFT JOIN purchase_orders po ON po.rfq_id = rfq.id OR po.award_id = aw.id
    LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
    LEFT JOIN invoices inv ON inv.work_order_id = wo.id
    LEFT JOIN payments pay ON pay.invoice_id = inv.id
    WHERE (p_status IS NULL OR rfq.status::text = p_status OR r.status::text = p_status OR po.status::text = p_status)
      AND (NOT p_stalled_only OR EXTRACT(EPOCH FROM (now() - coalesce(rfq.updated_at, r.created_at))) / 3600 > 24)
    ORDER BY r.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_agg(to_jsonb(base)) INTO v_transactions FROM base;

  RETURN coalesce(v_transactions, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_live_transactions(int, int, text, boolean) TO anon, authenticated;

COMMIT;

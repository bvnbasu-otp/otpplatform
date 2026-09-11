-- 00098_create_admin_seller_orders_rpc.sql
-- Implements public.admin_get_seller_orders for Admin Seller Orders Pipeline

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_seller_orders(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_supplier_id text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_orders jsonb;
  v_supp_uuid uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supp_uuid := p_supplier_id::uuid;
  END IF;

  WITH seller_base AS (
    SELECT
      po.id AS po_id,
      po.po_number,
      po.status::text AS po_status,
      po.total_amount AS po_amount,
      po.currency AS po_currency,
      po.issued_at AS po_issued_at,
      po.acknowledged_at AS po_acknowledged_at,
      po.created_at AS po_created_at,
      
      -- Supplier
      s.id AS supplier_id,
      s.business_name AS supplier_name,
      s.legal_name AS supplier_legal_name,
      s.city AS supplier_city,
      s.gstin AS supplier_gstin,
      s.contact_email AS supplier_email,
      s.contact_phone AS supplier_phone,
      s.gst_status AS supplier_gst_status,
      s.gst_verified AS supplier_gst_verified,
      
      -- Buyer Org
      o.id AS organization_id,
      o.name AS organization_name,
      o.org_type::text AS organization_type,
      
      -- Requirement & RFQ
      r.id AS requirement_id,
      r.title AS requirement_title,
      r.requirement_type::text AS requirement_type,
      r.status::text AS requirement_status,
      r.quantity,
      r.unit,
      r.delivery_city,
      
      rfq.id AS rfq_id,
      rfq.title AS rfq_title,
      rfq.public_ref AS rfq_public_ref,
      rfq.status::text AS rfq_status,
      
      -- Category
      rc.name AS category_name,
      rsc.name AS subcategory_name,
      
      -- Work Order
      wo.id AS work_order_id,
      wo.status::text AS work_order_status,
      wo.progress_percent,
      wo.buyer_accepted_at,
      wo.rating,
      wo.inspection_notes,
      
      -- Invoice
      inv.id AS invoice_id,
      inv.invoice_number,
      inv.amount AS invoice_amount,
      inv.status::text AS invoice_status,
      inv.submitted_at AS invoice_submitted_at,
      
      -- Payment
      pay.id AS payment_id,
      pay.amount AS payment_amount,
      pay.status::text AS payment_status,
      pay.reference AS payment_reference,
      pay.verified_at AS payment_verified_at,
      
      -- Computed Seller Lifecycle Phase
      CASE
        WHEN pay.status = 'VERIFIED' OR po.status = 'COMPLETED' OR wo.status = 'COMPLETED' THEN 'SETTLED'
        WHEN inv.id IS NOT NULL AND inv.status IN ('SUBMITTED', 'APPROVED') THEN 'INVOICED'
        WHEN wo.buyer_accepted_at IS NOT NULL OR wo.progress_percent = 100 THEN 'DELIVERED_INSPECTED'
        WHEN wo.id IS NOT NULL AND wo.status = 'IN_PROGRESS' THEN 'IN_PRODUCTION'
        WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NOT NULL THEN 'PO_ACCEPTED'
        WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL THEN 'PO_PENDING_ACCEPTANCE'
        ELSE 'PO_ACTIVE'
      END AS seller_phase,
      
      ROUND(EXTRACT(EPOCH FROM (now() - coalesce(pay.updated_at, inv.updated_at, wo.updated_at, po.updated_at, po.created_at))) / 3600, 1) AS idle_hours
      
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    JOIN organizations o ON o.id = po.organization_id
    LEFT JOIN rfqs rfq ON rfq.id = po.rfq_id
    LEFT JOIN requirements r ON r.id = rfq.requirement_id
    LEFT JOIN requirement_categories rc ON rc.id = r.category_id
    LEFT JOIN requirement_subcategories rsc ON rsc.id = r.subcategory_id
    LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
    LEFT JOIN invoices inv ON inv.work_order_id = wo.id
    LEFT JOIN payments pay ON pay.invoice_id = inv.id
    WHERE (v_supp_uuid IS NULL OR po.supplier_id = v_supp_uuid)
      AND (p_status IS NULL OR po.status::text = p_status OR wo.status::text = p_status)
    ORDER BY po.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_agg(to_jsonb(seller_base)) INTO v_orders FROM seller_base;

  RETURN coalesce(v_orders, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_seller_orders(int, int, text, text) TO anon, authenticated;

COMMIT;

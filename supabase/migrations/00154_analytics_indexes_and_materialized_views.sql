-- =============================================================================
-- Migration 00154: High-Performance Composite Indexes & Spend Analytics Functions
-- Description:
--   Optimizes PostgreSQL query execution times for large purchase order lists,
--   quotes comparison, and organization spend analytics.
-- =============================================================================

BEGIN;

-- 1. Composite B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status_date
  ON public.purchase_orders(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_rfq_status_score
  ON public.quotes(rfq_id, status, evaluation_score DESC);

CREATE INDEX IF NOT EXISTS idx_rfqs_org_status_date
  ON public.rfqs(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_po_status
  ON public.invoices(purchase_order_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_status
  ON public.payments(invoice_id, status);

-- 2. Stored Procedure: get_organization_spend_analytics
CREATE OR REPLACE FUNCTION public.get_organization_spend_analytics(
  p_organization_id uuid,
  p_from_date timestamptz DEFAULT (now() - interval '365 days'),
  p_to_date timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_total_spend numeric(14, 2) := 0;
  v_po_count integer := 0;
  v_active_suppliers_count integer := 0;
  v_category_breakdown jsonb;
BEGIN
  -- Total spend from completed or issued purchase orders
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO v_total_spend, v_po_count
  FROM public.purchase_orders
  WHERE organization_id = p_organization_id
    AND status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
    AND created_at BETWEEN p_from_date AND p_to_date;

  -- Distinct active suppliers
  SELECT COUNT(DISTINCT supplier_id) INTO v_active_suppliers_count
  FROM public.purchase_orders
  WHERE organization_id = p_organization_id
    AND created_at BETWEEN p_from_date AND p_to_date;

  -- Category spend aggregation
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_category_breakdown
  FROM (
    SELECT 
      COALESCE(rc.name, 'General Procurement') AS category,
      SUM(po.total_amount) AS total_amount,
      COUNT(po.id) AS po_count
    FROM public.purchase_orders po
    JOIN public.rfqs r ON r.id = po.rfq_id
    JOIN public.requirements req ON req.id = r.requirement_id
    LEFT JOIN public.requirement_categories rc ON rc.id = req.category_id
    WHERE po.organization_id = p_organization_id
      AND po.status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
      AND po.created_at BETWEEN p_from_date AND p_to_date
    GROUP BY rc.name
    ORDER BY total_amount DESC
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'total_spend', v_total_spend,
    'po_count', v_po_count,
    'active_suppliers_count', v_active_suppliers_count,
    'categories', v_category_breakdown,
    'calculated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_spend_analytics(uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMIT;

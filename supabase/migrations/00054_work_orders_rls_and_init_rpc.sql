DROP POLICY IF EXISTS work_orders_insert ON work_orders;
CREATE POLICY work_orders_insert ON work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(po.supplier_id)
          OR private.is_org_manager_or_above(po.organization_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.initialize_work_order(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_wo work_orders%ROWTYPE;
  v_wo_id uuid;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF NOT private.is_org_member(v_po.organization_id)
     AND NOT private.is_supplier_user_for(v_po.supplier_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_wo FROM work_orders WHERE purchase_order_id = p_po_id;
  IF FOUND THEN
    RETURN jsonb_build_object('work_order_id', v_wo.id, 'status', v_wo.status);
  END IF;

  INSERT INTO work_orders (
    purchase_order_id,
    supplier_id,
    status,
    title,
    progress_percent,
    created_at,
    updated_at
  ) VALUES (
    v_po.id,
    v_po.supplier_id,
    'NOT_STARTED',
    'Work order — ' || v_po.po_number,
    0,
    now(),
    now()
  )
  RETURNING id INTO v_wo_id;

  RETURN jsonb_build_object('work_order_id', v_wo_id, 'status', 'NOT_STARTED');
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_work_order(uuid) TO authenticated;

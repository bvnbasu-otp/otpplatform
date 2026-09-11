-- Allow managers to create work orders from issued purchase orders (Phase 8).

CREATE POLICY work_orders_insert ON work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND private.is_org_manager_or_above(po.organization_id)
    )
  );

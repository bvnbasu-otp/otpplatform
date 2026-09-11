-- Allow org managers to finalize quotes and record award outcomes (SELECTED / NOT_SELECTED).

CREATE POLICY quotes_update_manager ON quotes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rfqs r
      WHERE r.id = quotes.rfq_id
        AND private.is_org_manager_or_above(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rfqs r
      WHERE r.id = quotes.rfq_id
        AND private.is_org_manager_or_above(r.organization_id)
    )
  );

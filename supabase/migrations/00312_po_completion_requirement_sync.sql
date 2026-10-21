-- 00312: every valid PO completion closes its source requirement.
--
-- accept_delivery_inspection synchronized the requirement only when payment
-- was already complete at inspection time. The supported inverse order
-- (inspection, then payment, then transition_purchase_order(COMPLETED)) left
-- the requirement AWARDED while its PO was COMPLETED.

BEGIN;

CREATE OR REPLACE FUNCTION private.sync_requirement_on_po_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.requirements req
    SET status = 'COMPLETED',
        updated_at = now()
    FROM public.rfqs r
    WHERE r.id = NEW.rfq_id
      AND req.id = r.requirement_id
      AND req.status IS DISTINCT FROM 'COMPLETED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_requirement_on_po_completion ON public.purchase_orders;
CREATE TRIGGER trg_sync_requirement_on_po_completion
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_requirement_on_po_completion();

REVOKE ALL ON FUNCTION private.sync_requirement_on_po_completion() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

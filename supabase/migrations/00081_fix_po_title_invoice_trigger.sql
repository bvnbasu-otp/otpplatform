-- 00081_fix_po_title_invoice_trigger.sql
-- Fix: column po.title does not exist on purchase_orders (use r.title and po.po_number)

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_invoice_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id uuid;
  v_po_id uuid;
  v_po_number text;
  v_rfq_title text;
BEGIN
  IF NEW.status = 'SUBMITTED' AND (OLD IS NULL OR OLD.status != 'SUBMITTED') THEN
    -- Join through work_orders to get the purchase_order_id, po_number, and buyer creator
    SELECT wo.purchase_order_id, po.po_number, r.title, r.created_by
    INTO v_po_id, v_po_number, v_rfq_title, v_buyer_id
    FROM work_orders wo
    JOIN purchase_orders po ON po.id = wo.purchase_order_id
    JOIN rfqs r ON r.id = po.rfq_id
    WHERE wo.id = NEW.work_order_id;

    IF v_buyer_id IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_buyer_id,
        '🧾 GST Invoice Submitted for Settlement',
        'Official GST Invoice ' || NEW.invoice_number || ' (₹' || to_char(NEW.amount, 'FM99,99,99,999') || ') has been submitted for payment settlement on ' || COALESCE(v_po_number, 'Purchase Order') || ' (' || COALESCE(v_rfq_title, 'Order') || ').',
        '/purchase-orders/' || COALESCE(v_po_id::text, ''),
        'invoice.submitted',
        'INVOICE_SUBMITTED',
        jsonb_build_object(
          'invoiceId', NEW.id,
          'invoiceNumber', NEW.invoice_number,
          'amount', NEW.amount,
          'poId', v_po_id,
          'poNumber', v_po_number,
          'workOrderId', NEW.work_order_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

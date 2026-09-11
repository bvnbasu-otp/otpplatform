-- 00080_fix_invoice_notification_triggers.sql
-- Fix: record "new" has no field "purchase_order_id" on invoices trigger function

BEGIN;

-- 1. Fix notify_invoice_submitted on invoices table
CREATE OR REPLACE FUNCTION public.notify_invoice_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id uuid;
  v_po_id uuid;
  v_po_title text;
BEGIN
  IF NEW.status = 'SUBMITTED' AND (OLD IS NULL OR OLD.status != 'SUBMITTED') THEN
    -- Join through work_orders to get the purchase_order_id and buyer creator
    SELECT wo.purchase_order_id, po.title, r.created_by INTO v_po_id, v_po_title, v_buyer_id
    FROM work_orders wo
    JOIN purchase_orders po ON po.id = wo.purchase_order_id
    JOIN rfqs r ON r.id = po.rfq_id
    WHERE wo.id = NEW.work_order_id;

    IF v_buyer_id IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_buyer_id,
        '🧾 GST Invoice Submitted for Settlement',
        'Official GST Invoice ' || NEW.invoice_number || ' (₹' || to_char(NEW.amount, 'FM99,99,99,999') || ') has been submitted for payment settlement on ' || COALESCE(v_po_title, 'Purchase Order') || '.',
        '/purchase-orders/' || COALESCE(v_po_id::text, ''),
        'invoice.submitted',
        'INVOICE_SUBMITTED',
        jsonb_build_object(
          'invoiceId', NEW.id,
          'invoiceNumber', NEW.invoice_number,
          'amount', NEW.amount,
          'poId', v_po_id,
          'workOrderId', NEW.work_order_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_submitted ON invoices;
CREATE TRIGGER trg_notify_invoice_submitted
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_invoice_submitted();

-- 2. Add notify_payment_recorded on payments table -> Notify Supplier of Remittance
CREATE OR REPLACE FUNCTION public.notify_payment_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_user_id uuid;
  v_inv record;
BEGIN
  -- Get invoice and supplier details
  SELECT inv.id, inv.invoice_number, inv.amount, inv.work_order_id, wo.purchase_order_id, su.profile_id
  INTO v_inv
  FROM invoices inv
  JOIN work_orders wo ON wo.id = inv.work_order_id
  JOIN supplier_users su ON su.supplier_id = inv.supplier_id
  WHERE inv.id = NEW.invoice_id
  LIMIT 1;

  IF v_inv.profile_id IS NOT NULL THEN
    PERFORM public.create_system_notification(
      v_inv.profile_id,
      '💰 Payment Remittance Recorded (₹' || to_char(NEW.amount, 'FM99,99,99,999') || ')',
      'Buyer has recorded payment reference ' || COALESCE(NEW.reference, 'UTR/Ref') || ' for Invoice ' || v_inv.invoice_number || '.',
      '/purchase-orders/' || COALESCE(v_inv.purchase_order_id::text, ''),
      'payment.recorded',
      'PAYMENT_RECORDED',
      jsonb_build_object(
        'paymentId', NEW.id,
        'invoiceId', NEW.invoice_id,
        'amount', NEW.amount,
        'reference', NEW.reference,
        'method', NEW.method::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_recorded ON payments;
CREATE TRIGGER trg_notify_payment_recorded
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_payment_recorded();

COMMIT;

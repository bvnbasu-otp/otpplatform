-- 00060_comprehensive_notifications_engine.sql
-- Complete Real-time Notification Engine for Buyers, Suppliers, Voters, and Approvers

-- 1. Enhance notifications table
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_type text;

-- Index for instant unread query
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (profile_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Helper Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_system_notification(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL,
  p_event_type text DEFAULT 'system.alert',
  p_action_type text DEFAULT 'SYSTEM_ALERT',
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO notifications (
    profile_id,
    channel,
    status,
    event_type,
    action_type,
    title,
    body,
    link,
    payload,
    created_at,
    updated_at
  ) VALUES (
    p_profile_id,
    'IN_APP'::notification_channel,
    'PENDING'::notification_status,
    p_event_type,
    p_action_type,
    p_title,
    p_body,
    p_link,
    p_payload,
    now(),
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Automated Triggers for All Key Lifecycle Events
-- ---------------------------------------------------------------------------

-- Trigger 1: RFQ Broadcast / Invitation -> Notify Suppliers
CREATE OR REPLACE FUNCTION public.notify_rfq_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq_title text;
  v_profile_rec RECORD;
BEGIN
  IF NEW.status = 'INVITED' THEN
    SELECT title INTO v_rfq_title FROM rfqs WHERE id = NEW.rfq_id;
    
    -- Find all users for this supplier
    FOR v_profile_rec IN
      SELECT su.profile_id
      FROM supplier_users su
      WHERE su.supplier_id = NEW.supplier_id
    LOOP
      PERFORM public.create_system_notification(
        v_profile_rec.profile_id,
        '⚡ New RFQ Opportunity Available',
        'You have been invited to quote for "' || COALESCE(v_rfq_title, 'New Requirement') || '". Submit your competitive quote.',
        '/supplier/rfq/' || NEW.rfq_id::text,
        'rfq.invited',
        'RFQ_INVITED',
        jsonb_build_object('rfqId', NEW.rfq_id, 'supplierId', NEW.supplier_id)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rfq_invitation ON rfq_invitations;
CREATE TRIGGER trg_notify_rfq_invitation
  AFTER INSERT OR UPDATE OF status ON rfq_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_rfq_invitation();

-- Trigger 2: Quote Submitted -> Notify Buyer
CREATE OR REPLACE FUNCTION public.notify_quote_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq RECORD;
BEGIN
  IF NEW.status = 'SUBMITTED' AND (OLD IS NULL OR OLD.status != 'SUBMITTED') THEN
    SELECT r.id, r.title, r.created_by, r.organization_id
    INTO v_rfq
    FROM rfqs r
    WHERE r.id = NEW.rfq_id;

    IF v_rfq.created_by IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_rfq.created_by,
        '📝 New Blind Quote Received',
        'A supplier has submitted a quote for "' || COALESCE(v_rfq.title, 'RFQ') || '". Objective evaluation is updating.',
        '/rfq/' || NEW.rfq_id::text || '/blind-comparison',
        'quote.submitted',
        'QUOTE_RECEIVED',
        jsonb_build_object('rfqId', NEW.rfq_id, 'quoteId', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quote_submitted ON quotes;
CREATE TRIGGER trg_notify_quote_submitted
  AFTER INSERT OR UPDATE OF status ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_quote_submitted();

-- Trigger 3: Evaluation & Voting Room Assignment -> Notify Voters
CREATE OR REPLACE FUNCTION public.notify_committee_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq_title text;
BEGIN
  SELECT title INTO v_rfq_title FROM rfqs WHERE id = NEW.rfq_id;

  PERFORM public.create_system_notification(
    NEW.profile_id,
    '🗳️ Evaluation & Voting Room Action Required',
    'You are invited to evaluate quotes and cast your vote on "' || COALESCE(v_rfq_title, 'RFQ') || '".',
    '/rfq/' || NEW.rfq_id::text || '/committee',
    'governance.assigned',
    'VOTE_REQUESTED',
    jsonb_build_object('rfqId', NEW.rfq_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_committee_assignment ON committee_assignments;
CREATE TRIGGER trg_notify_committee_assignment
  AFTER INSERT ON committee_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_committee_assignment();

-- Trigger 4: Committee Vote Cast -> Notify RFQ Manager
CREATE OR REPLACE FUNCTION public.notify_committee_voted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq RECORD;
  v_voter_name text;
BEGIN
  SELECT r.id, r.title, r.created_by
  INTO v_rfq
  FROM rfqs r
  WHERE r.id = NEW.rfq_id;

  SELECT full_name INTO v_voter_name FROM profiles WHERE id = NEW.profile_id;

  IF v_rfq.created_by IS NOT NULL THEN
    PERFORM public.create_system_notification(
      v_rfq.created_by,
      '🗳️ Committee Vote Cast',
      COALESCE(v_voter_name, 'A committee member') || ' has cast their vote on "' || COALESCE(v_rfq.title, 'RFQ') || '".',
      '/rfq/' || NEW.rfq_id::text || '/committee',
      'governance.voted',
      'VOTE_CAST',
      jsonb_build_object('rfqId', NEW.rfq_id, 'voterId', NEW.profile_id, 'choice', NEW.choice::text)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_committee_voted ON committee_votes;
CREATE TRIGGER trg_notify_committee_voted
  AFTER INSERT ON committee_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_committee_voted();

-- Trigger 5: Purchase Order Issued -> Notify Winning Supplier
CREATE OR REPLACE FUNCTION public.notify_po_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_rec RECORD;
BEGIN
  IF NEW.status = 'ISSUED' AND (OLD IS NULL OR OLD.status != 'ISSUED') THEN
    FOR v_profile_rec IN
      SELECT su.profile_id
      FROM supplier_users su
      WHERE su.supplier_id = NEW.supplier_id
    LOOP
      PERFORM public.create_system_notification(
        v_profile_rec.profile_id,
        '⚡ Action Required: Purchase Order Issued',
        'Purchase Order ' || NEW.po_number || ' (₹' || to_char(NEW.total_amount, 'FM99,99,99,999') || ') has been awarded to you. Tap to accept.',
        '/supplier/purchase-orders/' || NEW.id::text,
        'po.issued',
        'PO_ISSUED',
        jsonb_build_object('poId', NEW.id, 'poNumber', NEW.po_number, 'amount', NEW.total_amount)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_po_issued ON purchase_orders;
CREATE TRIGGER trg_notify_po_issued
  AFTER INSERT OR UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_po_issued();

-- Trigger 6: Purchase Order Accepted by Supplier -> Notify Buyer
CREATE OR REPLACE FUNCTION public.notify_po_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq RECORD;
BEGIN
  IF NEW.status = 'ACCEPTED' AND (OLD IS NULL OR OLD.status != 'ACCEPTED') THEN
    SELECT r.created_by, r.title INTO v_rfq FROM rfqs r WHERE r.id = NEW.rfq_id;

    IF v_rfq.created_by IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_rfq.created_by,
        '✅ Purchase Order Accepted by Supplier',
        'Supplier has officially accepted Purchase Order ' || NEW.po_number || '. Work order execution can now proceed.',
        '/purchase-orders/' || NEW.id::text,
        'po.accepted',
        'PO_ACCEPTED',
        jsonb_build_object('poId', NEW.id, 'poNumber', NEW.po_number)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_po_accepted ON purchase_orders;
CREATE TRIGGER trg_notify_po_accepted
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_po_accepted();

-- Trigger 7: Work Order Milestone Progress -> Notify Buyer
CREATE OR REPLACE FUNCTION public.notify_work_order_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id uuid;
BEGIN
  IF NEW.progress_percent != COALESCE(OLD.progress_percent, -1) THEN
    SELECT r.created_by INTO v_buyer_id
    FROM purchase_orders po
    JOIN rfqs r ON r.id = po.rfq_id
    WHERE po.id = NEW.purchase_order_id;

    IF v_buyer_id IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_buyer_id,
        '🔨 Milestone Progress Updated (' || NEW.progress_percent || '%)',
        'Supplier has reported ' || NEW.progress_percent || '% completion on your purchase order. Mutual inspection acknowledgment available.',
        '/purchase-orders/' || NEW.purchase_order_id::text,
        'work_order.progress',
        'WORK_PROGRESS_UPDATED',
        jsonb_build_object('workOrderId', NEW.id, 'progressPercent', NEW.progress_percent, 'poId', NEW.purchase_order_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_work_order_progress ON work_orders;
CREATE TRIGGER trg_notify_work_order_progress
  AFTER UPDATE OF progress_percent ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_work_order_progress();

-- Trigger 8: GST Invoice Submitted -> Notify Buyer
CREATE OR REPLACE FUNCTION public.notify_invoice_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id uuid;
BEGIN
  IF NEW.status = 'SUBMITTED' AND (OLD IS NULL OR OLD.status != 'SUBMITTED') THEN
    SELECT r.created_by INTO v_buyer_id
    FROM purchase_orders po
    JOIN rfqs r ON r.id = po.rfq_id
    WHERE po.id = NEW.purchase_order_id;

    IF v_buyer_id IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_buyer_id,
        '🧾 GST Invoice Submitted for Settlement',
        'Official GST Invoice ' || NEW.invoice_number || ' (₹' || to_char(NEW.total_amount, 'FM99,99,99,999') || ') has been submitted for payment settlement.',
        '/purchase-orders/' || NEW.purchase_order_id::text,
        'invoice.submitted',
        'INVOICE_SUBMITTED',
        jsonb_build_object('invoiceId', NEW.id, 'invoiceNumber', NEW.invoice_number, 'amount', NEW.total_amount, 'poId', NEW.purchase_order_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_submitted ON invoices;
CREATE TRIGGER trg_notify_invoice_submitted
  AFTER INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_invoice_submitted();

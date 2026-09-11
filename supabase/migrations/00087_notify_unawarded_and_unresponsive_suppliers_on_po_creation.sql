-- 00087_notify_unawarded_and_unresponsive_suppliers_on_po_creation.sql
-- Informs unresponsive suppliers and non-winning bidders that the requirement is closed and awarded

BEGIN;

-- 1. Function to notify all non-awarded & unresponsive suppliers for an RFQ
CREATE OR REPLACE FUNCTION public.notify_unawarded_suppliers_on_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq          rfqs%ROWTYPE;
  v_winning_quote quotes%ROWTYPE;
  v_inv          record;
  v_user         record;
  v_has_quote    boolean;
  v_title        text;
  v_body         text;
  v_action_type  text;
  v_event_type   text;
BEGIN
  -- Only execute when award is recorded or revealed
  IF NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = NEW.rfq_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_winning_quote FROM quotes WHERE id = NEW.quote_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Iterate through all other invited suppliers for this RFQ
  FOR v_inv IN
    SELECT ri.id as invitation_id, ri.supplier_id, ri.anonymous_label, s.business_name
    FROM rfq_invitations ri
    JOIN suppliers s ON s.id = ri.supplier_id
    WHERE ri.rfq_id = NEW.rfq_id
      AND ri.supplier_id <> v_winning_quote.supplier_id
  LOOP
    -- Check if this supplier submitted a quote
    SELECT EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.rfq_id = NEW.rfq_id AND q.supplier_id = v_inv.supplier_id
    ) INTO v_has_quote;

    IF v_has_quote THEN
      -- Unsuccessful bidder notification
      v_title       := '❌ Tender Concluded: Not Awarded';
      v_body        := 'The buyer has concluded evaluation for "' || COALESCE(v_rfq.title, 'Requirement') || '" and placed the order with another supplier. Thank you for your submission.';
      v_action_type := 'RFQ_NOT_AWARDED';
      v_event_type  := 'rfq.not_awarded';
    ELSE
      -- Unresponsive / non-bidding supplier notification
      v_title       := 'ℹ️ Bidding Closed: Requirement Awarded';
      v_body        := 'The requirement "' || COALESCE(v_rfq.title, 'Requirement') || '" is now closed and has been awarded. It is no longer accepting new quotes.';
      v_action_type := 'RFQ_CLOSED_UNRESPONSIVE';
      v_event_type  := 'rfq.closed_unresponsive';
    END IF;

    -- Send notification to all active users associated with this supplier
    FOR v_user IN
      SELECT profile_id
      FROM supplier_users
      WHERE supplier_id = v_inv.supplier_id
    LOOP
      -- Avoid sending duplicate notifications for the same RFQ closeout
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE profile_id = v_user.profile_id
          AND event_type IN ('rfq.not_awarded', 'rfq.closed_unresponsive')
          AND payload->>'rfqId' = NEW.rfq_id::text
      ) THEN
        PERFORM public.create_system_notification(
          v_user.profile_id,
          v_title,
          v_body,
          '/supplier/rfq/' || NEW.rfq_id::text,
          v_event_type,
          v_action_type,
          jsonb_build_object(
            'rfqId', NEW.rfq_id,
            'awardId', NEW.id,
            'supplierId', v_inv.supplier_id,
            'hasQuote', v_has_quote
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger on awards table
DROP TRIGGER IF EXISTS trg_notify_unawarded_suppliers ON awards;
CREATE TRIGGER trg_notify_unawarded_suppliers
  AFTER INSERT OR UPDATE OF status ON awards
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_unawarded_suppliers_on_award();

-- 3. Also attach trigger on purchase orders when created / issued
CREATE OR REPLACE FUNCTION public.notify_unawarded_suppliers_on_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award awards%ROWTYPE;
BEGIN
  IF NEW.award_id IS NOT NULL THEN
    SELECT * INTO v_award FROM awards WHERE id = NEW.award_id;
    IF FOUND THEN
      -- Run the award unawarded notification logic
      PERFORM public.notify_unawarded_suppliers_on_award();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

-- =============================================================================
-- Migration 00151: Consolidated Atomic Award, Reveal, and Purchase Order Transaction
-- Description:
--   Unifies lock_award, reveal_award, and purchase order creation into a strict
--   atomic transaction with row-level locks (FOR UPDATE) to eliminate race
--   conditions, partial-state failures, or uncoupled awards without purchase orders.
-- =============================================================================

BEGIN;

-- 1. Atomic Stored Procedure: lock_and_reveal_award_atomic
CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text,
  p_auto_reveal   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_rfq         rfqs%ROWTYPE;
  v_quote       quotes%ROWTYPE;
  v_award_id    uuid;
  v_now         timestamptz := now();
  v_final       integer;
  v_tally       jsonb;
  v_po_res      jsonb;
  v_po_id       uuid;
  v_po_number   text;
  v_supplier_id uuid;
  v_business    text;
  v_phone       text;
  v_email       text;
  v_alias       text;
  v_existing_award awards%ROWTYPE;
BEGIN
  -- Strict row-level lock on RFQ to serialize concurrent award operations
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found', p_rfq_id;
  END IF;

  -- Authorization check
  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an organization manager or admin can award contracts';
  END IF;

  -- Auto-advance RFQ status if in earlier valid quoting stage
  IF v_rfq.status IN ('CLARIFICATION', 'OPEN', 'CLOSED') THEN
    UPDATE quotes
    SET status = 'FINAL', updated_at = v_now
    WHERE rfq_id = p_rfq_id AND status IN ('SUBMITTED', 'REVISED');

    UPDATE rfqs SET status = 'EVALUATING', updated_at = v_now WHERE id = p_rfq_id;
    UPDATE requirements SET status = 'EVALUATION', updated_at = v_now WHERE id = v_rfq.requirement_id;
    v_rfq.status := 'EVALUATING';
  ELSIF v_rfq.status = 'AWARDED' THEN
    -- If already awarded, retrieve existing award
    SELECT * INTO v_existing_award FROM awards WHERE rfq_id = p_rfq_id;
    IF v_existing_award.id IS NOT NULL THEN
      SELECT id, po_number INTO v_po_id, v_po_number
      FROM purchase_orders WHERE award_id = v_existing_award.id;

      RETURN jsonb_build_object(
        'ok', true,
        'already_awarded', true,
        'award_id', v_existing_award.id,
        'rfq_id', p_rfq_id,
        'quote_id', v_existing_award.quote_id,
        'status', v_existing_award.status,
        'po_id', v_po_id,
        'po_number', v_po_number
      );
    END IF;
  ELSIF v_rfq.status <> 'EVALUATING' THEN
    RAISE EXCEPTION 'RFQ must be in EVALUATING state to award (currently %)', v_rfq.status;
  END IF;

  -- Validate Quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % does not belong to RFQ %', p_quote_id, p_rfq_id;
  END IF;

  IF v_quote.status IN ('SUBMITTED', 'REVISED') THEN
    UPDATE quotes SET status = 'FINAL', updated_at = v_now WHERE id = p_quote_id;
    v_quote.status := 'FINAL';
  ELSIF v_quote.status <> 'FINAL' THEN
    RAISE EXCEPTION 'Only a FINAL quote can be awarded (quote is %)', v_quote.status;
  END IF;

  IF btrim(COALESCE(p_justification, '')) = '' THEN
    RAISE EXCEPTION 'A written justification is mandatory for award';
  END IF;

  -- Verify competitive tension / minimum quotes requirement
  SELECT count(*)::int INTO v_final
  FROM quotes WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final < v_rfq.min_quotes_required AND NOT COALESCE(v_rfq.min_quotes_waived, false) THEN
    RAISE EXCEPTION 'RFQ requires % final quotes but only has %. Waive requirement to proceed.',
      v_rfq.min_quotes_required, v_final;
  END IF;

  -- Freeze the committee vote tally snapshot
  SELECT jsonb_build_object(
    'locked_at', v_now,
    'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id,
      'choice', v.choice,
      'voting_power', v.voting_power,
      'buyer_type', v.buyer_type
    )), '[]'::jsonb)
  )
  INTO v_tally
  FROM (
    SELECT DISTINCT ON (cv.profile_id) cv.*
    FROM committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
    ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
  ) v;

  -- 1. Insert Award Record
  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at, vote_snapshot
  ) VALUES (
    p_rfq_id, p_quote_id, private.get_profile_id(),
    jsonb_build_object('text', p_justification),
    CASE WHEN p_auto_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
    v_now, v_now, v_tally
  )
  RETURNING id INTO v_award_id;

  -- 2. Update Quote Statuses (Winner -> SELECTED, Others -> NOT_SELECTED)
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 3. Update RFQ and Requirement Status
  UPDATE rfqs
  SET 
    status = 'AWARDED',
    reveal_status = CASE WHEN p_auto_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now
  WHERE id = p_rfq_id;

  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- 4. Audit Log
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'auto_reveal', p_auto_reveal,
      'locked_at', v_now
    )
  );

  -- 5. If auto_reveal is requested, atomically generate PO and notify parties
  IF p_auto_reveal THEN
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';

    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q
    JOIN suppliers s ON s.id = q.supplier_id
    JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;

    RETURN jsonb_build_object(
      'ok', true,
      'award_id', v_award_id,
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'status', 'REVEALED',
      'revealed', true,
      'po_id', v_po_id,
      'po_number', v_po_number,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'award_id', v_award_id,
    'rfq_id', p_rfq_id,
    'quote_id', p_quote_id,
    'status', 'PENDING_REVEAL',
    'revealed', false,
    'votes_locked_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, service_role;

-- 2. Enhance existing lock_award to route cleanly to atomic procedure
CREATE OR REPLACE FUNCTION public.lock_award(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  RETURN public.lock_and_reveal_award_atomic(p_rfq_id, p_quote_id, p_justification, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_award(uuid, uuid, text) TO authenticated, service_role;

COMMIT;

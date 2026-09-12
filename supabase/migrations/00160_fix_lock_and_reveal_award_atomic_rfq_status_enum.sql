-- =============================================================================
-- Migration 00160: Fix lock_and_reveal_award_atomic Schema Alignments
--
-- Description:
--   1. Corrects rfq_status enum validation to canonical values ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED').
--   2. Fixes vote snapshot to read from committee_votes.recommended_quote_id and voting_power.
--   3. Fixes awards table columns to match actual database schema (awarded_by, justification, status, awarded_at, votes_locked_at, vote_snapshot).
--   4. Fixes supplier fields selection to align with suppliers table schema.
-- =============================================================================

BEGIN;

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
  v_org         organizations%ROWTYPE;
  v_award_id    uuid;
  v_now         timestamptz := now();
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
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  -- Verify valid rfq_status enum values (OPEN, CLARIFICATION, CLOSED, EVALUATING, AWARDED)
  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_rfq.organization_id;

  -- Verify Quote belongs to this RFQ
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ');
  END IF;

  -- Check if award already exists for this RFQ
  SELECT * INTO v_existing_award
  FROM public.awards
  WHERE rfq_id = p_rfq_id;

  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    -- Compute final frozen vote tally snapshot from committee_votes
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
      FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;

    -- 1. Insert Frozen Award Record
    INSERT INTO public.awards (
      rfq_id,
      quote_id,
      awarded_by,
      justification,
      status,
      awarded_at,
      revealed_at,
      votes_locked_at,
      vote_snapshot
    ) VALUES (
      p_rfq_id,
      p_quote_id,
      COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN p_auto_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now,
      CASE WHEN p_auto_reveal THEN v_now ELSE NULL END,
      v_now,
      COALESCE(v_tally, '{}'::jsonb)
    )
    RETURNING id INTO v_award_id;
  END IF;

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

  -- Notify suppliers of outcome and close out round
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);

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

  -- 5. If auto_reveal is requested, atomically generate PO and return mutual reveal payload
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
      -- Supplier unmasked details
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias,
      -- Buyer unmasked details for GST Tax Invoice & ITC claims
      'buyer_organization_id', v_org.id,
      'buyer_organization_name', v_org.name,
      'buyer_org_type', v_org.org_type,
      'buyer_gstin', v_org.tax_registration,
      'buyer_contact_person', v_org.contact_person,
      'buyer_contact_phone', v_org.contact_phone,
      'buyer_contact_email', v_org.contact_email,
      'buyer_address', v_org.address,
      'buyer_city', v_org.city
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

GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, anon, service_role;

COMMIT;

CREATE OR REPLACE FUNCTION public.lock_award(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_quote      quotes%ROWTYPE;
  v_final      integer;
  v_award_id   uuid;
  v_now        timestamptz := now();
  v_tally      jsonb;
  v_notified   integer;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can award';
  END IF;

  -- Auto-finalize quotes and advance to evaluation if still in clarification or open
  IF v_rfq.status IN ('CLARIFICATION', 'OPEN', 'CLOSED') THEN
    UPDATE quotes
    SET status = 'FINAL', updated_at = v_now
    WHERE rfq_id = p_rfq_id AND status IN ('SUBMITTED', 'REVISED');

    UPDATE rfqs SET status = 'EVALUATING', updated_at = v_now WHERE id = p_rfq_id;
    UPDATE requirements SET status = 'EVALUATION', updated_at = v_now WHERE id = v_rfq.requirement_id;
    v_rfq.status := 'EVALUATING';
  ELSIF v_rfq.status <> 'EVALUATING' THEN
    RAISE EXCEPTION 'RFQ must be EVALUATING to award (currently %)', v_rfq.status;
  END IF;

  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'This RFQ is already awarded';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote does not belong to this RFQ';
  END IF;

  IF v_quote.status IN ('SUBMITTED', 'REVISED') THEN
    UPDATE quotes SET status = 'FINAL', updated_at = v_now WHERE id = p_quote_id;
    v_quote.status := 'FINAL';
  ELSIF v_quote.status <> 'FINAL' THEN
    RAISE EXCEPTION 'Only a FINAL quote can be awarded (quote is %)', v_quote.status;
  END IF;

  IF btrim(COALESCE(p_justification, '')) = '' THEN
    RAISE EXCEPTION 'A written justification is required';
  END IF;

  -- Competitive tension check.
  SELECT count(*)::int INTO v_final
  FROM quotes WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final < v_rfq.min_quotes_required AND NOT v_rfq.min_quotes_waived THEN
    RAISE EXCEPTION
      'This RFQ needs % final quotes to award and has %. Waive the requirement with a reason to proceed.',
      v_rfq.min_quotes_required, v_final;
  END IF;

  -- Freeze the tally that justifies the decision.
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

  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at, vote_snapshot
  ) VALUES (
    p_rfq_id, p_quote_id, private.get_profile_id(),
    jsonb_build_object('text', p_justification),
    'LOCKED', v_now, v_now, v_tally
  )
  RETURNING id INTO v_award_id;

  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;

  UPDATE quotes
  SET status = 'NOT_SELECTED', updated_at = v_now
  WHERE rfq_id = p_rfq_id
    AND id <> p_quote_id
    AND status IN ('FINAL', 'SUBMITTED', 'REVISED');

  UPDATE rfqs SET status = 'AWARDED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now
  WHERE id = v_rfq.requirement_id;

  v_notified := private.notify_bidders_of_outcome(p_rfq_id);

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'final_quotes', v_final,
      'min_quotes_required', v_rfq.min_quotes_required,
      'min_quotes_waived', v_rfq.min_quotes_waived,
      'vote_snapshot', v_tally,
      'justification', p_justification
    )
  );

  RETURN jsonb_build_object(
    'award_id', v_award_id,
    'status', 'LOCKED',
    'votes_locked_at', v_now,
    'reveal_status', 'BLIND',
    'bidders_notified', v_notified
  );
END;
$$;

-- rfq_phase() has labelled ordinal 1 'Blind bidding' since 00041, but the
-- platform doesn't use bid/bidding language anywhere else — every client
-- fixture and UI string calls this stage identity-protected quoting.
CREATE OR REPLACE FUNCTION public.rfq_phase(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq     rfqs%ROWTYPE;
  v_ordinal integer;
  v_label   text;
  v_starts  timestamptz;
  v_ends    timestamptz;
BEGIN
  IF NOT (
    private.can_access_rfq_as_buyer(p_rfq_id)
    OR private.can_access_rfq_as_committee(p_rfq_id)
    OR private.has_rfq_invitation(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this enquiry';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such enquiry';
  END IF;

  CASE v_rfq.status
    WHEN 'DRAFT' THEN
      v_ordinal := 0; v_label := 'Not published';
      v_starts := NULL; v_ends := NULL;
    WHEN 'OPEN' THEN
      v_ordinal := 1; v_label := 'Identity-Protected Quoting';
      v_starts := v_rfq.opened_at; v_ends := v_rfq.quote_deadline;
    WHEN 'CLARIFICATION' THEN
      v_ordinal := 2; v_label := 'Clarification and revision';
      v_starts := v_rfq.clarification_at;
      v_ends := private.clarification_ends(p_rfq_id);
    WHEN 'EVALUATING' THEN
      v_ordinal := 3; v_label := 'Evaluation and committee voting';
      v_starts := v_rfq.evaluation_at; v_ends := v_rfq.evaluation_deadline;
    WHEN 'AWARDED' THEN
      v_ordinal := 4; v_label := 'Awarded';
      v_starts := v_rfq.updated_at; v_ends := NULL;
    ELSE
      v_ordinal := 0; v_label := 'Closed';
      v_starts := NULL; v_ends := NULL;
  END CASE;

  RETURN jsonb_build_object(
    'rfqId', v_rfq.id,
    'ref', v_rfq.public_ref,
    'status', v_rfq.status,
    'ordinal', v_ordinal,
    'label', v_label,
    'startsAt', v_starts,
    'endsAt', v_ends,
    -- The one thing a countdown must not get wrong: whether the window is
    -- already over. Computed here so every client agrees, on whatever clock the
    -- device happens to be set to.
    'overdue', v_ends IS NOT NULL AND v_ends <= now(),
    'secondsRemaining', CASE
      WHEN v_ends IS NULL THEN NULL
      ELSE GREATEST(0, floor(EXTRACT(EPOCH FROM (v_ends - now())))::bigint)
    END,
    'schedule', jsonb_build_object(
      'openedAt', v_rfq.opened_at,
      'bidDeadline', v_rfq.bid_deadline,
      'clarificationAt', v_rfq.clarification_at,
      'revisionDeadline', v_rfq.revision_deadline,
      'evaluationAt', v_rfq.evaluation_at,
      'evaluationDeadline', v_rfq.evaluation_deadline
    ),
    'quotingOpen', private.quoting_refusal(p_rfq_id) IS NULL,
    'quotingRefusal', private.quoting_refusal(p_rfq_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rfq_phase(uuid) TO authenticated;

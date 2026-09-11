-- process_rfq_cancellation() checked `v_rfq.status IN ('COMPLETED', 'CANCELLED')`,
-- but rfq_status has no 'COMPLETED' value (only requirement_status does) — so
-- Postgres rejected the literal at cast time with "invalid input value for
-- enum rfq_status: COMPLETED" on every single call, before the function ever
-- got to record the cancellation. Body otherwise unchanged from 00067.
CREATE OR REPLACE FUNCTION public.process_rfq_cancellation(
  p_rfq_id uuid,
  p_reason_code exit_reason_code,
  p_detailed_notes text,
  p_supporting_doc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_stage cancellation_stage;
  v_is_suspicious boolean := false;
  v_flags text[] := '{}';
  v_recent_cancels integer;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an organization manager or admin can cancel an RFQ';
  END IF;

  IF v_rfq.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot cancel an RFQ that is already %', v_rfq.status;
  END IF;

  -- Determine stage
  IF v_rfq.reveal_status = 'REVEALED' THEN
    v_stage := 'POST_REVEAL_PRE_PO';
  ELSIF v_rfq.status = 'AWARDED' THEN
    v_stage := 'POST_AWARD_PRE_REVEAL';
  ELSIF v_rfq.status IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING') THEN
    v_stage := 'POST_QUOTE_PRE_AWARD';
  ELSE
    v_stage := 'PRE_QUOTE';
  END IF;

  -- Rule 1: Post-Reveal Cancellation Flag
  IF v_stage = 'POST_REVEAL_PRE_PO' THEN
    v_is_suspicious := true;
    v_flags := array_append(v_flags, 'CANCELLED_AFTER_IDENTITY_UNMASK');
  END IF;

  -- Rule 2: High Velocity Cancellation
  SELECT count(*)::int INTO v_recent_cancels
  FROM rfq_cancellations rc
  JOIN rfqs r ON r.id = rc.rfq_id
  WHERE r.organization_id = v_rfq.organization_id
    AND rc.created_at >= now() - interval '30 days';

  IF v_recent_cancels >= 2 THEN
    v_is_suspicious := true;
    v_flags := array_append(v_flags, 'REPEATED_CANCELLATION_PATTERN');
  END IF;

  -- Insert Cancellation Audit
  INSERT INTO public.rfq_cancellations (
    rfq_id, cancelled_by, stage, reason_code, detailed_notes,
    supporting_doc_id, is_suspicious, suspicion_reasons
  ) VALUES (
    p_rfq_id, private.get_profile_id(), v_stage, p_reason_code,
    btrim(p_detailed_notes), p_supporting_doc_id, v_is_suspicious, v_flags
  );

  -- Close RFQ & Requirement
  UPDATE public.rfqs SET status = 'CANCELLED', updated_at = now() WHERE id = p_rfq_id;
  UPDATE public.requirements SET status = 'CANCELLED', updated_at = now() WHERE id = v_rfq.requirement_id;

  -- Update associated open quotes
  UPDATE public.quotes SET status = 'WITHDRAWN', updated_at = now()
  WHERE rfq_id = p_rfq_id AND status NOT IN ('SELECTED', 'NOT_SELECTED');

  -- Recalculate Buyer Reliability Score
  PERFORM private.recalculate_buyer_reliability_score(v_rfq.organization_id);

  INSERT INTO public.audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.cancelled',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'stage', v_stage,
      'reason_code', p_reason_code,
      'is_suspicious', v_is_suspicious,
      'flags', v_flags
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'rfq_id', p_rfq_id,
    'stage', v_stage,
    'is_suspicious', v_is_suspicious,
    'reasons', v_flags
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_rfq_cancellation(uuid, exit_reason_code, text, uuid) TO authenticated, service_role;

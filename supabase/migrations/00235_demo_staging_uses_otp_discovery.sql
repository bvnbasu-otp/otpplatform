-- 00235: demo staging invites the registered supplier network.
--
-- demo_stage_scenario calls discover_and_invite_for_rfq(rfq_id, limit).
-- After 00232 the only overload is (uuid, integer, uuid[], text) and its
-- default network is GOOGLE_PLACES. That two-argument call searches pin
-- coverage, finds none on a seeded demo, and restage deletes the seeded
-- invitations without putting them back.
--
-- The call now names OTP_REGISTERED. A one-argument call still uses the
-- Google Places default. No two-argument overload is added, because that
-- signature is ambiguous with the four-argument defaults. Anonymous
-- execute is unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.demo_stage_scenario(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc      demo_scenarios%ROWTYPE;
  v_rfq     rfqs%ROWTYPE;
  v_weights jsonb;
  v_winner  uuid;
  v_steps   text[] := '{}';
  v_result  jsonb;
BEGIN
  IF NOT private.demo_mode_enabled() THEN
    RAISE EXCEPTION 'Demo mode is off: staging is unavailable';
  END IF;

  IF NOT (private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = private.get_profile_id() AND p.is_demo
  )) THEN
    RAISE EXCEPTION 'Only a demo account or a platform admin may stage a demo scenario';
  END IF;

  SELECT * INTO v_sc FROM demo_scenarios WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No demo scenario %', p_code;
  END IF;

  IF v_sc.rfq_id IS NULL THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'DRAFT', 'steps', to_jsonb(v_steps));
  END IF;

  PERFORM set_config('otp.demo_staging', 'on', true);

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_sc.rfq_id;

  IF v_sc.target_stage = 'DRAFT' THEN
    UPDATE rfqs SET status = 'DRAFT' WHERE id = v_rfq.id;
    UPDATE requirements SET status = 'DRAFT' WHERE id = v_rfq.requirement_id;
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'DRAFT', 'steps', to_jsonb(v_steps));
  END IF;

  UPDATE rfqs SET status = 'OPEN' WHERE id = v_rfq.id AND status = 'DRAFT';
  UPDATE requirements SET status = 'RFQ_CREATED'
  WHERE id = v_rfq.requirement_id AND status IN ('DRAFT', 'SUBMITTED');

  IF v_rfq.evaluation_weights IS NULL OR v_rfq.evaluation_weights = '{}'::jsonb THEN
    v_weights := public.suggest_evaluation_weights(v_rfq.requirement_id);
    PERFORM public.set_rfq_evaluation_weights(v_rfq.id, v_weights, 'SUGGESTED');
    v_steps := v_steps || 'weights'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rfq_invitations WHERE rfq_id = v_rfq.id) THEN
    PERFORM public.discover_and_invite_for_rfq(
      v_rfq.id,
      v_sc.invite_limit,
      '{}'::uuid[],
      'OTP_REGISTERED'
    );
    v_steps := v_steps || 'invited'::text;
  END IF;

  IF v_sc.target_stage = 'SOURCING' THEN
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'SOURCING', 'steps', to_jsonb(v_steps));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM quotes WHERE rfq_id = v_rfq.id) THEN
    PERFORM public.demo_generate_quotes(v_rfq.id, NULL, 'FINAL');
    v_steps := v_steps || 'quoted'::text;
  END IF;

  UPDATE requirements SET status = 'QUOTING'
  WHERE id = v_rfq.requirement_id AND status = 'RFQ_CREATED';

  IF v_sc.target_stage = 'QUOTING' THEN
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'QUOTING', 'steps', to_jsonb(v_steps));
  END IF;

  UPDATE rfqs SET status = 'EVALUATING' WHERE id = v_rfq.id AND status IN ('OPEN', 'CLARIFICATION');
  UPDATE requirements SET status = 'EVALUATION'
  WHERE id = v_rfq.requirement_id AND status IN ('RFQ_CREATED', 'QUOTING');

  PERFORM public.compute_quote_evaluations(v_rfq.id);
  v_steps := v_steps || 'scored'::text;

  PERFORM public.demo_generate_votes(v_rfq.id);
  v_steps := v_steps || 'voted'::text;

  IF v_sc.target_stage = 'EVALUATION' THEN
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'EVALUATION', 'steps', to_jsonb(v_steps));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM awards WHERE rfq_id = v_rfq.id) THEN
    SELECT t.quote_id INTO v_winner
    FROM rfq_vote_tally t
    WHERE t.rfq_id = v_rfq.id
    ORDER BY t.recommend_weight DESC, t.recommend_count DESC, t.anonymous_label
    LIMIT 1;

    IF v_winner IS NULL THEN
      SELECT q.id INTO v_winner
      FROM quotes q
      WHERE q.rfq_id = v_rfq.id AND q.status = 'FINAL'
      ORDER BY q.evaluation_score DESC NULLS LAST, q.id
      LIMIT 1;
    END IF;

    IF v_winner IS NULL THEN
      PERFORM set_config('otp.demo_staging', 'off', true);
      RETURN jsonb_build_object('scenario', p_code, 'stage', 'EVALUATION',
                                'steps', to_jsonb(v_steps), 'note', 'no quote to award');
    END IF;

    PERFORM public.lock_award(v_rfq.id, v_winner,
      'Highest weighted committee recommendation on the evaluation criteria set for this RFQ.');
    v_steps := v_steps || 'awarded'::text;
  END IF;

  IF v_sc.target_stage = 'AWARDED' THEN
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'AWARDED', 'steps', to_jsonb(v_steps));
  END IF;

  v_result := public.reveal_award(v_rfq.id);
  v_steps := v_steps || 'revealed'::text;

  PERFORM set_config('otp.demo_staging', 'off', true);

  RETURN jsonb_build_object('scenario', p_code, 'stage', 'REVEALED',
                            'steps', to_jsonb(v_steps), 'reveal', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_stage_scenario(text) TO authenticated;

COMMIT;

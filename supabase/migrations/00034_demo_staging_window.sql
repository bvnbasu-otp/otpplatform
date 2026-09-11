-- Let a demo account actually reset the demo.
--
-- demo_reset already permits any demo account, or a platform admin, to rebuild
-- the demo. Restaging then calls the real product functions — discovery,
-- weight setting, scoring, award lock, reveal — and each of those quite rightly
-- refuses anyone who is not a member of the buying organization. So a presenter
-- signed in as the Sunrise secretary could reset Sunrise's scenario and nothing
-- else: the transaction aborted on the first Kovai scenario with "Access
-- denied". The button promised something it could not deliver.
--
-- The fix is a narrow, transaction-local staging window rather than a looser
-- membership rule. Inside demo_stage_scenario, and only there, a demo account
-- is treated as a member of the DEMO organization being staged. Every clause
-- below has to hold:
--
--   * the window is open, and it is set with set_config(..., true) so it dies
--     with the transaction and cannot be left on;
--   * demo mode is enabled, so a production install is inert here;
--   * the organization is tagged is_demo, so a real tenant is never in scope;
--   * the caller is a demo account or a platform admin — the same test
--     demo_reset already applies.
--
-- The window therefore grants nothing that a demo account did not already have
-- through demo_reset itself, and it grants it for the length of one staging
-- call.

CREATE OR REPLACE FUNCTION private.demo_staging_for(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on'
     AND private.demo_mode_enabled()
     AND EXISTS (
       SELECT 1 FROM organizations o WHERE o.id = p_org_id AND o.is_demo
     )
     AND (
       private.is_platform_admin()
       OR EXISTS (
         SELECT 1 FROM profiles p
         WHERE p.id = private.get_profile_id() AND p.is_demo
       )
     );
$$;

COMMENT ON FUNCTION private.demo_staging_for(uuid) IS
  'True only inside demo_stage_scenario, only while demo mode is on, only for a demo organization, and only for a demo account or platform admin.';

GRANT EXECUTE ON FUNCTION private.demo_staging_for(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The two membership helpers honour the window
--
-- Changing these two rather than each staged operation means the rule is stated
-- once. Both already fell back to is_platform_admin(), so admitting a second,
-- much narrower elevation keeps the shape they had.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = p_org_id
      AND om.profile_id = private.get_profile_id()
  )
  OR private.is_platform_admin()
  OR private.demo_staging_for(p_org_id);
$$;

CREATE OR REPLACE FUNCTION private.is_org_manager_or_above(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.get_org_role(p_org_id) IN ('OWNER', 'MANAGER')
    OR private.is_platform_admin()
    OR private.demo_staging_for(p_org_id);
$$;

-- ---------------------------------------------------------------------------
-- Open the window around staging, and close it again
--
-- Replaces 00026's definition with the same body plus the window. Committee
-- access is granted the same way for the duration, because compute and vote
-- generation read through can_access_rfq_as_committee.
-- ---------------------------------------------------------------------------

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

  -- Transaction-local: it cannot outlive this call.
  PERFORM set_config('otp.demo_staging', 'on', true);

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_sc.rfq_id;

  IF v_sc.target_stage = 'DRAFT' THEN
    UPDATE rfqs SET status = 'DRAFT' WHERE id = v_rfq.id;
    UPDATE requirements SET status = 'DRAFT' WHERE id = v_rfq.requirement_id;
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'DRAFT', 'steps', to_jsonb(v_steps));
  END IF;

  -- SOURCING and beyond: the RFQ is open and suppliers have been found.
  UPDATE rfqs SET status = 'OPEN' WHERE id = v_rfq.id AND status = 'DRAFT';
  UPDATE requirements SET status = 'RFQ_CREATED'
  WHERE id = v_rfq.requirement_id AND status IN ('DRAFT', 'SUBMITTED');

  -- Criteria are chosen when the RFQ is published, not after the bids are in.
  IF v_rfq.evaluation_weights IS NULL OR v_rfq.evaluation_weights = '{}'::jsonb THEN
    v_weights := public.suggest_evaluation_weights(v_rfq.requirement_id);
    PERFORM public.set_rfq_evaluation_weights(v_rfq.id, v_weights, 'SUGGESTED');
    v_steps := v_steps || 'weights'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rfq_invitations WHERE rfq_id = v_rfq.id) THEN
    PERFORM public.discover_and_invite_for_rfq(v_rfq.id, v_sc.invite_limit);
    v_steps := v_steps || 'invited'::text;
  END IF;

  IF v_sc.target_stage = 'SOURCING' THEN
    PERFORM set_config('otp.demo_staging', 'off', true);
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'SOURCING', 'steps', to_jsonb(v_steps));
  END IF;

  -- QUOTING and beyond: bids are in.
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

  -- EVALUATION and beyond: scores computed, committee has voted.
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

  -- AWARDED and beyond: the committee's front-runner is locked in, still blind.
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

  -- REVEALED: identities disclosed.
  v_result := public.reveal_award(v_rfq.id);
  v_steps := v_steps || 'revealed'::text;

  PERFORM set_config('otp.demo_staging', 'off', true);

  RETURN jsonb_build_object('scenario', p_code, 'stage', 'REVEALED',
                            'steps', to_jsonb(v_steps), 'reveal', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_stage_scenario(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Committee access during staging
--
-- demo_generate_votes and compute_quote_evaluations read committee membership,
-- not just organization membership. The same window applies, for the same
-- reasons and under the same four conditions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_access_rfq_as_committee(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM committee_assignments ca
      WHERE ca.rfq_id = p_rfq_id
        AND ca.profile_id = private.get_profile_id()
    )
    AND private.is_org_member(private.rfq_org_id(p_rfq_id))
  )
  OR private.demo_staging_for(private.rfq_org_id(p_rfq_id));
$$;

-- 00069_governance_no_fault_exits_and_runner_up_award.sql
-- Protected No-Fault Exits, Pre-Reveal Unlock, and 1-Click Runner-Up Auto-Award

-- 1. Updated Protected Buyer Reliability Scoring Algorithm
CREATE OR REPLACE FUNCTION private.recalculate_buyer_reliability_score(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_rfqs int;
  v_completed_pos int;
  v_penalized_cancels int;
  v_score int := 100;
  v_tier text := 'VERIFIED_PRIME';
BEGIN
  -- Total non-draft RFQs
  SELECT count(*)::int INTO v_total_rfqs
  FROM rfqs WHERE organization_id = p_org_id AND status <> 'DRAFT';

  -- Completed POs
  SELECT count(*)::int INTO v_completed_pos
  FROM purchase_orders po
  JOIN rfqs r ON r.id = po.rfq_id
  WHERE r.organization_id = p_org_id AND po.status = 'COMPLETED';

  -- Count ONLY penalized / bad-faith cancellations:
  -- Exclude NO-FAULT reasons:
  --  • SUPPLIER_UNRESPONSIVE_POST_REVEAL (Supplier fault)
  --  • SUPPLIER_FAILED_SITE_INSPECTION (Supplier fault)
  --  • PRICING_EXCEEDED_BUDGET_CEILING (Legitimate tender outcome)
  --  • Any Pre-Reveal cancellation (zero leakage possible)
  SELECT count(*)::int INTO v_penalized_cancels
  FROM rfq_cancellations rc
  JOIN rfqs r ON r.id = rc.rfq_id
  WHERE r.organization_id = p_org_id
    AND rc.stage = 'POST_REVEAL_PRE_PO'
    AND rc.reason_code NOT IN (
      'SUPPLIER_UNRESPONSIVE_POST_REVEAL',
      'SUPPLIER_FAILED_SITE_INSPECTION',
      'PRICING_EXCEEDED_BUDGET_CEILING'
    )
    AND rc.is_suspicious = true;

  IF v_total_rfqs > 0 THEN
    -- Formula: High base (85%) + Active Fulfillment Bonus (15%) - Fault Penalty
    -- Honest buyers with genuine requirements easily maintain 90-100% (Verified Prime)
    v_score := round(
      85 +
      (LEAST(v_completed_pos::numeric / GREATEST(v_total_rfqs, 1), 1.0) * 15) -
      (v_penalized_cancels * 20)
    )::int;
  ELSE
    v_score := 100; -- New buyer baseline
  END IF;

  v_score := GREATEST(LEAST(v_score, 100), 0);

  IF v_score >= 90 THEN
    v_tier := 'VERIFIED_PRIME';
  ELSIF v_score >= 75 THEN
    v_tier := 'ACTIVE_RELIABLE';
  ELSIF v_score >= 50 THEN
    v_tier := 'NEEDS_IMPROVEMENT';
  ELSE
    v_tier := 'HIGH_RISK_AUDIT';
  END IF;

  UPDATE public.organizations
  SET
    reliability_score = v_score,
    reliability_tier = v_tier,
    total_rfqs_launched = v_total_rfqs,
    completed_pos_count = v_completed_pos,
    post_reveal_cancels_count = v_penalized_cancels,
    updated_at = now()
  WHERE id = p_org_id;
END;
$$;

-- 2. Pre-Reveal Unlock / Revise Selection RPC (Zero Penalty)
CREATE OR REPLACE FUNCTION public.unlock_award_decision(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can unlock the award decision';
  END IF;

  -- Security Check: Can ONLY unlock if still BLIND (pre-reveal)
  IF v_rfq.reveal_status = 'REVEALED' THEN
    RAISE EXCEPTION 'Cannot unlock an award once supplier identity has been unmasked. Use Cancel Award instead.';
  END IF;

  -- Delete award and return RFQ to EVALUATING
  DELETE FROM awards WHERE rfq_id = p_rfq_id;

  UPDATE quotes
  SET status = 'FINAL', updated_at = now()
  WHERE rfq_id = p_rfq_id AND status IN ('SELECTED', 'NOT_SELECTED');

  UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'EVALUATION', updated_at = now() WHERE id = v_rfq.requirement_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.unlocked',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'reason', 'Buyer committee requested decision revision prior to unmasking')
  );

  RETURN jsonb_build_object('success', true, 'status', 'EVALUATING');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_award_decision(uuid) TO authenticated, service_role;

-- 3. 1-Click Auto-Award to Runner-Up Quote RPC
CREATE OR REPLACE FUNCTION public.award_runner_up_quote(
  p_rfq_id uuid,
  p_reason text DEFAULT 'Previous winning supplier was unresponsive or failed inspection'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_prev_award awards%ROWTYPE;
  v_runner_up_id uuid;
  v_runner_up_price numeric;
  v_now timestamptz := now();
  v_new_award_id uuid;
  v_alias text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can award runner-up quote';
  END IF;

  SELECT * INTO v_prev_award FROM awards WHERE rfq_id = p_rfq_id;

  -- 1. Disqualify previous winning quote
  IF v_prev_award.quote_id IS NOT NULL THEN
    UPDATE quotes
    SET status = 'WITHDRAWN', updated_at = v_now
    WHERE id = v_prev_award.quote_id;

    -- Clean up any draft PO
    DELETE FROM purchase_orders WHERE rfq_id = p_rfq_id AND status = 'DRAFT';
  END IF;

  -- 2. Find Runner-Up Quote (lowest total cost or highest evaluation score)
  SELECT q.id, q.total_cost, ri.anonymous_label
  INTO v_runner_up_id, v_runner_up_price, v_alias
  FROM quotes q
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.rfq_id = p_rfq_id
    AND q.id <> COALESCE(v_prev_award.quote_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND q.status IN ('FINAL', 'NOT_SELECTED', 'SUBMITTED', 'REVISED')
  ORDER BY q.total_cost ASC
  LIMIT 1;

  IF v_runner_up_id IS NULL THEN
    RAISE EXCEPTION 'No eligible runner-up quote found for this RFQ';
  END IF;

  -- 3. Transition Runner-Up to SELECTED
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = v_runner_up_id;

  -- 4. Create New Award for Runner-Up
  DELETE FROM awards WHERE rfq_id = p_rfq_id;

  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at
  ) VALUES (
    p_rfq_id, v_runner_up_id, private.get_profile_id(),
    jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
    'LOCKED', v_now, v_now
  ) RETURNING id INTO v_new_award_id;

  -- 5. Reset RFQ reveal status to BLIND so buyer confirms intent before unmasking runner-up
  UPDATE rfqs SET status = 'AWARDED', reveal_status = 'BLIND', updated_at = v_now WHERE id = p_rfq_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.runner_up_selected',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_new_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'runner_up_quote_id', v_runner_up_id,
      'runner_up_alias', v_alias,
      'runner_up_price', v_runner_up_price,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'award_id', v_new_award_id,
    'runner_up_quote_id', v_runner_up_id,
    'runner_up_alias', v_alias,
    'total_cost', v_runner_up_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_runner_up_quote(uuid, text) TO authenticated, service_role;


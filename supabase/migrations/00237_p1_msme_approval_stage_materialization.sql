-- =============================================================================
-- 00237: P1-A — MSME multi-tier approval stages are actually persisted.
--
-- Before: evaluate_and_stamp_approval_route_atomic (00191) only wrote an
--   append-only route evaluation. Nothing ever inserted rfq_approval_stages, so
--   * the award / PO gate (COUNT(status <> 'APPROVED')) passed vacuously,
--   * submit_rfq_tier_approval_atomic failed with "Approval stage not found",
--   * AwardPage hid the tier UI because stages.length was always 0.
--
-- After: the same RPC (same name, same signature, same table) materialises the
--   ordered stages for the evaluated route inside the same transaction, using the
--   org policy tiers (organization_approval_policies.tiers) when one exists and the
--   existing 00191 thresholds (₹5L / ₹25L) otherwise. Stages are only written via
--   the internal flag introduced by 00219; direct client INSERT/UPDATE/DELETE of
--   stages stays blocked (DELETE is newly guarded because FOR ALL RLS allowed it).
--   Authorisation / sequencing / anti-self-approval / delegation / audit inside
--   submit_rfq_tier_approval_atomic (00219) are unchanged. The rejection overload
--   now enforces the same authority rules as approval.
--
-- No parallel approval system. No new tables.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Guard: also block direct DELETE of stages (RLS FOR ALL allowed it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_rfq_approval_stage_direct_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '')
     OR private.is_platform_admin()
     OR current_setting('otp.approval_stage_internal', true) = '1'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approver_profile_id IS DISTINCT FROM OLD.approver_profile_id
       OR NEW.digital_signature_hash IS DISTINCT FROM OLD.digital_signature_hash
       OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
       OR NEW.delegator_profile_id IS DISTINCT FROM OLD.delegator_profile_id
       OR NEW.signature_mode IS DISTINCT FROM OLD.signature_mode THEN
      RAISE EXCEPTION 'RFQ approval stages must be updated via submit_rfq_tier_approval_atomic (APPROVAL-STAGE-DIRECT-WRITE)';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'RFQ approval stages cannot be created via direct client write (APPROVAL-STAGE-DIRECT-WRITE)';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RFQ approval stages cannot be deleted via direct client write (APPROVAL-STAGE-DIRECT-WRITE)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_rfq_approval_stage_direct_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_rfq_approval_stage_write ON public.rfq_approval_stages;
CREATE TRIGGER trg_guard_rfq_approval_stage_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.rfq_approval_stages
  FOR EACH ROW EXECUTE FUNCTION private.guard_rfq_approval_stage_direct_write();

-- ---------------------------------------------------------------------------
-- 2. Route computation (single source for the evaluator and the award guard).
--    Defaults == 00191 thresholds. Policy tiers (if an active policy exists)
--    override the TIER_2 / TIER_3 minimum amounts.
--    TIER_2 applies when amount >= t2_min ; TIER_3 applies when amount > t3_min
--    (identical boundary semantics to 00191).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.approval_route_for_amount(p_org_id uuid, p_amount numeric)
RETURNS TABLE (
  required_tiers  text[],
  required_level  text,
  t2_min          numeric,
  t3_min          numeric,
  policy_id       uuid,
  policy_version  integer,
  policy_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_policy public.organization_approval_policies%ROWTYPE;
  v_t2 numeric := 500000;
  v_t3 numeric := 2500000;
  v_x  numeric;
BEGIN
  SELECT * INTO v_policy FROM public.organization_approval_policies
  WHERE organization_id = p_org_id AND is_active = true;

  IF FOUND AND jsonb_typeof(v_policy.tiers) = 'array' THEN
    SELECT (t->>'minAmount')::numeric INTO v_x
    FROM jsonb_array_elements(v_policy.tiers) t WHERE t->>'tierLevel' = 'TIER_2_DEPT_HEAD' LIMIT 1;
    IF v_x IS NOT NULL AND v_x > 0 THEN v_t2 := v_x; END IF;
    v_x := NULL;
    SELECT (t->>'minAmount')::numeric INTO v_x
    FROM jsonb_array_elements(v_policy.tiers) t WHERE t->>'tierLevel' = 'TIER_3_EXECUTIVE' LIMIT 1;
    IF v_x IS NOT NULL AND v_x >= v_t2 THEN v_t3 := v_x; END IF;
  END IF;

  t2_min := v_t2;
  t3_min := v_t3;
  IF p_amount > v_t3 THEN
    required_tiers := ARRAY['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE']::text[];
    required_level := 'TIER_3_EXECUTIVE';
  ELSIF p_amount >= v_t2 THEN
    required_tiers := ARRAY['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']::text[];
    required_level := 'TIER_2_DEPT_HEAD';
  ELSE
    required_tiers := ARRAY['TIER_1_MANAGER']::text[];
    required_level := 'TIER_1_MANAGER';
  END IF;
  policy_id := v_policy.id;
  policy_version := COALESCE(v_policy.version, 1);
  policy_snapshot := COALESCE(to_jsonb(v_policy), '{"policyName": "Standard Enterprise Matrix"}'::jsonb);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.approval_route_for_amount(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- Member roles that may sign each tier directly (mirrors submit_rfq_tier_approval_atomic, 00219).
CREATE OR REPLACE FUNCTION private.tier_direct_roles(p_tier text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'TIER_1_MANAGER'    THEN ARRAY['BUYER', 'MANAGER', 'APPROVER', 'OWNER']
    WHEN 'TIER_2_DEPT_HEAD'  THEN ARRAY['MANAGER', 'APPROVER', 'OWNER']
    WHEN 'TIER_3_EXECUTIVE'  THEN ARRAY['OWNER']
    ELSE ARRAY[]::text[]
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3. evaluate_and_stamp_approval_route_atomic — now persists stages.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_and_stamp_approval_route_atomic(
  p_rfq_id uuid,
  p_procurement_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq            public.rfqs%ROWTYPE;
  v_org            public.organizations%ROWTYPE;
  v_caller_id      uuid;
  v_route          record;
  v_is_exec        boolean;
  v_reason         text;
  v_eval_id        uuid;
  v_existing       integer := 0;
  v_pending        integer := 0;
  v_existing_tiers text[];
  v_applicable     boolean := false;
  v_satisfiable    boolean := true;
  v_tier           text;
  v_idx            integer;
  v_min            numeric;
  v_max            numeric;
  v_amount_ok      boolean;
  v_stage_amount   numeric;
  v_materialized   boolean := false;
  v_stages         jsonb;
BEGIN
  v_caller_id := private.get_profile_id();
  IF v_caller_id IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthenticated caller';
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found', p_rfq_id;
  END IF;

  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR private.is_org_member(v_rfq.organization_id)) THEN
    RAISE EXCEPTION 'Cross-tenant violation: caller does not belong to RFQ organization (APPROVAL-ROUTE-UNAUTHORIZED)';
  END IF;

  IF p_procurement_amount IS NULL OR p_procurement_amount < 0 THEN
    RAISE EXCEPTION 'Procurement amount must be a non-negative number';
  END IF;

  -- The amount is not trusted from the client: it must be the total of a live quote on this RFQ,
  -- otherwise a caller could stamp a tiny amount and dodge the higher tiers.
  SELECT EXISTS (
    SELECT 1
    FROM public.quotes q
    JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
    WHERE q.rfq_id = p_rfq_id
      AND q.status NOT IN ('DRAFT', 'WITHDRAWN')
      AND abs(COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, -1) - p_procurement_amount) < 0.01
  ) INTO v_amount_ok;
  IF NOT v_amount_ok AND COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Procurement amount does not match any live quote on this RFQ (APPROVAL-ROUTE-AMOUNT)';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_rfq.organization_id;

  SELECT * INTO v_route FROM private.approval_route_for_amount(v_rfq.organization_id, p_procurement_amount);
  v_is_exec := (v_route.required_level = 'TIER_3_EXECUTIVE');
  v_reason := CASE v_route.required_level
    WHEN 'TIER_3_EXECUTIVE' THEN 'Procurement amount > ₹25L routes to Tier 3 Executive Gate.'
    WHEN 'TIER_2_DEPT_HEAD' THEN 'Procurement amount ₹5L - ₹25L routes to Tier 2 Department Head.'
    ELSE 'Procurement amount < ₹5L routes to Tier 1 Procurement Manager.'
  END;

  -- Multi-tier governance applies to organisations that approve through spend tiers
  -- (not single-buyer INDIVIDUAL or committee-governed COMMUNITY). A tier chain is
  -- required when an active org policy exists or the amount reaches Tier 2.
  v_applicable := v_org.org_type NOT IN ('INDIVIDUAL', 'COMMUNITY')
    AND (v_route.policy_id IS NOT NULL OR p_procurement_amount >= v_route.t2_min);

  -- Anti-deadlock: every required tier needs at least one eligible approver who is not
  -- the RFQ creator (anti-self-approval). Otherwise the chain could never be satisfied.
  IF v_applicable THEN
    FOREACH v_tier IN ARRAY v_route.required_tiers LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_rfq.organization_id
          AND om.profile_id IS DISTINCT FROM v_rfq.created_by
          AND om.role::text = ANY (private.tier_direct_roles(v_tier))
      ) THEN
        v_satisfiable := false;
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'PENDING'), array_agg(tier_level ORDER BY stage_order)
  INTO v_existing, v_pending, v_existing_tiers
  FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id;

  -- Append-only evaluation record (skipped when an identical evaluation is already the latest).
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT procurement_amount, required_tier_levels
      FROM public.rfq_approval_route_evaluations WHERE rfq_id = p_rfq_id
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) last_eval
    WHERE last_eval.procurement_amount = p_procurement_amount
      AND last_eval.required_tier_levels = v_route.required_tiers
  ) THEN
    INSERT INTO public.rfq_approval_route_evaluations (
      rfq_id, organization_id, procurement_amount, required_approval_level, required_tier_levels,
      required_approvers_count, is_executive_gate, is_delegation_allowed, is_voting_required,
      is_quorum_required, policy_version, policy_snapshot, evaluation_reason, evaluated_by
    ) VALUES (
      p_rfq_id, v_rfq.organization_id, p_procurement_amount, v_route.required_level, v_route.required_tiers,
      CASE WHEN p_procurement_amount >= 5000000 THEN 2 ELSE 1 END,
      v_is_exec, NOT v_is_exec, true, true,
      v_route.policy_version, v_route.policy_snapshot, v_reason, v_caller_id
    ) RETURNING id INTO v_eval_id;
  ELSE
    SELECT id INTO v_eval_id FROM public.rfq_approval_route_evaluations
    WHERE rfq_id = p_rfq_id ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;

  IF v_applicable AND v_satisfiable THEN
    PERFORM set_config('otp.approval_stage_internal', '1', true);

    IF v_existing > 0 AND v_pending = v_existing
       AND (v_existing_tiers IS DISTINCT FROM v_route.required_tiers
            OR EXISTS (SELECT 1 FROM public.rfq_approval_stages
                       WHERE rfq_id = p_rfq_id AND procurement_amount IS DISTINCT FROM p_procurement_amount)) THEN
      -- Nothing has been signed yet: safely re-derive the chain for the new route/amount.
      DELETE FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id;
      v_existing := 0;
    END IF;

    v_idx := 0;
    FOREACH v_tier IN ARRAY v_route.required_tiers LOOP
      v_idx := v_idx + 1;
      IF v_idx > v_existing THEN
        v_min := CASE v_tier WHEN 'TIER_1_MANAGER' THEN 0 WHEN 'TIER_2_DEPT_HEAD' THEN v_route.t2_min ELSE v_route.t3_min END;
        v_max := CASE v_tier WHEN 'TIER_1_MANAGER' THEN v_route.t2_min WHEN 'TIER_2_DEPT_HEAD' THEN v_route.t3_min ELSE NULL END;
        INSERT INTO public.rfq_approval_stages (
          rfq_id, organization_id, tier_level, stage_order, status,
          threshold_min_amount, threshold_max_amount, procurement_amount
        ) VALUES (
          p_rfq_id, v_rfq.organization_id, v_tier, v_idx, 'PENDING',
          v_min, v_max, p_procurement_amount
        );
        v_materialized := true;
      END IF;
    END LOOP;

    IF v_materialized THEN
      INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
      VALUES ('rfq.approval_route_materialized', v_caller_id, v_rfq.organization_id, 'rfq', p_rfq_id::text,
        jsonb_build_object('evaluation_id', v_eval_id, 'procurement_amount', p_procurement_amount,
          'required_tiers', to_jsonb(v_route.required_tiers), 'policy_id', v_route.policy_id));
    END IF;
  ELSIF v_applicable AND NOT v_satisfiable THEN
    INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
    VALUES ('rfq.approval_route_unsatisfiable', v_caller_id, v_rfq.organization_id, 'rfq', p_rfq_id::text,
      jsonb_build_object('evaluation_id', v_eval_id, 'procurement_amount', p_procurement_amount,
        'required_tiers', to_jsonb(v_route.required_tiers),
        'reason', 'NO_ELIGIBLE_APPROVER_DISTINCT_FROM_RFQ_CREATOR'));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stageId', s.id, 'tierLevel', s.tier_level, 'stageOrder', s.stage_order, 'status', s.status,
      'thresholdMinAmount', s.threshold_min_amount, 'thresholdMaxAmount', s.threshold_max_amount
    ) ORDER BY s.stage_order), '[]'::jsonb)
  INTO v_stages FROM public.rfq_approval_stages s WHERE s.rfq_id = p_rfq_id;

  RETURN jsonb_build_object(
    'success', true,
    'evaluationId', v_eval_id,
    'requiredApprovalLevel', v_route.required_level,
    'requiredTierLevels', v_route.required_tiers,
    'isExecutiveGate', v_is_exec,
    'isDelegationAllowed', NOT v_is_exec,
    'evaluationReason', v_reason,
    'approvalRequired', v_applicable,
    'routeSatisfiable', v_satisfiable,
    'stagesMaterialized', jsonb_array_length(v_stages) > 0,
    'stages', v_stages
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_and_stamp_approval_route_atomic(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_and_stamp_approval_route_atomic(uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Rejection overload: same authority rules as approval (was unauthenticated
--    for any caller who could name an RFQ + stage order).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rfq_tier_approval_atomic(
  p_rfq_id        uuid,
  p_stage_order   integer,
  p_decision      text,
  p_comments      text DEFAULT NULL,
  p_signature_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_stage       public.rfq_approval_stages%ROWTYPE;
  v_rfq         public.rfqs%ROWTYPE;
  v_caller_id   uuid;
  v_caller_role text;
  v_is_admin    boolean := false;
BEGIN
  SELECT * INTO v_stage FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order = p_stage_order;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage order % not found for RFQ %.', p_stage_order, p_rfq_id;
  END IF;
  IF p_decision = 'APPROVED' THEN
    RETURN public.submit_rfq_tier_approval_atomic(p_rfq_id, v_stage.tier_level, p_comments, NULL);
  END IF;

  v_caller_id := private.get_profile_id();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated caller.'; END IF;
  v_is_admin := private.is_platform_admin();
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT v_is_admin AND NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Cross-tenant violation: Caller does not belong to RFQ organization %.', v_rfq.organization_id;
  END IF;
  IF v_rfq.created_by = v_caller_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Anti-bypass policy violation: Procurement creator cannot decide their own RFQ approval.';
  END IF;
  v_caller_role := COALESCE(private.get_org_role(v_rfq.organization_id)::text, 'COMMITTEE_MEMBER');
  IF NOT (v_is_admin OR v_caller_role = ANY (private.tier_direct_roles(v_stage.tier_level))) THEN
    RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for % decision.', v_caller_role, v_stage.tier_level;
  END IF;
  IF v_stage.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Stage % is not in PENDING state (current: %).', v_stage.tier_level, v_stage.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rfq_approval_stages
             WHERE rfq_id = p_rfq_id AND stage_order < v_stage.stage_order AND status <> 'APPROVED') THEN
    RAISE EXCEPTION 'Sequential governance violation: Prior approval stage(s) are not yet approved.';
  END IF;

  PERFORM set_config('otp.approval_stage_internal', '1', true);
  UPDATE public.rfq_approval_stages SET
    status = 'REJECTED', approver_profile_id = v_caller_id, approver_role = v_caller_role,
    approver_comments = p_comments, notes = p_comments, rejected_at = now(), updated_at = now()
  WHERE id = v_stage.id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('rfq.tier_rejected', v_caller_id, v_rfq.organization_id, 'rfq_approval_stage', v_stage.id::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'tier_level', v_stage.tier_level, 'stage_order', v_stage.stage_order));

  RETURN jsonb_build_object('ok', true, 'stageId', v_stage.id, 'rfqId', p_rfq_id,
    'tierLevel', v_stage.tier_level, 'stageOrder', p_stage_order, 'status', 'REJECTED');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, integer, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Award write-boundary guard: an evaluated chain must cover the awarded quote.
--    (The pending-stage gate itself lives in lock_and_reveal_award_atomic /
--    create_purchase_order_from_award and is unchanged; with stages now persisted
--    it is no longer vacuous.) This closes "evaluate at a low quote, award a high one".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_award_covers_approval_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_org_id   uuid;
  v_stages   integer;
  v_pending  integer;
  v_total    numeric;
  v_required integer;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status <> 'APPROVED')
  INTO v_stages, v_pending
  FROM public.rfq_approval_stages WHERE rfq_id = NEW.rfq_id;

  IF v_stages = 0 THEN
    RETURN NEW;
  END IF;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction. (APPROVAL-GATE)';
  END IF;

  SELECT r.organization_id INTO v_org_id FROM public.rfqs r WHERE r.id = NEW.rfq_id;
  SELECT COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0)
  INTO v_total
  FROM public.quotes q
  JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE q.id = NEW.quote_id;

  SELECT array_length(required_tiers, 1) INTO v_required
  FROM private.approval_route_for_amount(v_org_id, COALESCE(v_total, 0));

  IF COALESCE(v_required, 1) > v_stages THEN
    RAISE EXCEPTION 'Awarded quote requires % approval tier(s) but only % were evaluated; re-evaluate the approval route. (APPROVAL-ROUTE-STALE)',
      v_required, v_stages;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_award_covers_approval_route() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_award_covers_approval_route ON public.awards;
CREATE TRIGGER trg_guard_award_covers_approval_route
  BEFORE INSERT ON public.awards
  FOR EACH ROW EXECUTE FUNCTION private.guard_award_covers_approval_route();

COMMIT;

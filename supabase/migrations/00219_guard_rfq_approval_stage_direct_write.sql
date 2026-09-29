-- 00219: Block direct PostgREST mutation of rfq_approval_stages; allow RPC via session flag.

BEGIN;

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
  ELSIF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'RFQ approval stages cannot be created via direct client write (APPROVAL-STAGE-DIRECT-WRITE)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_rfq_approval_stage_direct_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_rfq_approval_stage_write ON public.rfq_approval_stages;
CREATE TRIGGER trg_guard_rfq_approval_stage_write
  BEFORE INSERT OR UPDATE ON public.rfq_approval_stages
  FOR EACH ROW EXECUTE FUNCTION private.guard_rfq_approval_stage_direct_write();

-- Patch approval RPCs to set the internal write flag for stage UPDATEs.
CREATE OR REPLACE FUNCTION public.submit_rfq_tier_approval_atomic(
  p_rfq_id        uuid,
  p_tier_level    text,
  p_notes         text DEFAULT NULL,
  p_delegation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller_id          uuid;
  v_is_admin           boolean := false;
  v_rfq                public.rfqs%ROWTYPE;
  v_caller_role        text;
  v_policy             public.organization_approval_policies%ROWTYPE;
  v_route_eval         public.rfq_approval_route_evaluations%ROWTYPE;
  v_stage              public.rfq_approval_stages%ROWTYPE;
  v_prior_pending      integer := 0;
  v_sig_mode           text := 'DIRECT';
  v_delegation         public.organization_delegations%ROWTYPE;
  v_delegator_role     text;
  v_delegator_id       uuid := NULL;
  v_all_approved       boolean := false;
  v_now                timestamptz := now();
  v_required_perm      text;
  v_sig_hash           text;
BEGIN
  v_caller_id := private.get_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller.';
  END IF;

  v_is_admin := private.is_platform_admin();

  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found.', p_rfq_id;
  END IF;

  IF NOT v_is_admin THEN
    IF NOT private.is_org_member(v_rfq.organization_id) THEN
      RAISE EXCEPTION 'Cross-tenant violation: Caller does not belong to RFQ organization %.', v_rfq.organization_id;
    END IF;
  END IF;

  IF (v_rfq.created_by = v_caller_id) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Anti-bypass policy violation: Procurement creator cannot approve their own RFQ.';
  END IF;

  SELECT * INTO v_stage FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND tier_level = p_tier_level FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage % not found for RFQ %.', p_tier_level, p_rfq_id;
  END IF;

  IF v_stage.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Stage % is already APPROVED (replay prevented).', p_tier_level;
  END IF;
  IF v_stage.status != 'PENDING' THEN
    RAISE EXCEPTION 'Stage % is not in PENDING state (current: %).', p_tier_level, v_stage.status;
  END IF;

  SELECT COUNT(*) INTO v_prior_pending FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order < v_stage.stage_order AND status != 'APPROVED';
  IF v_prior_pending > 0 THEN
    RAISE EXCEPTION 'Sequential governance violation: Prior approval stage(s) are not yet approved.';
  END IF;

  v_caller_role := COALESCE(private.get_org_role(v_rfq.organization_id)::text, 'COMMITTEE_MEMBER');

  IF p_delegation_id IS NOT NULL THEN
    v_sig_mode := 'DELEGATED';
    SELECT * INTO v_delegation FROM public.organization_delegations WHERE id = p_delegation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Delegation proxy % not found.', p_delegation_id; END IF;
    IF v_delegation.organization_id != v_rfq.organization_id THEN
      RAISE EXCEPTION 'Delegation organization does not match RFQ organization.';
    END IF;
    IF v_delegation.delegatee_id != v_caller_id THEN
      RAISE EXCEPTION 'Delegation proxy delegatee does not match authenticated caller.';
    END IF;
    IF v_delegation.delegator_id = v_delegation.delegatee_id THEN
      RAISE EXCEPTION 'Self-delegation is prohibited.';
    END IF;
    IF v_delegation.delegator_id = v_rfq.created_by THEN
      RAISE EXCEPTION 'Anti-bypass policy violation: RFQ creator cannot delegate authority to approve their own RFQ.';
    END IF;
    IF NOT v_delegation.is_active OR v_delegation.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Delegation proxy is inactive or revoked.';
    END IF;
    IF v_now < v_delegation.starts_at THEN
      RAISE EXCEPTION 'Delegation proxy validity period has not started yet (starts at %).', v_delegation.starts_at;
    END IF;
    IF v_now > v_delegation.expires_at THEN
      RAISE EXCEPTION 'Delegation proxy has expired (expired at %).', v_delegation.expires_at;
    END IF;
    IF v_delegation.spend_cap_amount IS NOT NULL AND v_stage.procurement_amount > v_delegation.spend_cap_amount THEN
      RAISE EXCEPTION 'Delegation spend cap exceeded: RFQ amount ₹% exceeds spend cap ₹%.', v_stage.procurement_amount, v_delegation.spend_cap_amount;
    END IF;
    v_required_perm := CASE p_tier_level
      WHEN 'TIER_1_MANAGER' THEN 'APPROVE_TIER_1'
      WHEN 'TIER_2_DEPT_HEAD' THEN 'APPROVE_TIER_2'
      WHEN 'TIER_3_EXECUTIVE' THEN 'APPROVE_TIER_3'
      ELSE 'APPROVE_TIER_1'
    END;
    IF NOT (v_required_perm = ANY(v_delegation.permissions)) THEN
      RAISE EXCEPTION 'Delegation proxy does not grant permission % for tier %.', v_required_perm, p_tier_level;
    END IF;
    IF p_tier_level = 'TIER_3_EXECUTIVE' THEN
      IF NOT (v_caller_role IN ('OWNER', 'DIRECTOR', 'EXECUTIVE', 'CFO') OR v_is_admin) THEN
        RAISE EXCEPTION 'Tier 3 Executive Gate (>₹25L) cannot be delegated to non-executive personnel.';
      END IF;
    END IF;
    v_delegator_id := v_delegation.delegator_id;
  ELSE
    v_sig_mode := 'DIRECT';
    IF p_tier_level = 'TIER_1_MANAGER' THEN
      IF NOT (v_caller_role IN ('BUYER', 'MANAGER', 'APPROVER', 'OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 1 approval.', v_caller_role;
      END IF;
    ELSIF p_tier_level = 'TIER_2_DEPT_HEAD' THEN
      IF NOT (v_caller_role IN ('MANAGER', 'APPROVER', 'OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 2 approval.', v_caller_role;
      END IF;
    ELSIF p_tier_level = 'TIER_3_EXECUTIVE' THEN
      IF NOT (v_caller_role IN ('OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 3 Executive sign-off.', v_caller_role;
      END IF;
    END IF;
  END IF;

  v_sig_hash := encode(digest(p_rfq_id::text || ':' || p_tier_level || ':' || v_caller_id::text || ':' || v_now::text, 'sha256'), 'hex');

  PERFORM set_config('otp.approval_stage_internal', '1', true);
  UPDATE public.rfq_approval_stages SET
    status = 'APPROVED', approver_profile_id = v_caller_id, approver_role = v_caller_role,
    approver_comments = p_notes, notes = p_notes, delegation_id = p_delegation_id,
    delegator_profile_id = v_delegator_id, signature_mode = v_sig_mode,
    digital_signature_hash = v_sig_hash, approved_at = v_now, updated_at = v_now
  WHERE id = v_stage.id;

  SELECT bool_and(status = 'APPROVED') INTO v_all_approved FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('rfq.tier_approved', v_caller_id, v_rfq.organization_id, 'rfq_approval_stage', v_stage.id::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'tier_level', p_tier_level, 'stage_order', v_stage.stage_order,
      'signature_mode', v_sig_mode, 'delegation_id', p_delegation_id, 'delegator_profile_id', v_delegator_id,
      'procurement_amount', v_stage.procurement_amount, 'all_stages_approved', v_all_approved, 'approved_at', v_now));

  RETURN jsonb_build_object('ok', true, 'stageId', v_stage.id, 'rfqId', p_rfq_id, 'tierLevel', p_tier_level,
    'stageOrder', v_stage.stage_order, 'status', 'APPROVED', 'signatureMode', v_sig_mode,
    'approverProfileId', v_caller_id, 'delegationId', p_delegation_id, 'delegatorProfileId', v_delegator_id,
    'digitalSignatureHash', v_sig_hash, 'allStagesApproved', v_all_approved);
END;
$$;

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
  v_stage public.rfq_approval_stages%ROWTYPE;
BEGIN
  SELECT * INTO v_stage FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order = p_stage_order;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage order % not found for RFQ %.', p_stage_order, p_rfq_id;
  END IF;
  IF p_decision = 'APPROVED' THEN
    RETURN public.submit_rfq_tier_approval_atomic(p_rfq_id, v_stage.tier_level, p_comments, NULL);
  ELSE
    PERFORM set_config('otp.approval_stage_internal', '1', true);
    UPDATE public.rfq_approval_stages SET
      status = 'REJECTED', approver_profile_id = private.get_profile_id(),
      approver_role = COALESCE(private.get_org_role(v_stage.organization_id)::text, 'APPROVER'),
      approver_comments = p_comments, notes = p_comments, rejected_at = now(), updated_at = now()
    WHERE id = v_stage.id;
    RETURN jsonb_build_object('ok', true, 'stageId', v_stage.id, 'rfqId', p_rfq_id,
      'tierLevel', v_stage.tier_level, 'stageOrder', p_stage_order, 'status', 'REJECTED');
  END IF;
END;
$$;

COMMIT;

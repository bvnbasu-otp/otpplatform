-- =============================================================================
-- Migration 00192: Phase C8.4 — Multi-Tier Spend Approval Orchestration &
-- Delegation Signoff Chain
--
-- Features:
--   1. Schema Enhancements on public.rfq_approval_stages:
--      - delegation_id (UUID REFERENCES public.organization_delegations(id) ON DELETE SET NULL)
--      - delegator_profile_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
--      - signature_mode (text DEFAULT 'DIRECT' CHECK (signature_mode IN ('DIRECT', 'DELEGATED')))
--      - notes (text)
--   2. Atomic Digital Sign-Off RPC (public.submit_rfq_tier_approval_atomic):
--      - Parameters: p_rfq_id uuid, p_tier_level text, p_notes text DEFAULT NULL, p_delegation_id uuid DEFAULT NULL
--      - SECURITY DEFINER, fixed search_path = public, private, auth, extensions
--      - Strict anti-self-approval enforcement (RFQ creator cannot approve directly or via proxy).
--      - Strict sequential progression (prior required stages must be APPROVED).
--      - Delegation validity (active, time-bounded, spend cap check, delegatee match, Tier 3 executive gate compliance).
--      - Replay prevention (stage must be PENDING).
--      - Immutable audit event generation in public.audit_events.
--   3. Hardened Award Locking & PO Issuance Gating:
--      - Updates public.lock_and_reveal_award_atomic & public.create_purchase_order_from_award.
--      - Fail-Closed: Blocks award locking and PO creation if required approval tiers are pending.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema Enhancements on public.rfq_approval_stages
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rfq_approval_stages' AND column_name = 'delegation_id'
  ) THEN
    ALTER TABLE public.rfq_approval_stages
      ADD COLUMN delegation_id uuid REFERENCES public.organization_delegations(id) ON DELETE SET NULL,
      ADD COLUMN delegator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN signature_mode text DEFAULT 'DIRECT' CHECK (signature_mode IN ('DIRECT', 'DELEGATED')),
      ADD COLUMN notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rfq_stages_delegation ON public.rfq_approval_stages(delegation_id);
CREATE INDEX IF NOT EXISTS idx_rfq_stages_delegator ON public.rfq_approval_stages(delegator_profile_id);
CREATE INDEX IF NOT EXISTS idx_rfq_stages_sig_mode ON public.rfq_approval_stages(signature_mode);

-- ---------------------------------------------------------------------------
-- 2. Atomic Digital Sign-Off RPC: submit_rfq_tier_approval_atomic
-- ---------------------------------------------------------------------------
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
  -- 1. Caller Authentication
  v_caller_id := COALESCE(auth.uid(), private.get_profile_id());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller.';
  END IF;

  v_is_admin := private.is_platform_admin();

  -- 2. Lock & Fetch RFQ
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found.', p_rfq_id;
  END IF;

  -- 3. Tenant Isolation Check
  IF NOT v_is_admin THEN
    IF NOT private.is_org_member(v_rfq.organization_id) THEN
      RAISE EXCEPTION 'Cross-tenant violation: Caller does not belong to RFQ organization %.', v_rfq.organization_id;
    END IF;
  END IF;

  -- 4. Anti-Self-Approval Check (Direct)
  IF (v_rfq.created_by = v_caller_id) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Anti-bypass policy violation: Procurement creator cannot approve their own RFQ.';
  END IF;

  -- 5. Lock & Fetch Target Stage
  SELECT * INTO v_stage
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND tier_level = p_tier_level
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage % not found for RFQ %.', p_tier_level, p_rfq_id;
  END IF;

  -- 6. No Replay Invariant: Stage must be PENDING
  IF v_stage.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Stage % is already APPROVED (replay prevented).', p_tier_level;
  END IF;

  IF v_stage.status != 'PENDING' THEN
    RAISE EXCEPTION 'Stage % is not in PENDING state (current: %).', p_tier_level, v_stage.status;
  END IF;

  -- 7. Sequential Progression Invariant: Prior stages must all be APPROVED
  SELECT COUNT(*) INTO v_prior_pending
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id
    AND stage_order < v_stage.stage_order
    AND status != 'APPROVED';

  IF v_prior_pending > 0 THEN
    RAISE EXCEPTION 'Sequential governance violation: Prior approval stage(s) are not yet approved.';
  END IF;

  -- Fetch caller base org role
  v_caller_role := COALESCE(private.get_org_role(v_rfq.organization_id)::text, 'COMMITTEE_MEMBER');

  -- 8. Authority & Delegation Validation
  IF p_delegation_id IS NOT NULL THEN
    v_sig_mode := 'DELEGATED';

    SELECT * INTO v_delegation
    FROM public.organization_delegations
    WHERE id = p_delegation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delegation proxy % not found.', p_delegation_id;
    END IF;

    -- Delegation Org Match
    IF v_delegation.organization_id != v_rfq.organization_id THEN
      RAISE EXCEPTION 'Delegation organization does not match RFQ organization.';
    END IF;

    -- Delegatee Match
    IF v_delegation.delegatee_id != v_caller_id THEN
      RAISE EXCEPTION 'Delegation proxy delegatee does not match authenticated caller.';
    END IF;

    -- Anti-Self-Delegation
    IF v_delegation.delegator_id = v_delegation.delegatee_id THEN
      RAISE EXCEPTION 'Self-delegation is prohibited.';
    END IF;

    -- Anti-Self-Approval via Proxy: RFQ Creator cannot be the delegator
    IF v_delegation.delegator_id = v_rfq.created_by THEN
      RAISE EXCEPTION 'Anti-bypass policy violation: RFQ creator cannot delegate authority to approve their own RFQ.';
    END IF;

    -- Active & Revocation Check
    IF NOT v_delegation.is_active OR v_delegation.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Delegation proxy is inactive or revoked.';
    END IF;

    -- Time Window Check
    IF v_now < v_delegation.starts_at THEN
      RAISE EXCEPTION 'Delegation proxy validity period has not started yet (starts at %).', v_delegation.starts_at;
    END IF;

    IF v_now > v_delegation.expires_at THEN
      RAISE EXCEPTION 'Delegation proxy has expired (expired at %).', v_delegation.expires_at;
    END IF;

    -- Spend Cap Check
    IF v_delegation.spend_cap_amount IS NOT NULL AND v_stage.procurement_amount > v_delegation.spend_cap_amount THEN
      RAISE EXCEPTION 'Delegation spend cap exceeded: RFQ amount ₹% exceeds spend cap ₹%.',
        v_stage.procurement_amount, v_delegation.spend_cap_amount;
    END IF;

    -- Permission Check
    v_required_perm := CASE p_tier_level
      WHEN 'TIER_1_MANAGER' THEN 'APPROVE_TIER_1'
      WHEN 'TIER_2_DEPT_HEAD' THEN 'APPROVE_TIER_2'
      WHEN 'TIER_3_EXECUTIVE' THEN 'APPROVE_TIER_3'
      ELSE 'APPROVE_TIER_1'
    END;

    IF NOT (v_required_perm = ANY(v_delegation.permissions)) THEN
      RAISE EXCEPTION 'Delegation proxy does not grant permission % for tier %.', v_required_perm, p_tier_level;
    END IF;

    -- Executive Gate Invariant: Tier 3 (>₹25L) cannot be delegated to non-executives
    IF p_tier_level = 'TIER_3_EXECUTIVE' THEN
      IF NOT (v_caller_role IN ('OWNER', 'DIRECTOR', 'EXECUTIVE', 'CFO') OR v_is_admin) THEN
        RAISE EXCEPTION 'Tier 3 Executive Gate (>₹25L) cannot be delegated to non-executive personnel.';
      END IF;
    END IF;

    v_delegator_id := v_delegation.delegator_id;
  ELSE
    -- Direct Role Authority Check
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

  -- 9. Compute Digital Signature Hash
  v_sig_hash := encode(digest(p_rfq_id::text || ':' || p_tier_level || ':' || v_caller_id::text || ':' || v_now::text, 'sha256'), 'hex');

  -- 10. Update Stage Record
  UPDATE public.rfq_approval_stages
  SET
    status = 'APPROVED',
    approver_profile_id = v_caller_id,
    approver_role = v_caller_role,
    approver_comments = p_notes,
    notes = p_notes,
    delegation_id = p_delegation_id,
    delegator_profile_id = v_delegator_id,
    signature_mode = v_sig_mode,
    digital_signature_hash = v_sig_hash,
    approved_at = v_now,
    updated_at = v_now
  WHERE id = v_stage.id;

  -- 11. Check if all stages for this RFQ are now approved
  SELECT bool_and(status = 'APPROVED') INTO v_all_approved
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id;

  -- 12. Append-Only Audit Logging
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'rfq.tier_approved',
    v_caller_id,
    v_rfq.organization_id,
    'rfq_approval_stage',
    v_stage.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'tier_level', p_tier_level,
      'stage_order', v_stage.stage_order,
      'signature_mode', v_sig_mode,
      'delegation_id', p_delegation_id,
      'delegator_profile_id', v_delegator_id,
      'procurement_amount', v_stage.procurement_amount,
      'all_stages_approved', v_all_approved,
      'approved_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'stageId', v_stage.id,
    'rfqId', p_rfq_id,
    'tierLevel', p_tier_level,
    'stageOrder', v_stage.stage_order,
    'status', 'APPROVED',
    'signatureMode', v_sig_mode,
    'approverProfileId', v_caller_id,
    'delegationId', p_delegation_id,
    'delegatorProfileId', v_delegator_id,
    'digitalSignatureHash', v_sig_hash,
    'allStagesApproved', v_all_approved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Overloaded / Backwards-Compatible submit_rfq_tier_approval_atomic (stage_order)
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
  v_stage public.rfq_approval_stages%ROWTYPE;
BEGIN
  SELECT * INTO v_stage
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order = p_stage_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage order % not found for RFQ %.', p_stage_order, p_rfq_id;
  END IF;

  IF p_decision = 'APPROVED' THEN
    RETURN public.submit_rfq_tier_approval_atomic(p_rfq_id, v_stage.tier_level, p_comments, NULL);
  ELSE
    -- Handle rejection
    UPDATE public.rfq_approval_stages
    SET
      status = 'REJECTED',
      approver_profile_id = COALESCE(auth.uid(), private.get_profile_id()),
      approver_role = COALESCE(private.get_org_role(v_stage.organization_id)::text, 'APPROVER'),
      approver_comments = p_comments,
      notes = p_comments,
      rejected_at = now(),
      updated_at = now()
    WHERE id = v_stage.id;

    RETURN jsonb_build_object(
      'ok', true,
      'stageId', v_stage.id,
      'rfqId', p_rfq_id,
      'tierLevel', v_stage.tier_level,
      'stageOrder', p_stage_order,
      'status', 'REJECTED'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, integer, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Fail-Closed Award Locking & PO Issuance: Upgrade lock_and_reveal_award_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text,
  p_auto_reveal   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_org             organizations%ROWTYPE;
  v_award_id        uuid;
  v_now             timestamptz := now();
  v_tally           jsonb;
  v_po_res          jsonb;
  v_po_id           uuid;
  v_po_number       text;
  v_supplier_id     uuid;
  v_business        text;
  v_phone           text;
  v_email           text;
  v_alias           text;
  v_existing_award  awards%ROWTYPE;
  v_pending_stages  integer := 0;
BEGIN
  -- 1. Strict row-level lock on RFQ
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  -- 2. Verify RFQ Status
  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  -- 3. Fail-Closed Multi-Tier Approval Gate
  -- If approval stages exist for this RFQ, all required stages must be APPROVED before award locking.
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_rfq.organization_id;

  -- 4. Verify Quote belongs to this RFQ
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ');
  END IF;

  -- 5. Check or Create Award Record
  SELECT * INTO v_existing_award
  FROM public.awards
  WHERE rfq_id = p_rfq_id;

  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    -- Compute final frozen vote tally snapshot
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

    -- Insert Frozen Award Record
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

  -- 6. Update Quote Statuses (Winner -> SELECTED, Others -> NOT_SELECTED)
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 7. Update RFQ and Requirement Status
  UPDATE rfqs
  SET 
    status = 'AWARDED',
    reveal_status = CASE WHEN p_auto_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now
  WHERE id = p_rfq_id;

  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- Notify suppliers of outcome
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);

  -- 8. Audit Log
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

  -- 9. If auto_reveal is requested, atomically generate PO and return mutual reveal payload
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
      'alias_before_reveal', v_alias,
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

-- ---------------------------------------------------------------------------
-- 5. Fail-Closed PO Creation: Upgrade create_purchase_order_from_award
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award           awards%ROWTYPE;
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_version         quote_versions%ROWTYPE;
  v_existing_po     purchase_orders%ROWTYPE;
  v_po_id           uuid;
  v_po_number       text;
  v_total           numeric;
  v_currency        text;
  v_pending_stages  integer := 0;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  IF v_award.status <> 'REVEALED' THEN
    RAISE EXCEPTION 'Award must be REVEALED before creating a Purchase Order';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Fail-Closed multi-tier approval verification on PO creation
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = v_rfq.id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (
        purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
      ) VALUES (
        v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order - ' || v_existing_po.po_number, 0, now(), now()
      );
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  SELECT * INTO v_version
  FROM quote_versions
  WHERE quote_id = v_quote.id AND version = v_quote.current_version;

  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, (v_version.snapshot->>'basePrice')::numeric, 0);
  v_currency := COALESCE(v_version.snapshot->>'currency', 'INR');
  v_po_number := 'PO-' || to_char(now(), 'YYYY-MM-DD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO purchase_orders (
    award_id,
    rfq_id,
    organization_id,
    supplier_id,
    po_number,
    status,
    total_amount,
    currency,
    created_at,
    updated_at
  ) VALUES (
    p_award_id,
    v_rfq.id,
    v_rfq.organization_id,
    v_quote.supplier_id,
    v_po_number,
    'ISSUED',
    v_total,
    v_currency,
    now(),
    now()
  )
  RETURNING id INTO v_po_id;

  INSERT INTO work_orders (
    purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
  ) VALUES (
    v_po_id, v_quote.supplier_id, 'NOT_STARTED', 'Work order - ' || v_po_number, 0, now(), now()
  );

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'po.created',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'purchase_order',
    v_po_id::text,
    jsonb_build_object(
      'po_id', v_po_id,
      'po_number', v_po_number,
      'award_id', p_award_id,
      'rfq_id', v_rfq.id,
      'supplier_id', v_quote.supplier_id,
      'total_amount', v_total,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, service_role;

COMMIT;

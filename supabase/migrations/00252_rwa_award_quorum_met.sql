-- 00252: RWA/COMMUNITY award lock rejects when committee quorum is not met.
--
-- 00237 keeps COMMUNITY off multi-tier spend approval because that org is
-- committee-governed. lock_award is a wrapper around lock_and_reveal_award_atomic.
-- Both entry points now call private.enforce_rwa_award_quorum before an award
-- can lock.
--
-- quorum_met for this gate is the award rule already stated in 00246:
-- at least two unconflicted RECOMMEND votes for the winning quote.
-- rfq_voting_summary still reports a separate COMMUNITY display threshold
-- of 4 members voted. That display figure is not applied here: the seeded
-- RWA committee has two authorised voters, and 00238 keeps this quorum count.
-- INDIVIDUAL and MSME do not take this check.
-- Weighted voting, COI exclusion, recusal, reveal sequencing, and the
-- existing approval-stage gate are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_rwa_award_quorum(
  p_rfq_id uuid,
  p_quote_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_org_type text;
  v_vote_count integer := 0;
BEGIN
  SELECT o.org_type::text INTO v_org_type
  FROM public.rfqs r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE r.id = p_rfq_id;

  IF v_org_type IS NULL THEN
    RETURN;
  END IF;

  -- Individuals, MSMEs, and every non-RWA org skip this gate.
  IF v_org_type NOT IN ('COMMUNITY', 'RWA', 'SOCIETY') THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT cv.profile_id) INTO v_vote_count
  FROM public.committee_votes cv
  WHERE cv.rfq_id = p_rfq_id
    AND cv.recommended_quote_id = p_quote_id
    AND cv.choice = 'RECOMMEND'::public.vote_choice
    AND NOT EXISTS (
      SELECT 1 FROM public.conflict_of_interest_declarations coi
      WHERE coi.rfq_id = p_rfq_id
        AND coi.profile_id = cv.profile_id
        AND coi.status = 'DECLARED_CONFLICT'
    );

  IF v_vote_count < 2 THEN
    RAISE EXCEPTION 'Committee quorum not met: quorum_met is false for this RWA/COMMUNITY award';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_rwa_award_quorum(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_rwa_award_quorum(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lock_award(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  PERFORM private.enforce_rwa_award_quorum(p_rfq_id, p_quote_id);
  RETURN public.lock_and_reveal_award_atomic(p_rfq_id, p_quote_id, p_justification, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_award(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_justification text,
  p_auto_reveal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_award_id uuid;
  v_now timestamptz := now();
  v_tally jsonb;
  v_po_res jsonb;
  v_po_id uuid;
  v_po_number text;
  v_supplier_id uuid;
  v_supplier suppliers%ROWTYPE;
  v_business text;
  v_phone text;
  v_email text;
  v_alias text;
  v_existing_award awards%ROWTYPE;
  v_pending_stages integer := 0;
  v_can_reveal boolean := false;
  v_vote_count integer := 0;
BEGIN
  PERFORM private.enforce_rwa_award_quorum(p_rfq_id, p_quote_id);
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found'); END IF;
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)';
  END IF;
  IF v_rfq.status = 'OPEN' THEN RAISE EXCEPTION 'Cannot lock award while RFQ is still OPEN'; END IF;
  IF v_rfq.status NOT IN ('CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;
  SELECT COUNT(*) INTO v_pending_stages FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id AND status != 'APPROVED';
  IF v_pending_stages > 0 THEN RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_rfq.organization_id;
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ'); END IF;
  IF v_quote.status = 'WITHDRAWN' THEN RAISE EXCEPTION 'Cannot award a withdrawn quote'; END IF;
  IF v_org.org_type::text IN ('COMMUNITY', 'RWA', 'SOCIETY') THEN
    SELECT COUNT(DISTINCT cv.profile_id) INTO v_vote_count
    FROM public.committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.recommended_quote_id = p_quote_id
      AND cv.choice = 'RECOMMEND'::public.vote_choice
      AND NOT EXISTS (
        SELECT 1 FROM public.conflict_of_interest_declarations coi
        WHERE coi.rfq_id = p_rfq_id AND coi.profile_id = cv.profile_id AND coi.status = 'DECLARED_CONFLICT'
      );
    IF v_vote_count < 2 THEN RAISE EXCEPTION 'Committee quorum not met: at least 2 unconflicted votes required for this award'; END IF;
  END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now WHERE id = v_supplier.id;
    END IF;
  END IF;
  SELECT * INTO v_existing_award FROM public.awards WHERE rfq_id = p_rfq_id;
  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    SELECT jsonb_build_object('locked_at', v_now, 'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id, 'choice', v.choice, 'voting_power', v.voting_power)), '[]'::jsonb))
    INTO v_tally FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.* FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;
    INSERT INTO public.awards (rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at, votes_locked_at, vote_snapshot)
    VALUES (
      p_rfq_id, p_quote_id, COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN v_can_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now, CASE WHEN v_can_reveal THEN v_now ELSE NULL END, v_now, COALESCE(v_tally, '{}'::jsonb)
    ) RETURNING id INTO v_award_id;
  END IF;
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;
  UPDATE rfqs SET status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);
  PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'PRE_REVEAL');
  IF v_can_reveal THEN
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'POST_REVEAL');
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';
    IF v_po_id IS NULL THEN
      RAISE EXCEPTION 'Reveal failed: Purchase Order was not created';
    END IF;
    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;
    RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', true, 'po_id', v_po_id,
      'business_name', v_business, 'contact_phone', v_phone, 'contact_email', v_email);
  END IF;
  RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

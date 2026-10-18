-- =============================================================================
-- Migration 00302: Demo Staging Parity & Buyer Committee RFQ Metrics
-- =============================================================================
-- 1. Dual-Vector Procurement Triggers (00299 Parity):
--    Exempt demo_reset and demo_stage_scenario sessions (otp.demo_staging = 'on'
--    or otp.demo_reset = 'on') to allow automated synthetic demo staging while
--    strictly maintaining 100% hard-deny isolation for all customer procurement.
-- 2. Award Attribution Separation:
--    Ensure awards in lock_and_reveal_award_atomic are attributed to the buyer
--    (v_rfq.created_by) when triggered by an internal operator or demo runner.
-- 3. Committee RFQ Count Restoration:
--    Restore evaluating/closed RFQ count calculation for buyer committee members
--    in my_role_context() while preserving 0 for internal console operators.
-- =============================================================================

BEGIN;

-- 1. Dual-Vector Triggers: Demo Staging & Reset Exemption

CREATE OR REPLACE FUNCTION private.trg_deny_internal_requirements_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.created_by) OR private.is_internal_profile(NEW.owner_profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_rfqs_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.created_by) OR private.is_internal_profile(NEW.owner_profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_quotes_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  ) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_rfq_invitations_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.created_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_committee_votes_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_quote_evaluations_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.awarded_by) OR private.is_internal_profile(NEW.unmasked_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_awards_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.awarded_by) OR private.is_internal_profile(NEW.unmasked_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_purchase_orders_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.owner_profile_id) OR private.is_internal_profile(NEW.cancelled_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_work_orders_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.purchase_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = NEW.purchase_order_id
      AND private.is_internal_profile(po.owner_profile_id)
  )) OR (NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  )) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_invoices_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  )) OR (NEW.work_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
    WHERE wo.id = NEW.work_order_id
      AND private.is_internal_profile(po.owner_profile_id)
  )) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_payments_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF current_setting('otp.demo_staging', true) = 'on' OR current_setting('otp.demo_reset', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF private.is_internal_profile(auth.uid()) AND current_setting('otp.verified_payment_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.recorded_by) AND current_setting('otp.verified_payment_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.purchase_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = NEW.purchase_order_id
      AND private.is_internal_profile(po.owner_profile_id)
  )) OR (NEW.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices inv
    JOIN public.supplier_users su ON su.supplier_id = inv.supplier_id
    WHERE inv.id = NEW.invoice_id
      AND private.is_internal_profile(su.profile_id)
  )) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- 2. Award Attribution: Buyer Actor Binding in lock_and_reveal_award_atomic

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
AS $func$
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
  v_awarded_by uuid;
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

  -- Internal operators cannot be procurement actors: award must be recorded under buyer profile
  IF private.is_internal_profile(private.get_profile_id()) THEN
    v_awarded_by := COALESCE(v_rfq.created_by, v_rfq.owner_profile_id);
  ELSE
    v_awarded_by := COALESCE(private.get_profile_id(), v_rfq.created_by);
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
      p_rfq_id, p_quote_id, v_awarded_by,
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
$func$;


-- 3. Committee RFQ Count Restoration in my_role_context()

CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_profile_id     uuid;
  v_active         text;
  v_side           signup_side;
  v_is_founder     boolean;
  v_is_admin       boolean;
  v_status         text;
  v_is_blocked     boolean;
  v_full_name      text;
  v_title          text;
  v_avatar_url     text;
  v_email          text;
  v_phone          text;
  v_supplier_id    uuid;
  v_roles          jsonb := '[]'::jsonb;
  v_organizations  jsonb := '[]'::jsonb;
  v_org_id         uuid;
  v_org_name       text;
  v_org_type       text;
  v_org_role       text;
  v_role_rec       record;
  v_org_rec        record;
  v_active_role_def jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT p.id, p.active_role_code, p.active_portal_side, p.is_founder, p.is_platform_admin,
         p.status, (p.status = 'BLOCKED' OR p.blocked_at IS NOT NULL),
         p.full_name, p.title, p.avatar_url, p.email, p.phone
  INTO v_profile_id, v_active, v_side, v_is_founder, v_is_admin,
       v_status, v_is_blocked,
       v_full_name, v_title, v_avatar_url, v_email, v_phone
  FROM public.profiles p
  WHERE p.auth_user_id = v_uid OR p.id = v_uid
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  -- 1. Founder & CEO Omnipresent Authority
  IF v_is_founder = true OR v_email = 'bvnbasu@gmail.com' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', ur.code,
        'label', ur.label,
        'side', ur.side,
        'description', ur.description,
        'permissions', to_jsonb(ur.permissions),
        'assignedByAdmin', false
      )
    )
    INTO v_roles
    FROM public.user_roles ur
    WHERE ur.side = 'CONSOLE'::signup_side;

    IF v_active IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE code = v_active AND side = 'CONSOLE'::signup_side) THEN
      v_active := 'SUPER_ADMIN';
    END IF;

    SELECT jsonb_build_object(
      'code', ur.code,
      'label', ur.label,
      'side', ur.side,
      'description', ur.description,
      'permissions', to_jsonb(ur.permissions)
    )
    INTO v_active_role_def
    FROM public.user_roles ur
    WHERE ur.code = v_active;

    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile_id,
      'side', 'CONSOLE',
      'isPlatformAdmin', true,
      'isFounder', true,
      'needsOnboarding', false,
      'activeRole', v_active_role_def,
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', COALESCE(v_full_name, 'Baskar Loganathan'),
      'title', 'Founder & CEO',
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', v_phone,
      'isBlocked', false,
      'status', 'ACTIVE'
    );
  END IF;

  -- 2. Internal Console Operators (Platform / Ops / Catalog / Support / Finance / Legal)
  IF v_is_admin = true OR v_side = 'CONSOLE'::signup_side OR EXISTS (
    SELECT 1 FROM public.internal_user_assignments ua WHERE ua.profile_id = v_profile_id
  ) THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', ur.code,
        'label', ur.label,
        'side', ur.side,
        'description', ur.description,
        'permissions', to_jsonb(ur.permissions),
        'assignedByAdmin', true
      )
    )
    INTO v_roles
    FROM public.internal_user_assignments ua
    JOIN public.user_roles ur ON ur.code = ua.role_code
    WHERE ua.profile_id = v_profile_id;

    IF v_roles IS NULL THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'code', ur.code,
          'label', ur.label,
          'side', ur.side,
          'description', ur.description,
          'permissions', to_jsonb(ur.permissions),
          'assignedByAdmin', false
        )
      )
      INTO v_roles
      FROM public.user_roles ur
      WHERE ur.code = COALESCE(v_active, 'INTERNAL_OPERATOR');
    END IF;

    IF v_active IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.internal_user_assignments ua
      WHERE ua.profile_id = v_profile_id AND ua.role_code = v_active
    ) THEN
      SELECT ua.role_code INTO v_active
      FROM public.internal_user_assignments ua
      WHERE ua.profile_id = v_profile_id
      LIMIT 1;

      IF v_active IS NULL THEN
        v_active := 'INTERNAL_OPERATOR';
      END IF;
    END IF;

    SELECT jsonb_build_object(
      'code', ur.code,
      'label', ur.label,
      'side', ur.side,
      'description', ur.description,
      'permissions', to_jsonb(ur.permissions)
    )
    INTO v_active_role_def
    FROM public.user_roles ur
    WHERE ur.code = v_active;

    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile_id,
      'side', 'CONSOLE',
      'isPlatformAdmin', v_is_admin,
      'isFounder', false,
      'needsOnboarding', false,
      'activeRole', v_active_role_def,
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, 'Platform Operator'),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', v_phone,
      'isBlocked', v_is_blocked,
      'status', v_status
    );
  END IF;

  -- 3. Customer Personas (Buyer & Supplier Market Participants)
  IF v_side = 'SUPPLIER'::signup_side THEN
    SELECT su.supplier_id INTO v_supplier_id
    FROM public.supplier_users su
    WHERE su.profile_id = v_profile_id
    LIMIT 1;
  ELSE
    SELECT om.organization_id, o.name, o.org_type::text, om.role
    INTO v_org_id, v_org_name, v_org_type, v_org_role
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile_id
    ORDER BY om.created_at ASC
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'code', ur.code,
      'label', ur.label,
      'side', ur.side,
      'description', ur.description,
      'permissions', to_jsonb(ur.permissions),
      'assignedByAdmin', false
    )
  )
  INTO v_roles
  FROM public.user_roles ur
  WHERE ur.code = v_active;

  IF v_side = 'BUYER'::signup_side THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'orgType', o.org_type::text,
        'role', om.role,
        'isPersonal', (o.org_type = 'INDIVIDUAL')
      )
    )
    INTO v_organizations
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile_id,
    'side', v_side,
    'isPlatformAdmin', false,
    'isFounder', false,
    'needsOnboarding', (v_roles IS NULL OR jsonb_array_length(v_roles) = 0),
    'activeRole', CASE WHEN v_active IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'code', ur.code,
        'label', ur.label,
        'side', ur.side,
        'description', ur.description,
        'permissions', to_jsonb(ur.permissions)
      )
      FROM public.user_roles ur WHERE ur.code = v_active
    ) ELSE NULL END,
    'roles', COALESCE(v_roles, '[]'::jsonb),
    'organizations', COALESCE(v_organizations, '[]'::jsonb),
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', CASE
      WHEN v_side = 'CONSOLE'::signup_side THEN 0
      ELSE (
        SELECT count(DISTINCT r.id)::int
        FROM public.rfqs r
        WHERE r.status IN ('EVALUATING', 'CLOSED')
          AND (v_org_id IS NULL OR r.organization_id = v_org_id)
      )
    END,
    'supplierId', v_supplier_id,
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'status', v_status
  );
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

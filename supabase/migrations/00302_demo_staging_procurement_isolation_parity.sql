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
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id), false))
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
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_side signup_side;
  v_admin boolean;
  v_founder boolean := false;
  v_active text;
  v_roles jsonb;
  v_active_org_id uuid;
  v_org_role text := NULL;
  v_org_id uuid := NULL;
  v_org_name text := NULL;
  v_org_type text := NULL;
  v_organizations jsonb;
  v_email text;
  v_full_name text;
  v_title text;
  v_avatar_url text;
  v_phone text;
  v_is_blocked boolean := false;
  v_status text := 'ACTIVE';
  v_supplier_id uuid := NULL;
  v_blocked_reason text := NULL;
  v_blocked_at timestamptz := NULL;
  v_auth_uid uuid := auth.uid();
  v_is_internal boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object(
      'signedIn', false,
      'profileId', NULL,
      'side', NULL,
      'isPlatformAdmin', false,
      'isFounder', false,
      'needsOnboarding', false,
      'activeRole', NULL,
      'roles', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', NULL,
      'title', NULL,
      'avatarUrl', NULL,
      'email', NULL,
      'phone', NULL,
      'isBlocked', false,
      'status', 'ANON'
    );
  END IF;

  SELECT
    p.is_platform_admin,
    COALESCE(p.is_founder, false),
    p.active_role_code,
    p.active_organization_id,
    p.email,
    p.full_name,
    p.title,
    p.avatar_url,
    p.phone,
    p.status,
    p.blocked_reason,
    p.blocked_at
  INTO
    v_admin,
    v_founder,
    v_active,
    v_active_org_id,
    v_email,
    v_full_name,
    v_title,
    v_avatar_url,
    v_phone,
    v_status,
    v_blocked_reason,
    v_blocked_at
  FROM public.profiles p
  WHERE p.id = v_profile;

  IF v_status IS DISTINCT FROM 'BLOCKED' AND v_blocked_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.supplier_users su
      JOIN public.suppliers s ON s.id = su.supplier_id
      WHERE (su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid))
        AND (s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL)
    ) THEN
      v_status := 'BLOCKED';
      v_is_blocked := true;
      IF v_blocked_reason IS NULL THEN
        SELECT blocked_reason INTO v_blocked_reason
        FROM public.suppliers s
        JOIN public.supplier_users su ON su.supplier_id = s.id
        WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_status = 'BLOCKED' OR v_status = 'SUSPENDED' OR v_status = 'DELETED' OR v_blocked_at IS NOT NULL THEN
    v_is_blocked := true;
  END IF;

  v_is_internal := private.authoritative_internal_operator_access(v_profile);

  -- Platform Admin, Founder & Internal Operators are strictly CONSOLE side
  IF v_admin IS TRUE OR v_is_internal IS TRUE THEN
    -- Populate available internal roles for switching
    IF v_founder IS TRUE OR v_admin IS TRUE THEN
      -- Founder / CEO / SuperAdmin can switch to ANY internal role in internal_roles
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', ir.code,
        'label', ir.name,
        'side', 'CONSOLE',
        'description', ir.description,
        'permissions', jsonb_build_array('READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'),
        'assignedByAdmin', false
      ) ORDER BY ir.is_system DESC, ir.name), '[]'::jsonb)
      INTO v_roles
      FROM public.internal_roles ir;
    ELSE
      -- Standard internal operator: populate from assigned roles
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', ir.code,
        'label', ir.name,
        'side', 'CONSOLE',
        'description', ir.description,
        'permissions', jsonb_build_array('READ', 'WRITE'),
        'assignedByAdmin', true
      ) ORDER BY ir.name), '[]'::jsonb)
      INTO v_roles
      FROM public.internal_user_assignments ua
      JOIN public.internal_roles ir ON ir.id = ua.role_id
      WHERE ua.profile_id = v_profile;
    END IF;

    -- Default active internal role if not set or invalid
    IF v_active IS NULL OR NOT EXISTS (SELECT 1 FROM public.internal_roles WHERE code = v_active) THEN
      IF v_founder IS TRUE OR v_admin IS TRUE THEN
        v_active := 'SUPER_ADMIN';
      ELSIF jsonb_array_length(v_roles) > 0 THEN
        v_active := v_roles->0->>'code';
      ELSE
        v_active := 'INTERNAL_OPERATOR';
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', 'CONSOLE',
      'isPlatformAdmin', COALESCE(v_admin, false),
      'isFounder', COALESCE(v_founder, false),
      'needsOnboarding', false,
      'activeRole', (
        SELECT jsonb_build_object(
          'code', ir.code,
          'label', ir.name,
          'side', 'CONSOLE',
          'description', ir.description,
          'permissions', jsonb_build_array('READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD')
        )
        FROM public.internal_roles ir
        WHERE ir.code = v_active
        LIMIT 1
      ),
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, CASE WHEN v_founder IS TRUE THEN 'Founder & CEO' ELSE 'Platform Administrator' END),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', COALESCE(v_phone, '+91 99729 67530'),
      'isBlocked', v_is_blocked,
      'status', v_status
    );
  END IF;

  v_side := private.profile_side(v_profile);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', ur.code,
    'label', ur.label,
    'side', ur.side,
    'description', ur.description,
    'permissions', to_jsonb(ur.permissions),
    'assignedByAdmin', pr.assigned_by IS NOT NULL
  ) ORDER BY ur.sort_order), '[]'::jsonb)
  INTO v_roles
  FROM public.profile_roles pr
  JOIN public.user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile
    AND (v_side IS NULL OR ur.side = v_side);

  IF v_side = 'SUPPLIER' AND (v_roles IS NULL OR jsonb_array_length(v_roles) = 0) THEN
    v_active := COALESCE(v_active, 'SUPPLIER_FOUNDER');
    v_roles := jsonb_build_array(jsonb_build_object(
      'code', 'SUPPLIER_FOUNDER',
      'label', 'Supplier Founder / Owner',
      'side', 'SUPPLIER',
      'description', 'Full commercial authority for quoting, contracts, and work order delivery.',
      'permissions', '["READ", "WRITE", "PROPOSE", "APPROVE", "AWARD"]'::jsonb,
      'assignedByAdmin', false
    ));
  END IF;

  IF v_active IS NULL AND jsonb_array_length(v_roles) > 0 THEN
    v_active := v_roles->0->>'code';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'orgType', o.org_type::text,
    'role', om.role::text,
    'isPersonal', (o.org_type::text = 'INDIVIDUAL'),
    'status', COALESCE(o.status, 'ACTIVE')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid);

  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE (om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid))
      AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND (v_side = 'BUYER' OR v_side IS NULL) THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;

    IF v_org_id IS NULL AND (
      to_regprocedure('private.is_personal_buyer_profile(uuid)') IS NOT NULL
      AND private.is_personal_buyer_profile(v_profile)
    ) THEN
      v_org_role := 'OWNER';
      v_org_type := 'INDIVIDUAL';
    END IF;
  END IF;

  IF v_side = 'SUPPLIER' THEN
    SELECT s.id INTO v_supplier_id
    FROM public.suppliers s
    JOIN public.supplier_users su ON su.supplier_id = s.id
    WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
    LIMIT 1;

    IF v_supplier_id IS NULL AND v_email IS NOT NULL THEN
      SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
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

REVOKE EXECUTE ON FUNCTION public.my_role_context() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

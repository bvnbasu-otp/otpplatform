-- 00300_internal_staff_referral_ledger.sql
-- Step 3 of OTP Phase 2: Internal Staff Referral Ledger, Fail-Closed Constraints, and Atomic RPCs

-- 1. Internal Referral Plans Table
CREATE TABLE IF NOT EXISTS public.internal_referral_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  fixed_bonus_inr numeric(12,2) DEFAULT NULL, -- Defaults to NULL pending Finance approval (Risk R-01)
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2. Internal Referral Achievements Table
CREATE TABLE IF NOT EXISTS public.internal_referral_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.internal_referral_plans(id) ON DELETE RESTRICT,
  employee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_kind text NOT NULL CHECK (target_kind IN ('BUYER_ORGANIZATION', 'SUPPLIER')),
  referred_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'AUTHORIZED', 'SETTLED', 'REJECTED')),
  awarded_amount_inr numeric(12,2),
  authorized_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authorized_at timestamptz,
  settled_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_canonical_referral_target CHECK (
    (target_kind = 'BUYER_ORGANIZATION' AND referred_organization_id IS NOT NULL AND referred_supplier_id IS NULL)
    OR
    (target_kind = 'SUPPLIER' AND referred_supplier_id IS NOT NULL AND referred_organization_id IS NULL)
  ),
  CONSTRAINT chk_staff_achievement_state_rules CHECK (
    CASE
      WHEN status = 'RECORDED' THEN
        authorized_by IS NULL
        AND authorized_at IS NULL
        AND settled_at IS NULL
        AND rejection_reason IS NULL
      WHEN status IN ('AUTHORIZED', 'SETTLED') THEN
        awarded_amount_inr IS NOT NULL
        AND awarded_amount_inr > 0
        AND authorized_by IS NOT NULL
        AND authorized_at IS NOT NULL
        AND authorized_by <> employee_profile_id
        AND rejection_reason IS NULL
        AND (status <> 'SETTLED' OR settled_at IS NOT NULL)
      WHEN status = 'REJECTED' THEN
        authorized_at IS NULL
        AND settled_at IS NULL
        AND rejection_reason IS NOT NULL
        AND length(trim(rejection_reason)) > 0
      ELSE false
    END
  )
);

-- Canonical duplicate prevention partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_referral_org
  ON public.internal_referral_achievements (referred_organization_id)
  WHERE referred_organization_id IS NOT NULL AND status <> 'REJECTED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_referral_supplier
  ON public.internal_referral_achievements (referred_supplier_id)
  WHERE referred_supplier_id IS NOT NULL AND status <> 'REJECTED';

CREATE INDEX IF NOT EXISTS idx_staff_referral_employee
  ON public.internal_referral_achievements (employee_profile_id);

-- 3. Internal Referral Payouts Table
CREATE TABLE IF NOT EXISTS public.internal_referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL REFERENCES public.internal_referral_achievements(id) ON DELETE RESTRICT,
  employee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payout_amount_inr numeric(12,2) NOT NULL CHECK (payout_amount_inr > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'CANCELLED')),
  finance_reference_id text, -- Non-null Bank UTR required when PROCESSED
  reconciliation_evidence jsonb, -- Non-null structured JSON evidence required when PROCESSED
  processed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  processed_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_staff_payout_state_rules CHECK (
    CASE
      WHEN status = 'PENDING' THEN
        processed_by IS NULL
        AND processed_at IS NULL
        AND cancelled_by IS NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
      WHEN status = 'PROCESSED' THEN
        finance_reference_id IS NOT NULL
        AND length(trim(finance_reference_id)) > 0
        AND reconciliation_evidence IS NOT NULL
        AND reconciliation_evidence <> '{}'::jsonb
        AND processed_by IS NOT NULL
        AND processed_at IS NOT NULL
        AND processed_by <> employee_profile_id
        AND cancelled_at IS NULL
      WHEN status = 'CANCELLED' THEN
        cancelled_by IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND length(trim(cancellation_reason)) > 0
        AND processed_at IS NULL
      ELSE false
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_active_payout
  ON public.internal_referral_payouts (achievement_id)
  WHERE status <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_staff_payout_employee
  ON public.internal_referral_payouts (employee_profile_id);

-- 4. Enable RLS and Create Access Policies
ALTER TABLE public.internal_referral_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_referral_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_referral_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_referral_plans_select ON public.internal_referral_plans;
CREATE POLICY internal_referral_plans_select ON public.internal_referral_plans
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_referral_plans_admin_all ON public.internal_referral_plans;
CREATE POLICY internal_referral_plans_admin_all ON public.internal_referral_plans
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_referral_achievements_select ON public.internal_referral_achievements;
CREATE POLICY internal_referral_achievements_select ON public.internal_referral_achievements
  FOR SELECT TO authenticated
  USING (
    private.authoritative_internal_operator_access(auth.uid())
    OR employee_profile_id = private.get_profile_id()
  );

DROP POLICY IF EXISTS internal_referral_payouts_select ON public.internal_referral_payouts;
CREATE POLICY internal_referral_payouts_select ON public.internal_referral_payouts
  FOR SELECT TO authenticated
  USING (
    private.authoritative_internal_operator_access(auth.uid())
    OR employee_profile_id = private.get_profile_id()
  );

GRANT SELECT ON TABLE
  public.internal_referral_plans,
  public.internal_referral_achievements,
  public.internal_referral_payouts
TO authenticated, service_role;

GRANT ALL ON TABLE
  public.internal_referral_plans,
  public.internal_referral_achievements,
  public.internal_referral_payouts
TO service_role;

REVOKE ALL ON TABLE
  public.internal_referral_plans,
  public.internal_referral_achievements,
  public.internal_referral_payouts
FROM anon;

-- 5. Atomic RPC: Authorize Referral Achievement
CREATE OR REPLACE FUNCTION public.authorize_staff_referral_achievement(
  p_achievement_id uuid,
  p_amount_inr numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_ach record;
  v_plan record;
  v_final_amount numeric(12,2);
  v_payout_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT private.authoritative_internal_operator_access(v_caller) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an authorized internal operator' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ach
  FROM public.internal_referral_achievements
  WHERE id = p_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral achievement not found: %', p_achievement_id USING ERRCODE = 'P0002';
  END IF;

  IF v_ach.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'Referral achievement is not in RECORDED status (current: %)', v_ach.status USING ERRCODE = '22023';
  END IF;

  IF v_ach.employee_profile_id = v_caller THEN
    RAISE EXCEPTION 'Anti-self-approval violation: Cannot authorize own referral achievement' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan
  FROM public.internal_referral_plans
  WHERE id = v_ach.plan_id;

  v_final_amount := COALESCE(p_amount_inr, v_plan.fixed_bonus_inr);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid bonus amount: must be positive numeric (amount=%)', v_final_amount USING ERRCODE = '22023';
  END IF;

  UPDATE public.internal_referral_achievements
  SET status = 'AUTHORIZED',
      awarded_amount_inr = v_final_amount,
      authorized_by = v_caller,
      authorized_at = clock_timestamp()
  WHERE id = p_achievement_id;

  INSERT INTO public.internal_referral_payouts (
    achievement_id,
    employee_profile_id,
    payout_amount_inr,
    status
  )
  VALUES (
    p_achievement_id,
    v_ach.employee_profile_id,
    v_final_amount,
    'PENDING'
  )
  RETURNING id INTO v_payout_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'referral.achievement_authorized',
    v_caller,
    'internal_referral_achievement',
    p_achievement_id::text,
    jsonb_build_object(
      'employee_profile_id', v_ach.employee_profile_id,
      'awarded_amount_inr', v_final_amount,
      'payout_id', v_payout_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'achievement_id', p_achievement_id,
    'status', 'AUTHORIZED',
    'awarded_amount_inr', v_final_amount,
    'payout_id', v_payout_id
  );
END;
$$;

-- 6. Atomic RPC: Reject Referral Achievement
CREATE OR REPLACE FUNCTION public.reject_staff_referral_achievement(
  p_achievement_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_ach record;
BEGIN
  IF v_caller IS NULL OR NOT private.authoritative_internal_operator_access(v_caller) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an authorized internal operator' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ach
  FROM public.internal_referral_achievements
  WHERE id = p_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral achievement not found: %', p_achievement_id USING ERRCODE = 'P0002';
  END IF;

  IF v_ach.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'Only RECORDED achievements can be rejected (current: %)', v_ach.status USING ERRCODE = '22023';
  END IF;

  IF v_ach.employee_profile_id = v_caller THEN
    RAISE EXCEPTION 'Anti-self-approval violation: Cannot reject own referral achievement' USING ERRCODE = '42501';
  END IF;

  UPDATE public.internal_referral_achievements
  SET status = 'REJECTED',
      rejection_reason = trim(p_reason),
      authorized_by = NULL,
      authorized_at = NULL
  WHERE id = p_achievement_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'referral.achievement_rejected',
    v_caller,
    'internal_referral_achievement',
    p_achievement_id::text,
    jsonb_build_object(
      'employee_profile_id', v_ach.employee_profile_id,
      'rejection_reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'achievement_id', p_achievement_id,
    'status', 'REJECTED'
  );
END;
$$;

-- 7. Atomic RPC: Process Staff Referral Payout
CREATE OR REPLACE FUNCTION public.process_staff_referral_payout(
  p_payout_id uuid,
  p_finance_reference_id text,
  p_reconciliation_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_payout record;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_caller IS NULL OR NOT private.authoritative_internal_operator_access(v_caller) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an authorized internal operator' USING ERRCODE = '42501';
  END IF;

  IF p_finance_reference_id IS NULL OR length(trim(p_finance_reference_id)) = 0 THEN
    RAISE EXCEPTION 'Bank reference ID (UTR) is required' USING ERRCODE = '22023';
  END IF;

  IF p_reconciliation_evidence IS NULL OR p_reconciliation_evidence = '{}'::jsonb THEN
    RAISE EXCEPTION 'Reconciliation evidence payload is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout
  FROM public.internal_referral_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral payout not found: %', p_payout_id USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Referral payout is not in PENDING status (current: %)', v_payout.status USING ERRCODE = '22023';
  END IF;

  IF v_payout.employee_profile_id = v_caller THEN
    RAISE EXCEPTION 'Anti-self-approval violation: Cannot process own referral payout' USING ERRCODE = '42501';
  END IF;

  -- Update payout to PROCESSED
  UPDATE public.internal_referral_payouts
  SET status = 'PROCESSED',
      finance_reference_id = trim(p_finance_reference_id),
      reconciliation_evidence = p_reconciliation_evidence,
      processed_by = v_caller,
      processed_at = v_now
  WHERE id = p_payout_id;

  -- Transition linked achievement to SETTLED
  UPDATE public.internal_referral_achievements
  SET status = 'SETTLED',
      settled_at = v_now
  WHERE id = v_payout.achievement_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'referral.payout_processed',
    v_caller,
    'internal_referral_payout',
    p_payout_id::text,
    jsonb_build_object(
      'achievement_id', v_payout.achievement_id,
      'employee_profile_id', v_payout.employee_profile_id,
      'amount_inr', v_payout.payout_amount_inr,
      'utr', trim(p_finance_reference_id)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', p_payout_id,
    'status', 'PROCESSED',
    'finance_reference_id', trim(p_finance_reference_id),
    'settled_at', v_now
  );
END;
$$;

-- 8. Atomic RPC: Cancel Staff Referral Payout
CREATE OR REPLACE FUNCTION public.cancel_staff_referral_payout(
  p_payout_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_payout record;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_caller IS NULL OR NOT private.authoritative_internal_operator_access(v_caller) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an authorized internal operator' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout
  FROM public.internal_referral_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral payout not found: %', p_payout_id USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only PENDING payouts can be cancelled (current: %)', v_payout.status USING ERRCODE = '22023';
  END IF;

  -- 1. Cancel the payout
  UPDATE public.internal_referral_payouts
  SET status = 'CANCELLED',
      cancelled_by = v_caller,
      cancelled_at = v_now,
      cancellation_reason = trim(p_reason)
  WHERE id = p_payout_id;

  -- 2. Atomically reset linked achievement back to RECORDED with null authorization
  UPDATE public.internal_referral_achievements
  SET status = 'RECORDED',
      awarded_amount_inr = NULL,
      authorized_by = NULL,
      authorized_at = NULL,
      settled_at = NULL
  WHERE id = v_payout.achievement_id;

  -- 3. Audit trail
  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'referral.payout_cancelled',
    v_caller,
    'internal_referral_payout',
    p_payout_id::text,
    jsonb_build_object(
      'achievement_id', v_payout.achievement_id,
      'employee_profile_id', v_payout.employee_profile_id,
      'cancellation_reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', p_payout_id,
    'status', 'CANCELLED',
    'achievement_reset_to', 'RECORDED'
  );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.authorize_staff_referral_achievement(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_staff_referral_achievement(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_staff_referral_payout(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_staff_referral_payout(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.authorize_staff_referral_achievement(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.reject_staff_referral_achievement(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_staff_referral_payout(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_staff_referral_payout(uuid, text) FROM anon;

-- 9. Seed Default Employee Referral Plan (Finance Approved: ₹100 fixed bonus per buyer/supplier)
INSERT INTO public.internal_referral_plans (code, title, description, fixed_bonus_inr, is_active)
VALUES ('EMPLOYEE_REFERRAL_2026', 'Employee Referral Program 2026', 'Internal staff incentive for verified buyer and supplier onboarding', 100.00, true)
ON CONFLICT (code) DO UPDATE
SET fixed_bonus_inr = EXCLUDED.fixed_bonus_inr,
    is_active = EXCLUDED.is_active;



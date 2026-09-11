-- Migration 00144: Prepaid Subscription Lifecycle & Dummy UPI/QR Payment Processing
-- Implements 30-day (Monthly) and 365-day (Yearly) prepaid access cycle for Buyer Organizations.

BEGIN;

-- 1. Add subscription columns to public.organizations if not existing
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'TIER_1_MSME',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- 2. Backfill existing organizations with appropriate tier based on org_type
UPDATE public.organizations
SET 
  subscription_tier = CASE 
    WHEN org_type::text IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') THEN 'TIER_2_ENTERPRISE'
    ELSE 'TIER_1_MSME'
  END,
  subscription_status = 'ACTIVE',
  subscription_plan = 'MONTHLY',
  subscription_started_at = COALESCE(subscription_started_at, now()),
  subscription_expires_at = COALESCE(subscription_expires_at, now() + interval '30 days')
WHERE subscription_expires_at IS NULL OR subscription_expires_at < now();

-- 3. Create subscription payment transactions log table
CREATE TABLE IF NOT EXISTS public.subscription_payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tier text NOT NULL,
  billing_cycle text NOT NULL, -- 'MONTHLY' | 'YEARLY'
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  payment_method text NOT NULL DEFAULT 'UPI_QR',
  upi_id text DEFAULT 'pay@otp',
  payment_reference text NOT NULL,
  validity_days integer NOT NULL,
  previous_expires_at timestamptz,
  new_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SUCCESS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_logs_org ON public.subscription_payment_logs(organization_id);

-- Enable RLS on payment logs
ALTER TABLE public.subscription_payment_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_payment_logs' AND policyname = 'org_members_read_sub_logs'
  ) THEN
    CREATE POLICY org_members_read_sub_logs ON public.subscription_payment_logs
      FOR SELECT TO authenticated
      USING (
        organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE profile_id = private.get_profile_id()
        ) OR private.is_platform_admin()
      );
  END IF;
END $$;

-- 4. RPC to get organization subscription status
CREATE OR REPLACE FUNCTION public.get_organization_subscription(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_now timestamptz := now();
  v_is_expired boolean;
  v_days_left integer;
  v_tier text;
BEGIN
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  v_tier := COALESCE(v_org.subscription_tier, 
    CASE WHEN v_org.org_type::text IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') 
      THEN 'TIER_2_ENTERPRISE' 
      ELSE 'TIER_1_MSME' 
    END
  );

  v_is_expired := (v_org.subscription_expires_at IS NOT NULL AND v_org.subscription_expires_at < v_now);
  
  IF v_org.subscription_expires_at IS NOT NULL THEN
    v_days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_org.subscription_expires_at - v_now)) / 86400)::integer);
  ELSE
    v_days_left := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'org_type', v_org.org_type,
    'tier', v_tier,
    'status', CASE WHEN v_is_expired THEN 'EXPIRED' ELSE COALESCE(v_org.subscription_status, 'ACTIVE') END,
    'plan', COALESCE(v_org.subscription_plan, 'MONTHLY'),
    'started_at', v_org.subscription_started_at,
    'expires_at', v_org.subscription_expires_at,
    'days_remaining', v_days_left,
    'is_expired', v_is_expired,
    'payment_reference', v_org.payment_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription(uuid) TO authenticated;

-- 5. RPC to process dummy UPI/QR payment and extend validity
CREATE OR REPLACE FUNCTION public.process_subscription_payment(
  p_organization_id uuid,
  p_tier text,
  p_cycle text,
  p_amount numeric,
  p_payment_ref text,
  p_upi_id text DEFAULT 'pay@otp'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_profile_id uuid;
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(btrim(p_cycle));
  v_tier_upper text := upper(btrim(p_tier));
BEGIN
  v_profile_id := private.get_profile_id();

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', p_organization_id;
  END IF;

  -- Verify caller is a member of this organization or platform admin
  IF NOT private.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_organization_id;
    END IF;
  END IF;

  -- Determine validity duration (Strictly 30 days for Monthly, 365 days for Yearly)
  IF v_cycle_upper = 'YEARLY' THEN
    v_validity_days := 365;
  ELSE
    v_validity_days := 30;
  END IF;

  v_prev_expires := v_org.subscription_expires_at;

  -- If current subscription is still active, extend from previous expiration; otherwise extend from now
  IF v_prev_expires IS NOT NULL AND v_prev_expires > v_now THEN
    v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
  ELSE
    v_new_expires := v_now + (v_validity_days || ' days')::interval;
  END IF;

  -- Update organization subscription state
  UPDATE public.organizations
  SET 
    subscription_tier = v_tier_upper,
    subscription_status = 'ACTIVE',
    subscription_plan = v_cycle_upper,
    subscription_started_at = COALESCE(subscription_started_at, v_now),
    subscription_expires_at = v_new_expires,
    payment_reference = p_payment_ref,
    updated_at = v_now
  WHERE id = p_organization_id;

  -- Record audit transaction
  INSERT INTO public.subscription_payment_logs (
    organization_id,
    profile_id,
    tier,
    billing_cycle,
    amount,
    currency,
    payment_method,
    upi_id,
    payment_reference,
    validity_days,
    previous_expires_at,
    new_expires_at,
    status
  ) VALUES (
    p_organization_id,
    v_profile_id,
    v_tier_upper,
    v_cycle_upper,
    p_amount,
    'INR',
    'UPI_QR',
    COALESCE(p_upi_id, 'pay@otp'),
    p_payment_ref,
    v_validity_days,
    v_prev_expires,
    v_new_expires,
    'SUCCESS'
  );

  -- Log audit event
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'subscription.renewed',
    'organization',
    p_organization_id::text,
    v_profile_id,
    jsonb_build_object(
      'tier', v_tier_upper,
      'cycle', v_cycle_upper,
      'amount', p_amount,
      'reference', p_payment_ref,
      'expires_at', v_new_expires
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'tier', v_tier_upper,
    'status', 'ACTIVE',
    'plan', v_cycle_upper,
    'amount_paid', p_amount,
    'reference', p_payment_ref,
    'new_expires_at', v_new_expires,
    'validity_days_added', v_validity_days,
    'message', 'Subscription activated successfully via UPI/QR verification'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) TO authenticated;

COMMIT;

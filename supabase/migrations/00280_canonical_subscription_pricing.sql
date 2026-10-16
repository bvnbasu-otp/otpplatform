-- subscription_plans is the canonical runtime source of subscription prices.
--
-- Before this migration three sources disagreed: subscription_plans (MSME_STARTER 999,
-- other plans 0), the registration provisioning defaults (TIER_1_MSME 100 / TIER_2_ENTERPRISE
-- 1000, written to subscription_payment_logs as a SUCCESS UPI row) and the domain
-- SUBSCRIPTION_TIERS constants (INDIVIDUAL 199, RWA 1499, MSME 1999, ENTERPRISE 4999
-- per month). No approved price is chosen or copied here. subscription_plans gains the
-- tier mapping and a yearly price; verified subscription payments must equal the mapped
-- plan price exactly, and an unmapped, inactive, mismatched-currency or non-payable plan
-- fails closed with a specific PRICE-* error until the owner seeds the plan rows.
--
-- The webhook function is wrapped rather than re-declared: the 00278 body moves to
-- private.record_verified_payment_bound unchanged, and public.record_verified_payment
-- keeps its signature and service_role-only grants.

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tier_code text,
  ADD COLUMN IF NOT EXISTS price_yearly numeric(14, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_price_yearly_nonneg'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_price_yearly_nonneg CHECK (price_yearly IS NULL OR price_yearly >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_tier_code_key
  ON public.subscription_plans (tier_code) WHERE tier_code IS NOT NULL;

CREATE OR REPLACE FUNCTION private.canonical_subscription_price(
  p_tier text,
  p_cycle text,
  p_currency text DEFAULT 'INR'
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_tier text := upper(coalesce(btrim(p_tier), ''));
  v_cycle text := upper(coalesce(btrim(p_cycle), ''));
  v_currency text := upper(coalesce(btrim(p_currency), 'INR'));
  v_plan public.subscription_plans;
  v_price numeric;
BEGIN
  IF v_cycle NOT IN ('MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'Unknown billing cycle % (PRICE-UNKNOWN-CYCLE)', v_cycle;
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE tier_code = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription_plans row is mapped to tier % (PRICE-PLAN-NOT-CONFIGURED)', v_tier;
  END IF;
  IF NOT v_plan.is_active THEN
    RAISE EXCEPTION 'Subscription plan % for tier % is inactive (PRICE-PLAN-INACTIVE)', v_plan.code, v_tier;
  END IF;
  IF upper(v_plan.currency) <> v_currency THEN
    RAISE EXCEPTION 'Plan % is priced in % but % was presented (PRICE-CURRENCY-MISMATCH)', v_plan.code, v_plan.currency, v_currency;
  END IF;

  v_price := CASE v_cycle WHEN 'MONTHLY' THEN v_plan.price_monthly ELSE v_plan.price_yearly END;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Plan % has no % price (PRICE-CYCLE-NOT-CONFIGURED)', v_plan.code, v_cycle;
  END IF;
  IF v_price <= 0 THEN
    RAISE EXCEPTION 'Plan % has a non-payable % price % (PRICE-NOT-PAYABLE)', v_plan.code, v_cycle, v_price;
  END IF;
  RETURN v_price;
END;
$$;

REVOKE ALL ON FUNCTION private.canonical_subscription_price(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.canonical_subscription_price(text, text, text) TO service_role;

-- What a client may display or send to checkout: the canonical amount only.
CREATE OR REPLACE FUNCTION public.get_canonical_subscription_price(
  p_tier text,
  p_cycle text,
  p_currency text DEFAULT 'INR'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_amount numeric := private.canonical_subscription_price(p_tier, p_cycle, p_currency);
  v_plan public.subscription_plans;
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE tier_code = upper(btrim(p_tier));
  RETURN jsonb_build_object(
    'planCode', v_plan.code,
    'tier', v_plan.tier_code,
    'cycle', upper(btrim(p_cycle)),
    'currency', v_plan.currency,
    'amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_canonical_subscription_price(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_canonical_subscription_price(text, text, text) TO authenticated, service_role;

-- Exact inconsistencies between subscription_plans and what the platform already uses.
CREATE OR REPLACE FUNCTION public.subscription_pricing_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Platform administrator required (ADMIN-ONLY)' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'plansWithoutTierMapping', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', code, 'priceMonthly', price_monthly, 'priceYearly', price_yearly) ORDER BY code)
      FROM public.subscription_plans WHERE tier_code IS NULL), '[]'::jsonb),
    'tiersInUseWithoutPlan', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tier', t.tier, 'organizations', t.n) ORDER BY t.tier)
      FROM (SELECT subscription_tier AS tier, count(*) AS n FROM public.organizations
            WHERE subscription_tier IS NOT NULL GROUP BY 1) t
      WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans p WHERE p.tier_code = t.tier)), '[]'::jsonb),
    'plansMissingYearlyPrice', COALESCE((
      SELECT jsonb_agg(code ORDER BY code) FROM public.subscription_plans
      WHERE tier_code IS NOT NULL AND price_monthly > 0 AND price_yearly IS NULL), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_pricing_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_pricing_report() TO authenticated, service_role;

-- Move the 00278 implementation behind a price-checking wrapper (replay safe).
DO $$
BEGIN
  IF to_regprocedure('private.record_verified_payment_bound(text,uuid,uuid,numeric,text,text,text,text,text,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
      SET SCHEMA private;
    ALTER FUNCTION private.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
      RENAME TO record_verified_payment_bound;
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_verified_payment(
  p_payment_type text,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_amount numeric DEFAULT 0,
  p_currency text DEFAULT 'INR'::text,
  p_gateway text DEFAULT 'RAZORPAY'::text,
  p_gateway_event_id text DEFAULT NULL::text,
  p_payment_reference text DEFAULT NULL::text,
  p_tier text DEFAULT 'TIER_1_MSME'::text,
  p_billing_cycle text DEFAULT 'MONTHLY'::text,
  p_gateway_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_expected numeric;
BEGIN
  -- A replay of an already settled event is answered by the bound function before any price
  -- check, so a later plan price change cannot turn an idempotent duplicate into an error.
  IF upper(coalesce(btrim(p_payment_type), '')) = 'SUBSCRIPTION'
     AND NOT (
       p_gateway_event_id IS NOT NULL AND (
         EXISTS (SELECT 1 FROM public.subscription_payment_logs WHERE gateway_event_id = p_gateway_event_id)
         OR EXISTS (SELECT 1 FROM public.payments WHERE gateway_event_id = p_gateway_event_id)
       )
     ) THEN
    v_expected := private.canonical_subscription_price(p_tier, p_billing_cycle, p_currency);
    IF p_amount IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Paid amount % does not equal the canonical % price % (PAY-V-PRICE-MISMATCH)',
        p_amount, upper(btrim(p_tier)), v_expected;
    END IF;
  END IF;

  RETURN private.record_verified_payment_bound(
    p_payment_type, p_organization_id, p_invoice_id, p_amount, p_currency, p_gateway,
    p_gateway_event_id, p_payment_reference, p_tier, p_billing_cycle, p_gateway_payload
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) TO service_role;

COMMIT;

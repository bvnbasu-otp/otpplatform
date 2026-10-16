-- 00289: server-authoritative no-money pilot purchase simulation.
--
-- No catalogue rows or prices are inserted or activated here. The path stays
-- fail-closed until an administrator maps an active subscription_plans row and
-- configures its GST inputs. Production can never enable this simulator.

BEGIN;

ALTER TABLE public.platform_environment_settings
  ADD COLUMN IF NOT EXISTS pilot_payment_simulation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pilot_simulated_outcome text NOT NULL DEFAULT 'FAILED';

ALTER TABLE public.platform_environment_settings
  DROP CONSTRAINT IF EXISTS platform_env_pilot_outcome_check;

UPDATE public.platform_environment_settings
SET pilot_simulated_outcome = 'FAILED'
WHERE pilot_simulated_outcome = 'FAILURE';

DO $$
BEGIN
  ALTER TABLE public.platform_environment_settings
    ADD CONSTRAINT platform_env_pilot_outcome_check
    CHECK (pilot_simulated_outcome IN ('SUCCESS', 'FAILED', 'PENDING', 'CANCELLED'));
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_env_no_production_simulator') THEN
    ALTER TABLE public.platform_environment_settings
      ADD CONSTRAINT platform_env_no_production_simulator
      CHECK (NOT (is_production AND pilot_payment_simulation_enabled));
  END IF;
END $$;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_extra_rfq numeric(14,2),
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS supplier_state_code varchar(2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_extra_rfq_nonnegative') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_extra_rfq_nonnegative
      CHECK (price_extra_rfq IS NULL OR price_extra_rfq >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_gst_rate_range') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_gst_rate_range
      CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_supplier_state_format') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_supplier_state_format
      CHECK (supplier_state_code IS NULL OR supplier_state_code ~ '^[0-9]{2}$');
  END IF;
END $$;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS purchased_rfq_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_rfq_credits_expires_at timestamptz;
ALTER TABLE public.personal_subscriptions
  ADD COLUMN IF NOT EXISTS purchased_rfq_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_rfq_credits_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_purchased_rfq_credits_nonnegative') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_purchased_rfq_credits_nonnegative CHECK (purchased_rfq_credits >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_subscriptions_purchased_rfq_credits_nonnegative') THEN
    ALTER TABLE public.personal_subscriptions
      ADD CONSTRAINT personal_subscriptions_purchased_rfq_credits_nonnegative CHECK (purchased_rfq_credits >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pilot_purchase_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES public.profiles(id),
  idempotency_key text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('EXTRA_RFQ', 'MONTHLY_SUBSCRIPTION')),
  tier_code text NOT NULL,
  plan_code text NOT NULL,
  currency text NOT NULL CHECK (currency = 'INR'),
  taxable_amount numeric(14,2) NOT NULL CHECK (taxable_amount > 0),
  tax_amount numeric(14,2) NOT NULL CHECK (tax_amount >= 0),
  gross_amount numeric(14,2) NOT NULL CHECK (gross_amount = taxable_amount + tax_amount),
  tax_breakdown jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  simulated boolean NOT NULL DEFAULT true CHECK (simulated),
  provider text NOT NULL DEFAULT 'PILOT_SIMULATOR' CHECK (provider = 'PILOT_SIMULATOR'),
  entitlement_quantity integer NOT NULL DEFAULT 0 CHECK (entitlement_quantity IN (0, 1)),
  remaining_credit integer NOT NULL DEFAULT 0 CHECK (remaining_credit IN (0, 1)),
  entitlement_expires_at timestamptz,
  credit_invalidated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(organization_id, owner_profile_id) = 1),
  UNIQUE (owner_key, idempotency_key)
);

ALTER TABLE public.pilot_purchase_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_purchase_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pilot_purchase_attempts_select ON public.pilot_purchase_attempts;
CREATE POLICY pilot_purchase_attempts_select ON public.pilot_purchase_attempts
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR private.is_buyer_scope_member(organization_id, owner_profile_id)
  );
REVOKE ALL ON public.pilot_purchase_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pilot_purchase_attempts TO authenticated;
GRANT ALL ON public.pilot_purchase_attempts TO service_role;

ALTER TABLE public.rfq_allowance_consumptions
  ADD COLUMN IF NOT EXISTS entitlement_source text NOT NULL DEFAULT 'INCLUDED_ALLOWANCE',
  ADD COLUMN IF NOT EXISTS pilot_purchase_attempt_id uuid REFERENCES public.pilot_purchase_attempts(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfq_allowance_consumptions_source_check') THEN
    ALTER TABLE public.rfq_allowance_consumptions
      ADD CONSTRAINT rfq_allowance_consumptions_source_check
      CHECK (entitlement_source IN ('INCLUDED_ALLOWANCE', 'QUARTERLY_BONUS', 'PURCHASED_EXTRA_RFQ'));
  END IF;
END $$;

UPDATE public.rfq_allowance_consumptions
SET entitlement_source = 'QUARTERLY_BONUS'
WHERE used_quarterly_bonus;

CREATE OR REPLACE FUNCTION private.classify_rfq_allowance_consumption()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entitlement_source = 'INCLUDED_ALLOWANCE' AND NEW.used_quarterly_bonus THEN
    NEW.entitlement_source := 'QUARTERLY_BONUS';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.classify_rfq_allowance_consumption() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_classify_rfq_allowance_consumption ON public.rfq_allowance_consumptions;
CREATE TRIGGER trg_classify_rfq_allowance_consumption
  BEFORE INSERT ON public.rfq_allowance_consumptions
  FOR EACH ROW EXECUTE FUNCTION private.classify_rfq_allowance_consumption();

-- Purchased credits are additional to the monthly and quarterly allowance.
-- Replace 00286's counter so purchased rows cannot accidentally consume or
-- manufacture a quarterly bonus.
CREATE OR REPLACE FUNCTION private.consume_pilot_allowance_for_quote(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_quote_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_rfq public.rfqs%ROWTYPE;
  v_used integer;
  v_bonus_used integer := 0;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := '';
  v_yearly boolean := false;
  v_found boolean := false;
  v_bonus boolean := false;
BEGIN
  IF private.is_platform_admin() THEN RETURN; END IF;
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND OR v_rfq.status = 'CANCELLED'::public.rfq_status THEN RETURN; END IF;
  IF date_trunc('month', v_rfq.created_at AT TIME ZONE 'UTC')
     IS DISTINCT FROM date_trunc('month', now() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Pilot Allowance: this quote is outside the RFQ''s UTC month, and that boundary is not an approved charging rule.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_PERIOD_UNDECIDED';
  END IF;
  IF v_rfq.organization_id IS NOT NULL THEN
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at, upper(btrim(COALESCE(org_type::text, '')))
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.organizations WHERE id = v_rfq.organization_id FOR UPDATE;
    v_found := FOUND;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_rfq.owner_profile_id::text, 0));
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at, 'INDIVIDUAL'
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.personal_subscriptions WHERE profile_id = v_rfq.owner_profile_id;
    v_found := FOUND;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rfq_allowance_consumptions WHERE rfq_id = p_rfq_id) THEN
    RETURN;
  END IF;
  IF v_found THEN
    v_yearly := v_plan = 'YEARLY' AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;
  SELECT count(*)::integer INTO v_used
  FROM public.rfq_allowance_consumptions
  WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
    AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
    AND consumed_at >= v_month_start
    AND consumed_at < v_month_start + interval '1 month'
    AND entitlement_source IN ('INCLUDED_ALLOWANCE', 'QUARTERLY_BONUS');
  IF v_used < v_allowance THEN
    INSERT INTO public.rfq_allowance_consumptions (
      rfq_id, organization_id, owner_profile_id, quote_id, quote_version_id,
      used_quarterly_bonus, qualification_reason
    ) VALUES (
      p_rfq_id, v_rfq.organization_id, v_rfq.owner_profile_id,
      p_quote_id, p_quote_version_id, false, 'FIRST_QUALIFYING_QUOTE'
    );
    RETURN;
  END IF;
  IF v_yearly AND v_used = v_allowance THEN
    SELECT count(*)::integer INTO v_bonus_used
    FROM public.rfq_allowance_consumptions
    WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
      AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
      AND consumed_at >= v_quarter_start
      AND consumed_at < v_quarter_start + interval '3 months'
      AND entitlement_source = 'QUARTERLY_BONUS';
    IF v_bonus_used < 1 THEN v_bonus := true; END IF;
  END IF;
  IF v_bonus THEN
    INSERT INTO public.rfq_allowance_consumptions (
      rfq_id, organization_id, owner_profile_id, quote_id, quote_version_id,
      used_quarterly_bonus, qualification_reason
    ) VALUES (
      p_rfq_id, v_rfq.organization_id, v_rfq.owner_profile_id,
      p_quote_id, p_quote_version_id, true, 'FIRST_QUALIFYING_QUOTE'
    );
    RETURN;
  END IF;
  IF v_yearly THEN
    RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). The yearly plan quarterly bonus RFQ for this UTC calendar quarter is already used and does not carry into the next month.', v_allowance
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;
  RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). You have used all RFQs in this month''s pilot allowance. It resets on the 1st of next month.', v_allowance
    USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
EXCEPTION WHEN unique_violation THEN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_pilot_allowance_for_quote(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.pilot_gst_breakdown(
  p_taxable numeric,
  p_gst_rate numeric,
  p_supplier_state text,
  p_buyer_state text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_supplier text := btrim(COALESCE(p_supplier_state, ''));
  v_buyer text := btrim(COALESCE(p_buyer_state, ''));
  v_taxable numeric(14,2) := round(p_taxable, 2);
  v_rate numeric(5,2) := round(p_gst_rate, 2);
  v_tax numeric(14,2) := round(v_taxable * v_rate / 100, 2);
  v_cgst numeric(14,2);
  v_sgst numeric(14,2);
  v_utgst numeric(14,2);
  v_igst numeric(14,2);
BEGIN
  IF v_taxable <= 0 OR v_rate < 0 OR v_rate > 100
     OR v_supplier !~ '^[0-9]{2}$' OR v_buyer !~ '^[0-9]{2}$' THEN
    RAISE EXCEPTION 'Canonical GST inputs are incomplete or invalid (PILOT-TAX-NOT-CONFIGURED)'
      USING ERRCODE = '22023';
  END IF;
  -- Reuse the canonical split introduced in 00253. This wrapper only validates
  -- checkout inputs and assembles the immutable purchase tax snapshot.
  SELECT cgst, sgst, utgst, igst
  INTO v_cgst, v_sgst, v_utgst, v_igst
  FROM private.gst_component_split(v_tax, v_supplier <> v_buyer, v_buyer);

  RETURN jsonb_build_object(
    'taxableAmount', v_taxable, 'gstRate', v_rate,
    'cgstAmount', v_cgst, 'sgstAmount', v_sgst,
    'utgstAmount', v_utgst, 'igstAmount', v_igst, 'taxAmount', v_tax,
    'grossAmount', v_taxable + v_tax,
    'taxStructure', CASE
      WHEN v_igst > 0 THEN 'IGST'
      WHEN v_utgst > 0 THEN 'CGST_UTGST'
      ELSE 'CGST_SGST'
    END,
    'supplierStateCode', v_supplier, 'placeOfSupplyStateCode', v_buyer
  );
END;
$$;

REVOKE ALL ON FUNCTION private.pilot_gst_breakdown(numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_purchased_rfq_entitlement_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (
       NEW.purchased_rfq_credits IS DISTINCT FROM OLD.purchased_rfq_credits
       OR NEW.purchased_rfq_credits_expires_at IS DISTINCT FROM OLD.purchased_rfq_credits_expires_at
     ) THEN
    RAISE EXCEPTION 'Purchased RFQ entitlements are server-owned (PURCHASED-ENTITLEMENT-IMMUTABLE)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_purchased_rfq_entitlement_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_purchased_rfq_entitlement_fields() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_purchased_rfq_entitlement ON public.organizations;
CREATE TRIGGER trg_guard_purchased_rfq_entitlement
  BEFORE UPDATE OF purchased_rfq_credits, purchased_rfq_credits_expires_at ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.guard_purchased_rfq_entitlement_fields();
DROP TRIGGER IF EXISTS trg_guard_purchased_rfq_entitlement ON public.personal_subscriptions;
CREATE TRIGGER trg_guard_purchased_rfq_entitlement
  BEFORE UPDATE OF purchased_rfq_credits, purchased_rfq_credits_expires_at ON public.personal_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.guard_purchased_rfq_entitlement_fields();

CREATE OR REPLACE FUNCTION public.process_pilot_simulated_purchase(
  p_organization_id uuid,
  p_product_type text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_owner uuid;
  v_owner_key text;
  v_tier text;
  v_buyer_state text;
  v_plan public.subscription_plans%ROWTYPE;
  v_product text := upper(btrim(COALESCE(p_product_type, '')));
  v_base numeric;
  v_tax jsonb;
  v_attempt public.pilot_purchase_attempts%ROWTYPE;
  v_env public.platform_environment_settings%ROWTYPE;
  v_expires timestamptz;
  v_prev_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required (PILOT-PURCHASE-AUTH)' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'A bounded idempotency key is required (PILOT-PURCHASE-IDEMPOTENCY)'
      USING ERRCODE = '22023';
  END IF;
  IF v_product NOT IN ('EXTRA_RFQ', 'MONTHLY_SUBSCRIPTION') THEN
    RAISE EXCEPTION 'Unsupported pilot product (PILOT-PRODUCT-UNSUPPORTED)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_env FROM public.platform_environment_settings WHERE id = 'current' FOR SHARE;
  IF NOT FOUND OR v_env.is_production OR v_env.environment = 'PRODUCTION'
     OR NOT v_env.pilot_payment_simulation_enabled THEN
    RAISE EXCEPTION 'Pilot payment simulation is disabled (PILOT-SIMULATION-DISABLED)'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    IF NOT private.is_personal_buyer_profile(v_actor) THEN
      RAISE EXCEPTION 'A personal purchase requires an Individual buyer (PILOT-PURCHASE-SCOPE)'
        USING ERRCODE = '42501';
    END IF;
    v_owner := v_actor;
    v_owner_key := 'PROFILE:' || v_owner;
    v_tier := 'INDIVIDUAL';
    SELECT state_code INTO v_buyer_state
    FROM public.buyer_addresses
    WHERE profile_id = v_owner AND organization_id IS NULL AND is_active AND is_primary
    LIMIT 1;
    PERFORM pg_advisory_xact_lock(hashtextextended('pilot-purchase:' || v_owner_key, 0));
  ELSE
    IF NOT private.is_buyer_scope_manager(p_organization_id, NULL) THEN
      RAISE EXCEPTION 'Buyer manager authority is required (PILOT-PURCHASE-SCOPE)'
        USING ERRCODE = '42501';
    END IF;
    v_owner_key := 'ORG:' || p_organization_id;
    SELECT CASE org_type::text
             WHEN 'COMMUNITY' THEN 'RWA'
             WHEN 'MSME' THEN 'MSME'
             ELSE NULL
           END,
           state_code
      INTO v_tier, v_buyer_state
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;
    IF v_tier IS NULL THEN
      RAISE EXCEPTION 'Organization is not an RWA or MSME buyer (PILOT-PURCHASE-SCOPE)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_attempt
  FROM public.pilot_purchase_attempts
  WHERE owner_key = v_owner_key AND idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', v_attempt.status = 'SUCCEEDED',
      'duplicate', true,
      'attemptId', v_attempt.id,
      'status', v_attempt.status,
      'simulated', true,
      'entitlementGranted', v_attempt.entitlement_quantity = 1,
      'expiresAt', v_attempt.entitlement_expires_at
    );
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE tier_code = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No canonical plan is mapped for % (PRICE-PLAN-NOT-CONFIGURED)', v_tier;
  END IF;
  IF NOT v_plan.is_active THEN
    RAISE EXCEPTION 'Canonical plan is inactive (PRICE-PLAN-INACTIVE)';
  END IF;
  IF upper(v_plan.currency) <> 'INR' THEN
    RAISE EXCEPTION 'Canonical plan currency must be INR (PRICE-CURRENCY-MISMATCH)';
  END IF;
  v_base := CASE v_product
    WHEN 'EXTRA_RFQ' THEN v_plan.price_extra_rfq
    ELSE v_plan.price_monthly
  END;
  IF v_base IS NULL OR v_base <= 0 THEN
    RAISE EXCEPTION 'Canonical pilot product price is not payable (PRICE-NOT-PAYABLE)';
  END IF;
  IF v_plan.gst_rate IS NULL OR v_plan.supplier_state_code IS NULL OR v_buyer_state IS NULL THEN
    RAISE EXCEPTION 'Canonical GST inputs are not configured (PILOT-TAX-NOT-CONFIGURED)';
  END IF;
  v_tax := private.pilot_gst_breakdown(v_base, v_plan.gst_rate, v_plan.supplier_state_code, v_buyer_state);

  INSERT INTO public.pilot_purchase_attempts (
    owner_key, organization_id, owner_profile_id, initiated_by, idempotency_key,
    product_type, tier_code, plan_code, currency, taxable_amount, tax_amount,
    gross_amount, tax_breakdown, status
  ) VALUES (
    v_owner_key, p_organization_id, v_owner, v_actor, btrim(p_idempotency_key),
    v_product, v_tier, v_plan.code, 'INR', v_base,
    (v_tax->>'taxAmount')::numeric, (v_tax->>'grossAmount')::numeric,
    v_tax, 'INITIATED'
  ) RETURNING * INTO v_attempt;

  IF v_env.pilot_simulated_outcome <> 'SUCCESS' THEN
    UPDATE public.pilot_purchase_attempts
    SET status = v_env.pilot_simulated_outcome,
        completed_at = CASE WHEN v_env.pilot_simulated_outcome IN ('FAILED', 'CANCELLED') THEN now() ELSE NULL END
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;
    RETURN jsonb_build_object(
      'ok', false, 'attemptId', v_attempt.id, 'status', v_attempt.status,
      'simulated', true, 'entitlementGranted', false
    );
  END IF;

  IF p_organization_id IS NULL THEN
    SELECT subscription_expires_at INTO v_prev_expires
    FROM public.personal_subscriptions WHERE profile_id = v_owner FOR UPDATE;
  ELSE
    SELECT subscription_expires_at INTO v_prev_expires
    FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  END IF;

  IF v_product = 'EXTRA_RFQ' THEN
    IF v_prev_expires IS NULL OR v_prev_expires <= now() THEN
      RAISE EXCEPTION 'An active subscription is required for an extra RFQ credit (PILOT-SUBSCRIPTION-INACTIVE)';
    END IF;
    v_expires := v_prev_expires;
    IF p_organization_id IS NULL THEN
      UPDATE public.personal_subscriptions
      SET purchased_rfq_credits = purchased_rfq_credits + 1,
          purchased_rfq_credits_expires_at = v_expires,
          updated_at = now()
      WHERE profile_id = v_owner;
    ELSE
      UPDATE public.organizations
      SET purchased_rfq_credits = purchased_rfq_credits + 1,
          purchased_rfq_credits_expires_at = v_expires,
          updated_at = now()
      WHERE id = p_organization_id;
    END IF;
  ELSE
    v_expires := CASE
      WHEN v_prev_expires IS NOT NULL AND v_prev_expires > now()
        THEN v_prev_expires + interval '1 month'
      ELSE now() + interval '1 month'
    END;
    -- Credits belong to the prior subscription period and never transfer.
    UPDATE public.pilot_purchase_attempts
    SET remaining_credit = 0, credit_invalidated_at = now()
    WHERE owner_key = v_owner_key
      AND product_type = 'EXTRA_RFQ'
      AND remaining_credit > 0;
    IF p_organization_id IS NULL THEN
      UPDATE public.personal_subscriptions
      SET subscription_tier = v_tier, subscription_plan = 'MONTHLY',
          subscription_status = 'ACTIVE', subscription_expires_at = v_expires,
          payment_reference = 'PILOT-SIMULATED:' || v_attempt.id,
          purchased_rfq_credits = 0,
          purchased_rfq_credits_expires_at = v_expires,
          updated_at = now()
      WHERE profile_id = v_owner;
    ELSE
      UPDATE public.organizations
      SET subscription_tier = v_tier, subscription_plan = 'MONTHLY',
          subscription_status = 'ACTIVE', subscription_expires_at = v_expires,
          payment_reference = 'PILOT-SIMULATED:' || v_attempt.id,
          purchased_rfq_credits = 0,
          purchased_rfq_credits_expires_at = v_expires,
          updated_at = now()
      WHERE id = p_organization_id;
    END IF;
  END IF;

  UPDATE public.pilot_purchase_attempts
  SET status = 'SUCCEEDED',
      entitlement_quantity = 1,
      remaining_credit = CASE WHEN v_product = 'EXTRA_RFQ' THEN 1 ELSE 0 END,
      entitlement_expires_at = v_expires,
      completed_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES (
    'PILOT_PURCHASE_SIMULATED', v_actor, p_organization_id,
    'PILOT_PURCHASE_ATTEMPT', v_attempt.id::text,
    jsonb_build_object(
      'productType', v_product, 'tier', v_tier, 'simulated', true,
      'moneyCollected', false, 'taxableAmount', v_base,
      'taxAmount', v_tax->'taxAmount', 'grossAmount', v_tax->'grossAmount',
      'expiresAt', v_expires
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'attemptId', v_attempt.id, 'status', 'SUCCEEDED',
    'simulated', true, 'moneyCollected', false, 'entitlementGranted', true,
    'productType', v_product, 'currency', 'INR',
    'taxableAmount', v_base, 'taxAmount', v_tax->'taxAmount',
    'grossAmount', v_tax->'grossAmount', 'taxBreakdown', v_tax,
    'expiresAt', v_expires
  );
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_attempt
  FROM public.pilot_purchase_attempts
  WHERE owner_key = v_owner_key AND idempotency_key = btrim(p_idempotency_key);
  RETURN jsonb_build_object(
    'ok', v_attempt.status = 'SUCCEEDED', 'duplicate', true,
    'attemptId', v_attempt.id, 'status', v_attempt.status,
    'simulated', true, 'entitlementGranted', v_attempt.entitlement_quantity = 1,
    'expiresAt', v_attempt.entitlement_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_pilot_simulated_purchase(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pilot_simulated_purchase(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.consume_purchased_rfq_credit_if_needed(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_quote_version_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_rfq public.rfqs%ROWTYPE;
  v_used integer;
  v_bonus_used integer := 0;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := '';
  v_yearly boolean := false;
  v_credits integer := 0;
  v_credit_expires timestamptz;
  v_attempt_id uuid;
BEGIN
  IF private.is_platform_admin() THEN RETURN false; END IF;
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND OR v_rfq.status = 'CANCELLED'::public.rfq_status THEN RETURN false; END IF;
  IF date_trunc('month', v_rfq.created_at AT TIME ZONE 'UTC')
     IS DISTINCT FROM date_trunc('month', now() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Pilot Allowance: this quote is outside the RFQ''s UTC month, and that boundary is not an approved charging rule.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_PERIOD_UNDECIDED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rfq_allowance_consumptions WHERE rfq_id = p_rfq_id) THEN
    RETURN false;
  END IF;

  IF v_rfq.organization_id IS NOT NULL THEN
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at, upper(btrim(COALESCE(org_type::text, ''))),
           purchased_rfq_credits, purchased_rfq_credits_expires_at
      INTO v_plan, v_status, v_expires, v_org_type, v_credits, v_credit_expires
    FROM public.organizations WHERE id = v_rfq.organization_id FOR UPDATE;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_rfq.owner_profile_id::text, 0));
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at, 'INDIVIDUAL',
           purchased_rfq_credits, purchased_rfq_credits_expires_at
      INTO v_plan, v_status, v_expires, v_org_type, v_credits, v_credit_expires
    FROM public.personal_subscriptions WHERE profile_id = v_rfq.owner_profile_id FOR UPDATE;
  END IF;
  v_yearly := v_plan = 'YEARLY' AND v_status = 'ACTIVE'
    AND (v_expires IS NULL OR v_expires >= now())
    AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');

  SELECT count(*)::integer INTO v_used
  FROM public.rfq_allowance_consumptions
  WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
    AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
    AND consumed_at >= v_month_start
    AND consumed_at < v_month_start + interval '1 month'
    AND entitlement_source IN ('INCLUDED_ALLOWANCE', 'QUARTERLY_BONUS');
  IF v_used < v_allowance THEN RETURN false; END IF;

  IF v_yearly AND v_used = v_allowance THEN
    SELECT count(*)::integer INTO v_bonus_used
    FROM public.rfq_allowance_consumptions
    WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
      AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
      AND consumed_at >= v_quarter_start
      AND consumed_at < v_quarter_start + interval '3 months'
      AND entitlement_source = 'QUARTERLY_BONUS';
    IF v_bonus_used < 1 THEN RETURN false; END IF;
  END IF;

  IF COALESCE(v_credits, 0) <= 0 OR v_credit_expires IS NULL OR v_credit_expires <= now() THEN
    RETURN false;
  END IF;
  SELECT id INTO v_attempt_id
  FROM public.pilot_purchase_attempts
  WHERE owner_key = CASE WHEN v_rfq.organization_id IS NULL
                          THEN 'PROFILE:' || v_rfq.owner_profile_id
                          ELSE 'ORG:' || v_rfq.organization_id END
    AND product_type = 'EXTRA_RFQ'
    AND status = 'SUCCEEDED'
    AND remaining_credit = 1
    AND entitlement_expires_at > now()
  ORDER BY completed_at, id
  LIMIT 1
  FOR UPDATE;
  IF v_attempt_id IS NULL THEN RETURN false; END IF;

  IF v_rfq.organization_id IS NULL THEN
    UPDATE public.personal_subscriptions
    SET purchased_rfq_credits = purchased_rfq_credits - 1, updated_at = now()
    WHERE profile_id = v_rfq.owner_profile_id
      AND purchased_rfq_credits > 0
      AND purchased_rfq_credits_expires_at > now();
  ELSE
    UPDATE public.organizations
    SET purchased_rfq_credits = purchased_rfq_credits - 1, updated_at = now()
    WHERE id = v_rfq.organization_id
      AND purchased_rfq_credits > 0
      AND purchased_rfq_credits_expires_at > now();
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.pilot_purchase_attempts
  SET remaining_credit = 0
  WHERE id = v_attempt_id AND remaining_credit = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchased RFQ credit ledger is inconsistent (PILOT-CREDIT-INCONSISTENT)';
  END IF;

  INSERT INTO public.rfq_allowance_consumptions (
    rfq_id, organization_id, owner_profile_id, quote_id, quote_version_id,
    used_quarterly_bonus, qualification_reason, entitlement_source,
    pilot_purchase_attempt_id
  ) VALUES (
    p_rfq_id, v_rfq.organization_id, v_rfq.owner_profile_id,
    p_quote_id, p_quote_version_id, false, 'FIRST_QUALIFYING_QUOTE',
    'PURCHASED_EXTRA_RFQ', v_attempt_id
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_purchased_rfq_credit_if_needed(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.trg_apply_purchased_rfq_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = NEW.quote_id;
  IF v_quote.status IN ('SUBMITTED', 'REVISED', 'FINAL')
     AND private.quote_is_comparison_eligible(v_quote.id, NEW.snapshot) THEN
    PERFORM private.consume_purchased_rfq_credit_if_needed(v_quote.rfq_id, v_quote.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_apply_purchased_rfq_credit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_a_apply_purchased_rfq_credit ON public.quote_versions;
CREATE TRIGGER trg_a_apply_purchased_rfq_credit
  AFTER INSERT ON public.quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.trg_apply_purchased_rfq_credit();

-- Canonical read for the buyer display and publish gate. It does not consume.
CREATE OR REPLACE FUNCTION public.get_buyer_pilot_allowance(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_owner_key text;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := 'INDIVIDUAL';
  v_credits integer := 0;
  v_credit_expires timestamptz;
  v_found boolean := false;
  v_yearly boolean := false;
  v_month_used integer := 0;
  v_bonus_used integer := 0;
  v_open_attempts integer := 0;
  v_usable integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF p_organization_id IS NOT NULL THEN
    IF NOT private.is_org_member(p_organization_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
    END IF;
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           upper(btrim(COALESCE(org_type::text, ''))),
           purchased_rfq_credits,
           purchased_rfq_credits_expires_at
      INTO v_plan, v_status, v_expires, v_org_type, v_credits, v_credit_expires
    FROM public.organizations
    WHERE id = p_organization_id;
    v_found := FOUND;
    v_owner_key := 'ORG:' || p_organization_id::text;
  ELSE
    IF NOT private.is_personal_buyer_profile(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Individual buyer scope required');
    END IF;
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           purchased_rfq_credits,
           purchased_rfq_credits_expires_at
      INTO v_plan, v_status, v_expires, v_credits, v_credit_expires
    FROM public.personal_subscriptions
    WHERE profile_id = v_actor;
    v_found := FOUND;
    v_org_type := 'INDIVIDUAL';
    v_owner_key := 'PROFILE:' || v_actor::text;
  END IF;

  IF v_found THEN
    v_yearly := v_plan = 'YEARLY'
      AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;

  SELECT count(*)::integer INTO v_month_used
  FROM public.rfq_allowance_consumptions
  WHERE organization_id IS NOT DISTINCT FROM p_organization_id
    AND owner_profile_id IS NOT DISTINCT FROM CASE WHEN p_organization_id IS NULL THEN v_actor ELSE NULL::uuid END
    AND consumed_at >= v_month_start
    AND consumed_at < v_month_start + interval '1 month'
    AND entitlement_source IN ('INCLUDED_ALLOWANCE', 'QUARTERLY_BONUS');

  SELECT count(*)::integer INTO v_bonus_used
  FROM public.rfq_allowance_consumptions
  WHERE organization_id IS NOT DISTINCT FROM p_organization_id
    AND owner_profile_id IS NOT DISTINCT FROM CASE WHEN p_organization_id IS NULL THEN v_actor ELSE NULL::uuid END
    AND consumed_at >= v_quarter_start
    AND consumed_at < v_quarter_start + interval '3 months'
    AND entitlement_source = 'QUARTERLY_BONUS';

  IF COALESCE(v_credits, 0) > 0 AND v_credit_expires IS NOT NULL AND v_credit_expires > now() THEN
    SELECT count(*)::integer INTO v_open_attempts
    FROM public.pilot_purchase_attempts
    WHERE owner_key = v_owner_key
      AND product_type = 'EXTRA_RFQ'
      AND status = 'SUCCEEDED'
      AND remaining_credit = 1
      AND entitlement_expires_at > now();
    v_usable := LEAST(v_credits, COALESCE(v_open_attempts, 0));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'includedAndBonusUsedThisMonth', v_month_used,
    'quarterlyBonusUsed', v_bonus_used,
    'purchasedCredits', v_usable,
    'subscriptionPlan', NULLIF(v_plan, ''),
    'subscriptionStatus', CASE WHEN v_found THEN NULLIF(v_status, '') ELSE NULL END,
    'subscriptionExpiresAt', v_expires,
    'orgType', NULLIF(v_org_type, ''),
    'canAcceptNextQuote',
      v_month_used < 3
      OR (v_yearly AND v_month_used = 3 AND v_bonus_used < 1)
      OR v_usable > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_buyer_pilot_allowance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buyer_pilot_allowance(uuid) TO authenticated;

COMMIT;

-- Complete EULA enforcement paths, remove fabricated provisioning payments, personal
-- subscription settlement (continues 00279 / 00280 / 00282).
--
-- 1. Legal gate: supplier order acceptance and supplier fulfilment writes
--    (purchase_orders, work_orders, invoices by the supplier) now need the Supplier EULA,
--    and buyer payments (payments) need the Customer EULA, in addition to the 00279 tables.
--    The acting role is derived from the row and the caller's memberships, never from the
--    client. Service/background contexts and platform admins stay exempt (see 00279).
-- 2. Provisioning no longer writes a SUCCESS payment log from the hard-coded 100 / 1000
--    registration amounts. Organization onboarding keeps its complimentary period but
--    records no payment that never happened.
-- 3. Personal subscriptions settle through record_verified_personal_subscription_payment
--    (service_role only), against the canonical subscription_plans price, idempotently.

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_type text;
  v_acting boolean := false;
  v_status text;
  v_org uuid;
  v_po_org uuid;
  v_po_owner uuid;
  v_po_supplier uuid;
BEGIN
  IF v_actor IS NULL OR private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'rfqs', 'requirements' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.created_by = v_actor OR NEW.owner_profile_id = v_actor OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = v_actor AND om.organization_id = NEW.organization_id);
    WHEN 'awards' THEN
      v_type := 'CUSTOMER_EULA';
      SELECT r.organization_id INTO v_org FROM public.rfqs r WHERE r.id = NEW.rfq_id;
      v_acting := NEW.awarded_by = v_actor OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = v_actor AND om.organization_id = v_org);
    WHEN 'purchase_orders' THEN
      -- A purchase order is written by its buyer (create/cancel) or its supplier (accept/reject).
      IF NEW.owner_profile_id = v_actor OR EXISTS (
           SELECT 1 FROM public.organization_members om
           WHERE om.profile_id = v_actor AND om.organization_id = NEW.organization_id) THEN
        v_type := 'CUSTOMER_EULA';
        v_acting := true;
      ELSIF EXISTS (SELECT 1 FROM public.supplier_users su
                    WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id) THEN
        v_type := 'SUPPLIER_EULA';
        v_acting := true;
      END IF;
    WHEN 'work_orders' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (SELECT 1 FROM public.supplier_users su
                          WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'invoices' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (SELECT 1 FROM public.supplier_users su
                          WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'payments' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.recorded_by = v_actor;
    WHEN 'quotes' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (
        SELECT 1 FROM public.supplier_users su
        WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'quote_versions' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := NEW.created_by = v_actor;
    ELSE
      RAISE EXCEPTION 'enforce_legal_acceptance is not configured for table %', TG_TABLE_NAME;
  END CASE;

  IF NOT COALESCE(v_acting, false) THEN
    RETURN NEW;
  END IF;

  v_status := private.legal_acceptance_status(v_actor, v_type, now());
  IF v_status IN ('ACCEPTED', 'GRACE', 'NOT_ENFORCED') THEN
    RETURN NEW;
  END IF;
  IF v_status = 'MISCONFIGURED' THEN
    RAISE EXCEPTION 'Legal enforcement is enabled without a valid rollout timestamp (LEGAL_ENFORCEMENT_MISCONFIGURED)'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'You must accept the current % before this action (LEGAL_ACCEPTANCE_REQUIRED)', v_type
    USING ERRCODE = '42501',
          HINT = 'Open the agreement prompt and accept the current version.';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_legal_acceptance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.work_orders;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.invoices;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.payments;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();

-- Provisioning: no fabricated payment log.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(p_proc regprocedure, p_old text[], p_new text[], p_marker text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text := pg_get_functiondef(p_proc);
  v_rx text;
  v_count integer;
  i integer;
BEGIN
  IF position(p_marker IN v_def) > 0 THEN
    RETURN;
  END IF;
  FOR i IN 1 .. array_length(p_old, 1) LOOP
    v_rx := regexp_replace(
              regexp_replace(p_old[i], '([.\[\]\(\)\{\}\*\+\?\^\$\|\\])', '\\\1', 'g'),
              '\s+', '\s+', 'g');
    SELECT count(*) INTO v_count FROM regexp_matches(v_def, v_rx, 'g');
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'patch % fragment % matched % times (expected exactly 1)', p_proc, i, v_count;
    END IF;
    v_def := regexp_replace(v_def, v_rx, replace(replace(p_new[i], '\', '\\'), '&', '\&'));
  END LOOP;
  EXECUTE v_def;
END;
$$;

SELECT pg_temp.patch_fn(
  'private.provision_signup_request(uuid, uuid, text, boolean)'::regprocedure,
  ARRAY[
    'BEGIN
      INSERT INTO public.subscription_payment_logs (
        organization_id, profile_id, tier, billing_cycle,
        amount, currency, payment_method, upi_id,
        payment_reference, validity_days, previous_expires_at, new_expires_at, status, created_at
      ) VALUES (
        v_org_id, v_profile_id, v_sub_tier, ''MONTHLY'',
        v_sub_amount, ''INR'', ''UPI_QR'', ''pay@otp'',
        ''REG-ONBOARD-M1'', 30, v_sub_started_at, v_sub_expires_at, ''SUCCESS'', v_sub_started_at
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;'
  ],
  ARRAY[
    '-- Complimentary onboarding period only: no payment was collected, so no payment log is written.
    NULL;'
  ],
  'no payment was collected, so no payment log is written');

CREATE TABLE IF NOT EXISTS public.personal_subscription_payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  gateway text,
  gateway_event_id text NOT NULL UNIQUE,
  payment_reference text,
  previous_expires_at timestamptz,
  new_expires_at timestamptz NOT NULL,
  gateway_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_subscription_payment_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_subscription_payment_logs_own ON public.personal_subscription_payment_logs;
CREATE POLICY personal_subscription_payment_logs_own ON public.personal_subscription_payment_logs FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id() OR private.is_platform_admin());
REVOKE ALL ON public.personal_subscription_payment_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.personal_subscription_payment_logs TO authenticated;
GRANT ALL ON public.personal_subscription_payment_logs TO service_role;

CREATE OR REPLACE FUNCTION public.record_verified_personal_subscription_payment(
  p_profile_id uuid,
  p_amount numeric,
  p_currency text,
  p_gateway text,
  p_gateway_event_id text,
  p_payment_reference text,
  p_tier text,
  p_billing_cycle text,
  p_gateway_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_cycle text := upper(coalesce(btrim(p_billing_cycle), ''));
  v_expected numeric;
  v_sub public.personal_subscriptions;
  v_now timestamptz := now();
  v_days integer;
  v_new_expires timestamptz;
  v_prev timestamptz;
  v_log_id uuid;
BEGIN
  IF p_gateway_event_id IS NULL OR btrim(p_gateway_event_id) = '' THEN
    RAISE EXCEPTION 'gateway_event_id is required for idempotent settlement (PAY-V-EVENT-ID-REQUIRED)';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Verified payment amount must be greater than 0 (PAY-V-INVALID-AMOUNT)';
  END IF;

  SELECT id INTO v_log_id FROM public.personal_subscription_payment_logs WHERE gateway_event_id = p_gateway_event_id;
  IF v_log_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'log_id', v_log_id,
                              'message', 'Payment webhook already processed (idempotent duplicate)');
  END IF;

  IF NOT private.is_personal_buyer_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Profile % is not an Individual buyer account (PAY-V-NOT-PERSONAL)', p_profile_id;
  END IF;

  v_expected := private.canonical_subscription_price(p_tier, v_cycle, p_currency);
  IF p_amount IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Paid amount % does not equal the canonical % price % (PAY-V-PRICE-MISMATCH)',
      p_amount, upper(btrim(p_tier)), v_expected;
  END IF;

  v_days := CASE WHEN v_cycle = 'YEARLY' THEN 365 ELSE 30 END;
  SELECT * INTO v_sub FROM public.personal_subscriptions WHERE profile_id = p_profile_id FOR UPDATE;
  v_prev := v_sub.subscription_expires_at;
  IF v_prev IS NULL OR v_prev < v_now THEN
    v_new_expires := v_now + make_interval(days => v_days);
  ELSE
    v_new_expires := v_prev + make_interval(days => v_days);
  END IF;

  INSERT INTO public.personal_subscriptions (
    profile_id, subscription_tier, subscription_plan, subscription_status,
    subscription_started_at, subscription_expires_at, payment_reference, updated_at
  ) VALUES (
    p_profile_id, upper(btrim(p_tier)), v_cycle, 'ACTIVE', v_now, v_new_expires,
    coalesce(p_payment_reference, p_gateway_event_id), v_now
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET subscription_tier = EXCLUDED.subscription_tier,
      subscription_plan = EXCLUDED.subscription_plan,
      subscription_status = 'ACTIVE',
      subscription_expires_at = EXCLUDED.subscription_expires_at,
      payment_reference = EXCLUDED.payment_reference,
      updated_at = v_now;

  INSERT INTO public.personal_subscription_payment_logs (
    profile_id, tier, billing_cycle, amount, currency, gateway, gateway_event_id,
    payment_reference, previous_expires_at, new_expires_at, gateway_payload
  ) VALUES (
    p_profile_id, upper(btrim(p_tier)), v_cycle, p_amount, upper(btrim(coalesce(p_currency, 'INR'))), p_gateway,
    p_gateway_event_id, coalesce(p_payment_reference, p_gateway_event_id), v_prev, v_new_expires, p_gateway_payload
  ) RETURNING id INTO v_log_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)
  VALUES ('PERSONAL_SUBSCRIPTION_PAYMENT_VERIFIED', 'PROFILE', p_profile_id::text,
          jsonb_build_object('tier', upper(btrim(p_tier)), 'cycle', v_cycle, 'amount', p_amount,
                             'gateway_event_id', p_gateway_event_id, 'expires_at', v_new_expires),
          p_profile_id);

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id, 'profile_id', p_profile_id,
                            'tier', upper(btrim(p_tier)), 'plan', v_cycle, 'expires_at', v_new_expires);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', true, 'duplicate', true,
                            'message', 'Payment webhook already processed (idempotent duplicate)');
END;
$function$;

REVOKE ALL ON FUNCTION public.record_verified_personal_subscription_payment(uuid, numeric, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_personal_subscription_payment(uuid, numeric, text, text, text, text, text, text, jsonb)
  TO service_role;

COMMIT;

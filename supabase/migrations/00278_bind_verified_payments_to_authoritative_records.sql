-- Bind verified gateway payments to authoritative records (audit finding FIN-1).
--
-- Runtime check on a database built from migrations 00001-00277 also showed
-- that the previous function could not settle at all: the invoice branch cast
-- the method to payment_method 'ONLINE' (enum is MANUAL, UPI, BANK_TRANSFER,
-- OTHER) and the subscription branch read organizations.created_by (no such
-- column). Gateway settlements are now recorded with method OTHER and the
-- gateway column, and the audit actor is the organization owner.
--
-- A valid webhook signature proves who sent the event, not that the amount,
-- currency, tenant or invoice are the ones OTP expects. record_verified_payment
-- previously accepted any amount (including zero or negative), marked an
-- invoice PAID without checking its status or balance, inserted the payment
-- without a payment allocation (so paid_amount/balance_due never moved) and
-- trusted the organization from the payload.
--
-- Invoice settlement now follows the same rules as record_invoice_payment_atomic:
--   * invoice exists, is locked, and is APPROVED or PARTIALLY_PAID
--   * amount > 0, currency equals the invoice currency, amount <= balance due
--   * a supplied organization must own the purchase order the invoice belongs to
--   * a payment_allocations row is written and the existing sync trigger moves
--     invoice paid_amount, balance_due and status
-- Subscription settlement validates amount > 0, INR, a known tier and billing
-- cycle, and an unblocked organization. The authoritative price for a tier is
-- NOT enforced: subscription_plans (MSME_STARTER 999) and the provisioning
-- defaults (TIER_1_MSME 100 / TIER_2_ENTERPRISE 1000) disagree, so the amount
-- check is a floor until the owner confirms the price source.
-- A gateway event id is mandatory so replays are always idempotent, and a
-- concurrent replay that loses the unique-index race is reported as a duplicate.

BEGIN;

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
  v_org organizations%ROWTYPE;
  v_inv RECORD;
  v_po_org uuid;
  v_po_id uuid;
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(coalesce(btrim(p_billing_cycle), 'MONTHLY'));
  v_tier_upper text := upper(coalesce(btrim(p_tier), 'TIER_1_MSME'));
  v_currency text := upper(coalesce(btrim(p_currency), 'INR'));
  v_type text := upper(coalesce(btrim(p_payment_type), ''));
  v_existing_log_id uuid;
  v_existing_payment_id uuid;
  v_recorder uuid;
BEGIN
  IF p_gateway_event_id IS NULL OR btrim(p_gateway_event_id) = '' THEN
    RAISE EXCEPTION 'gateway_event_id is required for idempotent settlement (PAY-V-EVENT-ID-REQUIRED)';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Verified payment amount must be greater than 0 (PAY-V-INVALID-AMOUNT)';
  END IF;

  SELECT id INTO v_existing_log_id
  FROM public.subscription_payment_logs
  WHERE gateway_event_id = p_gateway_event_id;
  IF v_existing_log_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Payment webhook already processed (idempotent duplicate)',
      'log_id', v_existing_log_id,
      'duplicate', true
    );
  END IF;

  SELECT id INTO v_existing_payment_id
  FROM public.payments
  WHERE gateway_event_id = p_gateway_event_id;
  IF v_existing_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Invoice payment webhook already processed (idempotent duplicate)',
      'payment_id', v_existing_payment_id,
      'duplicate', true
    );
  END IF;

  IF v_type = 'SUBSCRIPTION' THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id is required for subscription payments';
    END IF;
    IF v_currency <> 'INR' THEN
      RAISE EXCEPTION 'Unsupported subscription currency % (PAY-V-CURRENCY-MISMATCH)', v_currency;
    END IF;
    IF v_tier_upper NOT IN ('TIER_1_MSME', 'TIER_2_ENTERPRISE') THEN
      RAISE EXCEPTION 'Unknown subscription tier % (PAY-V-UNKNOWN-TIER)', v_tier_upper;
    END IF;
    IF v_cycle_upper NOT IN ('MONTHLY', 'YEARLY') THEN
      RAISE EXCEPTION 'Unknown billing cycle % (PAY-V-UNKNOWN-CYCLE)', v_cycle_upper;
    END IF;

    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization % not found', p_organization_id;
    END IF;
    IF v_org.blocked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Organization % is blocked and cannot take payments (PAY-V-ORG-BLOCKED)', p_organization_id;
    END IF;

    v_validity_days := CASE WHEN v_cycle_upper = 'YEARLY' THEN 365 ELSE 30 END;

    v_prev_expires := v_org.subscription_expires_at;
    IF v_prev_expires IS NULL OR v_prev_expires < v_now THEN
      v_new_expires := v_now + (v_validity_days || ' days')::interval;
    ELSE
      v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
    END IF;

    UPDATE public.organizations
    SET subscription_tier = v_tier_upper,
        subscription_status = 'ACTIVE',
        subscription_plan = v_cycle_upper,
        subscription_expires_at = v_new_expires,
        payment_reference = COALESCE(p_payment_reference, p_gateway_event_id),
        updated_at = v_now
    WHERE id = p_organization_id;

    INSERT INTO public.subscription_payment_logs (
      organization_id, tier, billing_cycle, amount, currency, payment_method,
      payment_reference, validity_days, previous_expires_at, new_expires_at,
      status, gateway, gateway_event_id, gateway_payload, created_at
    ) VALUES (
      p_organization_id, v_tier_upper, v_cycle_upper, p_amount, v_currency,
      coalesce(p_gateway, 'GATEWAY_WEBHOOK'),
      coalesce(p_payment_reference, p_gateway_event_id),
      v_validity_days, v_prev_expires, v_new_expires,
      'SUCCESS', p_gateway, p_gateway_event_id, p_gateway_payload, v_now
    ) RETURNING id INTO v_existing_log_id;

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)
    VALUES (
      'SUBSCRIPTION_PAYMENT_VERIFIED',
      'ORGANIZATION',
      p_organization_id,
      jsonb_build_object(
        'tier', v_tier_upper, 'cycle', v_cycle_upper, 'amount', p_amount,
        'currency', v_currency, 'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id, 'expires_at', v_new_expires
      ),
      coalesce(
        (SELECT om.profile_id FROM public.organization_members om
         WHERE om.organization_id = p_organization_id AND om.role = 'OWNER'
         ORDER BY om.joined_at LIMIT 1),
        (SELECT id FROM public.profiles WHERE is_platform_admin = true ORDER BY created_at LIMIT 1)
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Subscription payment verified and activated successfully',
      'log_id', v_existing_log_id,
      'organization_id', p_organization_id,
      'tier', v_tier_upper,
      'plan', v_cycle_upper,
      'expires_at', v_new_expires,
      'validity_days', v_validity_days
    );

  ELSIF v_type = 'INVOICE' THEN
    IF p_invoice_id IS NULL THEN
      RAISE EXCEPTION 'invoice_id is required for invoice payments';
    END IF;

    SELECT id, amount, currency, status, balance_due, purchase_order_id, work_order_id
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target invoice % not found (PAY-V-INVOICE-NOT-FOUND)', p_invoice_id;
    END IF;
    IF v_inv.status::text NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
      RAISE EXCEPTION 'Invoice % is not payable in status % (PAY-V-INVOICE-NOT-PAYABLE)', p_invoice_id, v_inv.status;
    END IF;
    IF upper(v_inv.currency) <> v_currency THEN
      RAISE EXCEPTION 'Payment currency % does not match invoice currency % (PAY-V-CURRENCY-MISMATCH)', v_currency, v_inv.currency;
    END IF;
    IF p_amount > v_inv.balance_due THEN
      RAISE EXCEPTION 'Payment amount % exceeds invoice balance due % (PAY-V-AMOUNT-EXCEEDS-BALANCE)', p_amount, v_inv.balance_due;
    END IF;

    v_po_id := COALESCE(
      v_inv.purchase_order_id,
      (SELECT wo.purchase_order_id FROM public.work_orders wo WHERE wo.id = v_inv.work_order_id)
    );
    SELECT po.organization_id INTO v_po_org FROM public.purchase_orders po WHERE po.id = v_po_id;
    IF p_organization_id IS NOT NULL AND v_po_org IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'Payment organization does not own this invoice (PAY-V-ORG-MISMATCH)';
    END IF;

    v_recorder := (SELECT id FROM public.profiles WHERE is_platform_admin = true ORDER BY created_at LIMIT 1);

    INSERT INTO public.payments (
      invoice_id, purchase_order_id, amount, unallocated_amount, currency, method,
      status, gateway_status, reference, gateway, gateway_event_id, gateway_payload,
      recorded_by, recorded_at, verified_at
    ) VALUES (
      p_invoice_id, v_po_id, p_amount, 0.00, v_currency, 'OTHER'::public.payment_method,
      'VERIFIED'::public.payment_status, 'SUCCEEDED'::public.payment_gateway_status,
      coalesce(p_payment_reference, p_gateway_event_id), p_gateway, p_gateway_event_id,
      p_gateway_payload, v_recorder, v_now, v_now
    ) RETURNING id INTO v_existing_payment_id;

    INSERT INTO public.payment_allocations (
      payment_id, invoice_id, allocated_amount, allocated_at, status, allocated_by, notes
    ) VALUES (
      v_existing_payment_id, p_invoice_id, p_amount, v_now, 'ALLOCATED', v_recorder,
      'Verified gateway payment'
    );

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'INVOICE_PAYMENT_VERIFIED',
      'INVOICE',
      p_invoice_id,
      jsonb_build_object(
        'amount', p_amount, 'currency', v_currency, 'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id, 'payment_id', v_existing_payment_id
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Invoice payment verified and settled successfully',
      'payment_id', v_existing_payment_id,
      'invoice_id', p_invoice_id
    );
  ELSE
    RAISE EXCEPTION 'Unsupported payment_type: %', p_payment_type;
  END IF;

EXCEPTION WHEN unique_violation THEN
  -- A concurrent delivery of the same gateway event won the unique-index race.
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Payment webhook already processed (idempotent duplicate)',
    'duplicate', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) TO service_role;

COMMIT;

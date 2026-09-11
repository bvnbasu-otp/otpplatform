-- =============================================================================
-- Migration 00150: Payment Webhook Verification & Idempotent Payment Settlement
-- Description:
--   Implements database-level transaction function `record_verified_payment`
--   to process cryptographically verified webhook payments from Razorpay / Stripe
--   for both Organization Subscriptions and Invoice/Milestone settlements.
-- =============================================================================

BEGIN;

-- 1. Add gateway tracking columns to subscription_payment_logs if not present
ALTER TABLE public.subscription_payment_logs
  ADD COLUMN IF NOT EXISTS gateway text DEFAULT 'MANUAL_OR_MOCK',
  ADD COLUMN IF NOT EXISTS gateway_event_id text,
  ADD COLUMN IF NOT EXISTS gateway_payload jsonb DEFAULT '{}'::jsonb;

-- Create unique index on gateway_event_id to guarantee webhook idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_logs_gateway_event_id
  ON public.subscription_payment_logs(gateway_event_id)
  WHERE gateway_event_id IS NOT NULL;

-- 2. Add gateway_event_id to public.payments if not present
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway text DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS gateway_event_id text,
  ADD COLUMN IF NOT EXISTS gateway_payload jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_event_id
  ON public.payments(gateway_event_id)
  WHERE gateway_event_id IS NOT NULL;

-- 3. Security Definer RPC: record_verified_payment
CREATE OR REPLACE FUNCTION public.record_verified_payment(
  p_payment_type text, -- 'SUBSCRIPTION' | 'INVOICE'
  p_organization_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT 0,
  p_currency text DEFAULT 'INR',
  p_gateway text DEFAULT 'RAZORPAY', -- 'RAZORPAY' | 'STRIPE' | 'MOCK'
  p_gateway_event_id text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_tier text DEFAULT 'TIER_1_MSME',
  p_billing_cycle text DEFAULT 'MONTHLY',
  p_gateway_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(coalesce(btrim(p_billing_cycle), 'MONTHLY'));
  v_tier_upper text := upper(coalesce(btrim(p_tier), 'TIER_1_MSME'));
  v_existing_log_id uuid;
  v_existing_payment_id uuid;
BEGIN
  -- Idempotency check 1: Check if gateway_event_id was already processed for subscription
  IF p_gateway_event_id IS NOT NULL THEN
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

    -- Idempotency check 2: Check payments table
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
  END IF;

  -- Branch A: Organization Subscription Payment
  IF upper(p_payment_type) = 'SUBSCRIPTION' THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id is required for subscription payments';
    END IF;

    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization % not found', p_organization_id;
    END IF;

    -- Calculate validity days
    IF v_cycle_upper = 'YEARLY' THEN
      v_validity_days := 365;
    ELSE
      v_validity_days := 30;
    END IF;

    -- Calculate new expiration
    v_prev_expires := v_org.subscription_expires_at;
    IF v_prev_expires IS NULL OR v_prev_expires < v_now THEN
      v_new_expires := v_now + (v_validity_days || ' days')::interval;
    ELSE
      v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
    END IF;

    -- Update organization subscription state
    UPDATE public.organizations
    SET 
      subscription_tier = v_tier_upper,
      subscription_status = 'ACTIVE',
      subscription_plan = v_cycle_upper,
      subscription_expires_at = v_new_expires,
      payment_reference = COALESCE(p_payment_reference, p_gateway_event_id, 'VERIFIED_WEBHOOK'),
      updated_at = v_now
    WHERE id = p_organization_id;

    -- Insert into subscription payment logs
    INSERT INTO public.subscription_payment_logs (
      organization_id,
      tier,
      billing_cycle,
      amount,
      currency,
      payment_method,
      payment_reference,
      validity_days,
      previous_expires_at,
      new_expires_at,
      status,
      gateway,
      gateway_event_id,
      gateway_payload,
      created_at
    ) VALUES (
      p_organization_id,
      v_tier_upper,
      v_cycle_upper,
      p_amount,
      p_currency,
      coalesce(p_gateway, 'GATEWAY_WEBHOOK'),
      coalesce(p_payment_reference, p_gateway_event_id, 'VERIFIED_WEBHOOK'),
      v_validity_days,
      v_prev_expires,
      v_new_expires,
      'SUCCESS',
      p_gateway,
      p_gateway_event_id,
      p_gateway_payload,
      v_now
    ) RETURNING id INTO v_existing_log_id;

    -- Insert audit event
    INSERT INTO public.audit_events (
      action,
      entity_type,
      entity_id,
      payload,
      actor_id
    ) VALUES (
      'SUBSCRIPTION_PAYMENT_VERIFIED',
      'ORGANIZATION',
      p_organization_id,
      jsonb_build_object(
        'tier', v_tier_upper,
        'cycle', v_cycle_upper,
        'amount', p_amount,
        'currency', p_currency,
        'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id,
        'expires_at', v_new_expires
      ),
      coalesce(v_org.created_by, (SELECT id FROM public.profiles WHERE is_platform_admin = true LIMIT 1))
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

  -- Branch B: Invoice Payment
  ELSIF upper(p_payment_type) = 'INVOICE' THEN
    IF p_invoice_id IS NULL THEN
      RAISE EXCEPTION 'invoice_id is required for invoice payments';
    END IF;

    -- Update invoice to PAID
    UPDATE public.invoices
    SET 
      status = 'PAID'::public.invoice_status,
      updated_at = v_now
    WHERE id = p_invoice_id;

    -- Record in payments table
    INSERT INTO public.payments (
      invoice_id,
      amount,
      currency,
      method,
      status,
      gateway_status,
      reference,
      gateway,
      gateway_event_id,
      gateway_payload,
      recorded_by,
      recorded_at,
      verified_at
    ) VALUES (
      p_invoice_id,
      p_amount,
      p_currency,
      'ONLINE'::public.payment_method,
      'VERIFIED'::public.payment_status,
      'SUCCEEDED'::public.payment_gateway_status,
      coalesce(p_payment_reference, p_gateway_event_id),
      p_gateway,
      p_gateway_event_id,
      p_gateway_payload,
      (SELECT id FROM public.profiles WHERE is_platform_admin = true LIMIT 1),
      v_now,
      v_now
    ) RETURNING id INTO v_existing_payment_id;

    -- Insert audit event
    INSERT INTO public.audit_events (
      action,
      entity_type,
      entity_id,
      payload
    ) VALUES (
      'INVOICE_PAYMENT_VERIFIED',
      'INVOICE',
      p_invoice_id,
      jsonb_build_object(
        'amount', p_amount,
        'currency', p_currency,
        'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id,
        'payment_id', v_existing_payment_id
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

END;
$$;

GRANT EXECUTE ON FUNCTION public.record_verified_payment TO service_role, authenticated;

COMMIT;

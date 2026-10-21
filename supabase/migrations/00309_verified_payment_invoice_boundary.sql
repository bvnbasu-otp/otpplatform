-- 00309: verified gateway settlement cannot record a procurement invoice.
--
-- public.record_verified_payment remains the service_role subscription entry.
-- An INVOICE payment type is rejected there, before the private function runs.
-- service_role can no longer call private.record_verified_payment_bound directly.
-- The private invoice branch stays in place for the owner-executed wrapper path
-- that this migration no longer reaches. Buyer payment evidence stays on
-- public.record_invoice_payment_atomic.
--
-- The wrapper is still owned by postgres, so its SECURITY DEFINER body can call
-- the private function after the service_role grant is removed.

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
  v_expected numeric;
BEGIN
  IF upper(coalesce(btrim(p_payment_type), '')) = 'INVOICE' THEN
    RAISE EXCEPTION 'Procurement invoice payments are not recorded by record_verified_payment (PAY-V-INVOICE-OFF-PLATFORM)'
      USING ERRCODE = '42501',
            HINT = 'Use record_invoice_payment_atomic for off-platform purchase-order payment evidence.';
  END IF;

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

ALTER FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  OWNER TO postgres;
ALTER FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

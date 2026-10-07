-- Revoke client EXECUTE on record_verified_payment.
-- The function is SECURITY DEFINER and does not check the caller.
-- 00150 granted authenticated. 00194 granted anon on all public routines.
-- 00216 and 00217 revoked anon and PUBLIC, then granted authenticated and service_role again.
-- The only application caller is supabase/functions/payment-webhook/index.ts,
-- which uses the service-role key. No browser, SQL, or cron caller was found.
-- Hosted apply is a separate manual step. This file does not edit 00001-00246.

BEGIN;

REVOKE ALL ON FUNCTION public.record_verified_payment(
  text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_verified_payment(
  text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

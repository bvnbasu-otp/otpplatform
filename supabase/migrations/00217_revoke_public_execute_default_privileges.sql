-- Migration 00217: Close PUBLIC EXECUTE on all public routines (00194 blanket grant).
-- After 00216, sensitive RPCs were revoked from anon but ~173 routines remained
-- callable by anon via GRANT EXECUTE TO PUBLIC. This migration revokes PUBLIC
-- and re-grants authenticated + service_role, then restores the anon allowlist only.

BEGIN;

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon;

GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_profile_verification_otp(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.platform_heartbeat() TO anon;
GRANT EXECUTE ON FUNCTION public.service_categories() TO anon;
GRANT EXECUTE ON FUNCTION public.served_cities() TO anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_supplier_magic_link(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_quote_context(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_messaging_quote(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.complete_supplier_onboarding_atomic(text, text, text, text, text, jsonb, text, text, text) TO anon;

COMMIT;

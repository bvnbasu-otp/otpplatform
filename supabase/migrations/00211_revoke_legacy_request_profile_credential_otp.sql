-- Migration 00211: Close plaintext-OTP leak on legacy public.request_profile_credential_otp
--
-- Bug (confirmed by reading supabase/migrations/00208_secure_otp_dispatch_and_hashing.sql
-- in full, the current CREATE OR REPLACE FUNCTION for this RPC):
--
--   CREATE OR REPLACE FUNCTION public.request_profile_credential_otp(
--     p_credential_type text,
--     p_credential_value text
--   ) ... AS $$
--   ...
--     RETURN public.issue_profile_credential_otp(v_profile_id, p_credential_type, p_credential_value);
--   END;
--   $$;
--   ...
--   REVOKE EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) FROM anon;
--   GRANT EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) TO authenticated, service_role;
--
-- 00208's own comment above this definition claims it is "fixed in place
-- (hashing, no plaintext returned)" — that is only half true. The DB row it
-- inserts is hashed (private.hash_otp_code / otp_code_hash), but the
-- *response* is an unfiltered passthrough of
-- public.issue_profile_credential_otp()'s return value, which (same
-- migration, lines ~575-582) is:
--
--   RETURN jsonb_build_object(
--     'ok', true,
--     'otp_code', v_code,              -- <-- plaintext code, still returned
--     'credential_type', v_clean_type,
--     'credential_value', v_clean_val,
--     'full_name', COALESCE(v_full_name, 'Valued User')
--   );
--
-- So request_profile_credential_otp still hands back the plaintext 6-digit
-- code in its own RPC response. Because it is GRANTed to `authenticated`
-- (not service_role-only, unlike its sibling issue_profile_credential_otp
-- immediately above it in 00208), any authenticated user can call it
-- directly via raw REST/RPC with an arbitrary p_credential_type /
-- p_credential_value — there is no check anywhere in
-- request_profile_credential_otp or issue_profile_credential_otp that
-- p_credential_value belongs to, or was ever received by, the caller — and
-- get the plaintext OTP code back immediately, with zero WhatsApp/SMS/email
-- delivery ever happening. That code can then be replayed into
-- verify_and_update_profile_credential to link an arbitrary phone number or
-- email address to the caller's own profile without ever proving control
-- of it via the out-of-band channel the OTP is supposed to require.
--
-- This RPC is legacy/dead code by design: apps/web/src/features/profile/api/profile.ts
-- (requestProfileCredentialOtp) no longer calls it — it calls the
-- `otp-dispatch` edge function instead (confirmed by reading that file's own
-- D-21/A-30 comment block), which itself calls
-- public.issue_profile_credential_otp() directly using the service key. A
-- repo-wide search (apps/, supabase/functions/, supabase/migrations/) turns
-- up zero remaining callers of request_profile_credential_otp — only
-- historical/comment references explaining that it has been superseded.
--
-- Per product decision this session, this RPC is intentionally kept but
-- unused; rebuilding it to go through the otp-dispatch edge function would
-- be new wiring, not a minimal fix, and would still leave a plain-Postgres
-- RPC that fundamentally cannot itself dispatch a WhatsApp/SMS/email send
-- (that capability only exists in the edge function). Since nothing calls
-- it, the minimal, conservative, and sufficient fix is to revoke direct
-- callability entirely, matching the "internal-only" intent already stated
-- in 00208's own comments but never actually applied to this specific
-- GRANT. No function body is modified; no business logic changes.

BEGIN;

-- anon already has no access (00208 revoked it); this REVOKE is a no-op
-- safety net in case that ever regresses. The real fix is removing
-- `authenticated` access, which 00208 left in place.
REVOKE ALL ON FUNCTION public.request_profile_credential_otp(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) TO service_role;

COMMIT;

-- Migration 00208: D-21 + A-30 joint fix — server-side-only OTP issuance, hashed storage
--
-- Today, three near-identical RPC pairs (request_profile_verification_otp /
-- verify_profile_verification_otp, request_whatsapp_password_reset /
-- verify_whatsapp_password_reset, request_profile_credential_otp /
-- verify_and_update_profile_credential) generate a 6-digit code with
-- random() (not a CSPRNG), store it in plaintext, and — because the
-- "request_*" half is GRANTed to anon/authenticated — hand that plaintext
-- code straight back to whichever browser called the RPC. Any caller who
-- can reach the Supabase REST endpoint directly (curl, not just the real
-- registration form) gets a real, usable code with no proof any message was
-- ever sent (A-30). The client that does receive the code then builds the
-- WhatsApp text itself and posts it to a relative /waha/... path that only
-- resolves in dev/preview (D-21) — so today's design is simultaneously
-- "secret leaks to the browser" and "the browser's send never works in
-- production".
--
-- The fix (Direction A from the scoping report): keep the SQL generation +
-- storage logic (it already does the identity lookups correctly), but make
-- the "request_*" issuance functions internal-only — GRANTed to
-- service_role, not anon/authenticated — so the plaintext code only ever
-- exists inside a trusted server context (the new otp-dispatch edge
-- function, called with the service key), which is the only thing that ever
-- sees it before it goes into a real WhatsApp/SMS provider send. Nothing
-- reachable from a browser returns a code again. Storage also moves from
-- plaintext to a salted SHA-256 hash, and every verify path gets a bounded
-- attempt counter so a stolen hash (or a guessed 6-digit code) cannot be
-- brute-forced indefinitely.
--
-- The dead registration-time phone-verification pair
-- (request_profile_verification_otp / verify_profile_verification_otp) is
-- deliberately NOT wired into a new UI gate here — per product decision,
-- it stays unused by the registration flow — but it gets the exact same
-- secrecy/hashing fix as the other two, because it is anon-GRANTed and
-- directly callable regardless of whether any UI uses it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Shared CSPRNG-backed numeric OTP generator.
--
-- Postgres random() is not a cryptographically secure generator. A 6-digit
-- code only ever has 900,000 possibilities regardless of how it is drawn —
-- the real defenses are the hash-at-rest, the short expiry and the attempt
-- counter below — but there is no reason to keep using the weaker source
-- when pgcrypto's gen_random_bytes is already a dependency of this schema
-- (extensions.gen_salt / extensions.crypt are used by the auth functions in
-- this same migration set).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.generate_numeric_otp(p_digits int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_max bigint := (10 ^ p_digits)::bigint;
  v_raw bigint;
BEGIN
  SELECT ('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint INTO v_raw;
  -- Clear the sign bit rather than negate/add: bigint's most negative value
  -- cannot be negated without overflow, but clearing bit 63 with a bitwise
  -- AND never overflows and still leaves a uniformly distributed positive
  -- 63-bit value to reduce mod v_max.
  v_raw := v_raw & 9223372036854775807;
  RETURN lpad((v_raw % v_max)::text, p_digits, '0');
END;
$$;

REVOKE ALL ON FUNCTION private.generate_numeric_otp(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.generate_numeric_otp(int) TO service_role;

CREATE OR REPLACE FUNCTION private.hash_otp_code(p_code text, p_salt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_code || ':' || p_salt, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION private.hash_otp_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.hash_otp_code(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 1. signup_verification_otps (registration-time phone verification, A-30's
--    own named table). Hash storage + attempt counter; plaintext column kept
--    nullable for one release so a mid-flight row from before this
--    migration does not break, then stops being written to.
-- ---------------------------------------------------------------------------
ALTER TABLE public.signup_verification_otps
  ALTER COLUMN otp_code DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS otp_code_hash text,
  ADD COLUMN IF NOT EXISTS otp_salt text,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.request_profile_verification_otp(
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
  v_otp_code text;
  v_salt text;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_clean_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid phone number format');
  END IF;

  v_otp_code := private.generate_numeric_otp(6);
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.signup_verification_otps (phone, otp_code, otp_code_hash, otp_salt, attempt_count, expires_at, created_at)
  VALUES (v_clean_phone, NULL, private.hash_otp_code(v_otp_code, v_salt), v_salt, 0, now() + interval '10 minutes', now())
  ON CONFLICT (phone) DO UPDATE
  SET otp_code = NULL,
      otp_code_hash = EXCLUDED.otp_code_hash,
      otp_salt = EXCLUDED.otp_salt,
      attempt_count = 0,
      expires_at = EXCLUDED.expires_at,
      created_at = EXCLUDED.created_at;

  -- Only ever returned to the service-role-authenticated caller (the
  -- otp-dispatch edge function) that generates the outbound message; never
  -- reachable from a browser directly (see GRANT below).
  RETURN jsonb_build_object(
    'ok', true,
    'phone', v_clean_phone,
    'otp_code', v_otp_code,
    'message', 'Verification code generated'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_profile_verification_otp(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_profile_verification_otp(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_profile_verification_otp(text) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_profile_verification_otp(
  p_phone text,
  p_otp_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
  v_clean_code text;
  v_record RECORD;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_clean_code := btrim(COALESCE(p_otp_code, ''));

  SELECT * INTO v_record
  FROM public.signup_verification_otps
  WHERE phone = v_clean_phone;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No pending verification code found');
  END IF;

  IF now() > v_record.expires_at THEN
    DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;
    RETURN jsonb_build_object('ok', false, 'error', 'Verification code expired. Please request a new one.');
  END IF;

  IF v_record.attempt_count >= 5 THEN
    DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;
    RETURN jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please request a new code.');
  END IF;

  IF v_record.otp_code_hash IS NULL OR v_record.otp_code_hash != private.hash_otp_code(v_clean_code, v_record.otp_salt) THEN
    UPDATE public.signup_verification_otps SET attempt_count = attempt_count + 1 WHERE phone = v_clean_phone;
    RETURN jsonb_build_object('ok', false, 'error', 'Incorrect verification code. Please check and retry.');
  END IF;

  -- Consume OTP upon successful verification
  DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;

  RETURN jsonb_build_object('ok', true, 'message', 'Phone verified successfully');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_profile_verification_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_profile_verification_otp(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. password_reset_otps. Same hashing treatment, plus a `purpose` column so
--    the same table/verify path can also serve first-time credential setup
--    after admin approval (A-29) without inventing a second near-duplicate
--    mechanism — the redemption UI/RPC (verify_whatsapp_password_reset,
--    already wired end-to-end in ResetPasswordPage/AuthProvider) does not
--    need to change shape at all, only what generates the row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.password_reset_otps
  ALTER COLUMN otp_code DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS otp_code_hash text,
  ADD COLUMN IF NOT EXISTS otp_salt text,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'RESET';

ALTER TABLE public.password_reset_otps
  DROP CONSTRAINT IF EXISTS password_reset_otps_purpose_check;
ALTER TABLE public.password_reset_otps
  ADD CONSTRAINT password_reset_otps_purpose_check CHECK (purpose IN ('RESET', 'ACTIVATION'));

CREATE OR REPLACE FUNCTION public.request_whatsapp_password_reset(
  p_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_identifier text;
  v_clean_phone text;
  v_email text;
  v_phone text;
  v_full_name text := 'Valued User';
  v_code text;
  v_salt text;
BEGIN
  v_identifier := trim(p_identifier);
  IF v_identifier IS NULL OR length(v_identifier) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid email or phone number.');
  END IF;

  IF position('@' in v_identifier) > 0 THEN
    SELECT
      u.email,
      COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
      COALESCE(u.raw_user_meta_data->>'full_name', 'Valued User')
    INTO v_email, v_phone, v_full_name
    FROM auth.users u
    WHERE lower(u.email) = lower(v_identifier)
    LIMIT 1;

    IF v_email IS NULL THEN
      SELECT p.email, p.full_name
      INTO v_email, v_full_name
      FROM public.profiles p
      WHERE lower(p.email) = lower(v_identifier)
      LIMIT 1;
    END IF;

    IF v_phone IS NULL THEN
      SELECT o.contact_phone INTO v_phone
      FROM public.organizations o
      WHERE lower(o.contact_email) = lower(v_identifier) AND o.contact_phone IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_phone IS NULL THEN
      SELECT s.contact_phone INTO v_phone
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_identifier) AND s.contact_phone IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_phone IS NULL THEN
      SELECT sr.phone INTO v_phone
      FROM public.signup_requests sr
      WHERE lower(sr.email) = lower(v_identifier) AND sr.phone IS NOT NULL
      ORDER BY sr.created_at DESC
      LIMIT 1;
    END IF;

  ELSE
    v_clean_phone := RIGHT(regexp_replace(v_identifier, '\D', '', 'g'), 10);
    IF length(v_clean_phone) < 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit phone number.');
    END IF;

    SELECT
      u.email,
      COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
      COALESCE(u.raw_user_meta_data->>'full_name', 'Valued User')
    INTO v_email, v_phone, v_full_name
    FROM auth.users u
    WHERE RIGHT(regexp_replace(COALESCE(u.phone, u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 10) = v_clean_phone
    LIMIT 1;

    IF v_email IS NULL THEN
      SELECT o.contact_email, o.contact_phone, o.contact_person
      INTO v_email, v_phone, v_full_name
      FROM public.organizations o
      WHERE RIGHT(regexp_replace(COALESCE(o.contact_phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      LIMIT 1;
    END IF;

    IF v_email IS NULL THEN
      SELECT s.contact_email, s.contact_phone, s.business_name
      INTO v_email, v_phone, v_full_name
      FROM public.suppliers s
      WHERE RIGHT(regexp_replace(COALESCE(s.contact_phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      LIMIT 1;
    END IF;

    IF v_email IS NULL THEN
      SELECT sr.email, sr.phone, COALESCE(sr.contact_first_name || ' ' || sr.contact_last_name, 'Valued User')
      INTO v_email, v_phone, v_full_name
      FROM public.signup_requests sr
      WHERE RIGHT(regexp_replace(COALESCE(sr.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      ORDER BY sr.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No registered account found matching that phone number or email.');
  END IF;

  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This account does not have a registered phone number. Please use email reset.');
  END IF;

  v_code := private.generate_numeric_otp(6);
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE lower(email) = lower(v_email) AND used_at IS NULL AND purpose = 'RESET';

  INSERT INTO public.password_reset_otps (email, phone, otp_code, otp_code_hash, otp_salt, attempt_count, purpose, expires_at)
  VALUES (lower(v_email), v_phone, NULL, private.hash_otp_code(v_code, v_salt), v_salt, 0, 'RESET', now() + interval '15 minutes');

  -- Only ever returned to the service-role caller; see GRANT below.
  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'phone', v_phone,
    'full_name', v_full_name,
    'otp_code', v_code,
    'message', 'Verification code generated successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_whatsapp_password_reset(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_whatsapp_password_reset(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_whatsapp_password_reset(text) TO service_role;

-- Internal-only issuance for first-time credential setup after admin
-- approval (A-29). Unlike request_whatsapp_password_reset, the caller
-- already knows exactly which account this is (it just provisioned it) —
-- no identity lookup needed — so this takes email/phone/name directly
-- rather than re-deriving them from an ambiguous identifier.
CREATE OR REPLACE FUNCTION public.issue_activation_credential_otp(
  p_email text,
  p_phone text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_salt text;
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_phone text := btrim(COALESCE(p_phone, ''));
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'An email is required to issue activation credentials');
  END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A phone number is required to issue activation credentials');
  END IF;

  v_code := private.generate_numeric_otp(6);
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE lower(email) = v_email AND used_at IS NULL AND purpose = 'ACTIVATION';

  INSERT INTO public.password_reset_otps (email, phone, otp_code, otp_code_hash, otp_salt, attempt_count, purpose, expires_at)
  VALUES (v_email, v_phone, NULL, private.hash_otp_code(v_code, v_salt), v_salt, 0, 'ACTIVATION', now() + interval '7 days');

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'phone', v_phone,
    'full_name', COALESCE(NULLIF(btrim(p_full_name), ''), 'there'),
    'otp_code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_activation_credential_otp(text, text, text) FROM PUBLIC;
-- 00194 grants EXECUTE on every new public-schema routine to anon and
-- authenticated by default (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- ROUTINES), which a bare REVOKE ... FROM PUBLIC does not undo — PUBLIC and
-- a role's own direct grant are separate. Every service_role-only function
-- below needs an explicit per-role REVOKE, not just REVOKE FROM PUBLIC.
REVOKE EXECUTE ON FUNCTION public.issue_activation_credential_otp(text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_activation_credential_otp(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_whatsapp_password_reset(
  p_identifier text,
  p_otp_code text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_otp_id uuid;
  v_email text;
  v_phone text;
  v_clean_phone text;
  v_clean_code text := btrim(COALESCE(p_otp_code, ''));
  v_hash text;
  v_salt text;
  v_attempts int;
BEGIN
  IF length(COALESCE(p_new_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Password must be at least 8 characters long.');
  END IF;

  IF position('@' in p_identifier) > 0 THEN
    SELECT id, email, phone, otp_code_hash, otp_salt, attempt_count
    INTO v_otp_id, v_email, v_phone, v_hash, v_salt, v_attempts
    FROM public.password_reset_otps
    WHERE lower(email) = lower(trim(p_identifier))
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_clean_phone := RIGHT(regexp_replace(p_identifier, '\D', '', 'g'), 10);
    SELECT id, email, phone, otp_code_hash, otp_salt, attempt_count
    INTO v_otp_id, v_email, v_phone, v_hash, v_salt, v_attempts
    FROM public.password_reset_otps
    WHERE RIGHT(regexp_replace(phone, '\D', '', 'g'), 10) = v_clean_phone
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_otp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired verification code. Please check the code or request a new one.');
  END IF;

  IF v_attempts >= 5 THEN
    UPDATE public.password_reset_otps SET used_at = now() WHERE id = v_otp_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please request a new code.');
  END IF;

  IF v_hash IS NULL OR v_hash != private.hash_otp_code(v_clean_code, v_salt) THEN
    UPDATE public.password_reset_otps SET attempt_count = attempt_count + 1 WHERE id = v_otp_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired verification code. Please check the code or request a new one.');
  END IF;

  -- Single-use, race-safe: only the first caller to land on the still-unused
  -- row gets to consume it (mirrors the "two people, one link" guard already
  -- used for supplier magic links).
  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE id = v_otp_id AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has already been used. Please request a new one.');
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now(),
      recovery_token = ''
  WHERE lower(email) = lower(v_email);

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'password.reset_via_whatsapp',
    'auth.users',
    v_email,
    NULL,
    jsonb_build_object('email', v_email, 'phone', v_phone, 'channel', 'WHATSAPP')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'message', 'Password set successfully! You can now log in with your new password.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. profile_verification_otps (profile phone/email linking). Same hashing
--    treatment. The request_* side moves to a new explicit-profile_id
--    internal function so it can be driven by the edge function (which
--    resolves the caller's identity itself from the forwarded JWT) without
--    needing auth.uid() to resolve under a service-role connection.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_verification_otps
  ALTER COLUMN otp_code DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS otp_code_hash text,
  ADD COLUMN IF NOT EXISTS otp_salt text,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.issue_profile_credential_otp(
  p_profile_id uuid,
  p_credential_type text,
  p_credential_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_type text := upper(trim(p_credential_type));
  v_clean_val text := trim(p_credential_value);
  v_full_name text;
  v_code text;
  v_salt text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  IF v_clean_type NOT IN ('PHONE', 'EMAIL') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Credential type must be PHONE or EMAIL');
  END IF;

  SELECT full_name INTO v_full_name FROM public.profiles WHERE id = p_profile_id;

  IF v_clean_type = 'PHONE' THEN
    v_clean_val := regexp_replace(v_clean_val, '\D', '', 'g');
    IF length(v_clean_val) < 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit mobile number');
    END IF;
    IF length(v_clean_val) = 10 THEN
      v_clean_val := '+91 ' || substring(v_clean_val from 1 for 5) || ' ' || substring(v_clean_val from 6 for 5);
    ELSIF length(v_clean_val) = 12 AND substring(v_clean_val from 1 for 2) = '91' THEN
      v_clean_val := '+91 ' || substring(v_clean_val from 3 for 5) || ' ' || substring(v_clean_val from 8 for 5);
    END IF;
  ELSE
    v_clean_val := lower(v_clean_val);
    IF v_clean_val NOT LIKE '%@%.%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid email address');
    END IF;
  END IF;

  UPDATE public.profile_verification_otps
  SET used_at = now()
  WHERE profile_id = p_profile_id AND credential_type = v_clean_type AND used_at IS NULL;

  v_code := private.generate_numeric_otp(6);
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.profile_verification_otps (
    profile_id, credential_type, credential_value, otp_code, otp_code_hash, otp_salt, attempt_count, expires_at
  ) VALUES (
    p_profile_id, v_clean_type, v_clean_val, NULL, private.hash_otp_code(v_code, v_salt), v_salt, 0, now() + interval '15 minutes'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'otp_code', v_code,
    'credential_type', v_clean_type,
    'credential_value', v_clean_val,
    'full_name', COALESCE(v_full_name, 'Valued User')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_profile_credential_otp(uuid, text, text) FROM PUBLIC;
-- See note above issue_activation_credential_otp's grants: 00194's default
-- privileges re-grant EXECUTE to anon/authenticated on every new routine, so
-- REVOKE FROM PUBLIC alone is insufficient here.
REVOKE EXECUTE ON FUNCTION public.issue_profile_credential_otp(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_profile_credential_otp(uuid, text, text) TO service_role;

-- Legacy auth.uid()-driven RPC: fixed in place (hashing, no plaintext
-- returned) per the "still exists, could be invoked directly" instruction,
-- but no longer GRANTed to anon — it was previously anon-GRANTed despite
-- being meaningless without an authenticated session, which is itself a
-- small bug this migration also closes. Nothing in this codebase calls it
-- after this change; the client goes through the otp-dispatch edge function
-- (which calls issue_profile_credential_otp above with an explicitly
-- resolved profile id) instead.
CREATE OR REPLACE FUNCTION public.request_profile_credential_otp(
  p_credential_type text,
  p_credential_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  RETURN public.issue_profile_credential_otp(v_profile_id, p_credential_type, p_credential_value);
END;
$$;

REVOKE ALL ON FUNCTION public.request_profile_credential_otp(text, text) FROM PUBLIC;
-- See note above issue_activation_credential_otp's grants: 00194's default
-- privileges re-grant EXECUTE to anon/authenticated on every new routine, so
-- REVOKE FROM PUBLIC alone would leave this reachable by anon too. The
-- function body already fails closed for anon (auth.uid() IS NULL ->
-- "Authentication required"), but the grant itself should match intent.
REVOKE EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_and_update_profile_credential(
  p_credential_type text,
  p_credential_value text,
  p_otp_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_clean_type text;
  v_clean_val text;
  v_clean_code text;
  v_otp_id uuid;
  v_hash text;
  v_salt text;
  v_attempts int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  v_clean_type := upper(trim(p_credential_type));
  v_clean_val := trim(p_credential_value);
  v_clean_code := trim(p_otp_code);

  IF v_clean_code IS NULL OR length(v_clean_code) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter a valid verification code');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  SELECT id, credential_value, otp_code_hash, otp_salt, attempt_count
  INTO v_otp_id, v_clean_val, v_hash, v_salt, v_attempts
  FROM public.profile_verification_otps
  WHERE profile_id = v_profile_id
    AND credential_type = v_clean_type
    AND used_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired verification code. Please request a new code.');
  END IF;

  IF v_attempts >= 5 THEN
    UPDATE public.profile_verification_otps SET used_at = now() WHERE id = v_otp_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please request a new code.');
  END IF;

  IF v_hash IS NULL OR v_hash != private.hash_otp_code(v_clean_code, v_salt) THEN
    UPDATE public.profile_verification_otps SET attempt_count = attempt_count + 1 WHERE id = v_otp_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired verification code. Please request a new code.');
  END IF;

  UPDATE public.profile_verification_otps
  SET used_at = now()
  WHERE id = v_otp_id AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has already been used. Please request a new one.');
  END IF;

  IF v_clean_type = 'PHONE' THEN
    UPDATE public.profiles SET phone = v_clean_val, updated_at = now() WHERE id = v_profile_id;
    UPDATE auth.users
    SET phone = v_clean_val,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone', v_clean_val)
    WHERE id = v_uid;
    UPDATE public.organizations o
    SET contact_phone = COALESCE(contact_phone, v_clean_val)
    FROM public.organization_members om
    WHERE om.organization_id = o.id AND om.profile_id = v_profile_id AND (o.contact_phone IS NULL OR o.contact_phone = '');
    UPDATE public.suppliers s
    SET contact_phone = COALESCE(contact_phone, v_clean_val)
    FROM public.supplier_users su
    WHERE su.supplier_id = s.id AND su.profile_id = v_profile_id AND (s.contact_phone IS NULL OR s.contact_phone = '');
  ELSE
    UPDATE public.profiles SET email = lower(v_clean_val), updated_at = now() WHERE id = v_profile_id;
    UPDATE auth.users
    SET email = lower(v_clean_val),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email', lower(v_clean_val))
    WHERE id = v_uid;
  END IF;

  INSERT INTO public.audit_events (actor_id, entity_type, entity_id, event_type, payload)
  VALUES (
    v_profile_id, 'profile', v_profile_id::text,
    CASE WHEN v_clean_type = 'PHONE' THEN 'profile.phone_verified' ELSE 'profile.email_verified' END,
    jsonb_build_object('credential_type', v_clean_type, 'credential_value', v_clean_val, 'verified_at', now())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'credential_type', v_clean_type,
    'credential_value', v_clean_val,
    'message', CASE WHEN v_clean_type = 'PHONE' THEN 'Phone number verified and linked successfully!' ELSE 'Email address verified and linked successfully!' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_update_profile_credential(text, text, text) FROM PUBLIC;
-- Same 00194 default-privileges note as above: without this, anon could
-- technically invoke this function (though its own auth.uid() IS NULL check
-- already fails it closed with no data touched). Revoking anon explicitly
-- keeps the grant matching stated intent, not just the body-level check.
REVOKE EXECUTE ON FUNCTION public.verify_and_update_profile_credential(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_and_update_profile_credential(text, text, text) TO authenticated, service_role;

COMMIT;

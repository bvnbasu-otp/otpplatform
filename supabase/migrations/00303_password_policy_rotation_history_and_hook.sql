-- =============================================================================
-- Migration 00303: Password complexity, 90-day rotation, history, demo/QA
-- exemptions, custom access token hook claims, and procurement write guards.
-- =============================================================================

BEGIN;

-- Extend demo registry for QA personas (§11 decision).
ALTER TABLE public.demo_accounts DROP CONSTRAINT IF EXISTS demo_accounts_persona_valid;
ALTER TABLE public.demo_accounts ADD CONSTRAINT demo_accounts_persona_valid CHECK (
  persona IN (
    'BUYER_OWNER', 'BUYER_MANAGER', 'BUYER_MEMBER', 'COMMITTEE', 'SUPPLIER', 'ADMIN', 'QA'
  )
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.password_changed_at IS
  'UTC timestamp of last successful password set/change/reset. Rollout backfill sets deploy-effective time.';

-- Grace-from-deploy backfill for existing accounts.
UPDATE public.profiles
SET password_changed_at = now()
WHERE password_changed_at IS NULL;

CREATE TABLE IF NOT EXISTS private.password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  password_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_profile_created
  ON private.password_history (profile_id, created_at DESC);

REVOKE ALL ON TABLE private.password_history FROM PUBLIC;
REVOKE ALL ON TABLE private.password_history FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email convention (demo / qa token in local part)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.matches_demo_qa_email_convention(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR btrim(p_email) = '' THEN false
    ELSE (
      lower(split_part(p_email, '@', 1)) ~ '(^|[^a-z])demo([^a-z]|$)'
      OR lower(split_part(p_email, '@', 1)) ~ '(^|[^a-z])qa([^a-z]|$)'
    )
  END;
$$;

-- ---------------------------------------------------------------------------
-- Demo / QA policy exemption (rotation + history only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.password_policy_exempt(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_email text;
  v_is_demo boolean;
  v_persona text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.email, COALESCE(p.is_demo, false)
  INTO v_email, v_is_demo
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT v_is_demo OR NOT private.matches_demo_qa_email_convention(v_email) THEN
    RETURN false;
  END IF;

  SELECT da.persona
  INTO v_persona
  FROM public.demo_accounts da
  WHERE da.is_active
    AND (
      da.profile_id = p_profile_id
      OR lower(da.email) = lower(v_email)
    )
  LIMIT 1;

  IF v_persona IS NULL THEN
    RETURN false;
  END IF;

  -- QA requires explicit QA persona; demo personas follow demo registry.
  IF v_persona = 'QA' THEN
    RETURN true;
  END IF;

  IF v_persona IN ('BUYER_OWNER', 'BUYER_MANAGER', 'BUYER_MEMBER', 'COMMITTEE', 'SUPPLIER', 'ADMIN') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Complexity validation (mirrors @otp/domain password-policy)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validate_password_complexity(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_messages text[] := ARRAY[]::text[];
BEGIN
  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    v_messages := array_append(v_messages, 'Password must be at least 8 characters.');
  END IF;
  IF p_password IS NULL OR p_password !~ '[A-Z]' THEN
    v_messages := array_append(v_messages, 'Include at least one uppercase letter (A–Z).');
  END IF;
  IF p_password IS NULL OR p_password !~ '[a-z]' THEN
    v_messages := array_append(v_messages, 'Include at least one lowercase letter (a–z).');
  END IF;
  IF p_password IS NULL OR p_password !~ '[0-9]' THEN
    v_messages := array_append(v_messages, 'Include at least one digit (0–9).');
  END IF;
  IF p_password IS NULL OR p_password !~ '[!"#$%&''()*+,\-./:;<=>?@\[\]\\^_`{|}~]' THEN
    v_messages := array_append(v_messages, 'Include at least one special character.');
  END IF;

  IF array_length(v_messages, 1) IS NULL THEN
    RETURN jsonb_build_object('valid', true, 'messages', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'valid', false,
    'messages', to_jsonb(v_messages)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Password history + rotation status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.password_conflicts_with_history(
  p_profile_id uuid,
  p_plain_password text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_auth_id uuid;
  v_current_hash text;
  v_row record;
BEGIN
  IF private.password_policy_exempt(p_profile_id) THEN
    RETURN false;
  END IF;

  SELECT p.auth_user_id INTO v_auth_id FROM public.profiles p WHERE p.id = p_profile_id;
  IF v_auth_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.encrypted_password INTO v_current_hash
  FROM auth.users u
  WHERE u.id = v_auth_id;

  IF v_current_hash IS NOT NULL AND v_current_hash = extensions.crypt(p_plain_password, v_current_hash) THEN
    RETURN true;
  END IF;

  FOR v_row IN
    SELECT ph.password_verifier
    FROM private.password_history ph
    WHERE ph.profile_id = p_profile_id
    ORDER BY ph.created_at DESC
    LIMIT 3
  LOOP
    IF v_row.password_verifier IS NOT NULL
       AND v_row.password_verifier = extensions.crypt(p_plain_password, v_row.password_verifier) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.password_policy_status(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_changed timestamptz;
  v_exempt boolean;
  v_expires timestamptz;
  v_days int;
  v_warn text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'enforced', true,
      'exempt', false,
      'mustChangePassword', false,
      'expiresAt', NULL,
      'daysRemaining', NULL,
      'warnLevel', NULL
    );
  END IF;

  v_exempt := private.password_policy_exempt(p_profile_id);
  IF v_exempt THEN
    RETURN jsonb_build_object(
      'enforced', false,
      'exempt', true,
      'mustChangePassword', false,
      'expiresAt', NULL,
      'daysRemaining', NULL,
      'warnLevel', NULL
    );
  END IF;

  SELECT p.password_changed_at INTO v_changed
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF v_changed IS NULL THEN
    RETURN jsonb_build_object(
      'enforced', true,
      'exempt', false,
      'mustChangePassword', true,
      'expiresAt', NULL,
      'daysRemaining', NULL,
      'warnLevel', NULL
    );
  END IF;

  v_expires := v_changed + interval '90 days';
  v_days := ceil(extract(epoch FROM (v_expires - now())) / 86400.0)::int;

  IF v_days <= 0 THEN
    RETURN jsonb_build_object(
      'enforced', true,
      'exempt', false,
      'mustChangePassword', true,
      'expiresAt', v_expires,
      'daysRemaining', v_days,
      'warnLevel', NULL
    );
  END IF;

  v_warn := NULL;
  IF v_days <= 3 THEN
    v_warn := '3';
  ELSIF v_days <= 14 THEN
    v_warn := '14';
  END IF;

  RETURN jsonb_build_object(
    'enforced', true,
    'exempt', false,
    'mustChangePassword', false,
    'expiresAt', v_expires,
    'daysRemaining', v_days,
    'warnLevel', v_warn
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_account_password_change(
  p_profile_id uuid,
  p_new_password text,
  p_event_type text,
  p_channel text DEFAULT 'WEB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_validation jsonb;
  v_auth_id uuid;
  v_email text;
  v_old_hash text;
  v_new_hash text;
BEGIN
  v_validation := private.validate_password_complexity(p_new_password);
  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', v_validation->'messages'->>0, 'messages', v_validation->'messages');
  END IF;

  IF private.password_conflicts_with_history(p_profile_id, p_new_password) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'You cannot reuse your current password or any of your last three passwords.'
    );
  END IF;

  SELECT p.auth_user_id, p.email INTO v_auth_id, v_email
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account not found.');
  END IF;

  SELECT u.encrypted_password INTO v_old_hash
  FROM auth.users u
  WHERE u.id = v_auth_id
  FOR UPDATE;

  IF v_old_hash IS NOT NULL THEN
    INSERT INTO private.password_history (profile_id, password_verifier)
    VALUES (p_profile_id, v_old_hash);

    DELETE FROM private.password_history ph
    WHERE ph.id IN (
      SELECT id FROM private.password_history
      WHERE profile_id = p_profile_id
      ORDER BY created_at DESC
      OFFSET 3
    );
  END IF;

  v_new_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  UPDATE auth.users
  SET encrypted_password = v_new_hash,
      updated_at = now(),
      recovery_token = ''
  WHERE id = v_auth_id;

  UPDATE public.profiles
  SET password_changed_at = now(),
      updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    p_event_type,
    'profiles',
    p_profile_id::text,
    p_profile_id,
    jsonb_build_object('channel', p_channel, 'policy', 'password_rotation_v1')
  );

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated password change + recovery session set
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_password_secure(
  p_current_password text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid;
  v_auth_id uuid;
  v_hash text;
BEGIN
  v_profile := private.get_profile_id();
  v_auth_id := auth.uid();

  IF v_profile IS NULL OR v_auth_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required.');
  END IF;

  SELECT u.encrypted_password INTO v_hash
  FROM auth.users u
  WHERE u.id = v_auth_id;

  IF v_hash IS NULL OR v_hash <> extensions.crypt(p_current_password, v_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Current password is incorrect.');
  END IF;

  RETURN private.apply_account_password_change(
    v_profile,
    p_new_password,
    'password.changed',
    'PROFILE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_password_secure(p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL OR auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required.');
  END IF;

  RETURN private.apply_account_password_change(
    v_profile,
    p_new_password,
    'password.reset_completed',
    'RECOVERY_SESSION'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_password_secure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_password_secure(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_password_secure(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_password_secure(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- WhatsApp / OTP reset path (must match authenticated policy)
-- ---------------------------------------------------------------------------

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
  v_clean_code text := regexp_replace(btrim(COALESCE(p_otp_code, '')), '\D', '', 'g');
  v_hash text;
  v_salt text;
  v_attempts int;
  v_profile_id uuid;
  v_apply jsonb;
BEGIN
  IF v_clean_code !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter the full 8-digit verification code.');
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

  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE id = v_otp_id AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has already been used. Please request a new one.');
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE lower(p.email) = lower(v_email)
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account not found for this verification code.');
  END IF;

  v_apply := private.apply_account_password_change(
    v_profile_id,
    p_new_password,
    'password.reset_via_whatsapp',
    'WHATSAPP'
  );

  IF NOT COALESCE((v_apply->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_apply->>'error', 'Password could not be updated.'));
  END IF;

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
-- Server-side write guard when password expired
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_password_policy_for_authenticated()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid;
  v_policy jsonb;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL THEN
    RETURN;
  END IF;

  v_policy := private.password_policy_status(v_profile);
  IF COALESCE((v_policy->>'mustChangePassword')::boolean, false) THEN
    RAISE EXCEPTION 'Password change required before continuing (PASSWORD_CHANGE_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_enforce_password_policy_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  PERFORM private.enforce_password_policy_for_authenticated();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requirements_password_policy ON public.requirements;
CREATE TRIGGER trg_requirements_password_policy
  BEFORE INSERT OR UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.trg_enforce_password_policy_row();

DROP TRIGGER IF EXISTS trg_rfqs_password_policy ON public.rfqs;
CREATE TRIGGER trg_rfqs_password_policy
  BEFORE INSERT OR UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.trg_enforce_password_policy_row();

-- ---------------------------------------------------------------------------
-- Custom access token hook (enable in hosted dashboard + config.toml)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_profile uuid;
  v_claims jsonb;
  v_policy jsonb;
BEGIN
  v_user_id := NULLIF(event->>'user_id', '')::uuid;
  v_claims := COALESCE(event->'claims', '{}'::jsonb);

  IF v_user_id IS NOT NULL THEN
    SELECT p.id INTO v_profile
    FROM public.profiles p
    WHERE p.auth_user_id = v_user_id
    LIMIT 1;

    IF v_profile IS NOT NULL THEN
      v_policy := private.password_policy_status(v_profile);
      v_claims := jsonb_set(v_claims, '{password_policy}', v_policy, true);
      IF COALESCE((v_policy->>'mustChangePassword')::boolean, false) THEN
        v_claims := jsonb_set(v_claims, '{password_change_required}', 'true'::jsonb, true);
      ELSE
        v_claims := v_claims - 'password_change_required';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';

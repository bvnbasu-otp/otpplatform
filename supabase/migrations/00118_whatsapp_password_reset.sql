-- Migration 00118: WhatsApp and Multi-Channel Password Reset Workflow
-- Provides verification code generation and verification for users resetting password via WhatsApp or email.

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_lookup
  ON public.password_reset_otps (email, otp_code, used_at, expires_at);

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Function: request_whatsapp_password_reset
-- Generates a 6-digit OTP code for a user matching email or phone.
-- ---------------------------------------------------------------------------
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
BEGIN
  v_identifier := trim(p_identifier);
  IF v_identifier IS NULL OR length(v_identifier) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid email or phone number.');
  END IF;

  IF position('@' in v_identifier) > 0 THEN
    -- Look up by Email
    -- Check auth.users first
    SELECT
      u.email,
      COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
      COALESCE(u.raw_user_meta_data->>'full_name', 'Valued User')
    INTO v_email, v_phone, v_full_name
    FROM auth.users u
    WHERE lower(u.email) = lower(v_identifier)
    LIMIT 1;

    -- Check profiles if email not found
    IF v_email IS NULL THEN
      SELECT
        p.email,
        p.full_name
      INTO v_email, v_full_name
      FROM public.profiles p
      WHERE lower(p.email) = lower(v_identifier)
      LIMIT 1;
    END IF;

    -- If phone still missing, check organizations
    IF v_phone IS NULL THEN
      SELECT o.contact_phone
      INTO v_phone
      FROM public.organizations o
      WHERE lower(o.contact_email) = lower(v_identifier) AND o.contact_phone IS NOT NULL
      LIMIT 1;
    END IF;

    -- Check suppliers if phone still missing
    IF v_phone IS NULL THEN
      SELECT s.contact_phone
      INTO v_phone
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_identifier) AND s.contact_phone IS NOT NULL
      LIMIT 1;
    END IF;

    -- Check signup_requests if phone still missing
    IF v_phone IS NULL THEN
      SELECT sr.phone
      INTO v_phone
      FROM public.signup_requests sr
      WHERE lower(sr.email) = lower(v_identifier) AND sr.phone IS NOT NULL
      ORDER BY sr.created_at DESC
      LIMIT 1;
    END IF;

  ELSE
    -- Look up by Phone
    v_clean_phone := RIGHT(regexp_replace(v_identifier, '\D', '', 'g'), 10);
    IF length(v_clean_phone) < 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit phone number.');
    END IF;

    -- Check auth.users
    SELECT
      u.email,
      COALESCE(u.phone, u.raw_user_meta_data->>'phone'),
      COALESCE(u.raw_user_meta_data->>'full_name', 'Valued User')
    INTO v_email, v_phone, v_full_name
    FROM auth.users u
    WHERE RIGHT(regexp_replace(COALESCE(u.phone, u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 10) = v_clean_phone
    LIMIT 1;

    -- Check organizations
    IF v_email IS NULL THEN
      SELECT
        o.contact_email,
        o.contact_phone,
        o.contact_person
      INTO v_email, v_phone, v_full_name
      FROM public.organizations o
      WHERE RIGHT(regexp_replace(COALESCE(o.contact_phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      LIMIT 1;
    END IF;

    -- Check suppliers
    IF v_email IS NULL THEN
      SELECT
        s.contact_email,
        s.contact_phone,
        s.business_name
      INTO v_email, v_phone, v_full_name
      FROM public.suppliers s
      WHERE RIGHT(regexp_replace(COALESCE(s.contact_phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      LIMIT 1;
    END IF;

    -- Check signup_requests
    IF v_email IS NULL THEN
      SELECT
        sr.email,
        sr.phone,
        COALESCE(sr.contact_first_name || ' ' || sr.contact_last_name, 'Valued User')
      INTO v_email, v_phone, v_full_name
      FROM public.signup_requests sr
      WHERE RIGHT(regexp_replace(COALESCE(sr.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      ORDER BY sr.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No registered account found matching that phone number or email.'
    );
  END IF;

  -- Ensure phone is available for WhatsApp dispatch
  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This account does not have a registered phone number. Please use email reset.'
    );
  END IF;

  -- Generate 6-digit numeric OTP code
  v_code := lpad((floor(random() * 900000 + 100000))::int::text, 6, '0');

  -- Invalidate prior unused OTPs for this email
  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE lower(email) = lower(v_email) AND used_at IS NULL;

  -- Store new OTP with 15-minute expiration
  INSERT INTO public.password_reset_otps (
    email,
    phone,
    otp_code,
    expires_at
  ) VALUES (
    lower(v_email),
    v_phone,
    v_code,
    now() + interval '15 minutes'
  );

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

GRANT EXECUTE ON FUNCTION public.request_whatsapp_password_reset(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function: verify_whatsapp_password_reset
-- Verifies the 6-digit OTP code and updates the user password in auth.users.
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
BEGIN
  IF length(COALESCE(p_new_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Password must be at least 8 characters long.');
  END IF;

  IF position('@' in p_identifier) > 0 THEN
    SELECT id, email, phone
    INTO v_otp_id, v_email, v_phone
    FROM public.password_reset_otps
    WHERE lower(email) = lower(trim(p_identifier))
      AND otp_code = trim(p_otp_code)
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_clean_phone := RIGHT(regexp_replace(p_identifier, '\D', '', 'g'), 10);
    SELECT id, email, phone
    INTO v_otp_id, v_email, v_phone
    FROM public.password_reset_otps
    WHERE RIGHT(regexp_replace(phone, '\D', '', 'g'), 10) = v_clean_phone
      AND otp_code = trim(p_otp_code)
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_otp_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Invalid or expired verification code. Please check the 6-digit code or request a new one.'
    );
  END IF;

  -- Mark OTP as consumed
  UPDATE public.password_reset_otps
  SET used_at = now()
  WHERE id = v_otp_id;

  -- Update auth user password
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now(),
      recovery_token = ''
  WHERE lower(email) = lower(v_email);

  -- Log security audit event
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
    'message', 'Password reset successfully! You can now log in with your new password.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon, authenticated;

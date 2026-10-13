-- Migration 00264: Enhance WhatsApp password reset with public.profiles lookup for email and phone
-- Ensures users whose auth.users.phone is null can still receive WhatsApp password reset OTP
-- via their verified phone registered in public.profiles.

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
      SELECT p.phone INTO v_phone
      FROM public.profiles p
      WHERE lower(p.email) = lower(v_identifier) AND p.phone IS NOT NULL
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
      SELECT p.email, p.phone, p.full_name
      INTO v_email, v_phone, v_full_name
      FROM public.profiles p
      WHERE RIGHT(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
      LIMIT 1;
    END IF;

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

  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No registered account found matching this email or phone.');
  END IF;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No verified WhatsApp phone number linked to this account. Please use standard email reset or contact support.');
  END IF;

  v_clean_phone := regexp_replace(v_phone, '\D', '', 'g');
  IF length(v_clean_phone) = 10 THEN
    v_clean_phone := '91' || v_clean_phone;
  END IF;

  v_code := lpad(floor(random() * 90000000 + 10000000)::text, 8, '0');
  v_salt := gen_random_uuid()::text;

  DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;

  INSERT INTO public.signup_verification_otps (
    phone,
    otp_code_hash,
    otp_salt,
    expires_at,
    attempt_count
  ) VALUES (
    v_clean_phone,
    private.hash_otp_code(v_code, v_salt),
    v_salt,
    now() + interval '10 minutes',
    0
  );

  RETURN jsonb_build_object(
    'ok', true,
    'phone', v_clean_phone,
    'full_name', v_full_name,
    'otp_code', v_code,
    'expires_in_seconds', 600
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_whatsapp_password_reset(text) TO anon, authenticated, service_role;

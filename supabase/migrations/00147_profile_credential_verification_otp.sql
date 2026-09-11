-- Migration 00147: Profile Credential Verification OTP Suite
-- Enables users to unlock and add missing Email or Phone Number with 6-digit OTP verification.

BEGIN;

-- 1. Create table public.profile_verification_otps
CREATE TABLE IF NOT EXISTS public.profile_verification_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_type text NOT NULL CHECK (credential_type IN ('PHONE', 'EMAIL')),
  credential_value text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_verification_otps_lookup
  ON public.profile_verification_otps (profile_id, credential_type, otp_code, used_at, expires_at);

ALTER TABLE public.profile_verification_otps ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own OTP records
DROP POLICY IF EXISTS "profile_verification_otps_user_policy" ON public.profile_verification_otps;
CREATE POLICY "profile_verification_otps_user_policy"
  ON public.profile_verification_otps
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- 2. RPC: request_profile_credential_otp
-- Generates a 6-digit OTP code to verify and link a missing phone number or email address
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
  v_clean_type text;
  v_clean_val text;
  v_code text;
  v_full_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  v_clean_type := upper(trim(p_credential_type));
  v_clean_val := trim(p_credential_value);

  IF v_clean_type NOT IN ('PHONE', 'EMAIL') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Credential type must be PHONE or EMAIL');
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM public.profiles
  WHERE auth_user_id = v_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  IF v_clean_type = 'PHONE' THEN
    -- Normalize phone: extract numbers
    v_clean_val := regexp_replace(v_clean_val, '\D', '', 'g');
    IF length(v_clean_val) < 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid 10-digit mobile number');
    END IF;
    -- Standardize 10-digit Indian numbers with +91 if needed
    IF length(v_clean_val) = 10 THEN
      v_clean_val := '+91 ' || substring(v_clean_val from 1 for 5) || ' ' || substring(v_clean_val from 6 for 5);
    ELSIF length(v_clean_val) = 12 AND substring(v_clean_val from 1 for 2) = '91' THEN
      v_clean_val := '+91 ' || substring(v_clean_val from 3 for 5) || ' ' || substring(v_clean_val from 8 for 5);
    END IF;
  ELSE
    -- Normalize email
    v_clean_val := lower(v_clean_val);
    IF v_clean_val NOT LIKE '%@%.%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Please provide a valid email address');
    END IF;
  END IF;

  -- Invalidate prior unused OTPs for this profile and credential type
  UPDATE public.profile_verification_otps
  SET used_at = now()
  WHERE profile_id = v_profile_id
    AND credential_type = v_clean_type
    AND used_at IS NULL;

  -- Generate 6-digit numeric OTP code
  v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');

  -- Insert new OTP valid for 15 minutes
  INSERT INTO public.profile_verification_otps (
    profile_id,
    credential_type,
    credential_value,
    otp_code,
    expires_at
  ) VALUES (
    v_profile_id,
    v_clean_type,
    v_clean_val,
    v_code,
    now() + interval '15 minutes'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'otp_code', v_code,
    'credential_type', v_clean_type,
    'credential_value', v_clean_val,
    'full_name', COALESCE(v_full_name, 'Valued User'),
    'message', 'Verification code successfully generated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_profile_credential_otp(text, text) TO authenticated, service_role, anon;

-- 3. RPC: verify_and_update_profile_credential
-- Verifies the 6-digit OTP code and updates public.profiles, auth.users, and linked entities
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

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_user_id = v_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  -- Validate OTP code
  SELECT id, credential_value INTO v_otp_id, v_clean_val
  FROM public.profile_verification_otps
  WHERE profile_id = v_profile_id
    AND credential_type = v_clean_type
    AND otp_code = v_clean_code
    AND used_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired verification code. Please request a new code.');
  END IF;

  -- Mark OTP as used
  UPDATE public.profile_verification_otps
  SET used_at = now()
  WHERE id = v_otp_id;

  -- Update public.profiles
  IF v_clean_type = 'PHONE' THEN
    UPDATE public.profiles
    SET phone = v_clean_val,
        updated_at = now()
    WHERE id = v_profile_id;

    -- Sync to auth.users
    UPDATE auth.users
    SET phone = v_clean_val,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone', v_clean_val)
    WHERE id = v_uid;

    -- Sync to organization contact phone if owner/manager
    UPDATE public.organizations o
    SET contact_phone = COALESCE(contact_phone, v_clean_val)
    FROM public.organization_members om
    WHERE om.organization_id = o.id AND om.profile_id = v_profile_id AND (o.contact_phone IS NULL OR o.contact_phone = '');

    -- Sync to supplier contact phone if supplier user
    UPDATE public.suppliers s
    SET contact_phone = COALESCE(contact_phone, v_clean_val)
    FROM public.supplier_users su
    WHERE su.supplier_id = s.id AND su.profile_id = v_profile_id AND (s.contact_phone IS NULL OR s.contact_phone = '');

  ELSE
    UPDATE public.profiles
    SET email = lower(v_clean_val),
        updated_at = now()
    WHERE id = v_profile_id;

    -- Sync to auth.users
    UPDATE auth.users
    SET email = lower(v_clean_val),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email', lower(v_clean_val))
    WHERE id = v_uid;
  END IF;

  -- Record audit event
  INSERT INTO public.audit_events (
    actor_id,
    entity_type,
    entity_id,
    event_type,
    payload
  ) VALUES (
    v_profile_id,
    'profile',
    v_profile_id::text,
    CASE WHEN v_clean_type = 'PHONE' THEN 'profile.phone_verified' ELSE 'profile.email_verified' END,
    jsonb_build_object(
      'credential_type', v_clean_type,
      'credential_value', v_clean_val,
      'verified_at', now()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'credential_type', v_clean_type,
    'credential_value', v_clean_val,
    'message', CASE 
      WHEN v_clean_type = 'PHONE' THEN 'Phone number verified and linked successfully!' 
      ELSE 'Email address verified and linked successfully!' 
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_and_update_profile_credential(text, text, text) TO authenticated, service_role, anon;

COMMIT;

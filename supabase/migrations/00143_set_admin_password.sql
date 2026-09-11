-- Migration 00143: Set admin@otp.test credentials to @dm!n123
-- Guarantees the admin@otp.test auth user, identity, profile and platform admin flags.

BEGIN;

DO $$
DECLARE
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_encrypted_password text := extensions.crypt('@dm!n123', extensions.gen_salt('bf'));
BEGIN
  -- 1. Check if auth.users record exists
  SELECT id INTO v_auth_user_id FROM auth.users WHERE lower(email) = 'admin@otp.test';

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_password,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = '{"full_name": "OTP Platform Super Admin"}'::jsonb,
        raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
        is_super_admin = true,
        updated_at = now()
    WHERE id = v_auth_user_id;
  ELSE
    v_auth_user_id := '0dc00000-0000-4000-8000-000000000001';
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    )
    VALUES (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@otp.test',
      v_encrypted_password,
      now(),
      now(),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "OTP Platform Super Admin"}'::jsonb,
      true,
      'authenticated',
      'authenticated'
    )
    ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = now(),
        updated_at = now();
  END IF;

  -- 2. Upsert auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id::text, 'email', 'admin@otp.test'),
    'email',
    v_auth_user_id::text,
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE
  SET identity_data = EXCLUDED.identity_data,
      updated_at = now();

  -- 3. Upsert public.profiles record with is_platform_admin = true
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_user_id;

  IF v_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_platform_admin = true,
        email = 'admin@otp.test',
        full_name = 'OTP Platform Super Admin',
        active_organization_id = NULL,
        active_role_code = NULL
    WHERE id = v_profile_id;
  ELSE
    v_profile_id := '0db00000-0000-4000-8000-000000000001';
    INSERT INTO public.profiles (
      id,
      auth_user_id,
      email,
      full_name,
      is_platform_admin,
      is_demo
    )
    VALUES (
      v_profile_id,
      v_auth_user_id,
      'admin@otp.test',
      'OTP Platform Super Admin',
      true,
      false
    )
    ON CONFLICT (id) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        is_platform_admin = true,
        active_organization_id = NULL,
        active_role_code = NULL;
  END IF;

  -- 4. Clean up any accidental buyer or supplier assignments
  DELETE FROM public.organization_members WHERE profile_id = v_profile_id;
  DELETE FROM public.supplier_users WHERE profile_id = v_profile_id;

END $$;

COMMIT;

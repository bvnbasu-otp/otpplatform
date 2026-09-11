-- 00071_seed_super_admin_ops_user.sql
-- Dedicated Super Admin / Operations Team Login Account (admin@otp.test / password)

DO $$
DECLARE
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_encrypted_password text := extensions.crypt('password', extensions.gen_salt('bf'));
BEGIN
  -- 1. Check if auth.users record exists
  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = 'admin@otp.test';

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_password,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = '{"full_name": "OTP Operations & Super Admin Team"}'::jsonb,
        is_super_admin = true
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
      '{"full_name": "OTP Operations & Super Admin Team"}'::jsonb,
      true,
      'authenticated',
      'authenticated'
    );
  END IF;

  -- 2. Upsert public.profiles record with is_platform_admin = true
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_user_id;
  IF v_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_platform_admin = true,
        email = 'admin@otp.test',
        full_name = 'OTP Operations & Super Admin Team'
    WHERE id = v_profile_id;
  ELSE
    INSERT INTO public.profiles (
      id,
      auth_user_id,
      email,
      full_name,
      is_platform_admin,
      is_demo,
      created_at,
      updated_at
    )
    VALUES (
      '0db00000-0000-4000-8000-000000000001',
      v_auth_user_id,
      'admin@otp.test',
      'OTP Operations & Super Admin Team',
      true,
      true,
      now(),
      now()
    );
  END IF;

  -- 3. Also grant is_platform_admin to any profile with admin@otp.test
  UPDATE public.profiles
  SET is_platform_admin = true
  WHERE email IN ('admin@otp.test', 'ops@otp.test', 'superadmin@otp.test');

END;
$$;

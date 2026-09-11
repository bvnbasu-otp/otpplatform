-- 00113_seed_real_super_admin_bvnbasu.sql
-- Seed real platform super administrator account (bvnbasu@gmail.com)

DO $$
DECLARE
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_encrypted_password text := extensions.crypt('Admin@OTP2026!', extensions.gen_salt('bf'));
BEGIN
  -- 1. Check if auth.users record exists
  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = 'bvnbasu@gmail.com';

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_password,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        phone = '+919840000000',
        raw_user_meta_data = '{"full_name": "Baskar Loganathan", "phone": "+919840000000"}'::jsonb,
        is_super_admin = true
    WHERE id = v_auth_user_id;
  ELSE
    v_auth_user_id := 'dd2dedee-0c2a-4254-b2af-342b41d56385'::uuid;
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      phone,
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
      'bvnbasu@gmail.com',
      '+919840000000',
      v_encrypted_password,
      now(),
      now(),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Baskar Loganathan", "phone": "+919840000000"}'::jsonb,
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
        email = 'bvnbasu@gmail.com',
        full_name = 'Baskar Loganathan',
        is_demo = false
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
      v_auth_user_id,
      v_auth_user_id,
      'bvnbasu@gmail.com',
      'Baskar Loganathan',
      true,
      false,
      now(),
      now()
    );
  END IF;

  -- 3. Also grant is_platform_admin to any profile with bvnbasu@gmail.com
  UPDATE public.profiles
  SET is_platform_admin = true
  WHERE email = 'bvnbasu@gmail.com';

  -- 4. Upsert auth.identities record for email provider
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
    v_auth_user_id,
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id, 'email', 'bvnbasu@gmail.com'),
    'email',
    v_auth_user_id::text,
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
  SET identity_data = EXCLUDED.identity_data,
      updated_at = now();

END;
$$;

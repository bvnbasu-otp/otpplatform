-- Migration 00157: Fix auth.users GoTrue NULL Token Scan Error
-- GoTrue (Supabase Auth) requires token and string columns to be empty strings ('') rather than SQL NULL.
-- Direct SQL inserts without these fields cause "Database error finding user" (Scan error: converting NULL to string is unsupported).

BEGIN;

-- 1. Patch all existing auth.users rows to replace NULLs with empty strings and defaults
UPDATE auth.users
SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, ''),
  is_sso_user                = COALESCE(is_sso_user, false),
  is_anonymous               = COALESCE(is_anonymous, false)
WHERE
  confirmation_token IS NULL
  OR email_change IS NULL
  OR email_change_token_new IS NULL
  OR email_change_token_current IS NULL
  OR recovery_token IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL
  OR is_sso_user IS NULL
  OR is_anonymous IS NULL;

-- 2. Explicitly ensure bvnbasu@gmail.com has valid tokens, confirmed status, and correct password
DO $$
DECLARE
  v_auth_user_id uuid;
  v_encrypted_password text := extensions.crypt('Admin@OTP2026!', extensions.gen_salt('bf'));
BEGIN
  SELECT id INTO v_auth_user_id FROM auth.users WHERE lower(email) = 'bvnbasu@gmail.com';

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_password,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        phone = COALESCE(phone, '+919840000000'),
        raw_user_meta_data = '{"full_name": "Baskar Loganathan", "phone": "+919840000000"}'::jsonb,
        raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
        is_super_admin = true,
        aud = 'authenticated',
        role = 'authenticated',
        confirmation_token = '',
        email_change = '',
        email_change_token_new = '',
        email_change_token_current = '',
        recovery_token = '',
        phone_change = '',
        phone_change_token = '',
        reauthentication_token = '',
        is_sso_user = false,
        is_anonymous = false,
        updated_at = now()
    WHERE id = v_auth_user_id;

    -- Upsert identity for bvnbasu@gmail.com
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
      jsonb_build_object('sub', v_auth_user_id::text, 'email', 'bvnbasu@gmail.com'),
      'email',
      v_auth_user_id::text,
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data,
        updated_at = now();

    -- Ensure profile is platform admin
    UPDATE public.profiles
    SET is_platform_admin = true,
        full_name = 'Baskar Loganathan',
        email = 'bvnbasu@gmail.com'
    WHERE auth_user_id = v_auth_user_id OR lower(email) = 'bvnbasu@gmail.com';

  END IF;
END $$;

COMMIT;

-- Greenfield Local Development Seed
-- Configures exclusively canonical Platform Founders & Super Administrators:
--   1. bvnbasu@gmail.com (Password: Admin@OTP2026!)
--   2. bvnbasu@yahoo.com (Password: Admin@otp2026!)
-- Zero demo accounts, zero fake buyers, zero fake suppliers, zero mock RFQs/quotes.
-- Clean SNE / Google Places discovery cache for true greenfield onboarding.

BEGIN;

SET search_path = public, private, auth, extensions, private_security;

-- Ensure required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Enable administrative maintenance context
SET LOCAL "otp.platform_privilege_write" = 'on';
SET LOCAL "otp.platform_break_glass" = 'on';
SET LOCAL "otp.platform_bootstrap" = 'on';

-- ---------------------------------------------------------------------------
-- 1. Canonical Founders Auth Users (Passwords: Admin@OTP2026! and Admin@otp2026!)
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  phone,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'dd2dedee-0c2a-4254-b2af-342b41d56385',
    'authenticated', 'authenticated',
    'bvnbasu@gmail.com',
    '+919840000000',
    extensions.crypt('Admin@OTP2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Baskar Loganathan","phone":"+919840000000"}'::jsonb,
    true,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ee3dedee-0c2a-4254-b2af-342b41d56386',
    'authenticated', 'authenticated',
    'bvnbasu@yahoo.com',
    '+919840000001',
    extensions.crypt('Admin@otp2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Baskar Loganathan","phone":"+919840000001"}'::jsonb,
    true,
    now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    is_super_admin = true,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Auth identities (required for GoTrue signInWithPassword)
-- ---------------------------------------------------------------------------

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
) VALUES
  ('dd2dedee-0c2a-4254-b2af-342b41d56385', 'dd2dedee-0c2a-4254-b2af-342b41d56385', '{"sub":"dd2dedee-0c2a-4254-b2af-342b41d56385","email":"bvnbasu@gmail.com"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('ee3dedee-0c2a-4254-b2af-342b41d56386', 'ee3dedee-0c2a-4254-b2af-342b41d56386', '{"sub":"ee3dedee-0c2a-4254-b2af-342b41d56386","email":"bvnbasu@yahoo.com"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid())
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change = COALESCE(email_change, '');

-- ---------------------------------------------------------------------------
-- 3. Canonical Founder Profiles
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles (
  id, auth_user_id, email, full_name, is_founder, is_platform_admin,
  active_role_code, status, is_demo, created_at, updated_at
) VALUES
  (
    'dd2dedee-0c2a-4254-b2af-342b41d56386',
    'dd2dedee-0c2a-4254-b2af-342b41d56385',
    'bvnbasu@gmail.com',
    'Baskar Loganathan',
    true, true, 'SUPER_ADMIN', 'ACTIVE', false, now(), now()
  ),
  (
    'ee3dedee-0c2a-4254-b2af-342b41d56387',
    'ee3dedee-0c2a-4254-b2af-342b41d56386',
    'bvnbasu@yahoo.com',
    'Baskar Loganathan',
    true, true, 'SUPER_ADMIN', 'ACTIVE', false, now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_founder = true,
    is_platform_admin = true,
    active_role_code = 'SUPER_ADMIN',
    status = 'ACTIVE',
    is_demo = false,
    deleted_at = NULL,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Role Assignments (SUPER_ADMIN)
-- ---------------------------------------------------------------------------

INSERT INTO public.profile_roles (profile_id, role_code, is_demo)
VALUES
  ('dd2dedee-0c2a-4254-b2af-342b41d56386', 'SUPER_ADMIN', false),
  ('ee3dedee-0c2a-4254-b2af-342b41d56387', 'SUPER_ADMIN', false)
ON CONFLICT (profile_id, role_code) DO NOTHING;

DO $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM public.internal_roles WHERE code = 'SUPER_ADMIN';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_at)
    VALUES
      ('dd2dedee-0c2a-4254-b2af-342b41d56386', v_role_id, now()),
      ('ee3dedee-0c2a-4254-b2af-342b41d56387', v_role_id, now())
    ON CONFLICT (profile_id, role_id) DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Greenfield Environment Settings
-- ---------------------------------------------------------------------------

UPDATE public.demo_settings
SET demo_mode_enabled = false,
    supplier_network_stub_enabled = false,
    maintenance_mode_enabled = false,
    updated_at = now()
WHERE id = true;

PERFORM set_config('otp.platform_privilege_write', 'off', true);
PERFORM set_config('otp.platform_break_glass', 'off', true);
PERFORM set_config('otp.platform_bootstrap', 'off', true);

COMMIT;

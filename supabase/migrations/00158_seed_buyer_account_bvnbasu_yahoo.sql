-- Migration 00158: Seed Normal Buyer Account for bvnbasu@yahoo.com
-- Sets up bvnbasu@yahoo.com as a verified Buyer (Procurement Lead / Org Owner)

BEGIN;

DO $$
DECLARE
  v_auth_user_id uuid := 'ee3dedee-0c2a-4254-b2af-342b41d56386'::uuid;
  v_profile_id uuid;
  v_org_id uuid := '11111111-1111-4000-8000-000000000001'::uuid; -- Greenview Heights RWA
  v_encrypted_password text := extensions.crypt('Password@123', extensions.gen_salt('bf'));
BEGIN
  -- 1. Create / Upsert auth.users record for bvnbasu@yahoo.com
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
    aud,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    recovery_token,
    phone_change,
    phone_change_token,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    v_auth_user_id,
    '00000000-0000-0000-0000-000000000000',
    'bvnbasu@yahoo.com',
    '+919840000001',
    v_encrypted_password,
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Baskar Loganathan", "phone": "+919840000001"}'::jsonb,
    false,
    'authenticated',
    'authenticated',
    '', '', '', '', '', '', '', '', false, false
  )
  ON CONFLICT (id) DO UPDATE
  SET email = 'bvnbasu@yahoo.com',
      encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
      is_super_admin = false,
      confirmation_token = '',
      recovery_token = '',
      updated_at = now();

  -- 2. Upsert auth.identities record
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
    jsonb_build_object('sub', v_auth_user_id::text, 'email', 'bvnbasu@yahoo.com'),
    'email',
    v_auth_user_id::text,
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
  SET identity_data = EXCLUDED.identity_data,
      updated_at = now();

  -- 3. Upsert public.profiles record as a regular buyer (is_platform_admin = false)
  INSERT INTO public.profiles (
    id,
    auth_user_id,
    email,
    full_name,
    is_platform_admin,
    is_demo,
    active_organization_id,
    created_at,
    updated_at
  )
  VALUES (
    v_auth_user_id,
    v_auth_user_id,
    'bvnbasu@yahoo.com',
    'Baskar Loganathan',
    false,
    false,
    v_org_id,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET is_platform_admin = false,
      email = 'bvnbasu@yahoo.com',
      full_name = 'Baskar Loganathan',
      active_organization_id = v_org_id,
      updated_at = now();

  -- 4. Assign to Buyer Organization as OWNER
  INSERT INTO public.organization_members (
    organization_id,
    profile_id,
    role
  )
  VALUES (
    v_org_id,
    v_auth_user_id,
    'OWNER'
  )
  ON CONFLICT (organization_id, profile_id) DO UPDATE
  SET role = 'OWNER';

  -- 5. Assign buyer role (PROCUREMENT_LEAD)
  INSERT INTO public.profile_roles (
    profile_id,
    role_code
  )
  VALUES (
    v_auth_user_id,
    'PROCUREMENT_LEAD'
  )
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  -- 6. Set active_role_code on profile after profile_roles entry exists
  UPDATE public.profiles
  SET active_role_code = 'PROCUREMENT_LEAD'
  WHERE id = v_auth_user_id;

END $$;

COMMIT;

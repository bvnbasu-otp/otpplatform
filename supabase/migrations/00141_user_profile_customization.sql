-- Migration 00141: User Profile Customization Suite
-- Enables Supplier, Buyer, and Super Admin profile updates (name, title, avatar/photo)
-- Strictly enforces non-editable Phone Number and Email Address

BEGIN;

-- 1. Ensure title, avatar_url, and phone columns exist in public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'title'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN title text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone text DEFAULT NULL;
  END IF;
END $$;

-- 2. Backfill phone numbers from auth.users, suppliers, and organizations where missing
UPDATE public.profiles p
SET phone = COALESCE(
  NULLIF(trim(u.phone), ''),
  NULLIF(trim(u.raw_user_meta_data->>'phone'), ''),
  p.phone
)
FROM auth.users u
WHERE p.auth_user_id = u.id AND (p.phone IS NULL OR p.phone = '');

UPDATE public.profiles p
SET phone = s.contact_phone
FROM public.supplier_users su
JOIN public.suppliers s ON s.id = su.supplier_id
WHERE su.profile_id = p.id AND (p.phone IS NULL OR p.phone = '');

UPDATE public.profiles p
SET phone = o.contact_phone
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
WHERE om.profile_id = p.id AND (p.phone IS NULL OR p.phone = '');

-- 3. Set sensible default titles if currently null
UPDATE public.profiles
SET title = 'Platform Super Administrator'
WHERE is_platform_admin = true AND (title IS NULL OR title = '');

UPDATE public.profiles p
SET title = 'Authorized Supplier Representative'
FROM public.supplier_users su
WHERE su.profile_id = p.id AND (p.title IS NULL OR p.title = '') AND p.is_platform_admin = false;

UPDATE public.profiles p
SET title = CASE 
  WHEN om.role::text = 'OWNER' THEN 'Organization Owner / President'
  WHEN om.role::text = 'MANAGER' THEN 'Procurement Manager'
  WHEN om.role::text = 'BUYER' THEN 'Sourcing Specialist'
  WHEN om.role::text = 'COMMITTEE_MEMBER' THEN 'Evaluation Committee Member'
  ELSE 'Institutional Member'
END
FROM public.organization_members om
WHERE om.profile_id = p.id AND (p.title IS NULL OR p.title = '') AND p.is_platform_admin = false;

-- 4. RPC: public.get_my_profile()
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_res jsonb;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.id, COALESCE(NULLIF(p.phone, ''), NULLIF(u.phone, ''), NULLIF(u.raw_user_meta_data->>'phone', ''))
  INTO v_profile_id, v_phone
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.auth_user_id
  WHERE p.auth_user_id = v_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'phone', COALESCE(NULLIF(p.phone, ''), v_phone, 'Not registered'),
    'full_name', p.full_name,
    'title', COALESCE(p.title, ''),
    'avatar_url', COALESCE(p.avatar_url, ''),
    'is_platform_admin', p.is_platform_admin,
    'active_role_code', p.active_role_code,
    'active_organization_id', p.active_organization_id,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_res
  FROM public.profiles p
  WHERE p.id = v_profile_id;

  RETURN jsonb_build_object('ok', true, 'profile', v_res);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role, anon;

-- 5. RPC: public.update_my_profile()
-- Strictly updates full_name, title, and avatar_url
-- Email and Phone are strictly non-editable and rejected if attempted
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text,
  p_title text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Full name must be at least 2 characters');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile record not found');
  END IF;

  -- Strictly update ONLY full_name, title, avatar_url, and updated_at
  -- email and phone are completely locked and untouched
  UPDATE public.profiles
  SET 
    full_name = trim(p_full_name),
    title = NULLIF(trim(p_title), ''),
    avatar_url = NULLIF(trim(p_avatar_url), ''),
    updated_at = now()
  WHERE id = v_profile_id;

  -- Sync raw_user_meta_data in auth.users
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'full_name', trim(p_full_name),
    'title', NULLIF(trim(p_title), ''),
    'avatar_url', NULLIF(trim(p_avatar_url), '')
  )
  WHERE id = v_uid;

  -- Insert immutable audit event
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
    'profile.updated',
    jsonb_build_object(
      'full_name', trim(p_full_name),
      'title', NULLIF(trim(p_title), ''),
      'has_avatar', (p_avatar_url IS NOT NULL AND length(trim(p_avatar_url)) > 0)
    )
  );

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'phone', p.phone,
    'full_name', p.full_name,
    'title', p.title,
    'avatar_url', p.avatar_url,
    'is_platform_admin', p.is_platform_admin,
    'updated_at', p.updated_at
  ) INTO v_res
  FROM public.profiles p
  WHERE p.id = v_profile_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', v_res,
    'message', 'Profile updated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text) TO authenticated, service_role, anon;

-- 6. Update public.my_role_context() to include profile fields
CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_side signup_side;
  v_admin boolean;
  v_active text;
  v_roles jsonb;
  v_active_org_id uuid;
  v_org_role text := NULL;
  v_org_id uuid := NULL;
  v_org_name text := NULL;
  v_org_type text := NULL;
  v_organizations jsonb;
  v_email text;
  v_full_name text;
  v_title text;
  v_avatar_url text;
  v_phone text;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT email, is_platform_admin, active_role_code, active_organization_id, full_name, title, avatar_url, phone
  INTO v_email, v_admin, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone
  FROM profiles WHERE id = v_profile;

  -- Enforce platform admin for designated superadmin emails
  IF v_admin IS NOT TRUE AND v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    v_admin := true;
  END IF;

  -- Isolated SuperAdmin Context
  IF v_admin IS TRUE THEN
    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', NULL,
      'isPlatformAdmin', true,
      'needsOnboarding', false,
      'activeRole', NULL,
      'roles', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, 'Platform Super Administrator'),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', COALESCE(v_phone, '+91 99729 67530')
    );
  END IF;

  v_side := private.profile_side(v_profile);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', ur.code,
    'label', ur.label,
    'side', ur.side,
    'description', ur.description,
    'permissions', to_jsonb(ur.permissions),
    'assignedByAdmin', pr.assigned_by IS NOT NULL
  ) ORDER BY ur.sort_order), '[]'::jsonb)
  INTO v_roles
  FROM profile_roles pr
  JOIN user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile;

  IF v_active IS NULL AND jsonb_array_length(v_roles) = 1 THEN
    v_active := v_roles -> 0 ->> 'code';
  END IF;

  -- Collect all organization memberships
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'orgType', o.org_type::text,
    'role', om.role::text,
    'isPersonal', (o.org_type::text = 'INDIVIDUAL')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile;

  -- Select active organization
  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text, o.id, o.name, o.org_type::text
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  -- Fallback to first organization if no active or invalid
  IF v_org_id IS NULL THEN
    SELECT om.role::text, o.id, o.name, o.org_type::text
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'needsOnboarding', (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', ur.code, 'label', ur.label, 'description', ur.description,
        'permissions', to_jsonb(ur.permissions))
      FROM user_roles ur WHERE ur.code = v_active
    ),
    'roles', v_roles,
    'organizations', v_organizations,
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', (
      SELECT count(*) FROM committee_assignments ca WHERE ca.profile_id = v_profile
    ),
    'supplierId', (
      SELECT su.supplier_id FROM supplier_users su
      WHERE su.profile_id = v_profile LIMIT 1
    ),
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role, anon;

-- 7. Record migration in otp_schema_migrations if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_schema_migrations') THEN
    INSERT INTO public.otp_schema_migrations (version, applied_at)
    VALUES ('00141', now())
    ON CONFLICT (version) DO UPDATE SET applied_at = now();
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

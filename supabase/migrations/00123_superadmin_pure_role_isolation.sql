-- Migration 00123: SuperAdmin Pure Role Isolation & Console Navigation
-- Ensures bvnbasu@gmail.com, admin@otp.test, ops@otp.test are never treated as buyer or supplier.
-- Purges contaminated organization_members or supplier_users entries and guarantees pure admin context.

-- 1. Purge any accidental buyer organization memberships for superadmin accounts
DELETE FROM public.organization_members
WHERE profile_id IN (
  SELECT id FROM public.profiles
  WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test')
     OR is_platform_admin = true
);

-- 2. Purge any accidental supplier assignments for superadmin accounts
DELETE FROM public.supplier_users
WHERE profile_id IN (
  SELECT id FROM public.profiles
  WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test')
     OR is_platform_admin = true
);

-- 3. Reset active_organization_id and active_role_code, and ensure is_platform_admin = true
UPDATE public.profiles
SET is_platform_admin = true,
    active_organization_id = NULL,
    active_role_code = NULL
WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test')
   OR is_platform_admin = true;

-- 4. Update benchmark organization contact email if it pointed to superadmin
UPDATE public.organizations
SET contact_email = 'buyer.greenview@otp.test',
    contact_person = 'Greenview RWA Lead'
WHERE id = '11111111-1111-4000-8000-000000000001'
  AND contact_email IN ('bvnbasu@gmail.com', 'admin@otp.test');

-- 5. Strengthen private.is_platform_admin() with fallback email recognition
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1),
    (SELECT email IN ('admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test') FROM auth.users WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role, anon;

-- 6. Enforce that SuperAdmin / Platform Admin profiles NEVER return 'BUYER' or 'SUPPLIER'
CREATE OR REPLACE FUNCTION private.profile_side(p_profile_id uuid DEFAULT NULL)
RETURNS signup_side
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := COALESCE(p_profile_id, private.get_profile_id());
  v_is_admin boolean;
  v_email text;
BEGIN
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_platform_admin, email INTO v_is_admin, v_email FROM profiles WHERE id = v_profile;

  -- Platform Admin & SuperAdmin accounts are strictly isolated from Buyer and Supplier sides
  IF v_is_admin IS TRUE OR v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM supplier_users su
    WHERE su.profile_id = v_profile
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.profile_id = v_profile
  ) THEN
    RETURN 'BUYER'::signup_side;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION private.profile_side(uuid) TO authenticated, service_role, anon;

-- 7. Ensure public.my_role_context() yields a dedicated SuperAdmin context
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
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT email, is_platform_admin, active_role_code, active_organization_id
  INTO v_email, v_admin, v_active, v_active_org_id
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
      'supplierId', NULL
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
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role, anon;

-- 8. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

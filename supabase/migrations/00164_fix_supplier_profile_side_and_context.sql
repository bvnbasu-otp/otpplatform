-- Migration 00164: Robust Supplier Profile Side and Role Context Resolution
-- Ensures all suppliers correctly resolve side = 'SUPPLIER', preventing unexpected buyer fallback.

BEGIN;

-- 1. Resilient private.profile_side()
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
  v_auth_uid uuid;
BEGIN
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_platform_admin, email, auth_user_id
  INTO v_is_admin, v_email, v_auth_uid
  FROM profiles WHERE id = v_profile;

  -- Platform Admin & SuperAdmin accounts are strictly isolated from Buyer and Supplier sides
  IF v_is_admin IS TRUE OR v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    RETURN NULL;
  END IF;

  -- 1. Check direct supplier_users linking (by profile id or auth user id)
  IF EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.profile_id = v_profile
       OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 2. Check suppliers table by contact_email
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE lower(s.contact_email) = lower(v_email)
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 3. Check active_role_code or profile_roles
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_profile AND (
      p.active_role_code IN ('SUPPLIER_FOUNDER', 'SUPPLIER_BID_MANAGER', 'SUPPLIER_STAFF', 'SUPPLIER')
      OR p.active_role_code LIKE 'SUPPLIER%'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.profile_roles pr
    JOIN public.user_roles ur ON ur.code = pr.role_code
    WHERE pr.profile_id = v_profile AND ur.side = 'SUPPLIER'
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 4. Check organization members for buyer
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.profile_id = v_profile
       OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
  ) THEN
    RETURN 'BUYER'::signup_side;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION private.profile_side(uuid) TO authenticated, service_role, anon;

-- 2. Resilient public.my_role_context()
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
  v_status text := 'ACTIVE';
  v_blocked_at timestamptz := NULL;
  v_blocked_reason text := NULL;
  v_is_blocked boolean := false;
  v_auth_uid uuid;
  v_supplier_id uuid := NULL;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT email, is_platform_admin, active_role_code, active_organization_id, full_name, title, avatar_url, phone,
         COALESCE(status, 'ACTIVE'), blocked_at, blocked_reason, auth_user_id
  INTO v_email, v_admin, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone,
       v_status, v_blocked_at, v_blocked_reason, v_auth_uid
  FROM profiles WHERE id = v_profile;

  -- Check if user belongs to a suspended supplier
  IF v_status <> 'BLOCKED' AND v_status <> 'DELETED' THEN
    IF EXISTS (
      SELECT 1 FROM public.supplier_users su
      JOIN public.suppliers s ON s.id = su.supplier_id
      WHERE (su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid))
        AND (s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL)
    ) THEN
      v_status := 'BLOCKED';
      v_is_blocked := true;
      IF v_blocked_reason IS NULL THEN
        SELECT blocked_reason INTO v_blocked_reason
        FROM public.suppliers s
        JOIN public.supplier_users su ON su.supplier_id = s.id
        WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_status = 'BLOCKED' OR v_status = 'SUSPENDED' OR v_status = 'DELETED' OR v_blocked_at IS NOT NULL THEN
    v_is_blocked := true;
  END IF;

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
      'phone', COALESCE(v_phone, '+91 99729 67530'),
      'isBlocked', false,
      'status', 'ACTIVE'
    );
  END IF;

  v_side := private.profile_side(v_profile);

  -- Fetch roles for this profile
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

  -- Fallback default role for suppliers if profile_roles is not yet populated
  IF v_side = 'SUPPLIER' AND (v_roles IS NULL OR jsonb_array_length(v_roles) = 0) THEN
    v_active := COALESCE(v_active, 'SUPPLIER_FOUNDER');
    v_roles := jsonb_build_array(jsonb_build_object(
      'code', 'SUPPLIER_FOUNDER',
      'label', 'Supplier Founder / Owner',
      'side', 'SUPPLIER',
      'description', 'Full commercial authority for quoting, contracts, and work order delivery.',
      'permissions', '["READ", "WRITE", "PROPOSE", "APPROVE", "AWARD"]'::jsonb,
      'assignedByAdmin', false
    ));
  END IF;

  IF v_active IS NULL AND jsonb_array_length(v_roles) = 1 THEN
    v_active := v_roles -> 0 ->> 'code';
  END IF;

  -- Collect all organization memberships
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'orgType', o.org_type::text,
    'role', om.role::text,
    'isPersonal', (o.org_type::text = 'INDIVIDUAL'),
    'status', COALESCE(o.status, 'ACTIVE')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid);

  -- Select active organization
  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE (om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid))
      AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  -- Fallback to first organization if active_organization_id is not set and user is BUYER
  IF v_org_id IS NULL AND v_side = 'BUYER' THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;
  END IF;

  -- Resolve Supplier ID
  SELECT COALESCE(
    (
      SELECT su.supplier_id
      FROM public.supplier_users su
      WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
      LIMIT 1
    ),
    (
      SELECT s.id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1
    )
  ) INTO v_supplier_id;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'needsOnboarding', (
      CASE
        WHEN v_side = 'SUPPLIER' THEN false
        WHEN v_active IS NULL OR (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL) THEN true
        ELSE false
      END
    ),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', code,
        'label', label,
        'side', side,
        'description', description,
        'permissions', to_jsonb(permissions)
      )
      FROM user_roles
      WHERE code = v_active
    ),
    'roles', v_roles,
    'organizations', v_organizations,
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', (
      SELECT count(*)::int
      FROM committee_assignments
      WHERE profile_id = v_profile OR (v_auth_uid IS NOT NULL AND profile_id = v_auth_uid)
    ),
    'supplierId', v_supplier_id,
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'blockedReason', v_blocked_reason,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, anon, service_role;

COMMIT;

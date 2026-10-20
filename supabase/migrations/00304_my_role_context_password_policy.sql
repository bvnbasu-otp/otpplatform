-- 00304: attach passwordPolicy to my_role_context
BEGIN;

CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_password_policy jsonb;
  v_profile uuid := private.get_profile_id();
  v_side signup_side;
  v_admin boolean;
  v_founder boolean := false;
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
  v_is_blocked boolean := false;
  v_status text := 'ACTIVE';
  v_supplier_id uuid := NULL;
  v_blocked_reason text := NULL;
  v_blocked_at timestamptz := NULL;
  v_auth_uid uuid := auth.uid();
  v_is_internal boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object(
      'signedIn', false,
      'profileId', NULL,
      'side', NULL,
      'isPlatformAdmin', false,
      'isFounder', false,
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
      'fullName', NULL,
      'title', NULL,
      'avatarUrl', NULL,
      'email', NULL,
      'phone', NULL,
      'isBlocked', false,
      'status', 'ANON'
    ,
      'passwordPolicy', jsonb_build_object('enforced', true, 'exempt', false, 'mustChangePassword', false, 'expiresAt', NULL, 'daysRemaining', NULL, 'warnLevel', NULL)
    );
  END IF;

  v_password_policy := private.password_policy_status(v_profile);

  SELECT
    p.is_platform_admin,
    COALESCE(p.is_founder, false),
    p.active_role_code,
    p.active_organization_id,
    p.email,
    p.full_name,
    p.title,
    p.avatar_url,
    p.phone,
    p.status,
    p.blocked_reason,
    p.blocked_at
  INTO
    v_admin,
    v_founder,
    v_active,
    v_active_org_id,
    v_email,
    v_full_name,
    v_title,
    v_avatar_url,
    v_phone,
    v_status,
    v_blocked_reason,
    v_blocked_at
  FROM public.profiles p
  WHERE p.id = v_profile;

  IF v_status IS DISTINCT FROM 'BLOCKED' AND v_blocked_at IS NULL THEN
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

  v_is_internal := private.authoritative_internal_operator_access(v_profile);

  -- Platform Admin, Founder & Internal Operators are strictly CONSOLE side
  IF v_admin IS TRUE OR v_is_internal IS TRUE THEN
    -- Populate available internal roles for switching
    IF v_founder IS TRUE OR v_admin IS TRUE THEN
      -- Founder / CEO / SuperAdmin can switch to ANY internal role in internal_roles
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', ir.code,
        'label', ir.name,
        'side', 'CONSOLE',
        'description', ir.description,
        'permissions', jsonb_build_array('READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'),
        'assignedByAdmin', false
      ) ORDER BY ir.is_system DESC, ir.name), '[]'::jsonb)
      INTO v_roles
      FROM public.internal_roles ir;
    ELSE
      -- Standard internal operator: populate from assigned roles
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', ir.code,
        'label', ir.name,
        'side', 'CONSOLE',
        'description', ir.description,
        'permissions', jsonb_build_array('READ', 'WRITE'),
        'assignedByAdmin', true
      ) ORDER BY ir.name), '[]'::jsonb)
      INTO v_roles
      FROM public.internal_user_assignments ua
      JOIN public.internal_roles ir ON ir.id = ua.role_id
      WHERE ua.profile_id = v_profile;
    END IF;

    -- Default active internal role if not set or invalid
    IF v_active IS NULL OR NOT EXISTS (SELECT 1 FROM public.internal_roles WHERE code = v_active) THEN
      IF v_founder IS TRUE OR v_admin IS TRUE THEN
        v_active := 'SUPER_ADMIN';
      ELSIF jsonb_array_length(v_roles) > 0 THEN
        v_active := v_roles->0->>'code';
      ELSE
        v_active := 'INTERNAL_OPERATOR';
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', 'CONSOLE',
      'isPlatformAdmin', COALESCE(v_admin, false),
      'isFounder', COALESCE(v_founder, false),
      'needsOnboarding', false,
      'activeRole', (
        SELECT jsonb_build_object(
          'code', ir.code,
          'label', ir.name,
          'side', 'CONSOLE',
          'description', ir.description,
          'permissions', jsonb_build_array('READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD')
        )
        FROM public.internal_roles ir
        WHERE ir.code = v_active
        LIMIT 1
      ),
      'roles', COALESCE(v_roles, '[]'::jsonb),
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, CASE WHEN v_founder IS TRUE THEN 'Founder & CEO' ELSE 'Platform Administrator' END),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', COALESCE(v_phone, '+91 99729 67530'),
      'isBlocked', v_is_blocked,
      'status', v_status,
      'passwordPolicy', v_password_policy
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
  FROM public.profile_roles pr
  JOIN public.user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile
    AND (v_side IS NULL OR ur.side = v_side);

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

  IF v_active IS NULL AND jsonb_array_length(v_roles) > 0 THEN
    v_active := v_roles->0->>'code';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'orgType', o.org_type::text,
    'role', om.role::text,
    'isPersonal', (o.org_type::text = 'INDIVIDUAL'),
    'status', COALESCE(o.status, 'ACTIVE')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid);

  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE (om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid))
      AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND (v_side = 'BUYER' OR v_side IS NULL) THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;

    IF v_org_id IS NULL AND (
      to_regprocedure('private.is_personal_buyer_profile(uuid)') IS NOT NULL
      AND private.is_personal_buyer_profile(v_profile)
    ) THEN
      v_org_role := 'OWNER';
      v_org_type := 'INDIVIDUAL';
    END IF;
  END IF;

  IF v_side = 'SUPPLIER' THEN
    SELECT s.id INTO v_supplier_id
    FROM public.suppliers s
    JOIN public.supplier_users su ON su.supplier_id = s.id
    WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
    LIMIT 1;

    IF v_supplier_id IS NULL AND v_email IS NOT NULL THEN
      SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'isFounder', false,
    'needsOnboarding', (v_roles IS NULL OR jsonb_array_length(v_roles) = 0),
    'activeRole', CASE WHEN v_active IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'code', ur.code,
        'label', ur.label,
        'side', ur.side,
        'description', ur.description,
        'permissions', to_jsonb(ur.permissions)
      )
      FROM public.user_roles ur WHERE ur.code = v_active
    ) ELSE NULL END,
    'roles', COALESCE(v_roles, '[]'::jsonb),
    'organizations', COALESCE(v_organizations, '[]'::jsonb),
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', CASE
      WHEN v_side = 'CONSOLE'::signup_side THEN 0
      ELSE (
        SELECT count(DISTINCT r.id)::int
        FROM public.rfqs r
        WHERE r.status IN ('EVALUATING', 'CLOSED')
          AND (v_org_id IS NULL OR r.organization_id = v_org_id)
      )
    END,
    'supplierId', v_supplier_id,
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'status', v_status,
    'passwordPolicy', v_password_policy
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.my_role_context() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- 00301_internal_console_role_switching_and_isolation.sql
-- Step 4 of OTP Phase 2: Internal Console Role Switching, Executive Alignment & Workspace Isolation

-- 1. Ensure complete internal role catalog in user_roles and internal_roles
INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order)
VALUES
  ('SUPER_ADMIN', 'CONSOLE', 'Super Administrator', 'Full system and operator governance', ARRAY['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD']::role_permission[], 10),
  ('INTERNAL_OPERATOR', 'CONSOLE', 'Internal Operations Staff', 'Platform support and operational tasks', ARRAY['READ', 'WRITE']::role_permission[], 20),
  ('FINANCE_OPERATOR', 'CONSOLE', 'Finance Operator', 'Staff referrals and ledger reconciliations', ARRAY['READ', 'WRITE', 'APPROVE']::role_permission[], 30),
  ('CATALOG_MANAGER', 'CONSOLE', 'Catalog Manager', 'Platform taxonomy and directory management', ARRAY['READ', 'WRITE']::role_permission[], 40),
  ('SUPPORT_OPERATOR', 'CONSOLE', 'Support & Diagnostics Operator', 'Buyer and seller troubleshooting and ticket resolution', ARRAY['READ', 'WRITE']::role_permission[], 50),
  ('LEGAL_AUDITOR', 'CONSOLE', 'Legal & Audit Reviewer', 'Regulatory compliance, audit log verification and legal reviews', ARRAY['READ']::role_permission[], 60)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    side = EXCLUDED.side;

INSERT INTO public.internal_roles (code, name, description, is_system)
VALUES 
  ('SUPER_ADMIN', 'Super Administrator', 'Full system and operator governance', true),
  ('INTERNAL_OPERATOR', 'Internal Operations Staff', 'Platform support and operational tasks', true),
  ('FINANCE_OPERATOR', 'Finance Operator', 'Staff referrals and ledger reconciliations', true),
  ('CATALOG_MANAGER', 'Catalog Manager', 'Platform taxonomy and directory management', true),
  ('SUPPORT_OPERATOR', 'Support & Diagnostics Operator', 'Buyer and seller troubleshooting and ticket resolution', true),
  ('LEGAL_AUDITOR', 'Legal & Audit Reviewer', 'Regulatory compliance, audit log verification and legal reviews', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 2. Update assert_active_role_held to recognize internal console roles
CREATE OR REPLACE FUNCTION private.assert_active_role_held()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF NEW.active_role_code IS NOT NULL THEN
    -- If Founder or Platform Admin or CONSOLE side:
    IF NEW.is_founder IS TRUE OR NEW.is_platform_admin IS TRUE OR NEW.active_portal_side = 'CONSOLE' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.internal_roles ir WHERE ir.code = NEW.active_role_code
      ) AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.code = NEW.active_role_code
      ) THEN
        RAISE EXCEPTION 'A person cannot act in an internal role that does not exist (%)', NEW.active_role_code;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM profile_roles pr
        WHERE pr.profile_id = NEW.id AND pr.role_code = NEW.active_role_code
      ) THEN
        RAISE EXCEPTION 'A person cannot act in a role they have not been given (%)',
          NEW.active_role_code;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure profile_roles entry for bvnbasu@gmail.com
INSERT INTO public.profile_roles (profile_id, role_code)
SELECT p.id, 'SUPER_ADMIN'
FROM public.profiles p
WHERE lower(p.email) = 'bvnbasu@gmail.com'
ON CONFLICT (profile_id, role_code) DO NOTHING;

-- 3. Align bvnbasu@gmail.com as Founder, CEO & Superadmin
UPDATE public.profiles
SET is_founder = true,
    is_platform_admin = true,
    title = 'Founder & CEO',
    active_portal_side = 'CONSOLE'::public.signup_side,
    active_organization_id = NULL,
    active_role_code = 'SUPER_ADMIN',
    status = 'ACTIVE',
    updated_at = clock_timestamp()
WHERE lower(email) = 'bvnbasu@gmail.com';

-- Ensure SUPER_ADMIN assignment for bvnbasu@gmail.com in internal_user_assignments
INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
SELECT p.id, r.id, p.id
FROM public.profiles p
CROSS JOIN public.internal_roles r
WHERE lower(p.email) = 'bvnbasu@gmail.com'
  AND r.code = 'SUPER_ADMIN'
ON CONFLICT (profile_id, role_id) DO NOTHING;

-- 3. Enhanced public.switch_active_role to support internal operator role-switching
CREATE OR REPLACE FUNCTION public.switch_active_role(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_admin boolean := false;
  v_founder boolean := false;
  v_is_internal boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT is_platform_admin, is_founder INTO v_admin, v_founder
  FROM public.profiles
  WHERE id = v_profile;

  v_is_internal := private.authoritative_internal_operator_access(v_profile);

  IF v_founder IS TRUE OR v_admin IS TRUE THEN
    -- Founder & SuperAdmin can switch to ANY role in internal_roles
    IF NOT EXISTS (
      SELECT 1 FROM public.internal_roles WHERE code = p_code
    ) AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE code = p_code
    ) THEN
      RAISE EXCEPTION 'Role % does not exist', p_code;
    END IF;
  ELSIF v_is_internal IS TRUE THEN
    -- Internal operator must hold the assignment
    IF NOT EXISTS (
      SELECT 1 FROM public.internal_user_assignments ua
      JOIN public.internal_roles ir ON ir.id = ua.role_id
      WHERE ua.profile_id = v_profile AND ir.code = p_code
    ) THEN
      RAISE EXCEPTION 'You do not hold the internal role %', p_code;
    END IF;
  ELSE
    -- Customer buyer/supplier: check profile_roles
    IF NOT EXISTS (
      SELECT 1 FROM public.profile_roles
      WHERE profile_id = v_profile AND role_code = p_code
    ) THEN
      RAISE EXCEPTION 'You do not hold the role %', p_code;
    END IF;
  END IF;

  UPDATE public.profiles
  SET active_role_code = p_code,
      updated_at = clock_timestamp()
  WHERE id = v_profile;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'profile.role_switched',
    v_profile,
    'profile',
    v_profile::text,
    jsonb_build_object('role', p_code, 'is_internal', (v_founder OR v_admin OR v_is_internal))
  );

  RETURN public.my_role_context();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_role(text) TO authenticated;

-- 4. Enhanced public.my_role_context() with Internal Role Catalog & Context Switching
CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
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
    );
  END IF;

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
      'status', v_status
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
    'committeeRfqCount', 0,
    'supplierId', v_supplier_id,
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role;

-- 00298_internal_rbac_and_portal_console_alignment.sql
-- Step 1 of OTP Phase 2: Internal RBAC, 48-Hour Invitations, Portal 'CONSOLE' Alignment & Deterministic Founder Setup

-- 1. Extend signup_side enum with CONSOLE
ALTER TYPE public.signup_side ADD VALUE IF NOT EXISTS 'CONSOLE';

-- 2. Internal RBAC Schema Tables
CREATE TABLE IF NOT EXISTS public.internal_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.internal_permission_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.internal_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.internal_group_permissions (
  group_id uuid NOT NULL REFERENCES public.internal_permission_groups(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.internal_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.internal_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.internal_roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (profile_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.internal_user_group_memberships (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.internal_permission_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.internal_user_explicit_grants (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.internal_permissions(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (profile_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.internal_user_restrictions (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.internal_permissions(id) ON DELETE CASCADE,
  restricted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  restricted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (profile_id, permission_id)
);

-- 3. Internal Invitations Table with Strict 48-Hour Lifecycle
CREATE TABLE IF NOT EXISTS public.internal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.internal_roles(id) ON DELETE RESTRICT,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  invitation_token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT chk_internal_invitation_expiry CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '48 hours 1 second'
  ),
  CONSTRAINT chk_internal_invitation_status CHECK (
    status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')
  ),
  CONSTRAINT chk_internal_invitation_state_rules CHECK (
    CASE
      WHEN status = 'PENDING' THEN
        accepted_at IS NULL AND accepted_profile_id IS NULL AND revoked_at IS NULL
      WHEN status = 'ACCEPTED' THEN
        accepted_at IS NOT NULL AND accepted_profile_id IS NOT NULL AND revoked_at IS NULL
      WHEN status = 'REVOKED' THEN
        revoked_at IS NOT NULL AND revoked_by IS NOT NULL
      WHEN status = 'EXPIRED' THEN
        accepted_at IS NULL
      ELSE false
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_internal_invitations_token ON public.internal_invitations (invitation_token);
CREATE INDEX IF NOT EXISTS idx_internal_invitations_email ON public.internal_invitations (lower(email));
CREATE INDEX IF NOT EXISTS idx_internal_user_assignments_profile ON public.internal_user_assignments (profile_id);

-- 4. Enable RLS on all internal RBAC and invitation tables
ALTER TABLE public.internal_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_permission_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_user_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_user_explicit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_user_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_invitations ENABLE ROW LEVEL SECURITY;

-- 5. Authoritative Internal Operator Access Function
CREATE OR REPLACE FUNCTION private.profile_is_active_operator(p_status text, p_deleted_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING')
     AND p_deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION private.authoritative_internal_operator_access(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_is_founder boolean;
  v_is_admin boolean;
  v_status text;
  v_deleted_at timestamptz;
  v_has_internal_role boolean := false;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT is_founder, is_platform_admin, status, deleted_at
  INTO v_is_founder, v_is_admin, v_status, v_deleted_at
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 1. Active Operator Check: If suspended, revoked, blocked, or deleted, FAIL CLOSED immediately.
  -- No flag (founder or platform_admin) can bypass suspension/revocation.
  IF v_status IS NULL OR v_status IN ('SUSPENDED', 'REVOKED', 'BLOCKED', 'DELETED', 'PENDING') OR v_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF NOT private.profile_is_active_operator(v_status, v_deleted_at) THEN
    RETURN false;
  END IF;

  -- 2. Check internal role assignments
  SELECT EXISTS (
    SELECT 1 FROM public.internal_user_assignments
    WHERE profile_id = p_profile_id
  ) INTO v_has_internal_role;

  -- 3. Return true if active and (founder OR platform_admin OR internal assignment)
  RETURN (COALESCE(v_is_founder, false) OR COALESCE(v_is_admin, false) OR v_has_internal_role);
END;
$$;

GRANT EXECUTE ON FUNCTION private.authoritative_internal_operator_access(uuid) TO authenticated, service_role;

-- 6. RLS Policies for Internal RBAC and Invitations
DROP POLICY IF EXISTS internal_roles_select ON public.internal_roles;
CREATE POLICY internal_roles_select ON public.internal_roles
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_roles_admin_all ON public.internal_roles;
CREATE POLICY internal_roles_admin_all ON public.internal_roles
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_permission_groups_select ON public.internal_permission_groups;
CREATE POLICY internal_permission_groups_select ON public.internal_permission_groups
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_permission_groups_admin_all ON public.internal_permission_groups;
CREATE POLICY internal_permission_groups_admin_all ON public.internal_permission_groups
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_permissions_select ON public.internal_permissions;
CREATE POLICY internal_permissions_select ON public.internal_permissions
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_permissions_admin_all ON public.internal_permissions;
CREATE POLICY internal_permissions_admin_all ON public.internal_permissions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_group_permissions_select ON public.internal_group_permissions;
CREATE POLICY internal_group_permissions_select ON public.internal_group_permissions
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_group_permissions_admin_all ON public.internal_group_permissions;
CREATE POLICY internal_group_permissions_admin_all ON public.internal_group_permissions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_user_assignments_select ON public.internal_user_assignments;
CREATE POLICY internal_user_assignments_select ON public.internal_user_assignments
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()) OR profile_id = private.get_profile_id());

DROP POLICY IF EXISTS internal_user_assignments_admin_all ON public.internal_user_assignments;
CREATE POLICY internal_user_assignments_admin_all ON public.internal_user_assignments
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_user_group_memberships_select ON public.internal_user_group_memberships;
CREATE POLICY internal_user_group_memberships_select ON public.internal_user_group_memberships
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()) OR profile_id = private.get_profile_id());

DROP POLICY IF EXISTS internal_user_group_memberships_admin_all ON public.internal_user_group_memberships;
CREATE POLICY internal_user_group_memberships_admin_all ON public.internal_user_group_memberships
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_user_explicit_grants_select ON public.internal_user_explicit_grants;
CREATE POLICY internal_user_explicit_grants_select ON public.internal_user_explicit_grants
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()) OR profile_id = private.get_profile_id());

DROP POLICY IF EXISTS internal_user_explicit_grants_admin_all ON public.internal_user_explicit_grants;
CREATE POLICY internal_user_explicit_grants_admin_all ON public.internal_user_explicit_grants
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_user_restrictions_select ON public.internal_user_restrictions;
CREATE POLICY internal_user_restrictions_select ON public.internal_user_restrictions
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()) OR profile_id = private.get_profile_id());

DROP POLICY IF EXISTS internal_user_restrictions_admin_all ON public.internal_user_restrictions;
CREATE POLICY internal_user_restrictions_admin_all ON public.internal_user_restrictions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS internal_invitations_select ON public.internal_invitations;
CREATE POLICY internal_invitations_select ON public.internal_invitations
  FOR SELECT TO authenticated
  USING (private.authoritative_internal_operator_access(auth.uid()));

DROP POLICY IF EXISTS internal_invitations_admin_all ON public.internal_invitations;
CREATE POLICY internal_invitations_admin_all ON public.internal_invitations
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.internal_roles,
  public.internal_permission_groups,
  public.internal_permissions,
  public.internal_group_permissions,
  public.internal_user_assignments,
  public.internal_user_group_memberships,
  public.internal_user_explicit_grants,
  public.internal_user_restrictions,
  public.internal_invitations
TO authenticated, service_role;

REVOKE ALL ON TABLE
  public.internal_roles,
  public.internal_permission_groups,
  public.internal_permissions,
  public.internal_group_permissions,
  public.internal_user_assignments,
  public.internal_user_group_memberships,
  public.internal_user_explicit_grants,
  public.internal_user_restrictions,
  public.internal_invitations
FROM anon;

-- 7. Seed System Roles, Groups, and Permissions
INSERT INTO public.internal_roles (code, name, description, is_system)
VALUES
  ('SUPER_ADMIN', 'Super Administrator', 'Full system and operator governance', true),
  ('INTERNAL_OPERATOR', 'Internal Operations Staff', 'Platform support and operational tasks', true),
  ('FINANCE_OPERATOR', 'Finance Operator', 'Staff referrals and ledger reconciliations', true),
  ('CATALOG_MANAGER', 'Catalog Manager', 'Platform taxonomy and directory management', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.internal_permission_groups (code, name, description)
VALUES
  ('OPS_GOVERNANCE', 'Operations Governance', 'Operator accounts and role assignments'),
  ('FINANCE_LEDGER', 'Finance & Settlements', 'Staff referrals and payout authorization'),
  ('AUDIT_COMPLIANCE', 'Audit & Compliance', 'System audit logs and compliance monitoring')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.internal_permissions (code, name, description)
VALUES
  ('admin:read', 'Admin Read', 'Read internal administration consoles'),
  ('admin:write', 'Admin Write', 'Modify internal settings and operational data'),
  ('admin:users:manage', 'Manage Internal Users', 'Invite and manage internal operator accounts'),
  ('admin:referrals:authorize', 'Authorize Referral Bonus', 'Approve eligible staff referral achievements'),
  ('admin:referrals:payout', 'Process Referral Payout', 'Record bank settlement and UTR evidence'),
  ('admin:audit:read', 'Read Audit Logs', 'Inspect system and administrative audit logs')
ON CONFLICT (code) DO NOTHING;

-- Map default group permissions
INSERT INTO public.internal_group_permissions (group_id, permission_id)
SELECT g.id, p.id
FROM public.internal_permission_groups g
CROSS JOIN public.internal_permissions p
WHERE (g.code = 'OPS_GOVERNANCE' AND p.code IN ('admin:read', 'admin:write', 'admin:users:manage'))
   OR (g.code = 'FINANCE_LEDGER' AND p.code IN ('admin:read', 'admin:referrals:authorize', 'admin:referrals:payout'))
   OR (g.code = 'AUDIT_COMPLIANCE' AND p.code IN ('admin:read', 'admin:audit:read'))
ON CONFLICT DO NOTHING;

-- 8. Align private.profile_side() to recognize 'CONSOLE'
CREATE OR REPLACE FUNCTION private.profile_side(p_profile_id uuid DEFAULT NULL)
RETURNS signup_side
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := COALESCE(p_profile_id, private.get_profile_id());
  v_is_admin boolean;
  v_email text;
  v_auth_uid uuid;
  v_active_side signup_side;
  v_is_internal boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_platform_admin, email, auth_user_id, active_portal_side
  INTO v_is_admin, v_email, v_auth_uid, v_active_side
  FROM public.profiles WHERE id = v_profile;

  -- Platform Admin, active internal operator, or active_portal_side = 'CONSOLE' strictly resolves to CONSOLE
  IF v_is_admin IS TRUE
     OR v_active_side::text = 'CONSOLE'
     OR private.authoritative_internal_operator_access(v_profile) IS TRUE
     OR v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    RETURN 'CONSOLE';
  END IF;

  -- If customer persona explicitly switched portal persona, honor it
  IF v_active_side IS NOT NULL THEN
    RETURN v_active_side;
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

-- 9. Align public.my_role_context() to return 'CONSOLE' side
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
  v_status text := 'ACTIVE';
  v_blocked_at timestamptz := NULL;
  v_blocked_reason text := NULL;
  v_is_blocked boolean := false;
  v_auth_uid uuid;
  v_supplier_id uuid := NULL;
  v_is_internal boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false, 'isFounder', false, 'isPlatformAdmin', false);
  END IF;

  SELECT email, is_platform_admin, is_founder, active_role_code, active_organization_id, full_name, title, avatar_url, phone,
         COALESCE(status, 'ACTIVE'), blocked_at, blocked_reason, auth_user_id
  INTO v_email, v_admin, v_founder, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone,
       v_status, v_blocked_at, v_blocked_reason, v_auth_uid
  FROM public.profiles WHERE id = v_profile;

  IF v_status <> 'BLOCKED' AND v_status <> 'DELETED' AND v_status <> 'SUSPENDED' THEN
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

  -- Platform Admin & Internal Operators are strictly CONSOLE side
  IF v_admin IS TRUE OR v_is_internal IS TRUE THEN
    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', 'CONSOLE',
      'isPlatformAdmin', COALESCE(v_admin, false),
      'isFounder', COALESCE(v_founder, false),
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
      'title', COALESCE(v_title, CASE WHEN v_founder IS TRUE THEN 'Platform Founder / CEO' ELSE 'Platform Administrator' END),
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

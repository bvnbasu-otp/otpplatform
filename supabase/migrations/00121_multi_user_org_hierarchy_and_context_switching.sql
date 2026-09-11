-- Migration 00121: Multi-User Organization Hierarchy & Context Switching (RWA, Enterprise, Personal)

-- 1. Add active_organization_id to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_organization_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN active_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Enhanced my_role_context() returning full organizations array and honoring active_organization_id
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
  v_org record;
  v_organizations jsonb;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  v_side := private.profile_side(v_profile);
  v_admin := private.is_platform_admin();

  SELECT p.active_role_code, p.active_organization_id
  INTO v_active, v_active_org_id
  FROM profiles p WHERE p.id = v_profile;

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
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  -- Fallback to first organization if no active or invalid
  IF v_org.org_id IS NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', v_admin,
    'needsOnboarding', (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL AND NOT v_admin),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', ur.code, 'label', ur.label, 'description', ur.description,
        'permissions', to_jsonb(ur.permissions))
      FROM user_roles ur WHERE ur.code = v_active
    ),
    'roles', v_roles,
    'organizations', v_organizations,
    'orgRole', v_org.org_role,
    'organizationId', v_org.org_id,
    'organizationName', v_org.org_name,
    'buyerType', v_org.org_type,
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

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated;

-- 3. Switch active organization RPC
CREATE OR REPLACE FUNCTION public.switch_active_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_is_member boolean;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify membership
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = v_profile AND organization_id = p_organization_id
  ) INTO v_is_member;

  IF NOT v_is_member AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  UPDATE profiles
  SET active_organization_id = p_organization_id,
      updated_at = now()
  WHERE id = v_profile;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('profile.organization_switched', v_profile, 'profile', v_profile::text,
          jsonb_build_object('organization_id', p_organization_id));

  RETURN public.my_role_context();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_organization(uuid) TO authenticated;

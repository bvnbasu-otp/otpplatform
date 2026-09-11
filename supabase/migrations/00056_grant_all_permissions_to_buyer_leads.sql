-- Grant full end-to-end permissions (including VOTE) to Buyer Leads, Facility Managers, and Property Owners
UPDATE user_roles
SET permissions = ARRAY['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE', 'AWARD']::role_permission[]
WHERE code IN ('PROCUREMENT_LEAD', 'FACILITY_MANAGER', 'PROPERTY_OWNER');

-- Ensure Org Owners also have all permissions
CREATE OR REPLACE FUNCTION private.has_role_permission(p_permission role_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     uuid := private.get_profile_id();
  v_permissions role_permission[];
  v_is_owner    boolean;
BEGIN
  IF v_profile IS NULL THEN RETURN true; END IF;
  IF private.is_platform_admin() THEN RETURN true; END IF;

  -- Organization owners automatically have all permissions across their own organization
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = v_profile AND role = 'OWNER'
  ) INTO v_is_owner;

  IF v_is_owner THEN RETURN true; END IF;

  v_permissions := private.active_role_permissions();

  IF v_permissions IS NULL THEN RETURN true; END IF;

  RETURN p_permission = ANY (v_permissions);
END;
$$;

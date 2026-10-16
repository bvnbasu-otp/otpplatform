-- RWA Estate/Facility Manager is operational only (audit finding RBAC-1).
--
-- FACILITY_MANAGER is the sourcing-lead role code (00039/00056) that MSME
-- accounts also hold, so its catalogue grants stay unchanged. The documented
-- policy is narrower for committee-governed organizations: an Estate/Facility
-- Manager may raise requirements and run the sourcing process but holds no
-- approval or award authority. Role permissions are enforced by
-- private.enforce_role_permission on awards, quotes, committee_votes, etc.,
-- so the restriction is applied in private.has_role_permission:
--   * caller's effective role is FACILITY_MANAGER, and
--   * caller's active organization is committee-governed (COMMUNITY/RWA/SOCIETY), and
--   * caller is not an owner (owners keep their existing all-permission rule), and
--   * the requested permission is APPROVE or AWARD.
-- All other behaviour of the function is unchanged. RWA award quorum
-- (00252), weighted voting and COI rules are untouched.

BEGIN;

CREATE OR REPLACE FUNCTION private.has_role_permission(p_permission role_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
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

  IF p_permission IN ('APPROVE'::role_permission, 'AWARD'::role_permission)
     AND EXISTS (
       SELECT 1
       FROM profiles p
       JOIN organizations o ON o.id = p.active_organization_id
       WHERE p.id = v_profile
         AND o.org_type::text IN ('COMMUNITY', 'RWA', 'SOCIETY')
         AND COALESCE(
               p.active_role_code,
               (SELECT pr.role_code FROM profile_roles pr
                WHERE pr.profile_id = p.id
                LIMIT 1)
             ) = 'FACILITY_MANAGER'
     ) THEN
    RETURN false;
  END IF;

  v_permissions := private.active_role_permissions();

  IF v_permissions IS NULL THEN RETURN true; END IF;

  RETURN p_permission = ANY (v_permissions);
END;
$$;

COMMIT;

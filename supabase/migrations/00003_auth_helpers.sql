-- Auth helper functions (SECURITY DEFINER in private schema)

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile & platform
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Organization membership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = p_org_id
      AND om.profile_id = private.get_profile_id()
  )
  OR private.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION private.get_org_role(p_org_id uuid)
RETURNS org_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role
  FROM organization_members om
  WHERE om.organization_id = p_org_id
    AND om.profile_id = private.get_profile_id()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_org_manager_or_above(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.get_org_role(p_org_id) IN ('OWNER', 'MANAGER')
    OR private.is_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- Supplier access
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_supplier_user_for(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM supplier_users su
    WHERE su.supplier_id = p_supplier_id
      AND su.profile_id = private.get_profile_id()
  )
  OR private.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION private.get_supplier_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.supplier_id
  FROM supplier_users su
  WHERE su.profile_id = private.get_profile_id();
$$;

-- ---------------------------------------------------------------------------
-- RFQ context
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.rfq_org_id(p_rfq_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM rfqs WHERE id = p_rfq_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.rfq_reveal_status(p_rfq_id uuid)
RETURNS rfq_reveal_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reveal_status FROM rfqs WHERE id = p_rfq_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.can_access_rfq_as_buyer(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_org_member(private.rfq_org_id(p_rfq_id));
$$;

CREATE OR REPLACE FUNCTION private.can_access_rfq_as_committee(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM committee_assignments ca
    WHERE ca.rfq_id = p_rfq_id
      AND ca.profile_id = private.get_profile_id()
  )
  AND private.is_org_member(private.rfq_org_id(p_rfq_id));
$$;

CREATE OR REPLACE FUNCTION private.has_rfq_invitation(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rfq_invitations ri
    WHERE ri.rfq_id = p_rfq_id
      AND ri.supplier_id IN (SELECT private.get_supplier_ids_for_user())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_vote_locked(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rfqs r
    WHERE r.id = p_rfq_id
      AND r.status = 'AWARDED'
  );
$$;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION private.get_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_org_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_org_manager_or_above(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_supplier_user_for(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_supplier_ids_for_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.rfq_org_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.rfq_reveal_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_rfq_as_buyer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_rfq_as_committee(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_rfq_invitation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_vote_locked(uuid) TO authenticated, service_role;

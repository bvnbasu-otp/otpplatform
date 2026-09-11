CREATE OR REPLACE FUNCTION private.can_access_rfq_as_committee(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = private.rfq_org_id(p_rfq_id)
        AND om.profile_id = private.get_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM committee_assignments ca
      WHERE ca.rfq_id = p_rfq_id
        AND ca.profile_id = private.get_profile_id()
    )
  )
  OR private.demo_staging_for(private.rfq_org_id(p_rfq_id));
$$;

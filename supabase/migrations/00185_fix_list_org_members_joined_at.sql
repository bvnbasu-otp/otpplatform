-- Migration 00185: Fix list_org_members joined_at column reference
-- organization_members has joined_at timestamptz column (not created_at).

CREATE OR REPLACE FUNCTION public.list_org_members(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_is_member boolean;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be a member of the org or a platform admin
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = v_caller AND organization_id = p_organization_id
  ) INTO v_is_member;

  IF NOT v_is_member AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'role', om.role::text,
    'joined_at', om.joined_at,
    'is_self', (p.id = v_caller)
  ) ORDER BY om.joined_at ASC), '[]'::jsonb)
  INTO v_results
  FROM organization_members om
  JOIN profiles p ON p.id = om.profile_id
  WHERE om.organization_id = p_organization_id;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_members(uuid) TO authenticated;
COMMENT ON FUNCTION public.list_org_members(uuid) IS
  'Returns all members of the given organization. Caller must be a member or platform admin.';

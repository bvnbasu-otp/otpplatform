-- Migration 00127: Org Member Management RPCs
-- Provides list_org_members, invite_org_member, and remove_org_member for the
-- Organization Members UI. All calls are security-definer and verify membership.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. list_org_members — returns all members of a given organization
-- ────────────────────────────────────────────────────────────────────────────
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
    'joined_at', om.created_at,
    'is_self', (p.id = v_caller)
  ) ORDER BY om.created_at ASC), '[]'::jsonb)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. invite_org_member — add an existing registered user to an organization
--    Caller must be OWNER or MANAGER of the target org.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_org_member(
  p_organization_id uuid,
  p_email          text,
  p_role           text DEFAULT 'COMMITTEE_MEMBER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid := private.get_profile_id();
  v_caller_role text;
  v_target_id   uuid;
  v_org_name    text;
  v_already     boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is OWNER or MANAGER
  SELECT om.role::text INTO v_caller_role
  FROM organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role IS NULL AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can invite members';
  END IF;

  -- Validate role value
  IF p_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'COMMITTEE_MEMBER', 'VIEWER') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be one of OWNER, MANAGER, BUYER, COMMITTEE_MEMBER, VIEWER', p_role;
  END IF;

  -- Prevent assigning OWNER role via this RPC
  IF p_role = 'OWNER' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Ownership cannot be assigned via invitation. Contact a SuperAdmin.';
  END IF;

  -- Look up target profile by email
  SELECT id INTO v_target_id FROM profiles WHERE lower(email) = lower(trim(p_email));

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format(
        'No registered account found for %s. Ask them to sign up on OTP first, then invite them.',
        p_email
      )
    );
  END IF;

  -- Check already a member
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = v_target_id AND organization_id = p_organization_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('%s is already a member of this organization.', p_email)
    );
  END IF;

  -- Get org name for audit
  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;

  -- Insert membership
  INSERT INTO organization_members (organization_id, profile_id, role)
  VALUES (p_organization_id, v_target_id, p_role::buyer_role);

  -- Audit log
  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'org.member_invited',
    v_caller,
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'invited_profile_id', v_target_id,
      'invited_email', lower(trim(p_email)),
      'role', p_role,
      'organization_name', v_org_name
    )
  );

  -- In-app notification for the new member
  INSERT INTO notifications (profile_id, type, title, body, metadata)
  VALUES (
    v_target_id,
    'ORG_MEMBER_ADDED',
    format('You have been added to %s', v_org_name),
    format('You now have %s access to %s on OTP.', p_role, v_org_name),
    jsonb_build_object('organization_id', p_organization_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'message', format('%s has been added to %s as %s.', p_email, v_org_name, p_role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_org_member(uuid, text, text) TO authenticated;
COMMENT ON FUNCTION public.invite_org_member(uuid, text, text) IS
  'Adds a registered user (by email) to an organization with the given role. Caller must be OWNER or MANAGER.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. remove_org_member — remove a member from an organization
--    Cannot remove OWNER or self.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_org_member(
  p_organization_id uuid,
  p_profile_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := private.get_profile_id();
  v_caller_role  text;
  v_target_role  text;
  v_org_name     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be OWNER or MANAGER
  SELECT om.role::text INTO v_caller_role
  FROM organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can remove members';
  END IF;

  -- Cannot remove self
  IF p_profile_id = v_caller THEN
    RAISE EXCEPTION 'You cannot remove yourself from the organization';
  END IF;

  -- Get target role
  SELECT om.role::text INTO v_target_role
  FROM organization_members om
  WHERE om.profile_id = p_profile_id AND om.organization_id = p_organization_id;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found in this organization');
  END IF;

  -- Cannot remove the OWNER (must transfer ownership via SuperAdmin)
  IF v_target_role = 'OWNER' THEN
    RAISE EXCEPTION 'The Organization Owner cannot be removed. Transfer ownership via the SuperAdmin console.';
  END IF;

  -- Perform removal
  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;

  DELETE FROM organization_members
  WHERE profile_id = p_profile_id AND organization_id = p_organization_id;

  -- Audit
  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'org.member_removed',
    v_caller,
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'removed_profile_id', p_profile_id,
      'removed_role', v_target_role,
      'organization_name', v_org_name
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_org_member(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.remove_org_member(uuid, uuid) IS
  'Removes a member from an organization. Cannot remove the owner or yourself.';

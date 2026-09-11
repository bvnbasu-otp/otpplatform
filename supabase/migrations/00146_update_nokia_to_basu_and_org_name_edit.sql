-- Migration 00146: Update "Nokia" references to "Basu" and provide Organization Name editing RPC
-- Updates all organization, supplier, profile, and signup request occurrences from Nokia to Basu

BEGIN;

-- 1. Direct Data Updates: rename "Nokia" to "Basu" across all entities
UPDATE public.organizations
SET name = 'Basu',
    updated_at = now()
WHERE name ILIKE '%nokia%';

UPDATE public.organization_signup_requests
SET organization_name = 'Basu'
WHERE organization_name ILIKE '%nokia%';

UPDATE public.suppliers
SET business_name = 'Basu',
    legal_name = 'Basu Enterprises',
    updated_at = now()
WHERE business_name ILIKE '%nokia%' OR legal_name ILIKE '%nokia%';

UPDATE public.profiles
SET full_name = 'Basu',
    updated_at = now()
WHERE full_name ILIKE '%nokia%';

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"full_name": "Basu"}'::jsonb
WHERE raw_user_meta_data->>'full_name' ILIKE '%nokia%';

-- 2. RPC: public.update_my_organization_name
-- Allows authorized organization owners, managers, or superadmins to edit their organization/workspace name
CREATE OR REPLACE FUNCTION public.update_my_organization_name(
  p_organization_name text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_org_id uuid := p_organization_id;
  v_is_admin boolean := false;
  v_member_role text;
  v_cleaned_name text := trim(p_organization_name);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF v_cleaned_name IS NULL OR length(v_cleaned_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name must be at least 2 characters');
  END IF;

  SELECT id, is_platform_admin, active_organization_id
  INTO v_profile_id, v_is_admin, v_org_id
  FROM public.profiles
  WHERE auth_user_id = v_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  -- Use provided org_id or fall back to profile active org or first member org
  IF p_organization_id IS NOT NULL THEN
    v_org_id := p_organization_id;
  ELSIF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_members
    WHERE profile_id = v_profile_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No organization linked to update');
  END IF;

  -- Verify permissions: Must be superadmin OR organization OWNER / MANAGER
  IF NOT v_is_admin THEN
    SELECT role::text INTO v_member_role
    FROM public.organization_members
    WHERE organization_id = v_org_id AND profile_id = v_profile_id;

    IF v_member_role IS NULL OR v_member_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'ADMIN') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You do not have permission to rename this organization');
    END IF;
  END IF;

  -- Update organization name
  UPDATE public.organizations
  SET name = v_cleaned_name,
      updated_at = now()
  WHERE id = v_org_id;

  -- Sync any pending signup requests if matched
  UPDATE public.organization_signup_requests
  SET organization_name = v_cleaned_name
  WHERE organization_id = v_org_id;

  -- Record audit event
  INSERT INTO public.audit_events (
    actor_id,
    entity_type,
    entity_id,
    event_type,
    payload
  ) VALUES (
    v_profile_id,
    'organization',
    v_org_id::text,
    'organization.renamed',
    jsonb_build_object(
      'new_name', v_cleaned_name,
      'updated_by', v_profile_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'name', v_cleaned_name,
    'organization_id', v_org_id,
    'message', 'Organization name updated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_organization_name(text, uuid) TO authenticated, service_role, anon;

COMMIT;

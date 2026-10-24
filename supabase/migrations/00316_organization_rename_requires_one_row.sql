-- 00316: organization rename succeeds only when exactly one row is updated.
--
-- Correctness fix for public.update_my_organization_name(text, uuid), created
-- by supabase/migrations/00146_update_nokia_to_basu_and_org_name_edit.sql.
-- That function authorizes the caller, then updates public.organizations and
-- returns ok=true with the requested name even when the update matches zero
-- rows. It also inserts an organization.renamed audit row on that path.
-- This replacement returns ok=true only after authorization succeeds and the
-- organization update changes exactly one row. Zero rows return ok=false
-- before any signup or audit write. Any other row count raises
-- cardinality_violation, which aborts the statement's update. Database
-- errors are left uncaught so the caller sees them.
--
-- Identity stays auth.uid(). No caller-supplied user, profile, or role
-- argument is accepted. The platform-admin and membership checks are the
-- same roles as 00146: a platform admin, or an organization member whose
-- role is OWNER, MANAGER, BUYER, or ADMIN.
--
-- Privilege posture is unchanged. CREATE OR REPLACE keeps the existing
-- EXECUTE grants. This file does not GRANT and does not REVOKE. 00146 grants
-- EXECUTE to authenticated, service_role, and anon, and a new function also
-- receives EXECUTE from PUBLIC unless revoked. Migration
-- 00315_revoke_anon_update_my_organization_name.sql revokes PUBLIC and anon
-- before this file runs. This replace does not restore either grant.
--
-- No explicit BEGIN/COMMIT: the migration runner and the Supabase CLI apply
-- this file and its ledger row in one transaction, and an inner COMMIT would
-- end that transaction before the ledger row is written.

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
  v_profile_rows integer := 0;
  v_member_rows integer := 0;
  v_updated integer := 0;
  v_confirmed_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF v_cleaned_name IS NULL OR length(v_cleaned_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name must be at least 2 characters');
  END IF;

  SELECT count(*)::integer INTO v_profile_rows
  FROM public.profiles
  WHERE auth_user_id = v_uid;

  IF v_profile_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  IF v_profile_rows IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Organization rename matched % profiles for the authenticated user', v_profile_rows
      USING ERRCODE = 'cardinality_violation';
  END IF;

  SELECT id, COALESCE(is_platform_admin, false), active_organization_id
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

  -- Verify permissions: platform admin, or membership role OWNER, MANAGER, BUYER, or ADMIN.
  IF NOT v_is_admin THEN
    SELECT count(*)::integer INTO v_member_rows
    FROM public.organization_members
    WHERE organization_id = v_org_id AND profile_id = v_profile_id;

    IF v_member_rows > 1 THEN
      RAISE EXCEPTION 'Organization rename matched % membership rows', v_member_rows
        USING ERRCODE = 'cardinality_violation';
    END IF;

    SELECT role::text INTO v_member_role
    FROM public.organization_members
    WHERE organization_id = v_org_id AND profile_id = v_profile_id;

    IF v_member_role IS NULL OR v_member_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'ADMIN') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You do not have permission to rename this organization');
    END IF;
  END IF;

  -- Update organization name only after the caller is authorized.
  UPDATE public.organizations
  SET name = v_cleaned_name,
      updated_at = now()
  WHERE id = v_org_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Organization was not found, so the name was not changed'
    );
  END IF;

  IF v_updated IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Organization rename matched % rows', v_updated
      USING ERRCODE = 'cardinality_violation';
  END IF;

  SELECT name INTO v_confirmed_name
  FROM public.organizations
  WHERE id = v_org_id;

  IF v_confirmed_name IS NULL OR length(trim(v_confirmed_name)) < 2 THEN
    RAISE EXCEPTION 'Organization rename did not leave exactly one stored name'
      USING ERRCODE = 'cardinality_violation';
  END IF;

  v_confirmed_name := trim(v_confirmed_name);

  -- Sync any pending signup requests if matched
  UPDATE public.signup_requests
  SET business_name = v_confirmed_name
  WHERE organization_id = v_org_id;

  -- Record audit event only after one organization row was updated.
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
      'new_name', v_confirmed_name,
      'updated_by', v_profile_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'name', v_confirmed_name,
    'rows_updated', v_updated,
    'organization_id', v_org_id,
    'message', 'Organization name updated successfully'
  );
END;
$$;

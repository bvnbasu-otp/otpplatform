-- 00264_remediate_privileged_lifecycle_and_audit_contracts.sql
--
-- Remediation Migration for Privileged Account, Organization Lifecycle & Audit Schema Contracts
--
-- Packages Implemented:
-- 1. Privileged Account & Org Lifecycle (admin_bulk_block_users, admin_bulk_unblock_users,
--    admin_bulk_block_organizations, admin_bulk_unblock_organizations, admin_bulk_delete_organizations)
--    - Fixes audit_events insert: uses canonical columns (event_type, actor_id, entity_type, entity_id, payload)
--    - Enforces true session lockout: updates auth.users.banned_until, purges auth.sessions, revokes auth.refresh_tokens
--    - Hardens defense-in-depth RLS: private.get_profile_id(), private.is_org_member(), private.is_supplier_user_for()
-- 2. Primary Administration Query RPC (admin_get_users_and_organizations)
--    - Safe enum comparison: casts s.status::text = 'BLOCKED' (prevents invalid enum input crashes)
--    - Robust supplier contact_person resolution: COALESCE(s.legal_name, s.business_name)
-- 3. PostgREST Function Overloading Resolution (PGRST203)
--    - Drops ambiguous parameterless overloads for admin_get_system_health() and admin_get_seller_orders(...)
-- 4. Financial Settlement Audit Trail Alignment
--    - Batch-aligns 14 financial settlement and reconciliation RPCs to use event_type instead of action in audit_events

BEGIN;

-- ============================================================================
-- PACKAGE 1: PRIVILEGED ACCOUNT & ORGANIZATION BULK LIFECYCLE MANAGEMENT
-- ============================================================================

-- 1.1 admin_bulk_block_users
CREATE OR REPLACE FUNCTION public.admin_bulk_block_users(
  p_user_ids uuid[],
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_trimmed_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Administrative block / policy enforcement');
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  -- Filter out protected platform admins
  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND COALESCE(p.is_platform_admin, false) = false
    AND lower(p.email) NOT IN (
      'bvnbasu@gmail.com',
      'admin@otp.test',
      'ops@otp.test',
      'superadmin@otp.test',
      'admin@otp.ai',
      'ops@otp.ai',
      'admin@procureos.test'
    );

  IF v_target_profile_ids IS NULL OR array_length(v_target_profile_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'count', 0,
      'message', 'No non-admin user accounts matched for deactivation.'
    );
  END IF;

  -- 1. Invalidate authentication sessions & ban in Supabase auth
  UPDATE auth.users
  SET banned_until = '2099-12-31 23:59:59+00'
  WHERE id = ANY(v_target_auth_ids);

  DELETE FROM auth.sessions
  WHERE user_id = ANY(v_target_auth_ids);

  UPDATE auth.refresh_tokens
  SET revoked = true
  WHERE user_id IN (SELECT id::text FROM unnest(v_target_auth_ids) AS id);

  -- 2. Update profile status in public schema
  UPDATE public.profiles
  SET status = 'BLOCKED',
      blocked_at = now(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = now()
  WHERE id = ANY(v_target_profile_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 3. Also suspend linked suppliers
  UPDATE public.suppliers
  SET status = 'SUSPENDED',
      blocked_at = now(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = now()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(v_target_profile_ids)
  );

  -- 4. Insert canonical audit trail event
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_block_users',
    v_admin_id,
    'profile',
    v_target_profile_ids[1]::text,
    jsonb_build_object(
      'targetProfileIds', v_target_profile_ids,
      'targetAuthIds', v_target_auth_ids,
      'affectedCount', v_count,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully blocked %s user account(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_block_users(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_block_users(uuid[], text) TO authenticated, service_role;


-- 1.2 admin_bulk_unblock_users
CREATE OR REPLACE FUNCTION public.admin_bulk_unblock_users(
  p_user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids);

  IF v_target_profile_ids IS NULL OR array_length(v_target_profile_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'count', 0, 'message', 'No matching user accounts found to unblock.');
  END IF;

  -- 1. Clear ban in auth schema
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = ANY(v_target_auth_ids);

  -- 2. Restore profile status
  UPDATE public.profiles
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      updated_at = now()
  WHERE id = ANY(v_target_profile_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 3. Also restore linked suppliers
  UPDATE public.suppliers
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      updated_at = now()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(v_target_profile_ids)
  );

  -- 4. Insert canonical audit trail event
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_unblock_users',
    v_admin_id,
    'profile',
    v_target_profile_ids[1]::text,
    jsonb_build_object(
      'targetProfileIds', v_target_profile_ids,
      'targetAuthIds', v_target_auth_ids,
      'affectedCount', v_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully unblocked and reactivated %s user account(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_unblock_users(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_unblock_users(uuid[]) TO authenticated, service_role;


-- 1.3 admin_bulk_block_organizations
CREATE OR REPLACE FUNCTION public.admin_bulk_block_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_trimmed_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Administrative block / policy enforcement');
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_org_ids IS NULL OR array_length(p_org_ids, 1) IS NULL OR array_length(p_org_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No organization IDs specified');
  END IF;

  IF p_is_supplier IS TRUE THEN
    UPDATE public.suppliers
    SET status = 'SUSPENDED',
        blocked_at = now(),
        blocked_reason = v_trimmed_reason,
        blocked_by = v_admin_id,
        updated_at = now()
    WHERE id = ANY(p_org_ids);

    -- Cascade to auth sessions and profiles of linked supplier users
    SELECT array_agg(COALESCE(p.auth_user_id, p.id))
    INTO v_target_auth_ids
    FROM public.profiles p
    WHERE p.id IN (
      SELECT profile_id FROM public.supplier_users WHERE supplier_id = ANY(p_org_ids)
    )
    AND COALESCE(p.is_platform_admin, false) = false
    AND lower(p.email) NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');

    IF v_target_auth_ids IS NOT NULL AND array_length(v_target_auth_ids, 1) > 0 THEN
      UPDATE auth.users SET banned_until = '2099-12-31 23:59:59+00' WHERE id = ANY(v_target_auth_ids);
      DELETE FROM auth.sessions WHERE user_id = ANY(v_target_auth_ids);
      UPDATE auth.refresh_tokens SET revoked = true WHERE user_id IN (SELECT id::text FROM unnest(v_target_auth_ids) AS id);
    END IF;

    UPDATE public.profiles
    SET status = 'BLOCKED',
        blocked_at = now(),
        blocked_reason = v_trimmed_reason,
        blocked_by = v_admin_id,
        updated_at = now()
    WHERE id IN (
      SELECT profile_id FROM public.supplier_users WHERE supplier_id = ANY(p_org_ids)
    )
    AND COALESCE(is_platform_admin, false) = false
    AND lower(email) NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');
  ELSE
    UPDATE public.organizations
    SET status = 'BLOCKED',
        blocked_at = now(),
        blocked_reason = v_trimmed_reason,
        blocked_by = v_admin_id,
        updated_at = now()
    WHERE id = ANY(p_org_ids);

    SELECT array_agg(COALESCE(p.auth_user_id, p.id))
    INTO v_target_auth_ids
    FROM public.profiles p
    WHERE p.id IN (
      SELECT profile_id FROM public.organization_members WHERE organization_id = ANY(p_org_ids)
    )
    AND COALESCE(p.is_platform_admin, false) = false
    AND lower(p.email) NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');

    IF v_target_auth_ids IS NOT NULL AND array_length(v_target_auth_ids, 1) > 0 THEN
      UPDATE auth.users SET banned_until = '2099-12-31 23:59:59+00' WHERE id = ANY(v_target_auth_ids);
      DELETE FROM auth.sessions WHERE user_id = ANY(v_target_auth_ids);
      UPDATE auth.refresh_tokens SET revoked = true WHERE user_id IN (SELECT id::text FROM unnest(v_target_auth_ids) AS id);
    END IF;

    UPDATE public.profiles
    SET status = 'BLOCKED',
        blocked_at = now(),
        blocked_reason = v_trimmed_reason,
        blocked_by = v_admin_id,
        updated_at = now()
    WHERE id IN (
      SELECT profile_id FROM public.organization_members WHERE organization_id = ANY(p_org_ids)
    )
    AND COALESCE(is_platform_admin, false) = false
    AND lower(email) NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_block_organizations',
    v_admin_id,
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1]::text,
    jsonb_build_object(
      'targetOrgIds', p_org_ids,
      'isSupplier', p_is_supplier,
      'affectedCount', v_count,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully blocked %s organization(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_block_organizations(uuid[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_block_organizations(uuid[], boolean, text) TO authenticated, service_role;


-- 1.4 admin_bulk_unblock_organizations
CREATE OR REPLACE FUNCTION public.admin_bulk_unblock_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_org_ids IS NULL OR array_length(p_org_ids, 1) IS NULL OR array_length(p_org_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No organization IDs specified');
  END IF;

  IF p_is_supplier IS TRUE THEN
    UPDATE public.suppliers
    SET status = 'ACTIVE',
        blocked_at = NULL,
        blocked_reason = NULL,
        blocked_by = NULL,
        updated_at = now()
    WHERE id = ANY(p_org_ids);

    SELECT array_agg(COALESCE(p.auth_user_id, p.id))
    INTO v_target_auth_ids
    FROM public.profiles p
    WHERE p.id IN (
      SELECT profile_id FROM public.supplier_users WHERE supplier_id = ANY(p_org_ids)
    );

    IF v_target_auth_ids IS NOT NULL AND array_length(v_target_auth_ids, 1) > 0 THEN
      UPDATE auth.users SET banned_until = NULL WHERE id = ANY(v_target_auth_ids);
    END IF;

    UPDATE public.profiles
    SET status = 'ACTIVE',
        blocked_at = NULL,
        blocked_reason = NULL,
        blocked_by = NULL,
        updated_at = now()
    WHERE id IN (
      SELECT profile_id FROM public.supplier_users WHERE supplier_id = ANY(p_org_ids)
    );
  ELSE
    UPDATE public.organizations
    SET status = 'ACTIVE',
        blocked_at = NULL,
        blocked_reason = NULL,
        blocked_by = NULL,
        updated_at = now()
    WHERE id = ANY(p_org_ids);

    SELECT array_agg(COALESCE(p.auth_user_id, p.id))
    INTO v_target_auth_ids
    FROM public.profiles p
    WHERE p.id IN (
      SELECT profile_id FROM public.organization_members WHERE organization_id = ANY(p_org_ids)
    );

    IF v_target_auth_ids IS NOT NULL AND array_length(v_target_auth_ids, 1) > 0 THEN
      UPDATE auth.users SET banned_until = NULL WHERE id = ANY(v_target_auth_ids);
    END IF;

    UPDATE public.profiles
    SET status = 'ACTIVE',
        blocked_at = NULL,
        blocked_reason = NULL,
        blocked_by = NULL,
        updated_at = now()
    WHERE id IN (
      SELECT profile_id FROM public.organization_members WHERE organization_id = ANY(p_org_ids)
    );
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_unblock_organizations',
    v_admin_id,
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1]::text,
    jsonb_build_object(
      'targetOrgIds', p_org_ids,
      'isSupplier', p_is_supplier,
      'affectedCount', v_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully unblocked and reactivated %s organization(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_unblock_organizations(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_unblock_organizations(uuid[], boolean) TO authenticated, service_role;


-- 1.5 admin_bulk_delete_organizations (Refuse hard delete; apply audit DEACTIVATED mode)
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean,
  p_soft_delete boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_org_ids IS NULL OR array_length(p_org_ids, 1) IS NULL OR array_length(p_org_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No organization IDs specified');
  END IF;

  IF p_is_supplier IS TRUE THEN
    UPDATE public.suppliers
    SET status = 'SUSPENDED',
        deleted_at = COALESCE(deleted_at, now()),
        updated_at = now()
    WHERE id = ANY(p_org_ids);
  ELSE
    UPDATE public.organizations
    SET status = 'DELETED',
        deleted_at = COALESCE(deleted_at, now()),
        updated_at = now()
    WHERE id = ANY(p_org_ids);
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_delete_organizations',
    v_admin_id,
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1]::text,
    jsonb_build_object(
      'targetOrgIds', p_org_ids,
      'isSupplier', p_is_supplier,
      'affectedCount', v_count,
      'requestedSoftDelete', p_soft_delete,
      'appliedMode', 'DEACTIVATED'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'mode', 'DEACTIVATED',
    'hardDeleteRefused', (p_soft_delete IS FALSE),
    'message', format('Deactivated %s organization(s). Records are retained for audit.', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_delete_organizations(uuid[], boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_organizations(uuid[], boolean, boolean) TO authenticated, service_role;


-- 1.6 Hardened private RLS helpers (Fail-closed on BLOCKED accounts)
CREATE OR REPLACE FUNCTION private.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() AND COALESCE(status, 'ACTIVE') <> 'BLOCKED' LIMIT 1),
    (SELECT id FROM public.profiles WHERE id = auth.uid() AND COALESCE(status, 'ACTIVE') <> 'BLOCKED' LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = p_org_id
      AND om.profile_id = private.get_profile_id()
      AND COALESCE(o.status, 'ACTIVE') <> 'BLOCKED'
  )
  OR private.is_platform_admin()
  OR private.demo_staging_for(p_org_id);
$$;

CREATE OR REPLACE FUNCTION private.is_supplier_user_for(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_users su
    JOIN public.suppliers s ON s.id = su.supplier_id
    WHERE su.supplier_id = p_supplier_id
      AND su.profile_id = private.get_profile_id()
      AND COALESCE(s.status::text, 'ACTIVE') NOT IN ('SUSPENDED', 'BLOCKED')
  )
  OR private.is_platform_admin();
$$;


-- ============================================================================
-- PACKAGE 2: REPAIR PRIMARY ADMINISTRATION QUERY RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_users_and_organizations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_users jsonb;
  v_orgs jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  -- 1. Fetch Users with last_seen_at & real-time presence
  SELECT COALESCE(jsonb_agg(row_to_json(u)), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT
      p.id,
      p.email,
      COALESCE(p.full_name, split_part(p.email, '@', 1)) AS full_name,
      p.phone,
      p.title,
      COALESCE(p.is_platform_admin, false) AS is_platform_admin,
      CASE
        WHEN p.status = 'BLOCKED' OR p.status = 'SUSPENDED' OR p.blocked_at IS NOT NULL THEN 'BLOCKED'
        WHEN s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL THEN 'BLOCKED'
        WHEN p.status = 'DELETED' THEN 'DELETED'
        WHEN p.status = 'PENDING' OR s.status = 'PENDING' THEN 'PENDING'
        ELSE 'ACTIVE'
      END AS status,
      COALESCE(p.blocked_at, s.blocked_at) AS blocked_at,
      COALESCE(p.blocked_reason, s.blocked_reason) AS blocked_reason,
      p.created_at,
      p.updated_at,
      COALESCE(p.last_seen_at, p.updated_at, p.created_at) AS last_seen_at,
      CASE
        WHEN p.is_platform_admin THEN 'ADMIN'
        WHEN su.supplier_id IS NOT NULL THEN 'SUPPLIER'
        ELSE 'BUYER'
      END AS side,
      CASE
        WHEN p.is_platform_admin THEN 'SUPER_ADMIN'
        WHEN su.supplier_id IS NOT NULL THEN su.role::text
        ELSE COALESCE(om.role::text, 'BUYER')
      END AS role,
      om.organization_id,
      COALESCE(o.name, 'Personal Workspace') AS organization_name,
      COALESCE(o.org_type::text, 'INDIVIDUAL') AS org_type,
      su.supplier_id,
      s.business_name AS supplier_name,
      COALESCE(s.gst_verified, o.gst_verified, false) AS gst_verified
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT organization_id, role
      FROM public.organization_members
      WHERE profile_id = p.id
      ORDER BY (role = 'OWNER') DESC, joined_at ASC
      LIMIT 1
    ) om ON true
    LEFT JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN LATERAL (
      SELECT supplier_id, role
      FROM public.supplier_users
      WHERE profile_id = p.id
      LIMIT 1
    ) su ON true
    LEFT JOIN public.suppliers s ON s.id = su.supplier_id
    WHERE COALESCE(p.status, 'ACTIVE') <> 'DELETED'
    ORDER BY p.created_at DESC
  ) u;

  -- 2. Fetch Organizations & Suppliers with max last_seen_at
  SELECT COALESCE(jsonb_agg(row_to_json(org)), '[]'::jsonb)
  INTO v_orgs
  FROM (
    -- Buyer Organizations
    SELECT
      o.id,
      o.name,
      'BUYER_ORG' AS entity_type,
      o.org_type::text AS org_type,
      CASE
        WHEN o.status = 'BLOCKED' OR o.status = 'SUSPENDED' OR o.blocked_at IS NOT NULL THEN 'BLOCKED'
        WHEN o.status = 'DELETED' THEN 'DELETED'
        WHEN o.status = 'PENDING' THEN 'PENDING'
        ELSE 'ACTIVE'
      END AS status,
      o.blocked_at,
      o.blocked_reason,
      o.contact_email,
      o.contact_phone,
      o.contact_person,
      COALESCE(o.gst_verified, false) AS gst_verified,
      o.tax_registration AS gstin,
      o.created_at,
      (
        SELECT max(p2.last_seen_at)
        FROM public.profiles p2
        JOIN public.organization_members om2 ON om2.profile_id = p2.id
        WHERE om2.organization_id = o.id
      ) AS last_seen_at,
      (SELECT count(*)::int FROM public.organization_members WHERE organization_id = o.id) AS member_count,
      (SELECT count(*)::int FROM public.requirements WHERE organization_id = o.id AND status <> 'CANCELLED') AS active_orders_count
    FROM public.organizations o
    WHERE COALESCE(o.status, 'ACTIVE') <> 'DELETED'

    UNION ALL

    -- Suppliers (with safe s.status::text check and legal_name fallback)
    SELECT
      s.id,
      s.business_name AS name,
      'SUPPLIER' AS entity_type,
      'SUPPLIER_ENTERPRISE' AS org_type,
      CASE
        WHEN s.status = 'SUSPENDED' OR s.status::text = 'BLOCKED' OR s.blocked_at IS NOT NULL THEN 'BLOCKED'
        WHEN s.status = 'PENDING' THEN 'PENDING'
        ELSE 'ACTIVE'
      END AS status,
      s.blocked_at,
      s.blocked_reason,
      s.contact_email,
      s.contact_phone,
      COALESCE(s.legal_name, s.business_name) AS contact_person,
      COALESCE(s.gst_verified, false) AS gst_verified,
      s.gstin,
      s.created_at,
      (
        SELECT max(p2.last_seen_at)
        FROM public.profiles p2
        JOIN public.supplier_users su2 ON su2.profile_id = p2.id
        WHERE su2.supplier_id = s.id
      ) AS last_seen_at,
      (SELECT count(*)::int FROM public.supplier_users WHERE supplier_id = s.id) AS member_count,
      (SELECT count(*)::int FROM public.purchase_orders WHERE supplier_id = s.id AND status <> 'CANCELLED') AS active_orders_count
    FROM public.suppliers s
    WHERE COALESCE(s.status::text, 'ACTIVE') <> 'DELETED'
    ORDER BY created_at DESC
  ) org;

  RETURN jsonb_build_object(
    'ok', true,
    'usersCount', jsonb_array_length(v_users),
    'users', v_users,
    'organizationsCount', jsonb_array_length(v_orgs),
    'organizations', v_orgs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_users_and_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users_and_organizations() TO authenticated, service_role;


-- ============================================================================
-- PACKAGE 3: POSTGREST FUNCTION OVERLOADING & PGRST203 CONFLICT RESOLUTION
-- ============================================================================

-- Drop ambiguous overloads that collide with defaulted signatures in PostgREST
DROP FUNCTION IF EXISTS public.admin_get_system_health();
DROP FUNCTION IF EXISTS public.admin_get_seller_orders(integer, integer, text, text);
DROP FUNCTION IF EXISTS public.admin_get_live_transactions(integer, integer, text, boolean);


-- ============================================================================
-- PACKAGE 4: FINANCIAL SETTLEMENT AUDIT TRAIL CONTRACT ALIGNMENT
-- ============================================================================

-- acknowledge_po_platform_fee_atomic(p_purchase_order_id uuid, p_policy_id uuid)
CREATE OR REPLACE FUNCTION public.acknowledge_po_platform_fee_atomic(p_purchase_order_id uuid, p_policy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_po RECORD;
  v_policy RECORD;
  v_existing_snapshot RECORD;
  v_estimated_fee numeric(14, 2);
  v_snapshot_id uuid;
BEGIN
  -- 1. Lock Purchase Order row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_purchase_order_id;
  END IF;

  -- 2. Authorization check: Must be the Supplier assigned to the PO or Platform Admin
  IF NOT v_is_admin THEN
    IF NOT (v_po.supplier_id IN (SELECT private.get_user_supplier_ids())) THEN
      RAISE EXCEPTION 'Unauthorized: Only the assigned supplier can acknowledge platform fees on PO acceptance (RED-05/FEE-5C5-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 3. Check PO Status (Only ISSUED POs can be acknowledged on acceptance)
  IF v_po.status != 'ISSUED' AND v_po.status != 'ACCEPTED' THEN
    RAISE EXCEPTION 'Purchase order % is in status % and cannot receive fee acknowledgement (FEE-5C5-INVALID-PO-STATUS)',
      p_purchase_order_id, v_po.status;
  END IF;

  -- 4. Check if snapshot already exists
  SELECT * INTO v_existing_snapshot
  FROM public.po_fee_snapshots
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF FOUND AND v_existing_snapshot.is_acknowledged THEN
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot_id', v_existing_snapshot.id,
      'is_acknowledged', true,
      'rate', v_existing_snapshot.rate,
      'message', 'Fee already acknowledged'
    );
  END IF;

  -- 5. Fetch Active Fee Policy (or specific policy if provided and active)
  IF p_policy_id IS NOT NULL THEN
    SELECT * INTO v_policy
    FROM public.platform_fee_policies
    WHERE id = p_policy_id;
  ELSE
    SELECT * INTO v_policy
    FROM public.platform_fee_policies
    WHERE status = 'ACTIVE'
    ORDER BY policy_version DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active platform fee policy available (FEE-5C5-NO-POLICY)';
  END IF;

  -- 6. Calculate estimated fee
  v_estimated_fee := ROUND((COALESCE(v_po.total_amount, 0.00) * v_policy.rate) / 100.0, 2);

  -- 7. Upsert PO Fee Snapshot
  IF v_existing_snapshot.id IS NOT NULL THEN
    UPDATE public.po_fee_snapshots
    SET
      policy_id = v_policy.id,
      policy_version = v_policy.policy_version,
      fee_type = v_policy.fee_type,
      rate = v_policy.rate,
      estimated_fee_amount = v_estimated_fee,
      is_acknowledged = true,
      acknowledged_by = v_caller_profile_id,
      acknowledged_at = now(),
      updated_at = now()
    WHERE id = v_existing_snapshot.id
    RETURNING id INTO v_snapshot_id;
  ELSE
    INSERT INTO public.po_fee_snapshots (
      purchase_order_id,
      policy_id,
      policy_version,
      fee_type,
      rate,
      estimated_fee_amount,
      is_acknowledged,
      acknowledged_by,
      acknowledged_at
    ) VALUES (
      p_purchase_order_id,
      v_policy.id,
      v_policy.policy_version,
      v_policy.fee_type,
      v_policy.rate,
      v_estimated_fee,
      true,
      v_caller_profile_id,
      now()
    )
    RETURNING id INTO v_snapshot_id;
  END IF;

  -- 8. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_PLATFORM_FEE_ACKNOWLEDGED',
    'PURCHASE_ORDER',
    p_purchase_order_id,
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'policy_id', v_policy.id,
      'policy_version', v_policy.policy_version,
      'rate', v_policy.rate,
      'estimated_fee', v_estimated_fee
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_id', v_snapshot_id,
    'policy_version', v_policy.policy_version,
    'rate', v_policy.rate,
    'estimated_fee_amount', v_estimated_fee,
    'is_acknowledged', true
  );
END;
$function$
;

-- add_settlement_exception_event_atomic(p_exception_id uuid, p_event_type text, p_notes text, p_to_status text)
CREATE OR REPLACE FUNCTION public.add_settlement_exception_event_atomic(p_exception_id uuid, p_event_type text, p_notes text, p_to_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_exception RECORD;
  v_event_id uuid;
  v_from_status text;
  v_to_status text;
BEGIN
  -- 1. Parameter checks
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'Event notes cannot be empty (EXC-5C6-INVALID-NOTES)';
  END IF;

  -- 2. Lock Exception row
  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement exception % not found', p_exception_id;
  END IF;

  -- 3. Authorization check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_exception.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can add exception timeline events';
    END IF;
  END IF;

  v_from_status := v_exception.status;
  v_to_status := COALESCE(p_to_status, v_from_status);

  -- 4. Status transition if requested
  IF p_to_status IS NOT NULL AND p_to_status <> v_from_status THEN
    UPDATE public.settlement_exceptions
    SET status = p_to_status,
        updated_at = now()
    WHERE id = p_exception_id;
  END IF;

  -- 5. Insert Event
  INSERT INTO public.settlement_exception_events (
    exception_id,
    event_type,
    from_status,
    to_status,
    notes,
    actor_id
  ) VALUES (
    p_exception_id,
    p_event_type,
    v_from_status,
    v_to_status,
    trim(p_notes),
    v_caller_profile_id
  ) RETURNING id INTO v_event_id;

  -- 6. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_EXCEPTION_EVENT_LOGGED',
    'SETTLEMENT_EXCEPTION_EVENT',
    v_event_id,
    jsonb_build_object(
      'exception_id', p_exception_id,
      'event_type', p_event_type,
      'from_status', v_from_status,
      'to_status', v_to_status,
      'notes', trim(p_notes)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'exception_id', p_exception_id,
    'from_status', v_from_status,
    'to_status', v_to_status
  );
END;
$function$
;

-- allocate_advance_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text, p_idempotency_key text)
CREATE OR REPLACE FUNCTION public.allocate_advance_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_pay RECORD;
  v_inv RECORD;
  v_po_id uuid;
  v_allocation_id uuid;
  v_existing_alloc_id uuid;
  v_now timestamptz := now();
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate Amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Allocation amount must be strictly greater than 0 (ADV-5C2-INVALID-AMOUNT)';
  END IF;

  -- 2. Lock Payment Row Pessimistically
  SELECT id, amount, unallocated_amount, purchase_order_id, invoice_id, status
  INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found (ADV-5C2-PAY-NOT-FOUND)', p_payment_id;
  END IF;

  -- 3. Lock Invoice Row Pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id, supplier_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found (ADV-5C2-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 4. Resolve and Match PO / Tenant alignment
  v_po_id := v_inv.purchase_order_id;
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_pay.purchase_order_id IS NOT NULL AND v_po_id IS NOT NULL THEN
    IF v_pay.purchase_order_id <> v_po_id THEN
      RAISE EXCEPTION 'Payment purchase order (%) does not match invoice purchase order (%) (ADV-5C2-PO-MISMATCH)',
        v_pay.purchase_order_id, v_po_id;
    END IF;
  END IF;

  -- 5. Authorization Check: Platform Admin or Buyer Owner/Manager for PO
  IF NOT v_is_admin THEN
    IF v_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = v_po_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can allocate advance payments (ADV-5C2-UNAUTHORIZED)';
      END IF;
    END IF;
  END IF;

  -- 6. Validate Invoice State Eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is in status %, but must be APPROVED or PARTIALLY_PAID to receive advance allocation (ADV-5C2-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- 7. Validate Caps: Payment Unallocated Amount & Invoice Balance Due
  IF p_amount > v_pay.unallocated_amount THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds available payment unallocated balance (₹%) (ADV-5C2-PAY-OVERALLOC)',
      p_amount, v_pay.unallocated_amount;
  END IF;

  IF p_amount > v_inv.balance_due THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds invoice balance due (₹%) (ADV-5C2-INV-OVERALLOC)',
      p_amount, v_inv.balance_due;
  END IF;

  -- 8. Insert Payment Allocation Record (Triggers validate integrity and sync balances)
  INSERT INTO public.payment_allocations (
    payment_id,
    invoice_id,
    allocated_amount,
    allocated_at,
    status,
    notes
  ) VALUES (
    p_payment_id,
    p_invoice_id,
    p_amount,
    v_now,
    'ALLOCATED',
    COALESCE(p_notes, 'Advance payment balance allocation')
  ) RETURNING id INTO v_allocation_id;

  -- 9. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = p_payment_id;

  -- 10. Record Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ADVANCE_PAYMENT_ALLOCATED',
    'PAYMENT_ALLOCATION',
    v_allocation_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'allocated_amount', p_amount,
      'notes', p_notes,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', v_allocation_id,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'allocated_amount', p_amount,
    'payment', jsonb_build_object(
      'id', v_final_pay.id,
      'amount', v_final_pay.amount,
      'unallocated_amount', v_final_pay.unallocated_amount,
      'status', v_final_pay.status
    ),
    'invoice', jsonb_build_object(
      'id', v_final_inv.id,
      'amount', v_final_inv.amount,
      'paid_amount', v_final_inv.paid_amount,
      'balance_due', v_final_inv.balance_due,
      'status', v_final_inv.status
    )
  );
END;
$function$
;

-- allocate_advance_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text, p_idempotency_key text, p_allocated_by uuid)
CREATE OR REPLACE FUNCTION public.allocate_advance_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_allocated_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_pay RECORD;
  v_inv RECORD;
  v_po_id uuid;
  v_allocation_id uuid;
  v_existing_alloc RECORD;
  v_effective_actor uuid := COALESCE(v_caller_profile_id, p_allocated_by);
  v_now timestamptz := now();
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate Amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Allocation amount must be strictly greater than 0 (ADV-5C2-INVALID-AMOUNT)';
  END IF;

  -- 2. Idempotency Pre-check (GAP-5C6-02)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_alloc
    FROM public.payment_allocations
    WHERE idempotency_key = p_idempotency_key
      AND status = 'ALLOCATED'
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_existing_alloc.invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_alloc.payment_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'allocation_id', v_existing_alloc.id,
        'payment_id', v_existing_alloc.payment_id,
        'invoice_id', v_existing_alloc.invoice_id,
        'allocated_amount', v_existing_alloc.allocated_amount,
        'payment', jsonb_build_object(
          'id', v_final_pay.id,
          'amount', v_final_pay.amount,
          'unallocated_amount', v_final_pay.unallocated_amount,
          'status', v_final_pay.status
        ),
        'invoice', jsonb_build_object(
          'id', v_final_inv.id,
          'amount', v_final_inv.amount,
          'paid_amount', v_final_inv.paid_amount,
          'balance_due', v_final_inv.balance_due,
          'status', v_final_inv.status
        )
      );
    END IF;
  END IF;

  -- 3. Lock Payment Row Pessimistically
  SELECT id, amount, unallocated_amount, purchase_order_id, invoice_id, status
  INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found (ADV-5C2-PAY-NOT-FOUND)', p_payment_id;
  END IF;

  -- 4. Lock Invoice Row Pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id, supplier_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found (ADV-5C2-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 5. Resolve and Match PO / Tenant alignment
  v_po_id := v_inv.purchase_order_id;
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_pay.purchase_order_id IS NOT NULL AND v_po_id IS NOT NULL THEN
    IF v_pay.purchase_order_id <> v_po_id THEN
      RAISE EXCEPTION 'Payment purchase order (%) does not match invoice purchase order (%) (ADV-5C2-PO-MISMATCH)',
        v_pay.purchase_order_id, v_po_id;
    END IF;
  END IF;

  -- 6. Authorization Check: Platform Admin or Buyer Owner/Manager for PO
  IF NOT v_is_admin THEN
    IF v_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = v_po_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can allocate advance payments (ADV-5C2-UNAUTHORIZED)';
      END IF;
    END IF;
  END IF;

  -- 7. Validate Invoice State Eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is in status %, but must be APPROVED or PARTIALLY_PAID to receive advance allocation (ADV-5C2-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- 8. Validate Caps: Payment Unallocated Amount & Invoice Balance Due
  IF p_amount > v_pay.unallocated_amount THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds available payment unallocated balance (₹%) (ADV-5C2-PAY-OVERALLOC)',
      p_amount, v_pay.unallocated_amount;
  END IF;

  IF p_amount > v_inv.balance_due THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds invoice balance due (₹%) (ADV-5C2-INV-OVERALLOC)',
      p_amount, v_inv.balance_due;
  END IF;

  -- 9. Insert Payment Allocation Record (GAP-5C6-02 idempotency_key & GAP-5C6-07 allocated_by)
  BEGIN
    INSERT INTO public.payment_allocations (
      payment_id,
      invoice_id,
      allocated_amount,
      allocated_at,
      status,
      idempotency_key,
      allocated_by,
      notes
    ) VALUES (
      p_payment_id,
      p_invoice_id,
      p_amount,
      v_now,
      'ALLOCATED',
      p_idempotency_key,
      v_effective_actor,
      COALESCE(p_notes, 'Advance payment balance allocation')
    ) RETURNING id INTO v_allocation_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_alloc
        FROM public.payment_allocations
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
          SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_existing_alloc.invoice_id;
          SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_alloc.payment_id;

          RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'allocation_id', v_existing_alloc.id,
            'payment_id', v_existing_alloc.payment_id,
            'invoice_id', v_existing_alloc.invoice_id,
            'allocated_amount', v_existing_alloc.allocated_amount,
            'payment', jsonb_build_object(
              'id', v_final_pay.id,
              'amount', v_final_pay.amount,
              'unallocated_amount', v_final_pay.unallocated_amount,
              'status', v_final_pay.status
            ),
            'invoice', jsonb_build_object(
              'id', v_final_inv.id,
              'amount', v_final_inv.amount,
              'paid_amount', v_final_inv.paid_amount,
              'balance_due', v_final_inv.balance_due,
              'status', v_final_inv.status
            )
          );
        END IF;
      END IF;
      RAISE;
  END;

  -- 10. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = p_payment_id;

  -- 11. Record Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ADVANCE_PAYMENT_ALLOCATED',
    'PAYMENT_ALLOCATION',
    v_allocation_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'allocated_amount', p_amount,
      'notes', p_notes,
      'idempotency_key', p_idempotency_key,
      'allocated_by', v_effective_actor
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'allocation_id', v_allocation_id,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'allocated_amount', p_amount,
    'payment', jsonb_build_object(
      'id', v_final_pay.id,
      'amount', v_final_pay.amount,
      'unallocated_amount', v_final_pay.unallocated_amount,
      'status', v_final_pay.status
    ),
    'invoice', jsonb_build_object(
      'id', v_final_inv.id,
      'amount', v_final_inv.amount,
      'paid_amount', v_final_inv.paid_amount,
      'balance_due', v_final_inv.balance_due,
      'status', v_final_inv.status
    )
  );
END;
$function$
;

-- commit_po_change_order_atomic(p_change_order_id uuid, p_organization_id uuid)
CREATE OR REPLACE FUNCTION public.commit_po_change_order_atomic(p_change_order_id uuid, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_co RECORD;
  v_po RECORD;
  v_cumulative_invoiced numeric(14, 2) := 0.00;
  v_revised_po_total numeric(14, 2);
  v_updated_po RECORD;
  v_updated_co RECORD;
BEGIN
  -- 1. Authorization Check (RED-01: Supplier cannot approve / commit change orders)
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can commit PO change orders (RED-01/CO-5C4-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Lock Change Order row
  SELECT * INTO v_co
  FROM public.po_change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change Order % not found for organization %', p_change_order_id, p_organization_id;
  END IF;

  IF v_co.status = 'COMMITTED' THEN
    RAISE EXCEPTION 'Change Order % is already COMMITTED (RED-14/CO-5C4-ALREADY-COMMITTED)', p_change_order_id;
  END IF;

  IF v_co.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Cannot commit a REJECTED change order %', p_change_order_id;
  END IF;

  -- 3. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_co.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order % not found', v_co.purchase_order_id;
  END IF;

  IF v_po.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot commit change order against PO in status %', v_po.status;
  END IF;

  -- 4. Calculate Cumulative Invoiced Amount on this PO
  SELECT COALESCE(SUM(amount), 0.00) INTO v_cumulative_invoiced
  FROM public.invoices
  WHERE purchase_order_id = v_po.id
    AND status NOT IN ('REJECTED', 'CANCELLED');

  v_revised_po_total := v_po.total_amount + v_co.total_delta;

  -- 5. Negative Change Order Invariant (RED-02: Revised total >= Cumulative Invoiced)
  IF v_revised_po_total < v_cumulative_invoiced THEN
    RAISE EXCEPTION 'Negative change order rejection: Revised PO commitment ₹% cannot be less than cumulative invoiced amount ₹% (REV-5C4-CO-BELOW-INVOICED)',
      v_revised_po_total, v_cumulative_invoiced;
  END IF;

  IF v_revised_po_total < 0 THEN
    RAISE EXCEPTION 'Change order would result in negative PO commitment (₹%)', v_revised_po_total;
  END IF;

  -- 6. Apply Commitment to Change Order
  UPDATE public.po_change_orders
  SET status = 'COMMITTED',
      previous_po_total = v_po.total_amount,
      revised_po_total = v_revised_po_total,
      committed_by = v_caller_profile_id,
      committed_at = now(),
      updated_at = now()
  WHERE id = v_co.id
  RETURNING * INTO v_updated_co;

  -- 7. Synchronize PO Total Amount
  UPDATE public.purchase_orders
  SET total_amount = v_revised_po_total,
      updated_at = now()
  WHERE id = v_po.id
  RETURNING * INTO v_updated_po;

  -- 8. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_CHANGE_ORDER_COMMITTED',
    'PO_CHANGE_ORDER',
    v_co.id,
    jsonb_build_object(
      'purchase_order_id', v_po.id,
      'change_order_number', v_co.change_order_number,
      'previous_po_total', v_po.total_amount,
      'revised_po_total', v_revised_po_total,
      'total_delta', v_co.total_delta,
      'cumulative_invoiced', v_cumulative_invoiced
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'change_order_id', v_co.id,
    'change_order', row_to_json(v_updated_co),
    'purchase_order', row_to_json(v_updated_po)
  );
END;
$function$
;

-- execute_settlement_reconciliation_atomic(p_organization_id uuid, p_invoice_id uuid, p_payment_id uuid, p_utr_number text, p_utr_amount numeric)
CREATE OR REPLACE FUNCTION public.execute_settlement_reconciliation_atomic(p_organization_id uuid, p_invoice_id uuid, p_payment_id uuid DEFAULT NULL::uuid, p_utr_number text DEFAULT NULL::text, p_utr_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_invoice RECORD;
  v_po RECORD;
  v_clean_utr text;
  v_existing_utr_rec RECORD;
  v_tds_total numeric(14, 2) := 0.00;
  v_fee_total numeric(14, 2) := 0.00;
  v_paid_total numeric(14, 2) := 0.00;
  v_debit_total numeric(14, 2) := 0.00;
  v_credit_total numeric(14, 2) := 0.00;
  v_adjusted_gross numeric(14, 2);
  v_expected_net numeric(14, 2);
  v_variance numeric(14, 2) := 0.00;
  v_status text := 'UNRECONCILED';
  v_discrepancy_type text := 'NONE';
  v_discrepancy_details text := NULL;
  v_severity text := 'MEDIUM';
  v_requires_exception boolean := false;
  v_rec_id uuid;
  v_exc_id uuid;
  v_final_rec RECORD;
BEGIN
  -- 1. Authorization check: Buyer OWNER or MANAGER only
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can execute settlement reconciliation (RED-09/REC-5C5-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Lock Invoice row
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_invoice.organization_id != p_organization_id THEN
    RAISE EXCEPTION 'Invoice does not belong to organization % (RED-08: CROSS_TENANT_VIOLATION)', p_organization_id;
  END IF;

  -- 3. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_invoice.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found for invoice', v_invoice.purchase_order_id;
  END IF;

  v_clean_utr := NULLIF(UPPER(TRIM(COALESCE(p_utr_number, ''))), '');

  -- 4. Calculate Adjustments, TDS, Platform Fees, and Paid Allocations
  SELECT COALESCE(SUM(amount) FILTER (WHERE note_type = 'DEBIT_NOTE' AND status != 'CANCELLED'), 0.00),
         COALESCE(SUM(amount) FILTER (WHERE note_type = 'CREDIT_NOTE' AND status != 'CANCELLED'), 0.00)
  INTO v_debit_total, v_credit_total
  FROM public.credit_debit_notes
  WHERE invoice_id = p_invoice_id;

  v_adjusted_gross := v_invoice.amount - v_debit_total + v_credit_total;

  SELECT COALESCE(SUM(tds_amount), 0.00)
  INTO v_tds_total
  FROM public.tds_deductions
  WHERE invoice_id = p_invoice_id AND status != 'VOIDED';

  SELECT COALESCE(SUM(fee_amount), 0.00)
  INTO v_fee_total
  FROM public.platform_fee_transactions
  WHERE invoice_id = p_invoice_id AND status NOT IN ('VOIDED', 'REVERSED');

  SELECT COALESCE(SUM(allocated_amount), 0.00)
  INTO v_paid_total
  FROM public.payment_allocations
  WHERE invoice_id = p_invoice_id AND status = 'ALLOCATED';

  v_expected_net := GREATEST(0.00, v_adjusted_gross - v_tds_total - v_fee_total);

  -- 5. Discrepancy Classification Engine
  -- Check A: Duplicate UTR in organization (RED-16)
  IF v_clean_utr IS NOT NULL THEN
    SELECT * INTO v_existing_utr_rec
    FROM public.settlement_reconciliations
    WHERE organization_id = p_organization_id
      AND utr_number = v_clean_utr
      AND invoice_id != p_invoice_id
    LIMIT 1;

    IF FOUND THEN
      v_status := 'MISMATCH';
      v_discrepancy_type := 'DUPLICATE_UTR';
      v_discrepancy_details := 'Bank UTR ' || v_clean_utr || ' is already used in another reconciliation record';
      v_requires_exception := true;
      v_severity := 'HIGH';
    END IF;
  END IF;

  -- Check B: Excess Allocation (RED-13, RED-14)
  IF v_discrepancy_type = 'NONE' AND v_paid_total > v_expected_net THEN
    v_status := 'MISMATCH';
    v_discrepancy_type := 'EXCESS_ALLOCATION';
    v_variance := v_paid_total - v_expected_net;
    v_discrepancy_details := 'Paid allocation (' || v_paid_total || ') exceeds net settlement obligation (' || v_expected_net || ')';
    v_requires_exception := true;
    v_severity := 'HIGH';
  END IF;

  -- Check C: UTR Amount Mismatch against paid allocation (RED-15)
  IF v_discrepancy_type = 'NONE' AND p_utr_amount IS NOT NULL THEN
    IF ABS(p_utr_amount - v_paid_total) > 0.01 THEN
      v_status := 'MISMATCH';
      v_discrepancy_type := 'UTR_AMOUNT_MISMATCH';
      v_variance := ABS(p_utr_amount - v_paid_total);
      v_discrepancy_details := 'Bank cleared UTR amount (' || p_utr_amount || ') does not match recorded payment (' || v_paid_total || ')';
      v_requires_exception := true;
      v_severity := CASE WHEN v_variance > 1000 THEN 'CRITICAL' ELSE 'MEDIUM' END;
    END IF;
  END IF;

  -- Check D: Under Allocation / Partial Settlement
  IF v_discrepancy_type = 'NONE' AND v_paid_total > 0 AND v_paid_total < v_expected_net THEN
    v_status := 'PARTIAL';
    v_discrepancy_type := 'UNDER_ALLOCATION';
    v_variance := v_expected_net - v_paid_total;
    v_discrepancy_details := 'Partial payment recorded: ' || v_paid_total || ' of ' || v_expected_net || ' net obligation';
  END IF;

  -- Check E: Unreconciled (Zero paid or missing UTR)
  IF v_discrepancy_type = 'NONE' AND v_paid_total = 0 THEN
    v_status := 'UNRECONCILED';
    v_discrepancy_type := 'NONE';
    v_variance := v_expected_net;
    v_discrepancy_details := 'Awaiting settlement payment';
  ELSIF v_discrepancy_type = 'NONE' AND v_paid_total >= v_expected_net AND v_clean_utr IS NULL AND p_utr_amount IS NULL THEN
    v_status := 'UNRECONCILED';
    v_discrepancy_type := 'MISSING_UTR';
    v_variance := 0.00;
    v_discrepancy_details := 'Payment allocated but bank remittance advice UTR pending';
  ELSIF v_discrepancy_type = 'NONE' AND v_paid_total >= v_expected_net THEN
    v_status := 'MATCHED';
    v_discrepancy_type := 'NONE';
    v_variance := 0.00;
    v_discrepancy_details := 'Settlement fully matched and reconciled';
  END IF;

  -- 6. Upsert Settlement Reconciliation Record
  INSERT INTO public.settlement_reconciliations (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    payment_id,
    invoice_gross_amount,
    adjusted_gross_amount,
    tds_amount,
    platform_fee_amount,
    paid_allocated_amount,
    supplier_net_settlement_amount,
    utr_number,
    utr_cleared_amount,
    variance_amount,
    status,
    discrepancy_type,
    discrepancy_details,
    reconciled_at,
    reconciled_by
  ) VALUES (
    p_organization_id,
    v_po.supplier_id,
    v_po.id,
    p_invoice_id,
    p_payment_id,
    v_invoice.amount,
    v_adjusted_gross,
    v_tds_total,
    v_fee_total,
    v_paid_total,
    v_expected_net,
    v_clean_utr,
    p_utr_amount,
    v_variance,
    v_status,
    v_discrepancy_type,
    v_discrepancy_details,
    CASE WHEN v_status = 'MATCHED' THEN now() ELSE NULL END,
    v_caller_profile_id
  )
  RETURNING id INTO v_rec_id;

  -- 7. If exception is required, insert into settlement_exceptions queue
  IF v_requires_exception THEN
    INSERT INTO public.settlement_exceptions (
      organization_id,
      reconciliation_id,
      purchase_order_id,
      invoice_id,
      payment_id,
      exception_type,
      severity,
      status,
      amount_in_dispute,
      reason
    ) VALUES (
      p_organization_id,
      v_rec_id,
      v_po.id,
      p_invoice_id,
      p_payment_id,
      v_discrepancy_type,
      v_severity,
      'OPEN',
      v_variance,
      v_discrepancy_details
    )
    RETURNING id INTO v_exc_id;
  END IF;

  SELECT * INTO v_final_rec FROM public.settlement_reconciliations WHERE id = v_rec_id;

  -- 8. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_RECONCILIATION_EXECUTED',
    'SETTLEMENT_RECONCILIATION',
    v_rec_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'status', v_status,
      'discrepancy_type', v_discrepancy_type,
      'variance_amount', v_variance,
      'exception_id', v_exc_id
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_rec_id,
    'status', v_status,
    'discrepancy_type', v_discrepancy_type,
    'variance_amount', v_variance,
    'exception_id', v_exc_id,
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$function$
;

-- invalidate_bank_reconciliation_atomic(p_reconciliation_id uuid, p_reason text)
CREATE OR REPLACE FUNCTION public.invalidate_bank_reconciliation_atomic(p_reconciliation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_rec RECORD;
  v_final_rec RECORD;
BEGIN
  -- 1. Validate reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Invalidation reason must be at least 5 characters (REC-5C6-INVALID-REASON)';
  END IF;

  -- 2. Lock Bank Reconciliation row
  SELECT * INTO v_rec
  FROM public.bank_reconciliation_records
  WHERE id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank reconciliation record % not found (REC-5C6-NOT-FOUND)', p_reconciliation_id;
  END IF;

  -- 3. Authorization check: Buyer OWNER / MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_rec.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can invalidate bank reconciliations (REC-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 4. Transition status to DISCREPANCY, discrepancy_type = MANUALLY_INVALIDATED
  UPDATE public.bank_reconciliation_records
  SET status = 'DISCREPANCY',
      discrepancy_type = 'MANUALLY_INVALIDATED',
      discrepancy_details = 'Reconciliation invalidated: ' || trim(p_reason),
      resolution_notes = 'Invalidated by ' || COALESCE(v_caller_profile_id::text, 'user') || ': ' || trim(p_reason),
      updated_at = now()
  WHERE id = p_reconciliation_id;

  SELECT * INTO v_final_rec FROM public.bank_reconciliation_records WHERE id = p_reconciliation_id;

  -- 5. Record Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'BANK_RECONCILIATION_INVALIDATED',
    'BANK_RECONCILIATION',
    p_reconciliation_id,
    jsonb_build_object(
      'reconciliation_id', p_reconciliation_id,
      'utr_number', v_rec.utr_number,
      'previous_status', v_rec.status,
      'reason', trim(p_reason)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', p_reconciliation_id,
    'status', 'DISCREPANCY',
    'discrepancy_type', 'MANUALLY_INVALIDATED',
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$function$
;

-- issue_credit_debit_note_atomic(p_organization_id uuid, p_invoice_id uuid, p_note_type text, p_amount numeric, p_tax_amount numeric, p_reason text, p_note_number text, p_idempotency_key text)
CREATE OR REPLACE FUNCTION public.issue_credit_debit_note_atomic(p_organization_id uuid, p_invoice_id uuid, p_note_type text, p_amount numeric, p_tax_amount numeric DEFAULT 0.00, p_reason text DEFAULT ''::text, p_note_number text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_invoice RECORD;
  v_po_id uuid;
  v_existing_debits numeric(14, 2);
  v_prefix text;
  v_note_number text;
  v_note RECORD;
BEGIN
  -- 1. Validate Input Parameters
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Note amount must be strictly greater than 0 (CDN-5C3-INVALID-AMOUNT)';
  END IF;

  IF p_note_type NOT IN ('DEBIT_NOTE', 'CREDIT_NOTE') THEN
    RAISE EXCEPTION 'Note type must be DEBIT_NOTE or CREDIT_NOTE (CDN-5C3-INVALID-TYPE)';
  END IF;

  IF p_tax_amount IS NULL OR p_tax_amount < 0.00 THEN
    RAISE EXCEPTION 'Tax amount must be non-negative (CDN-5C3-INVALID-TAX)';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required when issuing a credit or debit note (CDN-5C3-INVALID-REASON)';
  END IF;

  -- 2. Validate Authorization
  v_caller_role := private.get_org_role(p_organization_id);
  IF NOT v_is_admin AND (v_caller_role IS NULL OR v_caller_role NOT IN ('OWNER', 'MANAGER')) THEN
    RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can issue credit/debit notes (CDN-5C3-UNAUTHORIZED)';
  END IF;

  -- 3. Lock Target Invoice Pessimistically
  SELECT id, purchase_order_id, work_order_id, amount, paid_amount, balance_due, status, supplier_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Invoice % not found (CDN-5C3-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  IF v_invoice.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Cannot issue credit or debit note against a REJECTED invoice (CDN-5C3-INVOICE-REJECTED)';
  END IF;

  -- Resolve PO id
  v_po_id := v_invoice.purchase_order_id;
  IF v_po_id IS NULL AND v_invoice.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_invoice.work_order_id;
  END IF;

  -- 4. Validate Debit Note Balance Cap (5C3-RED-04)
  IF p_note_type = 'DEBIT_NOTE' THEN
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_existing_debits
    FROM public.credit_debit_notes
    WHERE invoice_id = p_invoice_id
      AND note_type = 'DEBIT_NOTE'
      AND status IN ('ISSUED', 'APPLIED');

    IF (v_existing_debits + p_amount) > v_invoice.amount THEN
      RAISE EXCEPTION 'Debit note amount (₹%) exceeds permitted invoice ceiling of ₹% (CDN-5C3-EXCEEDS-BALANCE)',
        (v_existing_debits + p_amount), v_invoice.amount;
    END IF;
  END IF;

  -- 5. Format Note Number
  v_prefix := CASE WHEN p_note_type = 'DEBIT_NOTE' THEN 'DN' ELSE 'CN' END;
  v_note_number := COALESCE(
    p_note_number,
    v_prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))
  );

  -- 6. Insert Credit / Debit Note
  INSERT INTO public.credit_debit_notes (
    organization_id,
    purchase_order_id,
    invoice_id,
    note_number,
    note_type,
    amount,
    tax_amount,
    reason,
    status,
    created_by
  ) VALUES (
    p_organization_id,
    v_po_id,
    p_invoice_id,
    v_note_number,
    p_note_type,
    p_amount,
    p_tax_amount,
    p_reason,
    'ISSUED',
    v_caller_profile_id
  ) RETURNING * INTO v_note;

  -- 7. Record Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'CREDIT_DEBIT_NOTE_ISSUED',
    'CREDIT_DEBIT_NOTE',
    v_note.id,
    jsonb_build_object(
      'note_number', v_note_number,
      'note_type', p_note_type,
      'amount', p_amount,
      'tax_amount', p_tax_amount,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'reason', p_reason,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'note', row_to_json(v_note)
  );
END;
$function$
;

-- reconcile_bank_utr_atomic(p_organization_id uuid, p_utr_number text, p_cleared_amount numeric, p_cleared_date timestamp with time zone, p_bank_name text, p_bank_reference text, p_payment_id uuid)
CREATE OR REPLACE FUNCTION public.reconcile_bank_utr_atomic(p_organization_id uuid, p_utr_number text, p_cleared_amount numeric, p_cleared_date timestamp with time zone, p_bank_name text DEFAULT NULL::text, p_bank_reference text DEFAULT NULL::text, p_payment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_payment RECORD;
  v_existing_rec RECORD;
  v_clean_utr text;
  v_amount_diff numeric(14, 2) := 0.00;
  v_status text := 'MATCHED';
  v_discrepancy_type text := 'NONE';
  v_discrepancy_details text := NULL;
  v_date_drift_days integer := 0;
  v_record_id uuid;
  v_final_rec RECORD;
BEGIN
  -- 1. Authorization Check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can reconcile bank remittance records (REC-5C4-UNAUTHORIZED)';
    END IF;
  END IF;

  v_clean_utr := UPPER(REPLACE(REPLACE(TRIM(p_utr_number), ' ', ''), '-', ''));

  -- 2. Duplicate UTR check across org
  SELECT * INTO v_existing_rec
  FROM public.bank_reconciliation_records
  WHERE organization_id = p_organization_id
    AND utr_number = v_clean_utr;

  IF FOUND THEN
    RAISE EXCEPTION 'Duplicate UTR reconciliation: % has already been recorded (RED-11/REC-5C4-DUPLICATE-UTR)', v_clean_utr;
  END IF;

  -- 3. Payment Lookup
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id;
  ELSE
    -- Search payment by reference
    SELECT * INTO v_payment
    FROM public.payments
    WHERE UPPER(REPLACE(REPLACE(TRIM(COALESCE(reference, payment_reference, '')), ' ', ''), '-', '')) = v_clean_utr
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_payment.id IS NULL THEN
    v_status := 'DISCREPANCY';
    v_discrepancy_type := 'UNKNOWN_UTR';
    v_discrepancy_details := 'UTR ' || v_clean_utr || ' cleared ₹' || p_cleared_amount || ' at bank but has no matching buyer payment record';
    v_amount_diff := -p_cleared_amount;
  ELSE
    v_amount_diff := v_payment.amount - p_cleared_amount;
    IF v_payment.created_at IS NOT NULL THEN
      v_date_drift_days := ABS(EXTRACT(DAY FROM (p_cleared_date - v_payment.created_at)))::integer;
    END IF;

    IF ABS(v_amount_diff) > 0.01 THEN
      v_status := 'DISCREPANCY';
      v_discrepancy_type := 'AMOUNT_MISMATCH';
      v_discrepancy_details := 'Amount mismatch: Buyer recorded ₹' || v_payment.amount || ' vs Bank cleared ₹' || p_cleared_amount || ' (Diff: ₹' || v_amount_diff || ')';
    ELSIF v_date_drift_days > 7 THEN
      v_status := 'DISCREPANCY';
      v_discrepancy_type := 'DATE_DRIFT';
      v_discrepancy_details := 'Date drift of ' || v_date_drift_days || ' days exceeds allowable maximum of 7 days';
    ELSE
      v_status := 'MATCHED';
      v_discrepancy_type := 'NONE';
    END IF;
  END IF;

  -- 4. Insert Reconciliation Record
  INSERT INTO public.bank_reconciliation_records (
    organization_id,
    payment_id,
    utr_number,
    bank_reference,
    bank_name,
    buyer_recorded_amount,
    bank_cleared_amount,
    amount_difference,
    buyer_recorded_date,
    bank_cleared_date,
    date_drift_days,
    status,
    discrepancy_type,
    discrepancy_details,
    reconciled_by,
    reconciled_at
  ) VALUES (
    p_organization_id,
    v_payment.id,
    v_clean_utr,
    p_bank_reference,
    p_bank_name,
    COALESCE(v_payment.amount, 0.00),
    p_cleared_amount,
    v_amount_diff,
    v_payment.created_at,
    p_cleared_date,
    v_date_drift_days,
    v_status,
    v_discrepancy_type,
    v_discrepancy_details,
    v_caller_profile_id,
    now()
  )
  RETURNING id INTO v_record_id;

  SELECT * INTO v_final_rec FROM public.bank_reconciliation_records WHERE id = v_record_id;

  -- 5. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'BANK_UTR_RECONCILED',
    'BANK_RECONCILIATION',
    v_record_id,
    jsonb_build_object(
      'utr_number', v_clean_utr,
      'status', v_status,
      'discrepancy_type', v_discrepancy_type,
      'bank_cleared_amount', p_cleared_amount,
      'buyer_recorded_amount', COALESCE(v_payment.amount, 0.00)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_record_id,
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$function$
;

-- record_erp_export_manifest_atomic(p_organization_id uuid, p_export_type text, p_batch_reference text, p_record_count integer, p_total_amount numeric, p_payload_checksum_sha256 text, p_purchase_order_id uuid, p_payment_id uuid)
CREATE OR REPLACE FUNCTION public.record_erp_export_manifest_atomic(p_organization_id uuid, p_export_type text, p_batch_reference text, p_record_count integer, p_total_amount numeric, p_payload_checksum_sha256 text, p_purchase_order_id uuid DEFAULT NULL::uuid, p_payment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_latest_version integer := 0;
  v_existing_manifest RECORD;
  v_is_duplicate boolean := false;
  v_new_version integer := 1;
  v_manifest_id uuid;
  v_saved_manifest RECORD;
BEGIN
  -- 1. Authorization check: Buyer OWNER or MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can record ERP export manifests (RED-16/ERP-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Parameter validation
  IF p_batch_reference IS NULL OR trim(p_batch_reference) = '' THEN
    RAISE EXCEPTION 'Batch reference is required (ERP-5C6-INVALID-BATCH)';
  END IF;

  IF p_payload_checksum_sha256 IS NULL OR length(trim(p_payload_checksum_sha256)) < 32 THEN
    RAISE EXCEPTION 'Valid SHA-256 payload checksum is required (ERP-5C6-INVALID-CHECKSUM)';
  END IF;

  -- 3. Check existing export history for batch reference
  SELECT * INTO v_existing_manifest
  FROM public.erp_export_manifests
  WHERE organization_id = p_organization_id
    AND export_type = p_export_type
    AND batch_reference = p_batch_reference
  ORDER BY export_version DESC
  LIMIT 1;

  IF FOUND THEN
    v_latest_version := v_existing_manifest.export_version;
    v_new_version := v_latest_version + 1;

    -- Exact payload replay detection
    IF v_existing_manifest.payload_checksum_sha256 = p_payload_checksum_sha256 THEN
      v_is_duplicate := true;
    END IF;
  END IF;

  -- 4. Insert Manifest
  INSERT INTO public.erp_export_manifests (
    organization_id,
    export_type,
    batch_reference,
    export_version,
    purchase_order_id,
    payment_id,
    record_count,
    total_amount,
    payload_checksum_sha256,
    exported_by,
    exported_at
  ) VALUES (
    p_organization_id,
    p_export_type,
    p_batch_reference,
    v_new_version,
    p_purchase_order_id,
    p_payment_id,
    p_record_count,
    p_total_amount,
    p_payload_checksum_sha256,
    v_caller_profile_id,
    now()
  ) RETURNING id INTO v_manifest_id;

  SELECT * INTO v_saved_manifest FROM public.erp_export_manifests WHERE id = v_manifest_id;

  -- 5. Record Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ERP_EXPORT_RECORDED',
    'ERP_EXPORT_MANIFEST',
    v_manifest_id,
    jsonb_build_object(
      'organization_id', p_organization_id,
      'export_type', p_export_type,
      'batch_reference', p_batch_reference,
      'export_version', v_new_version,
      'is_duplicate', v_is_duplicate,
      'checksum', p_payload_checksum_sha256,
      'record_count', p_record_count,
      'total_amount', p_total_amount
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'manifest_id', v_manifest_id,
    'export_version', v_new_version,
    'is_duplicate', v_is_duplicate,
    'manifest', row_to_json(v_saved_manifest)
  );
END;
$function$
;

-- record_verified_payment(p_payment_type text, p_organization_id uuid, p_invoice_id uuid, p_amount numeric, p_currency text, p_gateway text, p_gateway_event_id text, p_payment_reference text, p_tier text, p_billing_cycle text, p_gateway_payload jsonb)
CREATE OR REPLACE FUNCTION public.record_verified_payment(p_payment_type text, p_organization_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT 0, p_currency text DEFAULT 'INR'::text, p_gateway text DEFAULT 'RAZORPAY'::text, p_gateway_event_id text DEFAULT NULL::text, p_payment_reference text DEFAULT NULL::text, p_tier text DEFAULT 'TIER_1_MSME'::text, p_billing_cycle text DEFAULT 'MONTHLY'::text, p_gateway_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_org organizations%ROWTYPE;
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(coalesce(btrim(p_billing_cycle), 'MONTHLY'));
  v_tier_upper text := upper(coalesce(btrim(p_tier), 'TIER_1_MSME'));
  v_existing_log_id uuid;
  v_existing_payment_id uuid;
BEGIN
  -- Idempotency check 1: Check if gateway_event_id was already processed for subscription
  IF p_gateway_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_log_id
    FROM public.subscription_payment_logs
    WHERE gateway_event_id = p_gateway_event_id;

    IF v_existing_log_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'message', 'Payment webhook already processed (idempotent duplicate)',
        'log_id', v_existing_log_id,
        'duplicate', true
      );
    END IF;

    -- Idempotency check 2: Check payments table
    SELECT id INTO v_existing_payment_id
    FROM public.payments
    WHERE gateway_event_id = p_gateway_event_id;

    IF v_existing_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'message', 'Invoice payment webhook already processed (idempotent duplicate)',
        'payment_id', v_existing_payment_id,
        'duplicate', true
      );
    END IF;
  END IF;

  -- Branch A: Organization Subscription Payment
  IF upper(p_payment_type) = 'SUBSCRIPTION' THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id is required for subscription payments';
    END IF;

    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization % not found', p_organization_id;
    END IF;

    -- Calculate validity days
    IF v_cycle_upper = 'YEARLY' THEN
      v_validity_days := 365;
    ELSE
      v_validity_days := 30;
    END IF;

    -- Calculate new expiration
    v_prev_expires := v_org.subscription_expires_at;
    IF v_prev_expires IS NULL OR v_prev_expires < v_now THEN
      v_new_expires := v_now + (v_validity_days || ' days')::interval;
    ELSE
      v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
    END IF;

    -- Update organization subscription state
    UPDATE public.organizations
    SET 
      subscription_tier = v_tier_upper,
      subscription_status = 'ACTIVE',
      subscription_plan = v_cycle_upper,
      subscription_expires_at = v_new_expires,
      payment_reference = COALESCE(p_payment_reference, p_gateway_event_id, 'VERIFIED_WEBHOOK'),
      updated_at = v_now
    WHERE id = p_organization_id;

    -- Insert into subscription payment logs
    INSERT INTO public.subscription_payment_logs (
      organization_id,
      tier,
      billing_cycle,
      amount,
      currency,
      payment_method,
      payment_reference,
      validity_days,
      previous_expires_at,
      new_expires_at,
      status,
      gateway,
      gateway_event_id,
      gateway_payload,
      created_at
    ) VALUES (
      p_organization_id,
      v_tier_upper,
      v_cycle_upper,
      p_amount,
      p_currency,
      coalesce(p_gateway, 'GATEWAY_WEBHOOK'),
      coalesce(p_payment_reference, p_gateway_event_id, 'VERIFIED_WEBHOOK'),
      v_validity_days,
      v_prev_expires,
      v_new_expires,
      'SUCCESS',
      p_gateway,
      p_gateway_event_id,
      p_gateway_payload,
      v_now
    ) RETURNING id INTO v_existing_log_id;

    -- Insert audit event
    INSERT INTO public.audit_events ( event_type,
      entity_type,
      entity_id,
      payload,
      actor_id
    ) VALUES (
      'SUBSCRIPTION_PAYMENT_VERIFIED',
      'ORGANIZATION',
      p_organization_id,
      jsonb_build_object(
        'tier', v_tier_upper,
        'cycle', v_cycle_upper,
        'amount', p_amount,
        'currency', p_currency,
        'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id,
        'expires_at', v_new_expires
      ),
      coalesce(v_org.created_by, (SELECT id FROM public.profiles WHERE is_platform_admin = true LIMIT 1))
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Subscription payment verified and activated successfully',
      'log_id', v_existing_log_id,
      'organization_id', p_organization_id,
      'tier', v_tier_upper,
      'plan', v_cycle_upper,
      'expires_at', v_new_expires,
      'validity_days', v_validity_days
    );

  -- Branch B: Invoice Payment
  ELSIF upper(p_payment_type) = 'INVOICE' THEN
    IF p_invoice_id IS NULL THEN
      RAISE EXCEPTION 'invoice_id is required for invoice payments';
    END IF;

    -- Update invoice to PAID
    UPDATE public.invoices
    SET 
      status = 'PAID'::public.invoice_status,
      updated_at = v_now
    WHERE id = p_invoice_id;

    -- Record in payments table
    INSERT INTO public.payments (
      invoice_id,
      amount,
      currency,
      method,
      status,
      gateway_status,
      reference,
      gateway,
      gateway_event_id,
      gateway_payload,
      recorded_by,
      recorded_at,
      verified_at
    ) VALUES (
      p_invoice_id,
      p_amount,
      p_currency,
      'ONLINE'::public.payment_method,
      'VERIFIED'::public.payment_status,
      'SUCCEEDED'::public.payment_gateway_status,
      coalesce(p_payment_reference, p_gateway_event_id),
      p_gateway,
      p_gateway_event_id,
      p_gateway_payload,
      (SELECT id FROM public.profiles WHERE is_platform_admin = true LIMIT 1),
      v_now,
      v_now
    ) RETURNING id INTO v_existing_payment_id;

    -- Insert audit event
    INSERT INTO public.audit_events ( event_type,
      entity_type,
      entity_id,
      payload
    ) VALUES (
      'INVOICE_PAYMENT_VERIFIED',
      'INVOICE',
      p_invoice_id,
      jsonb_build_object(
        'amount', p_amount,
        'currency', p_currency,
        'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id,
        'payment_id', v_existing_payment_id
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Invoice payment verified and settled successfully',
      'payment_id', v_existing_payment_id,
      'invoice_id', p_invoice_id
    );

  ELSE
    RAISE EXCEPTION 'Unsupported payment_type: %', p_payment_type;
  END IF;

END;
$function$;

REVOKE ALL ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) TO service_role;

-- resolve_settlement_exception_atomic(p_exception_id uuid, p_resolution_notes text)
CREATE OR REPLACE FUNCTION public.resolve_settlement_exception_atomic(p_exception_id uuid, p_resolution_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_exception RECORD;
BEGIN
  -- 1. Lock Exception row
  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement exception % not found', p_exception_id;
  END IF;

  -- 2. Authorization check: Buyer OWNER / MANAGER only
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_exception.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can resolve settlement exceptions (RED-21: UNAUTHORIZED_EXCEPTION_RESOLUTION)';
    END IF;
  END IF;

  -- 3. Check already resolved
  IF v_exception.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Settlement exception % is already resolved', p_exception_id;
  END IF;

  -- 4. Validate resolution note
  IF p_resolution_notes IS NULL OR length(trim(p_resolution_notes)) < 5 THEN
    RAISE EXCEPTION 'Resolution notes must be at least 5 characters long';
  END IF;

  -- 5. Update Exception record
  UPDATE public.settlement_exceptions
  SET
    status = 'RESOLVED',
    resolution_notes = trim(p_resolution_notes),
    resolved_by = v_caller_profile_id,
    resolved_at = now(),
    updated_at = now()
  WHERE id = p_exception_id;

  -- 6. Record RESOLVED Timeline Event (GAP-5C6-05)
  INSERT INTO public.settlement_exception_events (
    exception_id,
    event_type,
    from_status,
    to_status,
    notes,
    actor_id
  ) VALUES (
    p_exception_id,
    'RESOLVED',
    v_exception.status,
    'RESOLVED',
    trim(p_resolution_notes),
    v_caller_profile_id
  );

  -- 7. Update corresponding reconciliation record status
  UPDATE public.settlement_reconciliations
  SET
    status = 'RESOLVED',
    notes = 'Exception resolved: ' || trim(p_resolution_notes),
    reconciled_at = now(),
    reconciled_by = v_caller_profile_id,
    updated_at = now()
  WHERE id = v_exception.reconciliation_id;

  -- 8. Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_EXCEPTION_RESOLVED',
    'SETTLEMENT_EXCEPTION',
    p_exception_id,
    jsonb_build_object(
      'reconciliation_id', v_exception.reconciliation_id,
      'resolution_notes', p_resolution_notes,
      'resolved_by', v_caller_profile_id
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'exception_id', p_exception_id,
    'status', 'RESOLVED',
    'resolved_at', now()
  );
END;
$function$
;

-- reverse_payment_allocation_atomic(p_allocation_id uuid, p_reason text, p_idempotency_key text)
CREATE OR REPLACE FUNCTION public.reverse_payment_allocation_atomic(p_allocation_id uuid, p_reason text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_alloc RECORD;
  v_pay RECORD;
  v_inv RECORD;
  v_po RECORD;
  v_po_id uuid;
  v_org_id uuid;
  v_new_paid numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_new_status public.invoice_status;
  v_fee_tx RECORD;
  v_final_inv RECORD;
  v_final_pay RECORD;
  v_final_alloc RECORD;
BEGIN
  -- 1. Validate Input Parameters
  IF p_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Allocation ID is required (REV-5C3-INVALID-ID)';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversal reason is required (REV-5C3-INVALID-REASON)';
  END IF;

  -- 2. Lock Allocation Row Pessimistically
  SELECT * INTO v_alloc
  FROM public.payment_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment allocation % not found (REV-5C3-NOT-FOUND)', p_allocation_id;
  END IF;

  -- Check if already reversed or voided
  IF v_alloc.status IN ('REVERSED', 'VOIDED') THEN
    RAISE EXCEPTION 'Payment allocation % is already % (REV-5C3-ALREADY-REVERSED)',
      p_allocation_id, v_alloc.status;
  END IF;

  -- 3. Lock Payment Row Pessimistically
  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = v_alloc.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated payment % not found (REV-5C3-PAY-NOT-FOUND)', v_alloc.payment_id;
  END IF;

  -- 4. Lock Invoice Row Pessimistically
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = v_alloc.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated invoice % not found (REV-5C3-INV-NOT-FOUND)', v_alloc.invoice_id;
  END IF;

  -- 5. Resolve PO & Organization
  v_po_id := COALESCE(v_inv.purchase_order_id, v_pay.purchase_order_id);
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
    IF FOUND THEN
      v_org_id := v_po.organization_id;
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    SELECT po.organization_id INTO v_org_id
    FROM public.invoices inv
    JOIN public.work_orders wo ON inv.work_order_id = wo.id
    JOIN public.purchase_orders po ON wo.purchase_order_id = po.id
    WHERE inv.id = v_alloc.invoice_id;
  END IF;

  -- Authorization check (Buyer OWNER/MANAGER or Platform Admin)
  IF NOT v_is_admin THEN
    IF v_org_id IS NULL OR private.get_org_role(v_org_id) NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can reverse payment allocations (REV-5C3-UNAUTHORIZED)';
    END IF;
  END IF;

  -- Closed PO Guard (Cannot reverse on COMPLETED PO)
  IF v_po.id IS NOT NULL AND v_po.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot reverse payment allocation on a COMPLETED purchase order (REV-5C3-PO-CLOSED)';
  END IF;

  -- Balance conservation invariant checks
  IF v_inv.paid_amount < v_alloc.allocated_amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: allocation ₹% exceeds invoice paid balance ₹% (REV-5C3-INVALID-INVOICE-PAID)',
      v_alloc.allocated_amount, v_inv.paid_amount;
  END IF;

  IF (v_pay.unallocated_amount + v_alloc.allocated_amount) > v_pay.amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: resulting unallocated amount (₹%) exceeds payment total (₹%) (REV-5C3-INVALID-PAYMENT-UNALLOC)',
      (v_pay.unallocated_amount + v_alloc.allocated_amount), v_pay.amount;
  END IF;

  -- 6. Execute Reversal Updates
  -- Update Allocation
  UPDATE public.payment_allocations
  SET status = 'REVERSED',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[REVERSED: ' || p_reason || ']'
        ELSE notes || ' [REVERSED: ' || p_reason || ']'
      END,
      updated_at = now()
  WHERE id = p_allocation_id;

  -- Update Payment unallocated_amount
  UPDATE public.payments
  SET unallocated_amount = LEAST(v_pay.amount, unallocated_amount + v_alloc.allocated_amount),
      updated_at = now()
  WHERE id = v_alloc.payment_id;

  -- Update Invoice paid_amount, balance_due, and status
  v_new_paid := GREATEST(0.00, v_inv.paid_amount - v_alloc.allocated_amount);
  v_new_bal := GREATEST(0.00, v_inv.amount - v_new_paid);
  v_new_status := CASE
    WHEN v_new_paid = 0.00 THEN 'APPROVED'::public.invoice_status
    ELSE 'PARTIALLY_PAID'::public.invoice_status
  END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      balance_due = v_new_bal,
      status = v_new_status,
      updated_at = now()
  WHERE id = v_alloc.invoice_id;

  -- 7. GAP-5C6-03: Locate and Reverse linked platform fee transactions atomically
  FOR v_fee_tx IN
    SELECT * FROM public.platform_fee_transactions
    WHERE payment_allocation_id = p_allocation_id
      AND status IN ('APPLIED', 'SETTLED')
    FOR UPDATE
  LOOP
    UPDATE public.platform_fee_transactions
    SET status = 'REVERSED',
        voided_at = now(),
        updated_at = now(),
        notes = COALESCE(notes, '') || ' [AUTO_REVERSED on allocation reversal ' || p_allocation_id || ']'
    WHERE id = v_fee_tx.id;

    -- Emit PLATFORM_FEE_REVERSED audit event
    INSERT INTO public.audit_events ( event_type,
      entity_type,
      entity_id,
      payload,
      actor_id
    ) VALUES (
      'PLATFORM_FEE_REVERSED',
      'PLATFORM_FEE_TRANSACTION',
      v_fee_tx.id,
      jsonb_build_object(
        'payment_allocation_id', p_allocation_id,
        'fee_amount', v_fee_tx.fee_amount,
        'reason', 'Cascading reversal from allocation reversal ' || p_allocation_id || ': ' || p_reason
      ),
      v_caller_profile_id
    );
  END LOOP;

  -- 8. Record Allocation Reversal Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PAYMENT_ALLOCATION_REVERSED',
    'PAYMENT_ALLOCATION',
    p_allocation_id,
    jsonb_build_object(
      'payment_id', v_alloc.payment_id,
      'invoice_id', v_alloc.invoice_id,
      'purchase_order_id', v_po_id,
      'reversed_amount', v_alloc.allocated_amount,
      'reason', p_reason,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  -- 9. Fetch Final Synchronized State
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_alloc.invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_alloc.payment_id;
  SELECT * INTO v_final_alloc FROM public.payment_allocations WHERE id = p_allocation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', p_allocation_id,
    'allocation', row_to_json(v_final_alloc),
    'payment', row_to_json(v_final_pay),
    'invoice', row_to_json(v_final_inv)
  );
END;
$function$
;

-- sync_po_settlement_reconciliations_atomic(p_po_id uuid)
CREATE OR REPLACE FUNCTION public.sync_po_settlement_reconciliations_atomic(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_po RECORD;
  v_inv RECORD;
  v_synced_count integer := 0;
  v_res jsonb;
BEGIN
  -- 1. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found (SYNC-5C6-PO-NOT-FOUND)', p_po_id;
  END IF;

  -- 2. Authorization check: Buyer OWNER / MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_po.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can sync PO settlement reconciliations (SYNC-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 3. Lock associated non-rejected invoices in deterministic order
  FOR v_inv IN
    SELECT id FROM public.invoices
    WHERE purchase_order_id = p_po_id
      AND status NOT IN ('REJECTED', 'CANCELLED')
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    -- Execute settlement reconciliation atomically per invoice
    v_res := public.execute_settlement_reconciliation_atomic(
      v_po.organization_id,
      v_inv.id
    );

    IF (v_res->>'ok')::boolean = true THEN
      v_synced_count := v_synced_count + 1;
    END IF;
  END LOOP;

  -- 4. Emit Audit Event
  INSERT INTO public.audit_events ( event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_SETTLEMENT_RECONCILIATIONS_SYNCHRONIZED',
    'PURCHASE_ORDER',
    p_po_id,
    jsonb_build_object(
      'purchase_order_id', p_po_id,
      'synced_invoice_count', v_synced_count
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_order_id', p_po_id,
    'synced_count', v_synced_count
  );
END;
$function$
;

COMMIT;

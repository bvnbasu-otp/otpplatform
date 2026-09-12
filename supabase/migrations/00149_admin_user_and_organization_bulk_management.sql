-- Migration 00149: Admin Console User & Organization Management (Block/Delete/Unblock Suite)
-- Supports multi-select batch operations, reason recording, and tenant lifecycle status tracking.

BEGIN;

-- 1. Ensure status and audit columns exist on public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'blocked_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN blocked_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'blocked_reason'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN blocked_reason text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'blocked_by'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN blocked_by uuid REFERENCES public.profiles(id) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- 2. Ensure status and audit columns exist on public.organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'blocked_at'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN blocked_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'blocked_reason'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN blocked_reason text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'blocked_by'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN blocked_by uuid REFERENCES public.profiles(id) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- 3. Ensure audit columns exist on public.suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'blocked_at'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN blocked_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'blocked_reason'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN blocked_reason text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'blocked_by'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN blocked_by uuid REFERENCES public.profiles(id) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- 4. RPC: public.admin_get_users_and_organizations()
CREATE OR REPLACE FUNCTION public.admin_get_users_and_organizations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_users jsonb;
  v_orgs jsonb;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  -- 1. Fetch Users
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

  -- 2. Fetch Organizations & Suppliers
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
      (SELECT count(*)::int FROM public.organization_members WHERE organization_id = o.id) AS member_count,
      (SELECT count(*)::int FROM public.requirements WHERE organization_id = o.id AND status <> 'CANCELLED') AS active_orders_count
    FROM public.organizations o
    WHERE COALESCE(o.status, 'ACTIVE') <> 'DELETED'

    UNION ALL

    -- Suppliers
    SELECT
      s.id,
      s.business_name AS name,
      'SUPPLIER' AS entity_type,
      'SUPPLIER_ENTERPRISE' AS org_type,
      CASE
        WHEN s.status = 'SUSPENDED' OR s.status = 'BLOCKED' OR s.blocked_at IS NOT NULL THEN 'BLOCKED'
        WHEN s.status = 'PENDING' THEN 'PENDING'
        ELSE 'ACTIVE'
      END AS status,
      s.blocked_at,
      s.blocked_reason,
      s.contact_email,
      s.contact_phone,
      s.business_name AS contact_person,
      COALESCE(s.gst_verified, false) AS gst_verified,
      s.source_ref AS gstin,
      s.created_at,
      (SELECT count(*)::int FROM public.supplier_users WHERE supplier_id = s.id) AS member_count,
      (SELECT count(*)::int FROM public.purchase_orders WHERE supplier_id = s.id AND is_settled = false AND status <> 'CANCELLED') AS active_orders_count
    FROM public.suppliers s
    WHERE s.deleted_at IS NULL
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

GRANT EXECUTE ON FUNCTION public.admin_get_users_and_organizations() TO authenticated;

-- 5. RPC: public.admin_bulk_block_users()
CREATE OR REPLACE FUNCTION public.admin_bulk_block_users(
  p_user_ids uuid[],
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_trimmed_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Administrative block / policy enforcement');
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  -- Protect Super Admin accounts from accidental suspension
  UPDATE public.profiles
  SET status = 'BLOCKED',
      blocked_at = now(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = now()
  WHERE id = ANY(p_user_ids)
    AND COALESCE(is_platform_admin, false) = false
    AND email NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Also suspend linked suppliers
  UPDATE public.suppliers
  SET status = 'SUSPENDED',
      blocked_at = now(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = now()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(p_user_ids)
  );

  -- Insert audit trail event
  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_block_users',
    'profile',
    p_user_ids[1],
    jsonb_build_object(
      'targetUserIds', p_user_ids,
      'affectedCount', v_count,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully blocked %s user account(s).', v_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_block_users(uuid[], text) TO authenticated;

-- 6. RPC: public.admin_bulk_unblock_users()
CREATE OR REPLACE FUNCTION public.admin_bulk_unblock_users(
  p_user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  UPDATE public.profiles
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      updated_at = now()
  WHERE id = ANY(p_user_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Also unblock linked suppliers
  UPDATE public.suppliers
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      updated_at = now()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(p_user_ids)
  );

  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_unblock_users',
    'profile',
    p_user_ids[1],
    jsonb_build_object(
      'targetUserIds', p_user_ids,
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

GRANT EXECUTE ON FUNCTION public.admin_bulk_unblock_users(uuid[]) TO authenticated;

-- 7. RPC: public.admin_bulk_delete_users()
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(
  p_user_ids uuid[],
  p_soft_delete boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  IF p_soft_delete IS TRUE THEN
    -- Soft-delete: mark as DELETED and retain audit history
    UPDATE public.profiles
    SET status = 'DELETED',
        deleted_at = now(),
        updated_at = now()
    WHERE id = ANY(p_user_ids)
      AND COALESCE(is_platform_admin, false) = false
      AND email NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');

    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Hard-delete: remove linked auth user and profile
    DELETE FROM public.profiles
    WHERE id = ANY(p_user_ids)
      AND COALESCE(is_platform_admin, false) = false
      AND email NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_delete_users',
    'profile',
    p_user_ids[1],
    jsonb_build_object(
      'targetUserIds', p_user_ids,
      'affectedCount', v_count,
      'softDelete', p_soft_delete
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully deleted %s user account(s).', v_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean) TO authenticated;

-- 8. RPC: public.admin_bulk_block_organizations()
CREATE OR REPLACE FUNCTION public.admin_bulk_block_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_trimmed_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Administrative block / policy enforcement');
BEGIN
  IF NOT private.is_platform_admin() THEN
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

    -- Cascade block to all users of this supplier
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
    AND email NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');
  ELSE
    UPDATE public.organizations
    SET status = 'BLOCKED',
        blocked_at = now(),
        blocked_reason = v_trimmed_reason,
        blocked_by = v_admin_id,
        updated_at = now()
    WHERE id = ANY(p_org_ids);

    -- Cascade block to all members of this organization
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
    AND email NOT IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_block_organizations',
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1],
    jsonb_build_object(
      'targetOrgIds', p_org_ids,
      'isSupplier', p_is_supplier,
      'affectedCount', v_count,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully blocked %s organization(s).', v_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_block_organizations(uuid[], boolean, text) TO authenticated;

-- 9. RPC: public.admin_bulk_unblock_organizations()
CREATE OR REPLACE FUNCTION public.admin_bulk_unblock_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
BEGIN
  IF NOT private.is_platform_admin() THEN
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

    -- Cascade unblock to users of this supplier
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

    -- Cascade unblock to members of this organization
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
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_unblock_organizations',
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1],
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

GRANT EXECUTE ON FUNCTION public.admin_bulk_unblock_organizations(uuid[], boolean) TO authenticated;

-- 10. RPC: public.admin_bulk_delete_organizations()
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_organizations(
  p_org_ids uuid[],
  p_is_supplier boolean,
  p_soft_delete boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_org_ids IS NULL OR array_length(p_org_ids, 1) IS NULL OR array_length(p_org_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No organization IDs specified');
  END IF;

  IF p_is_supplier IS TRUE THEN
    UPDATE public.suppliers
    SET status = 'SUSPENDED',
        deleted_at = now(),
        updated_at = now()
    WHERE id = ANY(p_org_ids);
  ELSE
    UPDATE public.organizations
    SET status = 'DELETED',
        deleted_at = now(),
        updated_at = now()
    WHERE id = ANY(p_org_ids);
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_admin_id,
    'ADMIN',
    'admin.bulk_delete_organizations',
    CASE WHEN p_is_supplier THEN 'supplier' ELSE 'organization' END,
    p_org_ids[1],
    jsonb_build_object(
      'targetOrgIds', p_org_ids,
      'isSupplier', p_is_supplier,
      'affectedCount', v_count,
      'softDelete', p_soft_delete
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully deleted %s organization(s).', v_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_organizations(uuid[], boolean, boolean) TO authenticated;

-- 11. Update my_role_context() to include isBlocked, blockedReason and account status
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
  v_org_role text := NULL;
  v_org_id uuid := NULL;
  v_org_name text := NULL;
  v_org_type text := NULL;
  v_organizations jsonb;
  v_email text;
  v_full_name text;
  v_title text;
  v_avatar_url text;
  v_phone text;
  v_status text := 'ACTIVE';
  v_blocked_at timestamptz := NULL;
  v_blocked_reason text := NULL;
  v_is_blocked boolean := false;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT email, is_platform_admin, active_role_code, active_organization_id, full_name, title, avatar_url, phone,
         COALESCE(status, 'ACTIVE'), blocked_at, blocked_reason
  INTO v_email, v_admin, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone,
       v_status, v_blocked_at, v_blocked_reason
  FROM profiles WHERE id = v_profile;

  -- Also check if user belongs to a suspended supplier
  IF v_status <> 'BLOCKED' AND v_status <> 'DELETED' THEN
    IF EXISTS (
      SELECT 1 FROM public.supplier_users su
      JOIN public.suppliers s ON s.id = su.supplier_id
      WHERE su.profile_id = v_profile AND (s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL)
    ) THEN
      v_status := 'BLOCKED';
      v_is_blocked := true;
      IF v_blocked_reason IS NULL THEN
        SELECT blocked_reason INTO v_blocked_reason
        FROM public.suppliers s
        JOIN public.supplier_users su ON su.supplier_id = s.id
        WHERE su.profile_id = v_profile
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_status = 'BLOCKED' OR v_status = 'SUSPENDED' OR v_status = 'DELETED' OR v_blocked_at IS NOT NULL THEN
    v_is_blocked := true;
  END IF;

  -- Enforce platform admin for designated superadmin emails
  IF v_admin IS NOT TRUE AND v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    v_admin := true;
  END IF;

  -- Isolated SuperAdmin Context
  IF v_admin IS TRUE THEN
    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', NULL,
      'isPlatformAdmin', true,
      'needsOnboarding', false,
      'activeRole', NULL,
      'roles', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, 'Platform Super Administrator'),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', COALESCE(v_phone, '+91 99729 67530'),
      'isBlocked', false,
      'status', 'ACTIVE'
    );
  END IF;

  v_side := private.profile_side(v_profile);

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
    'isPersonal', (o.org_type::text = 'INDIVIDUAL'),
    'status', COALESCE(o.status, 'ACTIVE')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile;

  -- Select active organization
  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  -- Fallback to first organization if active_organization_id is not set
  IF v_org_id IS NULL AND v_side = 'BUYER' THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'needsOnboarding', (v_active IS NULL OR (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL)),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', code,
        'label', label,
        'side', side,
        'description', description,
        'permissions', to_jsonb(permissions)
      )
      FROM user_roles
      WHERE code = v_active
    ),
    'roles', v_roles,
    'organizations', v_organizations,
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', (
      SELECT count(*)::int
      FROM committee_assignments
      WHERE profile_id = v_profile
    ),
    'supplierId', (
      SELECT supplier_id
      FROM supplier_users
      WHERE profile_id = v_profile
      LIMIT 1
    ),
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'blockedReason', v_blocked_reason,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, anon, service_role;

COMMIT;

-- Migration 00162: User Online Presence & Heartbeat Tracking for Super Admin Console
-- Adds real-time presence indicators (🟢 Online <2m, 🟡 Recently Active <=30m, ⚪ Offline)
-- across Super Admin user management for Buyers, Suppliers, and Organizations.

BEGIN;

-- 1. Ensure last_seen_at column exists on public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Index for high-performance presence lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles (last_seen_at DESC NULLS LAST);

-- 3. RPC: public.update_user_heartbeat()
-- Lightweight, debounced presence heartbeat endpoint
CREATE OR REPLACE FUNCTION public.update_user_heartbeat()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthenticated');
  END IF;

  UPDATE public.profiles
  SET last_seen_at = v_now
  WHERE auth_user_id = v_user_id OR id = v_user_id
  RETURNING id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'last_seen_at', v_now,
    'profile_id', v_profile_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_heartbeat() TO authenticated, anon;

-- 4. Update public.admin_get_users_and_organizations() to include last_seen_at
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

  -- 1. Fetch Users with last_seen_at
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
      COALESCE(s.contact_person, s.legal_name, s.business_name) AS contact_person,
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
    WHERE COALESCE(s.status, 'ACTIVE') <> 'DELETED'
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

COMMIT;

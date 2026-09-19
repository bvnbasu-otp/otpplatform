-- Migration 00187: Dual Persona Portal Switching & Context Synchronization
-- Enables seamless switching between Buyer and Supplier portal personas/profiles.
-- Adds active_portal_side to public.profiles, creates switch_portal_side() RPC,
-- and updates private.profile_side() and public.my_role_context().

BEGIN;

-- 1. Add active_portal_side column to profiles if not exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_portal_side public.signup_side DEFAULT NULL;

-- 2. Update private.profile_side to honor active_portal_side
CREATE OR REPLACE FUNCTION private.profile_side(p_profile_id uuid DEFAULT NULL)
RETURNS signup_side
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := COALESCE(p_profile_id, private.get_profile_id());
  v_is_admin boolean;
  v_email text;
  v_auth_uid uuid;
  v_active_side signup_side;
BEGIN
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_platform_admin, email, auth_user_id, active_portal_side
  INTO v_is_admin, v_email, v_auth_uid, v_active_side
  FROM profiles WHERE id = v_profile;

  -- Platform Admin & SuperAdmin accounts are strictly isolated from Buyer and Supplier sides
  IF v_is_admin IS TRUE OR v_email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'ops@otp.test') THEN
    RETURN NULL;
  END IF;

  -- If user explicitly switched portal persona, honor it
  IF v_active_side IS NOT NULL THEN
    RETURN v_active_side;
  END IF;

  -- 1. Check direct supplier_users linking (by profile id or auth user id)
  IF EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.profile_id = v_profile
       OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 2. Check suppliers table by contact_email
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE lower(s.contact_email) = lower(v_email)
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 3. Check active_role_code or profile_roles
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_profile AND (
      p.active_role_code IN ('SUPPLIER_FOUNDER', 'SUPPLIER_BID_MANAGER', 'SUPPLIER_STAFF', 'SUPPLIER')
      OR p.active_role_code LIKE 'SUPPLIER%'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.profile_roles pr
    JOIN public.user_roles ur ON ur.code = pr.role_code
    WHERE pr.profile_id = v_profile AND ur.side = 'SUPPLIER'
  ) THEN
    RETURN 'SUPPLIER'::signup_side;
  END IF;

  -- 4. Check organization members for buyer
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.profile_id = v_profile
       OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
  ) THEN
    RETURN 'BUYER'::signup_side;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION private.profile_side(uuid) TO authenticated, service_role, anon;

-- 2b. Create public.ensure_buyer_organization RPC (idempotent auto-provisioning for any authenticated buyer)
CREATE OR REPLACE FUNCTION public.ensure_buyer_organization()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_auth_uid uuid := auth.uid();
  v_org_id uuid;
  v_org_name text;
  v_org_type text;
  v_role text;
  v_full_name text;
  v_buyer_role text;
BEGIN
  IF v_profile IS NULL THEN
    IF v_auth_uid IS NOT NULL THEN
      SELECT id, full_name INTO v_profile, v_full_name
      FROM public.profiles
      WHERE auth_user_id = v_auth_uid;

      IF v_profile IS NULL THEN
        INSERT INTO public.profiles (auth_user_id, email, full_name)
        SELECT id, COALESCE(email, 'user@otp.local'), COALESCE(raw_user_meta_data->>'full_name', 'User')
        FROM auth.users WHERE id = v_auth_uid
        RETURNING id, full_name INTO v_profile, v_full_name;
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
    END IF;
  ELSE
    SELECT full_name INTO v_full_name FROM public.profiles WHERE id = v_profile;
  END IF;

  -- 1. Check existing organization membership
  SELECT om.organization_id, o.name, o.org_type::text, om.role::text
  INTO v_org_id, v_org_name, v_org_type, v_role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
  ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
  LIMIT 1;

  -- 2. If missing, auto-provision personal Self buyer organization
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)
    VALUES (COALESCE(NULLIF(btrim(v_full_name), ''), 'Self'), 'INDIVIDUAL', 'ACTIVE', 1, 0)
    RETURNING id, name, org_type::text INTO v_org_id, v_org_name, v_org_type;

    v_role := 'OWNER';

    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (v_org_id, v_profile, 'OWNER')
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET active_organization_id = v_org_id,
        active_portal_side = COALESCE(active_portal_side, 'BUYER'),
        updated_at = now()
    WHERE id = v_profile;
  END IF;

  -- 3. Ensure buyer role exists
  SELECT pr.role_code INTO v_buyer_role
  FROM public.profile_roles pr
  JOIN public.user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile AND ur.side = 'BUYER'
  LIMIT 1;

  IF v_buyer_role IS NULL THEN
    v_buyer_role := 'PROPERTY_OWNER';
    INSERT INTO public.profile_roles (profile_id, role_code)
    VALUES (v_profile, v_buyer_role)
    ON CONFLICT (profile_id, role_code) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'orgType', v_org_type,
    'role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_buyer_organization() TO authenticated, service_role;

-- 3. Create public.switch_portal_side RPC
CREATE OR REPLACE FUNCTION public.switch_portal_side(p_side public.signup_side)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_email text;
  v_full_name text;
  v_auth_uid uuid;
  v_active_org_id uuid;
  v_supplier_id uuid;
  v_org_id uuid;
  v_buyer_role text;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF p_side IS NULL OR p_side NOT IN ('BUYER', 'SUPPLIER') THEN
    RAISE EXCEPTION 'Invalid portal side: must be BUYER or SUPPLIER';
  END IF;

  SELECT email, full_name, auth_user_id, active_organization_id
  INTO v_email, v_full_name, v_auth_uid, v_active_org_id
  FROM public.profiles
  WHERE id = v_profile;

  IF p_side = 'SUPPLIER' THEN
    -- 1. Resolve or auto-provision Supplier record
    SELECT su.supplier_id INTO v_supplier_id
    FROM public.supplier_users su
    WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
    LIMIT 1;

    IF v_supplier_id IS NULL AND v_email IS NOT NULL THEN
      SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1;
    END IF;

    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (
        business_name,
        contact_email,
        source,
        status
      ) VALUES (
        COALESCE(NULLIF(btrim(v_full_name), ''), 'My Supplier Business') || ' (Supplier)',
        v_email,
        'DIRECT',
        'ACTIVE'
      ) RETURNING id INTO v_supplier_id;

      INSERT INTO public.supplier_users (
        supplier_id,
        profile_id,
        role
      ) VALUES (
        v_supplier_id,
        v_profile,
        'OWNER'
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- 2. Ensure supplier role exists in profile_roles
    INSERT INTO public.profile_roles (profile_id, role_code)
    VALUES (v_profile, 'SUPPLIER_FOUNDER')
    ON CONFLICT (profile_id, role_code) DO NOTHING;

    -- 3. Update profile active portal side and active role
    UPDATE public.profiles
    SET active_portal_side = 'SUPPLIER',
        active_role_code = 'SUPPLIER_FOUNDER',
        updated_at = now()
    WHERE id = v_profile;

  ELSIF p_side = 'BUYER' THEN
    -- 1. Resolve or auto-provision Buyer organization
    SELECT om.organization_id INTO v_org_id
    FROM public.organization_members om
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    LIMIT 1;

    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (
        name,
        org_type,
        status
      ) VALUES (
        'Self',
        'INDIVIDUAL',
        'ACTIVE'
      ) RETURNING id INTO v_org_id;

      INSERT INTO public.organization_members (
        organization_id,
        profile_id,
        role
      ) VALUES (
        v_org_id,
        v_profile,
        'OWNER'
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- 2. Resolve or assign buyer role
    SELECT pr.role_code INTO v_buyer_role
    FROM public.profile_roles pr
    JOIN public.user_roles ur ON ur.code = pr.role_code
    WHERE pr.profile_id = v_profile AND ur.side = 'BUYER'
    ORDER BY ur.sort_order
    LIMIT 1;

    IF v_buyer_role IS NULL THEN
      v_buyer_role := 'PROPERTY_OWNER';
      INSERT INTO public.profile_roles (profile_id, role_code)
      VALUES (v_profile, v_buyer_role)
      ON CONFLICT (profile_id, role_code) DO NOTHING;
    END IF;

    -- 3. Update profile active portal side, active role, and active organization
    UPDATE public.profiles
    SET active_portal_side = 'BUYER',
        active_role_code = v_buyer_role,
        active_organization_id = COALESCE(v_active_org_id, v_org_id),
        updated_at = now()
    WHERE id = v_profile;
  END IF;

  -- 4. Record audit event
  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('profile.portal_side_switched', v_profile, 'profile', v_profile::text,
          jsonb_build_object('side', p_side));

  -- 5. Return updated role context
  RETURN public.my_role_context();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_portal_side(public.signup_side) TO authenticated, service_role;

-- 4. Update public.my_role_context to filter roles by active v_side
CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
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
  v_auth_uid uuid;
  v_supplier_id uuid := NULL;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  SELECT email, is_platform_admin, active_role_code, active_organization_id, full_name, title, avatar_url, phone,
         COALESCE(status, 'ACTIVE'), blocked_at, blocked_reason, auth_user_id
  INTO v_email, v_admin, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone,
       v_status, v_blocked_at, v_blocked_reason, v_auth_uid
  FROM profiles WHERE id = v_profile;

  -- Check if user belongs to a suspended supplier
  IF v_status <> 'BLOCKED' AND v_status <> 'DELETED' THEN
    IF EXISTS (
      SELECT 1 FROM public.supplier_users su
      JOIN public.suppliers s ON s.id = su.supplier_id
      WHERE (su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid))
        AND (s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL)
    ) THEN
      v_status := 'BLOCKED';
      v_is_blocked := true;
      IF v_blocked_reason IS NULL THEN
        SELECT blocked_reason INTO v_blocked_reason
        FROM public.suppliers s
        JOIN public.supplier_users su ON su.supplier_id = s.id
        WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
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

  -- Fetch roles matching the active side for this profile
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
  WHERE pr.profile_id = v_profile
    AND (v_side IS NULL OR ur.side = v_side);

  -- Fallback default role for suppliers if profile_roles is not yet populated
  IF v_side = 'SUPPLIER' AND (v_roles IS NULL OR jsonb_array_length(v_roles) = 0) THEN
    v_active := COALESCE(v_active, 'SUPPLIER_FOUNDER');
    v_roles := jsonb_build_array(jsonb_build_object(
      'code', 'SUPPLIER_FOUNDER',
      'label', 'Supplier Founder / Owner',
      'side', 'SUPPLIER',
      'description', 'Full commercial authority for quoting, contracts, and work order delivery.',
      'permissions', '["READ", "WRITE", "PROPOSE", "APPROVE", "AWARD"]'::jsonb,
      'assignedByAdmin', false
    ));
  END IF;

  IF v_active IS NULL AND jsonb_array_length(v_roles) > 0 THEN
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
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid);

  -- Select active organization
  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE (om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid))
      AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  -- Fallback to first organization if active_organization_id is not set and user is BUYER
  IF v_org_id IS NULL AND (v_side = 'BUYER' OR v_side IS NULL) THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;

    -- If no organization exists at all for this user, auto-provision personal Self organization immediately!
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)
      VALUES (COALESCE(NULLIF(btrim(v_full_name), ''), 'Self'), 'INDIVIDUAL', 'ACTIVE', 1, 0)
      RETURNING id, name, org_type::text INTO v_org_id, v_org_name, v_org_type;

      v_org_role := 'OWNER';

      INSERT INTO public.organization_members (organization_id, profile_id, role)
      VALUES (v_org_id, v_profile, 'OWNER')
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles
      SET active_organization_id = v_org_id,
          active_portal_side = COALESCE(active_portal_side, 'BUYER'),
          updated_at = now()
      WHERE id = v_profile;

      v_organizations := jsonb_build_array(jsonb_build_object(
        'id', v_org_id,
        'name', v_org_name,
        'orgType', v_org_type,
        'role', v_org_role,
        'isPersonal', true,
        'status', 'ACTIVE'
      ));
    END IF;
  END IF;

  -- Resolve Supplier ID
  SELECT COALESCE(
    (
      SELECT su.supplier_id
      FROM public.supplier_users su
      WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
      LIMIT 1
    ),
    (
      SELECT s.id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1
    )
  ) INTO v_supplier_id;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'needsOnboarding', (
      CASE
        WHEN v_side = 'SUPPLIER' THEN false
        WHEN v_active IS NULL OR (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL) THEN true
        ELSE false
      END
    ),
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
      SELECT count(DISTINCT r.id)::int
      FROM rfqs r
      WHERE r.status IN ('EVALUATING', 'CLOSED')
        AND (v_org_id IS NULL OR r.organization_id = v_org_id)
    ),
    'supplierId', v_supplier_id,
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

-- 8. Record migration in otp_schema_migrations if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'otp_schema_migrations') THEN
    INSERT INTO public.otp_schema_migrations (version, applied_at)
    VALUES ('00187_dual_persona_portal_switching.sql', now())
    ON CONFLICT (version) DO UPDATE SET applied_at = now();
  END IF;
END $$;

COMMIT;

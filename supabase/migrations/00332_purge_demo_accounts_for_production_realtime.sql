-- Migration 00332: Purge Legacy Demo Seed Accounts for Production Realtime
-- Configures bvnbasu@gmail.com and bvnbasu@yahoo.com as canonical Platform Founders & Super Administrators.
-- Both accounts are protected by database invariant triggers (private_security.guard_founder_superadmin_internal_role).
-- Aligns authoritative internal console roles (Super Admin, General Support, Operations, Sales & Marketing, Legal & Privacy, Auditor).
-- All other synthetic demo accounts, organizations, and fixtures are safely purged with full PK/FK cascade cleanup.

BEGIN;

SET LOCAL search_path = public, private, auth, extensions, private_security;

-- Enable administrative maintenance context for the transaction
SET LOCAL "otp.platform_break_glass" = 'on';
SET LOCAL "otp.platform_bootstrap" = 'on';

-- ---------------------------------------------------------------------------
-- 1. Extend founder invariant guards to recognize both bvnbasu accounts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private_security.founder_profile_protected(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.is_founder IS TRUE
      AND lower(p.email) IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
  );
$fn$;

CREATE OR REPLACE FUNCTION private_security.guard_founder_superadmin_active_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_code text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF private_security.founder_profile_protected(OLD.id) THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'founder profile and Auth identity cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_ARGV[0] = 'id' THEN
    IF (NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id)
       AND (
         private_security.founder_profile_protected(OLD.id)
         OR private_security.founder_profile_protected(NEW.id)
       ) THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'founder profile or Auth identity cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_ARGV[0] = 'marker' THEN
    IF private_security.founder_profile_protected(OLD.id)
       AND (
         NEW.is_founder IS DISTINCT FROM TRUE
         OR lower(NEW.email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
       ) THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'canonical founder claim and reserved founder email cannot be changed';
    END IF;
    IF NOT private_security.founder_profile_protected(OLD.id)
       AND NEW.is_founder IS TRUE
       AND lower(NEW.email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com') THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'canonical founder marker cannot be retargeted';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT private_security.founder_profile_protected(NEW.id)
     AND NOT private_security.founder_profile_protected(OLD.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'founder profile id cannot be changed';
  END IF;

  v_code := NEW.active_role_code;
  IF v_code IS NULL OR btrim(v_code) = '' THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'founder active role cannot be null or blank';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.internal_user_assignments ua
    JOIN public.internal_roles ir ON ir.id = ua.role_id
    WHERE ua.profile_id = NEW.id
      AND ir.code = v_code
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.internal_roles ir
      WHERE ir.code = v_code
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.code = v_code
        AND ur.is_active
    ) THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'founder active role is not a held internal role';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    JOIN public.user_roles ur
      ON ur.code = pr.role_code
     AND ur.is_active
    WHERE pr.profile_id = NEW.id
      AND pr.role_code = v_code
  ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'founder active role is not a held profile role';
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Add bvnbasu@yahoo.com to immutable admin whitelist
-- ---------------------------------------------------------------------------
INSERT INTO private_security.admin_whitelist (email, reason)
VALUES ('bvnbasu@yahoo.com', 'Platform Founder & Super Administrator (Baskar Loganathan)')
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Ensure authoritative internal role catalog is complete
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order)
VALUES
  ('SUPER_ADMIN', 'CONSOLE', 'Super Administrator', 'Full system and operator governance', ARRAY['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD']::role_permission[], 10),
  ('GENERAL_SUPPORT', 'CONSOLE', 'General Support Specialist', 'Customer support, troubleshooting & dispute intake', ARRAY['READ', 'WRITE']::role_permission[], 20),
  ('OPERATIONS', 'CONSOLE', 'Platform Operations & Security', 'SysOps, SecOps, DBOps, health, regression testing & announcements', ARRAY['READ', 'WRITE', 'APPROVE']::role_permission[], 30),
  ('SALES_MARKETING', 'CONSOLE', 'Sales, Marketing & Taxonomy Engine', 'SNE pre-warm, taxonomy management, onboarding pipeline & referrals', ARRAY['READ', 'WRITE']::role_permission[], 40),
  ('LEGAL_PRIVACY', 'CONSOLE', 'Legal, Privacy & Compliance Officer', 'Regulatory compliance, immutable audit vault & dispute arbitration', ARRAY['READ', 'WRITE']::role_permission[], 50),
  ('AUDITOR', 'CONSOLE', 'Independent Platform Auditor', 'Read-only oversight across all platform operations with masked sensitive data', ARRAY['READ']::role_permission[], 60)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    side = EXCLUDED.side;

INSERT INTO public.internal_roles (code, name, description, is_system)
VALUES 
  ('SUPER_ADMIN', 'Super Administrator', 'Full system and operator governance', true),
  ('GENERAL_SUPPORT', 'General Support Specialist', 'Customer support, troubleshooting & dispute intake', true),
  ('OPERATIONS', 'Platform Operations & Security', 'SysOps, SecOps, DBOps, health, regression testing & announcements', true),
  ('SALES_MARKETING', 'Sales, Marketing & Taxonomy Engine', 'SNE pre-warm, taxonomy management, onboarding pipeline & referrals', true),
  ('LEGAL_PRIVACY', 'Legal, Privacy & Compliance Officer', 'Regulatory compliance, immutable audit vault & dispute arbitration', true),
  ('AUDITOR', 'Independent Platform Auditor', 'Read-only oversight across all platform operations with masked sensitive data', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 4. Elevate & Synchronize bvnbasu@yahoo.com
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_yahoo_auth_id uuid;
  v_yahoo_profile_id uuid;
  v_superadmin_role_id uuid;
  v_encrypted_password text := extensions.crypt('Admin@otp2026!', extensions.gen_salt('bf'));
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
  v_demo_supplier_ids uuid[];
  v_demo_org_ids uuid[];
  v_demo_rfq_ids uuid[];
  v_demo_po_ids uuid[];
BEGIN
  -- A. Fetch or initialize auth user for bvnbasu@yahoo.com
  SELECT id INTO v_yahoo_auth_id FROM auth.users WHERE lower(email) = 'bvnbasu@yahoo.com';

  IF v_yahoo_auth_id IS NULL THEN
    v_yahoo_auth_id := 'ee3dedee-0c2a-4254-b2af-342b41d56386'::uuid;
    INSERT INTO auth.users (
      id, instance_id, email, phone, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_yahoo_auth_id, '00000000-0000-0000-0000-000000000000',
      'bvnbasu@yahoo.com', '+919840000001', v_encrypted_password, now(),
      now(), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Baskar Loganathan", "phone": "+919840000001"}'::jsonb,
      true, 'authenticated', 'authenticated'
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) VALUES (
      v_yahoo_auth_id::text, v_yahoo_auth_id,
      jsonb_build_object('sub', v_yahoo_auth_id::text, 'email', 'bvnbasu@yahoo.com'),
      'email', now(), now(), now(), gen_random_uuid()
    ) ON CONFLICT (provider_id, provider) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_password,
        phone = '+919840000001',
        raw_user_meta_data = '{"full_name": "Baskar Loganathan", "phone": "+919840000001"}'::jsonb,
        is_super_admin = true,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_yahoo_auth_id;
  END IF;

  -- B. Fetch or initialize profile for bvnbasu@yahoo.com
  SELECT id INTO v_yahoo_profile_id FROM public.profiles WHERE lower(email) = 'bvnbasu@yahoo.com';

  IF v_yahoo_profile_id IS NULL THEN
    v_yahoo_profile_id := 'ee3dedee-0c2a-4254-b2af-342b41d56387'::uuid;
    INSERT INTO public.profiles (
      id, auth_user_id, email, full_name, is_founder, is_platform_admin,
      active_role_code, status, is_demo, created_at, updated_at
    ) VALUES (
      v_yahoo_profile_id, v_yahoo_auth_id, 'bvnbasu@yahoo.com', 'Baskar Loganathan',
      true, true, 'SUPER_ADMIN', 'ACTIVE', false, now(), now()
    );
  ELSE
    UPDATE public.profiles
    SET full_name = 'Baskar Loganathan',
        auth_user_id = v_yahoo_auth_id,
        is_demo = false,
        is_founder = true,
        is_platform_admin = true,
        active_role_code = 'SUPER_ADMIN',
        status = 'ACTIVE',
        deleted_at = NULL,
        updated_at = now()
    WHERE id = v_yahoo_profile_id;
  END IF;

  -- C. Ensure SUPER_ADMIN in profile_roles
  INSERT INTO public.profile_roles (profile_id, role_code, is_demo)
  VALUES (v_yahoo_profile_id, 'SUPER_ADMIN', false)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  -- D. Ensure SUPER_ADMIN in internal_user_assignments
  SELECT id INTO v_superadmin_role_id FROM public.internal_roles WHERE code = 'SUPER_ADMIN';
  IF v_superadmin_role_id IS NOT NULL THEN
    INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_at)
    VALUES (v_yahoo_profile_id, v_superadmin_role_id, now())
    ON CONFLICT (profile_id, role_id) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. Identify all demo profiles and auth accounts targeted for purge
  -- -------------------------------------------------------------------------
  SELECT array_agg(id), array_agg(auth_user_id)
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
    AND (
      is_demo IS TRUE
      OR lower(email) LIKE '%@otp.test'
      OR lower(email) LIKE '%@sunrise.test'
      OR lower(email) LIKE '%@tanish.test'
      OR lower(email) LIKE '%@kongu.test'
      OR lower(email) LIKE '%@apex.test'
      OR lower(email) LIKE '%@otpdemo.test'
      OR lower(email) LIKE '%@greenview.test'
      OR lower(email) LIKE 'admin@otp.%'
      OR lower(email) LIKE 'ops@otp.%'
      OR lower(email) LIKE 'qa-%@%'
      OR lower(email) LIKE 'test%@%'
    );

  -- Identify demo suppliers
  SELECT array_agg(id) INTO v_demo_supplier_ids
  FROM public.suppliers
  WHERE is_demo IS TRUE
     OR lower(contact_email) LIKE '%@otpdemo.test'
     OR lower(contact_email) LIKE '%@otp.test';

  -- Identify demo organizations (excluding Greenview Heights RWA)
  SELECT array_agg(id) INTO v_demo_org_ids
  FROM public.organizations
  WHERE (is_demo IS TRUE OR id IN (
    '0da00000-0000-4000-8000-000000000001'::uuid,
    '33333333-0000-4000-8000-000000000001'::uuid,
    '33333333-0000-4000-8000-000000000002'::uuid,
    '33333333-0000-4000-8000-000000000003'::uuid,
    '33333333-0000-4000-8000-000000000004'::uuid,
    '33333333-0000-4000-8000-000000000005'::uuid
  ))
  AND id <> '11111111-1111-4000-8000-000000000001'::uuid;

  -- -------------------------------------------------------------------------
  -- 6. Cascade delete transactional records associated with demo targets
  -- -------------------------------------------------------------------------
  SELECT array_agg(id) INTO v_demo_rfq_ids
  FROM public.rfqs
  WHERE is_demo IS TRUE
     OR organization_id = ANY(v_demo_org_ids)
     OR created_by = ANY(v_target_profile_ids)
     OR owner_profile_id = ANY(v_target_profile_ids);

  SELECT array_agg(id) INTO v_demo_po_ids
  FROM public.purchase_orders
  WHERE is_demo IS TRUE
     OR rfq_id = ANY(v_demo_rfq_ids)
     OR organization_id = ANY(v_demo_org_ids)
     OR supplier_id = ANY(v_demo_supplier_ids);

  DELETE FROM public.payments WHERE is_demo IS TRUE OR purchase_order_id = ANY(v_demo_po_ids);
  DELETE FROM public.invoices WHERE is_demo IS TRUE OR purchase_order_id = ANY(v_demo_po_ids);
  DELETE FROM public.work_orders WHERE is_demo IS TRUE OR purchase_order_id = ANY(v_demo_po_ids);
  DELETE FROM public.purchase_orders WHERE is_demo IS TRUE OR id = ANY(v_demo_po_ids);

  DELETE FROM public.quotes
  WHERE is_demo IS TRUE
     OR rfq_id = ANY(v_demo_rfq_ids)
     OR supplier_id = ANY(v_demo_supplier_ids);

  DELETE FROM public.rfq_clarification_messages WHERE author_profile_id = ANY(v_target_profile_ids) OR rfq_id = ANY(v_demo_rfq_ids);
  DELETE FROM public.rfq_approval_stages WHERE approver_profile_id = ANY(v_target_profile_ids) OR delegator_profile_id = ANY(v_target_profile_ids) OR rfq_id = ANY(v_demo_rfq_ids);
  DELETE FROM public.committee_votes WHERE profile_id = ANY(v_target_profile_ids) OR rfq_id = ANY(v_demo_rfq_ids);
  DELETE FROM public.committee_assignments WHERE profile_id = ANY(v_target_profile_ids) OR rfq_id = ANY(v_demo_rfq_ids);
  DELETE FROM public.conflict_of_interest_declarations WHERE profile_id = ANY(v_target_profile_ids) OR rfq_id = ANY(v_demo_rfq_ids);

  DELETE FROM public.rfqs WHERE id = ANY(v_demo_rfq_ids);
  DELETE FROM public.requirements
  WHERE is_demo IS TRUE
     OR organization_id = ANY(v_demo_org_ids)
     OR created_by = ANY(v_target_profile_ids)
     OR owner_profile_id = ANY(v_target_profile_ids);

  -- -------------------------------------------------------------------------
  -- 7. Delete demo supplier bindings and supplier records
  -- -------------------------------------------------------------------------
  DELETE FROM public.supplier_users
  WHERE supplier_id = ANY(v_demo_supplier_ids)
     OR profile_id = ANY(v_target_profile_ids);

  DELETE FROM public.suppliers
  WHERE id = ANY(v_demo_supplier_ids);

  -- -------------------------------------------------------------------------
  -- 8. Delete demo organization memberships and organizations
  -- -------------------------------------------------------------------------
  DELETE FROM public.organization_members
  WHERE organization_id = ANY(v_demo_org_ids)
     OR profile_id = ANY(v_target_profile_ids);

  DELETE FROM public.organizations
  WHERE id = ANY(v_demo_org_ids);

  -- -------------------------------------------------------------------------
  -- 9. Delete profile child tables
  -- -------------------------------------------------------------------------
  DELETE FROM public.notification_preferences WHERE user_id = ANY(v_target_auth_ids);
  DELETE FROM public.notifications WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM public.support_tickets WHERE opened_by = ANY(v_target_profile_ids) OR assigned_to = ANY(v_target_profile_ids);
  DELETE FROM public.profile_verification_otps WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM public.internal_user_assignments WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM public.profile_roles WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM public.legal_acceptances WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM public.demo_accounts WHERE profile_id = ANY(v_target_profile_ids);
  DELETE FROM private.password_history WHERE profile_id = ANY(v_target_profile_ids);

  -- -------------------------------------------------------------------------
  -- 10. Delete profiles and auth identities / users
  -- -------------------------------------------------------------------------
  DELETE FROM public.profiles WHERE id = ANY(v_target_profile_ids);

  DELETE FROM auth.identities WHERE user_id = ANY(v_target_auth_ids);
  DELETE FROM auth.sessions WHERE user_id = ANY(v_target_auth_ids);
  DELETE FROM auth.users WHERE id = ANY(v_target_auth_ids);

  DELETE FROM auth.users
  WHERE lower(email) NOT IN ('bvnbasu@gmail.com', 'bvnbasu@yahoo.com')
    AND (
      lower(email) LIKE '%@otp.test'
      OR lower(email) LIKE '%@sunrise.test'
      OR lower(email) LIKE '%@tanish.test'
      OR lower(email) LIKE '%@kongu.test'
      OR lower(email) LIKE '%@apex.test'
      OR lower(email) LIKE '%@otpdemo.test'
      OR lower(email) LIKE '%@greenview.test'
    );

  RAISE NOTICE 'Migration 00332 completed: demo seed accounts purged. Canonical Founders & SuperAdmins: bvnbasu@gmail.com and bvnbasu@yahoo.com';
END;
$$;

COMMIT;

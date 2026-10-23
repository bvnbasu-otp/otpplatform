-- STATUS: UNAPPLIED
-- Prepared locally on 2026-10-22. This file is NOT in supabase/migrations.
-- A migration runner will not apply it. It has not been applied to any local
-- or hosted database. Do not move it under supabase/migrations until review.
--
-- Forward-only guard for the founder SUPER_ADMIN holding. Requires the schema
-- through 00301 (user_roles, profile_roles, profiles.active_role_code,
-- internal_roles, internal_user_assignments, private_security). Does not edit
-- 00315. Does not replace private.guard_profile_privileges(),
-- private_security.enforce_superadmin_immutability(),
-- private.assert_active_role_held(), public.switch_active_role(), or
-- private.prevent_audit_mutation(). Does not read or write legal config,
-- audit_events, or schema_migrations, and does not set a session GUC.
--
-- Canonical role model:
--   public.user_roles.code is the catalog primary key. profile_roles.role_code
--   and profiles.active_role_code both reference it with the PostgreSQL
--   default of ON UPDATE NO ACTION / ON DELETE NO ACTION (00039).
--   public.internal_roles.id is the catalog primary key.
--   internal_user_assignments.role_id references it ON DELETE RESTRICT and
--   ON UPDATE NO ACTION (00298). internal_roles.code is only a unique label.
--   Renaming that label does not move the foreign key, so the founder
--   assignment would keep its role_id while the code stopped being SUPER_ADMIN.
--   00301 stores the founder SUPER_ADMIN row in both profile_roles and
--   internal_user_assignments. Buyer and supplier holdings live in
--   profile_roles. Internal console holdings live in internal_user_assignments.
--   A row in a catalog, or a profile_roles row whose internal code no longer
--   matches, is not treated as a held role.
--
-- Founder identity is the unique public.profiles row carrying both the
-- authoritative is_founder claim and the reserved founder email established
-- by 00113, 00267, and 00301. The UUID differs between the deterministic local
-- migration seed (dd2dedee-...) and the current hosted profile (3c993f64-...),
-- so an environment-specific UUID is deliberately not embedded here.
-- auth.uid(), JWT claims, and function arguments supplied by a caller are
-- not consulted. There is no session GUC that skips this guard.
--   Marker: the canonical row cannot lose is_founder or change the reserved
--   email, and another row cannot acquire that marker pair. The existing
--   whitelist in
--   private_security.admin_whitelist still lists bvnbasu@gmail.com, and
--   private_security.enforce_superadmin_immutability() (00296) still rejects
--   deleting a profile whose email is on that list. This file does not change
--   that function. The same list also contains admin@otp.test and
--   ops@otp.test; those emails do not receive this role freeze.
--   founder@otp.test is not a protected id either.
--   Auth link: profiles.auth_user_id is part of the protected founder
--   identity. It cannot be cleared or retargeted. Protection does not attach
--   to a different profile that happens to use the founder email.
--   Other flags and metadata: is_platform_admin, status, and title remain
--   governed by the existing privilege/recovery guards. This proposal does
--   not replace those functions.
--
-- Existing write paths this covers, without adding grants:
--   profile_roles and user_roles expose SELECT policies only (00039).
--   service_role already has table GRANT ALL from that migration. Owner
--   sessions bypass RLS. Triggers still fire for both.
--   internal_roles_admin_all and internal_user_assignments_admin_all (00298)
--   let any platform-admin session update or delete those rows. Triggers
--   fire for that session, the table owner, and service_role.
--   TRUNCATE is rejected on the catalog and holding tables because it does
--   not fire row DELETE triggers. Row deletes of unrelated roles stay allowed.
--   INSERT cannot retarget an existing holding: profile_roles and
--   internal_user_assignments use unique founder/role pairs, profiles.id and
--   profiles.auth_user_id are unique, and both role codes are unique catalog
--   keys. Those constraints reject duplicate protected identities. Inserts
--   that grant legitimate roles to unrelated accounts remain allowed.
--
-- Active role: public.switch_active_role() is not replaced. For every profile
-- except this founder id, a non-null switch still follows
-- private.assert_active_role_held() (00301), including other platform admins,
-- who may still select a catalog role they do not hold. For this founder id,
-- a non-null active_role_code must be held: an internal_roles code must have
-- a live internal_user_assignments row joined on that same code plus an
-- active user_roles row; any other code must have a profile_roles row joined
-- to an active user_roles row. Null and blank are rejected. This file does
-- not backfill a historical null, so applying it does not rewrite the profile.
--
-- Each new trigger function is SECURITY DEFINER, owned by postgres when the
-- installing role is postgres, supabase_admin, or another superuser, with
-- search_path locked to pg_catalog, public. Direct EXECUTE is revoked from
-- PUBLIC, anon, authenticated, and service_role. No table privilege is granted.
--
-- Rollback (comment only — do not execute as part of this file). Drop the
-- new triggers and functions only. Do not drop role rows, assignments, or
-- the founder profile:
--   DROP TRIGGER IF EXISTS aa_guard_founder_active_role ON public.profiles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_profile_delete ON public.profiles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_profile_id ON public.profiles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_profile_role ON public.profile_roles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_profile_role_truncate ON public.profile_roles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_internal_assignment ON public.internal_user_assignments;
--   DROP TRIGGER IF EXISTS aa_guard_founder_internal_assignment_truncate ON public.internal_user_assignments;
--   DROP TRIGGER IF EXISTS aa_guard_founder_internal_role ON public.internal_roles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_internal_role_truncate ON public.internal_roles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_user_role ON public.user_roles;
--   DROP TRIGGER IF EXISTS aa_guard_founder_user_role_truncate ON public.user_roles;
--   DROP FUNCTION IF EXISTS private_security.guard_founder_superadmin_active_role();
--   DROP FUNCTION IF EXISTS private_security.guard_founder_superadmin_profile_role();
--   DROP FUNCTION IF EXISTS private_security.guard_founder_superadmin_internal_assignment();
--   DROP FUNCTION IF EXISTS private_security.guard_founder_superadmin_internal_role();
--   DROP FUNCTION IF EXISTS private_security.guard_founder_superadmin_user_role();
--   DROP FUNCTION IF EXISTS private_security.founder_profile_protected(uuid);

-- This proposal intentionally does not drop or replace any earlier function
-- or trigger. Installation must fail if one of these separately named objects
-- already exists so a reviewer can identify the exact object and compare its
-- compatibility before writing a forward-only replacement.

-- Fail closed: this proposal protects existing state. It never creates a role
-- catalog row, founder profile, holding, or assignment.
DO $founder_preconditions$
DECLARE
  v_founder_id uuid;
  v_founder_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_founder_count
  FROM public.profiles p
  WHERE p.is_founder IS TRUE
    AND lower(p.email) = 'bvnbasu@gmail.com';

  IF v_founder_count <> 1 THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: exactly one canonical founder profile must have is_founder=true and the reserved founder email';
  END IF;

  SELECT p.id
    INTO STRICT v_founder_id
  FROM public.profiles p
  WHERE p.is_founder IS TRUE
    AND lower(p.email) = 'bvnbasu@gmail.com';

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.auth_user_id
    WHERE p.id = v_founder_id
      AND p.auth_user_id IS NOT NULL
      AND p.is_founder IS TRUE
      AND p.is_platform_admin IS TRUE
      AND NULLIF(btrim(p.active_role_code), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.profile_roles pr
          JOIN public.user_roles ur ON ur.code = pr.role_code AND ur.is_active
          WHERE pr.profile_id = p.id
            AND pr.role_code = p.active_role_code
        )
        OR EXISTS (
          SELECT 1
          FROM public.internal_user_assignments ua
          JOIN public.internal_roles ir ON ir.id = ua.role_id
          WHERE ua.profile_id = p.id
            AND ir.code = p.active_role_code
        )
      )
  ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: canonical founder profile, Auth identity, founder and platform-admin flags, and a held active role must already be consistent';
  END IF;

  IF (SELECT count(*) FROM public.user_roles WHERE code = 'SUPER_ADMIN' AND is_active IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: exactly one active user_roles SUPER_ADMIN catalog row must already exist';
  END IF;

  IF (SELECT count(*) FROM public.internal_roles WHERE code = 'SUPER_ADMIN') <> 1 THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: exactly one internal_roles SUPER_ADMIN catalog row must already exist';
  END IF;

  IF (SELECT count(*) FROM public.profile_roles WHERE profile_id = v_founder_id AND role_code = 'SUPER_ADMIN') <> 1 THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: founder profile_roles SUPER_ADMIN holding must already exist exactly once';
  END IF;

  IF (
    SELECT count(*)
    FROM public.internal_user_assignments ua
    JOIN public.internal_roles ir ON ir.id = ua.role_id
    WHERE ua.profile_id = v_founder_id
      AND ir.code = 'SUPER_ADMIN'
  ) <> 1 THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_PRECONDITION_FAILED: founder internal SUPER_ADMIN assignment must already exist exactly once';
  END IF;
END
$founder_preconditions$;

-- Resolve the canonical founder from the same stable marker used by the
-- migration history. Trigger functions pass the profile id stored on the row;
-- caller-provided JWT claims and function arguments cannot nominate a founder.
-- Invoker rights: it is only reachable from the postgres-owned guard functions.
CREATE FUNCTION private_security.founder_profile_protected(p_profile_id uuid)
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
      AND lower(p.email) = 'bvnbasu@gmail.com'
  );
$fn$;

-- Path: profiles.id and profiles.active_role_code.
-- aa_ prefix sorts before profiles_active_role_held, so a null or blank
-- founder role is rejected here instead of being ignored by that function.
-- Other profiles, including other platform admins, return immediately.
CREATE FUNCTION private_security.guard_founder_superadmin_active_role()
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
         OR lower(NEW.email) IS DISTINCT FROM 'bvnbasu@gmail.com'
       ) THEN
      RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
        USING ERRCODE = '42501',
              DETAIL = 'canonical founder claim and reserved founder email cannot be changed';
    END IF;
    IF NOT private_security.founder_profile_protected(OLD.id)
       AND NEW.is_founder IS TRUE
       AND lower(NEW.email) = 'bvnbasu@gmail.com' THEN
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

  -- Switching to another held role is allowed. SUPER_ADMIN access is kept by
  -- the holding and catalog triggers below, not by pinning the active role.
  IF EXISTS (
    SELECT 1 FROM public.internal_roles ir WHERE ir.code = v_code
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.internal_user_assignments ua
      JOIN public.internal_roles ir ON ir.id = ua.role_id AND ir.code = v_code
      WHERE ua.profile_id = NEW.id
    ) OR NOT EXISTS (
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

-- Path: founder SUPER_ADMIN profile_roles delete, profile_id retarget, and
-- role_code retarget. is_demo, assigned_by, and assigned_at stay writable.
-- TRUNCATE would remove this row without firing the row trigger.
CREATE FUNCTION private_security.guard_founder_superadmin_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'profile_roles truncate would remove founder SUPER_ADMIN';
  END IF;

  IF OLD.role_code = 'SUPER_ADMIN'
     AND private_security.founder_profile_protected(OLD.profile_id)
     AND (
       TG_OP = 'DELETE'
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
       OR NEW.role_code IS DISTINCT FROM OLD.role_code
     ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'founder SUPER_ADMIN profile role cannot be removed or retargeted';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Path: founder assignment whose current internal_roles.code is SUPER_ADMIN.
-- Delete, profile_id retarget, and role_id retarget are rejected. assigned_by
-- and assigned_at stay writable. The code is read from the live catalog row,
-- so a renamed definition is not still treated as SUPER_ADMIN; the catalog
-- trigger below rejects that rename first.
CREATE FUNCTION private_security.guard_founder_superadmin_internal_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_code text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'internal_user_assignments truncate would remove founder SUPER_ADMIN';
  END IF;

  SELECT r.code
    INTO v_code
  FROM public.internal_roles r
  WHERE r.id = OLD.role_id;

  IF v_code = 'SUPER_ADMIN'
     AND private_security.founder_profile_protected(OLD.profile_id)
     AND (
       TG_OP = 'DELETE'
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
     ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'founder SUPER_ADMIN internal assignment cannot be removed or retargeted';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Path: the internal_roles definition whose code is SUPER_ADMIN.
-- Delete, code rename, and id change (the referenced identifier) are rejected.
-- name, description, and is_system stay writable. Other codes stay writable.
-- TRUNCATE would delete this definition together with every other internal role.
CREATE FUNCTION private_security.guard_founder_superadmin_internal_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'internal_roles truncate would delete SUPER_ADMIN';
  END IF;

  IF OLD.code = 'SUPER_ADMIN'
     AND (
       TG_OP = 'DELETE'
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.id IS DISTINCT FROM OLD.id
     ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'SUPER_ADMIN internal role code or id cannot be changed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Path: the user_roles definition whose code is SUPER_ADMIN.
-- That code is the referenced identifier for profile_roles.role_code and
-- profiles.active_role_code. Delete, code rename, and is_active = false are
-- rejected. Label, description, side, permissions, and sort_order stay
-- writable. Other codes stay writable. TRUNCATE would delete every role code.
CREATE FUNCTION private_security.guard_founder_superadmin_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'user_roles truncate would delete SUPER_ADMIN';
  END IF;

  IF OLD.code = 'SUPER_ADMIN'
     AND (
       TG_OP = 'DELETE'
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.is_active IS DISTINCT FROM TRUE
     ) THEN
    RAISE EXCEPTION 'FOUNDER_SUPERADMIN_ROLE_IMMUTABLE'
      USING ERRCODE = '42501',
            DETAIL = 'SUPER_ADMIN user_roles code or active flag cannot be removed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DO $owner$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = current_user
      AND (rolsuper OR rolname IN ('postgres', 'supabase_admin'))
  ) THEN
    RAISE EXCEPTION 'refusing to install founder role guard without postgres ownership'
      USING ERRCODE = '42501';
  END IF;

  ALTER FUNCTION private_security.founder_profile_protected(uuid) OWNER TO postgres;
  ALTER FUNCTION private_security.guard_founder_superadmin_active_role() OWNER TO postgres;
  ALTER FUNCTION private_security.guard_founder_superadmin_profile_role() OWNER TO postgres;
  ALTER FUNCTION private_security.guard_founder_superadmin_internal_assignment() OWNER TO postgres;
  ALTER FUNCTION private_security.guard_founder_superadmin_internal_role() OWNER TO postgres;
  ALTER FUNCTION private_security.guard_founder_superadmin_user_role() OWNER TO postgres;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private_security'
      AND p.proname LIKE 'guard_founder_superadmin_%'
      AND (
        NOT p.prosecdef
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE cfg LIKE 'search_path=pg_catalog%'
        )
      )
  ) THEN
    RAISE EXCEPTION 'refusing to install a founder role guard without definer and locked search_path'
      USING ERRCODE = '42501';
  END IF;
END
$owner$;

REVOKE ALL ON FUNCTION private_security.founder_profile_protected(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.guard_founder_superadmin_active_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.guard_founder_superadmin_profile_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.guard_founder_superadmin_internal_assignment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.guard_founder_superadmin_internal_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_security.guard_founder_superadmin_user_role() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private_security.founder_profile_protected(uuid) IS
  'Owner postgres. SECURITY INVOKER; EXECUTE revoked from API roles. True only for the unique is_founder profile carrying the reserved founder email established by migrations.';

COMMENT ON FUNCTION private_security.guard_founder_superadmin_active_role() IS
  'Owner postgres. SECURITY DEFINER. search_path pg_catalog, public. Rejects founder profile/Auth identity changes, deletion, and a null, blank, or unheld active_role_code.';

COMMENT ON FUNCTION private_security.guard_founder_superadmin_profile_role() IS
  'Owner postgres. SECURITY DEFINER. search_path pg_catalog, public. Rejects delete, retarget, and truncate of the founder SUPER_ADMIN profile_roles row.';

COMMENT ON FUNCTION private_security.guard_founder_superadmin_internal_assignment() IS
  'Owner postgres. SECURITY DEFINER. search_path pg_catalog, public. Rejects delete, retarget, and truncate of the founder SUPER_ADMIN internal assignment.';

COMMENT ON FUNCTION private_security.guard_founder_superadmin_internal_role() IS
  'Owner postgres. SECURITY DEFINER. search_path pg_catalog, public. Rejects delete, code rename, id change, and truncate of internal_roles SUPER_ADMIN.';

COMMENT ON FUNCTION private_security.guard_founder_superadmin_user_role() IS
  'Owner postgres. SECURITY DEFINER. search_path pg_catalog, public. Rejects delete, code rename, deactivation, and truncate of user_roles SUPER_ADMIN.';

-- Founder profile id cannot move onto or off the canonical UUID.
CREATE TRIGGER aa_guard_founder_profile_id
  BEFORE UPDATE OF id, auth_user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_active_role('id');

CREATE TRIGGER aa_guard_founder_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_active_role('delete');

-- The stable founder marker cannot move to another profile or be cleared.
CREATE TRIGGER aa_guard_founder_profile_marker
  BEFORE UPDATE OF email, is_founder ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_active_role('marker');

-- Founder active_role_code cannot be cleared or set to a role that is not held.
CREATE TRIGGER aa_guard_founder_active_role
  BEFORE UPDATE OF active_role_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_active_role('active');

-- Founder SUPER_ADMIN profile_roles row cannot be deleted or retargeted.
CREATE TRIGGER aa_guard_founder_profile_role
  BEFORE DELETE OR UPDATE ON public.profile_roles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_profile_role();

CREATE TRIGGER aa_guard_founder_profile_role_truncate
  BEFORE TRUNCATE ON public.profile_roles
  FOR EACH STATEMENT EXECUTE FUNCTION private_security.guard_founder_superadmin_profile_role();

-- Founder SUPER_ADMIN internal assignment cannot be deleted or retargeted.
CREATE TRIGGER aa_guard_founder_internal_assignment
  BEFORE DELETE OR UPDATE ON public.internal_user_assignments
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_internal_assignment();

CREATE TRIGGER aa_guard_founder_internal_assignment_truncate
  BEFORE TRUNCATE ON public.internal_user_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION private_security.guard_founder_superadmin_internal_assignment();

-- SUPER_ADMIN internal role code and id cannot be renamed or deleted.
CREATE TRIGGER aa_guard_founder_internal_role
  BEFORE DELETE OR UPDATE ON public.internal_roles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_internal_role();

CREATE TRIGGER aa_guard_founder_internal_role_truncate
  BEFORE TRUNCATE ON public.internal_roles
  FOR EACH STATEMENT EXECUTE FUNCTION private_security.guard_founder_superadmin_internal_role();

-- SUPER_ADMIN user_roles code cannot be renamed, deactivated, or deleted.
CREATE TRIGGER aa_guard_founder_user_role
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION private_security.guard_founder_superadmin_user_role();

CREATE TRIGGER aa_guard_founder_user_role_truncate
  BEFORE TRUNCATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION private_security.guard_founder_superadmin_user_role();

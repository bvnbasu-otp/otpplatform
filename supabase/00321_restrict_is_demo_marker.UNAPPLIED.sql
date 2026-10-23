-- STATUS: UNAPPLIED
-- Review proposal only. This file is intentionally outside supabase/migrations.
-- It has not been applied to a local or hosted database.
--
-- public.profiles.is_demo is a trusted deletion-eligibility marker. Existing
-- accounts can never be promoted into demo status, including by a platform
-- admin, SUPER_ADMIN, service-role request, SECURITY DEFINER function, or
-- database owner. A true marker can be cleared; it cannot be restored.
--
-- The only trusted creation path is the repository's local seed SQL configured
-- in supabase/config.toml. Those files insert new profiles with is_demo=true
-- while running as the local database operator. Application signup and admin
-- RPC paths create is_demo=false profiles. No application RPC is introduced.
--
-- Existing demo seed ON CONFLICT clauses may leave true as true. They cannot
-- change false to true after this guard is installed. Founder profiles can
-- never carry the marker.

BEGIN;

DO $preconditions$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'DEMO_MARKER_PRECONDITION_FAILED: public.profiles is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'is_demo'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'DEMO_MARKER_PRECONDITION_FAILED: public.profiles.is_demo is required';
  END IF;
END
$preconditions$;

CREATE FUNCTION private_security.guard_profile_is_demo_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $fn$
BEGIN
  IF NEW.is_founder IS TRUE AND NEW.is_demo IS TRUE THEN
    RAISE EXCEPTION 'DEMO_MARKER_IMMUTABLE: a founder profile cannot be a demo account'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_demo IS TRUE AND NOT (
      session_user IN ('postgres', 'supabase_admin')
      AND auth.uid() IS NULL
      AND COALESCE(auth.role(), '') = ''
    ) THEN
      RAISE EXCEPTION 'DEMO_MARKER_TRUSTED_INSERT_REQUIRED: demo accounts may only be created by the local database seed operator'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- No caller has an UPDATE bypass. This also catches upserts from seed scripts
  -- when an existing non-demo account collides with a proposed demo identity.
  IF OLD.is_demo IS DISTINCT FROM TRUE AND NEW.is_demo IS TRUE THEN
    RAISE EXCEPTION 'DEMO_MARKER_IMMUTABLE: an existing account cannot be marked as demo'
      USING ERRCODE = '42501';
  END IF;

  -- true -> false is deliberately allowed. Clearing eligibility is safe and
  -- irreversible because the transition back to true is blocked above.
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION private_security.guard_profile_is_demo_marker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private_security.guard_profile_is_demo_marker()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_guard_profile_is_demo_marker
  BEFORE INSERT OR UPDATE OF is_demo, is_founder ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private_security.guard_profile_is_demo_marker();

COMMENT ON FUNCTION private_security.guard_profile_is_demo_marker() IS
  'Fail-closed profile demo-marker guard. Only a database-operator INSERT without JWT context may create is_demo=true; false-to-true UPDATE is always denied; founder demo status is always denied.';

COMMIT;

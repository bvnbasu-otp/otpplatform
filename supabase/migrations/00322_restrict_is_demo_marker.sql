-- 00322: Immutable trusted demo-account marker.
-- Promoted from restrict_is_demo_marker.DEFERRED.UNVERSIONED.sql on 2026-10-24.
-- Forward-only; deployment remains a separate authorized operation.

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

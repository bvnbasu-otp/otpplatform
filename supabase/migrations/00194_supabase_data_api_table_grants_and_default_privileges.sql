-- =============================================================================
-- Migration 00194: Supabase Data API Explicit Grants & Default Privileges
-- =============================================================================
-- Description:
--   Complies with Supabase October 30 Data API security update where automatic
--   Data API grants on newly created tables in schema public are discontinued.
--
-- Actions:
--   1. Ensures USAGE on schema public for anon, authenticated, and service_role.
--   2. Grants SELECT, INSERT, UPDATE, DELETE on ALL existing tables and views
--      in schema public to authenticated and service_role.
--   3. Grants SELECT on ALL existing tables and views in schema public to anon.
--   4. Grants USAGE, SELECT on ALL existing sequences to authenticated,
--      service_role, and anon.
--   5. Grants EXECUTE on ALL existing routines in schema public to authenticated,
--      service_role, and anon.
--   6. Configures ALTER DEFAULT PRIVILEGES for current role and postgres role
--      so that any future tables, sequences, or functions created in schema
--      public automatically receive the required Data API grants.
--   7. Notifies PostgREST to reload schema cache.
-- =============================================================================

-- 1. Schema Usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Explicit Grants on All Existing Tables & Views
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public
  TO anon;

-- 3. Explicit Grants on All Existing Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role, anon;

-- 4. Explicit Grants on All Existing Functions / Routines
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public
  TO authenticated, service_role, anon;

-- 5. Default Privileges for Current Session / Role
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO authenticated, service_role, anon;

-- 6. Default Privileges for postgres Migration Superuser Role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT ON TABLES TO anon;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role, anon;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT EXECUTE ON ROUTINES TO authenticated, service_role, anon;
  END IF;
END $$;

-- 7. Reload PostgREST Schema Cache
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN OTHERS THEN
  -- Fallback if notification fails in standalone context
  NULL;
END $$;

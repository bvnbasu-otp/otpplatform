-- =============================================================================
-- Migration 00152: SuperAdmin Whitelist & PostgreSQL Immutable Role Trigger
-- Description:
--   Guarantees that root platform administrative accounts cannot be blocked,
--   deleted, demoted, or altered by any standard database query or frontend API call.
-- =============================================================================

BEGIN;

-- 1. Create dedicated private security schema if not existing
CREATE SCHEMA IF NOT EXISTS private_security;

-- 2. Create immutable superadmin whitelist table
CREATE TABLE IF NOT EXISTS private_security.admin_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT 'Root Platform Super Administrator',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed root administrators into whitelist
INSERT INTO private_security.admin_whitelist (email, reason)
VALUES 
  ('bvnbasu@gmail.com', 'Primary Platform Architect & Owner'),
  ('admin@otp.test', 'Staging & Automated Benchmark Administrator'),
  ('ops@otp.test', 'Platform Operations SuperAdmin')
ON CONFLICT (email) DO NOTHING;

-- 3. Trigger Function: Enforce SuperAdmin Immutability
CREATE OR REPLACE FUNCTION private_security.enforce_superadmin_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_security, auth
AS $$
DECLARE
  v_is_whitelisted boolean;
BEGIN
  -- Check if OLD record is in whitelist
  SELECT EXISTS (
    SELECT 1 FROM private_security.admin_whitelist 
    WHERE lower(email) = lower(OLD.email)
  ) INTO v_is_whitelisted;

  IF v_is_whitelisted THEN
    -- Check for deletion attempt
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Cannot delete protected root SuperAdmin account %', OLD.email;
    END IF;

    -- Check for demotion attempt
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_platform_admin IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot revoke is_platform_admin from root SuperAdmin %', OLD.email;
      END IF;

      -- Check for blocking attempt
      IF NEW.status IN ('BLOCKED', 'SUSPENDED', 'DELETED') AND OLD.status NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED') THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot block or suspend root SuperAdmin %', OLD.email;
      END IF;

      -- Check for soft-delete attempt
      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot soft-delete root SuperAdmin %', OLD.email;
      END IF;

      -- Ensure email cannot be hijacked
      IF lower(NEW.email) <> lower(OLD.email) THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot modify email of root SuperAdmin %', OLD.email;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach Trigger to public.profiles
DROP TRIGGER IF EXISTS trg_enforce_superadmin_immutability ON public.profiles;

CREATE TRIGGER trg_enforce_superadmin_immutability
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private_security.enforce_superadmin_immutability();

-- 5. Ensure private_security is not readable by anonymous or normal authenticated users
REVOKE ALL ON SCHEMA private_security FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private_security TO service_role, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA private_security TO service_role, postgres;

COMMIT;

-- Migration: 00267_authoritative_founder_and_admin_claims.sql
-- Description: Anchor SuperAdmin and Founder authority strictly to database profile claims.
-- Eliminates email string-matching fallbacks in private.is_founder() and private.is_platform_admin().

BEGIN;

-- 1. Ensure columns exist with correct defaults
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- 2. Index privileged profiles for fast index-only scans
CREATE INDEX IF NOT EXISTS idx_profiles_privileged_claims
  ON public.profiles (is_founder, is_platform_admin)
  WHERE is_founder = true OR is_platform_admin = true;

-- 3. Explicitly provision designated founder and administrator profile claims
UPDATE public.profiles
SET is_founder = true,
    is_platform_admin = true,
    updated_at = clock_timestamp()
WHERE lower(email) IN ('bvnbasu@gmail.com', 'founder@otp.test');

UPDATE public.profiles
SET is_platform_admin = true,
    updated_at = clock_timestamp()
WHERE lower(email) IN ('admin@otp.test', 'superadmin@otp.test', 'ops@otp.test');

-- 4. Authoritative private.is_founder() function (DB Profile Claim Only)
CREATE OR REPLACE FUNCTION private.is_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
  SELECT COALESCE(
    (
      SELECT is_founder
      FROM public.profiles
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND is_founder = true
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION private.is_founder() IS
  'Authoritative Founder check backed strictly by database profile claims. Zero email string matching.';

GRANT EXECUTE ON FUNCTION private.is_founder() TO authenticated, service_role, anon;

-- 5. Authoritative private.is_platform_admin() function (DB Profile Claim + Service Role Only)
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text;
BEGIN
  -- 1. Service role check via auth context (PostgREST)
  BEGIN
    v_jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 2. Direct psql / DB superuser session where no HTTP/JWT session exists (session_user)
  IF v_uid IS NULL AND v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Authoritative check on public.profiles table claim
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (auth_user_id = v_uid OR id = v_uid)
      AND (is_platform_admin = true OR is_founder = true)
  );
END;
$$;

COMMENT ON FUNCTION private.is_platform_admin() IS
  'Authoritative Platform Admin check backed strictly by database profile claims or service_role. Zero email string matching.';

GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role, anon;

COMMIT;

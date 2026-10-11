-- 00263_guard_profile_privileges_empty_role_bypass.sql
-- Forward-only DRAFT — not in supabase/migrations chain. Apply via hosted pipeline only.
--
-- Closes guard bypass when COALESCE(auth.role(), '') IN ('service_role', '') (00203/00205):
-- empty JWT role must NOT skip privilege checks. Only service_role session and
-- private.is_platform_admin() may bypass (same as intended admin/service paths).
--
-- Preserves 00205 signup normalization: non-admin INSERT forces ACTIVE / clears blocked_*.
-- Preserves: no self is_platform_admin, reserved admin emails, status/privilege UPDATE blocks.
--
-- Depends on private.is_platform_admin() (00179): JWT email allowlist + profiles.is_platform_admin
-- flag — document alignment in GROUPED_SECURITY_REMEDIATION_WAVE_EVIDENCE (WS-C-001/002).
--
-- CREATE OR REPLACE only: trigger trg_aa_guard_profile_privileges (00203/00205) unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION private.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_admin_emails text[] := ARRAY[
    'admin@otp.test',
    'bvnbasu@gmail.com',
    'ops@otp.test',
    'superadmin@otp.test',
    'admin@otp.ai',
    'ops@otp.ai',
    'admin@procureos.test'
  ];
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR COALESCE(private.is_platform_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_platform_admin, false) THEN
      RAISE EXCEPTION 'Only a platform admin can grant platform-admin access (PROFILE-PRIVILEGE)';
    END IF;
    IF lower(NEW.email) = ANY (v_admin_emails) THEN
      RAISE EXCEPTION 'This email is reserved for platform administrators (PROFILE-PRIVILEGE)';
    END IF;

    NEW.status := 'ACTIVE';
    NEW.deleted_at := NULL;
    NEW.blocked_at := NULL;
    NEW.blocked_reason := NULL;
    NEW.blocked_by := NULL;

    RETURN NEW;
  END IF;

  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    RAISE EXCEPTION 'Only a platform admin can grant or revoke platform-admin access (PROFILE-PRIVILEGE)';
  END IF;

  IF lower(NEW.email) IS DISTINCT FROM lower(OLD.email) AND lower(NEW.email) = ANY (v_admin_emails) THEN
    RAISE EXCEPTION 'This email is reserved for platform administrators (PROFILE-PRIVILEGE)';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by THEN
    RAISE EXCEPTION 'Only a platform admin can change account status (PROFILE-PRIVILEGE)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_profile_privileges() FROM PUBLIC, anon, authenticated;

COMMIT;

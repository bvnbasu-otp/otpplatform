-- Migration 00205: Force default profile status/privilege columns on INSERT
--
-- A-OPEN-PROFILE-INSERT. profiles_insert (00004:71-73) only checks
-- auth_user_id = auth.uid(), so a self-signup INSERT can set any value for
-- status / deleted_at / blocked_at / blocked_reason / blocked_by. 00203's
-- trg_aa_guard_profile_privileges already blocks self-escalation of these
-- same columns on UPDATE, but its TG_OP = 'INSERT' branch only rejects
-- is_platform_admin = true and the reserved admin-email list; it does not
-- touch status/deleted_at/blocked_*, so the gap is still open after 00203
-- (R2-32 section L). This extends the same trigger's INSERT branch to force
-- every new row to the safe defaults for non-admin, non-service callers,
-- exactly as its UPDATE branch already requires no privileged transition.
--
-- Idempotent and non-destructive: CREATE OR REPLACE FUNCTION only; no table,
-- column or row is dropped, deleted or updated. Existing rows are untouched.

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
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR COALESCE(private.is_platform_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_platform_admin, false) THEN
      RAISE EXCEPTION 'Only a platform admin can grant platform-admin access (PROFILE-PRIVILEGE)';
    END IF;
    IF lower(NEW.email) = ANY (v_admin_emails) THEN
      RAISE EXCEPTION 'This email is reserved for platform administrators (PROFILE-PRIVILEGE)';
    END IF;

    -- A-OPEN-PROFILE-INSERT: status and the blocked_*/deleted_at columns
    -- cannot be self-assigned at signup either; every self-inserted profile
    -- starts ACTIVE and unblocked regardless of what the caller sent.
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

-- Trigger already exists (created by 00203) and fires BEFORE INSERT OR
-- UPDATE; CREATE OR REPLACE FUNCTION above is sufficient, but the trigger is
-- re-declared here too so this migration is self-contained and re-runnable
-- even if 00203's trigger were ever missing.
DROP TRIGGER IF EXISTS trg_aa_guard_profile_privileges ON public.profiles;
CREATE TRIGGER trg_aa_guard_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_privileges();

COMMIT;

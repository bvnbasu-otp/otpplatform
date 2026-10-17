-- Ordinary profile deletion must succeed. Migration 00152 returned NEW from a
-- BEFORE DELETE trigger, and NEW is null, so PostgreSQL cancelled every delete.
-- Protected root accounts still raise. A profile delete marks the transaction;
-- the acceptance trigger archives that profile's evidence once and then allows
-- the cascade. Direct acceptance deletes stay denied. Archive rows keep no
-- profile foreign key.

BEGIN;

CREATE OR REPLACE FUNCTION private_security.enforce_superadmin_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_security, auth
AS $$
DECLARE
  v_is_whitelisted boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM private_security.admin_whitelist
    WHERE lower(email) = lower(OLD.email)
  ) INTO v_is_whitelisted;

  IF v_is_whitelisted THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Cannot delete protected root SuperAdmin account %', OLD.email;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_platform_admin IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot revoke is_platform_admin from root SuperAdmin %', OLD.email;
      END IF;

      IF NEW.status IN ('BLOCKED', 'SUSPENDED', 'DELETED') AND OLD.status NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED') THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot block or suspend root SuperAdmin %', OLD.email;
      END IF;

      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot soft-delete root SuperAdmin %', OLD.email;
      END IF;

      IF lower(NEW.email) <> lower(OLD.email) THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot modify email of root SuperAdmin %', OLD.email;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    CREATE TEMP TABLE IF NOT EXISTS otp_profile_delete_ids (
      profile_id uuid PRIMARY KEY
    ) ON COMMIT DROP;
    INSERT INTO pg_temp.otp_profile_delete_ids (profile_id) VALUES (OLD.id)
    ON CONFLICT (profile_id) DO NOTHING;
    PERFORM set_config('otp.profile_delete', 'on', true);
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptance_archives_acceptance_uidx
  ON public.legal_acceptance_archives (acceptance_id);

CREATE OR REPLACE FUNCTION private.guard_legal_acceptances_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF current_setting('otp.profile_delete', true) IS DISTINCT FROM 'on'
     OR to_regclass('pg_temp.otp_profile_delete_ids') IS NULL THEN
    RAISE EXCEPTION 'Legal acceptances are append-only (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_temp.otp_profile_delete_ids WHERE profile_id = OLD.profile_id
  ) THEN
    RAISE EXCEPTION 'Legal acceptances are append-only (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.legal_acceptance_archives WHERE acceptance_id = OLD.id
  ) THEN
    PERFORM set_config('otp.legal_archive_write', 'on', true);
    INSERT INTO public.legal_acceptance_archives (
      acceptance_id, profile_id, agreement_type, version, document_hash, accepted_at, acceptance_source
    ) VALUES (
      OLD.id, OLD.profile_id, OLD.agreement_type, OLD.version, OLD.document_hash, OLD.accepted_at, OLD.acceptance_source
    );
  END IF;
  RETURN OLD;
END;
$$;

COMMIT;

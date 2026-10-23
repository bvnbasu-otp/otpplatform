-- 00315: keep audit attribution when a non-protected profile is deleted.
--
-- Number: follows 00314_internal_invitation_acceptance.sql.
-- The separate supplier-address proposal at
-- supabase/00314_internal_procurement_and_supplier_business_address.UNAPPLIED.sql
-- remains outside supabase/migrations and is not applied by this migration.
--
-- audit_events.actor_id referenced public.profiles(id) with NO ACTION, so a
-- profile that had written an audit event could not be deleted without
-- deleting or rewriting that event. INV-071 and INV-072 forbid both.
-- This migration adds a durable actor registry, backfills it from profiles,
-- and points the existing actor foreign key at the registry. Existing
-- audit_events rows are not updated or deleted. The registry row keeps the
-- original actor UUID after the profile is gone and does not cascade from
-- profiles (ON DELETE SET NULL on the profile link only).
--
-- Rollback comment (do not apply a down migration):
-- Forward-only. A reversal is unsafe after any profile_deleted_at is set,
-- because that actor UUID is no longer in public.profiles. If no profile has
-- been deleted since this migration, a later forward repair would have to:
--   1. refuse while any audit_actor_identities.profile_deleted_at is not null;
--   2. drop trg_aa_audit_actor_identity_register and
--      trg_zz_audit_actor_identity_preserve;
--   3. drop trg_audit_actor_identities_guard;
--   4. drop public.resolve_audit_actor(uuid),
--      private.maintain_audit_actor_identity(),
--      private.guard_audit_actor_identity(), and
--      private.permit_audit_actor_registry(uuid);
--   5. drop constraint audit_events_actor_id_fkey and add it again as
--      FOREIGN KEY (actor_id) REFERENCES public.profiles(id);
--   6. drop table public.audit_actor_identities.
-- Do not enable otp.allow_audit_purge. Do not disable triggers. Do not delete
-- or update audit_events. Do not weaken INV-071 or INV-072.

BEGIN;

-- Refuse to run if append-only enforcement is already bypassed or missing.
DO $audit_precheck$
DECLARE
  v_fk_name text;
  v_fk_target regclass;
  v_fk_valid boolean;
  v_trigger_count integer;
  v_disabled integer;
BEGIN
  IF current_setting('otp.allow_audit_purge', true) = 'on' THEN
    RAISE EXCEPTION 'refusing to continue while otp.allow_audit_purge is on';
  END IF;
  IF current_setting('session_replication_role', true) IS DISTINCT FROM 'origin' THEN
    RAISE EXCEPTION 'refusing to continue while triggers are suppressed';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE t.tgenabled IS DISTINCT FROM 'O')
    INTO v_trigger_count, v_disabled
  FROM pg_trigger t
  JOIN pg_class rel ON rel.oid = t.tgrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE NOT t.tgisinternal
    AND nsp.nspname = 'public'
    AND rel.relname = 'audit_events'
    AND t.tgname IN ('audit_events_no_update', 'audit_events_no_delete');
  IF v_trigger_count IS DISTINCT FROM 2 OR v_disabled IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'refusing to continue: audit append-only triggers are missing or disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'prevent_audit_mutation'
      AND pg_get_functiondef(p.oid) LIKE '%INV-071%'
      AND pg_get_functiondef(p.oid) LIKE '%INV-072%'
  ) THEN
    RAISE EXCEPTION 'refusing to continue: private.prevent_audit_mutation() does not enforce INV-071 and INV-072';
  END IF;

  IF to_regclass('private_security.admin_whitelist') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM private_security.admin_whitelist
       WHERE lower(email) = 'bvnbasu@gmail.com'
     ) THEN
    RAISE EXCEPTION 'refusing to continue: founder whitelist entry bvnbasu@gmail.com is missing';
  END IF;

  -- 00296 keeps deletion protection and the recovery floor on this trigger.
  -- Claim revocation is enforced by private.guard_profile_privileges().
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private_security'
      AND p.proname = 'enforce_superadmin_immutability'
      AND pg_get_functiondef(p.oid) LIKE '%Cannot delete protected root SuperAdmin%'
      AND pg_get_functiondef(p.oid) LIKE '%assert_recovery_floor_after%'
  ) THEN
    RAISE EXCEPTION 'refusing to continue: founder deletion safeguard is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'guard_profile_privileges'
      AND pg_get_functiondef(p.oid) LIKE '%PLATFORM_PRIVILEGE_IMMUTABLE%'
  ) THEN
    RAISE EXCEPTION 'refusing to continue: platform privilege revocation safeguard is missing';
  END IF;

  SELECT c.conname, c.confrelid, c.convalidated
    INTO v_fk_name, v_fk_target, v_fk_valid
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'audit_events'
    AND att.attname = 'actor_id';
  IF v_fk_name IS DISTINCT FROM 'audit_events_actor_id_fkey'
     OR v_fk_target IS DISTINCT FROM 'public.profiles'::regclass
     OR v_fk_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'refusing to retarget unexpected audit_events.actor_id foreign key %', COALESCE(v_fk_name, '<missing>');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_events e
    WHERE e.actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = e.actor_id)
  ) THEN
    RAISE EXCEPTION 'pre-check failed: a non-null audit_events.actor_id is not in public.profiles';
  END IF;
END
$audit_precheck$;

LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.audit_events IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE otp_audit_preservation_before ON COMMIT DROP AS
SELECT * FROM public.audit_events;

CREATE TABLE public.audit_actor_identities (
  actor_id uuid PRIMARY KEY,
  profile_id uuid,
  auth_user_id uuid,
  email text,
  full_name text,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  profile_deleted_at timestamptz,
  CONSTRAINT audit_actor_identities_profile_id_fkey
    FOREIGN KEY (profile_id)
    REFERENCES public.profiles (id)
    ON DELETE SET NULL,
  CONSTRAINT audit_actor_identities_profile_matches_actor
    CHECK (profile_id IS NULL OR profile_id = actor_id)
);

COMMENT ON TABLE public.audit_actor_identities IS
  'Durable audit actor registry. actor_id stays equal to the original profiles.id. Profile deletion nulls profile_id and does not delete this row or any audit_events row.';

COMMENT ON COLUMN public.audit_actor_identities.actor_id IS
  'Stable audit actor UUID. Copied from profiles.id and never reused as a different person.';

COMMENT ON COLUMN public.audit_actor_identities.profile_id IS
  'Live profile link. ON DELETE SET NULL. Null after the profile is deleted.';

CREATE UNIQUE INDEX audit_actor_identities_profile_id_uidx
  ON public.audit_actor_identities (profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX audit_actor_identities_email_lower_idx
  ON public.audit_actor_identities (lower(email));

CREATE INDEX audit_actor_identities_auth_user_idx
  ON public.audit_actor_identities (auth_user_id);

CREATE INDEX audit_actor_identities_deleted_idx
  ON public.audit_actor_identities (profile_deleted_at)
  WHERE profile_deleted_at IS NOT NULL;

ALTER TABLE public.audit_actor_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_actor_identities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_actor_identities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_actor_identities TO authenticated, service_role;

DROP POLICY IF EXISTS audit_actor_identities_select ON public.audit_actor_identities;
CREATE POLICY audit_actor_identities_select
  ON public.audit_actor_identities
  FOR SELECT
  TO authenticated
  USING (private.is_platform_admin());

-- Backfill before the actor foreign key moves. No audit_events write.
INSERT INTO public.audit_actor_identities (
  actor_id, profile_id, auth_user_id, email, full_name, registered_at
)
SELECT
  p.id,
  p.id,
  p.auth_user_id,
  p.email,
  p.full_name,
  COALESCE(p.created_at, clock_timestamp())
FROM public.profiles p
ON CONFLICT (actor_id) DO NOTHING;

DO $audit_backfill$
DECLARE
  v_missing_profiles bigint;
  v_missing_actors bigint;
BEGIN
  SELECT count(*) INTO v_missing_profiles
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_actor_identities a WHERE a.actor_id = p.id
  );
  IF v_missing_profiles <> 0 THEN
    RAISE EXCEPTION 'audit actor registry backfill missed % profiles', v_missing_profiles;
  END IF;

  SELECT count(*) INTO v_missing_actors
  FROM public.audit_events e
  WHERE e.actor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.audit_actor_identities a WHERE a.actor_id = e.actor_id
    );
  IF v_missing_actors <> 0 THEN
    RAISE EXCEPTION 'audit actor registry backfill missed % actor ids', v_missing_actors;
  END IF;
END
$audit_backfill$;

ALTER TABLE public.audit_events
  DROP CONSTRAINT audit_events_actor_id_fkey;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_actor_id_fkey
  FOREIGN KEY (actor_id)
  REFERENCES public.audit_actor_identities (actor_id)
  ON DELETE RESTRICT;

COMMENT ON COLUMN public.audit_events.actor_id IS
  'References public.audit_actor_identities(actor_id). Profile deletion does not change this value.';

DO $audit_postcheck$
DECLARE
  v_target regclass;
  v_valid boolean;
  v_delete_action text;
  v_profile_action text;
  v_missing bigint;
BEGIN
  SELECT c.confrelid, c.convalidated, c.confdeltype::text
    INTO v_target, v_valid, v_delete_action
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE c.conname = 'audit_events_actor_id_fkey'
    AND nsp.nspname = 'public'
    AND rel.relname = 'audit_events';
  IF v_target IS DISTINCT FROM 'public.audit_actor_identities'::regclass
     OR v_valid IS DISTINCT FROM true
     OR v_delete_action IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'post-check failed: audit_events_actor_id_fkey does not restrict to the actor registry';
  END IF;

  SELECT c.confdeltype::text INTO v_profile_action
  FROM pg_constraint c
  WHERE c.conname = 'audit_actor_identities_profile_id_fkey';
  IF v_profile_action IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'post-check failed: actor registry must not cascade-delete with profiles';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.audit_events e
  WHERE e.actor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.audit_actor_identities a WHERE a.actor_id = e.actor_id
    );
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'post-check failed: % audit actor ids are not in the registry', v_missing;
  END IF;

  IF EXISTS (
    SELECT * FROM otp_audit_preservation_before
    EXCEPT
    SELECT * FROM public.audit_events
  ) THEN
    RAISE EXCEPTION 'post-check failed: existing audit_events rows changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.audit_events e
    WHERE EXISTS (
      SELECT 1 FROM otp_audit_preservation_before b WHERE b.id = e.id
    )
  ) IS DISTINCT FROM (SELECT count(*) FROM otp_audit_preservation_before) THEN
    RAISE EXCEPTION 'post-check failed: existing audit_events rows disappeared';
  END IF;
END
$audit_postcheck$;

CREATE OR REPLACE FUNCTION private.permit_audit_actor_registry(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $permit$
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'audit actor identity is required (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS otp_audit_actor_registry_permit (
    actor_id uuid PRIMARY KEY
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.otp_audit_actor_registry_permit (actor_id)
  VALUES (p_actor_id)
  ON CONFLICT (actor_id) DO NOTHING;
END;
$permit$;

CREATE OR REPLACE FUNCTION private.guard_audit_actor_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $guard$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit actor identities cannot be deleted (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;

  -- Depth 1 is a direct write. Profile lifecycle writes are nested inside the
  -- profile trigger. The one depth-1 write that must succeed is the profiles
  -- ON DELETE SET NULL action, and only after deletion has already been stamped.
  IF TG_OP = 'INSERT' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'audit actor identities are maintained only by profile lifecycle (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() <= 1
     AND NOT (
       OLD.profile_deleted_at IS NOT NULL
       AND NEW.profile_id IS NULL
       AND NEW.profile_deleted_at IS NOT DISTINCT FROM OLD.profile_deleted_at
       AND NEW.email IS NOT DISTINCT FROM OLD.email
       AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name
       AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id
       AND NEW.registered_at IS NOT DISTINCT FROM OLD.registered_at
       AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     ) THEN
    RAISE EXCEPTION 'audit actor identities are maintained only by profile lifecycle (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;

  v_actor := NEW.actor_id;
  IF to_regclass('pg_temp.otp_audit_actor_registry_permit') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_temp.otp_audit_actor_registry_permit p WHERE p.actor_id = v_actor
     ) THEN
    RAISE EXCEPTION 'audit actor identities are maintained only by profile lifecycle (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;

  IF NEW.profile_id IS NOT NULL AND NEW.profile_id IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'audit actor profile link cannot point at a different profile (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.profile_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new audit actor identity cannot start deleted (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'audit actor id and registration time are immutable (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;
  IF NEW.email IS NULL AND OLD.email IS NOT NULL THEN
    RAISE EXCEPTION 'audit actor email cannot be erased (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;
  IF NEW.full_name IS NULL AND OLD.full_name IS NOT NULL THEN
    RAISE EXCEPTION 'audit actor name cannot be erased (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;
  IF NEW.auth_user_id IS NULL AND OLD.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'audit actor auth user cannot be erased (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
  END IF;

  IF OLD.profile_deleted_at IS NOT NULL THEN
    IF NEW.profile_deleted_at IS NULL THEN
      IF NEW.profile_id IS DISTINCT FROM NEW.actor_id THEN
        RAISE EXCEPTION 'a deleted audit actor can only be relinked to the same profile id (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
      END IF;
    ELSIF NEW.profile_deleted_at IS DISTINCT FROM OLD.profile_deleted_at
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.full_name IS DISTINCT FROM OLD.full_name
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.profile_id IS NOT NULL THEN
      RAISE EXCEPTION 'a deleted audit actor identity is frozen (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.maintain_audit_actor_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $maintain$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.permit_audit_actor_registry(NEW.id);
    INSERT INTO public.audit_actor_identities (
      actor_id, profile_id, auth_user_id, email, full_name, registered_at
    ) VALUES (
      NEW.id,
      NEW.id,
      NEW.auth_user_id,
      NEW.email,
      NEW.full_name,
      COALESCE(NEW.created_at, clock_timestamp())
    )
    ON CONFLICT (actor_id) DO UPDATE
      SET profile_id = EXCLUDED.profile_id,
          auth_user_id = EXCLUDED.auth_user_id,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          profile_deleted_at = NULL
      WHERE public.audit_actor_identities.actor_id = EXCLUDED.actor_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM private.permit_audit_actor_registry(NEW.id);
    UPDATE public.audit_actor_identities
       SET email = NEW.email,
           full_name = NEW.full_name,
           auth_user_id = NEW.auth_user_id
     WHERE actor_id = NEW.id
       AND profile_deleted_at IS NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM private.permit_audit_actor_registry(OLD.id);
    UPDATE public.audit_actor_identities
       SET email = OLD.email,
           full_name = OLD.full_name,
           auth_user_id = OLD.auth_user_id,
           profile_deleted_at = COALESCE(profile_deleted_at, clock_timestamp())
     WHERE actor_id = OLD.id;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit actor identity maintenance is trigger-only (AUDIT_ACTOR_IDENTITY_IMMUTABLE)';
END;
$maintain$;

REVOKE ALL ON FUNCTION private.permit_audit_actor_registry(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_audit_actor_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.maintain_audit_actor_identity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_actor_identities_guard ON public.audit_actor_identities;
CREATE TRIGGER trg_audit_actor_identities_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.audit_actor_identities
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_audit_actor_identity();

-- AFTER INSERT so the profile row exists before the registry foreign key.
-- BEFORE DELETE, and named to sort after trg_enforce_superadmin_immutability,
-- so a protected founder delete raises before a registry snapshot is written.
DROP TRIGGER IF EXISTS trg_aa_audit_actor_identity_register ON public.profiles;
CREATE TRIGGER trg_aa_audit_actor_identity_register
  AFTER INSERT OR UPDATE OF email, full_name, auth_user_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.maintain_audit_actor_identity();

DROP TRIGGER IF EXISTS trg_zz_audit_actor_identity_preserve ON public.profiles;
CREATE TRIGGER trg_zz_audit_actor_identity_preserve
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.maintain_audit_actor_identity();

CREATE OR REPLACE FUNCTION public.resolve_audit_actor(p_actor_id uuid)
RETURNS TABLE (
  actor_id uuid,
  email text,
  full_name text,
  profile_id uuid,
  auth_user_id uuid,
  profile_deleted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $resolve$
DECLARE
  v_jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF NOT (
    (
      session_user IN ('postgres', 'supabase_admin')
      AND v_jwt_role IS NULL
      AND auth.uid() IS NULL
    )
    OR COALESCE(private.is_platform_admin(), false)
  ) THEN
    RAISE EXCEPTION 'audit actor resolution is restricted (AUDIT_ACTOR_RESOLUTION_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.actor_id, a.email, a.full_name, a.profile_id, a.auth_user_id, a.profile_deleted_at
  FROM public.audit_actor_identities a
  WHERE a.actor_id = p_actor_id;
END;
$resolve$;

REVOKE ALL ON FUNCTION public.resolve_audit_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_audit_actor(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_audit_actor(uuid) IS
  'Resolves one audit actor UUID from the durable registry, including after the profile row is gone. Does not read or write audit_events.';

-- The guard is now installed. Re-check that moving the foreign key and
-- adding triggers did not rewrite historical audit rows or drop enforcement.
DO $audit_final$
BEGIN
  IF current_setting('otp.allow_audit_purge', true) = 'on' THEN
    RAISE EXCEPTION 'refusing to finish while otp.allow_audit_purge is on';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class rel ON rel.oid = t.tgrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE NOT t.tgisinternal
      AND nsp.nspname = 'public'
      AND rel.relname = 'audit_events'
      AND t.tgname = 'audit_events_no_update'
      AND t.tgenabled = 'O'
      AND pg_get_triggerdef(t.oid) LIKE '%prevent_audit_mutation%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class rel ON rel.oid = t.tgrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE NOT t.tgisinternal
      AND nsp.nspname = 'public'
      AND rel.relname = 'audit_events'
      AND t.tgname = 'audit_events_no_delete'
      AND t.tgenabled = 'O'
      AND pg_get_triggerdef(t.oid) LIKE '%prevent_audit_mutation%'
  ) THEN
    RAISE EXCEPTION 'refusing to finish: INV-071 and INV-072 triggers are not enforced';
  END IF;

  IF EXISTS (
    SELECT * FROM otp_audit_preservation_before
    EXCEPT
    SELECT * FROM public.audit_events
  ) THEN
    RAISE EXCEPTION 'final check failed: existing audit_events rows changed';
  END IF;
END
$audit_final$;

COMMIT;

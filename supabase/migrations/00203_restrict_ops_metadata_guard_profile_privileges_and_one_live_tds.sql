-- Migration 00203: Restrict ops metadata, guard privileged profile columns and
-- enforce one live TDS deduction per invoice
--
-- R9. platform_environment_settings and otp_schema_migrations (00125) were
--     SELECT USING (true) for anon and authenticated, and
--     assert_production_data_integrity() (00125:561, SECURITY DEFINER,
--     returns environment and table counts) was executable by anon. No client
--     or edge function reads either table or calls the function; the only
--     readers are ops scripts connecting as postgres, the two SECURITY
--     DEFINER SQL readers (private.is_production_environment,
--     assert_production_data_integrity), and the keep-alive script, which
--     only needs a database round trip. Reads go to platform admins
--     (service_role and the owner bypass RLS); anon loses table and function
--     access. public.platform_heartbeat() returns {"ok": true} and reads no
--     table, so the keep-alive keeps working without exposing anything.
--
-- R5 (partial). private.is_platform_admin() (00179) trusts
--     profiles.is_platform_admin and profiles.email against a whitelist, and
--     profiles_update / profiles_insert (00004) let a user write any column of
--     their own row. A signed-in user could therefore make themselves a
--     platform admin. A BEFORE INSERT OR UPDATE trigger now rejects, for
--     callers that are not platform admins, service_role or JWT-less
--     sessions: setting or changing is_platform_admin, using a whitelisted
--     admin email, and changing status / deleted_at / blocked_* (self-unblock).
--     The JWT / auth.users email whitelist itself is unchanged.
--
-- R6. The 00199 unique index uq_tds_deductions_one_live_per_invoice is skipped
--     if duplicate live rows exist. The index creation is retried here with a
--     WARNING naming the duplicates count, a trigger rejects any new live
--     duplicate (insert, un-void or re-point) for every caller, and
--     public.admin_list_duplicate_live_tds() lets platform admins see existing
--     duplicates. No TDS row is deleted, voided or changed.
--
-- Idempotent and non-destructive: DROP POLICY / DROP TRIGGER IF EXISTS +
-- CREATE, CREATE OR REPLACE FUNCTION, CREATE INDEX IF NOT EXISTS; no table,
-- column or row is dropped, deleted or updated.

BEGIN;

-- ---------------------------------------------------------------------------
-- R9.1 platform_environment_settings: platform admins only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "platform_env_read" ON public.platform_environment_settings;
CREATE POLICY "platform_env_read" ON public.platform_environment_settings
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

REVOKE ALL ON public.platform_environment_settings FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- R9.2 otp_schema_migrations: platform admins only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "otp_schema_migrations_read" ON public.otp_schema_migrations;
DROP POLICY IF EXISTS "otp_schema_migrations_admin_read" ON public.otp_schema_migrations;
CREATE POLICY "otp_schema_migrations_admin_read" ON public.otp_schema_migrations
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

REVOKE ALL ON public.otp_schema_migrations FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- R9.3 Integrity report is for ops sessions only; content-free heartbeat
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.assert_production_data_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_production_data_integrity() TO service_role;

CREATE OR REPLACE FUNCTION public.platform_heartbeat()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object('ok', true);
$$;

REVOKE ALL ON FUNCTION public.platform_heartbeat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_heartbeat() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- R5 Privileged profile columns cannot be self-assigned
-- ---------------------------------------------------------------------------

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

DROP TRIGGER IF EXISTS trg_aa_guard_profile_privileges ON public.profiles;
CREATE TRIGGER trg_aa_guard_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- R6.1 One live TDS deduction per invoice, whatever the caller
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_one_live_tds_per_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.status = 'VOIDED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status <> 'VOIDED' AND OLD.invoice_id = NEW.invoice_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.tds_deductions t
    WHERE t.invoice_id = NEW.invoice_id
      AND t.status <> 'VOIDED'
      AND t.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Invoice % already has a live TDS deduction; void it before recording another (TDS-ONE-LIVE-PER-INVOICE)', NEW.invoice_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_one_live_tds_per_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_one_live_tds_per_invoice ON public.tds_deductions;
CREATE TRIGGER trg_enforce_one_live_tds_per_invoice
  BEFORE INSERT OR UPDATE OF status, invoice_id ON public.tds_deductions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_one_live_tds_per_invoice();

-- ---------------------------------------------------------------------------
-- R6.2 Retry the unique index; report duplicates instead of touching them
-- ---------------------------------------------------------------------------

DO $tds_idx$
DECLARE
  v_dup_invoices integer;
BEGIN
  SELECT count(*) INTO v_dup_invoices
  FROM (
    SELECT invoice_id FROM public.tds_deductions
    WHERE status <> 'VOIDED'
    GROUP BY invoice_id HAVING count(*) > 1
  ) d;

  IF v_dup_invoices > 0 THEN
    RAISE WARNING '00203: % invoice(s) have more than one live TDS deduction; uq_tds_deductions_one_live_per_invoice not created. New duplicates are blocked by trg_enforce_one_live_tds_per_invoice. List them with public.admin_list_duplicate_live_tds(), void the extras through an audited correction, then re-run this block.', v_dup_invoices;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_deductions_one_live_per_invoice
      ON public.tds_deductions (invoice_id)
      WHERE status <> 'VOIDED';
    RAISE NOTICE '00203: uq_tds_deductions_one_live_per_invoice present';
  END IF;
END
$tds_idx$;

-- ---------------------------------------------------------------------------
-- R6.3 Admin-visible duplicate check (read-only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_duplicate_live_tds()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT COALESCE(COALESCE(auth.role(), '') = 'service_role' OR private.is_platform_admin(), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  SELECT COALESCE(jsonb_agg(d ORDER BY d.invoice_id), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      t.invoice_id,
      count(*) AS live_count,
      sum(t.tds_amount) AS live_tds_total,
      jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status, 'tds_amount', t.tds_amount, 'created_at', t.created_at)
                ORDER BY t.created_at) AS deductions
    FROM public.tds_deductions t
    WHERE t.status <> 'VOIDED'
    GROUP BY t.invoice_id
    HAVING count(*) > 1
  ) d;

  RETURN jsonb_build_object(
    'ok', true,
    'unique_index_present', to_regclass('public.uq_tds_deductions_one_live_per_invoice') IS NOT NULL,
    'duplicates', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_duplicate_live_tds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_duplicate_live_tds() TO authenticated, service_role;

COMMIT;

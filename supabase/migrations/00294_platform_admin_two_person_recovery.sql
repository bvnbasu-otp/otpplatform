-- Two-person platform administration.
--
-- Founder initiates is_platform_admin / is_founder changes. A different
-- active platform admin approves. Nobody approves their own request or
-- their own grant. Email lists and JWT email claims are not authority.
--
-- The first two operators are created only by bootstrap_platform_operators,
-- a database-operator session (postgres or supabase_admin, not an
-- application role). break_glass_platform_account is the audited operator
-- path that may suspend even a recovery principal. Ordinary RPCs cannot
-- drop the live set below one active founder and two active platform admins.
-- No account is permanently immune.
--
-- This migration does not change grant_legal_reviewer, verified_legal_actor,
-- or legal enforcement. It does not add an emergency override for org
-- membership, publish, award, spend, quorum, or conflict of interest.
-- Those existing bypasses are unchanged and remain a separate gap.

BEGIN;

CREATE OR REPLACE FUNCTION private.profile_is_active_operator(p_status text, p_deleted_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED')
     AND p_deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION private.profile_is_active_operator(text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_database_operator()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     OR COALESCE(current_setting('role', true), '') IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'Platform recovery requires the database operator session (PLATFORM_OPERATOR_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_database_operator() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_recovery_floor_after(
  p_subject uuid,
  p_founder boolean,
  p_admin boolean,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_founders int;
  v_admins int;
BEGIN
  IF current_setting('otp.platform_break_glass', true) = 'on'
     OR current_setting('otp.platform_bootstrap', true) = 'on' THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE is_founder)::int,
    count(*) FILTER (WHERE is_platform_admin)::int
  INTO v_founders, v_admins
  FROM public.profiles
  WHERE id IS DISTINCT FROM p_subject
    AND private.profile_is_active_operator(status, deleted_at);

  IF p_active AND p_founder THEN
    v_founders := v_founders + 1;
  END IF;
  IF p_active AND p_admin THEN
    v_admins := v_admins + 1;
  END IF;

  IF v_founders < 1 OR v_admins < 2 THEN
    RAISE EXCEPTION 'Ordinary operations cannot remove the last recovery path (PLATFORM_LAST_RECOVERY_PATH)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_recovery_floor_after(uuid, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.platform_privilege_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claim text NOT NULL CHECK (claim IN ('IS_PLATFORM_ADMIN', 'IS_FOUNDER')),
  requested_value boolean NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  initiated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  CHECK (initiated_by <> subject_profile_id),
  CHECK (decided_by IS NULL OR decided_by <> initiated_by),
  CHECK (decided_by IS NULL OR decided_by <> subject_profile_id)
);

CREATE UNIQUE INDEX platform_privilege_requests_one_pending
  ON public.platform_privilege_requests (subject_profile_id, claim)
  WHERE status = 'PENDING';

ALTER TABLE public.platform_privilege_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_privilege_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.audit_platform_privilege(
  p_event text,
  p_actor uuid,
  p_subject uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (p_event, p_actor, 'profile', p_subject::text, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION private.audit_platform_privilege(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT COALESCE(
    (
      SELECT true
      FROM public.profiles
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND is_founder = true
        AND private.profile_is_active_operator(status, deleted_at)
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION private.is_founder() IS
  'Active database is_founder claim for the JWT subject. No email match.';

GRANT EXECUTE ON FUNCTION private.is_founder() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL
     AND nullif(current_setting('request.jwt.claim.role', true), '') IS NULL
     AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;

  RETURN COALESCE(
    (
      SELECT true
      FROM public.profiles
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND is_platform_admin = true
        AND private.profile_is_active_operator(status, deleted_at)
      LIMIT 1
    ),
    false
  );
END;
$$;

COMMENT ON FUNCTION private.is_platform_admin() IS
  'Active database is_platform_admin claim for the JWT subject. No email list and no JWT email claim.';

GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION private.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (
      SELECT id
      FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND COALESCE(status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED')
        AND deleted_at IS NULL
      LIMIT 1
    ),
    (
      SELECT id
      FROM public.profiles
      WHERE id = auth.uid()
        AND COALESCE(status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'DELETED')
        AND deleted_at IS NULL
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_privileged boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_platform_admin, false) OR COALESCE(NEW.is_founder, false) THEN
      IF current_setting('otp.platform_privilege_write', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Platform claims are granted only through the audited functions (PLATFORM_PRIVILEGE_IMMUTABLE)'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF COALESCE(auth.role(), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'ACTIVE';
    NEW.deleted_at := NULL;
    NEW.blocked_at := NULL;
    NEW.blocked_reason := NULL;
    NEW.blocked_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
     OR NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    IF current_setting('otp.platform_privilege_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Platform claims change only through the audited functions (PLATFORM_PRIVILEGE_IMMUTABLE)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_privileged := COALESCE(OLD.is_platform_admin, false)
    OR COALESCE(OLD.is_founder, false)
    OR COALESCE(NEW.is_platform_admin, false)
    OR COALESCE(NEW.is_founder, false);

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by THEN
    IF v_privileged THEN
      IF current_setting('otp.platform_privilege_write', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Recovery-principal status changes only through the audited functions (PLATFORM_PRIVILEGE_IMMUTABLE)'
          USING ERRCODE = '42501';
      END IF;
    ELSIF current_setting('otp.platform_privilege_write', true) IS DISTINCT FROM 'on'
      AND COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
      AND NOT COALESCE(private.is_platform_admin(), false) THEN
      RAISE EXCEPTION 'Only a platform admin can change account status (PROFILE-PRIVILEGE)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_privileged AND (
       NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
    OR NEW.is_founder IS DISTINCT FROM OLD.is_founder
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    PERFORM private.assert_recovery_floor_after(
      OLD.id,
      COALESCE(NEW.is_founder, false),
      COALESCE(NEW.is_platform_admin, false),
      private.profile_is_active_operator(NEW.status, NEW.deleted_at)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_profile_privileges() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private_security.enforce_superadmin_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, private_security, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'private_security' AND table_name = 'admin_whitelist'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM private_security.admin_whitelist
        WHERE lower(email) = lower(OLD.email)
      ) THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Cannot delete protected root SuperAdmin account %', OLD.email;
      END IF;
    END IF;

    PERFORM private.assert_recovery_floor_after(OLD.id, false, false, false);
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

CREATE OR REPLACE FUNCTION public.bootstrap_platform_operators(
  p_founder uuid,
  p_second_admin uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_founders int;
  v_admins int;
BEGIN
  PERFORM private.assert_database_operator();
  IF p_founder IS NULL OR p_second_admin IS NULL OR p_founder = p_second_admin
     OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Bootstrap requires two distinct people and a reason (PLATFORM_BOOTSTRAP_REFUSED)'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*) FILTER (WHERE is_founder)::int,
    count(*) FILTER (WHERE is_platform_admin)::int
  INTO v_founders, v_admins
  FROM public.profiles
  WHERE private.profile_is_active_operator(status, deleted_at);

  IF v_founders >= 1 AND v_admins >= 2 THEN
    RAISE EXCEPTION 'Bootstrap is closed once two active platform admins and a founder exist (PLATFORM_BOOTSTRAP_CLOSED)'
      USING ERRCODE = '42501';
  END IF;

  IF (
    SELECT count(*) FROM public.profiles
    WHERE id IN (p_founder, p_second_admin)
      AND private.profile_is_active_operator(status, deleted_at)
  ) <> 2 THEN
    RAISE EXCEPTION 'Both bootstrap subjects must be active profiles (PLATFORM_BOOTSTRAP_REFUSED)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('otp.platform_bootstrap', 'on', true);
  PERFORM set_config('otp.platform_privilege_write', 'on', true);
  UPDATE public.profiles
  SET is_founder = (id = p_founder),
      is_platform_admin = true,
      updated_at = clock_timestamp()
  WHERE id IN (p_founder, p_second_admin);
  PERFORM set_config('otp.platform_privilege_write', 'off', true);
  PERFORM set_config('otp.platform_bootstrap', 'off', true);

  PERFORM private.audit_platform_privilege(
    'platform.bootstrap_operators',
    NULL,
    p_founder,
    jsonb_build_object('second_admin', p_second_admin, 'reason', btrim(p_reason), 'operator', session_user)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_platform_operators(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_platform_operators(uuid, uuid, text) TO postgres;

CREATE OR REPLACE FUNCTION public.break_glass_platform_account(
  p_subject uuid,
  p_is_platform_admin boolean,
  p_is_founder boolean,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_auth uuid;
BEGIN
  PERFORM private.assert_database_operator();
  IF p_subject IS NULL OR btrim(COALESCE(p_reason, '')) = ''
     OR COALESCE(p_status, '') NOT IN ('ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED') THEN
    RAISE EXCEPTION 'Break-glass requires a subject, a real status, and a reason (PLATFORM_BREAK_GLASS_REFUSED)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_subject) THEN
    RAISE EXCEPTION 'Break-glass subject does not exist (PLATFORM_BREAK_GLASS_REFUSED)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('otp.platform_break_glass', 'on', true);
  PERFORM set_config('otp.platform_privilege_write', 'on', true);
  UPDATE public.profiles
  SET is_platform_admin = COALESCE(p_is_platform_admin, false),
      is_founder = COALESCE(p_is_founder, false),
      status = p_status,
      blocked_at = CASE WHEN p_status = 'ACTIVE' THEN NULL ELSE clock_timestamp() END,
      blocked_reason = CASE WHEN p_status = 'ACTIVE' THEN NULL ELSE btrim(p_reason) END,
      deleted_at = CASE WHEN p_status = 'DELETED' THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE id = p_subject
  RETURNING auth_user_id INTO v_auth;

  IF p_status IN ('BLOCKED', 'SUSPENDED', 'DELETED') AND v_auth IS NOT NULL THEN
    UPDATE auth.users
    SET banned_until = '2099-12-31 23:59:59+00'
    WHERE id = v_auth;
    DELETE FROM auth.sessions WHERE user_id = v_auth;
    UPDATE auth.refresh_tokens
    SET revoked = true
    WHERE user_id = v_auth::text;
  ELSIF p_status = 'ACTIVE' AND v_auth IS NOT NULL THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = v_auth;
  END IF;

  PERFORM set_config('otp.platform_privilege_write', 'off', true);
  PERFORM set_config('otp.platform_break_glass', 'off', true);
  PERFORM private.audit_platform_privilege(
    'platform.break_glass',
    NULL,
    p_subject,
    jsonb_build_object(
      'is_platform_admin', COALESCE(p_is_platform_admin, false),
      'is_founder', COALESCE(p_is_founder, false),
      'status', p_status,
      'reason', btrim(p_reason),
      'operator', session_user
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.break_glass_platform_account(uuid, boolean, boolean, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.break_glass_platform_account(uuid, boolean, boolean, text, text) TO postgres;

CREATE OR REPLACE FUNCTION public.request_platform_privilege(
  p_subject uuid,
  p_claim text,
  p_value boolean,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT COALESCE(private.is_founder(), false) THEN
    RAISE EXCEPTION 'Only an active founder can initiate a platform claim change (PLATFORM_PRIVILEGE_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  IF p_subject IS NULL OR p_subject = v_actor OR p_value IS NULL
     OR p_claim NOT IN ('IS_PLATFORM_ADMIN', 'IS_FOUNDER')
     OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A founder cannot promote themselves, and the request must name another person (PLATFORM_SELF_PROMOTION)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_subject AND private.profile_is_active_operator(status, deleted_at)
  ) THEN
    RAISE EXCEPTION 'The subject must be an active profile (PLATFORM_PRIVILEGE_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.platform_privilege_requests (
    subject_profile_id, claim, requested_value, initiated_by, reason
  ) VALUES (
    p_subject, p_claim, p_value, v_actor, btrim(p_reason)
  )
  RETURNING id INTO v_id;

  PERFORM private.audit_platform_privilege(
    'platform.privilege_requested',
    v_actor,
    p_subject,
    jsonb_build_object('request_id', v_id, 'claim', p_claim, 'requested_value', p_value, 'reason', btrim(p_reason))
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_platform_privilege(uuid, text, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_platform_privilege(uuid, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_platform_privilege(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_req public.platform_privilege_requests%ROWTYPE;
  v_founder boolean;
  v_admin boolean;
  v_active boolean;
BEGIN
  IF v_actor IS NULL OR NOT COALESCE(private.is_platform_admin(), false) THEN
    RAISE EXCEPTION 'Only an active platform admin can approve a platform claim change (PLATFORM_PRIVILEGE_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req
  FROM public.platform_privilege_requests
  WHERE id = p_request_id AND status = 'PENDING'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending platform claim request exists (PLATFORM_PRIVILEGE_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  IF v_actor = v_req.initiated_by OR v_actor = v_req.subject_profile_id THEN
    RAISE EXCEPTION 'The initiator and the subject cannot approve this request (PLATFORM_SELF_APPROVAL)'
      USING ERRCODE = '42501';
  END IF;

  SELECT is_founder, is_platform_admin, private.profile_is_active_operator(status, deleted_at)
  INTO v_founder, v_admin, v_active
  FROM public.profiles
  WHERE id = v_req.subject_profile_id
  FOR UPDATE;

  IF v_req.claim = 'IS_FOUNDER' THEN
    v_founder := v_req.requested_value;
  ELSE
    v_admin := v_req.requested_value;
  END IF;

  PERFORM private.assert_recovery_floor_after(v_req.subject_profile_id, v_founder, v_admin, v_active);
  PERFORM set_config('otp.platform_privilege_write', 'on', true);
  UPDATE public.profiles
  SET is_founder = v_founder,
      is_platform_admin = v_admin,
      updated_at = clock_timestamp()
  WHERE id = v_req.subject_profile_id;
  UPDATE public.platform_privilege_requests
  SET status = 'APPROVED', decided_by = v_actor, decided_at = clock_timestamp()
  WHERE id = v_req.id;
  PERFORM set_config('otp.platform_privilege_write', 'off', true);

  PERFORM private.audit_platform_privilege(
    'platform.privilege_approved',
    v_actor,
    v_req.subject_profile_id,
    jsonb_build_object(
      'request_id', v_req.id,
      'claim', v_req.claim,
      'requested_value', v_req.requested_value,
      'initiated_by', v_req.initiated_by
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_platform_privilege(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_platform_privilege(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_block_users(
  p_user_ids uuid[],
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_trimmed_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Administrative block / policy enforcement');
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
  v_founders int;
  v_admins int;
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  IF (
    SELECT count(*) FROM public.profiles WHERE id = ANY(p_user_ids)
  ) <> array_length(p_user_ids, 1) THEN
    RAISE EXCEPTION 'Every target profile must exist (PLATFORM_BLOCK_REFUSED)'
      USING ERRCODE = '42501';
  END IF;

  -- One check for the whole set. Checking each row alone would let a
  -- single call drop two of three admins, because each row still sees the other.
  SELECT
    count(*) FILTER (WHERE is_founder)::int,
    count(*) FILTER (WHERE is_platform_admin)::int
  INTO v_founders, v_admins
  FROM public.profiles
  WHERE private.profile_is_active_operator(status, deleted_at)
    AND id <> ALL (p_user_ids);
  IF v_founders < 1 OR v_admins < 2 THEN
    RAISE EXCEPTION 'Ordinary operations cannot remove the last recovery path (PLATFORM_LAST_RECOVERY_PATH)'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids);

  PERFORM set_config('otp.platform_privilege_write', 'on', true);

  UPDATE auth.users
  SET banned_until = '2099-12-31 23:59:59+00'
  WHERE id = ANY(v_target_auth_ids);

  DELETE FROM auth.sessions
  WHERE user_id = ANY(v_target_auth_ids);

  UPDATE auth.refresh_tokens
  SET revoked = true
  WHERE user_id IN (SELECT id::text FROM unnest(v_target_auth_ids) AS id);

  UPDATE public.profiles
  SET status = 'BLOCKED',
      blocked_at = clock_timestamp(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = clock_timestamp()
  WHERE id = ANY(v_target_profile_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.suppliers
  SET status = 'SUSPENDED',
      blocked_at = clock_timestamp(),
      blocked_reason = v_trimmed_reason,
      blocked_by = v_admin_id,
      updated_at = clock_timestamp()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(v_target_profile_ids)
  );

  PERFORM set_config('otp.platform_privilege_write', 'off', true);

  PERFORM private.audit_platform_privilege(
    'admin.bulk_block_users',
    v_admin_id,
    v_target_profile_ids[1],
    jsonb_build_object(
      'targetProfileIds', v_target_profile_ids,
      'targetAuthIds', v_target_auth_ids,
      'affectedCount', v_count,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully blocked %s user account(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_block_users(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_block_users(uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_bulk_unblock_users(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids);

  IF v_target_profile_ids IS NULL OR array_length(v_target_profile_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No matching user accounts found to unblock.');
  END IF;

  PERFORM set_config('otp.platform_privilege_write', 'on', true);

  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = ANY(v_target_auth_ids);

  UPDATE public.profiles
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      deleted_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = ANY(v_target_profile_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('otp.platform_privilege_write', 'off', true);

  UPDATE public.suppliers
  SET status = 'ACTIVE',
      blocked_at = NULL,
      blocked_reason = NULL,
      blocked_by = NULL,
      updated_at = clock_timestamp()
  WHERE id IN (
    SELECT supplier_id FROM public.supplier_users WHERE profile_id = ANY(v_target_profile_ids)
  );

  PERFORM private.audit_platform_privilege(
    'admin.bulk_unblock_users',
    v_admin_id,
    v_target_profile_ids[1],
    jsonb_build_object(
      'targetProfileIds', v_target_profile_ids,
      'affectedCount', v_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully unblocked and reactivated %s user account(s).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_unblock_users(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_unblock_users(uuid[]) TO authenticated, service_role;

-- Role context reports the database founder claim. It does not grant authority
-- from an email address, and a platform-admin session still has no buyer or
-- supplier organization membership in this payload.
CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_side signup_side;
  v_admin boolean;
  v_founder boolean := false;
  v_active text;
  v_roles jsonb;
  v_active_org_id uuid;
  v_org_role text := NULL;
  v_org_id uuid := NULL;
  v_org_name text := NULL;
  v_org_type text := NULL;
  v_organizations jsonb;
  v_email text;
  v_full_name text;
  v_title text;
  v_avatar_url text;
  v_phone text;
  v_status text := 'ACTIVE';
  v_blocked_at timestamptz := NULL;
  v_blocked_reason text := NULL;
  v_is_blocked boolean := false;
  v_auth_uid uuid;
  v_supplier_id uuid := NULL;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false, 'isFounder', false, 'isPlatformAdmin', false);
  END IF;

  SELECT email, is_platform_admin, is_founder, active_role_code, active_organization_id, full_name, title, avatar_url, phone,
         COALESCE(status, 'ACTIVE'), blocked_at, blocked_reason, auth_user_id
  INTO v_email, v_admin, v_founder, v_active, v_active_org_id, v_full_name, v_title, v_avatar_url, v_phone,
       v_status, v_blocked_at, v_blocked_reason, v_auth_uid
  FROM profiles WHERE id = v_profile;

  IF v_status <> 'BLOCKED' AND v_status <> 'DELETED' AND v_status <> 'SUSPENDED' THEN
    IF EXISTS (
      SELECT 1 FROM public.supplier_users su
      JOIN public.suppliers s ON s.id = su.supplier_id
      WHERE (su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid))
        AND (s.status = 'SUSPENDED' OR s.blocked_at IS NOT NULL)
    ) THEN
      v_status := 'BLOCKED';
      v_is_blocked := true;
      IF v_blocked_reason IS NULL THEN
        SELECT blocked_reason INTO v_blocked_reason
        FROM public.suppliers s
        JOIN public.supplier_users su ON su.supplier_id = s.id
        WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_status = 'BLOCKED' OR v_status = 'SUSPENDED' OR v_status = 'DELETED' OR v_blocked_at IS NOT NULL THEN
    v_is_blocked := true;
  END IF;

  IF v_admin IS TRUE THEN
    RETURN jsonb_build_object(
      'signedIn', true,
      'profileId', v_profile,
      'side', NULL,
      'isPlatformAdmin', true,
      'isFounder', COALESCE(v_founder, false),
      'needsOnboarding', false,
      'activeRole', NULL,
      'roles', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'orgRole', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'buyerType', NULL,
      'committeeRfqCount', 0,
      'supplierId', NULL,
      'fullName', v_full_name,
      'title', COALESCE(v_title, 'Platform Super Administrator'),
      'avatarUrl', v_avatar_url,
      'email', v_email,
      'phone', COALESCE(v_phone, '+91 99729 67530'),
      'isBlocked', v_is_blocked,
      'status', v_status
    );
  END IF;

  v_side := private.profile_side(v_profile);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', ur.code,
    'label', ur.label,
    'side', ur.side,
    'description', ur.description,
    'permissions', to_jsonb(ur.permissions),
    'assignedByAdmin', pr.assigned_by IS NOT NULL
  ) ORDER BY ur.sort_order), '[]'::jsonb)
  INTO v_roles
  FROM profile_roles pr
  JOIN user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile
    AND (v_side IS NULL OR ur.side = v_side);

  IF v_side = 'SUPPLIER' AND (v_roles IS NULL OR jsonb_array_length(v_roles) = 0) THEN
    v_active := COALESCE(v_active, 'SUPPLIER_FOUNDER');
    v_roles := jsonb_build_array(jsonb_build_object(
      'code', 'SUPPLIER_FOUNDER',
      'label', 'Supplier Founder / Owner',
      'side', 'SUPPLIER',
      'description', 'Full commercial authority for quoting, contracts, and work order delivery.',
      'permissions', '["READ", "WRITE", "PROPOSE", "APPROVE", "AWARD"]'::jsonb,
      'assignedByAdmin', false
    ));
  END IF;

  IF v_active IS NULL AND jsonb_array_length(v_roles) > 0 THEN
    v_active := v_roles -> 0 ->> 'code';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'orgType', o.org_type::text,
    'role', om.role::text,
    'isPersonal', (o.org_type::text = 'INDIVIDUAL'),
    'status', COALESCE(o.status, 'ACTIVE')
  ) ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name), '[]'::jsonb)
  INTO v_organizations
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid);

  IF v_active_org_id IS NOT NULL THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE (om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid))
      AND o.id = v_active_org_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND (v_side = 'BUYER' OR v_side IS NULL) THEN
    SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
           o.org_type::text AS org_type
    INTO v_org_role, v_org_id, v_org_name, v_org_type
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
    ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
    LIMIT 1;

    IF v_org_id IS NULL AND (
      to_regprocedure('private.is_personal_buyer_profile(uuid)') IS NOT NULL
      AND private.is_personal_buyer_profile(v_profile)
    ) THEN
      v_org_role := 'OWNER';
      v_org_type := 'INDIVIDUAL';
    ELSIF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)
      VALUES (COALESCE(NULLIF(btrim(v_full_name), ''), 'Self'), 'INDIVIDUAL', 'ACTIVE', 1, 0)
      RETURNING id, name, org_type::text INTO v_org_id, v_org_name, v_org_type;

      v_org_role := 'OWNER';

      INSERT INTO public.organization_members (organization_id, profile_id, role)
      VALUES (v_org_id, v_profile, 'OWNER')
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles
      SET active_organization_id = v_org_id,
          active_portal_side = COALESCE(active_portal_side, 'BUYER'),
          updated_at = now()
      WHERE id = v_profile;

      v_organizations := jsonb_build_array(jsonb_build_object(
        'id', v_org_id,
        'name', v_org_name,
        'orgType', v_org_type,
        'role', v_org_role,
        'isPersonal', true,
        'status', 'ACTIVE'
      ));
    END IF;
  END IF;

  SELECT COALESCE(
    (
      SELECT su.supplier_id
      FROM public.supplier_users su
      WHERE su.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND su.profile_id = v_auth_uid)
      LIMIT 1
    ),
    (
      SELECT s.id
      FROM public.suppliers s
      WHERE lower(s.contact_email) = lower(v_email)
      LIMIT 1
    )
  ) INTO v_supplier_id;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', false,
    'isFounder', COALESCE(v_founder, false),
    'needsOnboarding', (
      CASE
        WHEN v_side = 'SUPPLIER' THEN false
        WHEN v_active IS NULL OR (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL) THEN true
        ELSE false
      END
    ),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', code,
        'label', label,
        'side', side,
        'description', description,
        'permissions', to_jsonb(permissions)
      )
      FROM user_roles
      WHERE code = v_active
    ),
    'roles', v_roles,
    'organizations', v_organizations,
    'orgRole', v_org_role,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'buyerType', v_org_type,
    'committeeRfqCount', (
      SELECT count(DISTINCT r.id)::int
      FROM rfqs r
      WHERE r.status IN ('EVALUATING', 'CLOSED')
        AND (v_org_id IS NULL OR r.organization_id = v_org_id)
    ),
    'supplierId', v_supplier_id,
    'fullName', v_full_name,
    'title', v_title,
    'avatarUrl', v_avatar_url,
    'email', v_email,
    'phone', v_phone,
    'isBlocked', v_is_blocked,
    'blockedReason', v_blocked_reason,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, anon, service_role;

-- Replaced functions keep their historical owner (postgres). New functions
-- created by supabase_admin must be owned by postgres too, or the postgres-owned
-- triggers cannot execute them.
ALTER FUNCTION private.profile_is_active_operator(text, timestamptz) OWNER TO postgres;
ALTER FUNCTION private.assert_database_operator() OWNER TO postgres;
ALTER FUNCTION private.assert_recovery_floor_after(uuid, boolean, boolean, boolean) OWNER TO postgres;
ALTER FUNCTION private.audit_platform_privilege(text, uuid, uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.bootstrap_platform_operators(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.break_glass_platform_account(uuid, boolean, boolean, text, text) OWNER TO postgres;
ALTER FUNCTION public.request_platform_privilege(uuid, text, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.approve_platform_privilege(uuid) OWNER TO postgres;

COMMIT;

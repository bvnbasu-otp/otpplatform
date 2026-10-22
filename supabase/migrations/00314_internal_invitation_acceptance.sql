-- 00314: Secure internal invitation lifecycle.
--
-- In-place token storage (not a second phased migration):
--   * 00298 created public.internal_invitations.invitation_token as plaintext.
--   * No view, later migration, or application query reads that column after this file.
--   * Existing hashes are backfilled with private.hash_invitation_token (SHA-256)
--     in this same transaction, then the plaintext column and its index are dropped.
--   * If the backfill or the hash check fails, the transaction rolls back and the
--     plaintext column remains.
-- Login does not accept invitations. This migration creates no trigger on
-- auth.users or public.profiles, and it does not replace the session role context.
-- Ordinary invitations cannot grant SUPER_ADMIN or change platform-admin flags.
-- The two-person recovery workflow is unchanged and is not given a bypass here.
BEGIN;

ALTER TABLE public.internal_invitations
  ADD COLUMN IF NOT EXISTS invitation_token_hash text;

UPDATE public.internal_invitations
SET invitation_token_hash = private.hash_invitation_token(invitation_token)
WHERE invitation_token_hash IS NULL;

ALTER TABLE public.internal_invitations
  DROP CONSTRAINT IF EXISTS chk_internal_invitation_token_hash_format;

ALTER TABLE public.internal_invitations
  ADD CONSTRAINT chk_internal_invitation_token_hash_format
  CHECK (invitation_token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.internal_invitations
  ALTER COLUMN invitation_token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_invitations_token_hash
  ON public.internal_invitations (invitation_token_hash);

DROP INDEX IF EXISTS public.idx_internal_invitations_token;

ALTER TABLE public.internal_invitations
  DROP COLUMN IF EXISTS invitation_token;

-- One pending invitation per email. Revoke older duplicates before the unique index.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(email)
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.internal_invitations
  WHERE status = 'PENDING'
)
UPDATE public.internal_invitations AS invitation
SET status = 'REVOKED',
    revoked_by = invitation.invited_by,
    revoked_at = clock_timestamp(),
    revocation_reason = 'Superseded while enforcing one pending invitation per email'
FROM ranked
WHERE invitation.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_invitations_one_pending_email
  ON public.internal_invitations (lower(email))
  WHERE status = 'PENDING';

-- Direct writes cannot smuggle a SUPER_ADMIN invitation. Status changes on an
-- existing row are allowed; changing or inserting that role is not.
CREATE OR REPLACE FUNCTION private.guard_internal_invitation_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_role_code text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_role_code
  FROM public.internal_roles
  WHERE id = NEW.role_id;

  IF v_role_code = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'SUPER_ADMIN cannot be granted through ordinary invitations; use the two-person recovery workflow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_internal_invitation_role ON public.internal_invitations;
CREATE TRIGGER trg_guard_internal_invitation_role
  BEFORE INSERT OR UPDATE OF role_id ON public.internal_invitations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_internal_invitation_role();

REVOKE ALL ON FUNCTION private.guard_internal_invitation_role() FROM PUBLIC, anon, authenticated;

-- Create invitations server-side. The raw token is returned once and is not stored.
CREATE OR REPLACE FUNCTION public.create_internal_invitation_atomic(
  p_email text,
  p_role_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz := clock_timestamp() + interval '48 hours';
  v_role_code text;
BEGIN
  IF auth.uid() IS NULL OR v_caller IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an authenticated platform administrator can create internal invitations.'
      USING ERRCODE = '42501';
  END IF;

  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid invitation email address.'
      USING ERRCODE = '22023';
  END IF;

  SELECT code INTO v_role_code
  FROM public.internal_roles
  WHERE id = p_role_id;

  IF v_role_code IS NULL THEN
    RAISE EXCEPTION 'The selected internal role does not exist.'
      USING ERRCODE = '22023';
  END IF;

  -- Platform-admin elevation uses the separate two-person recovery workflow.
  IF v_role_code = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'SUPER_ADMIN cannot be granted through ordinary invitations; use the two-person recovery workflow.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize create/supersede for this email, then lock the pending rows.
  PERFORM pg_advisory_xact_lock(hashtext(v_email)::bigint);

  PERFORM invitation.id
  FROM public.internal_invitations AS invitation
  WHERE lower(invitation.email) = v_email
    AND invitation.status = 'PENDING'
  FOR UPDATE;

  UPDATE public.internal_invitations
  SET status = 'REVOKED',
      revoked_by = v_caller,
      revoked_at = clock_timestamp(),
      revocation_reason = 'Superseded by a newer invitation'
  WHERE lower(email) = v_email
    AND status = 'PENDING';

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.internal_invitations (
    email, role_id, invited_by, invitation_token_hash, status, expires_at
  ) VALUES (
    v_email, p_role_id, v_caller, private.hash_invitation_token(v_token), 'PENDING', v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'internal_invitation.created',
    v_caller,
    'internal_invitation',
    v_invitation_id::text,
    jsonb_build_object(
      'email', v_email,
      'role_code', v_role_code,
      'expires_at', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invitationId', v_invitation_id,
    'email', v_email,
    'roleId', p_role_id,
    'roleCode', v_role_code,
    'token', v_token,
    'inviteUrl', '/internal-invite/' || v_token,
    'expiresAt', v_expires_at
  );
END;
$$;

-- Accept only while authenticated as the invited, verified email.
-- Assignment and the lifecycle update share the caller's transaction.
-- A successful login does not call this function.
CREATE OR REPLACE FUNCTION public.accept_internal_invitation_atomic(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_email text;
  v_auth_email text;
  v_status text;
  v_deleted_at timestamptz;
  v_confirmed_at timestamptz;
  v_email_verified boolean := false;
  v_is_platform_admin boolean := false;
  v_inv public.internal_invitations%ROWTYPE;
  v_role_code text;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'Sign in with the invited account before accepting this invitation.'
      USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or missing invitation token.');
  END IF;

  SELECT * INTO v_inv
  FROM public.internal_invitations
  WHERE invitation_token_hash = private.hash_invitation_token(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This internal invitation link is invalid.');
  END IF;

  IF v_inv.status = 'ACCEPTED' THEN
    IF v_inv.accepted_profile_id = v_profile THEN
      RETURN jsonb_build_object('ok', true, 'alreadyAccepted', true, 'roleCode',
        (SELECT code FROM public.internal_roles WHERE id = v_inv.role_id));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has already been accepted.');
  END IF;

  IF v_inv.status = 'REVOKED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has been revoked.');
  END IF;

  IF v_inv.status = 'EXPIRED' OR v_inv.expires_at <= clock_timestamp() THEN
    UPDATE public.internal_invitations
    SET status = 'EXPIRED'
    WHERE id = v_inv.id AND status = 'PENDING';
    RETURN jsonb_build_object('ok', false, 'error', 'This internal invitation has expired. Ask an administrator to issue a new one.');
  END IF;

  SELECT lower(p.email),
         COALESCE(p.status, 'ACTIVE'),
         p.deleted_at,
         COALESCE(p.is_platform_admin, false),
         lower(u.email),
         u.email_confirmed_at
  INTO v_email, v_status, v_deleted_at, v_is_platform_admin, v_auth_email, v_confirmed_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = auth.uid()
  WHERE p.id = v_profile;

  IF NOT FOUND
     OR v_auth_email IS NULL
     OR v_email IS NULL
     OR v_auth_email <> v_email
     OR v_status IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING')
     OR v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The signed-in account is not eligible to accept this invitation.');
  END IF;

  IF lower(v_inv.email) <> v_auth_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation was sent to a different email address. Sign in with the invited email.');
  END IF;

  v_email_verified := v_confirmed_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.audit_events
      WHERE actor_id = v_profile
        AND event_type = 'profile.email_verified'
        AND lower(COALESCE(payload->>'credential_value', '')) = v_auth_email
    );

  IF NOT v_email_verified THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Verify the signed-in email address before accepting an internal invitation.');
  END IF;

  SELECT code INTO v_role_code FROM public.internal_roles WHERE id = v_inv.role_id;

  -- Never insert a SUPER_ADMIN assignment from an invitation. A legacy pending
  -- invite can only be closed when that exact active role is already held.
  IF v_role_code = 'SUPER_ADMIN' AND (
    NOT COALESCE(v_is_platform_admin, false) OR NOT EXISTS (
      SELECT 1 FROM public.internal_user_assignments
      WHERE profile_id = v_profile AND role_id = v_inv.role_id
    )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'SUPER_ADMIN access must be established through the two-person recovery workflow.'
    );
  END IF;

  UPDATE public.internal_invitations
  SET status = 'ACCEPTED',
      accepted_at = clock_timestamp(),
      accepted_profile_id = v_profile
  WHERE id = v_inv.id AND status = 'PENDING';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has already been accepted.');
  END IF;

  IF v_role_code IS DISTINCT FROM 'SUPER_ADMIN' THEN
    INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
    VALUES (v_profile, v_inv.role_id, v_inv.invited_by)
    ON CONFLICT (profile_id, role_id) DO NOTHING;
  END IF;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'internal_invitation.accepted',
    v_profile,
    'internal_invitation',
    v_inv.id::text,
    jsonb_build_object(
      'role_code', v_role_code,
      'accepted_profile_id', v_profile
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyAccepted', false,
    'invitationId', v_inv.id,
    'roleCode', v_role_code,
    'acceptedAt', clock_timestamp()
  );
END;
$$;

-- Revoke through a database-derived actor profile and an audited reason.
CREATE OR REPLACE FUNCTION public.revoke_internal_invitation_atomic(
  p_invitation_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_inv public.internal_invitations%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_caller IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an authenticated platform administrator can revoke internal invitations.'
      USING ERRCODE = '42501';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to revoke an internal invitation.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inv
  FROM public.internal_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found.');
  END IF;

  IF v_inv.status <> 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a pending invitation can be revoked.');
  END IF;

  IF v_inv.expires_at <= clock_timestamp() THEN
    UPDATE public.internal_invitations
    SET status = 'EXPIRED'
    WHERE id = v_inv.id AND status = 'PENDING';
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation has expired and cannot be revoked as pending.');
  END IF;

  UPDATE public.internal_invitations
  SET status = 'REVOKED',
      revoked_by = v_caller,
      revoked_at = clock_timestamp(),
      revocation_reason = v_reason
  WHERE id = v_inv.id AND status = 'PENDING';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a pending invitation can be revoked.');
  END IF;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'internal_invitation.revoked',
    v_caller,
    'internal_invitation',
    v_inv.id::text,
    jsonb_build_object('reason', v_reason)
  );

  RETURN jsonb_build_object('ok', true, 'invitationId', v_inv.id, 'status', 'REVOKED');
END;
$$;

-- Legacy reconciliation never grants a role. It closes a pending invitation only
-- when an eligible verified profile already holds that exact active assignment.
CREATE OR REPLACE FUNCTION public.reconcile_internal_invitation_atomic(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_inv public.internal_invitations%ROWTYPE;
  v_profile uuid;
  v_profile_status text;
  v_deleted_at timestamptz;
  v_auth_email text;
  v_confirmed_at timestamptz;
  v_email_verified boolean := false;
  v_role_code text;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_caller IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an authenticated platform administrator can reconcile a legacy invitation.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.internal_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found.');
  END IF;

  IF v_inv.status <> 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a pending invitation can be reconciled.');
  END IF;

  IF v_inv.expires_at <= clock_timestamp() THEN
    UPDATE public.internal_invitations SET status = 'EXPIRED' WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation has expired; issue a new invitation instead.');
  END IF;

  SELECT p.id, COALESCE(p.status, 'ACTIVE'), p.deleted_at, lower(u.email), u.email_confirmed_at
  INTO v_profile, v_profile_status, v_deleted_at, v_auth_email, v_confirmed_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = COALESCE(p.auth_user_id, p.id)
  WHERE lower(p.email) = lower(v_inv.email)
    AND lower(u.email) = lower(p.email)
  ORDER BY p.created_at ASC
  LIMIT 1;

  v_email_verified := v_profile IS NOT NULL AND (
    v_confirmed_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.audit_events
      WHERE actor_id = v_profile
        AND event_type = 'profile.email_verified'
        AND lower(COALESCE(payload->>'credential_value', '')) = lower(v_inv.email)
    )
  );

  IF v_profile IS NULL
     OR NOT v_email_verified
     OR v_profile_status IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING')
     OR v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No eligible active profile exists for this invited email.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.internal_user_assignments
    WHERE profile_id = v_profile AND role_id = v_inv.role_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The matching profile does not already hold the invited role. Use the secure acceptance link instead.');
  END IF;

  UPDATE public.internal_invitations
  SET status = 'ACCEPTED',
      accepted_at = clock_timestamp(),
      accepted_profile_id = v_profile
  WHERE id = v_inv.id AND status = 'PENDING';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a pending invitation can be reconciled.');
  END IF;

  SELECT code INTO v_role_code FROM public.internal_roles WHERE id = v_inv.role_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'internal_invitation.reconciled',
    v_caller,
    'internal_invitation',
    v_inv.id::text,
    jsonb_build_object(
      'profile_id', v_profile,
      'role_code', v_role_code,
      'granted_role', false
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciled', true,
    'invitationId', v_inv.id,
    'profileId', v_profile,
    'roleCode', v_role_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_internal_invitation_atomic(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_internal_invitation_atomic(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_internal_invitation_atomic(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_internal_invitation_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_invitation_atomic(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_internal_invitation_atomic(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_internal_invitation_atomic(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_internal_invitation_atomic(uuid) TO authenticated;

-- Clients may list invitation status. They may not read token hashes or write rows.
REVOKE ALL ON TABLE public.internal_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  email,
  role_id,
  invited_by,
  status,
  created_at,
  expires_at,
  accepted_at,
  accepted_profile_id,
  revoked_by,
  revoked_at,
  revocation_reason
) ON TABLE public.internal_invitations TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 00305: Secure internal invitation creation, acceptance, and legacy reconciliation.
-- Acceptance is email-bound to the authenticated profile and performed atomically.
BEGIN;

-- Existing rows contain legacy plaintext tokens. Hash them before dropping the plaintext column.
ALTER TABLE public.internal_invitations
  ADD COLUMN IF NOT EXISTS invitation_token_hash text;

UPDATE public.internal_invitations
SET invitation_token_hash = private.hash_invitation_token(invitation_token)
WHERE invitation_token_hash IS NULL;

ALTER TABLE public.internal_invitations
  ALTER COLUMN invitation_token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_invitations_token_hash
  ON public.internal_invitations (invitation_token_hash);

ALTER TABLE public.internal_invitations
  DROP COLUMN IF EXISTS invitation_token;

-- Create invitations server-side; return the raw token once so the admin can share the link.
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
    RAISE EXCEPTION 'Only an authenticated platform administrator can create internal invitations.';
  END IF;

  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid invitation email address.';
  END IF;

  SELECT code INTO v_role_code
  FROM public.internal_roles
  WHERE id = p_role_id;

  IF v_role_code IS NULL THEN
    RAISE EXCEPTION 'The selected internal role does not exist.';
  END IF;

  -- One active pending invitation per email. Superseded invitations are explicitly revoked.
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

-- Accept only while authenticated as the invited email. Assignment and lifecycle update share a transaction.
CREATE OR REPLACE FUNCTION public.accept_internal_invitation_atomic(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_email text;
  v_status text;
  v_deleted_at timestamptz;
  v_inv public.internal_invitations%ROWTYPE;
  v_role_code text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'Sign in with the invited account before accepting this invitation.';
  END IF;

  SELECT lower(email), COALESCE(status, 'ACTIVE'), deleted_at
  INTO v_email, v_status, v_deleted_at
  FROM public.profiles
  WHERE id = v_profile;

  IF NOT FOUND OR v_status IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING') OR v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'The signed-in profile is not eligible to accept an internal invitation.';
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

  IF lower(v_inv.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation was sent to a different email address. Sign in with the invited email.');
  END IF;

  -- Idempotent if the role was provisioned earlier; otherwise grant exactly the role named in the invitation.
  SELECT code INTO v_role_code FROM public.internal_roles WHERE id = v_inv.role_id;

  INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
  VALUES (v_profile, v_inv.role_id, v_inv.invited_by)
  ON CONFLICT (profile_id, role_id) DO NOTHING;

  -- SUPER_ADMIN invitations are issued only by an existing platform admin.
  -- Accepting that explicit invitation must align both role assignment and admin context.
  IF v_role_code = 'SUPER_ADMIN' THEN
    UPDATE public.profiles
    SET is_platform_admin = true,
        active_role_code = 'SUPER_ADMIN',
        active_portal_side = 'CONSOLE'
    WHERE id = v_profile
      AND COALESCE(status, 'ACTIVE') NOT IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING')
      AND deleted_at IS NULL;
  END IF;

  UPDATE public.internal_invitations
  SET status = 'ACCEPTED',
      accepted_at = clock_timestamp(),
      accepted_profile_id = v_profile
  WHERE id = v_inv.id AND status = 'PENDING';

  SELECT code INTO v_role_code FROM public.internal_roles WHERE id = v_inv.role_id;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyAccepted', false,
    'invitationId', v_inv.id,
    'roleCode', v_role_code,
    'acceptedAt', clock_timestamp()
  );
END;
$$;

-- Legacy reconciliation is deliberately narrower: it never grants a role.
-- It can only close a pending invitation when an active, matching profile already has that exact assignment.
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
  v_email text;
  v_role_code text;
BEGIN
  IF auth.uid() IS NULL OR v_caller IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an authenticated platform administrator can reconcile a legacy invitation.';
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

  SELECT id, COALESCE(status, 'ACTIVE'), deleted_at
  INTO v_profile, v_profile_status, v_deleted_at
  FROM public.profiles
  WHERE lower(email) = lower(v_inv.email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_profile IS NULL OR v_profile_status IN ('BLOCKED', 'SUSPENDED', 'REVOKED', 'DELETED', 'PENDING') OR v_deleted_at IS NOT NULL THEN
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

  SELECT code INTO v_role_code FROM public.internal_roles WHERE id = v_inv.role_id;

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
REVOKE ALL ON FUNCTION public.reconcile_internal_invitation_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_invitation_atomic(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_internal_invitation_atomic(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_internal_invitation_atomic(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

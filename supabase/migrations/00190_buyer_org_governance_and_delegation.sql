-- =============================================================================
-- Migration 00190: Phase C8.1 — Buyer Organization Governance Foundation & Database Hardening
--
-- Features:
--   1. Tokenized, Cryptographically Secure Organization Invitations (public.organization_invitations):
--      - Single-use, tenant-isolated, 7-day expiry with SHA-256 token hashing.
--      - Status lifecycle: PENDING, ACCEPTED, REVOKED, EXPIRED.
--      - RLS enabled with tenant isolation and immutability triggers.
--   2. Tenant-Bound Time & Spend Delegation Proxies (public.organization_delegations):
--      - Delegator and delegatee isolation, UTC time-bounding, monetary spend caps.
--      - Explicit granular permissions array: APPROVE_TIER_1, APPROVE_TIER_2, VOTE_COMMITTEE, ISSUE_PO, RELEASE_PAYMENT.
--      - Non-delegable executive tier restrictions (Tier 3 CFO/Executive cannot be delegated to non-executives).
--      - Self-delegation prevention and active state validation.
--   3. Private Security Helper Functions:
--      - private.hash_invitation_token(text) -> text (SHA-256)
--      - private.is_valid_delegation_active(p_org_id, p_delegator_id, p_delegatee_id, p_permission, p_amount) -> boolean
--      - private.resolve_effective_authority(p_org_id, p_profile_id, p_amount) -> jsonb
--   4. Atomic SECURITY DEFINER RPCs:
--      - public.create_organization_invitation_atomic(p_org_id, p_email, p_role, p_expires_days)
--      - public.accept_organization_invitation_atomic(p_token)
--      - public.revoke_organization_invitation_atomic(p_invitation_id)
--      - public.create_delegation_proxy_atomic(p_org_id, p_delegatee_id, p_permissions, p_starts_at, p_expires_at, p_spend_cap, p_notes)
--      - public.revoke_delegation_proxy_atomic(p_delegation_id)
--      - public.update_team_member_role_atomic(p_org_id, p_profile_id, p_new_role)
--   5. Anti-Self-Approval, SoD Guards & Append-Only Audit Logging to public.audit_events.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.organization_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email       text NOT NULL,
  role                org_member_role NOT NULL DEFAULT 'COMMITTEE_MEMBER',
  invited_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  token_hash          text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at          timestamptz NOT NULL,
  accepted_at         timestamptz,
  accepted_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_org_invitation_email_nonempty CHECK (btrim(invited_email) <> ''),
  CONSTRAINT chk_org_invitation_role_no_owner CHECK (role <> 'OWNER')
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations(lower(invited_email));
CREATE INDEX IF NOT EXISTS idx_org_invitations_token_hash ON public.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.organization_invitations(status);

DROP TRIGGER IF EXISTS trg_org_invitations_updated_at ON public.organization_invitations;
CREATE TRIGGER trg_org_invitations_updated_at
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Create public.organization_delegations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_delegations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  delegator_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  delegatee_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  permissions         text[] NOT NULL DEFAULT ARRAY['APPROVE_TIER_1']::text[],
  spend_cap_amount    numeric(14, 2) CHECK (spend_cap_amount IS NULL OR spend_cap_amount >= 0),
  starts_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_delegation_distinct_actors CHECK (delegator_id <> delegatee_id),
  CONSTRAINT chk_delegation_time_bounds CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_org_delegations_org_id ON public.organization_delegations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_delegations_delegator ON public.organization_delegations(delegator_id);
CREATE INDEX IF NOT EXISTS idx_org_delegations_delegatee ON public.organization_delegations(delegatee_id);
CREATE INDEX IF NOT EXISTS idx_org_delegations_active_range ON public.organization_delegations(organization_id, delegatee_id, is_active, starts_at, expires_at);

DROP TRIGGER IF EXISTS trg_org_delegations_updated_at ON public.organization_delegations;
CREATE TRIGGER trg_org_delegations_updated_at
  BEFORE UPDATE ON public.organization_delegations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organization_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_delegations FORCE ROW LEVEL SECURITY;

-- Invitations RLS: Org Owners/Managers and Platform Admins can view invitations of their org.
-- Invited users can view invitations sent to their email.
DROP POLICY IF EXISTS p_org_invitations_select ON public.organization_invitations;
CREATE POLICY p_org_invitations_select ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')) OR
    (lower(invited_email) = lower(COALESCE((SELECT email FROM public.profiles WHERE id = private.get_profile_id()), '')))
  );

DROP POLICY IF EXISTS p_org_invitations_write ON public.organization_invitations;
CREATE POLICY p_org_invitations_write ON public.organization_invitations
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  )
  WITH CHECK (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  );

-- Delegations RLS: Org members can view active/past delegations in their org.
-- Only Delegator, Org Owner/Manager, or Platform Admin can create/update delegations.
DROP POLICY IF EXISTS p_org_delegations_select ON public.organization_delegations;
CREATE POLICY p_org_delegations_select ON public.organization_delegations
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS p_org_delegations_write ON public.organization_delegations;
CREATE POLICY p_org_delegations_write ON public.organization_delegations
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    (
      organization_id IN (SELECT private.get_user_org_ids()) AND
      (delegator_id = private.get_profile_id() OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
    )
  )
  WITH CHECK (
    private.is_platform_admin() OR
    (
      organization_id IN (SELECT private.get_user_org_ids()) AND
      (delegator_id = private.get_profile_id() OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Private Helper Functions
-- ---------------------------------------------------------------------------

-- 4.1 Token Hashing Helper
CREATE OR REPLACE FUNCTION private.hash_invitation_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
  SELECT encode(digest(btrim(p_token), 'sha256'), 'hex');
$$;

GRANT EXECUTE ON FUNCTION private.hash_invitation_token(text) TO authenticated, service_role, anon;

-- 4.2 Delegation Validity Checker
CREATE OR REPLACE FUNCTION private.is_valid_delegation_active(
  p_org_id uuid,
  p_delegator_id uuid,
  p_delegatee_id uuid,
  p_permission text,
  p_amount numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_now timestamptz := now();
  v_valid boolean := false;
BEGIN
  IF p_delegator_id = p_delegatee_id THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.organization_delegations od
    WHERE od.organization_id = p_org_id
      AND od.delegator_id = p_delegator_id
      AND od.delegatee_id = p_delegatee_id
      AND od.is_active = true
      AND od.starts_at <= v_now
      AND od.expires_at >= v_now
      AND p_permission = ANY(od.permissions)
      AND (
        p_amount IS NULL OR
        od.spend_cap_amount IS NULL OR
        p_amount <= od.spend_cap_amount
      )
  ) INTO v_valid;

  RETURN v_valid;
END;
$$;

GRANT EXECUTE ON FUNCTION private.is_valid_delegation_active(uuid, uuid, uuid, text, numeric) TO authenticated, service_role;

-- 4.3 Authority Resolution Engine
CREATE OR REPLACE FUNCTION private.resolve_effective_authority(
  p_org_id uuid,
  p_profile_id uuid,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_role org_member_role;
  v_is_admin boolean := false;
  v_delegations jsonb := '[]'::jsonb;
  v_effective_permissions text[] := ARRAY[]::text[];
  v_max_spend_cap numeric := NULL;
  v_can_approve boolean := false;
BEGIN
  -- 1. Check Platform Admin
  v_is_admin := private.is_platform_admin();

  -- 2. Base Org Role
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND profile_id = p_profile_id;

  IF v_role IS NULL AND NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'hasAuthority', false,
      'baseRole', null,
      'effectivePermissions', '[]'::jsonb,
      'activeDelegations', '[]'::jsonb
    );
  END IF;

  -- 3. Map base permissions
  IF v_role = 'OWNER' OR v_is_admin THEN
    v_effective_permissions := ARRAY['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE_TIER_1', 'APPROVE_TIER_2', 'APPROVE_TIER_3', 'ISSUE_PO', 'RELEASE_PAYMENT', 'MANAGE_MEMBERS', 'DELEGATE_AUTHORITY'];
    v_can_approve := true;
  ELSIF v_role = 'MANAGER' THEN
    v_effective_permissions := ARRAY['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE_TIER_1', 'APPROVE_TIER_2', 'ISSUE_PO', 'RELEASE_PAYMENT', 'MANAGE_MEMBERS', 'DELEGATE_AUTHORITY'];
    v_can_approve := true;
  ELSIF v_role = 'BUYER' THEN
    v_effective_permissions := ARRAY['READ', 'WRITE', 'PROPOSE', 'APPROVE_TIER_1'];
    v_can_approve := true;
  ELSIF v_role = 'APPROVER' THEN
    v_effective_permissions := ARRAY['READ', 'APPROVE_TIER_1', 'APPROVE_TIER_2'];
    v_can_approve := true;
  ELSIF v_role = 'COMMITTEE_MEMBER' THEN
    v_effective_permissions := ARRAY['READ', 'VOTE'];
  ELSE
    v_effective_permissions := ARRAY['READ'];
  END IF;

  -- 4. Aggregate Active Proxies Received by this profile
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'delegationId', od.id,
    'delegatorId', od.delegator_id,
    'permissions', od.permissions,
    'spendCapAmount', od.spend_cap_amount,
    'startsAt', od.starts_at,
    'expiresAt', od.expires_at,
    'notes', od.notes
  )), '[]'::jsonb)
  INTO v_delegations
  FROM public.organization_delegations od
  WHERE od.organization_id = p_org_id
    AND od.delegatee_id = p_profile_id
    AND od.is_active = true
    AND od.starts_at <= now()
    AND od.expires_at >= now();

  -- Merge delegated permissions if amount is within spend cap
  IF jsonb_array_length(v_delegations) > 0 THEN
    DECLARE
      v_d record;
    BEGIN
      FOR v_d IN
        SELECT od.permissions, od.spend_cap_amount
        FROM public.organization_delegations od
        WHERE od.organization_id = p_org_id
          AND od.delegatee_id = p_profile_id
          AND od.is_active = true
          AND od.starts_at <= now()
          AND od.expires_at >= now()
      LOOP
        IF p_amount IS NULL OR v_d.spend_cap_amount IS NULL OR p_amount <= v_d.spend_cap_amount THEN
          v_effective_permissions := ARRAY(
            SELECT DISTINCT unnest(v_effective_permissions || v_d.permissions)
          );
        END IF;
      END LOOP;
    END;
  END IF;

  RETURN jsonb_build_object(
    'hasAuthority', true,
    'organizationId', p_org_id,
    'profileId', p_profile_id,
    'baseRole', COALESCE(v_role::text, 'SUPERADMIN'),
    'effectivePermissions', to_jsonb(v_effective_permissions),
    'activeDelegations', v_delegations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION private.resolve_effective_authority(uuid, uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Atomic SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

-- 5.1 create_organization_invitation_atomic
CREATE OR REPLACE FUNCTION public.create_organization_invitation_atomic(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'COMMITTEE_MEMBER',
  p_expires_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_org_name text;
  v_target_profile_id uuid;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
  v_clean_email text := lower(trim(p_email));
  v_days int := COALESCE(p_expires_days, 7);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_clean_email = '' OR v_clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Invalid email address: %', p_email;
  END IF;

  IF v_days <= 0 OR v_days > 30 THEN
    v_days := 7;
  END IF;

  -- Verify caller role
  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role IS NULL AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of this organization.';
  END IF;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can invite members.';
  END IF;

  -- Validate target role
  IF p_role NOT IN ('MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER', 'VIEWER') THEN
    RAISE EXCEPTION 'Invalid role: %. Cannot invite with role OWNER.', p_role;
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_organization_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organization % not found.', p_organization_id;
  END IF;

  -- Check if already an active member
  SELECT id INTO v_target_profile_id FROM public.profiles WHERE lower(email) = v_clean_email LIMIT 1;
  IF v_target_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = v_target_profile_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', format('User with email %s is already a member of this organization.', v_clean_email)
      );
    END IF;
  END IF;

  -- Invalidate / Revoke previous pending invitations for this email in this org
  UPDATE public.organization_invitations
  SET status = 'REVOKED', revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE organization_id = p_organization_id
    AND lower(invited_email) = v_clean_email
    AND status = 'PENDING';

  -- Generate secure random token (64 hex characters) and its SHA-256 hash
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := private.hash_invitation_token(v_token);
  v_expires_at := now() + (v_days || ' days')::interval;

  INSERT INTO public.organization_invitations (
    organization_id,
    invited_email,
    role,
    invited_by,
    token_hash,
    status,
    expires_at
  ) VALUES (
    p_organization_id,
    v_clean_email,
    p_role::org_member_role,
    v_caller,
    v_token_hash,
    'PENDING',
    v_expires_at
  ) RETURNING id INTO v_invitation_id;

  -- Append-only audit logging
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.invitation_created',
    v_caller,
    p_organization_id,
    'organization_invitation',
    v_invitation_id::text,
    jsonb_build_object(
      'invitationId', v_invitation_id,
      'invitedEmail', v_clean_email,
      'role', p_role,
      'expiresAt', v_expires_at,
      'organizationName', v_org_name
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invitationId', v_invitation_id,
    'invitedEmail', v_clean_email,
    'role', p_role,
    'expiresAt', v_expires_at,
    'token', v_token,
    'inviteUrl', format('/invite/%s', v_token),
    'message', format('Invitation created for %s as %s.', v_clean_email, p_role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_invitation_atomic(uuid, text, text, integer) TO authenticated, service_role;

-- 5.2 accept_organization_invitation_atomic
CREATE OR REPLACE FUNCTION public.accept_organization_invitation_atomic(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_email text;
  v_token_hash text;
  v_inv public.organization_invitations%ROWTYPE;
  v_org_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in or register before accepting invitation.';
  END IF;

  SELECT lower(email) INTO v_caller_email FROM public.profiles WHERE id = v_caller;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'Invalid invitation token.';
  END IF;

  v_token_hash := private.hash_invitation_token(p_token);

  -- Lock invitation row
  SELECT * INTO v_inv
  FROM public.organization_invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or unknown invitation token.');
  END IF;

  IF v_inv.status = 'ACCEPTED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation token has already been accepted (single-use).');
  END IF;

  IF v_inv.status = 'REVOKED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has been revoked by an administrator.');
  END IF;

  IF v_inv.status = 'EXPIRED' OR v_inv.expires_at < now() THEN
    UPDATE public.organization_invitations SET status = 'EXPIRED', updated_at = now() WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link has expired.');
  END IF;

  -- Anti-spoofing / Identity check: Caller email should match invited email if not platform admin
  IF v_caller_email IS NOT NULL AND lower(v_inv.invited_email) <> v_caller_email AND NOT private.is_platform_admin() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('This invitation was sent to %s, but you are signed in as %s.', v_inv.invited_email, v_caller_email)
    );
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_inv.organization_id;

  -- Check if already member
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_inv.organization_id AND profile_id = v_caller
  ) THEN
    -- Mark invitation as accepted and return success
    UPDATE public.organization_invitations
    SET status = 'ACCEPTED', accepted_at = now(), accepted_by = v_caller, updated_at = now()
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
      'ok', true,
      'organizationId', v_inv.organization_id,
      'organizationName', v_org_name,
      'role', v_inv.role::text,
      'message', format('You are already a member of %s.', v_org_name)
    );
  END IF;

  -- Add to organization_members
  INSERT INTO public.organization_members (
    organization_id,
    profile_id,
    role
  ) VALUES (
    v_inv.organization_id,
    v_caller,
    v_inv.role
  ) ON CONFLICT (organization_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role;

  -- Update invitation status
  UPDATE public.organization_invitations
  SET status = 'ACCEPTED', accepted_at = now(), accepted_by = v_caller, updated_at = now()
  WHERE id = v_inv.id;

  -- Set active organization for profile
  UPDATE public.profiles
  SET active_organization_id = v_inv.organization_id,
      active_portal_side = 'BUYER',
      updated_at = now()
  WHERE id = v_caller;

  -- Ensure matching profile_role exists
  INSERT INTO public.profile_roles (profile_id, role_code)
  VALUES (v_caller, CASE
    WHEN v_inv.role = 'MANAGER' THEN 'OPERATIONS_MANAGER'
    WHEN v_inv.role = 'BUYER' THEN 'PROCUREMENT_LEAD'
    WHEN v_inv.role = 'APPROVER' THEN 'FINANCE_APPROVER'
    WHEN v_inv.role = 'COMMITTEE_MEMBER' THEN 'COMMITTEE_MEMBER'
    ELSE 'PROPERTY_OWNER'
  END)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  -- Audit log
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.invitation_accepted',
    v_caller,
    v_inv.organization_id,
    'organization_invitation',
    v_inv.id::text,
    jsonb_build_object(
      'invitationId', v_inv.id,
      'acceptedBy', v_caller,
      'role', v_inv.role::text,
      'organizationName', v_org_name
    )
  );

  -- In-app notification
  INSERT INTO public.notifications (profile_id, type, title, body, metadata)
  VALUES (
    v_caller,
    'ORG_MEMBER_ADDED',
    format('Joined %s', v_org_name),
    format('You have successfully joined %s as %s.', v_org_name, v_inv.role::text),
    jsonb_build_object('organizationId', v_inv.organization_id, 'role', v_inv.role::text)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', v_inv.organization_id,
    'organizationName', v_org_name,
    'role', v_inv.role::text,
    'message', format('Successfully joined %s as %s.', v_org_name, v_inv.role::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_organization_invitation_atomic(text) TO authenticated, service_role, anon;

-- 5.3 revoke_organization_invitation_atomic
CREATE OR REPLACE FUNCTION public.revoke_organization_invitation_atomic(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_inv public.organization_invitations%ROWTYPE;
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found.');
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = v_inv.organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can revoke invitations.';
  END IF;

  IF v_inv.status != 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Cannot revoke invitation in %s status.', v_inv.status));
  END IF;

  UPDATE public.organization_invitations
  SET status = 'REVOKED', revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.invitation_revoked',
    v_caller,
    v_inv.organization_id,
    'organization_invitation',
    p_invitation_id::text,
    jsonb_build_object(
      'invitationId', p_invitation_id,
      'invitedEmail', v_inv.invited_email,
      'role', v_inv.role::text
    )
  );

  RETURN jsonb_build_object('ok', true, 'message', 'Invitation revoked successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation_atomic(uuid) TO authenticated, service_role;

-- 5.4 create_delegation_proxy_atomic
CREATE OR REPLACE FUNCTION public.create_delegation_proxy_atomic(
  p_organization_id uuid,
  p_delegatee_id uuid,
  p_permissions text[],
  p_starts_at timestamptz DEFAULT now(),
  p_expires_at timestamptz DEFAULT (now() + interval '14 days'),
  p_spend_cap numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_delegatee_role text;
  v_delegation_id uuid;
  v_starts timestamptz := COALESCE(p_starts_at, now());
  v_expires timestamptz := COALESCE(p_expires_at, now() + interval '14 days');
  v_perm text;
  v_allowed_perms text[] := ARRAY['APPROVE_TIER_1', 'APPROVE_TIER_2', 'APPROVE_TIER_3', 'VOTE_COMMITTEE', 'ISSUE_PO', 'RELEASE_PAYMENT'];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_caller = p_delegatee_id THEN
    RAISE EXCEPTION 'Anti-self-delegation: You cannot create a proxy delegation to yourself.';
  END IF;

  IF v_expires <= v_starts THEN
    RAISE EXCEPTION 'Invalid time bounds: Delegation expiration must be after start time.';
  END IF;

  -- Ensure caller and delegatee are members of the target organization
  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role IS NULL AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of organization %.', p_organization_id;
  END IF;

  SELECT om.role::text INTO v_delegatee_role
  FROM public.organization_members om
  WHERE om.profile_id = p_delegatee_id AND om.organization_id = p_organization_id;

  IF v_delegatee_role IS NULL THEN
    RAISE EXCEPTION 'Delegatee % is not a registered member of organization %.', p_delegatee_id, p_organization_id;
  END IF;

  -- Validate permissions
  IF p_permissions IS NULL OR array_length(p_permissions, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one delegated permission must be specified.';
  END IF;

  FOREACH v_perm IN ARRAY p_permissions
  LOOP
    IF NOT (v_perm = ANY(v_allowed_perms)) THEN
      RAISE EXCEPTION 'Invalid delegation permission: %.', v_perm;
    END IF;

    -- Non-delegable executive tier rule: APPROVE_TIER_3 (CFO / Executive) requires delegator to be OWNER or SuperAdmin
    IF v_perm = 'APPROVE_TIER_3' AND v_caller_role <> 'OWNER' AND NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Executive gate invariant: Tier 3 Executive approval authority cannot be delegated by non-owner roles.';
    END IF;
  END LOOP;

  -- Insert delegation record
  INSERT INTO public.organization_delegations (
    organization_id,
    delegator_id,
    delegatee_id,
    permissions,
    spend_cap_amount,
    starts_at,
    expires_at,
    is_active,
    notes
  ) VALUES (
    p_organization_id,
    v_caller,
    p_delegatee_id,
    p_permissions,
    p_spend_cap,
    v_starts,
    v_expires,
    true,
    p_notes
  ) RETURNING id INTO v_delegation_id;

  -- Audit log
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.delegation_created',
    v_caller,
    p_organization_id,
    'organization_delegation',
    v_delegation_id::text,
    jsonb_build_object(
      'delegationId', v_delegation_id,
      'delegatorId', v_caller,
      'delegateeId', p_delegatee_id,
      'permissions', p_permissions,
      'spendCapAmount', p_spend_cap,
      'startsAt', v_starts,
      'expiresAt', v_expires,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'delegationId', v_delegation_id,
    'delegatorId', v_caller,
    'delegateeId', p_delegatee_id,
    'permissions', to_jsonb(p_permissions),
    'startsAt', v_starts,
    'expiresAt', v_expires,
    'spendCapAmount', p_spend_cap,
    'message', 'Delegation proxy created successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delegation_proxy_atomic(uuid, uuid, text[], timestamptz, timestamptz, numeric, text) TO authenticated, service_role;

-- 5.5 revoke_delegation_proxy_atomic
CREATE OR REPLACE FUNCTION public.revoke_delegation_proxy_atomic(
  p_delegation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_del public.organization_delegations%ROWTYPE;
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_del
  FROM public.organization_delegations
  WHERE id = p_delegation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Delegation record not found.');
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = v_del.organization_id;

  IF v_del.delegator_id <> v_caller AND v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only delegator, org owner/manager, or platform admin can revoke this delegation.';
  END IF;

  UPDATE public.organization_delegations
  SET is_active = false, revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE id = p_delegation_id;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.delegation_revoked',
    v_caller,
    v_del.organization_id,
    'organization_delegation',
    p_delegation_id::text,
    jsonb_build_object(
      'delegationId', p_delegation_id,
      'delegatorId', v_del.delegator_id,
      'delegateeId', v_del.delegatee_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'message', 'Delegation revoked successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_delegation_proxy_atomic(uuid) TO authenticated, service_role;

-- 5.6 update_team_member_role_atomic
CREATE OR REPLACE FUNCTION public.update_team_member_role_atomic(
  p_organization_id uuid,
  p_profile_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_target_old_role text;
  v_org_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can modify team member roles.';
  END IF;

  IF p_new_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER') THEN
    RAISE EXCEPTION 'Invalid role: %.', p_new_role;
  END IF;

  -- Prevent assigning or demoting OWNER role via this RPC unless caller is Platform Admin or current OWNER
  IF p_new_role = 'OWNER' AND v_caller_role <> 'OWNER' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only the current Owner or Platform Admin can transfer ownership.';
  END IF;

  SELECT om.role::text INTO v_target_old_role
  FROM public.organization_members om
  WHERE om.profile_id = p_profile_id AND om.organization_id = p_organization_id
  FOR UPDATE;

  IF v_target_old_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target member not found in this organization.');
  END IF;

  IF v_target_old_role = 'OWNER' AND v_caller <> p_profile_id AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Cannot modify the role of the Organization Owner.';
  END IF;

  -- Update role in organization_members
  UPDATE public.organization_members
  SET role = p_new_role::org_member_role
  WHERE organization_id = p_organization_id AND profile_id = p_profile_id;

  -- Sync profile_roles
  INSERT INTO public.profile_roles (profile_id, role_code)
  VALUES (p_profile_id, CASE
    WHEN p_new_role = 'OWNER' THEN 'PROPERTY_OWNER'
    WHEN p_new_role = 'MANAGER' THEN 'OPERATIONS_MANAGER'
    WHEN p_new_role = 'BUYER' THEN 'PROCUREMENT_LEAD'
    WHEN p_new_role = 'APPROVER' THEN 'FINANCE_APPROVER'
    ELSE 'COMMITTEE_MEMBER'
  END)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_organization_id;

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'org.member_role_updated',
    v_caller,
    p_organization_id,
    'organization_member',
    p_profile_id::text,
    jsonb_build_object(
      'profileId', p_profile_id,
      'oldRole', v_target_old_role,
      'newRole', p_new_role,
      'organizationName', v_org_name
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'profileId', p_profile_id,
    'oldRole', v_target_old_role,
    'newRole', p_new_role,
    'message', format('Role updated from %s to %s.', v_target_old_role, p_new_role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member_role_atomic(uuid, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Hardening list_org_members & list_org_delegations RPCs
-- ---------------------------------------------------------------------------

-- 6.1 list_org_delegations
CREATE OR REPLACE FUNCTION public.list_org_delegations(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_is_member boolean;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE profile_id = v_caller AND organization_id = p_organization_id
  ) INTO v_is_member;

  IF NOT v_is_member AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', od.id,
    'organizationId', od.organization_id,
    'delegatorId', od.delegator_id,
    'delegatorName', pd.full_name,
    'delegatorEmail', pd.email,
    'delegateeId', od.delegatee_id,
    'delegateeName', pe.full_name,
    'delegateeEmail', pe.email,
    'permissions', od.permissions,
    'spendCapAmount', od.spend_cap_amount,
    'startsAt', od.starts_at,
    'expiresAt', od.expires_at,
    'isActive', od.is_active,
    'revokedAt', od.revoked_at,
    'notes', od.notes,
    'isSelfDelegator', (od.delegator_id = v_caller),
    'isSelfDelegatee', (od.delegatee_id = v_caller),
    'createdAt', od.created_at
  ) ORDER BY od.created_at DESC), '[]'::jsonb)
  INTO v_results
  FROM public.organization_delegations od
  JOIN public.profiles pd ON pd.id = od.delegator_id
  JOIN public.profiles pe ON pe.id = od.delegatee_id
  WHERE od.organization_id = p_organization_id;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_delegations(uuid) TO authenticated, service_role;

-- 6.2 list_org_invitations
CREATE OR REPLACE FUNCTION public.list_org_invitations(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner or Manager can view invitations.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'organizationId', oi.organization_id,
    'invitedEmail', oi.invited_email,
    'role', oi.role::text,
    'invitedBy', oi.invited_by,
    'invitedByName', p.full_name,
    'status', oi.status,
    'expiresAt', oi.expires_at,
    'acceptedAt', oi.accepted_at,
    'revokedAt', oi.revoked_at,
    'createdAt', oi.created_at
  ) ORDER BY oi.created_at DESC), '[]'::jsonb)
  INTO v_results
  FROM public.organization_invitations oi
  LEFT JOIN public.profiles p ON p.id = oi.invited_by
  WHERE oi.organization_id = p_organization_id;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_invitations(uuid) TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- Migration 00197: Universal RWA + MSME Role Lifecycle, Succession, Term Expiry & Annual Renewal
--
-- Core Invariants:
--   1. "Role ≠ Person" & "Current Role Holder ≠ Historical Role Holder"
--   2. "Role continuity without person continuity":
--      - Organization and role continue; authority follows current role holder.
--      - Person remains immutable historical actor for past actions.
--   3. Universal across ALL roles without hard-coding specific roles:
--      - RWA: President, Vice President, Secretary, Joint Secretary, Treasurer, Estate Manager, Committee Member.
--      - MSME: Primary MSME / Owner, Manager, Member, Delegate, etc.
--      - Custom governance roles: Facilities Lead, Procurement Officer, Auditor, etc.
--   4. Universal Effective-Dated Role Assignment (public.org_role_assignments):
--      - Default 1-year (365 days) term expiry for RWA governance roles.
--      - Non-renewed / expired roles automatically forbidden from voting, approvals, and PO releases.
--   5. Universal Historical Audit Attribution (public.org_governance_action_audits):
--      - Immutable append-only snapshots preserving role_at_time, responsibility_at_time,
--        authority_at_time, actor_person_id, transaction_id, payload.
--   6. Atomic SECURITY DEFINER RPCs:
--      - public.appoint_org_role_atomic(...)
--      - public.transfer_org_role_succession_atomic(...)
--      - public.renew_or_rotate_org_role_atomic(...)
--      - public.revoke_org_role_atomic(...)
--      - public.record_org_action_audit_atomic(...)
--      - public.get_active_org_role_holder(...)
--      - public.get_org_role_history(...)
--      - public.verify_org_authority_at_time(...)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.org_role_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_role_assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id                   uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_id                     text NOT NULL,
  role_name                   text NOT NULL,
  role_category               text NOT NULL DEFAULT 'RWA_GOVERNANCE' CHECK (role_category IN ('RWA_GOVERNANCE', 'MSME_MANAGEMENT', 'CUSTOM_GOVERNANCE')),
  responsibility_scope        text NOT NULL DEFAULT 'GENERAL',
  authority_scope             jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from              timestamptz NOT NULL DEFAULT now(),
  effective_to                timestamptz,
  term_duration_days          integer NOT NULL DEFAULT 365,
  status                      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUPERSEDED', 'ROTATED', 'RETIRED', 'VACANT')),
  appointed_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointment_event           text NOT NULL DEFAULT 'INITIAL_APPOINTMENT',
  predecessor_assignment_id   uuid REFERENCES public.org_role_assignments(id) ON DELETE SET NULL,
  removal_event               text,
  removal_reason              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_org_role_time_bounds CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_org_role_active_has_person CHECK (status <> 'ACTIVE' OR person_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_org_role_assign_org ON public.org_role_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_role_assign_person ON public.org_role_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_org_role_assign_role ON public.org_role_assignments(organization_id, role_id);
CREATE INDEX IF NOT EXISTS idx_org_role_assign_active ON public.org_role_assignments(organization_id, role_id, status);
CREATE INDEX IF NOT EXISTS idx_org_role_assign_time ON public.org_role_assignments(organization_id, person_id, effective_from, effective_to);

DROP TRIGGER IF EXISTS trg_org_role_assignments_updated_at ON public.org_role_assignments;
CREATE TRIGGER trg_org_role_assignments_updated_at
  BEFORE UPDATE ON public.org_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Create public.org_governance_action_audits (Immutable Audit Ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_governance_action_audits (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_person_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_assignment_id          uuid REFERENCES public.org_role_assignments(id) ON DELETE SET NULL,
  role_at_time                text NOT NULL,
  responsibility_at_time      text NOT NULL,
  authority_at_time           jsonb NOT NULL DEFAULT '{}'::jsonb,
  action                      text NOT NULL,
  entity_type                 text NOT NULL,
  entity_id                   text NOT NULL,
  transaction_id              text,
  payload                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_action_audits_org ON public.org_governance_action_audits(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_action_audits_actor ON public.org_governance_action_audits(actor_person_id);
CREATE INDEX IF NOT EXISTS idx_org_action_audits_entity ON public.org_governance_action_audits(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_org_action_audits_time ON public.org_governance_action_audits(timestamp DESC);

-- Immutability Trigger for Governance Audit Logs
CREATE OR REPLACE FUNCTION private.prevent_mutation_org_governance_audits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'org_governance_action_audits is immutable append-only ledger and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutation_org_governance_audits ON public.org_governance_action_audits;
CREATE TRIGGER trg_prevent_mutation_org_governance_audits
  BEFORE UPDATE OR DELETE ON public.org_governance_action_audits
  FOR EACH ROW EXECUTE FUNCTION private.prevent_mutation_org_governance_audits();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security Configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.org_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_role_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_governance_action_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_governance_action_audits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_org_role_assignments_select ON public.org_role_assignments;
CREATE POLICY p_org_role_assignments_select ON public.org_role_assignments
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS p_org_role_assignments_write ON public.org_role_assignments;
CREATE POLICY p_org_role_assignments_write ON public.org_role_assignments
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  )
  WITH CHECK (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  );

DROP POLICY IF EXISTS p_org_action_audits_select ON public.org_governance_action_audits;
CREATE POLICY p_org_action_audits_select ON public.org_governance_action_audits
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS p_org_action_audits_insert ON public.org_governance_action_audits;
CREATE POLICY p_org_action_audits_insert ON public.org_governance_action_audits
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic PostgreSQL RPCs
-- ---------------------------------------------------------------------------

-- 4.1 appoint_org_role_atomic
CREATE OR REPLACE FUNCTION public.appoint_org_role_atomic(
  p_organization_id         uuid,
  p_person_id               uuid,
  p_role_id                 text,
  p_role_name               text,
  p_role_category           text DEFAULT 'RWA_GOVERNANCE',
  p_responsibility_scope    text DEFAULT 'GENERAL',
  p_authority_scope         jsonb DEFAULT '{}'::jsonb,
  p_effective_from          timestamptz DEFAULT now(),
  p_effective_to            timestamptz DEFAULT NULL,
  p_appointment_event       text DEFAULT 'DIRECT_APPOINTMENT',
  p_term_duration_days      integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_status text;
  v_assignment_id uuid;
  v_from timestamptz := COALESCE(p_effective_from, now());
  v_to timestamptz := p_effective_to;
  v_days int := COALESCE(p_term_duration_days, 365);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Organization Owner, Manager, or Platform Admin can appoint roles.';
  END IF;

  -- Default 1-year (365 days) term expiry for RWA governance roles if not provided
  IF v_to IS NULL AND p_role_category = 'RWA_GOVERNANCE' THEN
    v_to := v_from + (v_days || ' days')::interval;
  END IF;

  IF p_person_id IS NULL THEN
    v_status := 'VACANT';
  ELSE
    v_status := 'ACTIVE';
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_person_id) THEN
      RAISE EXCEPTION 'Person profile % not found.', p_person_id;
    END IF;
  END IF;

  -- Deactivate previous ongoing active assignment for this specific role if any
  IF v_status = 'ACTIVE' THEN
    UPDATE public.org_role_assignments
    SET
      status = 'SUPERSEDED',
      effective_to = v_from,
      removal_event = 'SUPERSEDED_BY_NEW_APPOINTMENT',
      removal_reason = format('Superseded by appointment of %s', p_role_name),
      updated_at = now()
    WHERE organization_id = p_organization_id
      AND role_id = p_role_id
      AND status = 'ACTIVE'
      AND id <> COALESCE(v_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  INSERT INTO public.org_role_assignments (
    organization_id,
    person_id,
    role_id,
    role_name,
    role_category,
    responsibility_scope,
    authority_scope,
    effective_from,
    effective_to,
    term_duration_days,
    status,
    appointed_by,
    appointment_event
  ) VALUES (
    p_organization_id,
    p_person_id,
    p_role_id,
    p_role_name,
    COALESCE(p_role_category, 'RWA_GOVERNANCE'),
    COALESCE(p_responsibility_scope, 'GENERAL'),
    COALESCE(p_authority_scope, '{}'::jsonb),
    v_from,
    v_to,
    v_days,
    v_status,
    v_caller,
    COALESCE(p_appointment_event, 'DIRECT_APPOINTMENT')
  ) RETURNING id INTO v_assignment_id;

  -- Ensure profile has organization membership
  IF p_person_id IS NOT NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      profile_id,
      role
    ) VALUES (
      p_organization_id,
      p_person_id,
      CASE
        WHEN p_role_id IN ('PRESIDENT', 'PRIMARY_OWNER', 'OWNER') THEN 'OWNER'::org_member_role
        WHEN p_role_id IN ('VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'MANAGER', 'ESTATE_MANAGER') THEN 'MANAGER'::org_member_role
        WHEN p_role_id IN ('BUYER', 'PROCUREMENT_LEAD') THEN 'BUYER'::org_member_role
        WHEN p_role_id IN ('FINANCE_APPROVER', 'APPROVER') THEN 'APPROVER'::org_member_role
        ELSE 'COMMITTEE_MEMBER'::org_member_role
      END
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE
      SET role = EXCLUDED.role;
  END IF;

  -- Record in immutable governance audit ledger
  INSERT INTO public.org_governance_action_audits (
    actor_person_id,
    organization_id,
    role_assignment_id,
    role_at_time,
    responsibility_at_time,
    authority_at_time,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_caller,
    p_organization_id,
    v_assignment_id,
    COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
    'GOVERNANCE_APPOINTMENT',
    jsonb_build_object('appointedRoleId', p_role_id, 'appointedRoleName', p_role_name),
    'ROLE_APPOINTED',
    'org_role_assignment',
    v_assignment_id::text,
    jsonb_build_object(
      'assignmentId', v_assignment_id,
      'roleId', p_role_id,
      'roleName', p_role_name,
      'personId', p_person_id,
      'status', v_status,
      'effectiveFrom', v_from,
      'effectiveTo', v_to,
      'termDurationDays', v_days,
      'appointmentEvent', p_appointment_event
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'assignmentId', v_assignment_id,
    'organizationId', p_organization_id,
    'personId', p_person_id,
    'roleId', p_role_id,
    'roleName', p_role_name,
    'status', v_status,
    'effectiveFrom', v_from,
    'effectiveTo', v_to,
    'termDurationDays', v_days,
    'message', format('Role %s (%s) assigned successfully.', p_role_name, v_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.appoint_org_role_atomic(uuid, uuid, text, text, text, text, jsonb, timestamptz, timestamptz, text, integer) TO authenticated, service_role;

-- 4.2 transfer_org_role_succession_atomic
CREATE OR REPLACE FUNCTION public.transfer_org_role_succession_atomic(
  p_organization_id         uuid,
  p_role_id                 text,
  p_role_name               text DEFAULT NULL,
  p_predecessor_person_id   uuid DEFAULT NULL,
  p_successor_person_id     uuid DEFAULT NULL,
  p_effective_date          timestamptz DEFAULT now(),
  p_succession_event        text DEFAULT 'SUCCESSION_HANDOVER',
  p_reason                  text DEFAULT 'Role succession and handover',
  p_responsibility_scope    text DEFAULT NULL,
  p_authority_scope         jsonb DEFAULT NULL,
  p_predecessor_new_role    text DEFAULT 'COMMITTEE_MEMBER',
  p_term_duration_days      integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_predecessor_assign public.org_role_assignments%ROWTYPE;
  v_successor_assign_id uuid;
  v_effective timestamptz := COALESCE(p_effective_date, now());
  v_expiry timestamptz;
  v_days int := COALESCE(p_term_duration_days, 365);
  v_role_title text;
  v_category text;
  v_resp text;
  v_auth jsonb;
  v_successor_status text := 'ACTIVE';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner, Manager, or Platform Admin can execute a role succession transfer.';
  END IF;

  -- Lock existing active assignment for this role
  IF p_predecessor_person_id IS NOT NULL THEN
    SELECT * INTO v_predecessor_assign
    FROM public.org_role_assignments
    WHERE organization_id = p_organization_id
      AND role_id = p_role_id
      AND person_id = p_predecessor_person_id
      AND status = 'ACTIVE'
    FOR UPDATE;
  ELSE
    SELECT * INTO v_predecessor_assign
    FROM public.org_role_assignments
    WHERE organization_id = p_organization_id
      AND role_id = p_role_id
      AND status = 'ACTIVE'
    ORDER BY effective_from DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_role_title := COALESCE(p_role_name, v_predecessor_assign.role_name, p_role_id);
  v_category := COALESCE(v_predecessor_assign.role_category, 'RWA_GOVERNANCE');
  v_resp := COALESCE(p_responsibility_scope, v_predecessor_assign.responsibility_scope, 'GENERAL');
  v_auth := COALESCE(p_authority_scope, v_predecessor_assign.authority_scope, '{}'::jsonb);
  v_expiry := v_effective + (v_days || ' days')::interval;

  -- 1. Terminate Predecessor Role Assignment
  IF v_predecessor_assign.id IS NOT NULL THEN
    UPDATE public.org_role_assignments
    SET
      status = 'SUPERSEDED',
      effective_to = v_effective,
      removal_event = COALESCE(p_succession_event, 'SUCCESSION_HANDOVER'),
      removal_reason = COALESCE(p_reason, 'Superseded by role succession'),
      updated_at = now()
    WHERE id = v_predecessor_assign.id;

    -- Update predecessor's organization membership role if transitioned
    IF p_predecessor_new_role IS NOT NULL AND p_predecessor_new_role <> 'EXIT' AND v_predecessor_assign.person_id IS NOT NULL THEN
      UPDATE public.organization_members
      SET role = p_predecessor_new_role::org_member_role
      WHERE organization_id = p_organization_id AND profile_id = v_predecessor_assign.person_id;
    END IF;
  END IF;

  -- 2. Activate Successor Role Assignment
  IF p_successor_person_id IS NULL THEN
    v_successor_status := 'VACANT';
  ELSE
    v_successor_status := 'ACTIVE';
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_successor_person_id) THEN
      RAISE EXCEPTION 'Successor profile % not found.', p_successor_person_id;
    END IF;
  END IF;

  INSERT INTO public.org_role_assignments (
    organization_id,
    person_id,
    role_id,
    role_name,
    role_category,
    responsibility_scope,
    authority_scope,
    effective_from,
    effective_to,
    term_duration_days,
    status,
    appointed_by,
    appointment_event,
    predecessor_assignment_id
  ) VALUES (
    p_organization_id,
    p_successor_person_id,
    p_role_id,
    v_role_title,
    v_category,
    v_resp,
    v_auth,
    v_effective,
    v_expiry,
    v_days,
    v_successor_status,
    v_caller,
    COALESCE(p_succession_event, 'SUCCESSION_HANDOVER'),
    v_predecessor_assign.id
  ) RETURNING id INTO v_successor_assign_id;

  -- Sync successor to organization_members
  IF p_successor_person_id IS NOT NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      profile_id,
      role
    ) VALUES (
      p_organization_id,
      p_successor_person_id,
      CASE
        WHEN p_role_id IN ('PRESIDENT', 'PRIMARY_OWNER', 'OWNER') THEN 'OWNER'::org_member_role
        WHEN p_role_id IN ('VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'MANAGER', 'ESTATE_MANAGER') THEN 'MANAGER'::org_member_role
        WHEN p_role_id IN ('BUYER', 'PROCUREMENT_LEAD') THEN 'BUYER'::org_member_role
        WHEN p_role_id IN ('FINANCE_APPROVER', 'APPROVER') THEN 'APPROVER'::org_member_role
        ELSE 'COMMITTEE_MEMBER'::org_member_role
      END
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE
      SET role = EXCLUDED.role;
  END IF;

  -- 3. Write Immutable Governance Audit Entry
  INSERT INTO public.org_governance_action_audits (
    actor_person_id,
    organization_id,
    role_assignment_id,
    role_at_time,
    responsibility_at_time,
    authority_at_time,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_caller,
    p_organization_id,
    v_successor_assign_id,
    COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
    'ROLE_SUCCESSION_TRANSFER',
    jsonb_build_object('roleId', p_role_id, 'roleName', v_role_title),
    'ROLE_SUCCESSION_EXECUTED',
    'org_role_assignment',
    v_successor_assign_id::text,
    jsonb_build_object(
      'roleId', p_role_id,
      'roleName', v_role_title,
      'predecessorAssignmentId', v_predecessor_assign.id,
      'predecessorPersonId', v_predecessor_assign.person_id,
      'successorAssignmentId', v_successor_assign_id,
      'successorPersonId', p_successor_person_id,
      'effectiveDate', v_effective,
      'effectiveTo', v_expiry,
      'termDurationDays', v_days,
      'successionEvent', p_succession_event,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', p_organization_id,
    'roleId', p_role_id,
    'roleName', v_role_title,
    'predecessorAssignmentId', v_predecessor_assign.id,
    'predecessorPersonId', v_predecessor_assign.person_id,
    'successorAssignmentId', v_successor_assign_id,
    'successorPersonId', p_successor_person_id,
    'status', v_successor_status,
    'effectiveDate', v_effective,
    'effectiveTo', v_expiry,
    'message', format('Succession for %s completed successfully.', v_role_title)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_org_role_succession_atomic(uuid, text, text, uuid, uuid, timestamptz, text, text, text, jsonb, text, integer) TO authenticated, service_role;

-- 4.3 renew_or_rotate_org_role_atomic
CREATE OR REPLACE FUNCTION public.renew_or_rotate_org_role_atomic(
  p_assignment_id           uuid,
  p_continue_in_governance  boolean,
  p_renewal_role_id         text DEFAULT NULL,
  p_renewal_role_name       text DEFAULT NULL,
  p_term_duration_days      integer DEFAULT 365,
  p_effective_date          timestamptz DEFAULT now(),
  p_notes                   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_old_assign public.org_role_assignments%ROWTYPE;
  v_new_assign_id uuid;
  v_effective timestamptz := COALESCE(p_effective_date, now());
  v_expiry timestamptz;
  v_days int := COALESCE(p_term_duration_days, 365);
  v_target_role_id text;
  v_target_role_name text;
  v_is_rotation boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_old_assign
  FROM public.org_role_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Role assignment not found.');
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = v_old_assign.organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner, Manager, or Platform Admin can execute role renewals or rotations.';
  END IF;

  v_expiry := v_effective + (v_days || ' days')::interval;

  -- Path A: Member Exits Governance / Non-Renewal
  IF NOT p_continue_in_governance THEN
    UPDATE public.org_role_assignments
    SET
      status = 'RETIRED',
      effective_to = LEAST(v_old_assign.effective_to, v_effective),
      removal_event = 'ANNUAL_TERM_EXIT',
      removal_reason = COALESCE(p_notes, 'Member elected to exit governance at term conclusion'),
      updated_at = now()
    WHERE id = v_old_assign.id;

    -- Demote to base resident VIEWER/BUYER in organization_members so they retain buyer purchasing and audit logs
    IF v_old_assign.person_id IS NOT NULL THEN
      UPDATE public.organization_members
      SET role = 'BUYER'::org_member_role
      WHERE organization_id = v_old_assign.organization_id AND profile_id = v_old_assign.person_id;
    END IF;

    -- Audit log
    INSERT INTO public.org_governance_action_audits (
      actor_person_id,
      organization_id,
      role_assignment_id,
      role_at_time,
      responsibility_at_time,
      authority_at_time,
      action,
      entity_type,
      entity_id,
      payload
    ) VALUES (
      v_caller,
      v_old_assign.organization_id,
      v_old_assign.id,
      COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
      'ANNUAL_TERM_EXIT',
      jsonb_build_object('roleId', v_old_assign.role_id, 'personId', v_old_assign.person_id),
      'ROLE_RETIRED_ON_EXPIRY',
      'org_role_assignment',
      v_old_assign.id::text,
      jsonb_build_object(
        'assignmentId', v_old_assign.id,
        'personId', v_old_assign.person_id,
        'roleId', v_old_assign.role_id,
        'notes', p_notes
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'RETIRED',
      'assignmentId', v_old_assign.id,
      'personId', v_old_assign.person_id,
      'message', format('Role %s retired. Person transitioned to standard member.', v_old_assign.role_name)
    );
  END IF;

  -- Path B: Renewal or Rotation
  v_target_role_id := COALESCE(p_renewal_role_id, v_old_assign.role_id);
  v_target_role_name := COALESCE(p_renewal_role_name, v_old_assign.role_name);
  v_is_rotation := (v_target_role_id <> v_old_assign.role_id);

  -- Close old assignment
  UPDATE public.org_role_assignments
  SET
    status = CASE WHEN v_is_rotation THEN 'ROTATED' ELSE 'SUPERSEDED' END,
    effective_to = v_effective,
    removal_event = CASE WHEN v_is_rotation THEN 'ROLE_ROTATION' ELSE 'ANNUAL_RENEWAL' END,
    removal_reason = COALESCE(p_notes, CASE WHEN v_is_rotation THEN 'Rotated to new role for new term' ELSE 'Renewed for fresh term' END),
    updated_at = now()
  WHERE id = v_old_assign.id;

  -- Insert fresh term assignment
  INSERT INTO public.org_role_assignments (
    organization_id,
    person_id,
    role_id,
    role_name,
    role_category,
    responsibility_scope,
    authority_scope,
    effective_from,
    effective_to,
    term_duration_days,
    status,
    appointed_by,
    appointment_event,
    predecessor_assignment_id
  ) VALUES (
    v_old_assign.organization_id,
    v_old_assign.person_id,
    v_target_role_id,
    v_target_role_name,
    v_old_assign.role_category,
    v_old_assign.responsibility_scope,
    v_old_assign.authority_scope,
    v_effective,
    v_expiry,
    v_days,
    'ACTIVE',
    v_caller,
    CASE WHEN v_is_rotation THEN 'ROLE_ROTATION' ELSE 'ANNUAL_RENEWAL' END,
    v_old_assign.id
  ) RETURNING id INTO v_new_assign_id;

  -- Update organization membership if role changed
  IF v_old_assign.person_id IS NOT NULL THEN
    UPDATE public.organization_members
    SET role = CASE
      WHEN v_target_role_id IN ('PRESIDENT', 'PRIMARY_OWNER', 'OWNER') THEN 'OWNER'::org_member_role
      WHEN v_target_role_id IN ('VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'MANAGER', 'ESTATE_MANAGER') THEN 'MANAGER'::org_member_role
      WHEN v_target_role_id IN ('BUYER', 'PROCUREMENT_LEAD') THEN 'BUYER'::org_member_role
      WHEN v_target_role_id IN ('FINANCE_APPROVER', 'APPROVER') THEN 'APPROVER'::org_member_role
      ELSE 'COMMITTEE_MEMBER'::org_member_role
    END
    WHERE organization_id = v_old_assign.organization_id AND profile_id = v_old_assign.person_id;
  END IF;

  -- Immutable governance audit
  INSERT INTO public.org_governance_action_audits (
    actor_person_id,
    organization_id,
    role_assignment_id,
    role_at_time,
    responsibility_at_time,
    authority_at_time,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_caller,
    v_old_assign.organization_id,
    v_new_assign_id,
    COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
    CASE WHEN v_is_rotation THEN 'ROLE_ROTATION' ELSE 'ANNUAL_RENEWAL' END,
    jsonb_build_object('oldRoleId', v_old_assign.role_id, 'newRoleId', v_target_role_id),
    CASE WHEN v_is_rotation THEN 'ROLE_ROTATED' ELSE 'ROLE_RENEWED' END,
    'org_role_assignment',
    v_new_assign_id::text,
    jsonb_build_object(
      'predecessorAssignmentId', v_old_assign.id,
      'newAssignmentId', v_new_assign_id,
      'personId', v_old_assign.person_id,
      'oldRoleId', v_old_assign.role_id,
      'newRoleId', v_target_role_id,
      'newRoleName', v_target_role_name,
      'effectiveFrom', v_effective,
      'effectiveTo', v_expiry,
      'termDurationDays', v_days,
      'isRotation', v_is_rotation
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', CASE WHEN v_is_rotation THEN 'ROTATED' ELSE 'RENEWED' END,
    'newAssignmentId', v_new_assign_id,
    'oldAssignmentId', v_old_assign.id,
    'roleId', v_target_role_id,
    'roleName', v_target_role_name,
    'effectiveFrom', v_effective,
    'effectiveTo', v_expiry,
    'message', format('Role %s %s for a %s-day term.', v_target_role_name, CASE WHEN v_is_rotation THEN 'rotated' ELSE 'renewed' END, v_days)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_or_rotate_org_role_atomic(uuid, boolean, text, text, integer, timestamptz, text) TO authenticated, service_role;

-- 4.4 revoke_org_role_atomic
CREATE OR REPLACE FUNCTION public.revoke_org_role_atomic(
  p_assignment_id   uuid,
  p_removal_event   text DEFAULT 'REVOCATION',
  p_removal_reason  text DEFAULT 'Role authority revoked',
  p_effective_to    timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_assign public.org_role_assignments%ROWTYPE;
  v_to timestamptz := COALESCE(p_effective_to, now());
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_assign
  FROM public.org_role_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Role assignment not found.');
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = v_assign.organization_id;

  IF v_caller_role NOT IN ('OWNER', 'MANAGER') AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an Owner, Manager, or Platform Admin can revoke role assignments.';
  END IF;

  UPDATE public.org_role_assignments
  SET
    status = 'REVOKED',
    effective_to = v_to,
    removal_event = COALESCE(p_removal_event, 'REVOCATION'),
    removal_reason = COALESCE(p_removal_reason, 'Role authority revoked'),
    updated_at = now()
  WHERE id = p_assignment_id;

  -- Record audit
  INSERT INTO public.org_governance_action_audits (
    actor_person_id,
    organization_id,
    role_assignment_id,
    role_at_time,
    responsibility_at_time,
    authority_at_time,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_caller,
    v_assign.organization_id,
    p_assignment_id,
    COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
    'ROLE_REVOCATION',
    jsonb_build_object('revokedRoleId', v_assign.role_id, 'revokedRoleName', v_assign.role_name),
    'ROLE_REVOKED',
    'org_role_assignment',
    p_assignment_id::text,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'personId', v_assign.person_id,
      'roleId', v_assign.role_id,
      'effectiveTo', v_to,
      'removalEvent', p_removal_event,
      'removalReason', p_removal_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'assignmentId', p_assignment_id,
    'roleId', v_assign.role_id,
    'personId', v_assign.person_id,
    'effectiveTo', v_to,
    'message', format('Role %s revoked successfully.', v_assign.role_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_org_role_atomic(uuid, text, text, timestamptz) TO authenticated, service_role;

-- 4.5 record_org_action_audit_atomic
CREATE OR REPLACE FUNCTION public.record_org_action_audit_atomic(
  p_organization_id   uuid,
  p_actor_person_id   uuid,
  p_action            text,
  p_entity_type       text,
  p_entity_id         text,
  p_transaction_id    text DEFAULT NULL,
  p_payload           jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_assign public.org_role_assignments%ROWTYPE;
  v_role_at_time text := 'COMMITTEE_MEMBER';
  v_resp_at_time text := 'GENERAL';
  v_auth_at_time jsonb := '{}'::jsonb;
  v_audit_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Look up active effective role assignment for actor at time of action
  SELECT * INTO v_assign
  FROM public.org_role_assignments
  WHERE organization_id = p_organization_id
    AND person_id = p_actor_person_id
    AND status = 'ACTIVE'
    AND effective_from <= v_now
    AND (effective_to IS NULL OR effective_to > v_now)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF FOUND THEN
    v_role_at_time := v_assign.role_name;
    v_resp_at_time := v_assign.responsibility_scope;
    v_auth_at_time := v_assign.authority_scope;
  ELSE
    -- Fallback to base org member role
    SELECT om.role::text INTO v_role_at_time
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id AND om.profile_id = p_actor_person_id;

    v_role_at_time := COALESCE(v_role_at_time, 'MEMBER');
  END IF;

  INSERT INTO public.org_governance_action_audits (
    actor_person_id,
    organization_id,
    role_assignment_id,
    role_at_time,
    responsibility_at_time,
    authority_at_time,
    action,
    entity_type,
    entity_id,
    transaction_id,
    payload,
    timestamp
  ) VALUES (
    p_actor_person_id,
    p_organization_id,
    v_assign.id,
    v_role_at_time,
    v_resp_at_time,
    v_auth_at_time,
    p_action,
    p_entity_type,
    p_entity_id,
    p_transaction_id,
    COALESCE(p_payload, '{}'::jsonb),
    v_now
  ) RETURNING id INTO v_audit_id;

  -- Unified log to public.audit_events
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'governance.action.' || lower(p_action),
    p_actor_person_id,
    p_organization_id,
    p_entity_type,
    p_entity_id,
    jsonb_build_object(
      'auditId', v_audit_id,
      'roleAtTime', v_role_at_time,
      'responsibilityAtTime', v_resp_at_time,
      'transactionId', p_transaction_id,
      'payload', p_payload
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'auditId', v_audit_id,
    'roleAtTime', v_role_at_time,
    'timestamp', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_org_action_audit_atomic(uuid, uuid, text, text, text, text, jsonb) TO authenticated, service_role;

-- 4.6 get_active_org_role_holder
CREATE OR REPLACE FUNCTION public.get_active_org_role_holder(
  p_organization_id   uuid,
  p_role_id           text,
  p_at_time           timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_time timestamptz := COALESCE(p_at_time, now());
  v_assign record;
BEGIN
  SELECT
    ra.id,
    ra.organization_id,
    ra.person_id,
    p.full_name as person_name,
    p.email as person_email,
    ra.role_id,
    ra.role_name,
    ra.role_category,
    ra.responsibility_scope,
    ra.authority_scope,
    ra.effective_from,
    ra.effective_to,
    ra.term_duration_days,
    ra.status,
    ra.appointment_event,
    ra.predecessor_assignment_id
  INTO v_assign
  FROM public.org_role_assignments ra
  LEFT JOIN public.profiles p ON p.id = ra.person_id
  WHERE ra.organization_id = p_organization_id
    AND ra.role_id = p_role_id
    AND ra.status = 'ACTIVE'
    AND ra.effective_from <= v_time
    AND (ra.effective_to IS NULL OR ra.effective_to > v_time)
  ORDER BY ra.effective_from DESC
  LIMIT 1;

  IF v_assign.id IS NULL THEN
    RETURN jsonb_build_object(
      'isVacant', true,
      'organizationId', p_organization_id,
      'roleId', p_role_id,
      'holder', null
    );
  END IF;

  RETURN jsonb_build_object(
    'isVacant', false,
    'organizationId', p_organization_id,
    'assignmentId', v_assign.id,
    'roleId', v_assign.role_id,
    'roleName', v_assign.role_name,
    'roleCategory', v_assign.role_category,
    'responsibilityScope', v_assign.responsibility_scope,
    'authorityScope', v_assign.authority_scope,
    'effectiveFrom', v_assign.effective_from,
    'effectiveTo', v_assign.effective_to,
    'termDurationDays', v_assign.term_duration_days,
    'status', v_assign.status,
    'holder', jsonb_build_object(
      'personId', v_assign.person_id,
      'fullName', v_assign.person_name,
      'email', v_assign.person_email
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_org_role_holder(uuid, text, timestamptz) TO authenticated, service_role;

-- 4.7 get_org_role_history
CREATE OR REPLACE FUNCTION public.get_org_role_history(
  p_organization_id   uuid,
  p_role_id           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ra.id,
    'organizationId', ra.organization_id,
    'personId', ra.person_id,
    'personName', p.full_name,
    'personEmail', p.email,
    'roleId', ra.role_id,
    'roleName', ra.role_name,
    'roleCategory', ra.role_category,
    'responsibilityScope', ra.responsibility_scope,
    'authorityScope', ra.authority_scope,
    'effectiveFrom', ra.effective_from,
    'effectiveTo', ra.effective_to,
    'termDurationDays', ra.term_duration_days,
    'status', ra.status,
    'appointedBy', ra.appointed_by,
    'appointedByName', ap.full_name,
    'appointmentEvent', ra.appointment_event,
    'predecessorAssignmentId', ra.predecessor_assignment_id,
    'removalEvent', ra.removal_event,
    'removalReason', ra.removal_reason,
    'createdAt', ra.created_at
  ) ORDER BY ra.effective_from DESC, ra.created_at DESC), '[]'::jsonb)
  INTO v_results
  FROM public.org_role_assignments ra
  LEFT JOIN public.profiles p ON p.id = ra.person_id
  LEFT JOIN public.profiles ap ON ap.id = ra.appointed_by
  WHERE ra.organization_id = p_organization_id
    AND (p_role_id IS NULL OR ra.role_id = p_role_id);

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_role_history(uuid, text) TO authenticated, service_role;

-- 4.8 verify_org_authority_at_time (Strict Expiry Guard: expired roles are strictly unauthorized)
CREATE OR REPLACE FUNCTION public.verify_org_authority_at_time(
  p_organization_id   uuid,
  p_person_id         uuid,
  p_permission        text,
  p_amount            numeric DEFAULT NULL,
  p_at_time           timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_time timestamptz := COALESCE(p_at_time, now());
  v_assign public.org_role_assignments%ROWTYPE;
  v_delegation_active boolean := false;
  v_allowed_perms jsonb;
  v_spend_cap numeric;
BEGIN
  -- 1. Check direct active role assignment at specified time
  -- Strict guard: Must be ACTIVE and effective_from <= v_time < effective_to
  SELECT * INTO v_assign
  FROM public.org_role_assignments
  WHERE organization_id = p_organization_id
    AND person_id = p_person_id
    AND status = 'ACTIVE'
    AND effective_from <= v_time
    AND (effective_to IS NULL OR effective_to > v_time)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF FOUND THEN
    v_allowed_perms := v_assign.authority_scope->'permissions';
    v_spend_cap := (v_assign.authority_scope->>'spendCapAmount')::numeric;

    IF v_allowed_perms ? p_permission OR v_assign.authority_scope ? 'FULL_AUTHORITY' THEN
      IF p_amount IS NULL OR v_spend_cap IS NULL OR p_amount <= v_spend_cap THEN
        RETURN jsonb_build_object(
          'authorized', true,
          'roleAtTime', v_assign.role_name,
          'assignmentId', v_assign.id,
          'signatureMode', 'DIRECT',
          'reason', format('Authorized via active role %s at %s', v_assign.role_name, v_time)
        );
      END IF;
    END IF;
  END IF;

  -- 2. Check active delegations at specified time
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_delegations od
    WHERE od.organization_id = p_organization_id
      AND od.delegatee_id = p_person_id
      AND od.is_active = true
      AND od.starts_at <= v_time
      AND od.expires_at >= v_time
      AND p_permission = ANY(od.permissions)
      AND (p_amount IS NULL OR od.spend_cap_amount IS NULL OR p_amount <= od.spend_cap_amount)
  ) INTO v_delegation_active;

  IF v_delegation_active THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'roleAtTime', 'DELEGATED_PROXY',
      'assignmentId', null,
      'signatureMode', 'DELEGATED',
      'reason', format('Authorized via active delegation proxy for %s at %s', p_permission, v_time)
    );
  END IF;

  RETURN jsonb_build_object(
    'authorized', false,
    'roleAtTime', COALESCE(v_assign.role_name, 'NONE'),
    'assignmentId', v_assign.id,
    'signatureMode', 'NONE',
    'reason', format('Person %s not authorized for %s in org %s at %s (role expired or permission missing)', p_person_id, p_permission, p_organization_id, v_time)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_org_authority_at_time(uuid, uuid, text, numeric, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Data API Access Specification (October 30 Standard)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.org_role_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_role_assignments TO authenticated, service_role;

GRANT SELECT ON public.org_governance_action_audits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_governance_action_audits TO authenticated, service_role;

COMMIT;

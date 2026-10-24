-- 00326: Authoritative one-calendar-year RWA/MSME governance tenure.
--
-- Existing incompatible active rows are reported and block installation; this
-- migration never invents, rewrites or deletes an appointment. New active
-- terms are normalized at the write boundary, concurrent holders are rejected
-- by a partial unique index, and committee voting requires both a current
-- qualifying appointment and the RFQ seat.

DO $preconditions$
DECLARE
  v_incompatible jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'organizationId', organization_id,
    'roleId', role_id,
    'category', role_category,
    'effectiveFrom', effective_from,
    'effectiveTo', effective_to
  ) ORDER BY organization_id, role_id, id)
  INTO v_incompatible
  FROM public.org_role_assignments
  WHERE status = 'ACTIVE'
    AND role_category IN ('RWA_GOVERNANCE', 'MSME_MANAGEMENT')
    AND (
      effective_to IS NULL
      OR effective_to IS DISTINCT FROM effective_from + interval '1 year'
    );

  IF v_incompatible IS NOT NULL THEN
    RAISE EXCEPTION
      'COMMITTEE_TENURE_INCOMPATIBLE: active assignments require owner review: %',
      v_incompatible
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.org_role_assignments
    WHERE status = 'ACTIVE'
    GROUP BY organization_id, role_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'COMMITTEE_TENURE_INCOMPATIBLE: concurrent active role holders require owner review'
      USING ERRCODE = '23505';
  END IF;
END
$preconditions$;

CREATE UNIQUE INDEX uq_org_role_assignments_one_active_holder
  ON public.org_role_assignments (organization_id, role_id)
  WHERE status = 'ACTIVE';

CREATE FUNCTION private.enforce_authoritative_committee_tenure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.status = 'ACTIVE'
     AND NEW.role_category IN ('RWA_GOVERNANCE', 'MSME_MANAGEMENT') THEN
    IF NEW.person_id IS NULL THEN
      RAISE EXCEPTION 'COMMITTEE_TENURE_PERSON_REQUIRED: active governance role requires a person'
        USING ERRCODE = '23514';
    END IF;
    NEW.term_duration_days := 365;
    NEW.effective_to := NEW.effective_from + interval '1 year';
    IF NEW.effective_to <= clock_timestamp() THEN
      RAISE EXCEPTION 'COMMITTEE_TENURE_EXPIRED: active term must end in the future'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION private.enforce_authoritative_committee_tenure() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_authoritative_committee_tenure()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_authoritative_committee_tenure
  BEFORE INSERT OR UPDATE OF person_id, role_category, effective_from, effective_to,
    term_duration_days, status
  ON public.org_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_authoritative_committee_tenure();

-- Role lifecycle rows are authoritative only when written by the existing
-- SECURITY DEFINER lifecycle RPCs. An authenticated table write otherwise
-- bypasses succession, expiry and audit invariants.
DROP POLICY IF EXISTS p_org_role_assignments_write ON public.org_role_assignments;
REVOKE INSERT, UPDATE, DELETE ON public.org_role_assignments FROM anon, authenticated;

CREATE FUNCTION private.guard_org_role_assignment_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION
      'ORG_ROLE_ASSIGNMENT_RPC_REQUIRED: use the authoritative role lifecycle RPCs'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

ALTER FUNCTION private.guard_org_role_assignment_client_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_org_role_assignment_client_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_guard_org_role_assignment_client_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.org_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_org_role_assignment_client_write();

CREATE OR REPLACE FUNCTION private.enforce_committee_vote_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_org_id uuid;
  v_org_type public.org_type;
  v_active_role text;
  v_has_rfq_seat boolean := false;
  v_has_active_appointment boolean := false;
  c_rwa_roles constant text[] :=
    ARRAY['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'JOINT_SECRETARY', 'TREASURER', 'COMMITTEE_MEMBER'];
  c_msme_roles constant text[] :=
    ARRAY['OWNER', 'PRIMARY_MSME', 'DIRECTOR', 'PARTNER', 'MANAGER', 'COMMITTEE_MEMBER', 'DELEGATE'];
BEGIN
  IF private.in_demo_reset() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conflict_of_interest_declarations coi
    WHERE coi.rfq_id = NEW.rfq_id
      AND coi.profile_id = NEW.profile_id
      AND coi.status = 'DECLARED_CONFLICT'
  ) THEN
    RAISE EXCEPTION
      'VOTE-UNAUTHORIZED: Voter has declared a Conflict of Interest (COI) and is recused from voting on this RFQ.'
      USING ERRCODE = '42501';
  END IF;

  SELECT rfq.organization_id, org.org_type
  INTO v_org_id, v_org_type
  FROM public.rfqs rfq
  JOIN public.organizations org ON org.id = rfq.organization_id
  WHERE rfq.id = NEW.rfq_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT active_role_code
  INTO v_active_role
  FROM public.profiles
  WHERE id = NEW.profile_id;

  IF COALESCE(v_active_role, '') IN ('FACILITY_MANAGER', 'ESTATE_MANAGER')
     OR EXISTS (
       SELECT 1
       FROM public.org_role_assignments assignment
       WHERE assignment.organization_id = v_org_id
         AND assignment.person_id = NEW.profile_id
         AND assignment.role_id IN ('ESTATE_MANAGER', 'FACILITY_MANAGER')
         AND assignment.status = 'ACTIVE'
         AND assignment.effective_from <= clock_timestamp()
         AND assignment.effective_to > clock_timestamp()
     ) THEN
    RAISE EXCEPTION
      'VOTE-UNAUTHORIZED: Estate / Facility Manager is an operational non-voting role and cannot cast a committee vote.'
      USING ERRCODE = '42501';
  END IF;

  IF v_org_type IN ('COMMUNITY', 'MSME') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.committee_assignments seat
      WHERE seat.rfq_id = NEW.rfq_id
        AND seat.profile_id = NEW.profile_id
    )
    INTO v_has_rfq_seat;

    SELECT EXISTS (
      SELECT 1
      FROM public.org_role_assignments assignment
      WHERE assignment.organization_id = v_org_id
        AND assignment.person_id = NEW.profile_id
        AND assignment.status = 'ACTIVE'
        AND assignment.effective_from <= clock_timestamp()
        AND assignment.effective_to > clock_timestamp()
        AND (
          (v_org_type = 'COMMUNITY'
            AND assignment.role_category = 'RWA_GOVERNANCE'
            AND assignment.role_id = ANY(c_rwa_roles))
          OR
          (v_org_type = 'MSME'
            AND assignment.role_category = 'MSME_MANAGEMENT'
            AND assignment.role_id = ANY(c_msme_roles))
        )
    )
    INTO v_has_active_appointment;

    IF NOT (v_has_rfq_seat AND v_has_active_appointment) THEN
      RAISE EXCEPTION
        'VOTE-UNAUTHORIZED: Voter needs both a current one-year committee appointment and a committee seat on this RFQ.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

ALTER FUNCTION private.enforce_committee_vote_authority() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_committee_vote_authority()
  FROM PUBLIC, anon, authenticated, service_role;

-- Quorum is based on each person's latest vote, never on superseded vote rows.
CREATE OR REPLACE FUNCTION private.enforce_rwa_award_quorum(
  p_rfq_id uuid,
  p_quote_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $fn$
DECLARE
  v_org_type text;
  v_vote_count integer := 0;
BEGIN
  SELECT organization.org_type::text
  INTO v_org_type
  FROM public.rfqs rfq
  JOIN public.organizations organization ON organization.id = rfq.organization_id
  WHERE rfq.id = p_rfq_id;

  IF v_org_type IS NULL OR v_org_type NOT IN ('COMMUNITY', 'RWA', 'SOCIETY') THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT vote.profile_id)
  INTO v_vote_count
  FROM private.current_votes(p_rfq_id) vote
  WHERE vote.recommended_quote_id = p_quote_id
    AND vote.choice = 'RECOMMEND'::public.vote_choice
    AND NOT EXISTS (
      SELECT 1
      FROM public.conflict_of_interest_declarations declaration
      WHERE declaration.rfq_id = p_rfq_id
        AND declaration.profile_id = vote.profile_id
        AND declaration.status = 'DECLARED_CONFLICT'
    );

  IF v_vote_count < 2 THEN
    RAISE EXCEPTION
      'Committee quorum not met: quorum_met is false for this RWA/COMMUNITY award'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

ALTER FUNCTION private.enforce_rwa_award_quorum(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_rwa_award_quorum(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

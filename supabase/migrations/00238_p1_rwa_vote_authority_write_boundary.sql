-- =============================================================================
-- 00238: P1-B — RWA committee vote authorisation enforced at the write boundary.
--
-- Before: a vote was admitted when private.can_access_rfq_as_committee() (00049) was true,
--   i.e. for ANY member of the buying organisation, plus the manager-or-above fallback
--   inside cast_committee_vote. A FACILITY_MANAGER also carries the VOTE permission in
--   user_roles (00039), so the role-permission trigger did not stop them either. The UI
--   hid the vote button (canVote=false) but the RPC / committee_votes INSERT accepted it.
--
-- After: a BEFORE INSERT trigger on committee_votes (covers cast_committee_vote AND any
--   direct INSERT through RLS) rejects the vote unless the voter is authorised:
--     * Estate / Facility Manager (profile active role FACILITY_MANAGER|ESTATE_MANAGER, or
--       an active ESTATE_MANAGER|FACILITY_MANAGER org role assignment) never votes.
--     * In a COMMUNITY (RWA) organisation the voter must hold BOTH (AND, not OR):
--         (A) a qualifying appointment:
--               - a currently-effective org_role_assignments committee office
--                 (PRESIDENT, VICE_PRESIDENT, SECRETARY, JOINT_SECRETARY, TREASURER, COMMITTEE_MEMBER), or
--               - membership role OWNER / COMMITTEE_MEMBER with no committee office that has lapsed;
--         (B) the RFQ-level committee_assignments row for this RFQ.
--       The seat row is necessary but NOT sufficient: close_clarification_for_evaluation (00050)
--       auto-seats MANAGER / BUYER members too, so a seat alone must never confer a vote, and an
--       expired office-holder with a seat must not vote. Plain org membership (MANAGER / BUYER /
--       APPROVER) is not an appointment.
--     * Declared-COI recusal (status DECLARED_CONFLICT for this RFQ + profile, the 00216
--       predicate) is ALSO enforced here for every org type, right after the demo-reset bypass,
--       so a direct committee_votes INSERT cannot bypass the cast_committee_vote check. It stays
--       in cast_committee_vote and in quorum counting (lock_and_reveal_award_atomic) as well.
--   can_access_rfq_as_committee() is deliberately NOT narrowed: it is the READ predicate for
--   ~30 policies/views and must stay broad. Weighted voting (stamp_vote_power), quorum
--   (lock_and_reveal_award_atomic), COI recusal, org isolation, vote window and the
--   anti-mutation triggers are untouched.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_committee_vote_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_org_id        uuid;
  v_org_type      public.org_type;
  v_active_role   text;
  v_member_role   text;
  v_is_operational boolean := false;
  v_has_assign    boolean := false;
  v_has_active    boolean := false;
  v_has_rfq_seat  boolean := false;
  v_appointed     boolean := false;
  v_seat          boolean := false;
  c_committee_offices constant text[] :=
    ARRAY['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'JOINT_SECRETARY', 'TREASURER', 'COMMITTEE_MEMBER'];
BEGIN
  IF private.in_demo_reset() THEN
    RETURN NEW;
  END IF;

  -- Declared-COI recusal at the write boundary (every org type). Same predicate as
  -- cast_committee_vote (00216): a DECLARED_CONFLICT row for this RFQ + profile. The RPC
  -- check alone is bypassable by a direct committee_votes INSERT (authenticated has INSERT).
  IF EXISTS (
    SELECT 1 FROM public.conflict_of_interest_declarations coi
    WHERE coi.rfq_id = NEW.rfq_id AND coi.profile_id = NEW.profile_id AND coi.status = 'DECLARED_CONFLICT'
  ) THEN
    RAISE EXCEPTION 'VOTE-UNAUTHORIZED: Voter has declared a Conflict of Interest (COI) and is recused from voting on this RFQ.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT r.organization_id, o.org_type INTO v_org_id, v_org_type
  FROM public.rfqs r JOIN public.organizations o ON o.id = r.organization_id
  WHERE r.id = NEW.rfq_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.active_role_code INTO v_active_role FROM public.profiles p WHERE p.id = NEW.profile_id;
  SELECT om.role::text INTO v_member_role
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id AND om.profile_id = NEW.profile_id;

  v_is_operational :=
    COALESCE(v_active_role, '') IN ('FACILITY_MANAGER', 'ESTATE_MANAGER')
    OR EXISTS (
      SELECT 1 FROM public.org_role_assignments ra
      WHERE ra.organization_id = v_org_id AND ra.person_id = NEW.profile_id
        AND ra.role_id IN ('ESTATE_MANAGER', 'FACILITY_MANAGER')
        AND ra.status = 'ACTIVE' AND ra.effective_from <= now()
        AND (ra.effective_to IS NULL OR ra.effective_to > now())
    );

  IF v_is_operational THEN
    RAISE EXCEPTION 'VOTE-UNAUTHORIZED: Estate / Facility Manager is an operational non-voting role and cannot cast a committee vote.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org_type = 'COMMUNITY' THEN
    SELECT EXISTS (SELECT 1 FROM public.committee_assignments ca
                   WHERE ca.rfq_id = NEW.rfq_id AND ca.profile_id = NEW.profile_id)
    INTO v_has_rfq_seat;

    SELECT
      COUNT(*) > 0,
      COALESCE(bool_or(ra.status = 'ACTIVE' AND ra.effective_from <= now()
                       AND (ra.effective_to IS NULL OR ra.effective_to > now())), false)
    INTO v_has_assign, v_has_active
    FROM public.org_role_assignments ra
    WHERE ra.organization_id = v_org_id AND ra.person_id = NEW.profile_id
      AND ra.role_id = ANY (c_committee_offices);

    -- (A) qualifying, unexpired appointment.
    v_appointed := v_has_active
      OR (COALESCE(v_member_role, '') IN ('OWNER', 'COMMITTEE_MEMBER') AND NOT v_has_assign);

    -- (A) AND (B): appointment is necessary; the RFQ seat is necessary; neither alone suffices.
    v_seat := v_appointed AND v_has_rfq_seat;

    IF NOT v_seat THEN
      RAISE EXCEPTION 'VOTE-UNAUTHORIZED: Voter needs both an active committee appointment and a committee seat on this RFQ (organisation membership or a seat alone does not confer a vote).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_committee_vote_authority() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS committee_votes_vote_authority ON public.committee_votes;
CREATE TRIGGER committee_votes_vote_authority
  BEFORE INSERT ON public.committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_committee_vote_authority();

COMMIT;

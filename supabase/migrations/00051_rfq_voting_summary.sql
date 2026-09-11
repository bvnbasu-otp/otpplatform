CREATE OR REPLACE FUNCTION public.rfq_voting_summary(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq         rfqs%ROWTYPE;
  v_org_type    org_type;
  v_assigned    integer;
  v_voted       integer;
  v_power_cast  integer;
  v_abstain     integer;
  v_oppose      integer;
  v_locked      timestamptz;
  v_leader      jsonb;
  v_quorum_req  integer;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  SELECT org_type INTO v_org_type FROM organizations WHERE id = v_rfq.organization_id;

  IF NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.can_access_rfq_as_committee(p_rfq_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*)::int INTO v_assigned
  FROM committee_assignments WHERE rfq_id = p_rfq_id;

  IF v_assigned = 0 THEN
    SELECT count(*)::int INTO v_assigned
    FROM organization_members
    WHERE organization_id = v_rfq.organization_id
      AND role IN ('COMMITTEE_MEMBER', 'MANAGER', 'OWNER', 'BUYER');
  END IF;

  SELECT
    count(*)::int,
    COALESCE(sum(COALESCE(voting_power, 1)), 0)::int,
    count(*) FILTER (WHERE choice = 'ABSTAIN')::int,
    count(*) FILTER (WHERE choice = 'OPPOSE')::int
  INTO v_voted, v_power_cast, v_abstain, v_oppose
  FROM private.current_votes(p_rfq_id);

  SELECT votes_locked_at INTO v_locked FROM awards WHERE rfq_id = p_rfq_id;

  SELECT jsonb_build_object(
    'anonymous_label', t.anonymous_label,
    'quote_id', t.quote_id,
    'recommend_weight', t.recommend_weight,
    'recommend_count', t.recommend_count
  )
  INTO v_leader
  FROM rfq_vote_tally t
  WHERE t.rfq_id = p_rfq_id
  ORDER BY t.recommend_weight DESC, t.recommend_count DESC, t.anonymous_label
  LIMIT 1;

  v_quorum_req := CASE
    WHEN v_org_type = 'COMMUNITY' THEN 4
    WHEN v_org_type = 'ENTERPRISE' THEN 3
    ELSE 2
  END;

  RETURN jsonb_build_object(
    'assigned_members', GREATEST(v_assigned, 1),
    'members_voted', v_voted,
    'pending_members', GREATEST(v_assigned - v_voted, 0),
    'weight_cast', v_power_cast,
    'abstained', v_abstain,
    'opposed', v_oppose,
    'votes_locked_at', v_locked,
    'voting_open', v_locked IS NULL,
    'quorum_required', v_quorum_req,
    'quorum_met', v_voted >= v_quorum_req,
    'leader', v_leader
  );
END;
$$;

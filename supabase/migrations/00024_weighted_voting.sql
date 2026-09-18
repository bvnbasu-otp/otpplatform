-- Weighted committee voting.
--
-- A residents' association deciding for 96 households should not carry the
-- same weight as one flat owner, so each vote is stamped with the voting power
-- of the buyer organization type (00021). The tally reports both the head
-- count and the weighted total, because a committee deserves to see both.
--
-- Changing a vote:
--   committee_votes is immutable and undeletable (INV-095), which is the right
--   invariant and one worth keeping. So a member who changes their mind casts
--   a NEW vote that supersedes the earlier one; the earlier one stays in the
--   record. "Current" is simply the latest cast per member. No row is ever
--   rewritten, and the full history of how a committee arrived at its decision
--   survives. New votes are refused once the award is locked.

-- The original UNIQUE (rfq_id, profile_id) allowed exactly one vote forever,
-- which meant a member could never revise their position. Superseding needs
-- more than one row per member.
ALTER TABLE committee_votes DROP CONSTRAINT IF EXISTS committee_votes_rfq_id_profile_id_key;

CREATE INDEX IF NOT EXISTS idx_committee_votes_current
  ON committee_votes (rfq_id, profile_id, cast_at DESC);

COMMENT ON TABLE committee_votes IS
  'Append-only. A member revising their position inserts a superseding row; the current position is the latest cast_at per (rfq_id, profile_id).';

-- A recommendation has to name what is being recommended. cast_committee_vote
-- checks this, but a vote is the record of a decision and the table should not
-- be able to hold a meaningless one whatever route wrote it.
ALTER TABLE committee_votes DROP CONSTRAINT IF EXISTS committee_votes_recommend_needs_quote;
ALTER TABLE committee_votes
  ADD CONSTRAINT committee_votes_recommend_needs_quote CHECK (
    choice <> 'RECOMMEND' OR recommended_quote_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Current votes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.current_votes(p_rfq_id uuid)
RETURNS SETOF committee_votes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (cv.profile_id) cv.*
  FROM committee_votes cv
  WHERE cv.rfq_id = p_rfq_id
  ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC;
$$;

-- ---------------------------------------------------------------------------
-- Cast or revise a vote
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cast_committee_vote(
  p_rfq_id              uuid,
  p_recommended_quote_id uuid,
  p_choice              vote_choice,
  p_comment             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq      rfqs%ROWTYPE;
  v_profile  uuid;
  v_previous uuid;
  v_vote_id  uuid;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.can_access_rfq_as_committee(p_rfq_id)
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'You are not on this evaluation committee';
  END IF;

  -- The lock is the deadline. Before it, a member may revise freely.
  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'Voting is closed: the award for this RFQ is locked';
  END IF;

  IF v_rfq.status NOT IN ('EVALUATING', 'CLARIFICATION', 'CLOSED') THEN
    RAISE EXCEPTION 'Voting is open only while the RFQ is under evaluation (currently %)', v_rfq.status;
  END IF;

  IF p_choice = 'RECOMMEND' THEN
    IF p_recommended_quote_id IS NULL THEN
      RAISE EXCEPTION 'A recommendation must name a quote';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM quotes
      WHERE id = p_recommended_quote_id AND rfq_id = p_rfq_id
        AND status NOT IN ('DRAFT', 'WITHDRAWN')
    ) THEN
      RAISE EXCEPTION 'That quote is not open for recommendation on this RFQ';
    END IF;
  END IF;

  SELECT id INTO v_previous
  FROM private.current_votes(p_rfq_id) cv
  WHERE cv.profile_id = v_profile;

  INSERT INTO committee_votes (rfq_id, profile_id, recommended_quote_id, choice, comment, cast_at)
  VALUES (p_rfq_id, v_profile, p_recommended_quote_id, p_choice, p_comment, clock_timestamp())
  RETURNING id INTO v_vote_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    CASE WHEN v_previous IS NULL THEN 'vote.cast' ELSE 'vote.revised' END,
    v_profile,
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'vote_id', v_vote_id,
      'supersedes', v_previous,
      'choice', p_choice,
      'recommended_quote_id', p_recommended_quote_id
    )
  );

  RETURN jsonb_build_object(
    'vote_id', v_vote_id,
    'supersedes', v_previous,
    'revised', v_previous IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_committee_vote(uuid, uuid, vote_choice, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Blind weighted tally
--
-- Keyed by anonymous_label. Shows what the committee decided without showing
-- who the bidders are, so the vote itself cannot become an identity leak.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_vote_tally
WITH (security_barrier = true) AS
SELECT
  r.id AS rfq_id,
  ri.anonymous_label,
  cv.recommended_quote_id AS quote_id,
  count(*)::integer AS vote_count,
  sum(COALESCE(cv.voting_power, 1))::integer AS weighted_total,
  count(*) FILTER (WHERE cv.choice = 'RECOMMEND')::integer AS recommend_count,
  sum(COALESCE(cv.voting_power, 1)) FILTER (WHERE cv.choice = 'RECOMMEND')::integer AS recommend_weight,
  max(cv.cast_at) AS last_vote_at
FROM rfqs r
JOIN LATERAL private.current_votes(r.id) cv ON true
LEFT JOIN quotes q ON q.id = cv.recommended_quote_id
LEFT JOIN rfq_invitations ri ON ri.id = q.invitation_id
WHERE cv.choice = 'RECOMMEND'
  AND (
    private.can_access_rfq_as_buyer(r.id)
    OR private.can_access_rfq_as_committee(r.id)
  )
GROUP BY r.id, ri.anonymous_label, cv.recommended_quote_id;

GRANT SELECT ON rfq_vote_tally TO authenticated;

-- ---------------------------------------------------------------------------
-- Participation summary
--
-- Answers "have we heard from everyone, and how much weight has been cast",
-- which is what a chair needs before locking an award.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rfq_voting_summary(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_assigned   integer;
  v_voted      integer;
  v_power_cast integer;
  v_abstain    integer;
  v_oppose     integer;
  v_locked     timestamptz;
  v_leader     jsonb;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.can_access_rfq_as_committee(p_rfq_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*)::int INTO v_assigned
  FROM committee_assignments WHERE rfq_id = p_rfq_id;

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

  RETURN jsonb_build_object(
    'assigned_members', v_assigned,
    'members_voted', v_voted,
    'pending_members', GREATEST(v_assigned - v_voted, 0),
    'weight_cast', v_power_cast,
    'abstained', v_abstain,
    'opposed', v_oppose,
    'votes_locked_at', v_locked,
    'voting_open', v_locked IS NULL,
    'leader', v_leader
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rfq_voting_summary(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- A member may read their own current vote back
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW my_committee_vote
WITH (security_barrier = true) AS
SELECT
  cv.id AS vote_id,
  cv.rfq_id,
  cv.recommended_quote_id,
  ri.anonymous_label AS recommended_alias,
  cv.choice,
  cv.comment,
  cv.voting_power,
  cv.buyer_type,
  cv.cast_at
FROM committee_votes cv
LEFT JOIN quotes q ON q.id = cv.recommended_quote_id
LEFT JOIN rfq_invitations ri ON ri.id = q.invitation_id
WHERE cv.profile_id = private.get_profile_id()
  AND cv.id = (
    SELECT c2.id FROM committee_votes c2
    WHERE c2.rfq_id = cv.rfq_id AND c2.profile_id = cv.profile_id
    ORDER BY c2.cast_at DESC, c2.id DESC
    LIMIT 1
  );

GRANT SELECT ON my_committee_vote TO authenticated;

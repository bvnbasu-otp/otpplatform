-- What the presenter needs on screen, and nothing the demo does not need.
--
-- The demo dashboard has to answer three questions at a glance: which buyer
-- type am I standing in, what weight does a vote carry there, and how far has
-- each scenario got. All three are facts the database already holds; the point
-- of this migration is to let one round trip return them so the screen has no
-- reason to assemble a picture out of six queries and guess at the rest.
--
-- Two rules shape it. Counts only: the board says "4 bids" and never which
-- suppliers, because blind evaluation does not stop being true because someone
-- is presenting. And demo-gated: the board is visible only while demo mode is
-- on, and only to a demo profile or a platform admin, so a production tenant
-- can never read a cross-organization summary through it.

-- ---------------------------------------------------------------------------
-- Who am I, in demo terms
--
-- The dashboard header shows the buyer type and the voting power it carries.
-- The buyer type comes from the signed-in profile's organization rather than
-- from anything the client holds, which is the same source the vote trigger
-- stamps from — so what the header promises and what a vote actually counts
-- for cannot drift apart.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_demo_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_result  jsonb;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signed_in', false);
  END IF;

  SELECT jsonb_build_object(
    'signed_in', true,
    'profile_id', p.id,
    'full_name', p.full_name,
    'is_demo', p.is_demo,
    'is_platform_admin', p.is_platform_admin,
    'demo_mode_enabled', private.demo_mode_enabled(),
    'organization_id', o.id,
    'organization_name', o.name,
    'org_role', m.role,
    'buyer_type', o.org_type,
    'buyer_type_label', b.label,
    'buyer_type_description', b.description,
    'voting_power', COALESCE(b.voting_power, 1),
    'default_committee_size', b.default_committee_size,
    -- A supplier login belongs to no buying organization; the dashboard needs
    -- to know which side of the market it is showing.
    'side', CASE WHEN o.id IS NOT NULL THEN 'BUYER' ELSE 'SUPPLIER' END
  )
  INTO v_result
  FROM profiles p
  -- A demo profile belongs to exactly one organization. Taking the earliest
  -- membership keeps the answer deterministic if that ever stops being true.
  LEFT JOIN LATERAL (
    SELECT om.organization_id, om.role
    FROM organization_members om
    WHERE om.profile_id = p.id
    ORDER BY om.joined_at, om.id
    LIMIT 1
  ) m ON true
  LEFT JOIN organizations o ON o.id = m.organization_id
  LEFT JOIN buyer_type_config b ON b.org_type = o.org_type
  WHERE p.id = v_profile;

  RETURN COALESCE(v_result, jsonb_build_object('signed_in', false));
END;
$$;

COMMENT ON FUNCTION public.my_demo_context() IS
  'Buyer type and voting power for the signed-in profile, read from the same source the vote trigger stamps from.';

GRANT EXECUTE ON FUNCTION public.my_demo_context() TO authenticated;

-- ---------------------------------------------------------------------------
-- The scenario board
--
-- One row per demo scenario with where it has actually got to, which is not
-- always where it was staged to be — the whole point of a live demo is that
-- someone can move a scenario forward, and the board should show that.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_read_demo_board()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.demo_mode_enabled()
     AND (
       private.is_platform_admin()
       OR EXISTS (
         SELECT 1 FROM profiles p
         WHERE p.id = private.get_profile_id() AND p.is_demo
       )
     );
$$;

COMMENT ON FUNCTION private.can_read_demo_board() IS
  'Demo board visibility: demo mode on, and the reader is a demo profile or a platform admin.';

CREATE OR REPLACE VIEW demo_scenario_board
WITH (security_barrier = true) AS
SELECT
  sc.code,
  sc.title,
  sc.narrative,
  sc.buyer_type,
  b.label                       AS buyer_type_label,
  b.voting_power,
  b.default_committee_size,
  o.name                        AS organization_name,
  sc.requirement_id,
  sc.rfq_id,
  r.public_ref,
  sc.stage_label,
  sc.target_stage,
  sc.sort_order,
  req.status                    AS requirement_status,
  r.status                      AS rfq_status,
  r.reveal_status,
  r.min_quotes_required,
  COALESCE(counts.invited, 0)   AS suppliers_invited,
  COALESCE(counts.quoted, 0)    AS quotes_received,
  COALESCE(counts.voters, 0)    AS members_voted,
  COALESCE(counts.weight, 0)    AS weight_cast,
  a.status                      AS award_status,
  a.awarded_at,
  a.revealed_at,
  (po.id IS NOT NULL)           AS has_purchase_order,
  -- Where the scenario really is, in one word the presenter can read out.
  CASE
    WHEN sc.rfq_id IS NULL                     THEN 'DRAFT'
    WHEN a.revealed_at IS NOT NULL             THEN 'REVEALED'
    WHEN a.id IS NOT NULL                      THEN 'AWARDED'
    WHEN COALESCE(counts.voters, 0) > 0        THEN 'EVALUATION'
    WHEN COALESCE(counts.quoted, 0) > 0        THEN 'QUOTING'
    WHEN COALESCE(counts.invited, 0) > 0       THEN 'SOURCING'
    ELSE 'DRAFT'
  END AS actual_stage
FROM demo_scenarios sc
LEFT JOIN organizations o ON o.id = sc.organization_id
LEFT JOIN buyer_type_config b ON b.org_type = sc.buyer_type
LEFT JOIN requirements req ON req.id = sc.requirement_id
LEFT JOIN rfqs r ON r.id = sc.rfq_id
LEFT JOIN awards a ON a.rfq_id = sc.rfq_id
LEFT JOIN purchase_orders po ON po.rfq_id = sc.rfq_id
LEFT JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM rfq_invitations i WHERE i.rfq_id = sc.rfq_id) AS invited,
    (SELECT count(*) FROM quotes q
      WHERE q.rfq_id = sc.rfq_id AND q.status IN ('SUBMITTED', 'REVISED', 'FINAL', 'SELECTED', 'NOT_SELECTED')) AS quoted,
    -- One per member however many times they changed their mind, matching the
    -- participation figure the vote screen shows.
    (SELECT count(DISTINCT v.profile_id) FROM committee_votes v WHERE v.rfq_id = sc.rfq_id) AS voters,
    (SELECT COALESCE(sum(COALESCE(cv.voting_power, 1)), 0)
       FROM (
         SELECT DISTINCT ON (v.profile_id) v.voting_power
         FROM committee_votes v
         WHERE v.rfq_id = sc.rfq_id
         ORDER BY v.profile_id, v.cast_at DESC, v.id DESC
       ) cv) AS weight
) counts ON true
WHERE private.can_read_demo_board();

GRANT SELECT ON demo_scenario_board TO authenticated;

COMMENT ON VIEW demo_scenario_board IS
  'Per-scenario demo progress. Counts only: no supplier, bidder alias or quote amount crosses this view.';

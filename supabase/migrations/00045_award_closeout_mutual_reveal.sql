-- Phase 4, from the supplier's side of the glass.
--
-- Awarding and revealing were built as one direction only: the buyer learns who
-- won, and that was the whole of the reveal. Two things were missing, and both
-- are things the platform tells people it does.
--
-- First, the winner never learned who the buyer was. A double-blind round that
-- unmasks one side is not a contract either party can act on: the supplier is
-- left holding an award from "Buyer, identity protected" with nobody to invoice.
-- The reveal is mutual here, and mutual at exactly the same instant, because the
-- promise is that identity follows the award rather than the other way round.
--
-- Second, the bidders who lost were told nothing at all. Their quote quietly
-- became NOT_SELECTED in a table they cannot read. Silence after a sealed bid is
-- the specific grievance that makes people distrust tendering, so the close-out
-- is written here as part of the award transaction rather than left to a job that
-- might not run. What the loser is told is deliberately thin: the round is
-- decided, and their own alias. Not the winner, not the winning price, not the
-- count of rivals. Their identity stays masked permanently, so there is nothing
-- to reveal to them and nothing about them to reveal to anyone else.
--
-- The buyer's own credentials had nowhere to live before this, which is why the
-- reveal could not have been mutual: organizations carried a name and a type and
-- no way to reach anybody. Those columns are added here, alongside the tax
-- registration signup already asks for.

-- ---------------------------------------------------------------------------
-- Buyer credentials
--
-- Mirrors the shape suppliers already have, so the two sides of a revealed award
-- hand over comparable things. Nullable: an organization that has not filled
-- these in yet is still a working organization, and the reveal says what it has.
-- ---------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_person    text,
  ADD COLUMN IF NOT EXISTS contact_phone     text,
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS tax_registration  text,
  ADD COLUMN IF NOT EXISTS address           jsonb,
  ADD COLUMN IF NOT EXISTS city              text;

COMMENT ON COLUMN organizations.contact_person IS
  'Named person the awarded supplier deals with. Released only through rfq_buyer_revealed, only after that supplier has won.';
COMMENT ON COLUMN organizations.contact_phone IS
  'Buyer contact number. Concealed from every supplier until an award to that supplier is revealed.';
COMMENT ON COLUMN organizations.tax_registration IS
  'GST or equivalent. Needed to raise an invoice, so it travels with the reveal and not before.';

-- ---------------------------------------------------------------------------
-- Who won, asked of the caller
--
-- COALESCE, not a bare IN: get_org_role and its relatives return NULL for a
-- stranger, and a NULL here would flow into a NOT and skip the refusal it was
-- written to cause. Every authorization helper in this schema returns a definite
-- boolean for that reason.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_awarded_supplier_for(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT private.is_supplier_user_for(q.supplier_id)
    FROM awards a
    JOIN quotes q ON q.id = a.quote_id
    WHERE a.rfq_id = p_rfq_id
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION private.is_awarded_supplier_for(uuid) IS
  'True only for a user of the supplier whose quote this award names. False for every other supplier, for the buying side, and for a stranger.';

-- ---------------------------------------------------------------------------
-- The buyer, to the winner
--
-- Gated on three things at once: the award exists, it has been revealed, and the
-- caller belongs to the supplier it names. A losing bidder passes none of them,
-- and a supplier on a different enquiry cannot reach the row at all.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_buyer_revealed
WITH (security_barrier = true) AS
SELECT
  r.id                  AS rfq_id,
  r.public_ref,
  r.title,
  o.name                AS buyer_organization,
  o.org_type            AS buyer_type,
  o.contact_person,
  o.contact_phone,
  o.contact_email,
  o.tax_registration,
  o.city,
  o.address,
  -- The person who signed the award off, so the supplier knows who decided.
  aw.full_name          AS awarded_by_name,
  aw.email              AS awarded_by_email,
  a.awarded_at,
  a.revealed_at
FROM awards a
JOIN rfqs r          ON r.id = a.rfq_id
JOIN organizations o ON o.id = r.organization_id
LEFT JOIN profiles aw ON aw.id = a.awarded_by
WHERE r.reveal_status = 'REVEALED'
  AND private.is_awarded_supplier_for(r.id);

COMMENT ON VIEW rfq_buyer_revealed IS
  'The buying organization, in full, to the one supplier that won, once the award is revealed. The mirror of quotes_revealed.';

GRANT SELECT ON rfq_buyer_revealed TO authenticated;

-- ---------------------------------------------------------------------------
-- Every bidder's own result
--
-- One row per invitation the caller's supplier holds on a decided enquiry. It
-- answers "did we get it" and nothing else: no winning alias, no winning amount,
-- no field a loser could use to work out who beat them or by how much.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW my_bid_outcome
WITH (security_barrier = true) AS
SELECT
  r.id            AS rfq_id,
  r.public_ref,
  r.title,
  ri.anonymous_label AS my_alias,
  CASE
    WHEN q.id IS NULL           THEN 'NO_BID'
    WHEN q.status = 'SELECTED'  THEN 'WON'
    WHEN q.status = 'WITHDRAWN' THEN 'WITHDRAWN'
    ELSE 'NOT_SELECTED'
  END             AS outcome,
  -- True only for the winner: the signal that there is a buyer to go and read.
  (q.status = 'SELECTED' AND r.reveal_status = 'REVEALED') AS buyer_released,
  a.awarded_at    AS decided_at
FROM rfq_invitations ri
JOIN rfqs r     ON r.id = ri.rfq_id
JOIN awards a   ON a.rfq_id = r.id
LEFT JOIN quotes q ON q.invitation_id = ri.id
WHERE private.is_supplier_user_for(ri.supplier_id);

COMMENT ON VIEW my_bid_outcome IS
  'A supplier''s own result on enquiries that have been decided. Shows the caller''s outcome only: the winning alias and amount are structurally absent.';

GRANT SELECT ON my_bid_outcome TO authenticated;

-- ---------------------------------------------------------------------------
-- The close-out
--
-- Written inside the award transaction. If the award holds, every bidder has
-- been told; if it rolls back, nobody was told about a decision that did not
-- happen. Delivery to a handset is a separate concern and stays with the
-- messaging gateway; this is the in-app record the portal reads.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.notify_bidders_of_outcome(p_rfq_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref   text;
  v_count integer := 0;
BEGIN
  SELECT public_ref INTO v_ref FROM rfqs WHERE id = p_rfq_id;

  -- One notification per person who can log in as that bidder. The payload
  -- carries the reference and the reader's own alias, which is everything they
  -- need to find the enquiry and nothing they could not already see.
  INSERT INTO notifications (profile_id, channel, event_type, payload)
  SELECT
    su.profile_id,
    'IN_APP',
    CASE WHEN q.status = 'SELECTED' THEN 'rfq.awarded_to_you' ELSE 'rfq.not_selected' END,
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'publicRef', v_ref,
      'alias', ri.anonymous_label,
      'outcome', CASE WHEN q.status = 'SELECTED' THEN 'WON' ELSE 'NOT_SELECTED' END
    )
  FROM rfq_invitations ri
  JOIN quotes q         ON q.invitation_id = ri.id
  JOIN supplier_users su ON su.supplier_id = ri.supplier_id
  WHERE ri.rfq_id = p_rfq_id
    AND q.status IN ('SELECTED', 'NOT_SELECTED');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- The buying side's copy of the same fact, by alias. An auditor asking whether
  -- the losers were ever told has an answer that does not depend on the mailbox.
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  )
  SELECT
    'rfq.bidders_closed_out',
    private.get_profile_id(),
    r.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'publicRef', v_ref,
      'notified', v_count,
      'selected', (SELECT jsonb_agg(ri.anonymous_label)
                   FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                   WHERE ri.rfq_id = p_rfq_id AND q.status = 'SELECTED'),
      'notSelected', (SELECT jsonb_agg(ri.anonymous_label)
                      FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                      WHERE ri.rfq_id = p_rfq_id AND q.status = 'NOT_SELECTED')
    )
  FROM rfqs r WHERE r.id = p_rfq_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.notify_bidders_of_outcome(uuid) IS
  'Tells every bidder on a decided enquiry their own result. Carries no winning alias or amount to a loser.';

-- ---------------------------------------------------------------------------
-- lock_award, with the close-out attached
--
-- Reproduced from 00023 unchanged except for the notification call and the
-- notified count in the return, so the award remains one transaction: the
-- decision and the telling either both happen or neither does.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_award(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_quote      quotes%ROWTYPE;
  v_final      integer;
  v_award_id   uuid;
  v_now        timestamptz := now();
  v_tally      jsonb;
  v_notified   integer;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can award';
  END IF;

  IF v_rfq.status <> 'EVALUATING' THEN
    RAISE EXCEPTION 'RFQ must be EVALUATING to award (currently %)', v_rfq.status;
  END IF;

  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'This RFQ is already awarded';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote does not belong to this RFQ';
  END IF;

  IF v_quote.status <> 'FINAL' THEN
    RAISE EXCEPTION 'Only a FINAL quote can be awarded (quote is %)', v_quote.status;
  END IF;

  IF btrim(COALESCE(p_justification, '')) = '' THEN
    RAISE EXCEPTION 'A written justification is required';
  END IF;

  -- Competitive tension check.
  SELECT count(*)::int INTO v_final
  FROM quotes WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final < v_rfq.min_quotes_required AND NOT v_rfq.min_quotes_waived THEN
    RAISE EXCEPTION
      'This RFQ needs % final quotes to award and has %. Waive the requirement with a reason to proceed.',
      v_rfq.min_quotes_required, v_final;
  END IF;

  -- Freeze the tally that justifies the decision.
  SELECT jsonb_build_object(
    'locked_at', v_now,
    'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id,
      'choice', v.choice,
      'voting_power', v.voting_power,
      'buyer_type', v.buyer_type
    )), '[]'::jsonb)
  )
  INTO v_tally
  FROM (
    SELECT DISTINCT ON (cv.profile_id) cv.*
    FROM committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
    ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
  ) v;

  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at, vote_snapshot
  ) VALUES (
    p_rfq_id, p_quote_id, private.get_profile_id(),
    jsonb_build_object('text', p_justification),
    'LOCKED', v_now, v_now, v_tally
  )
  RETURNING id INTO v_award_id;

  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;

  UPDATE quotes
  SET status = 'NOT_SELECTED', updated_at = v_now
  WHERE rfq_id = p_rfq_id
    AND id <> p_quote_id
    AND status IN ('FINAL', 'SUBMITTED', 'REVISED');

  -- Note: reveal_status deliberately stays BLIND. Awarding and revealing are
  -- separate acts.
  UPDATE rfqs SET status = 'AWARDED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now
  WHERE id = v_rfq.requirement_id;

  -- Everyone who bid now knows where they stand. Still blind, on both sides:
  -- the losers are told the round is decided, not who took it.
  v_notified := private.notify_bidders_of_outcome(p_rfq_id);

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'final_quotes', v_final,
      'min_quotes_required', v_rfq.min_quotes_required,
      'min_quotes_waived', v_rfq.min_quotes_waived,
      'vote_snapshot', v_tally,
      'justification', p_justification
    )
  );

  RETURN jsonb_build_object(
    'award_id', v_award_id,
    'status', 'LOCKED',
    'votes_locked_at', v_now,
    'reveal_status', 'BLIND',
    'bidders_notified', v_notified
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_award(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- reveal_award, now mutual
--
-- Reproduced from 00023. The buying side's return value is unchanged; what is
-- added is the audit line recording that the buyer's own details were released
-- to the winner at the same instant, and a notification telling the winner to
-- come and read them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_award(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq         rfqs%ROWTYPE;
  v_award       awards%ROWTYPE;
  v_supplier_id uuid;
  v_business    text;
  v_phone       text;
  v_email       text;
  v_alias       text;
  v_now         timestamptz := now();
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can reveal the winner';
  END IF;

  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity can only be revealed after the award is locked';
  END IF;

  SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
  INTO v_supplier_id, v_business, v_phone, v_email, v_alias
  FROM quotes q
  JOIN suppliers s ON s.id = q.supplier_id
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = v_award.quote_id;

  IF v_rfq.reveal_status = 'REVEALED' THEN
    -- Idempotent: already revealed stays revealed.
    RETURN jsonb_build_object(
      'already_revealed', true,
      'supplier_id', v_supplier_id,
      'business_name', v_business
    );
  END IF;

  UPDATE rfqs SET reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;

  UPDATE awards
  SET status = 'REVEALED', revealed_at = v_now
  WHERE id = v_award.id;

  -- The winner is told their side of the glass has cleared. Losers are not
  -- notified again: they were closed out at lock time and nothing has changed
  -- for them, least of all their own masking.
  INSERT INTO notifications (profile_id, channel, event_type, payload)
  SELECT
    su.profile_id,
    'IN_APP',
    'rfq.buyer_revealed',
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'publicRef', v_rfq.public_ref,
      'alias', v_alias
    )
  FROM supplier_users su
  WHERE su.supplier_id = v_supplier_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'identity.revealed',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_award.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', v_award.quote_id,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'alias_before_reveal', v_alias,
      'awarded_at', v_award.awarded_at,
      -- Recorded because it is the other half of the same act: the supplier can
      -- now read the buying organization in full.
      'buyer_released_to_supplier', true
    )
  );

  RETURN jsonb_build_object(
    'supplier_id', v_supplier_id,
    'business_name', v_business,
    'contact_phone', v_phone,
    'contact_email', v_email,
    'alias_before_reveal', v_alias,
    'revealed_at', v_now,
    'buyer_released_to_supplier', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Buyer credentials, maintained by the buyer
--
-- The organizations UPDATE policy already restricts this to an owner. This RPC
-- exists so the columns can be filled without handing the browser a table write,
-- and so the change is on the record: contact details that travel to a winner at
-- award time are worth an audit line.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_organization_credentials(
  p_organization_id  uuid,
  p_contact_person   text DEFAULT NULL,
  p_contact_phone    text DEFAULT NULL,
  p_contact_email    text DEFAULT NULL,
  p_tax_registration text DEFAULT NULL,
  p_city             text DEFAULT NULL,
  p_address          jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations%ROWTYPE;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF NOT private.is_org_manager_or_above(p_organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can change the organization''s details';
  END IF;

  -- NULL leaves a field alone rather than clearing it, so a form that shows one
  -- field cannot silently erase the rest.
  UPDATE organizations
  SET contact_person   = COALESCE(p_contact_person, contact_person),
      contact_phone    = COALESCE(p_contact_phone, contact_phone),
      contact_email    = COALESCE(p_contact_email, contact_email),
      tax_registration = COALESCE(p_tax_registration, tax_registration),
      city             = COALESCE(p_city, city),
      address          = COALESCE(p_address, address),
      updated_at       = now()
  WHERE id = p_organization_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'organization.credentials_updated',
    private.get_profile_id(),
    p_organization_id,
    'organization',
    p_organization_id::text,
    -- Which fields changed, not what they became: the trail should not become a
    -- second copy of the contact book.
    jsonb_build_object('fields', (
      SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) FROM (
        SELECT 'contact_person' AS f WHERE p_contact_person IS NOT NULL
        UNION ALL SELECT 'contact_phone' WHERE p_contact_phone IS NOT NULL
        UNION ALL SELECT 'contact_email' WHERE p_contact_email IS NOT NULL
        UNION ALL SELECT 'tax_registration' WHERE p_tax_registration IS NOT NULL
        UNION ALL SELECT 'city' WHERE p_city IS NOT NULL
        UNION ALL SELECT 'address' WHERE p_address IS NOT NULL
      ) s
    ))
  );

  RETURN jsonb_build_object('organizationId', p_organization_id, 'updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_organization_credentials(
  uuid, text, text, text, text, text, jsonb
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Every authorization helper still answers definitely
--
-- The same check 00044 added, extended to the helper introduced above. A NULL
-- from any of these flows into a NOT and turns a refusal into a pass.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_missing uuid := '00000000-0000-4000-8000-0000000000ff';
BEGIN
  IF private.is_awarded_supplier_for(v_missing) IS NULL THEN
    RAISE EXCEPTION 'is_awarded_supplier_for returns NULL for an unknown enquiry; a stranger would pass a NOT check';
  END IF;

  IF private.is_awarded_supplier_for(v_missing) THEN
    RAISE EXCEPTION 'is_awarded_supplier_for claims an unknown enquiry was awarded to the caller';
  END IF;
END;
$$;

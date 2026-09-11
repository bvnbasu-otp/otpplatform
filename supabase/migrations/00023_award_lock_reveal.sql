-- Award lock and identity reveal.
--
-- The award is the moment the decision becomes irreversible, so it is a single
-- server-side transaction rather than a sequence of client writes. Locking
-- does three things at once: it fixes the winning quote, it freezes the vote
-- tally that justified it, and it leaves the RFQ still BLIND.
--
-- Reveal is a separate, explicit act. Identity becomes visible only after the
-- decision is locked, which is what makes the blind evaluation meaningful:
-- nobody can claim the winner was chosen because of who they were.

ALTER TYPE award_status ADD VALUE IF NOT EXISTS 'LOCKED' BEFORE 'PENDING_REVEAL';

ALTER TABLE awards
  ADD COLUMN votes_locked_at timestamptz,
  ADD COLUMN vote_snapshot jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN awards.votes_locked_at IS
  'Instant the vote tally was frozen. Votes are append-only, so the tally that justified this award is every current vote cast at or before this time.';
COMMENT ON COLUMN awards.vote_snapshot IS
  'Weighted tally as it stood at lock time, kept so the justification survives independently of later reads.';

-- INV-071: three quotes on the golden path, waivable with a recorded reason.
ALTER TABLE rfqs
  ADD COLUMN min_quotes_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN min_quotes_waiver_reason text;

ALTER TABLE rfqs
  ADD CONSTRAINT rfqs_waiver_needs_reason CHECK (
    NOT min_quotes_waived OR btrim(COALESCE(min_quotes_waiver_reason, '')) <> ''
  );

-- ---------------------------------------------------------------------------
-- Lock the award
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
    'reveal_status', 'BLIND'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_award(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reveal the winner
--
-- One direction only: BLIND -> REVEALED, never back.
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
      'awarded_at', v_award.awarded_at
    )
  );

  RETURN jsonb_build_object(
    'supplier_id', v_supplier_id,
    'business_name', v_business,
    'contact_phone', v_phone,
    'contact_email', v_email,
    'alias_before_reveal', v_alias,
    'revealed_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated;

-- Reveal is one-way.
CREATE OR REPLACE FUNCTION private.prevent_rehide()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.reveal_status = 'REVEALED' AND NEW.reveal_status = 'BLIND' THEN
    RAISE EXCEPTION 'An RFQ cannot return to BLIND once identities are revealed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rfqs_no_rehide
  BEFORE UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION private.prevent_rehide();

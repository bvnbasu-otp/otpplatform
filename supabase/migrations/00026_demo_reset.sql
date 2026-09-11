-- Demo reset.
--
-- Puts the demo environment back to its starting position so the next
-- walkthrough begins from a known state. Three rules shape the design:
--
--  1. It only ever touches rows flagged is_demo. Real tenders are untouchable
--     by construction, not by care.
--  2. The audit trail is never deleted. Events from earlier runs stay in
--     audit_events, distinguished by demo_run_id, so "what happened in the
--     demo last Tuesday" remains answerable.
--  3. quote_versions and committee_votes are append-only for good reason
--     (INV-064, INV-095). Rather than disable those guards, the guards are
--     taught the one narrow exception they need: rows belonging to demo data,
--     while demo mode is on, inside the reset transaction. Anything else still
--     gets the same flat refusal it always did.

-- ---------------------------------------------------------------------------
-- The narrow exception
--
-- otp.demo_reset is a transaction-local setting written only inside
-- demo_reset() below. Without it these deletes are refused exactly as before,
-- so there is no route to erasing quote or vote history from the application.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.in_demo_reset()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('otp.demo_reset', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION private.prevent_quote_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND private.in_demo_reset()
     AND private.demo_mode_enabled()
     AND EXISTS (
       SELECT 1 FROM quotes q JOIN rfqs r ON r.id = q.rfq_id
       WHERE q.id = OLD.quote_id AND r.is_demo
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'quote_versions are append-only: UPDATE and DELETE forbidden (INV-064)';
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_committee_vote_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND private.in_demo_reset()
     AND private.demo_mode_enabled()
     AND EXISTS (SELECT 1 FROM rfqs r WHERE r.id = OLD.rfq_id AND r.is_demo) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'committee_votes are immutable: UPDATE and DELETE forbidden (INV-095)';
END;
$$;

-- audit_events keeps its absolute guard. Preserving the trail across resets is
-- the whole point of demo_run_id, so no exception is granted here.

-- ---------------------------------------------------------------------------
-- Scenario staging
--
-- The stage a scenario should sit at is recorded on the scenario row, and one
-- function drives an RFQ to that stage. Both the seed and the reset call it,
-- so there is a single description of what "ready for the demo" means.
-- ---------------------------------------------------------------------------

ALTER TABLE demo_scenarios
  ADD COLUMN IF NOT EXISTS target_stage text NOT NULL DEFAULT 'SOURCING';

ALTER TABLE demo_scenarios DROP CONSTRAINT IF EXISTS demo_scenarios_target_stage_check;
ALTER TABLE demo_scenarios
  ADD CONSTRAINT demo_scenarios_target_stage_check CHECK (
    target_stage IN ('DRAFT', 'SOURCING', 'QUOTING', 'EVALUATION', 'AWARDED', 'REVEALED')
  );

ALTER TABLE demo_scenarios
  ADD COLUMN IF NOT EXISTS invite_limit integer NOT NULL DEFAULT 6;

COMMENT ON COLUMN demo_scenarios.target_stage IS
  'Where demo_stage_scenario should leave this scenario: DRAFT (nothing published) through REVEALED (award revealed).';

CREATE OR REPLACE FUNCTION public.demo_stage_scenario(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc      demo_scenarios%ROWTYPE;
  v_rfq     rfqs%ROWTYPE;
  v_weights jsonb;
  v_winner  uuid;
  v_steps   text[] := '{}';
  v_result  jsonb;
BEGIN
  SELECT * INTO v_sc FROM demo_scenarios WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No demo scenario %', p_code;
  END IF;

  IF v_sc.rfq_id IS NULL THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'DRAFT', 'steps', to_jsonb(v_steps));
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_sc.rfq_id;

  IF v_sc.target_stage = 'DRAFT' THEN
    UPDATE rfqs SET status = 'DRAFT' WHERE id = v_rfq.id;
    UPDATE requirements SET status = 'DRAFT' WHERE id = v_rfq.requirement_id;
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'DRAFT', 'steps', to_jsonb(v_steps));
  END IF;

  -- SOURCING and beyond: the RFQ is open and suppliers have been found.
  UPDATE rfqs SET status = 'OPEN' WHERE id = v_rfq.id AND status = 'DRAFT';
  UPDATE requirements SET status = 'RFQ_CREATED'
  WHERE id = v_rfq.requirement_id AND status IN ('DRAFT', 'SUBMITTED');

  -- Criteria are chosen when the RFQ is published, not after the bids are in.
  -- Suppliers can then see what they are being judged on while they quote,
  -- and the buyer cannot be accused of moving the goalposts.
  IF v_rfq.evaluation_weights IS NULL OR v_rfq.evaluation_weights = '{}'::jsonb THEN
    v_weights := public.suggest_evaluation_weights(v_rfq.requirement_id);
    PERFORM public.set_rfq_evaluation_weights(v_rfq.id, v_weights, 'SUGGESTED');
    v_steps := v_steps || 'weights'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rfq_invitations WHERE rfq_id = v_rfq.id) THEN
    PERFORM public.discover_and_invite_for_rfq(v_rfq.id, v_sc.invite_limit);
    v_steps := v_steps || 'invited'::text;
  END IF;

  IF v_sc.target_stage = 'SOURCING' THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'SOURCING', 'steps', to_jsonb(v_steps));
  END IF;

  -- QUOTING and beyond: bids are in.
  IF NOT EXISTS (SELECT 1 FROM quotes WHERE rfq_id = v_rfq.id) THEN
    PERFORM public.demo_generate_quotes(v_rfq.id, NULL, 'FINAL');
    v_steps := v_steps || 'quoted'::text;
  END IF;

  UPDATE requirements SET status = 'QUOTING'
  WHERE id = v_rfq.requirement_id AND status = 'RFQ_CREATED';

  IF v_sc.target_stage = 'QUOTING' THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'QUOTING', 'steps', to_jsonb(v_steps));
  END IF;

  -- EVALUATION and beyond: scores computed, committee has voted.
  UPDATE rfqs SET status = 'EVALUATING' WHERE id = v_rfq.id AND status IN ('OPEN', 'CLARIFICATION');
  UPDATE requirements SET status = 'EVALUATION'
  WHERE id = v_rfq.requirement_id AND status IN ('RFQ_CREATED', 'QUOTING');

  PERFORM public.compute_quote_evaluations(v_rfq.id);
  v_steps := v_steps || 'scored'::text;

  PERFORM public.demo_generate_votes(v_rfq.id);
  v_steps := v_steps || 'voted'::text;

  IF v_sc.target_stage = 'EVALUATION' THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'EVALUATION', 'steps', to_jsonb(v_steps));
  END IF;

  -- AWARDED and beyond: the committee's front-runner is locked in, still blind.
  IF NOT EXISTS (SELECT 1 FROM awards WHERE rfq_id = v_rfq.id) THEN
    SELECT t.quote_id INTO v_winner
    FROM rfq_vote_tally t
    WHERE t.rfq_id = v_rfq.id
    ORDER BY t.recommend_weight DESC, t.recommend_count DESC, t.anonymous_label
    LIMIT 1;

    IF v_winner IS NULL THEN
      SELECT q.id INTO v_winner
      FROM quotes q
      WHERE q.rfq_id = v_rfq.id AND q.status = 'FINAL'
      ORDER BY q.evaluation_score DESC NULLS LAST, q.id
      LIMIT 1;
    END IF;

    IF v_winner IS NULL THEN
      RETURN jsonb_build_object('scenario', p_code, 'stage', 'EVALUATION',
                                'steps', to_jsonb(v_steps), 'note', 'no quote to award');
    END IF;

    PERFORM public.lock_award(v_rfq.id, v_winner,
      'Highest weighted committee recommendation on the evaluation criteria set for this RFQ.');
    v_steps := v_steps || 'awarded'::text;
  END IF;

  IF v_sc.target_stage = 'AWARDED' THEN
    RETURN jsonb_build_object('scenario', p_code, 'stage', 'AWARDED', 'steps', to_jsonb(v_steps));
  END IF;

  -- REVEALED: identities disclosed.
  v_result := public.reveal_award(v_rfq.id);
  v_steps := v_steps || 'revealed'::text;

  RETURN jsonb_build_object('scenario', p_code, 'stage', 'REVEALED',
                            'steps', to_jsonb(v_steps), 'reveal', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_stage_scenario(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reset
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_reset(p_restage boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run     uuid := gen_random_uuid();
  v_rfqs    uuid[];
  v_deleted jsonb := '{}'::jsonb;
  v_n       integer;
  v_sc      record;
  v_staged  jsonb := '[]'::jsonb;
BEGIN
  IF NOT private.demo_mode_enabled() THEN
    RAISE EXCEPTION 'Demo mode is off: reset is unavailable';
  END IF;

  IF NOT (private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = private.get_profile_id() AND p.is_demo
  )) THEN
    RAISE EXCEPTION 'Only a demo account or a platform admin may reset the demo';
  END IF;

  SELECT array_agg(id) INTO v_rfqs FROM rfqs WHERE is_demo;
  IF v_rfqs IS NULL THEN
    v_rfqs := '{}';
  END IF;

  PERFORM set_config('otp.demo_reset', 'on', true);

  -- Unwind fulfilment first, then the decision, then the bids. Order matters
  -- only because of foreign keys; every statement is scoped to demo RFQs.
  -- The fulfilment chain is rfq -> purchase_order -> work_order -> invoice ->
  -- payment, so it unwinds from the far end.
  DELETE FROM payments WHERE invoice_id IN (
    SELECT i.id FROM invoices i
    JOIN work_orders wo ON wo.id = i.work_order_id
    JOIN purchase_orders po ON po.id = wo.purchase_order_id
    WHERE po.rfq_id = ANY(v_rfqs)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('payments', v_n);

  DELETE FROM invoices WHERE work_order_id IN (
    SELECT wo.id FROM work_orders wo
    JOIN purchase_orders po ON po.id = wo.purchase_order_id
    WHERE po.rfq_id = ANY(v_rfqs)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('invoices', v_n);

  DELETE FROM work_orders WHERE purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE rfq_id = ANY(v_rfqs)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('work_orders', v_n);

  DELETE FROM purchase_orders WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('purchase_orders', v_n);

  DELETE FROM awards WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('awards', v_n);

  DELETE FROM committee_votes WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('committee_votes', v_n);

  DELETE FROM quote_evaluations WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('quote_evaluations', v_n);

  DELETE FROM attachments WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('attachments', v_n);

  DELETE FROM quote_versions WHERE quote_id IN (
    SELECT id FROM quotes WHERE rfq_id = ANY(v_rfqs)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('quote_versions', v_n);

  DELETE FROM quotes WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('quotes', v_n);

  DELETE FROM rfq_invitations WHERE rfq_id = ANY(v_rfqs);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('rfq_invitations', v_n);

  -- Back to blind and open. A revealed RFQ normally cannot re-hide (that is a
  -- one-way act); the demo run boundary is the one place it may, because the
  -- next run is a different world.
  -- A fresh alias_salt as well: the next run's aliases will differ from this
  -- one's, which is exactly the unlinkability property the salt exists for.
  UPDATE rfqs
  SET status = 'DRAFT',
      reveal_status = 'BLIND',
      evaluation_weights = '{}'::jsonb,
      evaluation_weights_source = 'SUGGESTED',
      min_quotes_waived = false,
      min_quotes_waiver_reason = NULL,
      -- Schema-qualified: this function runs with search_path pinned to public,
      -- where pgcrypto is not visible.
      alias_salt = encode(extensions.gen_random_bytes(16), 'hex')
  WHERE id = ANY(v_rfqs);

  UPDATE requirements SET status = 'DRAFT'
  WHERE id IN (SELECT requirement_id FROM rfqs WHERE id = ANY(v_rfqs));

  PERFORM set_config('otp.demo_reset', 'off', true);

  -- New run id: audit events from here on are tagged as this run, and the
  -- previous run's events remain readable and attributable.
  UPDATE demo_settings
  SET current_run_id = v_run, last_reset_at = now()
  WHERE id = true;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('demo.reset', private.get_profile_id(), 'demo', v_run::text,
          jsonb_build_object('rfqs_reset', array_length(v_rfqs, 1), 'deleted', v_deleted));

  IF p_restage THEN
    FOR v_sc IN SELECT code FROM demo_scenarios ORDER BY code LOOP
      v_staged := v_staged || jsonb_build_array(public.demo_stage_scenario(v_sc.code));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run,
    'rfqs_reset', array_length(v_rfqs, 1),
    'deleted', v_deleted,
    'restaged', v_staged
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_reset(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- prevent_rehide must allow the reset path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prevent_rehide()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.reveal_status = 'REVEALED' AND NEW.reveal_status = 'BLIND' THEN
    IF private.in_demo_reset() AND OLD.is_demo THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Identities, once revealed, cannot be hidden again (RFQ %)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

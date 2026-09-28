-- =============================================================================
-- Migration 00214: demo_reset re-anchors the seeded demo RFQ deadlines
--
-- Symptom: some days after `supabase db reset`, a demo reset no longer gives a
-- walkthrough (or the suites that start from one) a live enquiry. Committee
-- votes are refused by the voting window and messaging bids come back
-- DEADLINE_PASSED on the freshly reset demo.
--
-- Root cause: seed_demo_environment.sql writes quote_deadline and
-- evaluation_deadline as now() + an offset at SEED time. demo_reset (00026)
-- puts status, weights and alias salt back but never the deadlines, and the
-- phase trigger (00041) keeps them when restaging moves the RFQ to OPEN and
-- EVALUATING. The windows therefore keep counting down from the seed, not from
-- the reset. Enforcement is correct; the reset was incomplete.
--
-- Fix: demo_reset additionally sets quote_deadline / bid_deadline /
-- evaluation_deadline of the seeded demo RFQs to now() + the seed's offsets
-- and clears revision_deadline, so the restaged scenarios start with the same
-- windows the seed gives them. The statement is scoped to those RFQ ids AND
-- is_demo, inside the existing demo-mode and caller gates, so no real enquiry
-- is touched. Deadline triggers and checks are unchanged.
--
-- The rest of the function is the 00026 definition unchanged.
-- =============================================================================

BEGIN;

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

  -- Windows restart at the reset, not at the seed. Offsets must match the
  -- rfqs insert in seed_demo_environment.sql.
  UPDATE rfqs r
  SET quote_deadline      = now() + o.quote_in,
      bid_deadline        = now() + o.quote_in,
      evaluation_deadline = now() + o.evaluation_in,
      revision_deadline   = NULL
  FROM (VALUES
    ('0d800000-0000-4000-8000-000000000001'::uuid, interval '3 days',  interval '6 days'),
    ('0d800000-0000-4000-8000-000000000002'::uuid, interval '10 days', interval '18 days'),
    ('0d800000-0000-4000-8000-000000000003'::uuid, interval '4 days',  interval '8 days'),
    ('0d800000-0000-4000-8000-000000000004'::uuid, interval '2 days',  interval '5 days'),
    ('0d800000-0000-4000-8000-000000000005'::uuid, interval '7 days',  interval '11 days')
  ) AS o(id, quote_in, evaluation_in)
  WHERE r.id = o.id
    AND r.is_demo
    AND r.id = ANY(v_rfqs);

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

NOTIFY pgrst, 'reload schema';

COMMIT;

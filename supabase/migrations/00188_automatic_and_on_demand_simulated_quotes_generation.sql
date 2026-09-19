-- Migration 00188: Automatic & On-Demand Simulated Quotes Generation
--
-- 1. Implements public.seed_simulated_quotes_for_rfq for on-demand simulated quotes generation with tiered pricing, GST line items, and SLA terms.
-- 2. Restores canonical auto_submit_pilot_quotes guarded against demo RFQs and staging/reset.
-- 3. Drops legacy discovery overloads and ensures discover_and_invite_for_rfq strictly respects demo staging, demo RFQ isolation, and anti-leak.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. On-Demand Simulation RPC: seed_simulated_quotes_for_rfq
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_simulated_quotes_for_rfq(
  p_rfq_id uuid,
  p_count  integer DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq          rfqs%ROWTYPE;
  v_req          requirements%ROWTYPE;
  v_inv          record;
  v_supplier     record;
  v_base_unit    numeric := 35000;
  v_raw_budget   numeric := 0;
  v_base_price   numeric;
  v_gst          numeric;
  v_cgst         numeric;
  v_sgst         numeric;
  v_transport    numeric;
  v_total        numeric;
  v_days         integer;
  v_warranty     integer;
  v_payment      integer;
  v_fit          integer;
  v_notes        text;
  v_tier_name    text;
  v_quote_id     uuid;
  v_author       uuid;
  v_idx          integer := 0;
  v_count        integer := 0;
  v_existing_cnt integer := 0;
  v_target_cnt   integer;
  v_title        text;
  v_label        text;
  v_eval_res     jsonb;
  v_now          timestamptz := now();
  v_line_items   jsonb;
BEGIN
  v_target_cnt := GREATEST(3, LEAST(COALESCE(p_count, 4), 6));

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Requirement not found');
  END IF;

  v_title := lower(COALESCE(v_req.title, '') || ' ' || COALESCE(v_req.description, ''));

  -- 1. Check requirement commercial budget
  IF v_req.commercial IS NOT NULL THEN
    BEGIN
      IF (v_req.commercial ? 'budgetAmount') AND (v_req.commercial->>'budgetAmount')::numeric > 0 THEN
        v_raw_budget := (v_req.commercial->>'budgetAmount')::numeric;
      ELSIF (v_req.commercial ? 'targetBudget') AND (v_req.commercial->>'targetBudget')::numeric > 0 THEN
        v_raw_budget := (v_req.commercial->>'targetBudget')::numeric;
      ELSIF (v_req.commercial ? 'estimatedTotal') AND (v_req.commercial->>'estimatedTotal')::numeric > 0 THEN
        v_raw_budget := (v_req.commercial->>'estimatedTotal')::numeric;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_raw_budget := 0;
    END;
  END IF;

  -- Baseline unit estimation
  IF v_raw_budget > 0 THEN
    v_base_unit := round(v_raw_budget / 1.18, 2);
  ELSIF v_title ~* 'chair|table|furniture|wood|desk|seating' THEN
    IF v_req.quantity IS NOT NULL AND v_req.quantity > 0 THEN
      v_base_unit := v_req.quantity * 4500;
    ELSE
      v_base_unit := 36000;
    END IF;
  ELSIF v_title ~* 'solar|inverter|rooftop|panel|kw' THEN
    v_base_unit := 185000;
  ELSIF v_title ~* 'cctv|camera|surveillance|security|dvr|nvr' THEN
    v_base_unit := 48000;
  ELSIF v_title ~* 'water|ro|filter|softener|purifier|wtp' THEN
    v_base_unit := 55000;
  ELSIF v_title ~* 'gas|pipeline|piping|lpg|png|manifold' THEN
    v_base_unit := 68000;
  ELSIF v_title ~* 'electrical|motor|rewind|transformer|borewell' THEN
    v_base_unit := 32000;
  ELSIF v_title ~* 'paint|painting|whitewash' THEN
    v_base_unit := 42000;
  ELSIF v_title ~* 'housekeep|cleaning|facility|sanitiz' THEN
    v_base_unit := 28000;
  ELSE
    IF v_req.quantity IS NOT NULL AND v_req.quantity > 0 AND v_req.quantity <= 1000 THEN
      v_base_unit := v_req.quantity * 2500;
    ELSE
      v_base_unit := 40000;
    END IF;
  END IF;

  IF v_base_unit < 1000 THEN
    v_base_unit := 10000;
  END IF;

  -- 2. Ensure minimum required invitations exist (invite up to v_target_cnt active suppliers)
  SELECT count(*)::int INTO v_existing_cnt FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  IF v_existing_cnt < v_target_cnt THEN
    FOR v_supplier IN
      SELECT s.id, s.business_name, s.rating_avg
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST, s.created_at ASC
      LIMIT (v_target_cnt - v_existing_cnt)
    LOOP
      v_label := private.assign_anonymous_label(p_rfq_id, v_supplier.id);
      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at
      ) VALUES (
        p_rfq_id,
        v_supplier.id,
        v_label,
        'INVITED',
        LEAST(98.0, 78.0 + COALESCE(v_supplier.rating_avg, 4.0) * 4.0),
        ARRAY['category_match', 'verified_active'],
        v_now
      )
      ON CONFLICT (rfq_id, supplier_id) DO NOTHING;

      v_existing_cnt := v_existing_cnt + 1;
    END LOOP;
  END IF;

  -- 3. Generate distinct quotes for all invited suppliers who have not quoted yet
  FOR v_inv IN
    SELECT ri.id as invitation_id, ri.supplier_id, ri.anonymous_label, s.business_name, s.rating_avg
    FROM rfq_invitations ri
    JOIN suppliers s ON s.id = ri.supplier_id
    LEFT JOIN quotes q ON q.invitation_id = ri.id
    WHERE ri.rfq_id = p_rfq_id
      AND q.id IS NULL
      AND ri.status <> 'DECLINED'
    ORDER BY ri.anonymous_label ASC
    LIMIT v_target_cnt
  LOOP
    v_idx := v_idx + 1;

    -- Differentiated Tier Pricing & Terms
    IF v_idx = 1 THEN
      v_tier_name  := 'Standard Balanced Tier';
      v_base_price := round(v_base_unit * 1.00, 2);
      v_transport  := round(v_base_price * 0.03, 2);
      v_days       := 3;
      v_warranty   := 12;
      v_payment    := 30;
      v_fit        := 94;
      v_notes      := 'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.';
    ELSIF v_idx = 2 THEN
      v_tier_name  := 'Premium Quality Tier';
      v_base_price := round(v_base_unit * 1.12, 2);
      v_transport  := 0;
      v_days       := 2;
      v_warranty   := 24;
      v_payment    := 30;
      v_fit        := 98;
      v_notes      := 'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.';
    ELSIF v_idx = 3 THEN
      v_tier_name  := 'Cost-Optimized Economy Tier';
      v_base_price := round(v_base_unit * 0.92, 2);
      v_transport  := round(v_base_price * 0.05, 2);
      v_days       := 5;
      v_warranty   := 6;
      v_payment    := 15;
      v_fit        := 88;
      v_notes      := 'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.';
    ELSIF v_idx = 4 THEN
      v_tier_name  := 'Regional Fast-Track Tier';
      v_base_price := round(v_base_unit * 0.97, 2);
      v_transport  := round(v_base_price * 0.02, 2);
      v_days       := 1;
      v_warranty   := 12;
      v_payment    := 30;
      v_fit        := 92;
      v_notes      := 'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.';
    ELSE
      v_tier_name  := 'Specialist Enterprise Tier';
      v_base_price := round(v_base_unit * 1.05, 2);
      v_transport  := round(v_base_price * 0.01, 2);
      v_days       := 3;
      v_warranty   := 18;
      v_payment    := 45;
      v_fit        := 95;
      v_notes      := 'Enterprise specialist tier: ISO certified manufacturing, dedicated technical account manager.';
    END IF;

    v_gst   := round(v_base_price * 0.18, 2);
    v_cgst  := round(v_gst / 2.0, 2);
    v_sgst  := v_gst - v_cgst;
    v_total := v_base_price + v_gst + v_transport;

    -- Build structured line items
    v_line_items := jsonb_build_array(
      jsonb_build_object(
        'name', 'Primary Deliverable Goods / Services',
        'rate', round(v_base_price * 0.70, 2),
        'quantity', 1,
        'amount', round(v_base_price * 0.70, 2),
        'gstRate', 18,
        'gstAmount', round(v_base_price * 0.70 * 0.18, 2)
      ),
      jsonb_build_object(
        'name', 'Consumables, Parts & Technical Accessories',
        'rate', round(v_base_price * 0.30, 2),
        'quantity', 1,
        'amount', round(v_base_price * 0.30, 2),
        'gstRate', 18,
        'gstAmount', round(v_base_price * 0.30 * 0.18, 2)
      )
    );

    -- Resolve supplier user author
    SELECT su.profile_id INTO v_author
    FROM supplier_users su
    WHERE su.supplier_id = v_inv.supplier_id
    LIMIT 1;

    v_author := COALESCE(v_author, v_rfq.created_by);

    -- Insert quote
    INSERT INTO quotes (
      rfq_id, supplier_id, invitation_id, status, current_version, submitted_at, created_at, updated_at
    ) VALUES (
      p_rfq_id, v_inv.supplier_id, v_inv.invitation_id, 'FINAL', 1, v_now, v_now, v_now
    )
    ON CONFLICT (invitation_id) DO UPDATE
    SET status = 'FINAL',
        current_version = 1,
        submitted_at = v_now,
        updated_at = v_now
    RETURNING id INTO v_quote_id;

    -- Insert quote version snapshot
    INSERT INTO quote_versions (
      quote_id, version, snapshot, notes, created_by, created_at
    ) VALUES (
      v_quote_id,
      1,
      jsonb_build_object(
        'basePrice',         v_base_price,
        'gstAmount',         v_gst,
        'cgstAmount',        v_cgst,
        'sgstAmount',        v_sgst,
        'transportCost',     v_transport,
        'totalCost',         v_total,
        'currency',          'INR',
        'deliveryDays',      v_days,
        'warrantyMonths',    v_warranty,
        'paymentTermsDays',  v_payment,
        'responseTimeHours', 2,
        'technicalFit',      v_fit,
        'certification',     true,
        'simulated',         true,
        'tierName',          v_tier_name,
        'quoteNotes',        v_notes,
        'lineItems',         v_line_items
      ),
      v_notes,
      v_author,
      v_now
    )
    ON CONFLICT (quote_id, version) DO UPDATE
    SET snapshot = EXCLUDED.snapshot,
        notes = EXCLUDED.notes,
        created_at = v_now;

    -- Mark invitation as QUOTED
    UPDATE rfq_invitations
    SET status = 'QUOTED',
        viewed_at = COALESCE(viewed_at, v_now)
    WHERE id = v_inv.invitation_id;

    v_count := v_count + 1;
  END LOOP;

  -- 4. Automatically rescore all live quotes
  BEGIN
    SELECT public.compute_quote_evaluations(p_rfq_id) INTO v_eval_res;
  EXCEPTION WHEN OTHERS THEN
    v_eval_res := jsonb_build_object('scored', 0, 'error', SQLERRM);
  END;

  -- 5. Ensure RFQ is in OPEN state and requirement in QUOTING
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, v_now + interval '5 days'),
        updated_at = v_now
    WHERE id = p_rfq_id;

    UPDATE requirements
    SET status = 'QUOTING'::requirement_status,
        updated_at = v_now
    WHERE id = v_rfq.requirement_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'rfq_id', p_rfq_id,
    'quotes_submitted', v_count,
    'total_quotes', (SELECT count(*)::int FROM quotes WHERE rfq_id = p_rfq_id AND status NOT IN ('DRAFT', 'WITHDRAWN')),
    'evaluation_result', v_eval_res
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_simulated_quotes_for_rfq(uuid, integer) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Canonical Auto-Submit Pilot Quotes (Guarded against demo & staging)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_submit_pilot_quotes(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_req        requirements%ROWTYPE;
  v_inv        record;
  v_base_unit  numeric := 35000;
  v_base_price numeric;
  v_gst        numeric;
  v_transport  numeric;
  v_total      numeric;
  v_days       integer;
  v_warranty   integer;
  v_payment    integer;
  v_fit        integer;
  v_notes      text;
  v_quote_id   uuid;
  v_author     uuid;
  v_idx        integer := 0;
  v_count      integer := 0;
  v_title      text;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RFQ not found');
  END IF;

  -- Invariant: Demo RFQs are managed strictly by demo_stage_scenario and demo_generate_quotes
  IF v_rfq.is_demo OR v_is_staging OR v_is_reset THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auto-submitting pilot quotes is disabled for demo RFQs or during staging/reset');
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  v_title := lower(COALESCE(v_req.title, '') || ' ' || COALESCE(v_req.description, ''));

  -- Intelligent baseline estimation based on product title/category
  IF v_title ~* 'chair|table|furniture|wood|desk|seating' THEN
    IF v_title ~* 'rent|3 day|event|banquet' THEN
      v_base_unit := 36000;
    ELSIF v_req.quantity IS NOT NULL AND v_req.quantity > 0 THEN
      v_base_unit := v_req.quantity * 4500;
    ELSE
      v_base_unit := 42000;
    END IF;
  ELSIF v_title ~* 'solar|inverter|rooftop|panel|kw' THEN
    v_base_unit := 185000;
  ELSIF v_title ~* 'cctv|camera|surveillance|security|dvr|nvr' THEN
    v_base_unit := 48000;
  ELSIF v_title ~* 'water|ro|filter|softener|purifier|wtp' THEN
    v_base_unit := 55000;
  ELSIF v_title ~* 'gas|pipeline|piping|lpg|png|manifold' THEN
    v_base_unit := 68000;
  ELSIF v_title ~* 'electrical|motor|rewind|transformer' THEN
    v_base_unit := 32000;
  ELSE
    v_base_unit := 40000;
  END IF;

  -- Generate distinct bids for all invited suppliers who have not quoted yet
  FOR v_inv IN
    SELECT ri.id as invitation_id, ri.supplier_id, ri.anonymous_label, s.business_name, s.rating_avg
    FROM rfq_invitations ri
    JOIN suppliers s ON s.id = ri.supplier_id
    LEFT JOIN quotes q ON q.invitation_id = ri.id
    WHERE ri.rfq_id = p_rfq_id
      AND q.id IS NULL
      AND ri.status <> 'DECLINED'
    ORDER BY ri.anonymous_label ASC
  LOOP
    v_idx := v_idx + 1;

    IF v_idx = 1 THEN
      v_base_price := round(v_base_unit * 1.00, 2);
      v_transport  := round(v_base_price * 0.03, 2);
      v_days       := 3;
      v_warranty   := 12;
      v_payment    := 15;
      v_fit        := 94;
      v_notes      := 'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.';
    ELSIF v_idx = 2 THEN
      v_base_price := round(v_base_unit * 1.12, 2);
      v_transport  := 0;
      v_days       := 2;
      v_warranty   := 24;
      v_payment    := 30;
      v_fit        := 98;
      v_notes      := 'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.';
    ELSIF v_idx = 3 THEN
      v_base_price := round(v_base_unit * 0.92, 2);
      v_transport  := round(v_base_price * 0.05, 2);
      v_days       := 5;
      v_warranty   := 6;
      v_payment    := 0;
      v_fit        := 88;
      v_notes      := 'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.';
    ELSE
      v_base_price := round(v_base_unit * 0.98, 2);
      v_transport  := round(v_base_price * 0.02, 2);
      v_days       := 1;
      v_warranty   := 12;
      v_payment    := 15;
      v_fit        := 92;
      v_notes      := 'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.';
    END IF;

    v_gst   := round(v_base_price * 0.18, 2);
    v_total := v_base_price + v_gst + v_transport;

    SELECT su.profile_id INTO v_author
    FROM supplier_users su
    WHERE su.supplier_id = v_inv.supplier_id
    LIMIT 1;

    v_author := COALESCE(v_author, v_rfq.created_by);

    INSERT INTO quotes (
      rfq_id, supplier_id, invitation_id, status, current_version, submitted_at
    ) VALUES (
      p_rfq_id, v_inv.supplier_id, v_inv.invitation_id, 'FINAL', 1, now()
    ) RETURNING id INTO v_quote_id;

    INSERT INTO quote_versions (
      quote_id, version, snapshot, notes, created_by
    ) VALUES (
      v_quote_id,
      1,
      jsonb_build_object(
        'basePrice',         v_base_price,
        'gstAmount',         v_gst,
        'transportCost',     v_transport,
        'totalCost',         v_total,
        'currency',          'INR',
        'deliveryDays',      v_days,
        'warrantyMonths',    v_warranty,
        'paymentTermsDays',  v_payment,
        'responseTimeHours', 2,
        'technicalFit',      v_fit,
        'certification',     true,
        'simulated',         false,
        'quoteNotes',        v_notes
      ),
      v_notes,
      v_author
    );

    UPDATE rfq_invitations
    SET status = 'QUOTED',
        viewed_at = COALESCE(viewed_at, now())
    WHERE id = v_inv.invitation_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE rfqs
  SET status = 'OPEN',
      updated_at = now()
  WHERE id = p_rfq_id;

  UPDATE requirements
  SET status = 'QUOTING',
      updated_at = now()
  WHERE id = v_rfq.requirement_id;

  RETURN jsonb_build_object(
    'success', true,
    'rfq_id', p_rfq_id,
    'quotes_submitted', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_submit_pilot_quotes(uuid) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Drop Legacy Overloads and Re-establish Canonical Discovery Engine
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid);
DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid, integer);
DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid, integer, uuid[]);

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(
  p_rfq_id  uuid,
  p_limit   integer DEFAULT 10,
  p_exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq       rfqs%ROWTYPE;
  v_req       requirements%ROWTYPE;
  v_candidate record;
  v_invited   int := 0;
  v_evaluated int := 0;
  v_label     text;
  v_limit     int := GREATEST(COALESCE(p_limit, 10), 1);
  v_quotes_res jsonb := NULL;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  -- Authorization check: caller must belong to org, be platform admin, or run during demo reset/staging
  IF NOT (
    v_is_staging
    OR v_is_reset
    OR private.is_org_member(v_rfq.organization_id)
    OR private.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not an organization member';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Discovery only allowed while RFQ is DRAFT or OPEN';
  END IF;

  -- Pass 1: Canonical capability-based ranking
  FOR v_candidate IN
    SELECT * FROM private.rank_discovery_candidates(p_rfq_id, p_exclude)
    LIMIT v_limit
  LOOP
    v_evaluated := v_evaluated + 1;

    IF EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_candidate.supplier_id
    ) THEN
      CONTINUE;
    END IF;

    v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      p_rfq_id,
      v_candidate.supplier_id,
      v_label,
      'INVITED',
      v_candidate.match_score,
      v_candidate.match_reasons
    );

    v_invited := v_invited + 1;
  END LOOP;

  -- Pass 2: Fallback for requirements without structured capabilities (strict anti-leak compliance: no source)
  IF (v_invited + (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)) < 4 THEN
    FOR v_candidate IN
      SELECT s.id AS supplier_id, COALESCE(s.rating_avg, 4.0) * 20 AS match_score,
             ARRAY['category_match', 'verified_active'] AS match_reasons
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id))
    LOOP
      v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id,
        v_candidate.supplier_id,
        v_label,
        'INVITED',
        v_candidate.match_score,
        v_candidate.match_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  -- Transition RFQ to OPEN if in DRAFT
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    IF NOT v_is_staging AND NOT v_rfq.is_demo THEN
      UPDATE requirements
      SET status = 'QUOTING'::requirement_status,
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  END IF;

  -- Auto-generate pilot quotes ONLY when supplier network is stubbed AND NOT on demo RFQs AND NOT during demo staging/reset
  IF private.supplier_network_stub_enabled() AND NOT v_rfq.is_demo AND NOT v_is_staging AND NOT v_is_reset THEN
    SELECT public.auto_submit_pilot_quotes(p_rfq_id) INTO v_quotes_res;
  END IF;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.suppliers_discovered',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object('invited', v_invited, 'evaluated', v_evaluated)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
    'quotes_result', v_quotes_res
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated, anon, service_role;

COMMIT;

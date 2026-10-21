-- 00311: Individual buyers may compute Smart Merit for their own RFQ.
--
-- compute_quote_evaluations predates personal ownership and authorizes only
-- organization members or committee members. Personal RFQs have no organization,
-- so their owner was denied even though private.can_access_rfq_as_buyer is true.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_quote_evaluations(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_weights jsonb;
  v_scored int := 0;
  v_row record;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.can_access_rfq_as_buyer(p_rfq_id)
     AND NOT private.can_access_rfq_as_committee(p_rfq_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_weights := v_rfq.evaluation_weights;
  IF v_weights IS NULL OR v_weights = '{}'::jsonb THEN
    v_weights := public.suggest_evaluation_weights(v_rfq.requirement_id);
  END IF;

  FOR v_row IN
    WITH weights AS (
      SELECT key AS code, value::numeric AS weight
      FROM jsonb_each_text(v_weights)
    ),
    criteria AS (
      SELECT c.code, c.direction, c.value_source, w.weight
      FROM weights w
      JOIN evaluation_criteria c ON c.code = w.code
    ),
    live_quotes AS (
      SELECT q.id AS quote_id, q.current_version
      FROM quotes q
      WHERE q.rfq_id = p_rfq_id
        AND q.status NOT IN ('DRAFT', 'WITHDRAWN')
    ),
    raw_values AS (
      SELECT lq.quote_id, lq.current_version, cr.code, cr.direction, cr.weight,
             private.quote_criterion_value(lq.quote_id, cr.value_source) AS raw
      FROM live_quotes lq
      CROSS JOIN criteria cr
    ),
    bounds AS (
      SELECT code, min(raw) AS mn, max(raw) AS mx
      FROM raw_values
      GROUP BY code
    ),
    normalized AS (
      SELECT rv.quote_id, rv.current_version, rv.code, rv.weight, rv.raw,
        CASE
          WHEN rv.raw IS NULL THEN 50::numeric
          WHEN b.mx = b.mn THEN 100::numeric
          WHEN rv.direction = 'LOWER_IS_BETTER'
            THEN round(100.0 * (b.mx - rv.raw) / (b.mx - b.mn), 2)
          ELSE round(100.0 * (rv.raw - b.mn) / (b.mx - b.mn), 2)
        END AS normalized
      FROM raw_values rv
      JOIN bounds b ON b.code = rv.code
    )
    SELECT n.quote_id, n.current_version,
           round(sum(n.weight * n.normalized / 100.0), 2) AS score,
           jsonb_object_agg(
             n.code,
             jsonb_build_object(
               'weight', n.weight,
               'raw', n.raw,
               'normalized', n.normalized,
               'contribution', round(n.weight * n.normalized / 100.0, 2),
               'neutral', n.raw IS NULL
             )
           ) AS breakdown
    FROM normalized n
    GROUP BY n.quote_id, n.current_version
  LOOP
    DELETE FROM quote_evaluations
    WHERE quote_id = v_row.quote_id AND version_evaluated = v_row.current_version;

    INSERT INTO quote_evaluations (
      quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at
    ) VALUES (
      v_row.quote_id, p_rfq_id, v_row.current_version, v_row.score,
      v_row.breakdown || jsonb_build_object('_weights', v_weights),
      'COMPUTED', now()
    );

    UPDATE quotes SET evaluation_score = v_row.score WHERE id = v_row.quote_id;
    v_scored := v_scored + 1;
  END LOOP;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.quotes_evaluated', private.get_profile_id(), v_rfq.organization_id,
    'rfq', p_rfq_id::text, jsonb_build_object('scored', v_scored, 'weights', v_weights)
  );

  RETURN jsonb_build_object('scored', v_scored, 'weights', v_weights);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_quote_evaluations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_quote_evaluations(uuid) TO authenticated, service_role;

COMMIT;

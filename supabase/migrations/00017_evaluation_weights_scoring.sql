-- Buyer-owned evaluation weights, and the scoring that actually uses them.
--
-- There is no fixed criteria set. For every requirement the buyer decides
-- which criteria matter and how much: price only, warranty only, or any
-- combination. The category supplies a starting SUGGESTION which the buyer can
-- overwrite or reset. Raw numbers are normalized to 100 so a buyer can type
-- "price 2, warranty 1" and get 66.67 / 33.33.
--
-- match_score is never an input to evaluation (INV-062): eligibility ranking
-- and value scoring are separate systems.

-- ---------------------------------------------------------------------------
-- Normalization — shared by the RPC and mirrored in packages/domain for the UI
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.normalize_evaluation_weights(p_weights jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_total    numeric := 0;
  v_entry    record;
  v_result   jsonb := '{}';
  v_rounded  numeric;
  v_sum      numeric := 0;
  v_top_code text;
  v_top_val  numeric := -1;
BEGIN
  IF p_weights IS NULL OR jsonb_typeof(p_weights) <> 'object' THEN
    RAISE EXCEPTION 'Evaluation weights must be a JSON object';
  END IF;

  FOR v_entry IN SELECT key, value FROM jsonb_each_text(p_weights) LOOP
    IF v_entry.value IS NULL OR v_entry.value !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Weight for "%" must be a non-negative number', v_entry.key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM evaluation_criteria WHERE code = v_entry.key AND is_active
    ) THEN
      RAISE EXCEPTION 'Unknown evaluation criterion "%"', v_entry.key;
    END IF;

    v_total := v_total + v_entry.value::numeric;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'At least one evaluation criterion must carry a positive weight';
  END IF;

  FOR v_entry IN
    SELECT key, value::numeric AS weight
    FROM jsonb_each_text(p_weights)
    WHERE value::numeric > 0
    ORDER BY key
  LOOP
    v_rounded := round((v_entry.weight / v_total) * 100, 2);
    v_result := v_result || jsonb_build_object(v_entry.key, v_rounded);
    v_sum := v_sum + v_rounded;

    IF v_rounded > v_top_val THEN
      v_top_val := v_rounded;
      v_top_code := v_entry.key;
    END IF;
  END LOOP;

  -- Absorb rounding drift into the largest weight so the set totals exactly 100.
  IF v_sum <> 100 AND v_top_code IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      v_top_code, round(v_top_val + (100 - v_sum), 2)
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Suggested starting weights for a requirement (a suggestion, not a rule)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.suggest_evaluation_weights(p_requirement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subcategory uuid;
  v_weights     jsonb;
BEGIN
  SELECT subcategory_id INTO v_subcategory
  FROM requirements
  WHERE id = p_requirement_id;

  SELECT jsonb_object_agg(c.code, s.weight)
  INTO v_weights
  FROM subcategory_evaluation_suggestions s
  JOIN evaluation_criteria c ON c.id = s.criterion_id AND c.is_active
  WHERE s.subcategory_id = v_subcategory;

  IF v_weights IS NULL OR v_weights = '{}'::jsonb THEN
    -- Neutral fallback when a subcategory carries no suggestion yet.
    v_weights := jsonb_build_object('price', 40, 'delivery_time', 30, 'warranty', 30);
  END IF;

  RETURN private.normalize_evaluation_weights(v_weights);
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_evaluation_weights(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Set the weights for an RFQ
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_rfq_evaluation_weights(
  p_rfq_id  uuid,
  p_weights jsonb,
  p_source  text DEFAULT 'CUSTOM'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_normalized jsonb;
  v_previous   jsonb;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_rfq.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role to set evaluation weights';
  END IF;

  -- Once a decision is locked the basis of that decision is immutable.
  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'Evaluation weights are immutable after award';
  END IF;

  IF p_source NOT IN ('SUGGESTED', 'CUSTOM') THEN
    RAISE EXCEPTION 'Weights source must be SUGGESTED or CUSTOM';
  END IF;

  v_normalized := private.normalize_evaluation_weights(p_weights);
  v_previous := v_rfq.evaluation_weights;

  UPDATE rfqs
  SET evaluation_weights = v_normalized,
      evaluation_weights_source = p_source
  WHERE id = p_rfq_id;

  -- Any score computed under the old weights is no longer valid.
  UPDATE quote_evaluations
  SET status = 'STALE'
  WHERE rfq_id = p_rfq_id AND status <> 'STALE';

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.evaluation_weights_set',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object('previous', v_previous, 'weights', v_normalized, 'source', p_source)
  );

  RETURN v_normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_rfq_evaluation_weights(uuid, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Raw criterion values
--
-- value_source on evaluation_criteria names where the number comes from.
-- Quote commercials come from the current version snapshot; delivered
-- performance comes from the supplier record. Nothing here reads match_score
-- or supplier source.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.quote_criterion_value(
  p_quote_id     uuid,
  p_value_source text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot  jsonb;
  v_rating    numeric;
  v_on_time   numeric;
  v_completed integer;
  v_dispute   numeric;
  v_text      text;
BEGIN
  SELECT qv.snapshot, s.rating_avg, s.on_time_percent, s.completed_jobs, s.dispute_rate
  INTO v_snapshot, v_rating, v_on_time, v_completed, v_dispute
  FROM quotes q
  JOIN suppliers s ON s.id = q.supplier_id
  LEFT JOIN quote_versions qv
    ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE q.id = p_quote_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  CASE p_value_source
    WHEN 'total_cost' THEN
      RETURN COALESCE(
        NULLIF(v_snapshot ->> 'totalCost', '')::numeric,
        COALESCE(NULLIF(v_snapshot ->> 'basePrice', '')::numeric, 0)
          + COALESCE(NULLIF(v_snapshot ->> 'gstAmount', '')::numeric, 0)
          + COALESCE(NULLIF(v_snapshot ->> 'transportCost', '')::numeric, 0)
      );
    WHEN 'delivery_days' THEN
      RETURN NULLIF(v_snapshot ->> 'deliveryDays', '')::numeric;
    WHEN 'warranty_months' THEN
      RETURN NULLIF(v_snapshot ->> 'warrantyMonths', '')::numeric;
    WHEN 'payment_terms_days' THEN
      RETURN NULLIF(v_snapshot ->> 'paymentTermsDays', '')::numeric;
    WHEN 'response_time_hours' THEN
      RETURN NULLIF(v_snapshot ->> 'responseTimeHours', '')::numeric;
    WHEN 'technical_fit' THEN
      RETURN NULLIF(v_snapshot ->> 'technicalFit', '')::numeric;
    WHEN 'certification' THEN
      v_text := v_snapshot ->> 'certification';
      IF v_text IS NULL OR v_text = '' THEN
        RETURN NULL;
      END IF;
      RETURN CASE WHEN lower(v_text) IN ('false', 'no', '0') THEN 0 ELSE 100 END;
    WHEN 'supplier_rating' THEN
      RETURN v_rating;
    WHEN 'on_time_percent' THEN
      RETURN v_on_time;
    WHEN 'completed_jobs' THEN
      RETURN v_completed;
    WHEN 'dispute_rate' THEN
      RETURN v_dispute;
    ELSE
      RETURN NULL;   -- unrecognised source scores neutrally, never silently zero
  END CASE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Compute weighted scores for every live quote on an RFQ
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_quote_evaluations(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq     rfqs%ROWTYPE;
  v_weights jsonb;
  v_scored  int := 0;
  v_row     record;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id)
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
      SELECT
        lq.quote_id,
        lq.current_version,
        cr.code,
        cr.direction,
        cr.weight,
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
      SELECT
        rv.quote_id,
        rv.current_version,
        rv.code,
        rv.weight,
        rv.raw,
        CASE
          -- No comparable number: score the criterion neutrally rather than
          -- punishing the quote or silently dropping the weight.
          WHEN rv.raw IS NULL THEN 50::numeric
          WHEN b.mx = b.mn THEN 100::numeric
          WHEN rv.direction = 'LOWER_IS_BETTER'
            THEN round(100.0 * (b.mx - rv.raw) / (b.mx - b.mn), 2)
          ELSE round(100.0 * (rv.raw - b.mn) / (b.mx - b.mn), 2)
        END AS normalized
      FROM raw_values rv
      JOIN bounds b ON b.code = rv.code
    )
    SELECT
      n.quote_id,
      n.current_version,
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
    'rfq.quotes_evaluated',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object('scored', v_scored, 'weights', v_weights)
  );

  RETURN jsonb_build_object('scored', v_scored, 'weights', v_weights);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_quote_evaluations(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- A revised quote invalidates its score
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.stale_evaluations_on_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quote_evaluations
  SET status = 'STALE'
  WHERE quote_id = NEW.quote_id
    AND version_evaluated < NEW.version
    AND status <> 'STALE';

  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_versions_stale_evaluations
  AFTER INSERT ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.stale_evaluations_on_revision();

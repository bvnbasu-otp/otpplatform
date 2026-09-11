-- An undeclared capacity ceiling means unknown, not zero.
--
-- Discovery gated on `COALESCE(max_capacity_value, 0) >= need`, so a supplier
-- who declared "I rewind motors" but never filled in a maximum HP was treated
-- as capable of nothing and dropped silently. Two things are wrong with that.
--
-- The first is fairness: a small workshop with a thin profile disappears from
-- the market entirely, and never learns why. The second is that the buyer sees
-- an empty result with no explanation, which looks like the platform is broken
-- rather than like the data is incomplete.
--
-- So an undeclared ceiling now lets the supplier through, ranked below those
-- who have declared enough headroom, and carries a match reason saying so. A
-- ceiling that IS declared and is too small still excludes, because that is
-- the supplier's own statement that they cannot do the job.

CREATE OR REPLACE FUNCTION private.rank_discovery_candidates(
  p_rfq_id  uuid,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  supplier_id   uuid,
  match_score   numeric,
  match_reasons text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq              rfqs%ROWTYPE;
  v_req              requirements%ROWTYPE;
  v_city             text;
  v_pincode          text;
  v_primary_total    int;
  v_secondary_total  int;
  v_requirement_caps boolean;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  v_city := COALESCE(
    v_req.delivery_city,
    v_req.structured_specs -> 'deliveryLocation' ->> 'city'
  );
  v_pincode := COALESCE(
    v_req.delivery_pincode,
    v_req.structured_specs -> 'deliveryLocation' ->> 'pincode'
  );

  SELECT
    count(*) FILTER (WHERE rc.is_primary),
    count(*) FILTER (WHERE NOT rc.is_primary)
  INTO v_primary_total, v_secondary_total
  FROM private.rfq_required_capabilities(p_rfq_id) rc;

  v_requirement_caps := COALESCE(v_primary_total, 0) > 0;

  RETURN QUERY
  WITH required AS (
    SELECT rc.capability_id, rc.capability_code, rc.capacity_unit, rc.is_primary,
           private.requirement_capacity_need(v_req.id, rc.capacity_unit) AS need
    FROM private.rfq_required_capabilities(p_rfq_id) rc
  ),
  candidate AS (
    SELECT
      s.id,
      s.rating_avg,
      s.on_time_percent,
      s.dispute_rate,
      -- Primary capabilities the supplier can plausibly serve: either the job
      -- states no capacity, or the supplier's declared ceiling covers it, or
      -- the supplier has not stated a ceiling at all.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND (
            rq.need = 0
            OR sc.max_capacity_value IS NULL
            OR sc.max_capacity_value >= rq.need
          )
      ) AS primary_hits,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE NOT rq.is_primary
      ) AS secondary_hits,
      -- Stated a ceiling and it is below what the job needs: the supplier's
      -- own answer is no.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NOT NULL
          AND sc.max_capacity_value < rq.need
      ) AS capacity_short,
      -- Comfortable headroom (>= 1.5x) reads as a safer fit.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NOT NULL
          AND sc.max_capacity_value >= rq.need * 1.5
      ) AS capacity_comfort,
      -- Capability held, capacity never stated. Eligible, but ranked behind
      -- suppliers who have answered the question.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NULL
      ) AS capacity_unknown,
      (SELECT count(*) FROM supplier_service_areas a WHERE a.supplier_id = s.id) AS area_rows,
      EXISTS (
        SELECT 1 FROM supplier_service_areas a
        WHERE a.supplier_id = s.id AND v_pincode IS NOT NULL AND a.pincode = v_pincode
      ) AS pincode_match,
      EXISTS (
        SELECT 1 FROM supplier_service_areas a
        WHERE a.supplier_id = s.id AND v_city IS NOT NULL
          AND lower(a.city) = lower(v_city)
      ) AS city_match,
      (lower(COALESCE(s.city, '')) = lower(COALESCE(v_city, '~'))) AS based_in_city
    FROM suppliers s
    WHERE s.status = 'ACTIVE'                       -- excludes SUSPENDED (INV-063)
      AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
  ),
  scored AS (
    SELECT
      c.id,
      c.primary_hits,
      c.secondary_hits,
      c.capacity_short,
      c.capacity_unknown,
      c.pincode_match,
      c.city_match,
      c.based_in_city,
      c.area_rows,
      -- Capability match dominates, then geography, then delivered performance.
      LEAST(100, GREATEST(0,
          CASE
            WHEN NOT v_requirement_caps THEN 40
            ELSE round(40.0 * c.primary_hits / GREATEST(v_primary_total, 1), 2)
          END
        + CASE
            WHEN COALESCE(v_secondary_total, 0) = 0 THEN 0
            ELSE round(10.0 * c.secondary_hits / v_secondary_total, 2)
          END
        + CASE
            WHEN c.pincode_match THEN 20
            WHEN c.city_match THEN 15
            WHEN c.based_in_city THEN 12
            WHEN c.area_rows = 0 THEN 6   -- coverage not declared: neutral
            ELSE 0
          END
        + round(COALESCE(c.rating_avg, 3.0) * 3, 2)                    -- up to 15
        + round(COALESCE(c.on_time_percent, 80) * 0.10, 2)             -- up to 10
        + CASE WHEN c.capacity_comfort > 0 THEN 5 ELSE 0 END
        - CASE WHEN c.capacity_unknown > 0 THEN 8 ELSE 0 END
        - round(COALESCE(c.dispute_rate, 0) * 0.10, 2)
      )) AS score
    FROM candidate c
  )
  SELECT
    sc.id,
    sc.score,
    (
      SELECT ARRAY_AGG(reason ORDER BY reason)
      FROM (
        SELECT 'capability:' || rq.capability_code AS reason
        FROM required rq
        JOIN supplier_capabilities sup
          ON sup.supplier_id = sc.id AND sup.capability_id = rq.capability_id
        UNION ALL
        SELECT 'geo:pincode' WHERE sc.pincode_match
        UNION ALL
        SELECT 'geo:city' WHERE sc.city_match AND NOT sc.pincode_match
        UNION ALL
        SELECT 'geo:based_in_city' WHERE sc.based_in_city AND NOT sc.city_match AND NOT sc.pincode_match
        UNION ALL
        SELECT 'geo:undeclared' WHERE sc.area_rows = 0
        UNION ALL
        SELECT 'capacity:undeclared' WHERE sc.capacity_unknown > 0
        UNION ALL
        SELECT 'capability:none_required' WHERE NOT v_requirement_caps
      ) reasons
    ) AS match_reasons
  FROM scored sc
  WHERE
    -- Eligibility: at least one primary capability the supplier has not ruled
    -- themselves out of, or no capability profile on the requirement at all
    -- (unclassified legacy requirements still need to reach someone).
    (NOT v_requirement_caps OR sc.primary_hits > 0)
    -- Geography: when the buyer stated a location and the supplier declared
    -- coverage, they must overlap (INV-061).
    AND (
      (v_city IS NULL AND v_pincode IS NULL)
      OR sc.area_rows = 0
      OR sc.pincode_match
      OR sc.city_match
      OR sc.based_in_city
    )
  ORDER BY sc.score DESC, sc.id ASC;  -- deterministic for tests
END;
$$;

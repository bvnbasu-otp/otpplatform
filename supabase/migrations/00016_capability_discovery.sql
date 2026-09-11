-- Capability-based supplier discovery.
--
-- The category explains the requirement; the capability engine decides who can
-- fulfil it. A "10 HP borewell motor rewinding" requirement filed under Water &
-- Environmental Solutions therefore reaches motor workshops, electrical
-- contractors and pump services, because all of them declare the
-- motor_rewinding capability with enough HP headroom.
--
-- Ranking uses capability match, subcategory match, service area, proximity,
-- capacity headroom and delivered performance. It never uses supplier source,
-- subscription state or buyer relationship (INV-044, INV-062): the previous
-- implementation leaked source into match_reasons and that is removed here.

-- ---------------------------------------------------------------------------
-- Required capabilities for an RFQ, resolved from the requirement subcategory
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.rfq_required_capabilities(p_rfq_id uuid)
RETURNS TABLE (capability_id uuid, capability_code text, capacity_unit text, is_primary boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.code, c.capacity_unit, sc.is_primary
  FROM rfqs r
  JOIN requirements req ON req.id = r.requirement_id
  JOIN subcategory_capabilities sc ON sc.subcategory_id = req.subcategory_id
  JOIN capabilities c ON c.id = sc.capability_id
  WHERE r.id = p_rfq_id
    AND c.is_active;
$$;

-- ---------------------------------------------------------------------------
-- How much capacity the requirement needs, in a capability's capacity unit
--
-- Data-driven: an attribute definition that carries the same unit as the
-- capability (for example HP) supplies the number, so no capability is
-- special-cased in code.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.requirement_capacity_need(
  p_requirement_id uuid,
  p_capacity_unit  text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req  requirements%ROWTYPE;
  v_need numeric;
BEGIN
  IF p_capacity_unit IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT max(
    CASE
      WHEN (v_req.attributes ->> d.code) ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (v_req.attributes ->> d.code)::numeric
      ELSE NULL
    END
  )
  INTO v_need
  FROM category_attribute_definitions d
  WHERE d.is_active
    AND d.unit IS NOT NULL
    AND upper(d.unit) = upper(p_capacity_unit)
    AND (d.subcategory_id = v_req.subcategory_id OR d.category_id = v_req.category_id)
    AND v_req.attributes ? d.code;

  -- Requirements seeded before the taxonomy existed keep capacity in
  -- structured_specs.
  IF COALESCE(v_need, 0) = 0 AND upper(p_capacity_unit) = 'HP' THEN
    v_need := COALESCE(
      NULLIF(v_req.structured_specs ->> 'motorCapacityHp', '')::numeric,
      NULLIF(v_req.structured_specs -> 'attributes' ->> 'hp', '')::numeric,
      0
    );
  END IF;

  RETURN COALESCE(v_need, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Anonymous label allocation
--
-- Sequential here; migration 00021 replaces the body with per-RFQ randomized
-- codes so the same supplier cannot be tracked across RFQs. Discovery calls
-- this helper and never builds labels itself.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assign_anonymous_label(
  p_rfq_id      uuid,
  p_supplier_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taken int;
BEGIN
  SELECT count(*)::int INTO v_taken FROM rfq_invitations WHERE rfq_id = p_rfq_id;
  RETURN 'Supplier ' || chr(65 + (v_taken % 26));
END;
$$;

-- ---------------------------------------------------------------------------
-- Candidate ranking
--
-- Exposed separately from invitation so the buyer UI can preview reach, and so
-- tests can assert ranking without mutating invitations. Returns supplier ids,
-- so it stays SECURITY DEFINER and is never granted to buyers directly.
-- ---------------------------------------------------------------------------

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
      -- Primary capabilities the supplier declares with enough headroom.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND (rq.need = 0 OR COALESCE(sc.max_capacity_value, 0) >= rq.need)
      ) AS primary_hits,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE NOT rq.is_primary
      ) AS secondary_hits,
      -- Declared a primary capability but cannot handle the capacity.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND COALESCE(sc.max_capacity_value, 0) < rq.need
      ) AS capacity_short,
      -- Comfortable headroom (>= 1.5x) reads as a safer fit.
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND COALESCE(sc.max_capacity_value, 0) >= rq.need * 1.5
      ) AS capacity_comfort,
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
      AND NOT (s.id = ANY (COALESCE(p_exclude, '{}')))  -- buyer blocklist (INV-070)
  ),
  scored AS (
    SELECT
      c.id,
      c.primary_hits,
      c.secondary_hits,
      c.capacity_short,
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
        SELECT 'capability:none_required' WHERE NOT v_requirement_caps
      ) reasons
    ) AS match_reasons
  FROM scored sc
  WHERE
    -- Eligibility: at least one primary capability with adequate capacity, or
    -- no capability profile on the requirement at all (unclassified legacy
    -- requirements still need to reach someone).
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

-- ---------------------------------------------------------------------------
-- Discovery + invitation
--
-- Replaces the category-string implementation from 00011. Dropped rather than
-- replaced so the new defaulted signature stays unambiguous for one-argument
-- callers.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid);

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(
  p_rfq_id  uuid,
  p_limit   integer DEFAULT 10,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq       rfqs%ROWTYPE;
  v_candidate record;
  v_invited   int := 0;
  v_evaluated int := 0;
  v_label     text;
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
    RAISE EXCEPTION 'Insufficient role for discovery';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Discovery only allowed while RFQ is DRAFT or OPEN';
  END IF;

  FOR v_candidate IN
    SELECT * FROM private.rank_discovery_candidates(p_rfq_id, p_exclude)
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
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
    'invited', v_invited,
    'evaluated', v_evaluated,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Buyer-facing reach preview — counts only, never supplier identity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_discovery_reach(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq   rfqs%ROWTYPE;
  v_total int;
  v_caps  text[];
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*)::int INTO v_total
  FROM private.rank_discovery_candidates(p_rfq_id, '{}');

  SELECT ARRAY_AGG(DISTINCT capability_code ORDER BY capability_code)
  INTO v_caps
  FROM private.rfq_required_capabilities(p_rfq_id);

  RETURN jsonb_build_object(
    'eligible_suppliers', v_total,
    'required_capabilities', COALESCE(v_caps, '{}')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_discovery_reach(uuid) TO authenticated;

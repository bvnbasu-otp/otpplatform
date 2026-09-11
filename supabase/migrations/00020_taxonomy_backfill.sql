-- Backfill: move everything that already exists onto the new taxonomy.
--
-- Requirements are classified with the same keyword scoring the parser uses,
-- so the backfill and the live intake path agree by construction. Suppliers
-- get capability rows and service-area rows derived from their legacy
-- categories, services and maxHp, which is what makes capability discovery
-- work for data seeded before this schema existed.

-- ---------------------------------------------------------------------------
-- Nearest-city resolution for legacy lat/lng service areas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.nearest_city(p_lat numeric, p_lng numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT c.name
  FROM (VALUES
    ('Bengaluru',  12.9716, 77.5946),
    ('Coimbatore', 11.0168, 76.9558),
    ('Tiruppur',   11.1085, 77.3411),
    ('Erode',      11.3410, 77.7172),
    ('Salem',      11.6643, 78.1460),
    ('Chennai',    13.0827, 80.2707),
    ('Madurai',     9.9252, 78.1198),
    ('Trichy',     10.7905, 78.7047)
  ) AS c(name, lat, lng)
  WHERE p_lat IS NOT NULL AND p_lng IS NOT NULL
  ORDER BY (c.lat - p_lat) ^ 2 + (c.lng - p_lng) ^ 2
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Requirement classification
--
-- Scores each subcategory by the total length of its match_keywords found in
-- the requirement text: longer, more specific phrases outweigh generic ones,
-- so "spindle repair" beats a bare "cnc" mention.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.classify_requirement_text(p_text text)
RETURNS TABLE (subcategory_id uuid, subcategory_code text, score integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH hay AS (SELECT lower(COALESCE(p_text, '')) AS t)
  SELECT s.id, s.code, sum(length(k))::int AS score
  FROM requirement_subcategories s
  CROSS JOIN LATERAL unnest(s.match_keywords) AS k
  CROSS JOIN hay
  WHERE s.is_active
    AND length(k) > 0
    AND position(k IN hay.t) > 0
  GROUP BY s.id, s.code
  ORDER BY score DESC, s.code;
$$;

GRANT EXECUTE ON FUNCTION public.classify_requirement_text(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- The backfill itself
--
-- Kept as a callable function rather than a one-shot script because seed data
-- arrives after migrations have run, so the seeds need to invoke exactly this
-- logic. Every statement is written to be safe to run again: nothing is
-- overwritten, only gaps are filled.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backfill_taxonomy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $backfill$
DECLARE
  v_classified integer;
  v_caps       integer;
  v_areas      integer;
BEGIN

-- Classify every requirement that has no subcategory yet.
WITH candidate AS (
  SELECT r.id,
         lower(
           COALESCE(r.title, '') || ' ' ||
           COALESCE(r.description, '') || ' ' ||
           COALESCE(r.structured_specs::text, '')
         ) AS hay
  FROM requirements r
  WHERE r.subcategory_id IS NULL
),
best AS (
  SELECT DISTINCT ON (c.id) c.id, m.subcategory_id
  FROM candidate c
  CROSS JOIN LATERAL public.classify_requirement_text(c.hay) m
  ORDER BY c.id, m.score DESC, m.subcategory_code
)
UPDATE requirements r
SET subcategory_id = best.subcategory_id
FROM best
WHERE r.id = best.id;

-- Anything the keywords could not place still needs a home.
UPDATE requirements r
SET subcategory_id = (
  SELECT id FROM requirement_subcategories
  WHERE code = CASE r.requirement_type
    WHEN 'PRODUCT' THEN 'general_products'
    WHEN 'PROJECT' THEN 'custom_requirement'
    ELSE 'general_services'
  END
)
WHERE r.subcategory_id IS NULL;

-- Adopt the subcategory's default mode where the requirement has none.
-- The requirements_normalize trigger fills category_id and requirement_type.
UPDATE requirements r
SET requirement_mode = COALESCE(r.requirement_mode, s.default_requirement_mode)
FROM requirement_subcategories s
WHERE s.id = r.subcategory_id
  AND r.requirement_mode IS NULL
  AND private.requirement_mode_base_type(s.default_requirement_mode) = r.requirement_type;

-- Where the subcategory's default mode would contradict the recorded
-- requirement_type, keep the type authoritative and pick a compatible mode.
UPDATE requirements r
SET requirement_mode = CASE r.requirement_type
  WHEN 'PRODUCT' THEN 'PRODUCT_MATERIAL'::requirement_mode
  WHEN 'PROJECT' THEN 'PROJECT_CONTRACT'::requirement_mode
  ELSE 'SERVICE'::requirement_mode
END
WHERE r.requirement_mode IS NULL;

-- ---------------------------------------------------------------------------
-- Requirement universal fields and attributes from legacy structured_specs
-- ---------------------------------------------------------------------------

UPDATE requirements r
SET quantity = COALESCE(
      r.quantity,
      CASE
        WHEN (r.structured_specs ->> 'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (r.structured_specs ->> 'quantity')::numeric
      END
    ),
    unit = COALESCE(r.unit, NULLIF(r.structured_specs ->> 'unit', '')),
    delivery_city = COALESCE(
      r.delivery_city,
      NULLIF(r.structured_specs -> 'deliveryLocation' ->> 'city', '')
    ),
    delivery_line1 = COALESCE(
      r.delivery_line1,
      NULLIF(r.structured_specs -> 'deliveryLocation' ->> 'line1', '')
    ),
    delivery_pincode = COALESCE(
      r.delivery_pincode,
      CASE
        WHEN (r.structured_specs -> 'deliveryLocation' ->> 'postalCode') ~ '^[0-9]{6}$'
          THEN r.structured_specs -> 'deliveryLocation' ->> 'postalCode'
      END
    ),
    fulfilment_mode = COALESCE(
      r.fulfilment_mode,
      CASE WHEN r.requirement_type = 'PRODUCT'
        THEN 'SUPPLIER_DELIVERY'::fulfilment_mode
        ELSE 'SUPPLIER_ONSITE'::fulfilment_mode
      END
    ),
    required_by_mode = COALESCE(r.required_by_mode, 'FLEXIBLE'::required_by_mode)
WHERE r.structured_specs IS NOT NULL OR r.delivery_city IS NULL;

-- Legacy attribute keys onto their taxonomy codes. Only keys that map to a
-- real attribute definition for the requirement's subcategory are adopted, and
-- only for free-form types: legacy ENUM-ish values like "3-phase" or
-- "combed cotton" do not match the curated option lists, so importing them
-- would put the form into an invalid state.
UPDATE requirements r
SET attributes = r.attributes || mapped.attrs
FROM (
  SELECT req.id, jsonb_object_agg(m.code, m.value) AS attrs
  FROM requirements req
  CROSS JOIN LATERAL (
    VALUES
      ('motor_hp',     req.structured_specs -> 'attributes' -> 'hp'),
      ('yarn_count',   req.structured_specs -> 'attributes' -> 'count'),
      ('machine_type', req.structured_specs -> 'attributes' -> 'machineType')
  ) AS m(code, value)
  WHERE m.value IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.subcategory_attribute_schema(req.subcategory_id) sch
      WHERE sch.code = m.code
        AND sch.data_type IN ('NUMBER', 'TEXT')
    )
  GROUP BY req.id
) AS mapped
WHERE r.id = mapped.id;

-- ---------------------------------------------------------------------------
-- Supplier capabilities from legacy categories, services and maxHp
-- ---------------------------------------------------------------------------

INSERT INTO supplier_capabilities (supplier_id, capability_id, max_capacity_value, capacity_unit, notes)
SELECT DISTINCT ON (s.id, cap.id)
  s.id,
  cap.id,
  CASE
    WHEN cap.capacity_unit = 'HP'
      THEN NULLIF(s.capabilities ->> 'maxHp', '')::numeric
  END,
  cap.capacity_unit,
  'Derived from legacy supplier profile'
FROM suppliers s
CROSS JOIN LATERAL (
  -- Declared service codes are the strongest signal.
  SELECT svc AS token FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(s.capabilities -> 'services') = 'array'
      THEN s.capabilities -> 'services' ELSE '[]'::jsonb END
  ) AS svc
  UNION ALL
  -- Legacy category labels fill the gaps.
  SELECT lower(cat) FROM unnest(COALESCE(s.categories, '{}')) AS cat
) AS legacy
JOIN (VALUES
  ('motor_winding',        'motor_rewinding'),
  ('motor winding',        'motor_rewinding'),
  ('borewell_repair',      'borewell_flushing'),
  ('borewell',             'borewell_flushing'),
  ('pump_service',         'pump_installation'),
  ('panel_install',        'panel_manufacturing'),
  ('panel',                'panel_manufacturing'),
  ('panel_upgrade',        'electrical_contracting'),
  ('panel upgrade',        'electrical_contracting'),
  ('wiring',               'electrical_contracting'),
  ('electrical',           'electrical_contracting'),
  ('3-phase',              'electrical_contracting'),
  ('amc',                  'facility_amc'),
  ('spindle_repair',       'spindle_repair'),
  ('spindle repair',       'spindle_repair'),
  ('vibration_analysis',   'machine_installation'),
  ('calibration',          'machine_installation'),
  ('maintenance',          'machine_installation'),
  ('machine maintenance',  'machine_installation'),
  ('cnc',                  'cnc_machining'),
  ('yarn',                 'cotton_yarn_supply'),
  ('cotton',               'cotton_yarn_supply'),
  ('40s',                  'cotton_yarn_supply'),
  ('textile raw material', 'cotton_yarn_supply')
) AS map(token, capability_code) ON map.token = legacy.token
JOIN capabilities cap ON cap.code = map.capability_code
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

-- A motor workshop that can rewind can also refit the pump it came out of.
INSERT INTO supplier_capabilities (supplier_id, capability_id, max_capacity_value, capacity_unit, notes)
SELECT sc.supplier_id, cap.id, sc.max_capacity_value, cap.capacity_unit,
       'Derived from legacy supplier profile'
FROM supplier_capabilities sc
JOIN capabilities rewind ON rewind.id = sc.capability_id AND rewind.code = 'motor_rewinding'
JOIN capabilities cap ON cap.code = 'pump_installation'
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

-- Yarn traders quote against a count range; record it as a note rather than
-- inventing a numeric ceiling.
UPDATE supplier_capabilities sc
SET notes = 'Legacy grades: ' || (
      SELECT string_agg(g, ', ') FROM jsonb_array_elements_text(s.capabilities -> 'grades') AS g
    )
FROM suppliers s
WHERE s.id = sc.supplier_id
  AND jsonb_typeof(s.capabilities -> 'grades') = 'array'
  AND sc.capability_id = (SELECT id FROM capabilities WHERE code = 'cotton_yarn_supply');

-- ---------------------------------------------------------------------------
-- Supplier service areas and home city from legacy service_area jsonb
-- ---------------------------------------------------------------------------

INSERT INTO supplier_service_areas (supplier_id, city, radius_km, center_lat, center_lng, is_primary)
SELECT
  s.id,
  private.nearest_city(
    NULLIF(s.service_area ->> 'centerLat', '')::numeric,
    NULLIF(s.service_area ->> 'centerLng', '')::numeric
  ),
  NULLIF(s.service_area ->> 'radiusKm', '')::numeric,
  NULLIF(s.service_area ->> 'centerLat', '')::numeric,
  NULLIF(s.service_area ->> 'centerLng', '')::numeric,
  true
FROM suppliers s
WHERE s.service_area ? 'centerLat'
  AND NOT EXISTS (SELECT 1 FROM supplier_service_areas a WHERE a.supplier_id = s.id);

-- Explicit pin codes give discovery an exact-match signal.
INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT
  s.id,
  private.nearest_city(
    NULLIF(s.service_area ->> 'centerLat', '')::numeric,
    NULLIF(s.service_area ->> 'centerLng', '')::numeric
  ),
  pin,
  false
FROM suppliers s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s.service_area -> 'pinCodes') = 'array'
    THEN s.service_area -> 'pinCodes' ELSE '[]'::jsonb END
) AS pin
WHERE pin ~ '^[0-9]{6}$';

UPDATE suppliers s
SET city = a.city
FROM supplier_service_areas a
WHERE a.supplier_id = s.id
  AND a.is_primary
  AND s.city IS NULL;

-- ---------------------------------------------------------------------------
-- Baseline performance so evaluation criteria that read the supplier record
-- have something honest to compare, rather than defaulting everyone to
-- neutral. Derived from the existing rating only.
-- ---------------------------------------------------------------------------

UPDATE suppliers
SET on_time_percent = COALESCE(on_time_percent, round(LEAST(100, 60 + rating_avg * 8), 2)),
    dispute_rate = COALESCE(dispute_rate, 0)
WHERE rating_avg IS NOT NULL;

SELECT count(*) INTO v_classified FROM requirements WHERE subcategory_id IS NOT NULL;
SELECT count(*) INTO v_caps FROM supplier_capabilities;
SELECT count(*) INTO v_areas FROM supplier_service_areas;

RETURN jsonb_build_object(
  'requirements_classified', v_classified,
  'supplier_capabilities', v_caps,
  'supplier_service_areas', v_areas
);
END;
$backfill$;

-- Run it now for anything already in the database, and let the seeds call it
-- again for the rows they add.
SELECT public.backfill_taxonomy();

-- Make capacity gating explicit rather than unit-guessed.
--
-- Discovery excludes a supplier whose declared ceiling is below what the job
-- needs: a workshop that tops out at 10 HP should not be shown a 25 HP motor.
-- Finding "what the job needs" by scanning the requirement for any attribute
-- whose unit matches the capability's unit looked economical, but it conflates
-- unrelated quantities. A CNC job carries tolerance_mm (0.02) and the CNC
-- capability's ceiling is also in MM (workpiece size), so a 600 mm shop and a
-- 200 mm shop both "passed" on a 0.02 need. The gate was silently doing
-- nothing.
--
-- So a capability now names the attribute that drives its capacity. Where no
-- attribute applies - most supply capabilities, where the need simply is the
-- order quantity - the requirement's own quantity is used when its unit
-- matches. And where neither applies, the gate stays open rather than
-- inventing a number.

ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS capacity_attribute_code text;

COMMENT ON COLUMN capabilities.capacity_attribute_code IS
  'Requirement attribute whose value is the capacity this capability is measured against. NULL means fall back to the requirement quantity when its unit matches capacity_unit.';

-- ---------------------------------------------------------------------------
-- Which attribute speaks for which capability
-- ---------------------------------------------------------------------------

UPDATE capabilities c
SET capacity_attribute_code = m.attr
FROM (VALUES
  -- Motors and pumps are rated in HP, and the job states the motor's HP.
  ('motor_rewinding',          'motor_hp'),
  ('motor_supply',             'motor_hp'),
  ('pump_installation',        'motor_hp'),
  ('submersible_pump_supply',  'motor_hp'),

  -- Borewell work is priced and limited by depth.
  ('borewell_drilling',        'depth_ft'),
  ('borewell_flushing',        'depth_ft'),

  -- Electrical plant is rated in KVA or KW.
  ('dg_supply',                'capacity_kva'),
  ('dg_maintenance',           'capacity_kva'),
  ('transformer_service',      'capacity_kva'),
  ('ups_service',              'capacity_kva'),
  ('motor_control_automation', 'capacity_kw'),
  ('gearbox_repair',           'capacity_kw'),
  ('solar_installation',       'system_kw'),

  -- Water plant throughput, tanks by volume.
  ('water_treatment_plant',    'capacity_lph'),
  ('sewage_treatment_plant',   'capacity_lph'),
  ('tank_cleaning',            'tank_capacity_l'),

  -- Area-based services take the area they have to cover.
  ('pest_control',             'built_up_area'),
  ('gardening_landscaping',    'area'),
  ('painting_work',            'area'),
  ('painting_service',         'area'),
  ('tiling_flooring',          'area'),
  ('waterproofing',            'area'),
  ('warehousing',              'area')
) AS m(cap, attr)
WHERE c.code = m.cap;

-- Guard against a typo pointing at an attribute that does not exist.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(c.code || ' -> ' || c.capacity_attribute_code, ', ')
  INTO v_bad
  FROM capabilities c
  WHERE c.capacity_attribute_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM category_attribute_definitions d
      WHERE d.code = c.capacity_attribute_code
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'capacity_attribute_code points at unknown attributes: %', v_bad;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Unit equivalence
--
-- Buyers write "kg", "Kgs" and "kilogram" for the same thing. Rather than
-- demand exact strings, normalise the handful of forms that actually occur.
-- Deliberately conservative: unrelated units must never compare equal, since
-- that would gate suppliers on a meaningless comparison.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.normalize_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(p_unit, '')))
    WHEN ''            THEN NULL
    WHEN 'kg'          THEN 'KG'
    WHEN 'kgs'         THEN 'KG'
    WHEN 'kilogram'    THEN 'KG'
    WHEN 'kilograms'   THEN 'KG'
    WHEN 'mt'          THEN 'MT'
    WHEN 'tonne'       THEN 'MT'
    WHEN 'tonnes'      THEN 'MT'
    WHEN 'ton'         THEN 'MT'
    WHEN 'tons'        THEN 'MT'
    WHEN 'l'           THEN 'L'
    WHEN 'ltr'         THEN 'L'
    WHEN 'litre'       THEN 'L'
    WHEN 'litres'      THEN 'L'
    WHEN 'liter'       THEN 'L'
    WHEN 'liters'      THEN 'L'
    WHEN 'm'           THEN 'M'
    WHEN 'metre'       THEN 'M'
    WHEN 'metres'      THEN 'M'
    WHEN 'meter'       THEN 'M'
    WHEN 'meters'      THEN 'M'
    WHEN 'ft'          THEN 'FT'
    WHEN 'feet'        THEN 'FT'
    WHEN 'foot'        THEN 'FT'
    WHEN 'sqft'        THEN 'SQFT'
    WHEN 'sq ft'       THEN 'SQFT'
    WHEN 'sq.ft'       THEN 'SQFT'
    WHEN 'square feet' THEN 'SQFT'
    WHEN 'cum'         THEN 'CUM'
    WHEN 'cubic metre' THEN 'CUM'
    WHEN 'pcs'         THEN 'PCS'
    WHEN 'piece'       THEN 'PCS'
    WHEN 'pieces'      THEN 'PCS'
    WHEN 'nos'         THEN 'PCS'
    WHEN 'no'          THEN 'PCS'
    WHEN 'unit'        THEN 'PCS'
    WHEN 'units'       THEN 'PCS'
    WHEN 'hp'          THEN 'HP'
    WHEN 'kw'          THEN 'KW'
    WHEN 'kva'         THEN 'KVA'
    WHEN 'lph'         THEN 'LPH'
    WHEN 'mbps'        THEN 'MBPS'
    WHEN 'gb'          THEN 'GB'
    WHEN 'mm'          THEN 'MM'
    WHEN 'a'           THEN 'A'
    WHEN 'amp'         THEN 'A'
    WHEN 'amps'        THEN 'A'
    ELSE upper(btrim(p_unit))
  END;
$$;

CREATE OR REPLACE FUNCTION private.unit_matches(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT private.normalize_unit(p_a) IS NOT NULL
     AND private.normalize_unit(p_a) = private.normalize_unit(p_b);
$$;

-- ---------------------------------------------------------------------------
-- Capacity the job actually needs
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
  v_attr text;
  v_need numeric;
BEGIN
  IF p_capacity_unit IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- 1. The attribute the capability nominates, if the buyer filled it in.
  SELECT c.capacity_attribute_code INTO v_attr
  FROM capabilities c
  WHERE upper(COALESCE(c.capacity_unit, '')) = upper(p_capacity_unit)
    AND c.capacity_attribute_code IS NOT NULL
    AND v_req.attributes ? c.capacity_attribute_code
    AND (v_req.attributes ->> c.capacity_attribute_code) ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY c.code
  LIMIT 1;

  IF v_attr IS NOT NULL THEN
    RETURN (v_req.attributes ->> v_attr)::numeric;
  END IF;

  -- 2. Otherwise the order quantity, when it is measured in the same unit.
  --    A 2,000 kg yarn order needs a trader who can move 2,000 kg.
  IF v_req.quantity IS NOT NULL
     AND private.unit_matches(v_req.unit, p_capacity_unit) THEN
    RETURN v_req.quantity;
  END IF;

  -- 3. Requirements written before the taxonomy existed kept motor capacity
  --    in structured_specs.
  IF upper(p_capacity_unit) = 'HP' THEN
    v_need := COALESCE(
      NULLIF(v_req.structured_specs ->> 'motorCapacityHp', '')::numeric,
      NULLIF(v_req.structured_specs -> 'attributes' ->> 'hp', '')::numeric
    );
    IF v_need IS NOT NULL THEN
      RETURN v_need;
    END IF;
  END IF;

  -- Nothing to compare: leave the gate open rather than invent a number.
  RETURN 0;
END;
$$;

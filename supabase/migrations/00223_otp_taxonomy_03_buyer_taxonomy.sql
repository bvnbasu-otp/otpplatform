-- 00223_otp_taxonomy_03_buyer_taxonomy.sql
-- TAXONOMY-03: buyer taxonomy leaves, catalog default modes, domestic RO / gym split.
-- Forward-only catalog updates; no historical requirement/PO/snapshot rewrites.

-- ---------------------------------------------------------------------------
-- 1. Default procurement modes (new flows only — catalog row defaults)
-- ---------------------------------------------------------------------------

UPDATE requirement_subcategories
SET default_requirement_mode = 'PROJECT_CONTRACT'::requirement_mode
WHERE code IN (
  'home_interior_exterior_painting',
  'rwa_society_exterior_repainting',
  'commercial_office_painting',
  'borewell_drilling',
  'modular_carpentry_kitchen'
);

-- ---------------------------------------------------------------------------
-- 2. Gym equipment supply + AMC (retain gym_fitness_equipment for historical FKs)
-- ---------------------------------------------------------------------------

INSERT INTO requirement_subcategories (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT
  c.id,
  v.code,
  v.name,
  v.description,
  v.keywords,
  v.mode::requirement_mode,
  v.sort_order
FROM requirement_categories c
CROSS JOIN (VALUES
  (
    'gym_fitness_equipment_supply',
    'Commercial gym equipment (supply)',
    'Treadmills, cross trainers, multi-gym stations, free weights and clubhouse fitness equipment purchase',
    ARRAY['gym equipment supply', 'buy gym equipment', 'fitness equipment purchase', 'commercial treadmill', 'multi gym station', 'dumbbells set', 'clubhouse gym equipment', 'elliptical purchase'],
    'PRODUCT_MATERIAL',
    151
  ),
  (
    'gym_fitness_amc',
    'Gym equipment AMC & servicing',
    'Preventive maintenance, calibration and breakdown support for society or commercial gym equipment',
    ARRAY['gym amc', 'gym equipment amc', 'fitness equipment maintenance', 'gym servicing contract', 'treadmill amc', 'gym breakdown', 'clubhouse gym maintenance'],
    'AMC',
    152
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'property_facility_management'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode,
  sort_order = EXCLUDED.sort_order;

-- Legacy combined leaf: keep ID; UI/parser prefer gym_fitness_equipment_supply / gym_fitness_amc.
UPDATE requirement_subcategories
SET
  name = 'Gym & fitness (legacy — choose supply or AMC)',
  description = 'Historical combined gym leaf. For new requirements prefer Commercial gym equipment (supply) or Gym equipment AMC & servicing.'
WHERE code = 'gym_fitness_equipment';

-- ---------------------------------------------------------------------------
-- 3. Domestic RO under water_environmental (separate from commercial WTP)
-- ---------------------------------------------------------------------------

INSERT INTO requirement_subcategories (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT
  c.id,
  v.code,
  v.name,
  v.description,
  v.keywords,
  v.mode::requirement_mode,
  v.sort_order
FROM requirement_categories c
CROSS JOIN (VALUES
  (
    'domestic_ro_purifier',
    'Domestic RO / home water purifier (product)',
    'Wall-mount or under-sink RO purifiers, filters and cartridges for homes, kitchens and small offices',
    ARRAY['domestic ro', 'home ro', 'kitchen ro', 'water purifier', '10l ro', '10 litre ro', 'ro purifier', 'kent ro', 'aquaguard', 'home water filter', 'residential ro'],
    'PRODUCT_MATERIAL',
    11
  ),
  (
    'domestic_ro_installation',
    'Domestic RO installation & plumbing hook-up',
    'Wall mounting, inlet/outlet plumbing, electrical point and commissioning for home or kitchen RO units',
    ARRAY['ro installation', 'install ro', 'mount water purifier', 'domestic ro install', 'kitchen purifier installation', 'ro plumbing'],
    'PROJECT_CONTRACT',
    12
  ),
  (
    'domestic_ro_amc',
    'Domestic RO service & filter AMC',
    'Filter replacement, membrane service and annual maintenance for home RO purifiers',
    ARRAY['ro amc', 'ro service', 'ro filter change', 'purifier amc', 'domestic ro maintenance', 'ro cartridge replacement'],
    'AMC',
    13
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'water_environmental'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode,
  sort_order = EXCLUDED.sort_order;

-- Commercial / industrial WTP: clarify scope; avoid domestic home RO phrases.
UPDATE requirement_subcategories
SET
  name = 'Commercial / industrial water treatment & large RO plant',
  description = 'Commercial WTP, industrial RO plants, softeners and filtration at LPH scale — not domestic kitchen purifiers.',
  match_keywords = ARRAY['ro plant', 'commercial ro plant', 'industrial ro', 'water treatment plant', 'softener plant', 'wtp', 'filtration plant', 'lph ro plant', 'effluent pretreatment']
WHERE code = 'water_treatment_plant';

-- Paint SKU routing: strengthen product-lane keywords (execution stays on painting subcats).
UPDATE requirement_subcategories
SET match_keywords = match_keywords || ARRAY['litres of paint', 'litre paint', '50 litre paint', 'paint drums', 'exterior emulsion supply', 'paint material supply']::text[]
WHERE code = 'paints_coatings'
  AND NOT (match_keywords @> ARRAY['litres of paint']::text[]);

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cp.id, v.is_primary
FROM (VALUES
  ('gym_fitness_equipment_supply', 'gym_equipment_amc', true),
  ('gym_fitness_amc', 'gym_equipment_amc', true)
) AS v(sub_code, cap_code, is_primary)
JOIN requirement_subcategories s ON s.code = v.sub_code
JOIN capabilities cp ON cp.code = v.cap_code
ON CONFLICT (subcategory_id, capability_id) DO NOTHING;

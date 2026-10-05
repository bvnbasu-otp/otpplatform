-- 00234: primary capabilities for the TAXONOMY-03 domestic RO leaves.
-- 00223 inserted domestic_ro_purifier, domestic_ro_installation and
-- domestic_ro_amc without subcategory_capabilities rows, so discovery had
-- no required capability to match. Commercial water_treatment_plant stays
-- the industrial leaf and is not reused here.

BEGIN;

INSERT INTO capabilities (code, name, description, sort_order)
VALUES
  (
    'domestic_ro_purifier',
    'Domestic RO / home water purifier supply',
    'Wall-mount and under-sink RO purifiers, filters and cartridges for homes and small offices',
    140
  ),
  (
    'domestic_ro_installation',
    'Domestic RO installation and plumbing hook-up',
    'Wall mounting, inlet and outlet plumbing, and commissioning for home or kitchen RO units',
    141
  ),
  (
    'domestic_ro_amc',
    'Domestic RO service and filter AMC',
    'Filter replacement, membrane service and annual maintenance for home RO purifiers',
    142
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true;

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cp.id, true
FROM (VALUES
  ('domestic_ro_purifier', 'domestic_ro_purifier'),
  ('domestic_ro_installation', 'domestic_ro_installation'),
  ('domestic_ro_amc', 'domestic_ro_amc')
) AS v(sub_code, cap_code)
JOIN requirement_subcategories s ON s.code = v.sub_code
JOIN capabilities cp ON cp.code = v.cap_code
ON CONFLICT (subcategory_id, capability_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary;

-- Suppliers who already declare domestic RO on their profile become eligible.
-- Commercial WTP-only profiles are left on water_treatment_plant.
INSERT INTO supplier_capabilities (supplier_id, capability_id, notes)
SELECT s.id, cp.id, 'Declared on the supplier profile'
FROM suppliers s
JOIN capabilities cp ON cp.code = 'domestic_ro_purifier'
WHERE s.capabilities ? 'domestic_ro_purifiers'
   OR s.capabilities ? 'water_purifier_ro'
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

INSERT INTO supplier_capabilities (supplier_id, capability_id, notes)
SELECT s.id, cp.id, 'Declared on the supplier profile'
FROM suppliers s
JOIN capabilities cp ON cp.code = 'domestic_ro_installation'
WHERE s.capabilities ? 'domestic_ro_purifiers'
   OR s.capabilities ? 'water_purifier_ro'
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

INSERT INTO supplier_capabilities (supplier_id, capability_id, notes)
SELECT s.id, cp.id, 'Declared on the supplier profile'
FROM suppliers s
JOIN capabilities cp ON cp.code = 'domestic_ro_amc'
WHERE s.capabilities ? 'water_filter_amc'
   OR (
     (s.capabilities ? 'domestic_ro_purifiers' OR s.capabilities ? 'water_purifier_ro')
     AND s.capabilities ? 'annual_maintenance_contract'
   )
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

COMMIT;

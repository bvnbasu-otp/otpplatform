-- 00059_amenities_sports_pools_vehicle_repair.sql
-- Add Gym & Fitness, Indoor/Outdoor Sports, Swimming Pool Maintenance,
-- Vehicle & Fleet Repair (2/3/4-wheelers), and Bathroom/Sanitary Renovation.

-- ---------------------------------------------------------------------------
-- 1. Subcategories
-- ---------------------------------------------------------------------------

-- Under Property & Facility Management
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
    'gym_fitness_equipment',
    'Gym & Fitness Equipment Supply & AMC',
    'Commercial treadmills, elliptical cross trainers, multi-gym stations, free weights, gym rubber flooring and annual maintenance contracts',
    ARRAY['gym equipment', 'fitness equipment', 'commercial treadmill', 'elliptical', 'gym amc', 'multi gym', 'dumbbells', 'gym maintenance', 'clubhouse gym', 'exercise bike', 'gym flooring'],
    'SERVICE',
    15
  ),
  (
    'indoor_outdoor_sports_games',
    'Sports Courts & Games Equipment',
    'Badminton wooden/synthetic court flooring, table tennis tables, snooker tables, outdoor children play equipment, cricket turf nets and basketball hoops',
    ARRAY['sports equipment', 'badminton court', 'table tennis', 'snooker table', 'pool table', 'cricket nets', 'children play equipment', 'sports flooring', 'basketball hoop', 'clubhouse games', 'outdoor playground'],
    'PRODUCT_MATERIAL',
    16
  ),
  (
    'swimming_pool_maintenance',
    'Swimming Pool Maintenance & Filtration AMC',
    'Society swimming pool cleaning, chlorination, water testing, sand filter servicing, dosing pumps, robotic pool vacuuming and tile re-grouting',
    ARRAY['swimming pool', 'pool maintenance', 'pool cleaning', 'chlorine dosing', 'pool filtration', 'sand filter', 'swimming pool amc', 'pool pump', 'underwater lights', 'pool chemicals'],
    'AMC',
    17
  ),
  (
    'bathroom_sanitary_renovation',
    'Bathroom Renovation & Sanitary Fixture Repairs',
    'Commode/EWC replacement, shower mixer fittings, washbasin vanity counters, leak rectification, concealed valve repairs and bathroom tiling',
    ARRAY['bathroom renovation', 'sanitary fixtures', 'commode replacement', 'ewc', 'shower enclosure', 'cp fittings', 'bathroom plumbing', 'jaguar fittings', 'tap repair', 'drain unblocking', 'bathroom waterproofing'],
    'SERVICE',
    18
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'property_facility_management'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- Under Logistics & Transportation / Services: Vehicle Repairs
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
    'vehicle_repair_fleet_service',
    'Vehicle Repairs & Multi-Brand Fleet Servicing',
    'Periodic servicing, mechanical repairs, denting & painting, tyre & battery replacement for 2-wheelers, 3-wheelers, passenger cars and commercial delivery fleets',
    ARRAY['vehicle repair', 'car service', 'bike service', '2 wheeler repair', '4 wheeler service', 'fleet maintenance', 'auto repair', 'commercial vehicle service', 'battery replacement', 'tyres', 'denting painting'],
    'REPAIR_MAINTENANCE',
    15
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'logistics_transportation'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- ---------------------------------------------------------------------------
-- 2. Capabilities
-- ---------------------------------------------------------------------------

INSERT INTO capabilities (code, name, description, capacity_unit, sort_order)
VALUES
  ('gym_equipment_amc', 'Gym & Fitness Equipment Supply & Maintenance', 'Commercial fitness equipment supply, installation and preventive AMC', 'UNITS', 60),
  ('sports_facility_flooring', 'Sports Facilities & Game Equipment', 'Badminton court flooring, table tennis and outdoor playground installations', 'SQFT', 61),
  ('swimming_pool_amc', 'Swimming Pool Cleaning & Filtration AMC', 'Water chemistry balancing, sand filtration maintenance and pool operation contracts', 'KLD', 62),
  ('bathroom_sanitary_plumbing', 'Bathroom Renovation & Sanitary Fitting Services', 'Plumbing fixtures, CP fittings, shower glass partitions and leak repairs', 'POINTS', 63),
  ('vehicle_fleet_maintenance', 'Multi-Brand Vehicle & Fleet Servicing', 'Mechanical repairs, engine servicing and fleet maintenance contracts', 'VEHICLES', 64)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 3. Subcategory -> Capability Mapping
-- ---------------------------------------------------------------------------

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cp.id, v.is_primary
FROM (VALUES
  ('gym_fitness_equipment', 'gym_equipment_amc', true),
  ('indoor_outdoor_sports_games', 'sports_facility_flooring', true),
  ('swimming_pool_maintenance', 'swimming_pool_amc', true),
  ('bathroom_sanitary_renovation', 'bathroom_sanitary_plumbing', true),
  ('vehicle_repair_fleet_service', 'vehicle_fleet_maintenance', true)
) AS v(sub_code, cap_code, is_primary)
JOIN requirement_subcategories s ON s.code = v.sub_code
JOIN capabilities cp ON cp.code = v.cap_code
ON CONFLICT (subcategory_id, capability_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary;

-- ---------------------------------------------------------------------------
-- 4. Seed Verified Suppliers Across ONDC, BNI & Direct Networks
-- ---------------------------------------------------------------------------

INSERT INTO suppliers (
  id, business_name, source, status, address, city, pincode, contact_phone, contact_email,
  categories, capabilities, rating_avg, completed_jobs, on_time_percent, is_demo, verification_status
) VALUES
(
  '0d500000-0000-4000-8000-000000000091',
  'ProFit Commercial Gym & Fitness Solutions',
  'ONDC',
  'ACTIVE',
  jsonb_build_object('full', '88, 80ft Road, Koramangala 6th Block, Bangalore, Karnataka 560095', 'city', 'Bangalore'),
  'Bangalore',
  '560095',
  '+91 98450 77889',
  'support@profit-gymsolutions.test',
  ARRAY['property_facility_management'],
  '{"gym_equipment_amc": true, "sports_facility_flooring": true}'::jsonb,
  4.85,
  112,
  98.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000092',
  'AquaBlue Swimming Pool & Water Treatment AMC',
  'BNI',
  'ACTIVE',
  jsonb_build_object('full', '12, Sarjapur Main Road, Bellandur, Bangalore, Karnataka 560103', 'city', 'Bangalore'),
  'Bangalore',
  '560103',
  '+91 98450 88990',
  'contracts@aquablue-pools.test',
  ARRAY['property_facility_management', 'water_environmental'],
  '{"swimming_pool_amc": true, "stp_wtp_operations": true}'::jsonb,
  4.90,
  180,
  99.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000093',
  'SpeedFix Multi-Brand Auto & Fleet Care',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '45, Hosur Main Road, Electronic City, Bangalore, Karnataka 560100', 'city', 'Bangalore'),
  'Bangalore',
  '560100',
  '+91 98450 99001',
  'fleet@speedfix-autocare.test',
  ARRAY['logistics_transportation'],
  '{"vehicle_fleet_maintenance": true}'::jsonb,
  4.70,
  245,
  97.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000094',
  'MasterCraft Plumbing & Bathroom Fixers',
  'ASSOCIATION',
  'ACTIVE',
  jsonb_build_object('full', '67, CMH Road, Indiranagar, Bangalore, Karnataka 560038', 'city', 'Bangalore'),
  'Bangalore',
  '560038',
  '+91 98450 11002',
  'service@mastercraft-plumbing.test',
  ARRAY['property_facility_management', 'construction_infrastructure'],
  '{"bathroom_sanitary_plumbing": true, "plumbing_maintenance": true}'::jsonb,
  4.80,
  310,
  98.5,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000095',
  'GreenSpire Landscaping & Horticulture Services',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '34, Whitefield Main Road, Bangalore, Karnataka 560066', 'city', 'Bangalore'),
  'Bangalore',
  '560066',
  '+91 98450 22003',
  'care@greenspire-landscaping.test',
  ARRAY['property_facility_management'],
  '{"gardening_landscape": true, "organic_waste_composting": true}'::jsonb,
  4.75,
  140,
  96.5,
  true,
  'PLATFORM_VERIFIED'
)
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  source = EXCLUDED.source,
  categories = EXCLUDED.categories,
  capabilities = EXCLUDED.capabilities,
  rating_avg = EXCLUDED.rating_avg;

-- Supplier Capability Links
INSERT INTO supplier_capabilities (
  supplier_id, capability_id, max_capacity_value
)
SELECT v.supplier_id::uuid, c.id, v.declared_capacity
FROM (VALUES
  ('0d500000-0000-4000-8000-000000000091', 'gym_equipment_amc', 100),
  ('0d500000-0000-4000-8000-000000000091', 'sports_facility_flooring', 50000),
  ('0d500000-0000-4000-8000-000000000092', 'swimming_pool_amc', 500),
  ('0d500000-0000-4000-8000-000000000093', 'vehicle_fleet_maintenance', 500),
  ('0d500000-0000-4000-8000-000000000094', 'bathroom_sanitary_plumbing', 200)
) AS v(supplier_id, cap_code, declared_capacity)
JOIN capabilities c ON c.code = v.cap_code
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

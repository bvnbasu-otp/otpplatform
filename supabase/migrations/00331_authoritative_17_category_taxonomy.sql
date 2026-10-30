-- 00331_authoritative_17_category_taxonomy.sql
-- Master Taxonomy Alignment: 17 Canonical Categories, Everyday Purchases & Procurement Capability
--
-- Implements the 17 approved top-level categories, unbundles Plumbing & Sanitary
-- and HVAC & Refrigeration into distinct first-class verticals, integrates furniture
-- under Property & Facility Management, and enriches everyday product/service subcategories.
--
-- Forward-compatible and idempotent: preserves all existing category & subcategory UUIDs,
-- avoids foreign key breaks on historical transactions, and updates discovery linkages.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Approved 17 Top-Level Categories
-- ---------------------------------------------------------------------------

INSERT INTO requirement_categories (code, name, icon, description, examples, sort_order, is_active) VALUES
  ('construction_infrastructure', 'Construction & Civil Infrastructure', 'building',
   'Civil work, building materials, renovation and structural infrastructure',
   'Cement, steel, tiles, bricks, aggregates, RCC work, building renovation, waterproofing', 1, true),
  ('plumbing_sanitary', 'Plumbing & Sanitary', 'wrench',
   'Pipes, fittings, valves, taps, pumps, sanitaryware and plumbing contracting',
   'Pipes, CPVC/GI fittings, bathroom taps, sanitaryware, water tanks, plumbing installation & repairs', 2, true),
  ('electrical_power', 'Electrical & Power', 'zap',
   'Electrical materials, lighting, fans, power equipment, wiring and energy systems',
   'LED lights, ceiling fans, switches, cables, panels, DG sets, transformers, electrical contracting', 3, true),
  ('hvac_refrigeration', 'HVAC & Refrigeration', 'wind',
   'Air conditioning, commercial HVAC systems, chillers, ventilation and cooling',
   'Split AC, commercial AC, chillers, ducting, exhaust fans, refrigeration units, AC installation & AMC', 4, true),
  ('machinery_engineering', 'Machinery & Engineering', 'cog',
   'Industrial machines, spares, machining job work and mechanical engineering',
   'CNC machining, motors, pumps, compressors, gearbox repair, machine spares, automation', 5, true),
  ('industrial_supplies_hardware', 'Industrial Supplies & Hardware', 'tool',
   'Fasteners, hand/power tools, bearings, consumables and general industrial hardware',
   'Bolts, bearings, power tools, cutting tools, welding rods, lubricants, abrasives, hardware', 6, true),
  ('chemicals_process_materials', 'Chemicals & Process Materials', 'flask',
   'Industrial chemicals, paints, solvents, adhesives, resins and process consumables',
   'Caustic soda, industrial paints, solvents, adhesives, water treatment chemicals, cleaning chemicals', 7, true),
  ('textile_apparel', 'Textile & Apparel', 'shirt',
   'Yarn, fabrics, uniforms, workwear, garments and textile manufacturing services',
   'Cotton yarn, knitted fabric, uniforms, bed linen, dyeing, printing, garment stitching', 8, true),
  ('agriculture_commodities', 'Agriculture & Commodities', 'sprout',
   'Agricultural produce, food commodities, bulk grains, edible oils and farm inputs',
   'Turmeric, grains, pulses, edible oils, spices, seeds, fertilisers, animal feed', 9, true),
  ('packaging_printing', 'Packaging & Printing', 'package',
   'Packaging materials, corrugated cartons, flexible packaging and commercial printing',
   'Corrugated boxes, labels, flexible pouches, films, paper products, cartons, printing services', 10, true),
  ('property_facility_management', 'Property & Facility Management', 'home',
   'Facility operations, housekeeping, building maintenance, landscaping and office furniture',
   'Housekeeping, pest control, lift AMC, gardening, security operations, office & living furniture', 11, true),
  ('safety_security', 'Safety & Security', 'shield',
   'Safety gear, fire protection systems, CCTV, access control and security services',
   'CCTV cameras, fire extinguishers, fire hydrant AMC, PPE gear, access control, safety signage', 12, true),
  ('water_environmental', 'Water & Environmental Solutions', 'droplet',
   'Water purification, RO systems, STP/ETP plants, testing and waste management',
   'Water purifiers, RO plants, STP, ETP, water testing, wastewater and solid waste solutions', 13, true),
  ('it_electronics_digital', 'IT, Electronics & Digital Systems', 'monitor',
   'Computers, networking, software, cloud services, electronics and digital IT support',
   'Laptops, networking routers/switches, software licences, cloud hosting, printers, IT AMC', 14, true),
  ('logistics_transportation', 'Logistics & Transportation', 'truck',
   'Freight, local delivery, warehousing, fleet hire and supply chain transport',
   'Local transport, freight transport, warehousing, packers & movers, fleet services', 15, true),
  ('professional_skilled_services', 'Professional & Skilled Services', 'briefcase',
   'Skilled technicians, consultants, engineering design and professional practices',
   'Electricians, plumbers, architectural design, structural audit, accounting, consulting', 16, true),
  ('general_other', 'General / Miscellaneous / Other', 'grid',
   'Anything that does not fit the specific categories above',
   'Custom, one-off or miscellaneous requirements and specialised supplies', 17, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  examples = EXCLUDED.examples,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- Ensure legacy 'furniture_fixtures' category is mapped to property_facility_management and de-listed
DO $$
DECLARE
  v_fm_cat_id uuid;
BEGIN
  SELECT id INTO v_fm_cat_id FROM requirement_categories WHERE code = 'property_facility_management';
  IF v_fm_cat_id IS NOT NULL THEN
    UPDATE requirement_subcategories
    SET category_id = v_fm_cat_id
    WHERE category_id IN (SELECT id FROM requirement_categories WHERE code = 'furniture_fixtures');
    
    UPDATE requirement_categories
    SET is_active = false
    WHERE code = 'furniture_fixtures';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Capabilities Vocabulary (Idempotent Additions)
-- ---------------------------------------------------------------------------

INSERT INTO capabilities (code, name, capacity_unit, sort_order) VALUES
  ('plumbing_supply', 'Plumbing and pipe supplies', NULL, 18),
  ('valve_tap_supply', 'Valves, taps and bathroom fittings supply', NULL, 19),
  ('water_tank_supply', 'Water tanks and storage supply', 'L', 20),
  ('fan_lighting_supply', 'Fans, ventilation and lighting fixtures supply', NULL, 28),
  ('switch_socket_supply', 'Electrical switches and sockets supply', NULL, 29),
  ('hvac_supply', 'Air conditioners and HVAC equipment supply', 'TR', 35),
  ('hvac_installation', 'AC and HVAC installation contracting', 'TR', 36),
  ('hvac_maintenance', 'AC and HVAC servicing, repairs and AMC', 'TR', 37),
  ('chiller_service', 'Industrial chiller and cooling tower service', 'TR', 38),
  ('furniture_supply', 'Office and residential furniture supply', 'PCS', 118)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Category Subcategories
-- ---------------------------------------------------------------------------

-- 3.1 Plumbing & Sanitary (Category 02)
INSERT INTO requirement_subcategories
  (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.description, v.keywords, v.mode::requirement_mode, v.sort
FROM requirement_categories c
CROSS JOIN (VALUES
  ('pipes_fittings', 'Pipes & Fittings',
   'Commercial and domestic plumbing pipes, couplers, elbows, tees and pipe joint fittings',
   ARRAY['pipe','pipes','pipe fitting','elbow','tee','reducer','flange','union','coupling','plumbing pipes'],
   'PRODUCT_MATERIAL', 1),
  ('pvc_cpvc_gi_pipes', 'PVC / CPVC / UPVC / HDPE / GI',
   'Rigid PVC, chlorinated CPVC, UPVC, high density HDPE and galvanized iron GI piping systems',
   ARRAY['pvc','cpvc','upvc','hdpe','gi pipe','cpvc pipe','upvc pipe','hdpe pipe','astral','ashirvad','supreme'],
   'PRODUCT_MATERIAL', 2),
  ('valves_taps', 'Valves & Taps',
   'Bathroom taps, faucets, bib cocks, angle valves, ball valves, butterfly valves and control taps',
   ARRAY['tap','taps','bathroom tap','kitchen tap','faucet','bib cock','pillar cock','angle valve','ball valve','gate valve','check valve','faucets','mixer tap'],
   'PRODUCT_MATERIAL', 3),
  ('plumbing_pumps_motors', 'Pumps & Motors',
   'Water lifting pumps, booster pumps, monoblock pumps, pressure pumps and water motors',
   ARRAY['water pump','booster pump','monoblock pump','pressure pump','centrifugal pump','hydro pneumatic pump','water motor','domestic pump'],
   'PRODUCT_MATERIAL', 4),
  ('water_tanks_storage', 'Water Tanks & Storage',
   'Overhead water storage tanks, loft tanks, underground sumps and plastic water storage',
   ARRAY['water tank','sintex tank','overhead tank','storage tank','loft tank','1000 litre tank','500 litre tank','sump tank','water storage'],
   'PRODUCT_MATERIAL', 5),
  ('sanitaryware_fixtures', 'Sanitaryware',
   'Wash basins, wall-hung basins, water closets, commodes, urinals and ceramic sanitaryware',
   ARRAY['sanitaryware','wash basin','washbasin','water closet','commode','western toilet','indian toilet','urinal','pedestal basin','table top basin','hindware','cera','jaquar'],
   'PRODUCT_MATERIAL', 6),
  ('bathroom_fittings', 'Bathroom Fittings',
   'Overhead showers, health faucets, diverters, towel rods, soap holders and floor drains',
   ARRAY['bathroom fittings','shower','health faucet','towel rod','soap dispenser','floor drain','drain cover','bottle trap','diverter','bathroom accessories'],
   'PRODUCT_MATERIAL', 7),
  ('drainage_sewage', 'Drainage & Sewage',
   'Underground sewer lines, soil waste pipes, drainage chambers and manhole covers',
   ARRAY['drainage','sewage','drain pipe','swr pipe','manhole cover','sewer line','drainage chamber','drainage blockage','septic connection'],
   'SERVICE', 8),
  ('plumbing_installation', 'Plumbing Installation',
   'Turnkey bathroom plumbing, new pipeline installation, sanitaryware mounting and tank setup',
   ARRAY['plumbing installation','new plumbing','bathroom plumbing work','pipe laying','sanitaryware installation','tank fitting work','pipeline installation'],
   'PROJECT_CONTRACT', 9),
  ('plumbing_repairs', 'Plumbing Repairs',
   'Onsite plumber visits, tap leakage fixes, pipe burst repair, flush tank repairs and choke clearance',
   ARRAY['plumbing repair','plumber repair','tap leak','pipe leak','leakage repair','flush tank repair','choke clearance','plumber visit','emergency plumbing','plumber'],
   'SERVICE', 10),
  ('commercial_industrial_plumbing', 'Commercial & Industrial Plumbing',
   'Industrial utility piping, fire hydrant plumbing, chilled water circulation and boiler pipelines',
   ARRAY['commercial plumbing','industrial piping','fire hydrant line','chilled water piping','boiler piping','compressed air piping','industrial plumbing'],
   'PROJECT_CONTRACT', 11)
) AS v(code, name, description, keywords, mode, sort)
WHERE c.code = 'plumbing_sanitary'
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode,
  sort_order = EXCLUDED.sort_order;

-- 3.2 HVAC & Refrigeration (Category 04)
INSERT INTO requirement_subcategories
  (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.description, v.keywords, v.mode::requirement_mode, v.sort
FROM requirement_categories c
CROSS JOIN (VALUES
  ('air_conditioners', 'Air Conditioners',
   'Split AC, inverter AC, window air conditioners, cassette AC units and 5-star cooling units',
   ARRAY['air conditioner','ac','split ac','inverter ac','window ac','1.5 ton ac','1 ton ac','2 ton ac','cassette ac','daikin ac','voltas ac','blue star ac','hitachi ac'],
   'PRODUCT_MATERIAL', 1),
  ('commercial_ac_systems', 'Commercial AC Systems',
   'Central AC systems, VRV/VRF systems, packaged air conditioners, AHUs and commercial HVAC units',
   ARRAY['commercial ac','central ac','vrv','vrf','ducted ac','packaged ac','ahu','air handling unit','fcu','hvac plant','vrv system','vrf system'],
   'PROJECT_CONTRACT', 2),
  ('ventilation_systems', 'Ventilation',
   'Commercial basement ventilation, fresh air systems, scrubbers, air washers and industrial ventilation',
   ARRAY['ventilation','fresh air system','forced ventilation','air washer','scrubber','basement ventilation','ventilation system'],
   'PROJECT_CONTRACT', 3),
  ('exhaust_fans_blowers', 'Exhaust Fans',
   'Domestic kitchen exhaust fans, industrial blowers, axial flow fans, smoke spill fans and blowers',
   ARRAY['exhaust fan','ventilation fan','industrial blower','axial fan','centrifugal blower','kitchen exhaust','smoke exhaust','heavy duty exhaust fan'],
   'PRODUCT_MATERIAL', 4),
  ('industrial_chillers', 'Chillers',
   'Water-cooled chillers, air-cooled scroll/screw chillers, cooling towers and industrial refrigeration plants',
   ARRAY['chiller','water cooled chiller','air cooled chiller','scroll chiller','screw chiller','cooling tower','chiller plant','chiller unit'],
   'PROJECT_CONTRACT', 5),
  ('refrigeration_equipment', 'Refrigeration Equipment',
   'Cold storage units, deep freezers, blast freezers, walk-in coolers, condensers and compressors',
   ARRAY['refrigeration','cold storage','deep freezer','blast freezer','walk in cooler','refrigerant','compressor unit','commercial fridge'],
   'PRODUCT_MATERIAL', 6),
  ('hvac_ducting', 'Ducting',
   'GI sheet metal ducting, pre-insulated ducting, spiral ducts, dampers, grilles and acoustic insulation',
   ARRAY['ducting','gi ducting','spiral duct','flexible duct','duct insulation','acoustic insulation','diffusers','grilles','dampers'],
   'PROJECT_CONTRACT', 7),
  ('hvac_components', 'HVAC Components',
   'AC compressors, expansion valves, thermostats, copper piping, cooling coils and HVAC controls',
   ARRAY['hvac spare','ac compressor','thermostat','expansion valve','copper coil','cooling coil','hvac valve','refrigerant gas'],
   'PRODUCT_MATERIAL', 8),
  ('ac_installation', 'AC Installation',
   'New AC installation, split AC wall mounting, outdoor unit brackets, copper piping and gas charging',
   ARRAY['ac installation','split ac installation','ac mounting','copper piping ac','ac commissioning','install ac'],
   'SERVICE', 9),
  ('ac_maintenance_repairs', 'AC Maintenance & Repairs',
   'Periodic AC servicing, deep jet cleaning, refrigerant gas leakage repair, chiller AMC and breakdown repairs',
   ARRAY['ac repair','ac service','ac amc','ac gas filling','ac not cooling','chiller amc','hvac maintenance','ac breakdown','repair ac'],
   'SERVICE', 10)
) AS v(code, name, description, keywords, mode, sort)
WHERE c.code = 'hvac_refrigeration'
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode,
  sort_order = EXCLUDED.sort_order;

-- 3.3 Electrical & Power (Category 03 additions)
INSERT INTO requirement_subcategories
  (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.description, v.keywords, v.mode::requirement_mode, v.sort
FROM requirement_categories c
CROSS JOIN (VALUES
  ('fans_ventilation', 'Fans & Ventilation Products',
   'Ceiling fans, BLDC energy-efficient fans, pedestal fans, wall fans and exhaust fans',
   ARRAY['ceiling fan','fan','table fan','exhaust fan','ventilation fan','wall fan','pedestal fan','bldc fan','orient fan','crompton fan','havells fan','atomberg fan','bedroom fan','fans'],
   'PRODUCT_MATERIAL', 1),
  ('led_lighting_fixtures', 'LED Lights & Lighting Fixtures',
   'LED bulbs, slim panel lights, batten tubes, downlights, surface lights, spotlights and streetlights',
   ARRAY['led light','led bulb','lighting fixture','panel light','downlight','floodlight','street light','tube light','strip light','cove light','spot light','bulb','bulbs','lighting'],
   'PRODUCT_MATERIAL', 2),
  ('switches_sockets', 'Switches & Sockets',
   'Modular switches, electrical sockets, switchboards, dimmers, bell indicators and gang boxes',
   ARRAY['switch','switches','socket','switchboard','modular switch','plug point','bell push','dimmer','fan regulator','anchor switch','legrand switch','schneider switch'],
   'PRODUCT_MATERIAL', 3),
  ('wires_cables', 'Wires & Cables',
   'FR PVC insulated copper wires, flexible multicore cables, armoured cables and submersible cables',
   ARRAY['wire','wires','cable','cables','copper wire','armoured cable','submersible cable','polycab','finolex','rr kabel','havells wire'],
   'PRODUCT_MATERIAL', 4)
) AS v(code, name, description, keywords, mode, sort)
WHERE c.code = 'electrical_power'
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- 3.4 Property & Facility Management (Category 11 Furniture integrations)
INSERT INTO requirement_subcategories
  (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.description, v.keywords, v.mode::requirement_mode, v.sort
FROM requirement_categories c
CROSS JOIN (VALUES
  ('office_furniture_workstations', 'Office Furniture & Workstations',
   'Ergonomic mesh chairs, executive desks, modular workstations, cubicles and conference tables',
   ARRAY['office furniture','office chair','workstation','cubicle','conference table','executive desk','ergonomic chair','mesh chair','meeting table','revolving chair','chair'],
   'PRODUCT_MATERIAL', 11),
  ('home_living_furniture', 'Home & Residential Furniture',
   'Living room sofas, wooden beds, dining tables, wardrobes, study tables and residential furniture',
   ARRAY['home furniture','sofa set','dining table','wooden bed','wardrobe','tv unit','study table','shoe rack','living room furniture','bed'],
   'PRODUCT_MATERIAL', 12),
  ('rwa_clubhouse_furniture', 'RWA Clubhouse & Community Seating',
   'Clubhouse banquet chairs, community meeting tables, outdoor park benches and garden seating',
   ARRAY['clubhouse furniture','rwa furniture','society banquet chairs','outdoor bench','garden bench','pool lounger','community hall seating','park bench'],
   'PRODUCT_MATERIAL', 13),
  ('furniture_repair_polishing', 'Furniture Repair, Re-upholstery & Polishing',
   'Sofa refurbishment, foam/fabric replacement, hydraulic chair repair, wood polishing and restoration',
   ARRAY['furniture repair','sofa repair','chair reupholstery','wood polish','pu polish','hydraulic chair repair','cushion change','sofa repair'],
   'SERVICE', 14)
) AS v(code, name, description, keywords, mode, sort)
WHERE c.code = 'property_facility_management'
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- 3.5 Water & Environmental Solutions (Category 13 Purifier update)
INSERT INTO requirement_subcategories
  (category_id, code, name, description, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.description, v.keywords, v.mode::requirement_mode, v.sort
FROM requirement_categories c
CROSS JOIN (VALUES
  ('water_purifiers', 'Water Purifiers',
   'Domestic RO, UV, UF under-sink and wall-mounted drinking water purifiers and filters',
   ARRAY['water purifier','ro purifier','domestic ro','uv purifier','home water filter','kitchen ro','aquaguard','kent ro','alkaline water filter','water filter'],
   'PRODUCT_MATERIAL', 1),
  ('ro_water_systems', 'RO Systems',
   'Commercial and industrial RO purification systems, multi-stage filtration and DM plants',
   ARRAY['ro system','commercial ro','industrial ro','ro plant','membrane','demineralised water','dm plant','commercial water purifier'],
   'PROJECT_CONTRACT', 2)
) AS v(code, name, description, keywords, mode, sort)
WHERE c.code = 'water_environmental'
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- ---------------------------------------------------------------------------
-- 4. Subcategory -> Capability Links for Discovery & Invitation
-- ---------------------------------------------------------------------------

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cap.id, v.is_primary
FROM (VALUES
  ('pipes_fittings', 'pipe_supply', true),
  ('pvc_cpvc_gi_pipes', 'pipe_supply', true),
  ('valves_taps', 'sanitary_fitting', true),
  ('valves_taps', 'valve_tap_supply', true),
  ('plumbing_pumps_motors', 'pump_installation', true),
  ('water_tanks_storage', 'water_tank_supply', true),
  ('sanitaryware_fixtures', 'sanitary_fitting', true),
  ('bathroom_fittings', 'sanitary_fitting', true),
  ('plumbing_installation', 'plumbing_service', true),
  ('plumbing_repairs', 'plumbing_service', true),
  ('plumbing_repairs', 'plumber_service', true),
  ('commercial_industrial_plumbing', 'plumbing_service', true),
  ('air_conditioners', 'hvac_supply', true),
  ('commercial_ac_systems', 'hvac_supply', true),
  ('commercial_ac_systems', 'hvac_installation', true),
  ('ventilation_systems', 'hvac_installation', true),
  ('exhaust_fans_blowers', 'hvac_supply', true),
  ('industrial_chillers', 'chiller_service', true),
  ('refrigeration_equipment', 'hvac_supply', true),
  ('hvac_ducting', 'hvac_installation', true),
  ('hvac_components', 'hvac_supply', true),
  ('ac_installation', 'hvac_installation', true),
  ('ac_maintenance_repairs', 'hvac_maintenance', true),
  ('fans_ventilation', 'fan_lighting_supply', true),
  ('fans_ventilation', 'lighting_supply', false),
  ('led_lighting_fixtures', 'lighting_supply', true),
  ('switches_sockets', 'switch_socket_supply', true),
  ('wires_cables', 'cable_supply', true),
  ('office_furniture_workstations', 'furniture_supply', true),
  ('home_living_furniture', 'furniture_supply', true),
  ('rwa_clubhouse_furniture', 'furniture_supply', true),
  ('furniture_repair_polishing', 'furniture_supply', true),
  ('drainage_sewage', 'plumbing_service', true),
  ('water_purifiers', 'water_treatment_plant', true),
  ('ro_water_systems', 'water_treatment_plant', true)
) AS v(sub_code, cap_code, is_primary)
JOIN requirement_subcategories s ON s.code = v.sub_code
JOIN capabilities cap ON cap.code = v.cap_code
ON CONFLICT (subcategory_id, capability_id) DO NOTHING;

COMMIT;

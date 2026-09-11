-- 00058_furniture_and_painting_taxonomy_and_suppliers.sql
-- Add Furniture, Fixtures & Interiors category, Home/Office/RWA Painting subcategories,
-- dynamic attribute schemas, capability mappings, and seeded verified Indian suppliers.

-- ---------------------------------------------------------------------------
-- 1. Add Furniture & Fixtures Category
-- ---------------------------------------------------------------------------

INSERT INTO requirement_categories (code, name, icon, description, examples, sort_order)
VALUES (
  'furniture_fixtures',
  'Furniture, Fixtures & Interiors',
  'armchair',
  'Home & office furniture, modular workstations, RWA clubhouse, carpentry & interior fixtures',
  'Office chairs, modular workstations, conference tables, clubhouse sofas, dining sets, wardrobes',
  16
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  examples = EXCLUDED.examples;

-- ---------------------------------------------------------------------------
-- 2. Add / Update Subcategories for Furniture & Painting
-- ---------------------------------------------------------------------------

-- Furniture subcategories under 'furniture_fixtures'
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
    'office_furniture_workstations',
    'Office Furniture & Modular Workstations',
    'Office cubicles, modular desks, executive seating, conference tables and ergonomic chairs',
    ARRAY['office furniture', 'office chair', 'workstation', 'cubicle', 'conference table', 'executive desk', 'ergonomic chair', 'office storage', 'mesh chair', 'pedestal', 'meeting table'],
    'PRODUCT_MATERIAL',
    1
  ),
  (
    'home_living_furniture',
    'Home & Residential Furniture',
    'Living room sofas, dining tables, wooden beds, wardrobes, study desks and TV units',
    ARRAY['home furniture', 'sofa set', 'dining table', 'bed', 'wardrobe', 'tv unit', 'study table', 'shoe rack', 'recliner', 'living room', 'sheesham furniture', 'teak wood sofa'],
    'PRODUCT_MATERIAL',
    2
  ),
  (
    'rwa_clubhouse_furniture',
    'RWA Clubhouse & Community Seating',
    'Clubhouse banquet chairs, society meeting tables, party hall seating, outdoor garden benches and pool loungers',
    ARRAY['clubhouse furniture', 'rwa furniture', 'society banquet chairs', 'outdoor bench', 'garden bench', 'pool lounger', 'party hall chairs', 'recreation room table', 'community hall seating'],
    'PRODUCT_MATERIAL',
    3
  ),
  (
    'modular_carpentry_kitchen',
    'Modular Kitchen, Wardrobes & Custom Carpentry',
    'Custom modular kitchen cabinets, acrylic shutters, fitted wardrobes, lofts and custom interior woodwork',
    ARRAY['modular kitchen', 'acrylic kitchen', 'plywood wardrobe', 'custom carpentry', 'interior woodwork', 'crockery unit', 'lofts', 'wall panelling', 'kitchen cabinets', 'interior fitouts'],
    'SERVICE',
    4
  ),
  (
    'institutional_school_furniture',
    'Institutional, Hospital & School Furniture',
    'School student desks, dual benches, library book stacks, hospital patient beds, auditorium seating and canteen tables',
    ARRAY['school furniture', 'school desk', 'dual desk', 'hospital bed', 'library racks', 'auditorium chairs', 'canteen tables', 'college benches', 'institutional seating'],
    'PRODUCT_MATERIAL',
    5
  ),
  (
    'furniture_repair_polishing',
    'Furniture Repair, Re-upholstery & Polishing',
    'Sofa refurbishment, foam & fabric replacement, chair hydraulic repair, wood polishing and antique restoration',
    ARRAY['furniture repair', 'sofa repair', 'chair reupholstery', 'wood polish', 'pu polish', 'sofa fabric change', 'hydraulic chair repair', 'cushion change', 'furniture restoration'],
    'SERVICE',
    6
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'furniture_fixtures'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- Painting subcategories under 'property_facility_management' & 'construction_infrastructure'
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
    'home_interior_exterior_painting',
    'Home & Apartment Interior/Exterior Painting',
    'Residential flat painting, wall putty, primer, premium plastic emulsion, texture accent walls and waterproofing coats',
    ARRAY['home painting', 'house painting', 'flat painting', 'interior painting', 'wall putty', 'asian paints', 'royale luxury', 'texture painting', 'room painting', 'exterior wall painting', 'primer putty 2 coats'],
    'SERVICE',
    11
  ),
  (
    'commercial_office_painting',
    'Commercial Office & Facility Painting',
    'Corporate office wall repainting, washable acrylic emulsion, epoxy floor coating, false ceiling painting and corporate branding colors',
    ARRAY['office painting', 'commercial painting', 'corporate painting', 'epoxy flooring', 'washable paint', 'office repainting', 'false ceiling paint', 'commercial wall coating'],
    'SERVICE',
    12
  ),
  (
    'rwa_society_exterior_repainting',
    'RWA & Society Exterior Repainting & Waterproofing',
    'High-rise residential apartment block exterior painting, scaffolding, crack filling, weather-guard silicone coating and exterior waterproofing',
    ARRAY['society painting', 'apartment painting', 'exterior repainting', 'apex ultima', 'weatherproof paint', 'building repainting', 'scaffolding painting', 'society exterior', 'rwa painting', 'crack filling waterproofing'],
    'SERVICE',
    13
  ),
  (
    'wood_metal_polish_painting',
    'Wood Polishing, PU Coating & Metal Grille Painting',
    'Main door melamine/PU wood polishing, teak wood finish, window safety grille enamel painting and gate repainting',
    ARRAY['wood polishing', 'door polish', 'pu polish', 'melamine polish', 'grille painting', 'gate painting', 'enamel paint', 'metal painting', 'french polish', 'teak wood polish'],
    'SERVICE',
    14
  )
) AS v(code, name, description, keywords, mode, sort_order)
WHERE c.code = 'property_facility_management'
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  match_keywords = EXCLUDED.match_keywords,
  default_requirement_mode = EXCLUDED.default_requirement_mode;

-- ---------------------------------------------------------------------------
-- 3. Capability Vocabulary for Furniture & Painting
-- ---------------------------------------------------------------------------

INSERT INTO capabilities (code, name, description, capacity_unit, sort_order)
VALUES
  ('modular_office_furniture', 'Modular Office Furniture & Seating', 'Manufacturing and supply of office workstations, desks and ergonomic chairs', 'PCS', 50),
  ('home_furniture_supply', 'Home & Living Furniture Supply', 'Manufacturing and retail supply of sofas, dining sets, wooden beds and wardrobes', 'PCS', 51),
  ('clubhouse_furniture_supply', 'RWA Clubhouse & Outdoor Community Furniture', 'Supply of banquet chairs, community hall tables and garden benches for housing societies', 'PCS', 52),
  ('custom_modular_carpentry', 'Custom Modular Kitchen & Wardrobe Carpentry', 'Bespoke interior woodworking, acrylic kitchen cabinets and fitted wardrobes', 'SQFT', 53),
  ('furniture_repair_service', 'Furniture Repair & Upholstery Refurbishment', 'On-site sofa re-upholstery, hydraulic chair servicing and wood restoration', 'PCS', 54),
  ('home_painting_service', 'Residential Interior & Exterior Painting', 'House and flat painting with surface putty, primer and premium emulsion', 'SQFT', 55),
  ('commercial_painting_service', 'Commercial & Corporate Office Painting', 'Commercial space repainting, epoxy coating and low-VOC acrylic application', 'SQFT', 56),
  ('rwa_exterior_society_painting', 'RWA Society & High-Rise Exterior Repainting', 'Comprehensive apartment exterior repainting with scaffolding, crack filling & weather-proof protection', 'SQFT', 57),
  ('wood_pu_metal_polishing', 'Wood PU/Melamine Polishing & Metal Grille Painting', 'Teak wood polishing, PU finishing and anti-rust metal grille enamel painting', 'SQFT', 58)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  capacity_unit = EXCLUDED.capacity_unit;

-- ---------------------------------------------------------------------------
-- 4. Subcategory -> Capability Links
-- ---------------------------------------------------------------------------

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cp.id, v.is_primary
FROM (VALUES
  ('office_furniture_workstations', 'modular_office_furniture', true),
  ('office_furniture_workstations', 'home_furniture_supply', false),
  ('home_living_furniture', 'home_furniture_supply', true),
  ('home_living_furniture', 'custom_modular_carpentry', false),
  ('rwa_clubhouse_furniture', 'clubhouse_furniture_supply', true),
  ('rwa_clubhouse_furniture', 'modular_office_furniture', false),
  ('modular_carpentry_kitchen', 'custom_modular_carpentry', true),
  ('modular_carpentry_kitchen', 'home_furniture_supply', false),
  ('institutional_school_furniture', 'modular_office_furniture', true),
  ('institutional_school_furniture', 'clubhouse_furniture_supply', false),
  ('furniture_repair_polishing', 'furniture_repair_service', true),
  ('furniture_repair_polishing', 'wood_pu_metal_polishing', false),
  ('home_interior_exterior_painting', 'home_painting_service', true),
  ('home_interior_exterior_painting', 'wood_pu_metal_polishing', false),
  ('commercial_office_painting', 'commercial_painting_service', true),
  ('commercial_office_painting', 'home_painting_service', false),
  ('rwa_society_exterior_repainting', 'rwa_exterior_society_painting', true),
  ('rwa_society_exterior_repainting', 'home_painting_service', false),
  ('wood_metal_polish_painting', 'wood_pu_metal_polishing', true),
  ('wood_metal_polish_painting', 'home_painting_service', false)
) AS v(sub_code, cap_code, is_primary)
JOIN requirement_subcategories s ON s.code = v.sub_code
JOIN capabilities cp ON cp.code = v.cap_code
ON CONFLICT (subcategory_id, capability_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary;

-- ---------------------------------------------------------------------------
-- 5. Dynamic Attributes for Furniture & Painting
-- ---------------------------------------------------------------------------

INSERT INTO category_attribute_definitions (
  category_id, subcategory_id, code, label, data_type, unit, is_required, options, help_text, placeholder, sort_order
)
SELECT
  c.id,
  NULL,
  v.code,
  v.label,
  v.data_type::attribute_data_type,
  v.unit,
  v.is_required,
  v.options::jsonb,
  v.help_text,
  v.placeholder,
  v.sort_order
FROM requirement_categories c
CROSS JOIN (VALUES
  (
    'furniture_item_type',
    'Furniture Type / Configuration',
    'ENUM',
    NULL,
    true,
    '["Modular Workstations (Linear/L-Shape)", "Ergonomic Mesh Office Chairs", "Executive Table & Chair Set", "Conference / Meeting Table", "L-Shape / 3-Seater Sofa Set", "Solid Wood Dining Table (4/6-Seater)", "King / Queen Size Bed with Storage", "Fitted 3/4-Door Wardrobe", "RWA Society Banquet Chairs (Stackable)", "Outdoor Weatherproof Garden Benches", "Modular Kitchen Storage Cabinets", "Custom Bookshelf / Storage Units"]',
    'Select the specific primary furniture configuration needed',
    'Select furniture type',
    1
  ),
  (
    'furniture_material_core',
    'Core Material & Construction',
    'ENUM',
    NULL,
    false,
    '["Solid Teak / Sheesham Wood", "BWP Marine Plywood (IS:710)", "Commercial MR Plywood (IS:303)", "High-Density MDF / Engineered Wood", "CRCA Heavy Duty Steel Frame", "Virgin Polypropylene / Heavy Duty Plastic"]',
    'Wood or structural grade specified for longevity',
    'Select core material',
    2
  ),
  (
    'furniture_surface_finish',
    'Surface Finish & Upholstery',
    'ENUM',
    NULL,
    false,
    '["1mm High Gloss Laminate (Merino/Century)", "1mm Suede / Matte Laminate", "Natural Wood Veneer with PU Polish", "Melamine Wood Polish (Natural Grain)", "Breathable Mesh + High Density Foam", "Premium Leatherette Upholstery", "Commercial Grade Powder Coating (Epoxy)"]',
    'Aesthetic and protective surface finish',
    'Select surface finish',
    3
  ),
  (
    'seating_or_unit_count',
    'Total Units / Seating Quantity',
    'NUMBER',
    'Units/Seats',
    true,
    '[]',
    'Total number of workstations, chairs, tables, or wardrobe units',
    'e.g. 12, 50, 100',
    4
  ),
  (
    'delivery_assembly_scope',
    'Delivery & Assembly Scope',
    'ENUM',
    NULL,
    false,
    '["Supply, Delivery & Full On-site Assembly Included", "Supply & Delivery Only (Buyer will assemble)", "Custom On-site Fabrication / Carpentry"]',
    'Specify whether installation technicians are required on-site',
    'Select delivery & assembly scope',
    5
  ),
  (
    'warranty_period_furniture',
    'Warranty Duration',
    'ENUM',
    'Years',
    false,
    '["1 Year Standard Warranty", "2 Years Comprehensive Warranty", "3 Years Commercial Warranty", "5 Years Structural / Termite Warranty"]',
    'Warranty coverage against manufacturing defects & termite',
    'Select warranty',
    6
  )
) AS v(code, label, data_type, unit, is_required, options, help_text, placeholder, sort_order)
WHERE c.code = 'furniture_fixtures'
ON CONFLICT (category_id, code) WHERE category_id IS NOT NULL DO UPDATE SET
  label = EXCLUDED.label,
  options = EXCLUDED.options,
  help_text = EXCLUDED.help_text;

-- Painting attributes for property_facility_management
INSERT INTO category_attribute_definitions (
  category_id, subcategory_id, code, label, data_type, unit, is_required, options, help_text, placeholder, sort_order
)
SELECT
  c.id,
  NULL,
  v.code,
  v.label,
  v.data_type::attribute_data_type,
  v.unit,
  v.is_required,
  v.options::jsonb,
  v.help_text,
  v.placeholder,
  v.sort_order
FROM requirement_categories c
CROSS JOIN (VALUES
  (
    'painting_scope_type',
    'Painting Scope & Location',
    'ENUM',
    NULL,
    true,
    '["Full Home / Flat Interior Painting", "Apartment Society Full Exterior Repainting", "Commercial Office Repainting", "Single Room / Accent Wall Texture", "Exterior Waterproof Wall Coating", "Wood Door Polishing & Metal Grille Enamel"]',
    'Primary scope of painting service',
    'Select painting scope',
    1
  ),
  (
    'paint_brand_tier',
    'Brand & Paint Grade Preference',
    'ENUM',
    NULL,
    false,
    '["Asian Paints Royale / Apex Ultima (Premium Tier)", "Asian Paints Tractor / Apcolite (Standard Tier)", "Berger Silk Glamour / WeatherCoat", "Dulux Velvet Touch / Weathershield", "Nerolac Impressions / Excel Total", "Low-VOC Odourless Eco Paint", "Any Reputed Certified Brand"]',
    'Brand and quality grade for paint materials',
    'Select paint brand & grade',
    2
  ),
  (
    'surface_area_sqft',
    'Estimated Built-up / Surface Area',
    'NUMBER',
    'SQFT',
    true,
    '[]',
    'Approximate wall/ceiling surface area in square feet or apartment SBA (e.g. 1200, 50000)',
    'e.g. 1500, 25000',
    3
  ),
  (
    'surface_prep_layers',
    'Surface Preparation & Number of Coats',
    'ENUM',
    NULL,
    false,
    '["Full Wall Scraping + 2 Coats Acrylic Putty + 1 Coat Primer + 2 Coats Paint", "Minor Touchup Putty + 1 Coat Primer + 2 Coats Paint", "Touchup + 2 Coats Repaint Only", "Waterproofing Base Coat + Crack Fill + 2 Coats Exterior Emulsion"]',
    'Preparation level dictates finish smoothness and longevity',
    'Select surface preparation',
    4
  ),
  (
    'scaffolding_and_material_supply',
    'Material & Equipment Inclusions',
    'ENUM',
    NULL,
    false,
    '["Complete Package: Materials + Labor + Scaffolding / Rope Access Included", "Labor Only (Buyer will supply all paint & putty)", "Labor + Basic Tools (Scaffolding supplied by society)"]',
    'Clear scope of who supplies paint, putty, rollers and high-rise scaffolding',
    'Select inclusion terms',
    5
  ),
  (
    'painting_warranty_commitment',
    'Workmanship & Anti-Fungal Warranty',
    'ENUM',
    'Years',
    false,
    '["1 Year Workmanship Warranty", "3 Years Anti-Peeling Warranty", "5 Years Exterior Weatherproof Warranty", "7 Years Premium Brand Performance Warranty"]',
    'Supplier warranty against paint flaking, peeling and algae growth',
    'Select warranty commitment',
    6
  )
) AS v(code, label, data_type, unit, is_required, options, help_text, placeholder, sort_order)
WHERE c.code = 'property_facility_management'
ON CONFLICT (category_id, code) WHERE category_id IS NOT NULL DO UPDATE SET
  label = EXCLUDED.label,
  options = EXCLUDED.options,
  help_text = EXCLUDED.help_text;

-- ---------------------------------------------------------------------------
-- 6. Seed Verified Indian Suppliers for Furniture & Painting
-- ---------------------------------------------------------------------------

-- Insert Suppliers
INSERT INTO suppliers (
  id, business_name, source, status, address, city, pincode, contact_phone, contact_email,
  categories, capabilities, rating_avg, completed_jobs, on_time_percent, is_demo, verification_status
) VALUES
(
  '0d500000-0000-4000-8000-000000000081',
  'UrbanSpace Modular Workstations & Office Interiors',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', 'Plot 42, HSR Layout Sector 2, Bangalore, Karnataka 560102', 'city', 'Bangalore'),
  'Bangalore',
  '560102',
  '+91 98450 11223',
  'sales@urbanspace-interiors.test',
  ARRAY['furniture_fixtures', 'property_facility_management'],
  '{"modular_office_furniture": true, "custom_modular_carpentry": true}'::jsonb,
  4.85,
  142,
  98.5,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000082',
  'Royal Teak & Home Furnishing Solutions',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '128, 100ft Road, Indiranagar, Bangalore, Karnataka 560038', 'city', 'Bangalore'),
  'Bangalore',
  '560038',
  '+91 98450 22334',
  'info@royalteak-furniture.test',
  ARRAY['furniture_fixtures'],
  '{"home_furniture_supply": true, "custom_modular_carpentry": true}'::jsonb,
  4.75,
  98,
  96.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000083',
  'SocietyComfort RWA & Outdoor Community Seating',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', 'B-14 Industrial Estate, Whitefield, Bangalore, Karnataka 560066', 'city', 'Bangalore'),
  'Bangalore',
  '560066',
  '+91 98450 33445',
  'orders@societycomfort.test',
  ARRAY['furniture_fixtures', 'property_facility_management'],
  '{"clubhouse_furniture_supply": true, "modular_office_furniture": true}'::jsonb,
  4.65,
  76,
  95.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000084',
  'Apex High-Rise Painters & Society Waterproofing',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '78, Outer Ring Road, Bellandur, Bangalore, Karnataka 560103', 'city', 'Bangalore'),
  'Bangalore',
  '560103',
  '+91 98450 44556',
  'contracts@apex-society-painters.test',
  ARRAY['property_facility_management', 'construction_infrastructure'],
  '{"rwa_exterior_society_painting": true, "home_painting_service": true, "commercial_painting_service": true}'::jsonb,
  4.90,
  210,
  99.0,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000085',
  'Colors & Decor Home Painting & Wall Finishers',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '23, Koramangala 4th Block, Bangalore, Karnataka 560034', 'city', 'Bangalore'),
  'Bangalore',
  '560034',
  '+91 98450 55667',
  'enquiry@colorsdecor-painting.test',
  ARRAY['property_facility_management'],
  '{"home_painting_service": true, "wood_pu_metal_polishing": true}'::jsonb,
  4.80,
  165,
  97.5,
  true,
  'PLATFORM_VERIFIED'
),
(
  '0d500000-0000-4000-8000-000000000086',
  'Corporate Paintcraft & Epoxy Systems',
  'DIRECT',
  'ACTIVE',
  jsonb_build_object('full', '55, Electronic City Phase 1, Bangalore, Karnataka 560100', 'city', 'Bangalore'),
  'Bangalore',
  '560100',
  '+91 98450 66778',
  'commercial@paintcraft-epoxy.test',
  ARRAY['property_facility_management', 'construction_infrastructure'],
  '{"commercial_painting_service": true, "wood_pu_metal_polishing": true}'::jsonb,
  4.70,
  89,
  96.5,
  true,
  'PLATFORM_VERIFIED'
)
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  categories = EXCLUDED.categories,
  capabilities = EXCLUDED.capabilities,
  rating_avg = EXCLUDED.rating_avg;

-- Seed Supplier Capability Linking Rows
INSERT INTO supplier_capabilities (
  supplier_id, capability_id, max_capacity_value
)
SELECT v.supplier_id::uuid, c.id, v.declared_capacity
FROM (VALUES
  ('0d500000-0000-4000-8000-000000000081', 'modular_office_furniture', 500),
  ('0d500000-0000-4000-8000-000000000082', 'home_furniture_supply', 300),
  ('0d500000-0000-4000-8000-000000000082', 'custom_modular_carpentry', 150),
  ('0d500000-0000-4000-8000-000000000083', 'clubhouse_furniture_supply', 1000),
  ('0d500000-0000-4000-8000-000000000083', 'furniture_repair_service', 50),
  ('0d500000-0000-4000-8000-000000000084', 'rwa_exterior_society_painting', 500000),
  ('0d500000-0000-4000-8000-000000000084', 'commercial_painting_service', 200000),
  ('0d500000-0000-4000-8000-000000000085', 'home_painting_service', 100000),
  ('0d500000-0000-4000-8000-000000000085', 'wood_pu_metal_polishing', 50000),
  ('0d500000-0000-4000-8000-000000000086', 'commercial_painting_service', 300000),
  ('0d500000-0000-4000-8000-000000000086', 'wood_pu_metal_polishing', 50000)
) AS v(supplier_id, cap_code, declared_capacity)
JOIN capabilities c ON c.code = v.cap_code
ON CONFLICT (supplier_id, capability_id) DO NOTHING;

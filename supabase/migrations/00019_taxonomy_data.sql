-- Taxonomy reference data: 15 categories, their subcategories, the capability
-- vocabulary, the dynamic attribute schemas, the evaluation criteria catalog
-- and the suggested starting weight sets.
--
-- This ships as a migration rather than a seed for two reasons: every
-- environment needs it (it is product data, not sample data), and the backfill
-- in 00020 depends on it existing. Seeds run after all migrations.
--
-- Adding a vertical stays an INSERT. Nothing here is referenced by code:
-- the intake form, the parser and discovery all read these rows.

-- ---------------------------------------------------------------------------
-- 1. Categories
-- ---------------------------------------------------------------------------

INSERT INTO requirement_categories (code, name, icon, description, examples, sort_order) VALUES
  ('construction_infrastructure', 'Construction & Infrastructure', 'building',
   'Civil work, building materials, renovation and structural work',
   'Cement, steel, tiles, RCC work, renovation, waterproofing', 1),
  ('electrical_power', 'Electrical & Power', 'zap',
   'Electrical materials, power equipment, wiring and energy systems',
   'Cables, panels, DG sets, solar, transformers, electrical contracting', 2),
  ('machinery_engineering', 'Machinery & Engineering', 'cog',
   'Machines, spares, machining job work and mechanical services',
   'CNC machining, motor rewinding, gearbox repair, machine spares', 3),
  ('industrial_supplies_hardware', 'Industrial Supplies & Hardware', 'wrench',
   'Fasteners, tools, consumables and general industrial hardware',
   'Bolts, bearings, cutting tools, welding rods, steel, pipes', 4),
  ('chemicals_process_materials', 'Chemicals & Process Materials', 'flask',
   'Industrial chemicals, paints, dyes and process consumables',
   'Caustic soda, dyes, water treatment chemicals, solvents, adhesives', 5),
  ('textile_apparel', 'Textile & Apparel', 'shirt',
   'Yarn, fabric, garments, dyeing and textile job work',
   'Cotton yarn 40s combed, knitted fabric, dyeing, garment stitching', 6),
  ('agriculture_commodities', 'Agriculture & Commodities', 'sprout',
   'Agricultural produce, commodities, inputs and farm equipment',
   'Turmeric, grains, spices, seeds, fertilizer, farm machinery', 7),
  ('packaging_printing', 'Packaging & Printing', 'package',
   'Packaging materials, printing and packaging machinery',
   'Corrugated boxes, labels, flexible pouches, woven sacks, printing', 8),
  ('property_facility_management', 'Property & Facility Management', 'home',
   'Facility services, maintenance contracts and community operations',
   'Housekeeping, lift AMC, pest control, gardening, security manpower', 9),
  ('safety_security', 'Safety & Security', 'shield',
   'Safety equipment, security systems and protective services',
   'CCTV, fire extinguisher AMC, PPE, access control, alarm systems', 10),
  ('water_environmental', 'Water & Environmental Solutions', 'droplet',
   'Water supply, treatment, borewells, pumps and waste management',
   'Borewell drilling, motor rewinding, STP, tank cleaning, RO plant', 11),
  ('it_electronics_digital', 'IT, Electronics & Digital', 'monitor',
   'Computers, networks, software, telecom and digital services',
   'Laptops, switches, software licences, IT AMC, web development', 12),
  ('logistics_transportation', 'Logistics & Transportation', 'truck',
   'Freight, delivery, warehousing and vehicle hire',
   'Local delivery, freight transport, warehousing, packers and movers', 13),
  ('professional_skilled_services', 'Professional & Skilled Services', 'briefcase',
   'Technicians, consultants and professional practices',
   'Electrician, plumber, structural consultant, audit, design, legal', 14),
  ('general_other', 'General / Other', 'grid',
   'Anything that does not fit the categories above',
   'Custom or one-off requirements', 15);

-- ---------------------------------------------------------------------------
-- 2. Capability vocabulary
--
-- capacity_unit marks capabilities where suppliers declare a numeric ceiling
-- and discovery enforces headroom (a 5 HP workshop must not be invited to a
-- 10 HP rewinding job).
-- ---------------------------------------------------------------------------

INSERT INTO capabilities (code, name, capacity_unit, sort_order) VALUES
  -- Construction
  ('civil_construction', 'Civil construction', NULL, 10),
  ('concrete_supply', 'Ready-mix / concrete supply', 'CUM', 11),
  ('aggregate_supply', 'Sand and aggregate supply', 'CUM', 12),
  ('tiling_flooring', 'Tiling and flooring', 'SQFT', 13),
  ('interior_renovation', 'Interior and renovation work', NULL, 14),
  ('structural_fabrication', 'Structural steel fabrication', 'MT', 15),
  ('waterproofing', 'Waterproofing and roofing', 'SQFT', 16),
  ('earthmoving', 'Earthwork and excavation', NULL, 17),
  ('painting_work', 'Painting and surface finishing', 'SQFT', 18),
  ('sanitary_fitting', 'Sanitary and plumbing fitting supply', NULL, 19),
  -- Electrical
  ('electrical_contracting', 'Electrical contracting', NULL, 20),
  ('cable_supply', 'Cable and wire supply', NULL, 21),
  ('panel_manufacturing', 'Control and distribution panel manufacturing', 'A', 22),
  ('dg_supply', 'Diesel generator supply', 'KVA', 23),
  ('dg_maintenance', 'Diesel generator maintenance', 'KVA', 24),
  ('ups_service', 'UPS and inverter supply / service', 'KVA', 25),
  ('solar_installation', 'Solar PV installation', 'KW', 26),
  ('transformer_service', 'Transformer supply and service', 'KVA', 27),
  ('lighting_supply', 'Lighting and fixture supply', NULL, 28),
  ('earthing_installation', 'Earthing and lightning protection', NULL, 29),
  ('electrical_testing', 'Electrical testing and inspection', NULL, 30),
  ('motor_control_automation', 'Motor control and industrial automation', 'KW', 31),
  -- Machinery and engineering
  ('motor_rewinding', 'Motor rewinding', 'HP', 40),
  ('motor_supply', 'Electric motor supply', 'HP', 41),
  ('pump_installation', 'Pump installation and commissioning', 'HP', 42),
  ('machine_spares_supply', 'Machine spares supply', NULL, 43),
  ('cnc_machining', 'CNC machining', 'MM', 44),
  ('vmc_machining', 'VMC / milling machining', 'MM', 45),
  ('turning_machining', 'Turning and lathe work', 'MM', 46),
  ('welding_fabrication', 'Welding and fabrication', NULL, 47),
  ('gearbox_repair', 'Gearbox and transmission repair', 'KW', 48),
  ('bearing_supply', 'Bearing and power transmission supply', NULL, 49),
  ('machine_installation', 'Machine installation and alignment', NULL, 50),
  ('spindle_repair', 'Spindle rebuilding and repair', NULL, 51),
  ('sheet_metal_work', 'Sheet metal work', 'MM', 52),
  ('foundry_casting', 'Foundry and casting', 'KG', 53),
  -- Industrial supplies
  ('fastener_supply', 'Fastener supply', NULL, 60),
  ('tool_supply', 'Hand and power tool supply', NULL, 61),
  ('cutting_tool_supply', 'Cutting tool and insert supply', NULL, 62),
  ('consumables_supply', 'Industrial consumables supply', NULL, 63),
  ('steel_supply', 'Steel and metal supply', 'MT', 64),
  ('pipe_supply', 'Pipe and fitting supply', NULL, 65),
  ('abrasive_supply', 'Abrasive supply', NULL, 66),
  ('lubricant_supply', 'Lubricant and oil supply', 'L', 67),
  ('material_handling_supply', 'Material handling equipment supply', 'KG', 68),
  -- Chemicals
  ('chemical_supply', 'Industrial chemical supply', 'KG', 70),
  ('paint_supply', 'Paint and coating supply', 'L', 71),
  ('dye_supply', 'Dye and pigment supply', 'KG', 72),
  ('water_chemical_supply', 'Water treatment chemical supply', 'KG', 73),
  ('adhesive_supply', 'Adhesive and sealant supply', 'KG', 74),
  ('solvent_supply', 'Solvent supply', 'L', 75),
  ('lab_reagent_supply', 'Laboratory reagent supply', NULL, 76),
  ('industrial_gas_supply', 'Industrial gas supply', NULL, 77),
  ('cleaning_chemical_supply', 'Cleaning chemical supply', 'L', 78),
  -- Textile
  ('cotton_yarn_supply', 'Cotton yarn supply', 'KG', 80),
  ('synthetic_yarn_supply', 'Synthetic and blended yarn supply', 'KG', 81),
  ('woven_fabric_supply', 'Woven fabric supply', 'M', 82),
  ('knitted_fabric_supply', 'Knitted fabric supply', 'KG', 83),
  ('garment_manufacturing', 'Garment manufacturing', 'PCS', 84),
  ('dyeing_processing', 'Dyeing and fabric processing', 'KG', 85),
  ('knitting_job_work', 'Knitting job work', 'KG', 86),
  ('embroidery_printing', 'Embroidery and fabric printing', 'PCS', 87),
  ('textile_machinery_supply', 'Textile machinery supply and service', NULL, 88),
  ('textile_accessory_supply', 'Textile accessory supply', NULL, 89),
  -- Agriculture
  ('turmeric_supply', 'Turmeric supply', 'KG', 90),
  ('grain_supply', 'Grain and pulse supply', 'KG', 91),
  ('spice_supply', 'Spice supply', 'KG', 92),
  ('oilseed_supply', 'Oilseed supply', 'KG', 93),
  ('seed_supply', 'Planting seed supply', 'KG', 94),
  ('fertilizer_supply', 'Fertilizer supply', 'KG', 95),
  ('farm_equipment_supply', 'Farm equipment supply', NULL, 96),
  ('agri_trading', 'Agricultural commodity trading', 'KG', 97),
  ('animal_feed_supply', 'Animal feed supply', 'KG', 98),
  ('cold_storage', 'Cold storage and agri warehousing', 'MT', 99),
  -- Packaging and printing
  ('corrugated_box_manufacturing', 'Corrugated box manufacturing', 'PCS', 100),
  ('flexible_packaging', 'Flexible packaging manufacturing', 'KG', 101),
  ('label_printing', 'Label and sticker printing', 'PCS', 102),
  ('commercial_printing', 'Commercial printing', 'PCS', 103),
  ('packaging_machinery_supply', 'Packaging machinery supply', NULL, 104),
  ('woven_sack_supply', 'Woven sack supply', 'PCS', 105),
  ('strapping_film_supply', 'Strapping and stretch film supply', 'KG', 106),
  ('carton_manufacturing', 'Carton and case manufacturing', 'PCS', 107),
  ('packaging_design', 'Packaging design', NULL, 108),
  -- Facility management
  ('housekeeping', 'Housekeeping and cleaning', NULL, 110),
  ('plumbing_service', 'Plumbing service', NULL, 111),
  ('gardening_landscaping', 'Gardening and landscaping', 'SQFT', 112),
  ('security_manpower', 'Security manpower supply', NULL, 113),
  ('facility_amc', 'Facility maintenance contract', NULL, 114),
  ('pest_control', 'Pest control', 'SQFT', 115),
  ('waste_collection', 'Waste collection', 'KG', 116),
  ('lift_maintenance', 'Lift and elevator maintenance', NULL, 117),
  ('painting_service', 'Building painting service', 'SQFT', 118),
  ('rwa_management', 'Community and RWA operations', NULL, 119),
  -- Safety and security
  ('cctv_installation', 'CCTV supply and installation', NULL, 120),
  ('fire_system_installation', 'Fire safety system installation', NULL, 121),
  ('fire_extinguisher_amc', 'Fire extinguisher refilling and AMC', NULL, 122),
  ('ppe_supply', 'PPE and safety gear supply', NULL, 123),
  ('access_control_installation', 'Access control installation', NULL, 124),
  ('security_services', 'Security services', NULL, 125),
  ('alarm_installation', 'Alarm system installation', NULL, 126),
  ('safety_signage_supply', 'Safety signage supply', NULL, 127),
  ('first_aid_supply', 'First aid and medical supply', NULL, 128),
  ('guard_rail_installation', 'Guard rail and barrier installation', 'M', 129),
  -- Water and environmental
  ('borewell_drilling', 'Borewell drilling', 'FT', 130),
  ('borewell_flushing', 'Borewell flushing and rejuvenation', 'FT', 131),
  ('submersible_pump_supply', 'Submersible pump supply', 'HP', 132),
  ('water_treatment_plant', 'Water treatment plant supply and service', 'LPH', 133),
  ('sewage_treatment_plant', 'Sewage treatment plant supply and service', 'LPH', 134),
  ('rainwater_harvesting', 'Rainwater harvesting', NULL, 135),
  ('tank_cleaning', 'Water tank cleaning', 'L', 136),
  ('water_plumbing', 'Water supply plumbing', NULL, 137),
  ('waste_management', 'Waste management services', 'KG', 138),
  ('water_testing', 'Water quality testing', NULL, 139),
  -- IT and digital
  ('computer_supply', 'Computer and laptop supply', NULL, 140),
  ('networking_equipment_supply', 'Networking equipment supply', NULL, 141),
  ('software_licensing', 'Software licensing', NULL, 142),
  ('telecom_service', 'Telecom and connectivity service', 'MBPS', 143),
  ('cctv_it_integration', 'CCTV and IT integration', NULL, 144),
  ('iot_automation', 'IoT and automation solutions', NULL, 145),
  ('printer_supply', 'Printer and peripheral supply', NULL, 146),
  ('it_amc', 'IT annual maintenance contract', NULL, 147),
  ('software_development', 'Software and web development', NULL, 148),
  ('data_backup_service', 'Data backup and recovery service', 'GB', 149),
  -- Logistics
  ('local_delivery', 'Local delivery', 'KG', 150),
  ('freight_transport', 'Freight transport', 'MT', 151),
  ('heavy_equipment_transport', 'Heavy equipment transport', 'MT', 152),
  ('warehousing', 'Warehousing', 'SQFT', 153),
  ('courier_service', 'Courier and parcel service', 'KG', 154),
  ('cold_chain_transport', 'Cold chain transport', 'MT', 155),
  ('packers_movers', 'Packers and movers', NULL, 156),
  ('fleet_hire', 'Vehicle and fleet hire', NULL, 157),
  ('customs_clearance', 'Customs clearance', NULL, 158),
  -- Professional services
  ('electrician_service', 'Electrician service', NULL, 160),
  ('plumber_service', 'Plumber service', NULL, 161),
  ('civil_consulting', 'Civil and structural consulting', NULL, 162),
  ('legal_service', 'Legal service', NULL, 163),
  ('accounting_audit', 'Accounting and audit', NULL, 164),
  ('engineering_design', 'Engineering design and drafting', NULL, 165),
  ('architecture_service', 'Architecture service', NULL, 166),
  ('hr_recruitment', 'HR and recruitment', NULL, 167),
  ('training_service', 'Training service', NULL, 168),
  ('project_management', 'Project management', NULL, 169),
  -- General
  ('general_product_supply', 'General product supply', NULL, 190),
  ('general_service', 'General service', NULL, 191),
  ('custom_fulfilment', 'Custom requirement fulfilment', NULL, 192);

-- ---------------------------------------------------------------------------
-- 3. Subcategories
--
-- match_keywords are lower-cased phrases the parser scores free text against.
-- ---------------------------------------------------------------------------

INSERT INTO requirement_subcategories
  (category_id, code, name, match_keywords, default_requirement_mode, sort_order)
SELECT c.id, v.code, v.name, v.keywords, v.mode::requirement_mode, v.sort
FROM (VALUES
  -- Construction & Infrastructure
  ('construction_infrastructure', 'civil_work', 'Civil work',
   ARRAY['civil work','construction work','masonry','rcc','brickwork','plastering'], 'PROJECT_CONTRACT', 1),
  ('construction_infrastructure', 'cement_concrete', 'Cement & concrete',
   ARRAY['cement','concrete','rmc','ready mix','opc','ppc'], 'PRODUCT_MATERIAL', 2),
  ('construction_infrastructure', 'aggregates_sand', 'Aggregates, sand & blocks',
   ARRAY['sand','m sand','aggregate','jelly','gravel','blocks','bricks'], 'PRODUCT_MATERIAL', 3),
  ('construction_infrastructure', 'tiles_flooring', 'Tiles & flooring',
   ARRAY['tiles','flooring','vitrified','granite','marble','epoxy floor'], 'PRODUCT_MATERIAL', 4),
  ('construction_infrastructure', 'renovation_interior', 'Renovation & interior',
   ARRAY['renovation','interior','false ceiling','partition','carpentry','modular'], 'PROJECT_CONTRACT', 5),
  ('construction_infrastructure', 'fabrication_structural', 'Structural fabrication',
   ARRAY['structural fabrication','steel structure','truss','shed','grill','railing'], 'JOB_WORK', 6),
  ('construction_infrastructure', 'roofing_waterproofing', 'Roofing & waterproofing',
   ARRAY['waterproofing','roofing','terrace leak','seepage','roof sheet'], 'SERVICE', 7),
  ('construction_infrastructure', 'plumbing_sanitary_fittings', 'Plumbing & sanitary fittings',
   ARRAY['sanitary','sanitaryware','cp fittings','washbasin','closet','faucet'], 'PRODUCT_MATERIAL', 8),
  ('construction_infrastructure', 'painting_finishing', 'Painting & finishing',
   ARRAY['painting','putty','primer','emulsion','texture paint'], 'SERVICE', 9),
  ('construction_infrastructure', 'earthwork_excavation', 'Earthwork & excavation',
   ARRAY['excavation','earthwork','jcb','levelling','soil removal','digging'], 'SERVICE', 10),
  -- Electrical & Power
  ('electrical_power', 'electrical_items_cables', 'Electrical items & cables',
   ARRAY['cable','wire','wiring material','conduit','mcb','switch socket'], 'PRODUCT_MATERIAL', 1),
  ('electrical_power', 'switchgear_panels', 'Switchgear & panels',
   ARRAY['panel','switchgear','distribution board','mccb','acb','control panel'], 'PRODUCT_MATERIAL', 2),
  ('electrical_power', 'dg_sets', 'DG sets & generators',
   ARRAY['dg set','diesel generator','genset','generator'], 'PRODUCT_MATERIAL', 3),
  ('electrical_power', 'ups_inverters', 'UPS & inverters',
   ARRAY['ups','inverter','battery backup','online ups'], 'PRODUCT_MATERIAL', 4),
  ('electrical_power', 'solar_pv', 'Solar & renewable',
   ARRAY['solar','rooftop solar','solar panel','pv','net metering'], 'PROJECT_CONTRACT', 5),
  ('electrical_power', 'transformers', 'Transformers',
   ARRAY['transformer','distribution transformer','step down'], 'PRODUCT_MATERIAL', 6),
  ('electrical_power', 'electrical_contracting', 'Electrical contracting',
   ARRAY['electrical work','electrical contractor','wiring work','rewiring','electrical installation',
         'panel upgrade','panel replacement','electrical panel upgrade'], 'PROJECT_CONTRACT', 7),
  ('electrical_power', 'lighting_fixtures', 'Lighting & fixtures',
   ARRAY['lighting','led light','street light','flood light','fixture'], 'PRODUCT_MATERIAL', 8),
  ('electrical_power', 'earthing_lightning', 'Earthing & lightning protection',
   ARRAY['earthing','earth pit','lightning arrester','grounding'], 'SERVICE', 9),
  ('electrical_power', 'motor_control_automation', 'Motor control & automation',
   ARRAY['vfd','starter','plc','scada','motor control','automation panel'], 'PRODUCT_MATERIAL', 10),
  -- Machinery & Engineering
  ('machinery_engineering', 'motors_pumps_machinery', 'Motors, pumps & machinery',
   ARRAY['motor','pump','machinery','machine purchase','compressor'], 'PRODUCT_MATERIAL', 1),
  ('machinery_engineering', 'machine_spares', 'Machine spares',
   ARRAY['spare','spares','spare parts','machine part','replacement part'], 'PRODUCT_MATERIAL', 2),
  ('machinery_engineering', 'cnc_machining', 'CNC machining job work',
   ARRAY['cnc','cnc machining','cnc turning','machining job work','precision machining'], 'JOB_WORK', 3),
  ('machinery_engineering', 'welding_fabrication', 'Welding & fabrication',
   ARRAY['welding','fabrication','mig welding','tig welding','metal fabrication'], 'JOB_WORK', 4),
  ('machinery_engineering', 'gearbox_transmission', 'Gearbox & transmission repair',
   ARRAY['gearbox','gear box','transmission repair','reduction gear'], 'REPAIR_MAINTENANCE', 5),
  ('machinery_engineering', 'bearings_power_transmission', 'Bearings & power transmission',
   ARRAY['bearing','pulley','coupling','belt drive','chain drive'], 'PRODUCT_MATERIAL', 6),
  ('machinery_engineering', 'machine_installation', 'Machine installation & alignment',
   ARRAY['machine installation','erection','commissioning','alignment'], 'SERVICE', 7),
  ('machinery_engineering', 'spindle_repair', 'Spindle repair',
   ARRAY['spindle','spindle repair','spindle rebuild'], 'REPAIR_MAINTENANCE', 8),
  ('machinery_engineering', 'sheet_metal_work', 'Sheet metal work',
   ARRAY['sheet metal','laser cutting','bending','punching','press work'], 'JOB_WORK', 9),
  ('machinery_engineering', 'foundry_casting', 'Foundry & casting',
   ARRAY['casting','foundry','ci casting','pattern','moulding'], 'JOB_WORK', 10),
  -- Industrial Supplies & Hardware
  ('industrial_supplies_hardware', 'fasteners', 'Fasteners',
   ARRAY['bolt','nut','screw','fastener','washer','anchor'], 'PRODUCT_MATERIAL', 1),
  ('industrial_supplies_hardware', 'bearings', 'Bearings',
   ARRAY['bearing','ball bearing','roller bearing','skf','ntn'], 'PRODUCT_MATERIAL', 2),
  ('industrial_supplies_hardware', 'hand_power_tools', 'Hand & power tools',
   ARRAY['tool','power tool','drill machine','grinder','spanner','hand tool'], 'PRODUCT_MATERIAL', 3),
  ('industrial_supplies_hardware', 'cutting_tools', 'Cutting tools & inserts',
   ARRAY['cutting tool','insert','end mill','drill bit','tap','carbide'], 'PRODUCT_MATERIAL', 4),
  ('industrial_supplies_hardware', 'industrial_consumables', 'Industrial consumables',
   ARRAY['consumable','welding rod','electrode','gasket','o ring','industrial consumables'], 'PRODUCT_MATERIAL', 5),
  ('industrial_supplies_hardware', 'steel_metals', 'Steel & metals',
   ARRAY['steel','ms plate','angle','channel','tmt','aluminium','brass','rod'], 'PRODUCT_MATERIAL', 6),
  ('industrial_supplies_hardware', 'pipes_fittings', 'Pipes & fittings',
   ARRAY['pipe','pipes','fitting','elbow','flange','gi pipe','pvc pipe'], 'PRODUCT_MATERIAL', 7),
  ('industrial_supplies_hardware', 'abrasives', 'Abrasives',
   ARRAY['abrasive','emery','grinding wheel','sanding','cutting wheel'], 'PRODUCT_MATERIAL', 8),
  ('industrial_supplies_hardware', 'lubricants', 'Lubricants & oils',
   ARRAY['lubricant','grease','hydraulic oil','coolant','gear oil'], 'PRODUCT_MATERIAL', 9),
  ('industrial_supplies_hardware', 'material_handling_equipment', 'Material handling equipment',
   ARRAY['hoist','chain block','trolley','pallet truck','crane','forklift'], 'PRODUCT_MATERIAL', 10),
  -- Chemicals & Process Materials
  ('chemicals_process_materials', 'industrial_chemicals', 'Industrial chemicals',
   ARRAY['chemical','caustic','acid','soda ash','hydrochloric','sulphuric'], 'PRODUCT_MATERIAL', 1),
  ('chemicals_process_materials', 'paints_coatings', 'Paints & coatings',
   ARRAY['paint','coating','enamel','powder coating','industrial paint'], 'PRODUCT_MATERIAL', 2),
  ('chemicals_process_materials', 'dyes_pigments', 'Dyes & pigments',
   ARRAY['dye','dyes','pigment','reactive dye','vat dye','colourant'], 'PRODUCT_MATERIAL', 3),
  ('chemicals_process_materials', 'water_treatment_chemicals', 'Water treatment chemicals',
   ARRAY['water treatment chemical','antiscalant','chlorine','alum','poly aluminium'], 'PRODUCT_MATERIAL', 4),
  ('chemicals_process_materials', 'adhesives_sealants', 'Adhesives & sealants',
   ARRAY['adhesive','glue','sealant','silicone','epoxy adhesive'], 'PRODUCT_MATERIAL', 5),
  ('chemicals_process_materials', 'solvents', 'Solvents',
   ARRAY['solvent','thinner','acetone','toluene','ipa'], 'PRODUCT_MATERIAL', 6),
  ('chemicals_process_materials', 'lab_reagents', 'Laboratory reagents',
   ARRAY['reagent','lab chemical','analytical grade','lr grade','ar grade'], 'PRODUCT_MATERIAL', 7),
  ('chemicals_process_materials', 'cleaning_chemicals', 'Cleaning chemicals',
   ARRAY['cleaning chemical','detergent','disinfectant','floor cleaner','sanitizer'], 'PRODUCT_MATERIAL', 8),
  ('chemicals_process_materials', 'fertilizer_chemicals', 'Fertilizer & agro chemicals',
   ARRAY['fertilizer chemical','urea','dap','micronutrient','pesticide'], 'PRODUCT_MATERIAL', 9),
  ('chemicals_process_materials', 'gases_industrial', 'Industrial gases',
   ARRAY['oxygen','nitrogen','argon','acetylene','industrial gas','co2'], 'PRODUCT_MATERIAL', 10),
  -- Textile & Apparel
  ('textile_apparel', 'cotton_yarn', 'Cotton yarn',
   ARRAY['cotton yarn','combed','carded','yarn count','ring spun','hosiery yarn'], 'PRODUCT_MATERIAL', 1),
  ('textile_apparel', 'synthetic_yarn', 'Synthetic & blended yarn',
   ARRAY['polyester yarn','viscose','pc blend','synthetic yarn','melange'], 'PRODUCT_MATERIAL', 2),
  ('textile_apparel', 'fabric_woven', 'Woven fabric',
   ARRAY['woven fabric','shirting','suiting','poplin','twill','canvas'], 'PRODUCT_MATERIAL', 3),
  ('textile_apparel', 'fabric_knitted', 'Knitted fabric',
   ARRAY['knitted fabric','single jersey','interlock','rib','fleece','gsm fabric'], 'PRODUCT_MATERIAL', 4),
  ('textile_apparel', 'garments', 'Garments',
   ARRAY['garment','t shirt','tshirt','shirt stitching','uniform','apparel'], 'JOB_WORK', 5),
  ('textile_apparel', 'dyeing_processing', 'Dyeing & processing',
   ARRAY['dyeing','fabric processing','bleaching','compacting','mercerising'], 'JOB_WORK', 6),
  ('textile_apparel', 'knitting_job_work', 'Knitting job work',
   ARRAY['knitting','knitting job work','circular knitting','fabric knitting'], 'JOB_WORK', 7),
  ('textile_apparel', 'embroidery_printing', 'Embroidery & printing',
   ARRAY['embroidery','screen printing','fabric printing','sublimation','rotary print'], 'JOB_WORK', 8),
  ('textile_apparel', 'textile_machinery', 'Textile machinery & spares',
   ARRAY['textile machinery','loom','circular knitting machine','spinning machine','ring frame'], 'PRODUCT_MATERIAL', 9),
  ('textile_apparel', 'textile_accessories', 'Textile accessories',
   ARRAY['button','zipper','label tag','thread','elastic','trims'], 'PRODUCT_MATERIAL', 10),
  -- Agriculture & Commodities
  ('agriculture_commodities', 'turmeric', 'Turmeric',
   ARRAY['turmeric','manjal','curcumin','turmeric finger','erode turmeric'], 'COMMODITY_TRADING', 1),
  ('agriculture_commodities', 'grains_pulses', 'Grains & pulses',
   ARRAY['rice','paddy','wheat','maize','dal','pulses','grain'], 'COMMODITY_TRADING', 2),
  ('agriculture_commodities', 'spices', 'Spices',
   ARRAY['spice','chilli','coriander','pepper','cumin','tamarind'], 'COMMODITY_TRADING', 3),
  ('agriculture_commodities', 'oil_seeds', 'Oil seeds',
   ARRAY['groundnut','sesame','gingelly','sunflower seed','oil seed','copra'], 'COMMODITY_TRADING', 4),
  ('agriculture_commodities', 'seeds_planting', 'Planting seeds & saplings',
   ARRAY['seeds','sapling','planting material','hybrid seed','nursery'], 'PRODUCT_MATERIAL', 5),
  ('agriculture_commodities', 'fertilizers', 'Fertilizers & soil inputs',
   ARRAY['fertilizer','manure','compost','bio fertilizer','soil conditioner'], 'PRODUCT_MATERIAL', 6),
  ('agriculture_commodities', 'farm_equipment', 'Farm equipment',
   ARRAY['tractor','tiller','sprayer','farm equipment','harvester','plough'], 'PRODUCT_MATERIAL', 7),
  ('agriculture_commodities', 'agri_produce_trading', 'Agri produce trading',
   ARRAY['agri produce','vegetable bulk','fruit bulk','produce trading','mandi'], 'COMMODITY_TRADING', 8),
  ('agriculture_commodities', 'animal_feed', 'Animal feed',
   ARRAY['cattle feed','poultry feed','animal feed','fodder','feed supplement'], 'PRODUCT_MATERIAL', 9),
  ('agriculture_commodities', 'cold_storage_agri', 'Cold storage & agri warehousing',
   ARRAY['cold storage','agri warehouse','godown','produce storage'], 'SERVICE', 10),
  -- Packaging & Printing
  ('packaging_printing', 'corrugated_boxes', 'Corrugated boxes',
   ARRAY['corrugated box','carton box','3 ply','5 ply','packing box'], 'PRODUCT_MATERIAL', 1),
  ('packaging_printing', 'flexible_packaging', 'Flexible packaging',
   ARRAY['pouch','laminate roll','flexible packaging','bopp','poly bag'], 'PRODUCT_MATERIAL', 2),
  ('packaging_printing', 'labels_stickers', 'Labels & stickers',
   ARRAY['label','sticker','barcode label','shrink sleeve','tag printing'], 'PRODUCT_MATERIAL', 3),
  ('packaging_printing', 'commercial_printing', 'Commercial printing',
   ARRAY['printing','brochure','catalogue','visiting card','offset printing','flyer'], 'JOB_WORK', 4),
  ('packaging_printing', 'packaging_machinery', 'Packaging machinery',
   ARRAY['packing machine','sealing machine','filling machine','strapping machine'], 'PRODUCT_MATERIAL', 5),
  ('packaging_printing', 'woven_sacks', 'Woven sacks & bags',
   ARRAY['woven sack','pp bag','jute bag','gunny','bulk bag'], 'PRODUCT_MATERIAL', 6),
  ('packaging_printing', 'strapping_stretch_film', 'Strapping & stretch film',
   ARRAY['strapping','stretch film','shrink film','bubble wrap','tape'], 'PRODUCT_MATERIAL', 7),
  ('packaging_printing', 'cartons_cases', 'Cartons & cases',
   ARRAY['carton','duplex box','mono carton','display case'], 'PRODUCT_MATERIAL', 8),
  ('packaging_printing', 'printing_inks_plates', 'Printing inks & plates',
   ARRAY['printing ink','plate making','cylinder','flexo plate'], 'PRODUCT_MATERIAL', 9),
  ('packaging_printing', 'packaging_design', 'Packaging design',
   ARRAY['packaging design','artwork','dieline','structural design'], 'PROFESSIONAL_SERVICE', 10),
  -- Property & Facility Management
  ('property_facility_management', 'housekeeping_cleaning', 'Housekeeping & cleaning',
   ARRAY['housekeeping','cleaning','deep cleaning','sweeping','mopping','facade cleaning'], 'SERVICE', 1),
  ('property_facility_management', 'plumbing_services', 'Plumbing services',
   ARRAY['plumbing','plumber','leak repair','pipe repair','tap repair'], 'REPAIR_MAINTENANCE', 2),
  ('property_facility_management', 'gardening_landscape', 'Gardening & landscaping',
   ARRAY['gardening','landscaping','lawn','garden maintenance','horticulture'], 'SERVICE', 3),
  ('property_facility_management', 'security_manpower', 'Security manpower',
   ARRAY['security guard','watchman','security manpower','guard deployment'], 'SERVICE', 4),
  ('property_facility_management', 'amc_facility', 'Facility AMC',
   ARRAY['amc','annual maintenance','maintenance contract','facility amc'], 'AMC', 5),
  ('property_facility_management', 'pest_control', 'Pest control',
   ARRAY['pest control','termite','cockroach','rodent','fumigation','mosquito'], 'SERVICE', 6),
  ('property_facility_management', 'waste_collection', 'Waste collection',
   ARRAY['garbage','waste collection','wet waste','dry waste','segregation'], 'SERVICE', 7),
  ('property_facility_management', 'lift_amc', 'Lift & elevator AMC',
   ARRAY['lift','elevator','lift amc','elevator maintenance'], 'AMC', 8),
  ('property_facility_management', 'painting_maintenance', 'Building painting & maintenance',
   ARRAY['building painting','exterior painting','repainting','block painting'], 'SERVICE', 9),
  ('property_facility_management', 'rwa_operations', 'Community & RWA operations',
   ARRAY['rwa','association','apartment maintenance','community operations','society'], 'SERVICE', 10),
  -- Safety & Security
  ('safety_security', 'cctv_surveillance', 'CCTV & surveillance',
   ARRAY['cctv','camera','surveillance','dvr','nvr','ip camera'], 'PRODUCT_MATERIAL', 1),
  ('safety_security', 'fire_safety_systems', 'Fire safety systems',
   ARRAY['fire alarm','sprinkler','hydrant','fire system','smoke detector'], 'PROJECT_CONTRACT', 2),
  ('safety_security', 'fire_extinguisher_amc', 'Fire extinguisher & AMC',
   ARRAY['fire extinguisher','extinguisher refilling','fire safety amc','co2 extinguisher'], 'AMC', 3),
  ('safety_security', 'ppe_safety_gear', 'PPE & safety gear',
   ARRAY['ppe','safety shoe','helmet','safety gloves','goggles','harness'], 'PRODUCT_MATERIAL', 4),
  ('safety_security', 'access_control', 'Access control',
   ARRAY['access control','biometric','boom barrier','turnstile','rfid card'], 'PRODUCT_MATERIAL', 5),
  ('safety_security', 'security_services', 'Security services',
   ARRAY['security service','patrolling','bouncer','event security'], 'SERVICE', 6),
  ('safety_security', 'alarm_systems', 'Alarm systems',
   ARRAY['alarm','intrusion alarm','siren','panic button'], 'PRODUCT_MATERIAL', 7),
  ('safety_security', 'safety_signage', 'Safety signage',
   ARRAY['signage','safety sign','reflective board','floor marking'], 'PRODUCT_MATERIAL', 8),
  ('safety_security', 'first_aid_medical', 'First aid & medical supplies',
   ARRAY['first aid','medical kit','ambulance','aed','stretcher'], 'PRODUCT_MATERIAL', 9),
  ('safety_security', 'guard_railing', 'Guard railing & barriers',
   ARRAY['guard rail','crash barrier','bollard','safety barrier'], 'PRODUCT_MATERIAL', 10),
  -- Water & Environmental Solutions
  -- Drilling-specific. A bare "borewell" appears in every borewell enquiry,
  -- including the repair ones, so it cannot be the signal for sinking a new one.
  ('water_environmental', 'borewell_drilling', 'Borewell drilling',
   ARRAY['borewell drilling','bore well drilling','bore drilling','new borewell',
         'new bore well','sink a borewell','drilling rig','drill a bore'], 'SERVICE', 1),
  -- Deliberately supply-specific. A bare "submersible" or "borewell motor"
  -- appears just as often in repair requests, and would otherwise outscore
  -- motor_rewinding on a rewinding job.
  ('water_environmental', 'borewell_motor_pump', 'Borewell motor & pump supply',
   ARRAY['submersible pump','new pump','pump set','monoblock','openwell',
         'motor purchase','buy motor','new motor'], 'PRODUCT_MATERIAL', 2),
  -- Carries the phrases people actually write about a failed motor, not just
  -- the trade term. "The winding has burnt" is how the complaint arrives.
  ('water_environmental', 'motor_rewinding', 'Motor rewinding & repair',
   ARRAY['motor rewinding','rewinding','rewind the motor','motor winding',
         'winding has burnt','winding burnt','burnt winding','winding failure',
         'motor repair','motor burnt','burnt motor','motor not starting','winding'],
   'REPAIR_MAINTENANCE', 3),
  ('water_environmental', 'water_treatment_plant', 'Water treatment plant',
   ARRAY['ro plant','water treatment','softener','wtp','filtration plant'], 'PROJECT_CONTRACT', 4),
  ('water_environmental', 'sewage_treatment_plant', 'Sewage treatment plant',
   ARRAY['stp','sewage treatment','etp','effluent'], 'PROJECT_CONTRACT', 5),
  ('water_environmental', 'rainwater_harvesting', 'Rainwater harvesting',
   ARRAY['rainwater harvesting','recharge pit','rain water','percolation'], 'PROJECT_CONTRACT', 6),
  ('water_environmental', 'water_tank_cleaning', 'Water tank cleaning',
   ARRAY['tank cleaning','sump cleaning','overhead tank','water tank'], 'SERVICE', 7),
  ('water_environmental', 'plumbing_water_supply', 'Water supply plumbing',
   ARRAY['water line','water supply','plumbing line','pipeline laying'], 'SERVICE', 8),
  ('water_environmental', 'waste_management', 'Waste management',
   ARRAY['waste management','biogas','composting','sludge removal','septic tank'], 'SERVICE', 9),
  ('water_environmental', 'water_testing', 'Water quality testing',
   ARRAY['water testing','water quality','tds test','potability','lab test water'], 'PROFESSIONAL_SERVICE', 10),
  -- IT, Electronics & Digital
  ('it_electronics_digital', 'computers_laptops', 'Computers & laptops',
   ARRAY['laptop','desktop','computer','workstation','all in one pc'], 'PRODUCT_MATERIAL', 1),
  ('it_electronics_digital', 'networking_equipment', 'Networking equipment',
   ARRAY['switch','router','firewall','access point','network rack','structured cabling'], 'PRODUCT_MATERIAL', 2),
  ('it_electronics_digital', 'software_licenses', 'Software licences',
   ARRAY['software licence','software license','subscription','antivirus','office licence','erp licence'], 'PRODUCT_MATERIAL', 3),
  ('it_electronics_digital', 'telecom_connectivity', 'Telecom & connectivity',
   ARRAY['internet','broadband','leased line','sim','telecom','ilp'], 'SERVICE', 4),
  ('it_electronics_digital', 'cctv_it_integration', 'CCTV & IT integration',
   ARRAY['cctv integration','video wall','nvr setup','it integration'], 'PROJECT_CONTRACT', 5),
  ('it_electronics_digital', 'iot_automation', 'IoT & automation',
   ARRAY['iot','sensor','smart meter','remote monitoring','automation solution'], 'PROJECT_CONTRACT', 6),
  ('it_electronics_digital', 'printers_peripherals', 'Printers & peripherals',
   ARRAY['printer','scanner','toner','cartridge','peripheral','ups for pc'], 'PRODUCT_MATERIAL', 7),
  ('it_electronics_digital', 'it_amc_support', 'IT AMC & support',
   ARRAY['it amc','it support','helpdesk','system maintenance','managed it'], 'AMC', 8),
  ('it_electronics_digital', 'web_software_development', 'Web & software development',
   ARRAY['website','web development','mobile app','software development','portal'], 'PROFESSIONAL_SERVICE', 9),
  ('it_electronics_digital', 'data_backup', 'Data backup & recovery',
   ARRAY['backup','data recovery','nas','cloud backup','disaster recovery'], 'SERVICE', 10),
  -- Logistics & Transportation
  ('logistics_transportation', 'local_delivery', 'Local delivery',
   ARRAY['local delivery','city delivery','tempo','pickup drop','last mile'], 'LOGISTICS', 1),
  ('logistics_transportation', 'freight_transport', 'Freight transport',
   ARRAY['freight','lorry','truck load','ftl','ptl','transport'], 'LOGISTICS', 2),
  ('logistics_transportation', 'heavy_equipment_movement', 'Heavy equipment movement',
   ARRAY['heavy equipment','odc','low bed','trailer','machine shifting'], 'LOGISTICS', 3),
  ('logistics_transportation', 'warehousing', 'Warehousing',
   ARRAY['warehouse','godown','storage space','3pl','warehousing'], 'SERVICE', 4),
  ('logistics_transportation', 'courier_parcel', 'Courier & parcel',
   ARRAY['courier','parcel','document delivery','shipment'], 'LOGISTICS', 5),
  ('logistics_transportation', 'cold_chain', 'Cold chain transport',
   ARRAY['reefer','cold chain','refrigerated transport','chilled'], 'LOGISTICS', 6),
  ('logistics_transportation', 'packers_movers', 'Packers & movers',
   ARRAY['packers and movers','shifting','relocation','house shifting','office shifting'], 'SERVICE', 7),
  ('logistics_transportation', 'fleet_hire', 'Vehicle & fleet hire',
   ARRAY['vehicle hire','car rental','bus hire','fleet','staff transport'], 'RENTAL_HIRE', 8),
  ('logistics_transportation', 'customs_clearance', 'Customs clearance',
   ARRAY['customs','cha','import clearance','export documentation'], 'PROFESSIONAL_SERVICE', 9),
  ('logistics_transportation', 'last_mile_delivery', 'Last mile & distribution',
   ARRAY['distribution','last mile delivery','hyperlocal','route delivery'], 'LOGISTICS', 10),
  -- Professional & Skilled Services
  -- Hiring a person, not describing one. A bare "electrician" or "technician"
  -- appears in half the maintenance enquiries on the platform ("the electrician
  -- says the winding has burnt"), and matching on it hijacks the requirement.
  ('professional_skilled_services', 'electrician_technician', 'Electrician & technician',
   ARRAY['need an electrician','need electrician','electrician required',
         'send an electrician','electrician visit','hire an electrician',
         'wireman','electrical repair visit','electrical technician'], 'SERVICE', 1),
  ('professional_skilled_services', 'plumber_technician', 'Plumber',
   ARRAY['plumber','plumbing visit','tap leak','sanitary repair'], 'SERVICE', 2),
  ('professional_skilled_services', 'civil_consultant', 'Civil & structural consultant',
   ARRAY['structural consultant','civil consultant','structural audit','soil test','stability certificate'], 'PROFESSIONAL_SERVICE', 3),
  ('professional_skilled_services', 'legal_services', 'Legal services',
   ARRAY['legal','advocate','agreement drafting','registration','notice'], 'PROFESSIONAL_SERVICE', 4),
  ('professional_skilled_services', 'accounting_audit', 'Accounting & audit',
   ARRAY['accounting','audit','gst filing','bookkeeping','ca service','tax'], 'PROFESSIONAL_SERVICE', 5),
  ('professional_skilled_services', 'engineering_design', 'Engineering design & drafting',
   ARRAY['design','drafting','cad','3d model','reverse engineering','drawing preparation'], 'PROFESSIONAL_SERVICE', 6),
  ('professional_skilled_services', 'architect_services', 'Architect services',
   ARRAY['architect','plan approval','elevation','layout design','building plan'], 'PROFESSIONAL_SERVICE', 7),
  ('professional_skilled_services', 'hr_recruitment', 'HR & recruitment',
   ARRAY['recruitment','staffing','hiring','payroll','manpower supply'], 'PROFESSIONAL_SERVICE', 8),
  ('professional_skilled_services', 'training_services', 'Training services',
   ARRAY['training','safety training','skill training','workshop conduct'], 'PROFESSIONAL_SERVICE', 9),
  ('professional_skilled_services', 'project_management', 'Project management',
   ARRAY['project management','pmc','site supervision','execution support'], 'PROFESSIONAL_SERVICE', 10),
  -- General / Other
  ('general_other', 'general_products', 'General products',
   ARRAY['product','supply','purchase','buy','material'], 'PRODUCT_MATERIAL', 1),
  ('general_other', 'general_services', 'General services',
   ARRAY['service','work','job','help needed'], 'SERVICE', 2),
  ('general_other', 'custom_requirement', 'Custom requirement',
   ARRAY['custom','special','one off','bespoke'], 'OTHER', 3),
  ('general_other', 'miscellaneous_supply', 'Miscellaneous supply',
   ARRAY['miscellaneous','sundry','general items'], 'PRODUCT_MATERIAL', 4),
  ('general_other', 'other_professional', 'Other professional service',
   ARRAY['consultant','advisory','professional help'], 'PROFESSIONAL_SERVICE', 5)
) AS v(cat, code, name, keywords, mode, sort)
JOIN requirement_categories c ON c.code = v.cat;

-- ---------------------------------------------------------------------------
-- 3b. Attributes a supplier cannot quote without
--
-- These drive the "I need N more details" step. Keep the list short: every
-- entry is a question the buyer is forced to answer, and a rewinder who is
-- asked for the surface finish of a shaft will not thank us. The test is
-- narrow — would a supplier have to ring the buyer back before quoting?
-- ---------------------------------------------------------------------------

UPDATE requirement_subcategories s
SET required_attribute_codes = v.codes
FROM (VALUES
  -- No workshop can price a rewind without the rating.
  ('motor_rewinding', ARRAY['motor_hp']),
  -- Depth decides the rig, the casing and most of the cost.
  ('borewell_drilling', ARRAY['depth_ft']),
  ('borewell_motor_pump', ARRAY['motor_hp']),
  -- Machining is quoted off material and the tightest tolerance.
  ('cnc_machining', ARRAY['material', 'tolerance_mm']),
  -- Count is the yarn itself; a mill cannot quote "cotton yarn".
  ('cotton_yarn', ARRAY['yarn_count']),
  ('synthetic_yarn', ARRAY['yarn_count']),
  -- Graded produce trades on the grade.
  ('turmeric', ARRAY['quality_grade']),
  ('grains_pulses', ARRAY['quality_grade']),
  ('spices', ARRAY['quality_grade']),
  -- An AMC is priced per unit covered.
  ('lift_amc', ARRAY['lift_count'])
) AS v(code, codes)
WHERE s.code = v.code;
-- Verified against the attribute definitions at the end of this migration.

-- ---------------------------------------------------------------------------
-- 4. Subcategory -> capability mapping
--
-- Primary capabilities gate eligibility; secondary ones only lift the score.
-- The secondary entries are what create cross-category reach: a motor
-- rewinding requirement also surfaces electrical contractors and pump
-- services who declared the capability.
-- ---------------------------------------------------------------------------

INSERT INTO subcategory_capabilities (subcategory_id, capability_id, is_primary)
SELECT s.id, cp.id, v.is_primary
FROM (VALUES
  -- Construction
  ('civil_work', 'civil_construction', true), ('civil_work', 'earthmoving', false),
  ('cement_concrete', 'concrete_supply', true), ('cement_concrete', 'aggregate_supply', false),
  ('aggregates_sand', 'aggregate_supply', true), ('aggregates_sand', 'concrete_supply', false),
  ('tiles_flooring', 'tiling_flooring', true), ('tiles_flooring', 'interior_renovation', false),
  ('renovation_interior', 'interior_renovation', true), ('renovation_interior', 'civil_construction', false),
  ('renovation_interior', 'painting_work', false),
  ('fabrication_structural', 'structural_fabrication', true), ('fabrication_structural', 'welding_fabrication', false),
  ('roofing_waterproofing', 'waterproofing', true), ('roofing_waterproofing', 'civil_construction', false),
  ('plumbing_sanitary_fittings', 'sanitary_fitting', true), ('plumbing_sanitary_fittings', 'pipe_supply', false),
  ('painting_finishing', 'painting_work', true), ('painting_finishing', 'painting_service', false),
  ('earthwork_excavation', 'earthmoving', true), ('earthwork_excavation', 'civil_construction', false),
  -- Electrical
  ('electrical_items_cables', 'cable_supply', true), ('electrical_items_cables', 'electrical_contracting', false),
  ('switchgear_panels', 'panel_manufacturing', true), ('switchgear_panels', 'electrical_contracting', false),
  ('dg_sets', 'dg_supply', true), ('dg_sets', 'dg_maintenance', false),
  ('ups_inverters', 'ups_service', true), ('ups_inverters', 'electrical_contracting', false),
  ('solar_pv', 'solar_installation', true), ('solar_pv', 'electrical_contracting', false),
  ('transformers', 'transformer_service', true), ('transformers', 'electrical_testing', false),
  ('electrical_contracting', 'electrical_contracting', true), ('electrical_contracting', 'electrician_service', false),
  ('electrical_contracting', 'electrical_testing', false),
  ('lighting_fixtures', 'lighting_supply', true), ('lighting_fixtures', 'electrical_contracting', false),
  ('earthing_lightning', 'earthing_installation', true), ('earthing_lightning', 'electrical_testing', false),
  ('motor_control_automation', 'motor_control_automation', true), ('motor_control_automation', 'panel_manufacturing', false),
  ('motor_control_automation', 'iot_automation', false),
  -- Machinery
  ('motors_pumps_machinery', 'motor_supply', true), ('motors_pumps_machinery', 'pump_installation', false),
  ('motors_pumps_machinery', 'machine_installation', false),
  ('machine_spares', 'machine_spares_supply', true), ('machine_spares', 'bearing_supply', false),
  ('cnc_machining', 'cnc_machining', true), ('cnc_machining', 'vmc_machining', false),
  ('cnc_machining', 'turning_machining', false),
  ('welding_fabrication', 'welding_fabrication', true), ('welding_fabrication', 'structural_fabrication', false),
  ('welding_fabrication', 'sheet_metal_work', false),
  ('gearbox_transmission', 'gearbox_repair', true), ('gearbox_transmission', 'machine_installation', false),
  ('bearings_power_transmission', 'bearing_supply', true), ('bearings_power_transmission', 'machine_spares_supply', false),
  ('machine_installation', 'machine_installation', true), ('machine_installation', 'electrical_contracting', false),
  ('spindle_repair', 'spindle_repair', true), ('spindle_repair', 'bearing_supply', false),
  ('sheet_metal_work', 'sheet_metal_work', true), ('sheet_metal_work', 'welding_fabrication', false),
  ('foundry_casting', 'foundry_casting', true), ('foundry_casting', 'turning_machining', false),
  -- Industrial supplies
  ('fasteners', 'fastener_supply', true), ('fasteners', 'consumables_supply', false),
  ('bearings', 'bearing_supply', true), ('bearings', 'machine_spares_supply', false),
  ('hand_power_tools', 'tool_supply', true), ('hand_power_tools', 'consumables_supply', false),
  ('cutting_tools', 'cutting_tool_supply', true), ('cutting_tools', 'tool_supply', false),
  ('industrial_consumables', 'consumables_supply', true), ('industrial_consumables', 'abrasive_supply', false),
  ('steel_metals', 'steel_supply', true), ('steel_metals', 'structural_fabrication', false),
  ('pipes_fittings', 'pipe_supply', true), ('pipes_fittings', 'sanitary_fitting', false),
  ('abrasives', 'abrasive_supply', true), ('abrasives', 'consumables_supply', false),
  ('lubricants', 'lubricant_supply', true), ('lubricants', 'consumables_supply', false),
  ('material_handling_equipment', 'material_handling_supply', true), ('material_handling_equipment', 'tool_supply', false),
  -- Chemicals
  ('industrial_chemicals', 'chemical_supply', true), ('industrial_chemicals', 'solvent_supply', false),
  ('paints_coatings', 'paint_supply', true), ('paints_coatings', 'solvent_supply', false),
  ('dyes_pigments', 'dye_supply', true), ('dyes_pigments', 'chemical_supply', false),
  ('water_treatment_chemicals', 'water_chemical_supply', true), ('water_treatment_chemicals', 'chemical_supply', false),
  ('adhesives_sealants', 'adhesive_supply', true), ('adhesives_sealants', 'chemical_supply', false),
  ('solvents', 'solvent_supply', true), ('solvents', 'chemical_supply', false),
  ('lab_reagents', 'lab_reagent_supply', true), ('lab_reagents', 'chemical_supply', false),
  ('cleaning_chemicals', 'cleaning_chemical_supply', true), ('cleaning_chemicals', 'chemical_supply', false),
  ('fertilizer_chemicals', 'fertilizer_supply', true), ('fertilizer_chemicals', 'chemical_supply', false),
  ('gases_industrial', 'industrial_gas_supply', true), ('gases_industrial', 'chemical_supply', false),
  -- Textile
  ('cotton_yarn', 'cotton_yarn_supply', true), ('cotton_yarn', 'synthetic_yarn_supply', false),
  ('synthetic_yarn', 'synthetic_yarn_supply', true), ('synthetic_yarn', 'cotton_yarn_supply', false),
  ('fabric_woven', 'woven_fabric_supply', true), ('fabric_woven', 'dyeing_processing', false),
  ('fabric_knitted', 'knitted_fabric_supply', true), ('fabric_knitted', 'knitting_job_work', false),
  ('fabric_knitted', 'dyeing_processing', false),
  ('garments', 'garment_manufacturing', true), ('garments', 'embroidery_printing', false),
  ('dyeing_processing', 'dyeing_processing', true), ('dyeing_processing', 'water_chemical_supply', false),
  ('knitting_job_work', 'knitting_job_work', true), ('knitting_job_work', 'knitted_fabric_supply', false),
  ('embroidery_printing', 'embroidery_printing', true), ('embroidery_printing', 'garment_manufacturing', false),
  ('textile_machinery', 'textile_machinery_supply', true), ('textile_machinery', 'machine_spares_supply', false),
  ('textile_accessories', 'textile_accessory_supply', true), ('textile_accessories', 'label_printing', false),
  -- Agriculture
  ('turmeric', 'turmeric_supply', true), ('turmeric', 'agri_trading', false),
  ('turmeric', 'spice_supply', false),
  ('grains_pulses', 'grain_supply', true), ('grains_pulses', 'agri_trading', false),
  ('spices', 'spice_supply', true), ('spices', 'agri_trading', false),
  ('oil_seeds', 'oilseed_supply', true), ('oil_seeds', 'agri_trading', false),
  ('seeds_planting', 'seed_supply', true), ('seeds_planting', 'fertilizer_supply', false),
  ('fertilizers', 'fertilizer_supply', true), ('fertilizers', 'chemical_supply', false),
  ('farm_equipment', 'farm_equipment_supply', true), ('farm_equipment', 'machine_spares_supply', false),
  ('agri_produce_trading', 'agri_trading', true), ('agri_produce_trading', 'cold_storage', false),
  ('animal_feed', 'animal_feed_supply', true), ('animal_feed', 'grain_supply', false),
  ('cold_storage_agri', 'cold_storage', true), ('cold_storage_agri', 'warehousing', false),
  -- Packaging
  ('corrugated_boxes', 'corrugated_box_manufacturing', true), ('corrugated_boxes', 'carton_manufacturing', false),
  ('flexible_packaging', 'flexible_packaging', true), ('flexible_packaging', 'label_printing', false),
  ('labels_stickers', 'label_printing', true), ('labels_stickers', 'commercial_printing', false),
  ('commercial_printing', 'commercial_printing', true), ('commercial_printing', 'label_printing', false),
  ('packaging_machinery', 'packaging_machinery_supply', true), ('packaging_machinery', 'machine_spares_supply', false),
  ('woven_sacks', 'woven_sack_supply', true), ('woven_sacks', 'flexible_packaging', false),
  ('strapping_stretch_film', 'strapping_film_supply', true), ('strapping_stretch_film', 'flexible_packaging', false),
  ('cartons_cases', 'carton_manufacturing', true), ('cartons_cases', 'corrugated_box_manufacturing', false),
  ('printing_inks_plates', 'commercial_printing', true), ('printing_inks_plates', 'chemical_supply', false),
  ('packaging_design', 'packaging_design', true), ('packaging_design', 'engineering_design', false),
  -- Facility management
  ('housekeeping_cleaning', 'housekeeping', true), ('housekeeping_cleaning', 'cleaning_chemical_supply', false),
  ('plumbing_services', 'plumbing_service', true), ('plumbing_services', 'plumber_service', false),
  ('plumbing_services', 'water_plumbing', false),
  ('gardening_landscape', 'gardening_landscaping', true), ('gardening_landscape', 'housekeeping', false),
  ('security_manpower', 'security_manpower', true), ('security_manpower', 'security_services', false),
  ('amc_facility', 'facility_amc', true), ('amc_facility', 'housekeeping', false),
  ('amc_facility', 'electrical_contracting', false),
  ('pest_control', 'pest_control', true), ('pest_control', 'housekeeping', false),
  ('waste_collection', 'waste_collection', true), ('waste_collection', 'waste_management', false),
  ('lift_amc', 'lift_maintenance', true), ('lift_amc', 'facility_amc', false),
  ('painting_maintenance', 'painting_service', true), ('painting_maintenance', 'painting_work', false),
  ('rwa_operations', 'rwa_management', true), ('rwa_operations', 'facility_amc', false),
  -- Safety and security
  ('cctv_surveillance', 'cctv_installation', true), ('cctv_surveillance', 'cctv_it_integration', false),
  ('fire_safety_systems', 'fire_system_installation', true), ('fire_safety_systems', 'fire_extinguisher_amc', false),
  ('fire_extinguisher_amc', 'fire_extinguisher_amc', true), ('fire_extinguisher_amc', 'fire_system_installation', false),
  ('ppe_safety_gear', 'ppe_supply', true), ('ppe_safety_gear', 'safety_signage_supply', false),
  ('access_control', 'access_control_installation', true), ('access_control', 'cctv_installation', false),
  ('security_services', 'security_services', true), ('security_services', 'security_manpower', false),
  ('alarm_systems', 'alarm_installation', true), ('alarm_systems', 'cctv_installation', false),
  ('safety_signage', 'safety_signage_supply', true), ('safety_signage', 'commercial_printing', false),
  ('first_aid_medical', 'first_aid_supply', true), ('first_aid_medical', 'ppe_supply', false),
  ('guard_railing', 'guard_rail_installation', true), ('guard_railing', 'structural_fabrication', false),
  -- Water and environmental
  ('borewell_drilling', 'borewell_drilling', true), ('borewell_drilling', 'borewell_flushing', false),
  ('borewell_drilling', 'submersible_pump_supply', false),
  ('borewell_motor_pump', 'submersible_pump_supply', true), ('borewell_motor_pump', 'motor_supply', false),
  ('borewell_motor_pump', 'pump_installation', false),
  -- The flagship cross-category case: rewinding reaches motor workshops,
  -- electrical contractors and pump services alike.
  ('motor_rewinding', 'motor_rewinding', true), ('motor_rewinding', 'pump_installation', false),
  ('motor_rewinding', 'electrical_contracting', false), ('motor_rewinding', 'electrical_testing', false),
  ('water_treatment_plant', 'water_treatment_plant', true), ('water_treatment_plant', 'water_chemical_supply', false),
  ('sewage_treatment_plant', 'sewage_treatment_plant', true), ('sewage_treatment_plant', 'water_treatment_plant', false),
  ('rainwater_harvesting', 'rainwater_harvesting', true), ('rainwater_harvesting', 'civil_construction', false),
  ('water_tank_cleaning', 'tank_cleaning', true), ('water_tank_cleaning', 'housekeeping', false),
  ('plumbing_water_supply', 'water_plumbing', true), ('plumbing_water_supply', 'plumbing_service', false),
  ('plumbing_water_supply', 'pipe_supply', false),
  ('waste_management', 'waste_management', true), ('waste_management', 'waste_collection', false),
  ('water_testing', 'water_testing', true), ('water_testing', 'lab_reagent_supply', false),
  -- IT and digital
  ('computers_laptops', 'computer_supply', true), ('computers_laptops', 'printer_supply', false),
  ('networking_equipment', 'networking_equipment_supply', true), ('networking_equipment', 'cctv_it_integration', false),
  ('software_licenses', 'software_licensing', true), ('software_licenses', 'it_amc', false),
  ('telecom_connectivity', 'telecom_service', true), ('telecom_connectivity', 'networking_equipment_supply', false),
  ('cctv_it_integration', 'cctv_it_integration', true), ('cctv_it_integration', 'cctv_installation', false),
  ('iot_automation', 'iot_automation', true), ('iot_automation', 'motor_control_automation', false),
  ('printers_peripherals', 'printer_supply', true), ('printers_peripherals', 'computer_supply', false),
  ('it_amc_support', 'it_amc', true), ('it_amc_support', 'computer_supply', false),
  ('web_software_development', 'software_development', true), ('web_software_development', 'iot_automation', false),
  ('data_backup', 'data_backup_service', true), ('data_backup', 'it_amc', false),
  -- Logistics
  ('local_delivery', 'local_delivery', true), ('local_delivery', 'courier_service', false),
  ('freight_transport', 'freight_transport', true), ('freight_transport', 'local_delivery', false),
  ('heavy_equipment_movement', 'heavy_equipment_transport', true), ('heavy_equipment_movement', 'freight_transport', false),
  ('warehousing', 'warehousing', true), ('warehousing', 'cold_storage', false),
  ('courier_parcel', 'courier_service', true), ('courier_parcel', 'local_delivery', false),
  ('cold_chain', 'cold_chain_transport', true), ('cold_chain', 'cold_storage', false),
  ('packers_movers', 'packers_movers', true), ('packers_movers', 'local_delivery', false),
  ('fleet_hire', 'fleet_hire', true), ('fleet_hire', 'local_delivery', false),
  ('customs_clearance', 'customs_clearance', true), ('customs_clearance', 'freight_transport', false),
  ('last_mile_delivery', 'local_delivery', true), ('last_mile_delivery', 'courier_service', false),
  -- Professional services
  ('electrician_technician', 'electrician_service', true), ('electrician_technician', 'electrical_contracting', false),
  ('plumber_technician', 'plumber_service', true), ('plumber_technician', 'plumbing_service', false),
  ('civil_consultant', 'civil_consulting', true), ('civil_consultant', 'engineering_design', false),
  ('legal_services', 'legal_service', true), ('legal_services', 'accounting_audit', false),
  ('accounting_audit', 'accounting_audit', true), ('accounting_audit', 'legal_service', false),
  ('engineering_design', 'engineering_design', true), ('engineering_design', 'civil_consulting', false),
  ('architect_services', 'architecture_service', true), ('architect_services', 'civil_consulting', false),
  ('hr_recruitment', 'hr_recruitment', true), ('hr_recruitment', 'training_service', false),
  ('training_services', 'training_service', true), ('training_services', 'hr_recruitment', false),
  ('project_management', 'project_management', true), ('project_management', 'civil_consulting', false),
  -- General
  ('general_products', 'general_product_supply', true),
  ('general_services', 'general_service', true),
  ('custom_requirement', 'custom_fulfilment', true),
  ('miscellaneous_supply', 'general_product_supply', true),
  ('other_professional', 'general_service', true)
) AS v(sub, cap, is_primary)
JOIN requirement_subcategories s ON s.code = v.sub
JOIN capabilities cp ON cp.code = v.cap;

-- ---------------------------------------------------------------------------
-- 5. Category-level attribute schemas
--
-- Inherited by every subcategory of the category. match_patterns are POSIX
-- regexes whose first capture group holds the value.
-- ---------------------------------------------------------------------------

INSERT INTO category_attribute_definitions
  (category_id, code, label, data_type, unit, is_required, options, validation,
   match_patterns, help_text, placeholder, sort_order)
SELECT c.id, v.code, v.label, v.dt::attribute_data_type, v.unit, v.req,
       v.options::jsonb, v.validation::jsonb, v.patterns, v.help, v.placeholder, v.sort
FROM (VALUES
  -- Construction & Infrastructure
  ('construction_infrastructure', 'material_grade', 'Material / grade', 'TEXT', NULL::text, false,
   '[]', '{}', ARRAY['(?:grade|grade of)\s+([a-z0-9\-]+)','\b(m\s?[123456789]0|opc\s?53|opc\s?43|fe\s?500d?|fe\s?550)\b'],
   'Grade or specification, e.g. M25, OPC 53, Fe500D', 'M25', 1),
  ('construction_infrastructure', 'dimensions', 'Dimensions / size', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['(\d+\s*(?:x|\*)\s*\d+(?:\s*(?:x|\*)\s*\d+)?\s*(?:mm|cm|ft|feet|inch|m)?)'],
   'Overall size if it matters', '600 x 600 mm', 2),
  ('construction_infrastructure', 'area', 'Area', 'NUMBER', 'SQFT', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:sq\.?\s?ft|sqft|square\s*feet)'],
   'Area to be covered', '1200', 3),
  ('construction_infrastructure', 'work_type', 'Nature of work', 'ENUM', NULL, false,
   '["New construction","Renovation","Repair","Extension","Finishing"]', '{}', ARRAY[]::text[],
   NULL, NULL, 4),
  ('construction_infrastructure', 'site_access', 'Site access', 'ENUM', NULL, false,
   '["Ground level","Upper floor with lift","Upper floor without lift","Basement","Terrace"]', '{}', ARRAY[]::text[],
   'Affects labour and material handling cost', NULL, 5),
  -- Electrical & Power
  ('electrical_power', 'capacity_kva', 'Capacity', 'NUMBER', 'KVA', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*kva'],
   'Rating in KVA where applicable', '25', 1),
  ('electrical_power', 'capacity_kw', 'Power rating', 'NUMBER', 'KW', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:kw|kilowatt)'],
   NULL, '5', 2),
  ('electrical_power', 'voltage', 'Voltage', 'ENUM', 'V', false,
   '["230V single phase","415V three phase","11kV","33kV","24V DC","48V DC"]', '{}',
   ARRAY['(\d+)\s*(?:v|volt)\b'], NULL, NULL, 3),
  ('electrical_power', 'phase', 'Phase', 'ENUM', NULL, false,
   '["Single phase","Three phase"]', '{}',
   ARRAY['\b(single\s*phase|three\s*phase|3\s*phase|1\s*phase)\b'], NULL, NULL, 4),
  ('electrical_power', 'cable_size', 'Cable size', 'TEXT', 'SQMM', false,
   '[]', '{}', ARRAY['(\d+(?:\.\d+)?)\s*(?:sq\.?\s?mm|sqmm)'],
   'Conductor cross-section', '4 sqmm', 5),
  ('electrical_power', 'installation_included', 'Installation required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(with installation|including installation|installation included)\b'],
   'Supply only, or supply and install', NULL, 6),
  -- Machinery & Engineering
  ('machinery_engineering', 'machine_type', 'Machine / equipment type', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'What machine is this for', 'CNC lathe', 1),
  ('machinery_engineering', 'make_model', 'Make & model', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'Helps suppliers quote the right spare', 'Kirloskar KDS-30', 2),
  ('machinery_engineering', 'motor_hp', 'Motor rating', 'NUMBER', 'HP', false,
   '[]', '{"min":0,"max":2000}',
   ARRAY['(\d+(?:\.\d+)?)\s*(?:hp|h\.p\.?|horse\s*power)'],
   'Rating in HP, used to match workshop capacity', '10', 3),
  ('machinery_engineering', 'material', 'Material', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(?:in|of|material)\s+(en\s?\d+|ss\s?\d+|ms|mild steel|cast iron|aluminium|brass|en8|en19|d2|hchcr)\b'],
   NULL, 'EN8', 4),
  ('machinery_engineering', 'tolerance_mm', 'Tolerance', 'NUMBER', 'MM', false,
   '[]', '{"min":0}',
   ARRAY['(?:±|\+/-|\+-|tolerance\s*(?:of)?\s*)\s*(\d+(?:\.\d+)?)\s*(?:mm|micron)?'],
   'Tightest tolerance required', '0.02', 5),
  ('machinery_engineering', 'drawing_available', 'Drawing available', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(drawing|as per drawing|drawing attached|gd&t)\b'],
   'Attach the drawing in the next step if yes', NULL, 6),
  ('machinery_engineering', 'batch_size', 'Batch size', 'NUMBER', 'PCS', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:nos|pcs|pieces|units)\b'],
   NULL, '500', 7),
  -- Industrial Supplies & Hardware
  ('industrial_supplies_hardware', 'specification', 'Specification', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'Size, grade, standard', 'M12 x 50, 8.8 grade', 1),
  ('industrial_supplies_hardware', 'brand_preference', 'Brand preference', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'Leave blank to let suppliers propose equivalents', 'Any / SKF / Bosch', 2),
  ('industrial_supplies_hardware', 'material', 'Material', 'ENUM', NULL, false,
   '["Mild steel","Stainless steel","Alloy steel","Aluminium","Brass","Plastic","Other"]', '{}',
   ARRAY[]::text[], NULL, NULL, 3),
  ('industrial_supplies_hardware', 'size', 'Size', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(m\d+(?:\s*x\s*\d+)?)\b','(\d+(?:\.\d+)?)\s*(?:mm|inch|")'],
   NULL, 'M12', 4),
  ('industrial_supplies_hardware', 'equivalent_acceptable', 'Equivalent brands acceptable', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(or equivalent|equivalent acceptable|any brand)\b'], NULL, NULL, 5),
  -- Chemicals & Process Materials
  ('chemicals_process_materials', 'chemical_name', 'Chemical / product name', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Caustic soda flakes', 1),
  ('chemicals_process_materials', 'purity_grade', 'Purity / grade', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['(\d+(?:\.\d+)?)\s*%\s*(?:purity|pure|concentration)','\b(lr grade|ar grade|technical grade|food grade|industrial grade)\b'],
   NULL, '98% technical grade', 2),
  ('chemicals_process_materials', 'packing_size', 'Packing size', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['(\d+(?:\.\d+)?)\s*(?:kg|litre|ltr|l)\s*(?:bag|drum|can|carboy|pack)'],
   NULL, '50 kg bag', 3),
  ('chemicals_process_materials', 'msds_required', 'MSDS required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(msds|safety data sheet)\b'], NULL, NULL, 4),
  ('chemicals_process_materials', 'application', 'Application', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'Where it will be used', 'Boiler water treatment', 5),
  -- Textile & Apparel
  ('textile_apparel', 'fiber_type', 'Fibre', 'ENUM', NULL, false,
   '["100% Cotton","Polyester","Poly-cotton blend","Viscose","Modal","Linen","Blended","Other"]', '{}',
   ARRAY['\b(100%\s*cotton|cotton|polyester|viscose|modal|linen|pc blend|poly cotton)\b'],
   NULL, NULL, 1),
  ('textile_apparel', 'yarn_count', 'Count', 'TEXT', 'NE', false,
   '[]', '{}', ARRAY['\b(\d+)\s*(?:s|''s)\s*(?:count|combed|carded)?\b','count\s*(\d+)'],
   'Yarn count, e.g. 40s', '40s', 2),
  ('textile_apparel', 'yarn_process', 'Process', 'ENUM', NULL, false,
   '["Combed","Carded","Compact","Open end","Ring spun"]', '{}',
   ARRAY['\b(combed|carded|compact|open end|ring spun)\b'], NULL, NULL, 3),
  ('textile_apparel', 'gsm', 'GSM', 'NUMBER', 'GSM', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*gsm'], 'Fabric weight', '180', 4),
  ('textile_apparel', 'colour', 'Colour / shade', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Navy blue, shade card attached', 5),
  ('textile_apparel', 'certification', 'Certification required', 'ENUM', NULL, false,
   '["None","GOTS","OEKO-TEX","BCI","Organic","Other"]', '{}',
   ARRAY['\b(gots|oeko\s?-?tex|bci|organic certified)\b'], NULL, NULL, 6),
  ('textile_apparel', 'lot_type', 'Lot type', 'ENUM', NULL, false,
   '["Single lot","Multiple lots","Running monthly requirement"]', '{}', ARRAY[]::text[], NULL, NULL, 7),
  -- Agriculture & Commodities
  ('agriculture_commodities', 'variety', 'Variety', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Salem / Erode local', 1),
  ('agriculture_commodities', 'quality_grade', 'Grade', 'ENUM', NULL, false,
   '["FAQ (Fair Average Quality)","Grade A","Grade B","Export quality","Organic","Ungraded"]', '{}',
   ARRAY['\b(faq|grade\s*a|grade\s*b|export quality|organic)\b'], NULL, NULL, 2),
  ('agriculture_commodities', 'moisture_percent', 'Moisture', 'NUMBER', 'PERCENT', false,
   '[]', '{"min":0,"max":100}', ARRAY['(\d+(?:\.\d+)?)\s*%\s*(?:moisture|mc)','moisture\s*(?:of|below|under|max)?\s*(\d+(?:\.\d+)?)\s*%?'],
   'Maximum acceptable moisture', '8', 3),
  ('agriculture_commodities', 'packaging_type', 'Packaging', 'ENUM', NULL, false,
   '["Loose / bulk","Gunny bag","PP woven bag","Jute bag","Carton","As per buyer"]', '{}',
   ARRAY['\b(gunny|jute bag|pp bag|loose|bulk)\b'], NULL, NULL, 4),
  ('agriculture_commodities', 'origin', 'Preferred origin', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Erode, Tamil Nadu', 5),
  ('agriculture_commodities', 'lab_report_required', 'Lab report required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(lab report|test report|coa|certificate of analysis)\b'], NULL, NULL, 6),
  -- Packaging & Printing
  ('packaging_printing', 'dimensions', 'Size', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['(\d+\s*(?:x|\*)\s*\d+(?:\s*(?:x|\*)\s*\d+)?\s*(?:mm|cm|inch)?)'],
   'Length x width x height', '300 x 200 x 150 mm', 1),
  ('packaging_printing', 'ply_thickness', 'Ply / thickness', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(\d)\s*ply\b','(\d+(?:\.\d+)?)\s*(?:micron|gsm)'], NULL, '5 ply', 2),
  ('packaging_printing', 'printing_colours', 'Printing colours', 'NUMBER', NULL, false,
   '[]', '{"min":0,"max":12}', ARRAY['(\d+)\s*colou?r'], NULL, '2', 3),
  ('packaging_printing', 'material_type', 'Material', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Kraft paper 180 GSM', 4),
  ('packaging_printing', 'artwork_ready', 'Artwork ready', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(artwork ready|artwork available|design ready)\b'], NULL, NULL, 5),
  -- Property & Facility Management
  ('property_facility_management', 'property_type', 'Property type', 'ENUM', NULL, false,
   '["Apartment complex","Independent house","Commercial building","Factory","Office","Retail","Institution"]', '{}',
   ARRAY['\b(apartment|flat|villa|factory|office|shop|school|hospital)\b'], NULL, NULL, 1),
  ('property_facility_management', 'built_up_area', 'Built-up area', 'NUMBER', 'SQFT', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:sq\.?\s?ft|sqft)'], NULL, '45000', 2),
  ('property_facility_management', 'unit_count', 'Number of units / flats', 'NUMBER', NULL, false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:flats|units|apartments|houses)'], NULL, '96', 3),
  ('property_facility_management', 'service_frequency', 'Frequency', 'ENUM', NULL, false,
   '["One time","Daily","Weekly","Fortnightly","Monthly","Quarterly","Half yearly","Yearly"]', '{}',
   ARRAY['\b(daily|weekly|fortnightly|monthly|quarterly|half yearly|yearly|one time)\b'], NULL, NULL, 4),
  ('property_facility_management', 'manpower_count', 'Manpower required', 'NUMBER', NULL, false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:persons|people|staff|workers|guards|housekeeping staff)'], NULL, '4', 5),
  ('property_facility_management', 'contract_months', 'Contract duration', 'NUMBER', 'MONTHS', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:month|months|year|years)\s*(?:contract|amc)?'], NULL, '12', 6),
  ('property_facility_management', 'materials_included', 'Materials included in scope', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(with material|material included|inclusive of material)\b'], NULL, NULL, 7),
  -- Safety & Security
  ('safety_security', 'quantity_points', 'Number of points / devices', 'NUMBER', NULL, false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:cameras|points|devices|extinguishers|units)'], NULL, '16', 1),
  ('safety_security', 'coverage_area', 'Coverage area', 'NUMBER', 'SQFT', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:sq\.?\s?ft|sqft)'], NULL, '20000', 2),
  ('safety_security', 'specification', 'Specification', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['(\d+)\s*mp\b'], NULL, '4MP IP dome, 30 day storage', 3),
  ('safety_security', 'compliance_standard', 'Compliance standard', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(is\s?\d+|nbc|tac approved|bis)\b'],
   'Statutory or insurer standard to satisfy', 'IS 2190 / TAC', 4),
  ('safety_security', 'installation_included', 'Installation required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(with installation|installation included)\b'], NULL, NULL, 5),
  -- Water & Environmental Solutions
  ('water_environmental', 'motor_hp', 'Motor rating', 'NUMBER', 'HP', false,
   '[]', '{"min":0,"max":500}',
   ARRAY['(\d+(?:\.\d+)?)\s*(?:hp|h\.p\.?|horse\s*power)'],
   'Rating in HP. Used to match workshop capacity.', '10', 1),
  ('water_environmental', 'pump_type', 'Pump / motor type', 'ENUM', NULL, false,
   '["Submersible","Openwell","Monoblock","Jet pump","Centrifugal","Not sure"]', '{}',
   ARRAY['\b(submersible|openwell|open well|monoblock|jet pump|centrifugal)\b'], NULL, NULL, 2),
  ('water_environmental', 'phase', 'Phase', 'ENUM', NULL, false,
   '["Single phase","Three phase","Not sure"]', '{}',
   ARRAY['\b(single\s*phase|three\s*phase|3\s*phase|1\s*phase)\b'], NULL, NULL, 3),
  ('water_environmental', 'depth_ft', 'Depth', 'NUMBER', 'FT', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:ft|feet|foot)\s*(?:deep|depth)?','depth\s*(?:of)?\s*(\d+)'],
   'Borewell or installation depth', '400', 4),
  ('water_environmental', 'capacity_lph', 'Capacity', 'NUMBER', 'LPH', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:lph|litres per hour|kld)'],
   'Plant capacity where applicable', '1000', 5),
  ('water_environmental', 'tank_capacity_l', 'Tank capacity', 'NUMBER', 'L', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:,\d+)?)\s*(?:litre|litres|ltr|l)\s*(?:tank|sump)'], NULL, '20000', 6),
  ('water_environmental', 'water_source', 'Water source', 'ENUM', NULL, false,
   '["Borewell","Corporation supply","Tanker","Open well","Mixed"]', '{}', ARRAY[]::text[], NULL, NULL, 7),
  -- IT, Electronics & Digital
  ('it_electronics_digital', 'specification', 'Specification', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(i[357]|ryzen\s?[357])\b','(\d+)\s*gb\s*(?:ram)?'],
   NULL, 'i5 12th gen, 16GB, 512GB SSD', 1),
  ('it_electronics_digital', 'user_count', 'Users / licences', 'NUMBER', NULL, false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:users|licences|licenses|seats)'], NULL, '25', 2),
  ('it_electronics_digital', 'duration_months', 'Duration', 'NUMBER', 'MONTHS', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:month|months|year|years)'], NULL, '12', 3),
  ('it_electronics_digital', 'support_required', 'Support level', 'ENUM', NULL, false,
   '["None","Business hours","24x7","Onsite","Remote only"]', '{}',
   ARRAY['\b(24x7|24\*7|onsite|remote support)\b'], NULL, NULL, 4),
  ('it_electronics_digital', 'existing_setup', 'Existing setup to integrate with', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Existing Hikvision NVR', 5),
  -- Logistics & Transportation
  ('logistics_transportation', 'pickup_location', 'Pickup location', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['from\s+([a-z\s]+?)\s+to\s'], NULL, 'Coimbatore', 1),
  ('logistics_transportation', 'drop_location', 'Drop location', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\bto\s+([a-z\s]+?)(?:\s|$|,|\.)'], NULL, 'Chennai', 2),
  ('logistics_transportation', 'load_weight', 'Load weight', 'NUMBER', 'MT', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:mt|ton|tonne|tons)'], NULL, '9', 3),
  ('logistics_transportation', 'vehicle_type', 'Vehicle type', 'ENUM', NULL, false,
   '["Two wheeler","Three wheeler","Tempo / LCV","Truck 6 wheeler","Truck 10 wheeler","Trailer","Container","Reefer","Any"]', '{}',
   ARRAY['\b(tempo|lcv|truck|trailer|container|reefer|ace|407|tata 709)\b'], NULL, NULL, 4),
  ('logistics_transportation', 'material_description', 'Material being moved', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Packed yarn bags', 5),
  ('logistics_transportation', 'loading_unloading', 'Loading / unloading in scope', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(with loading|loading unloading|labour included)\b'], NULL, NULL, 6),
  -- Professional & Skilled Services
  ('professional_skilled_services', 'scope_summary', 'Scope', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'What exactly is to be delivered', 'Structural stability certificate', 1),
  ('professional_skilled_services', 'engagement_type', 'Engagement type', 'ENUM', NULL, false,
   '["One time","Retainer","Per visit","Per project","Hourly"]', '{}',
   ARRAY['\b(one time|retainer|per visit|hourly|per project)\b'], NULL, NULL, 2),
  ('professional_skilled_services', 'duration_months', 'Duration', 'NUMBER', 'MONTHS', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:month|months|year|years)'], NULL, '3', 3),
  ('professional_skilled_services', 'qualification_required', 'Qualification / registration required', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(licensed|certified|registered|chartered|ca|cs|ce)\b'], NULL, 'Licensed structural engineer', 4),
  ('professional_skilled_services', 'deliverable_format', 'Deliverable', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['\b(report|certificate|drawing|dwg|pdf|audit)\b'], NULL, 'Signed report + drawings', 5),
  -- General / Other
  ('general_other', 'specification', 'Specification', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], 'Describe what you need as precisely as you can', NULL, 1),
  ('general_other', 'brand_preference', 'Brand preference', 'TEXT', NULL, false,
   '[]', '{}', ARRAY[]::text[], NULL, 'Any', 2)
) AS v(cat, code, label, dt, unit, req, options, validation, patterns, help, placeholder, sort)
JOIN requirement_categories c ON c.code = v.cat;

-- ---------------------------------------------------------------------------
-- 6. Subcategory-level attribute schemas
--
-- Only where a subcategory genuinely needs a field its siblings do not.
-- ---------------------------------------------------------------------------

INSERT INTO category_attribute_definitions
  (subcategory_id, code, label, data_type, unit, is_required, options, validation,
   match_patterns, help_text, placeholder, sort_order)
SELECT s.id, v.code, v.label, v.dt::attribute_data_type, v.unit, v.req,
       v.options::jsonb, v.validation::jsonb, v.patterns, v.help, v.placeholder, v.sort
FROM (VALUES
  ('motor_rewinding', 'winding_type', 'Winding type', 'ENUM', NULL::text, false,
   '["Copper","Aluminium","As original"]', '{}',
   ARRAY['\b(copper|aluminium|aluminum)\s*(?:winding|wire)?\b'],
   'Copper costs more and lasts longer', NULL, 20),
  ('motor_rewinding', 'failure_symptom', 'What happened', 'ENUM', NULL, false,
   '["Burnt / smoking","Not starting","Tripping repeatedly","Low output","Water ingress","Unknown"]', '{}',
   ARRAY['\b(burnt|burn|smoking|not starting|tripping|water)\b'], NULL, NULL, 21),
  ('motor_rewinding', 'pickup_required', 'Pickup and drop required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(pickup|pick up|collect|transport included)\b'], NULL, NULL, 22),
  ('borewell_drilling', 'casing_required', 'Casing pipe required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(casing|pvc casing|ms casing)\b'], NULL, NULL, 20),
  ('borewell_drilling', 'bore_diameter_mm', 'Bore diameter', 'NUMBER', 'MM', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*mm\s*(?:bore|dia|diameter)'], NULL, '150', 21),
  ('cnc_machining', 'operations', 'Operations required', 'MULTI_ENUM', NULL, false,
   '["Turning","Milling","Drilling","Boring","Threading","Grinding","Tapping","Deburring"]', '{}',
   ARRAY['\b(turning|milling|drilling|boring|threading|grinding|tapping)\b'], NULL, NULL, 20),
  ('cnc_machining', 'surface_finish', 'Surface finish', 'TEXT', NULL, false,
   '[]', '{}', ARRAY['ra\s*(\d+(?:\.\d+)?)'], NULL, 'Ra 1.6', 21),
  ('cnc_machining', 'inspection_report', 'Inspection report required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(inspection report|cmm report|dimension report)\b'], NULL, NULL, 22),
  ('cotton_yarn', 'twist_direction', 'Twist', 'ENUM', NULL, false,
   '["S twist","Z twist","Any"]', '{}', ARRAY['\b([sz])\s*twist\b'], NULL, NULL, 20),
  ('cotton_yarn', 'package_type', 'Package', 'ENUM', NULL, false,
   '["Cone","Hank","Cheese","Bobbin"]', '{}', ARRAY['\b(cone|hank|cheese|bobbin)\b'], NULL, NULL, 21),
  ('turmeric', 'curcumin_percent', 'Curcumin content', 'NUMBER', 'PERCENT', false,
   '[]', '{"min":0,"max":100}',
   ARRAY['(\d+(?:\.\d+)?)\s*%\s*curcumin','curcumin\s*(?:of|above|min)?\s*(\d+(?:\.\d+)?)\s*%?'],
   'Higher curcumin commands a premium', '3', 20),
  ('turmeric', 'form', 'Form', 'ENUM', NULL, false,
   '["Whole finger","Bulb","Powder","Polished finger"]', '{}',
   ARRAY['\b(finger|bulb|powder|polished)\b'], NULL, NULL, 21),
  ('housekeeping_cleaning', 'shift_pattern', 'Shift pattern', 'ENUM', NULL, false,
   '["Morning only","Full day","Two shifts","Round the clock"]', '{}',
   ARRAY['\b(morning|full day|two shift|round the clock|24 hours)\b'], NULL, NULL, 20),
  ('security_manpower', 'shift_pattern', 'Shift pattern', 'ENUM', NULL, false,
   '["8 hour single shift","12 hour single shift","Two shifts","Round the clock"]', '{}',
   ARRAY['\b(8 hour|12 hour|two shift|round the clock|24 hours)\b'], NULL, NULL, 20),
  ('security_manpower', 'armed_required', 'Armed guard required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(armed|gunman)\b'], NULL, NULL, 21),
  ('lift_amc', 'lift_count', 'Number of lifts', 'NUMBER', NULL, false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:lifts|elevators)'], NULL, '2', 20),
  ('lift_amc', 'amc_type', 'AMC type', 'ENUM', NULL, false,
   '["Comprehensive","Non-comprehensive","Semi-comprehensive"]', '{}',
   ARRAY['\b(comprehensive|non comprehensive|semi comprehensive)\b'], NULL, NULL, 21),
  ('fire_extinguisher_amc', 'extinguisher_types', 'Extinguisher types', 'MULTI_ENUM', NULL, false,
   '["ABC dry powder","CO2","Water CO2","Foam","Clean agent"]', '{}',
   ARRAY['\b(abc|co2|foam|water co2|clean agent)\b'], NULL, NULL, 20),
  ('solar_pv', 'system_kw', 'System size', 'NUMBER', 'KW', false,
   '[]', '{"min":0}', ARRAY['(\d+(?:\.\d+)?)\s*(?:kw|kwp)'], NULL, '10', 20),
  ('solar_pv', 'mounting_type', 'Mounting', 'ENUM', NULL, false,
   '["Rooftop RCC","Rooftop metal sheet","Ground mount","Elevated structure"]', '{}',
   ARRAY['\b(rooftop|ground mount|elevated)\b'], NULL, NULL, 21),
  ('dg_sets', 'fuel_tank_hours', 'Fuel tank backup', 'NUMBER', 'HOURS', false,
   '[]', '{"min":0}', ARRAY['(\d+)\s*(?:hour|hours|hrs)\s*(?:backup|tank)'], NULL, '8', 20),
  ('web_software_development', 'platform', 'Platform', 'MULTI_ENUM', NULL, false,
   '["Website","Web application","Android","iOS","Desktop","API only"]', '{}',
   ARRAY['\b(website|web app|android|ios|mobile app|api)\b'], NULL, NULL, 20),
  ('freight_transport', 'trip_type', 'Trip type', 'ENUM', NULL, false,
   '["One way","Round trip","Multi drop","Regular monthly"]', '{}',
   ARRAY['\b(one way|round trip|multi drop|regular)\b'], NULL, NULL, 20),
  ('civil_consultant', 'certificate_required', 'Certificate required', 'BOOLEAN', NULL, false,
   '[]', '{}', ARRAY['\b(certificate|stability certificate|noc)\b'], NULL, NULL, 20)
) AS v(sub, code, label, dt, unit, req, options, validation, patterns, help, placeholder, sort)
JOIN requirement_subcategories s ON s.code = v.sub;

-- ---------------------------------------------------------------------------
-- 7. Evaluation criteria catalog
-- ---------------------------------------------------------------------------

INSERT INTO evaluation_criteria (code, name, description, direction, value_source, sort_order) VALUES
  ('price', 'Price', 'Total landed cost including tax and transport',
   'LOWER_IS_BETTER', 'total_cost', 1),
  ('delivery_time', 'Delivery time', 'Days to deliver or complete',
   'LOWER_IS_BETTER', 'delivery_days', 2),
  ('warranty', 'Warranty', 'Warranty or guarantee period offered',
   'HIGHER_IS_BETTER', 'warranty_months', 3),
  ('supplier_rating', 'Supplier rating', 'Average rating from completed work on the platform',
   'HIGHER_IS_BETTER', 'supplier_rating', 4),
  ('on_time_record', 'On-time record', 'Share of past jobs delivered on or before the promised date',
   'HIGHER_IS_BETTER', 'on_time_percent', 5),
  ('experience', 'Experience', 'Number of comparable jobs completed',
   'HIGHER_IS_BETTER', 'completed_jobs', 6),
  ('payment_terms', 'Payment terms', 'Credit period offered',
   'HIGHER_IS_BETTER', 'payment_terms_days', 7),
  ('response_time', 'Response time', 'Hours to respond to a service call',
   'LOWER_IS_BETTER', 'response_time_hours', 8),
  ('technical_fit', 'Technical fit', 'How closely the offer matches the technical specification',
   'HIGHER_IS_BETTER', 'technical_fit', 9),
  ('certification', 'Certification', 'Required certification or test report provided',
   'HIGHER_IS_BETTER', 'certification', 10),
  ('dispute_history', 'Dispute history', 'Share of past jobs that ended in dispute',
   'LOWER_IS_BETTER', 'dispute_rate', 11);

-- ---------------------------------------------------------------------------
-- 8. Suggested starting weights
--
-- Derived from the subcategory's default mode rather than hand-written 145
-- times, then overridden where a specific market really behaves differently.
-- These are only the pre-filled starting point: the buyer owns the final set.
-- ---------------------------------------------------------------------------

INSERT INTO subcategory_evaluation_suggestions (subcategory_id, criterion_id, weight)
SELECT s.id, c.id, v.weight
FROM requirement_subcategories s
JOIN (VALUES
  -- Goods: price and lead time dominate, some weight on who is reliable.
  ('PRODUCT_MATERIAL', 'price', 45), ('PRODUCT_MATERIAL', 'delivery_time', 25),
  ('PRODUCT_MATERIAL', 'supplier_rating', 15), ('PRODUCT_MATERIAL', 'warranty', 15),
  ('COMMODITY_TRADING', 'price', 50), ('COMMODITY_TRADING', 'delivery_time', 20),
  ('COMMODITY_TRADING', 'certification', 15), ('COMMODITY_TRADING', 'supplier_rating', 15),
  -- Services and repairs: workmanship and warranty matter more than the last rupee.
  ('SERVICE', 'price', 35), ('SERVICE', 'warranty', 20),
  ('SERVICE', 'supplier_rating', 20), ('SERVICE', 'delivery_time', 15),
  ('SERVICE', 'response_time', 10),
  ('REPAIR_MAINTENANCE', 'price', 30), ('REPAIR_MAINTENANCE', 'warranty', 30),
  ('REPAIR_MAINTENANCE', 'supplier_rating', 20), ('REPAIR_MAINTENANCE', 'delivery_time', 20),
  ('JOB_WORK', 'price', 35), ('JOB_WORK', 'technical_fit', 25),
  ('JOB_WORK', 'delivery_time', 20), ('JOB_WORK', 'supplier_rating', 20),
  -- Projects: capability and track record outweigh price.
  ('PROJECT_CONTRACT', 'price', 30), ('PROJECT_CONTRACT', 'technical_fit', 25),
  ('PROJECT_CONTRACT', 'experience', 20), ('PROJECT_CONTRACT', 'delivery_time', 15),
  ('PROJECT_CONTRACT', 'supplier_rating', 10),
  ('AMC', 'price', 30), ('AMC', 'response_time', 25),
  ('AMC', 'supplier_rating', 20), ('AMC', 'on_time_record', 15), ('AMC', 'certification', 10),
  ('RENTAL_HIRE', 'price', 40), ('RENTAL_HIRE', 'delivery_time', 25),
  ('RENTAL_HIRE', 'supplier_rating', 20), ('RENTAL_HIRE', 'response_time', 15),
  ('LOGISTICS', 'price', 40), ('LOGISTICS', 'delivery_time', 30),
  ('LOGISTICS', 'on_time_record', 20), ('LOGISTICS', 'supplier_rating', 10),
  ('PROFESSIONAL_SERVICE', 'price', 30), ('PROFESSIONAL_SERVICE', 'technical_fit', 30),
  ('PROFESSIONAL_SERVICE', 'experience', 25), ('PROFESSIONAL_SERVICE', 'supplier_rating', 15),
  ('OTHER', 'price', 40), ('OTHER', 'delivery_time', 30), ('OTHER', 'supplier_rating', 30)
) AS v(mode, criterion, weight) ON v.mode = s.default_requirement_mode::text
JOIN evaluation_criteria c ON c.code = v.criterion;

-- Market-specific overrides where the default mode profile is a poor fit.
-- Cleared first so an override replaces the mode-derived set instead of
-- adding to it.
DELETE FROM subcategory_evaluation_suggestions
WHERE subcategory_id IN (
  SELECT id FROM requirement_subcategories
  WHERE code IN ('motor_rewinding', 'turmeric', 'cnc_machining', 'cotton_yarn',
                 'lift_amc', 'borewell_drilling')
);

INSERT INTO subcategory_evaluation_suggestions (subcategory_id, criterion_id, weight)
SELECT s.id, c.id, v.weight
FROM (VALUES
  -- A rewound motor that fails again costs far more than the price difference.
  ('motor_rewinding', 'warranty', 35), ('motor_rewinding', 'price', 25),
  ('motor_rewinding', 'supplier_rating', 25), ('motor_rewinding', 'delivery_time', 15),
  -- Turmeric is graded produce: assay and moisture drive real value.
  ('turmeric', 'price', 40), ('turmeric', 'certification', 25),
  ('turmeric', 'supplier_rating', 20), ('turmeric', 'delivery_time', 15),
  -- Precision machining: tolerance capability first, price second.
  ('cnc_machining', 'technical_fit', 35), ('cnc_machining', 'price', 25),
  ('cnc_machining', 'delivery_time', 20), ('cnc_machining', 'supplier_rating', 20),
  -- Yarn is a commodity with strict shade and count consistency.
  ('cotton_yarn', 'price', 45), ('cotton_yarn', 'technical_fit', 20),
  ('cotton_yarn', 'delivery_time', 20), ('cotton_yarn', 'supplier_rating', 15),
  -- Lift AMC: response time is a safety matter.
  ('lift_amc', 'response_time', 30), ('lift_amc', 'price', 25),
  ('lift_amc', 'supplier_rating', 25), ('lift_amc', 'certification', 20),
  -- Borewell drilling is irreversible; experience outweighs price.
  ('borewell_drilling', 'experience', 30), ('borewell_drilling', 'price', 30),
  ('borewell_drilling', 'supplier_rating', 25), ('borewell_drilling', 'delivery_time', 15)
) AS v(sub, criterion, weight)
JOIN requirement_subcategories s ON s.code = v.sub
JOIN evaluation_criteria c ON c.code = v.criterion;

-- ---------------------------------------------------------------------------
-- 8. Integrity check
--
-- A required attribute code that resolves to nothing would make the intake
-- wizard demand a field it cannot render, so fail the migration instead.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  orphans text;
BEGIN
  SELECT string_agg(s.code || '.' || c.code, ', ' ORDER BY s.code, c.code)
  INTO orphans
  FROM requirement_subcategories s
  CROSS JOIN LATERAL unnest(s.required_attribute_codes) AS c(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.subcategory_attribute_schema(s.id) a WHERE a.code = c.code
  );

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'required_attribute_codes reference undefined attributes: %', orphans;
  END IF;
END;
$$;

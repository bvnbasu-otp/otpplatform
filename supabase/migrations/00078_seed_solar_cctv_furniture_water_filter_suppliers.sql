-- 00078_seed_solar_cctv_furniture_water_filter_suppliers.sql
-- Seed multiple competitive, verified Indian suppliers for Solar, CCTV, Furniture, and Water Filter domains.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create Temporary Table for 16 Specialized Suppliers
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tmp_new_suppliers (
  supplier_id   uuid PRIMARY KEY,
  auth_id       uuid NOT NULL,
  profile_id    uuid NOT NULL,
  email         text NOT NULL,
  full_name     text NOT NULL,
  business_name text NOT NULL,
  categories    text[] NOT NULL,
  capabilities  jsonb NOT NULL,
  address       jsonb NOT NULL,
  phone         text NOT NULL,
  rating        numeric(3, 2) NOT NULL,
  source        supplier_source NOT NULL DEFAULT 'DIRECT'
) ON COMMIT DROP;

INSERT INTO tmp_new_suppliers (
  supplier_id, auth_id, profile_id, email, full_name, business_name,
  categories, capabilities, address, phone, rating, source
) VALUES
  -- =========================================================================
  -- ☀️ SOLAR SUPPLIERS (4 Suppliers)
  -- =========================================================================
  (
    '0d500000-0000-4000-8000-000000000301',
    '0dc00000-0000-4000-8000-000000000301',
    '0db00000-0000-4000-8000-000000000301',
    'solar01@otpdemo.test',
    'SunPower Tech Lead',
    'SunPower Tech Rooftop Solar & EPC Pvt Ltd',
    ARRAY['electrical_power', 'construction_infrastructure'],
    '{"solar_panels": true, "rooftop_solar": true, "solar_pv": true, "on_grid_solar_kw": "5 - 500 KW", "solar_inverter_battery": true, "net_metering_approval": true, "solar_amc": true}'::jsonb,
    '{"full": "Plot 45, SIDCO Industrial Estate, Kurichi, Coimbatore 641021", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11201',
    4.85,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000302',
    '0dc00000-0000-4000-8000-000000000302',
    '0db00000-0000-4000-8000-000000000302',
    'solar02@otpdemo.test',
    'Aditya Solar Manager',
    'Aditya Solar Energy & Hybrid Inverters',
    ARRAY['electrical_power', 'property_facility_management'],
    '{"solar_panels": true, "rooftop_solar": true, "solar_pv": true, "hybrid_solar_inverters": true, "lithium_battery_backup": true, "solar_water_heaters": true}'::jsonb,
    '{"full": "120, Mount Road, Guindy Industrial Estate, Chennai 600032", "city": "Chennai", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11202',
    4.78,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000303',
    '0dc00000-0000-4000-8000-000000000303',
    '0db00000-0000-4000-8000-000000000303',
    'solar03@otpdemo.test',
    'EcoGreen EPC Director',
    'EcoGreen Renewable Solar Panels & EPC Infra',
    ARRAY['electrical_power', 'construction_infrastructure'],
    '{"solar_panels": true, "rooftop_solar": true, "solar_pv": true, "bifacial_mono_perc_panels": true, "industrial_rooftop_mw": true, "mnre_approved": true}'::jsonb,
    '{"full": "88, Peenya Industrial Area 3rd Phase, Bengaluru 560058", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11203',
    4.90,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000304',
    '0dc00000-0000-4000-8000-000000000304',
    '0db00000-0000-4000-8000-000000000304',
    'solar04@otpdemo.test',
    'Surya Shakti Contracts',
    'Surya Shakti Commercial Solar & Water Heaters',
    ARRAY['electrical_power', 'property_facility_management'],
    '{"solar_panels": true, "rooftop_solar": true, "solar_pv": true, "solar_water_heaters_lpd": "500 - 5000 LPD", "heat_pumps": true, "solar_street_lights": true}'::jsonb,
    '{"full": "14, Avinashi Road, Peelamedu, Coimbatore 641004", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11204',
    4.72,
    'BNI'
  ),

  -- =========================================================================
  -- 📹 CCTV & ELECTRONIC SECURITY SUPPLIERS (4 Suppliers)
  -- =========================================================================
  (
    '0d500000-0000-4000-8000-000000000311',
    '0dc00000-0000-4000-8000-000000000311',
    '0db00000-0000-4000-8000-000000000311',
    'cctv01@otpdemo.test',
    'SecureVision Sales',
    'SecureVision CCTV & IP Surveillance Systems',
    ARRAY['safety_security', 'it_electronics_digital'],
    '{"cctv_surveillance": true, "cctv_installation": true, "cctv_ip_cameras": true, "nvr_dvr_setup": true, "4k_bullet_dome_cameras": true, "optical_fiber_cabling": true, "cctv_amc": true}'::jsonb,
    '{"full": "55, 100ft Road, Gandhipuram, Coimbatore 641012", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11211',
    4.88,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000312',
    '0dc00000-0000-4000-8000-000000000312',
    '0db00000-0000-4000-8000-000000000312',
    'cctv02@otpdemo.test',
    'Falcon Eye Operations',
    'Falcon Eye Electronic Security & Biometrics',
    ARRAY['safety_security', 'property_facility_management'],
    '{"cctv_surveillance": true, "cctv_installation": true, "ai_face_recognition_cctv": true, "biometric_rfid_access_control": true, "boom_barriers_anpr": true, "ptz_cameras": true}'::jsonb,
    '{"full": "210, OMR IT Expressway, Thoraipakkam, Chennai 600097", "city": "Chennai", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11212',
    4.80,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000313',
    '0dc00000-0000-4000-8000-000000000313',
    '0db00000-0000-4000-8000-000000000313',
    'cctv03@otpdemo.test',
    'Optima Guard Lead',
    'Optima Guard Integrated Security & Network CCTV',
    ARRAY['safety_security', 'it_electronics_digital'],
    '{"cctv_surveillance": true, "cctv_installation": true, "ip_surveillance_network": true, "video_wall_command_center": true, "perimeter_security_intrusion": true, "cloud_storage_cctv": true}'::jsonb,
    '{"full": "32, Electronic City Phase 1, Hosur Road, Bengaluru 560100", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11213',
    4.75,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000314',
    '0dc00000-0000-4000-8000-000000000314',
    '0db00000-0000-4000-8000-000000000314',
    'cctv04@otpdemo.test',
    'Sentinel Security Manager',
    'Sentinel Surveillance & RWA Access Controls',
    ARRAY['safety_security', 'property_facility_management'],
    '{"cctv_surveillance": true, "cctv_installation": true, "apartment_gated_community_cctv": true, "intercom_vdp_integration": true, "night_vision_colorvu_cameras": true}'::jsonb,
    '{"full": "78, Mettupalayam Road, R.S. Puram, Coimbatore 641002", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11214',
    4.82,
    'BNI'
  ),

  -- =========================================================================
  -- 🪑 FURNITURE & WORKSTATION SUPPLIERS (4 Suppliers)
  -- =========================================================================
  (
    '0d500000-0000-4000-8000-000000000321',
    '0dc00000-0000-4000-8000-000000000321',
    '0db00000-0000-4000-8000-000000000321',
    'furniture01@otpdemo.test',
    'Classic Interiors Lead',
    'Classic Interiors & Modular Workstations',
    ARRAY['furniture_fixtures', 'construction_infrastructure'],
    '{"office_furniture_workstations": true, "modular_cubicles": true, "ergonomic_mesh_chairs": true, "conference_tables": true, "executive_cabin_desks": true, "soundproof_phone_booths": true}'::jsonb,
    '{"full": "108, Trichy Road, Singanallur, Coimbatore 641005", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11221',
    4.86,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000322',
    '0dc00000-0000-4000-8000-000000000322',
    '0db00000-0000-4000-8000-000000000322',
    'furniture02@otpdemo.test',
    'ErgoDesign Sales Lead',
    'ErgoDesign Office Furniture & Ergonomic Chairs',
    ARRAY['furniture_fixtures', 'property_facility_management'],
    '{"office_furniture_workstations": true, "bifma_certified_chairs": true, "height_adjustable_standing_desks": true, "linear_workstation_clusters": true, "breakout_zone_couches": true}'::jsonb,
    '{"full": "64, Anna Salai, Teynampet, Chennai 600018", "city": "Chennai", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11222',
    4.92,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000323',
    '0dc00000-0000-4000-8000-000000000323',
    '0db00000-0000-4000-8000-000000000323',
    'furniture03@otpdemo.test',
    'WoodCraft Commercial Rep',
    'WoodCraft Executive Desks & Boardroom Suites',
    ARRAY['furniture_fixtures', 'construction_infrastructure'],
    '{"office_furniture_workstations": true, "veneer_boardroom_tables": true, "leather_executive_chairs": true, "reception_desks_credenzas": true, "acoustic_wall_paneling": true}'::jsonb,
    '{"full": "15, Bannerghatta Main Road, JP Nagar, Bengaluru 560076", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11223',
    4.79,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000324',
    '0dc00000-0000-4000-8000-000000000324',
    '0db00000-0000-4000-8000-000000000324',
    'furniture04@otpdemo.test',
    'SteelForm Operations',
    'SteelForm Commercial Storage & Compact Shelving',
    ARRAY['furniture_fixtures', 'machinery_engineering'],
    '{"office_furniture_workstations": true, "metal_storage_almirahs": true, "heavy_duty_compactors": true, "industrial_lockers": true, "library_book_stacks": true}'::jsonb,
    '{"full": "90, Ganapathy Industrial Estate, Coimbatore 641006", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11224',
    4.74,
    'BNI'
  ),

  -- =========================================================================
  -- 💧 WATER FILTER & RO PURIFICATION SUPPLIERS (4 Suppliers)
  -- =========================================================================
  (
    '0d500000-0000-4000-8000-000000000331',
    '0dc00000-0000-4000-8000-000000000331',
    '0db00000-0000-4000-8000-000000000331',
    'water01@otpdemo.test',
    'PureAqua Tech Lead',
    'PureAqua Commercial RO & Water Filter Solutions',
    ARRAY['water_environmental', 'property_facility_management'],
    '{"water_treatment_plant": true, "commercial_ro_plants_lph": "250 - 5000 LPH", "water_softener_plants": true, "uv_uf_filtration": true, "cartridge_membrane_replacements": true, "water_filter_amc": true}'::jsonb,
    '{"full": "104, 100ft Intermediate Ring Road, Koramangala, Bangalore 560047", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11231',
    4.89,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000332',
    '0dc00000-0000-4000-8000-000000000332',
    '0db00000-0000-4000-8000-000000000332',
    'water02@otpdemo.test',
    'HydroClear Specialist',
    'HydroClear Industrial Water Filtration & Softeners',
    ARRAY['water_environmental', 'construction_infrastructure'],
    '{"water_treatment_plant": true, "multi_grade_sand_filters": true, "activated_carbon_filters": true, "automatic_water_softeners": true, "iron_arsenic_removal_filters": true, "industrial_dm_plants": true}'::jsonb,
    '{"full": "42, Peenya Industrial Area 2nd Stage, Bangalore 560058", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11232',
    4.81,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000333',
    '0dc00000-0000-4000-8000-000000000333',
    '0db00000-0000-4000-8000-000000000333',
    'water03@otpdemo.test',
    'Zenith Water Engineer',
    'Zenith Water Systems & UV Purifiers',
    ARRAY['water_environmental', 'property_facility_management'],
    '{"water_treatment_plant": true, "institutional_water_coolers_ro": true, "cartridge_membrane_replacements": true, "apartment_wtp_filters": true, "drinking_water_purification": true}'::jsonb,
    '{"full": "28, Race Course Road, Coimbatore 641018", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11233',
    4.76,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000334',
    '0dc00000-0000-4000-8000-000000000334',
    '0db00000-0000-4000-8000-000000000334',
    'water04@otpdemo.test',
    'AquaPure Projects Lead',
    'AquaPure Commercial WTP & RO Plants',
    ARRAY['water_environmental', 'construction_infrastructure'],
    '{"water_treatment_plant": true, "industrial_ro_plants": true, "effluent_treatment_stp_wtp": true, "reverse_osmosis_membranes": true, "dosing_pumps_chemicals": true}'::jsonb,
    '{"full": "72, Ambattur Industrial Estate, Chennai 600058", "city": "Chennai", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11234',
    4.84,
    'BNI'
  );

-- ---------------------------------------------------------------------------
-- 2. Insert or Update Auth Users (Password: "password")
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  s.auth_id, 'authenticated', 'authenticated', s.email,
  extensions.crypt('password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', ''
FROM tmp_new_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = now();

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
)
SELECT
  s.auth_id::text, s.auth_id,
  jsonb_build_object('sub', s.auth_id::text, 'email', s.email),
  'email', now(), now(), now(), gen_random_uuid()
FROM tmp_new_suppliers s
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Profiles
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin)
SELECT s.profile_id, s.auth_id, s.email, s.full_name, false
FROM tmp_new_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name;

-- ---------------------------------------------------------------------------
-- 4. Suppliers
-- ---------------------------------------------------------------------------

INSERT INTO public.suppliers (
  id, business_name, source, status, categories, capabilities,
  address, contact_phone, contact_email, rating_avg, created_at, updated_at
)
SELECT
  s.supplier_id, s.business_name, s.source, 'ACTIVE'::supplier_status, s.categories, s.capabilities,
  s.address, s.phone, s.email, s.rating, now(), now()
FROM tmp_new_suppliers s
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  source = EXCLUDED.source,
  status = 'ACTIVE'::supplier_status,
  categories = EXCLUDED.categories,
  capabilities = EXCLUDED.capabilities,
  address = EXCLUDED.address,
  contact_phone = EXCLUDED.contact_phone,
  contact_email = EXCLUDED.contact_email,
  rating_avg = EXCLUDED.rating_avg;

-- ---------------------------------------------------------------------------
-- 5. Supplier Users Linking
-- ---------------------------------------------------------------------------

INSERT INTO public.supplier_users (id, supplier_id, profile_id, role, created_at)
SELECT gen_random_uuid(), s.supplier_id, s.profile_id, 'OWNER'::supplier_user_role, now()
FROM tmp_new_suppliers s
ON CONFLICT (supplier_id, profile_id) DO NOTHING;

COMMIT;

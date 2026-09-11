-- Migration 00111: Standardize Verified Domain Suppliers (01-04 per Domain) & Guaranteed Active Logins
-- Ensures that only the verified active 01-04 suppliers per domain are matched during discovery,
-- and all supplier accounts (including UrbanSpace, Royal Teak, SocietyComfort, and 01-04 series)
-- have guaranteed active auth credentials with password "password".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ensure all 01-04 Verified Suppliers and Specialized Suppliers have Auth Logins
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tmp_active_verified_suppliers (
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

INSERT INTO tmp_active_verified_suppliers (
  supplier_id, auth_id, profile_id, email, full_name, business_name,
  categories, capabilities, address, phone, rating, source
) VALUES
  -- 🪑 FURNITURE DOMAIN (01 - 04)
  (
    '0d500000-0000-4000-8000-000000000321',
    '0dc00000-0000-4000-8000-000000000321',
    '0db00000-0000-4000-8000-000000000321',
    'furniture01@otpdemo.test',
    'Classic Interiors Lead',
    'Classic Interiors & Modular Workstations',
    ARRAY['furniture_fixtures', 'construction_infrastructure'],
    '{"office_furniture_workstations": true, "modular_cubicles": true, "ergonomic_mesh_chairs": true, "conference_tables": true, "executive_cabin_desks": true}'::jsonb,
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
    '{"office_furniture_workstations": true, "bifma_certified_chairs": true, "height_adjustable_standing_desks": true, "linear_workstation_clusters": true}'::jsonb,
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
    '{"office_furniture_workstations": true, "veneer_boardroom_tables": true, "leather_executive_chairs": true, "reception_desks_credenzas": true}'::jsonb,
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
    '{"office_furniture_workstations": true, "metal_storage_almirahs": true, "heavy_duty_compactors": true, "industrial_lockers": true}'::jsonb,
    '{"full": "90, Ganapathy Industrial Estate, Coimbatore 641006", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11224',
    4.74,
    'BNI'
  ),

  -- 🏢 SPECIALIZED FURNITURE PILOT SUPPLIERS (UrbanSpace, Royal Teak, SocietyComfort)
  (
    '0d500000-0000-4000-8000-000000000081',
    '0dc00000-0000-4000-8000-000000000081',
    '0db00000-0000-4000-8000-000000000081',
    'sales@urbanspace-interiors.test',
    'Pooja Hegde (Sales Head)',
    'UrbanSpace Modular Workstations & Office Interiors',
    ARRAY['furniture_fixtures', 'property_facility_management'],
    '{"office_furniture_workstations": true, "modular_cubicles": true, "ergonomic_mesh_chairs": true}'::jsonb,
    '{"full": "Plot 42, HSR Layout Sector 2, Bangalore 560102", "city": "Bangalore"}'::jsonb,
    '+91 98450 11223',
    4.85,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000082',
    '0dc00000-0000-4000-8000-000000000082',
    '0db00000-0000-4000-8000-000000000082',
    'info@royalteak-furniture.test',
    'Venkatesh Rao (Director)',
    'Royal Teak & Home Furnishing Solutions Private Limited',
    ARRAY['furniture_fixtures'],
    '{"home_furniture_supply": true, "custom_modular_carpentry": true}'::jsonb,
    '{"full": "128, 100ft Road, Indiranagar, Bangalore 560038", "city": "Bangalore"}'::jsonb,
    '+91 98450 22334',
    4.75,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000083',
    '0dc00000-0000-4000-8000-000000000083',
    '0db00000-0000-4000-8000-000000000083',
    'orders@societycomfort.test',
    'M. Manjunath (Manager)',
    'SocietyComfort RWA & Outdoor Community Seating',
    ARRAY['furniture_fixtures'],
    '{"outdoor_community_seating": true, "park_benches": true}'::jsonb,
    '{"full": "B-14 Industrial Estate, Whitefield, Bangalore 560066", "city": "Bangalore"}'::jsonb,
    '+91 98450 33445',
    4.70,
    'DIRECT'
  ),

  -- ☀️ SOLAR DOMAIN (01 - 04)
  (
    '0d500000-0000-4000-8000-000000000301',
    '0dc00000-0000-4000-8000-000000000301',
    '0db00000-0000-4000-8000-000000000301',
    'solar01@otpdemo.test',
    'SunPower Tech Lead',
    'SunPower Tech Rooftop Solar & EPC Pvt Ltd',
    ARRAY['electrical_power', 'construction_infrastructure'],
    '{"solar_panels": true, "rooftop_solar": true, "solar_pv": true}'::jsonb,
    '{"full": "Plot 45, SIDCO Industrial Estate, Kurichi, Coimbatore 641021", "city": "Coimbatore"}'::jsonb,
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
    '{"solar_panels": true, "rooftop_solar": true, "hybrid_solar_inverters": true}'::jsonb,
    '{"full": "120, Mount Road, Guindy Industrial Estate, Chennai 600032", "city": "Chennai"}'::jsonb,
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
    '{"solar_panels": true, "rooftop_solar": true, "bifacial_mono_perc_panels": true}'::jsonb,
    '{"full": "88, Peenya Industrial Area 3rd Phase, Bengaluru 560058", "city": "Bengaluru"}'::jsonb,
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
    '{"solar_panels": true, "rooftop_solar": true, "solar_water_heaters_lpd": "500 - 5000 LPD"}'::jsonb,
    '{"full": "14, Avinashi Road, Peelamedu, Coimbatore 641004", "city": "Coimbatore"}'::jsonb,
    '+91 98421 11204',
    4.72,
    'BNI'
  ),

  -- 📹 CCTV DOMAIN (01 - 04)
  (
    '0d500000-0000-4000-8000-000000000311',
    '0dc00000-0000-4000-8000-000000000311',
    '0db00000-0000-4000-8000-000000000311',
    'cctv01@otpdemo.test',
    'SecureVision Sales',
    'SecureVision CCTV & IP Surveillance Systems',
    ARRAY['safety_security', 'it_electronics_digital'],
    '{"cctv_surveillance": true, "cctv_installation": true, "cctv_ip_cameras": true}'::jsonb,
    '{"full": "55, 100ft Road, Gandhipuram, Coimbatore 641012", "city": "Coimbatore"}'::jsonb,
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
    '{"cctv_surveillance": true, "biometric_rfid_access_control": true}'::jsonb,
    '{"full": "210, OMR IT Expressway, Thoraipakkam, Chennai 600097", "city": "Chennai"}'::jsonb,
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
    '{"cctv_surveillance": true, "ip_surveillance_network": true}'::jsonb,
    '{"full": "32, Electronic City Phase 1, Hosur Road, Bengaluru 560100", "city": "Bengaluru"}'::jsonb,
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
    '{"cctv_surveillance": true, "apartment_gated_community_cctv": true}'::jsonb,
    '{"full": "78, Mettupalayam Road, R.S. Puram, Coimbatore 641002", "city": "Coimbatore"}'::jsonb,
    '+91 98421 11214',
    4.82,
    'BNI'
  ),

  -- 💧 WATER FILTER & RO PURIFIERS DOMAIN (01 - 04)
  (
    '0d500000-0000-4000-8000-000000000331',
    '0dc00000-0000-4000-8000-000000000331',
    '0db00000-0000-4000-8000-000000000331',
    'water01@otpdemo.test',
    'PureAqua Tech Lead',
    'PureAqua Commercial RO & Water Filter Solutions',
    ARRAY['water_environmental', 'property_facility_management'],
    '{"water_purifier_ro": true, "commercial_ro_plant": true, "water_softeners": true}'::jsonb,
    '{"full": "38, Mettupalayam Road, Kavundampalayam, Coimbatore 641030", "city": "Coimbatore"}'::jsonb,
    '+91 98421 11231',
    4.92,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000332',
    '0dc00000-0000-4000-8000-000000000332',
    '0db00000-0000-4000-8000-000000000332',
    'water02@otpdemo.test',
    'HydroTech Engineering',
    'HydroTech Industrial Water Softeners & WTP',
    ARRAY['water_environmental', 'machinery_engineering'],
    '{"water_purifier_ro": true, "industrial_water_softener": true, "iron_removal_filter": true}'::jsonb,
    '{"full": "145, Hosur Main Road, Bommanahalli, Bengaluru 560068", "city": "Bengaluru"}'::jsonb,
    '+91 98421 11232',
    4.81,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000333',
    '0dc00000-0000-4000-8000-000000000333',
    '0db00000-0000-4000-8000-000000000333',
    'water03@otpdemo.test',
    'ClearFlow Solutions Lead',
    'ClearFlow Water Filtration & UV Disinfection',
    ARRAY['water_environmental', 'property_facility_management'],
    '{"water_purifier_ro": true, "uv_uf_water_purifiers": true, "centralized_drinking_water": true}'::jsonb,
    '{"full": "29, GST Road, Chromepet, Chennai 600044", "city": "Chennai"}'::jsonb,
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
    '{"water_treatment_plant": true, "industrial_ro_plants": true, "reverse_osmosis_membranes": true}'::jsonb,
    '{"full": "72, Ambattur Industrial Estate, Chennai 600058", "city": "Chennai"}'::jsonb,
    '+91 98421 11234',
    4.84,
    'BNI'
  ),

  -- 🔥 GAS PIPELINE DOMAIN (01 - 04)
  (
    '0d500000-0000-4000-8000-000000000341',
    '0dc00000-0000-4000-8000-000000000341',
    '0db00000-0000-4000-8000-000000000341',
    'gas01@otpdemo.test',
    'GasTech Projects Head',
    'GasTech Industrial LPG & PNG Piping Pvt Ltd',
    ARRAY['industrial_supplies_hardware', 'construction_infrastructure', 'pipes_fittings'],
    '{"gas_pipeline": true, "lpg_png_reticulation": true, "copper_seamless_cs_piping": true}'::jsonb,
    '{"full": "Plot 24, SIDCO Industrial Estate, Kurichi, Coimbatore 641021", "city": "Coimbatore"}'::jsonb,
    '+91 98421 11241',
    4.91,
    'DIRECT'
  ),
  (
    '0d500000-0000-4000-8000-000000000342',
    '0dc00000-0000-4000-8000-000000000342',
    '0db00000-0000-4000-8000-000000000342',
    'gas02@otpdemo.test',
    'Bharat Gas Piping Lead',
    'Bharat Gas Piping & Commercial Kitchen Systems',
    ARRAY['industrial_supplies_hardware', 'property_facility_management', 'pipes_fittings'],
    '{"gas_pipeline": true, "commercial_kitchen_gas_piping": true, "cylinder_manifold_bank": true}'::jsonb,
    '{"full": "105, Mount Road, Guindy Industrial Area, Chennai 600032", "city": "Chennai"}'::jsonb,
    '+91 98421 11242',
    4.82,
    'ONDC'
  ),
  (
    '0d500000-0000-4000-8000-000000000343',
    '0dc00000-0000-4000-8000-000000000343',
    '0db00000-0000-4000-8000-000000000343',
    'gas03@otpdemo.test',
    'IndoGas Technical Lead',
    'IndoGas High-Pressure Pipelines & PESO Works',
    ARRAY['industrial_supplies_hardware', 'construction_infrastructure', 'pipes_fittings'],
    '{"gas_pipeline": true, "industrial_png_piping": true, "gas_manifold_installation": true}'::jsonb,
    '{"full": "52, Peenya Industrial Area Phase 2, Bengaluru 560058", "city": "Bengaluru"}'::jsonb,
    '+91 98421 11243',
    4.77,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000344',
    '0dc00000-0000-4000-8000-000000000344',
    '0db00000-0000-4000-8000-000000000344',
    'gas04@otpdemo.test',
    'Apex Gas Piping Rep',
    'Apex Reticulated Gas Systems & Manifolds',
    ARRAY['industrial_supplies_hardware', 'property_facility_management', 'pipes_fittings'],
    '{"gas_pipeline": true, "apartment_reticulated_gas": true, "lpg_manifold_yard": true}'::jsonb,
    '{"full": "83, Cross Cut Road, Gandhipuram, Coimbatore 641012", "city": "Coimbatore"}'::jsonb,
    '+91 98421 11244',
    4.85,
    'BNI'
  );

-- 1. Insert or Update Public Suppliers
INSERT INTO public.suppliers (
  id, business_name, source, status, address, city, pincode, contact_phone, contact_email,
  categories, capabilities, rating_avg, completed_jobs, on_time_percent, is_demo, verification_status, gst_verified, gst_status
)
SELECT
  s.supplier_id, s.business_name, s.source, 'ACTIVE'::supplier_status, s.address,
  COALESCE(s.address->>'city', 'Bangalore'), '560001', s.phone, s.email,
  s.categories, s.capabilities, s.rating, 85, 98.0, false, 'PLATFORM_VERIFIED', true, 'Active'
FROM tmp_active_verified_suppliers s
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  contact_email = EXCLUDED.contact_email,
  contact_phone = EXCLUDED.contact_phone,
  categories = EXCLUDED.categories,
  capabilities = EXCLUDED.capabilities,
  rating_avg = EXCLUDED.rating_avg,
  status = 'ACTIVE'::supplier_status,
  gst_verified = true,
  gst_status = 'Active';

-- 2. Insert or Update Auth Users (Guaranteed Password: "password")
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
FROM tmp_active_verified_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = extensions.crypt('password', extensions.gen_salt('bf')),
  email_confirmed_at = now();

-- 3. Insert or Update Auth Identities
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
)
SELECT
  s.auth_id::text, s.auth_id,
  jsonb_build_object('sub', s.auth_id::text, 'email', s.email),
  'email', now(), now(), now(), gen_random_uuid()
FROM tmp_active_verified_suppliers s
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 4. Insert or Update Profiles
INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin)
SELECT s.profile_id, s.auth_id, s.email, s.full_name, false
FROM tmp_active_verified_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name;

-- 5. Link Supplier Users
INSERT INTO public.supplier_users (id, supplier_id, profile_id, role, created_at)
SELECT gen_random_uuid(), s.supplier_id, s.profile_id, 'OWNER'::supplier_user_role, now()
FROM tmp_active_verified_suppliers s
ON CONFLICT (supplier_id, profile_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Standardize Discovery & Invitation to strictly match Verified 01-04 Suppliers per Domain
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq record;
  v_req record;
  v_cat_code text;
  v_sub_code text;
  v_cat_name text;
  v_sub_name text;
  v_supplier record;
  v_invited integer := 0;
  v_existing integer := 0;
  v_label text;
  v_score numeric;
  v_reasons text[];
  v_total integer := 0;
  v_quotes_res jsonb;
  v_target_pattern text;
  v_query_text text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RFQ not found');
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirement not found');
  END IF;

  SELECT code, name INTO v_cat_code, v_cat_name FROM requirement_categories WHERE id = v_req.category_id;
  SELECT code, name INTO v_sub_code, v_sub_name FROM requirement_subcategories WHERE id = v_req.subcategory_id;

  v_query_text := lower(COALESCE(v_req.title, '') || ' ' || COALESCE(v_req.description, '') || ' ' || COALESCE(v_sub_code, '') || ' ' || COALESCE(v_cat_code, ''));

  -- Select the exact 01-04 Verified Suppliers for each domain
  IF v_query_text ~* 'chair|furniture|table|desk|seating|workstation|modular' THEN
    v_target_pattern := 'furniture0[1-4]@otpdemo.test';
  ELSIF v_query_text ~* 'solar|inverter|rooftop|panel|battery' THEN
    v_target_pattern := 'solar0[1-4]@otpdemo.test';
  ELSIF v_query_text ~* 'cctv|camera|surveillance|security|dvr|nvr' THEN
    v_target_pattern := 'cctv0[1-4]@otpdemo.test';
  ELSIF v_query_text ~* 'water|ro|filter|softener|purifier|wtp|stp' THEN
    v_target_pattern := 'water0[1-4]@otpdemo.test';
  ELSIF v_query_text ~* 'gas|pipeline|piping|lpg|png|manifold' THEN
    v_target_pattern := 'gas0[1-4]@otpdemo.test';
  ELSE
    -- Electrical, Motor Rewinding, Borewell, Facilities
    v_target_pattern := 'supplier0[1-4]@otpdemo.test';
  END IF;

  SELECT count(*)::int INTO v_existing FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  -- 1. Pass 1: Invite Verified 01-04 Series Suppliers for this domain
  FOR v_supplier IN
    SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories, s.business_name, s.contact_email
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND s.contact_email ~* v_target_pattern
    ORDER BY s.contact_email ASC
    LIMIT 4
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier.id
    ) THEN
      v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
      v_score := LEAST(100, 75 + COALESCE(v_supplier.rating_avg, 3.5) * 5);
      v_reasons := ARRAY[
        'verified_domain_match:' || COALESCE(v_cat_name, 'General Sourcing'),
        'source:' || v_supplier.source::text
      ];

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
      );

      v_invited := v_invited + 1;
    END IF;
  END LOOP;

  -- 2. Pass 2: Fallback to ensure at least 4 suppliers are invited
  SELECT count(*)::int INTO v_total FROM rfq_invitations WHERE rfq_id = p_rfq_id;
  IF v_total < 4 THEN
    FOR v_supplier IN
      SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - v_total)
    LOOP
      v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
      v_score := 75.0;
      v_reasons := ARRAY['open_network_discovery', 'source:' || v_supplier.source::text];

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  -- 3. Transition RFQ to OPEN if in DRAFT
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    UPDATE requirements
    SET status = 'QUOTING'::requirement_status,
        updated_at = now()
    WHERE id = v_rfq.requirement_id;
  END IF;

  -- 4. Auto submit competitive quotes if stub is active
  IF private.supplier_network_stub_enabled() THEN
    SELECT public.auto_submit_pilot_quotes(p_rfq_id) INTO v_quotes_res;
  ELSE
    v_quotes_res := jsonb_build_object('skipped', true, 'reason', 'Supplier network is live');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invited_count', v_invited,
    'total_invitations', v_existing + v_invited,
    'rfq_status', 'OPEN',
    'quotes_result', v_quotes_res
  );
END;
$$;

COMMIT;

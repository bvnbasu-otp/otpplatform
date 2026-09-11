-- 00082_seed_gas_pipeline_suppliers.sql
-- Seed 4 verified Gas Pipeline, LPG/PNG Reticulation, and Industrial Piping Suppliers

BEGIN;

CREATE TEMP TABLE tmp_gas_suppliers (
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

INSERT INTO tmp_gas_suppliers (
  supplier_id, auth_id, profile_id, email, full_name, business_name,
  categories, capabilities, address, phone, rating, source
) VALUES
  (
    '0d500000-0000-4000-8000-000000000341',
    '0dc00000-0000-4000-8000-000000000341',
    '0db00000-0000-4000-8000-000000000341',
    'gas01@otpdemo.test',
    'GasTech Projects Head',
    'GasTech Industrial LPG & PNG Piping Pvt Ltd',
    ARRAY['industrial_supplies_hardware', 'construction_infrastructure', 'pipes_fittings'],
    '{"gas_pipeline": true, "lpg_png_reticulation": true, "copper_seamless_cs_piping": true, "peso_approved": true, "gas_manifold_installation": true, "gas_leak_detection_amc": true}'::jsonb,
    '{"full": "Plot 24, SIDCO Industrial Estate, Kurichi, Coimbatore 641021", "city": "Coimbatore", "state": "Tamil Nadu"}'::jsonb,
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
    '{"gas_pipeline": true, "commercial_kitchen_gas_piping": true, "cylinder_manifold_bank": true, "gas_pressure_regulators": true, "fire_shutoff_valves": true}'::jsonb,
    '{"full": "105, Mount Road, Guindy Industrial Area, Chennai 600032", "city": "Chennai", "state": "Tamil Nadu"}'::jsonb,
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
    '{"gas_pipeline": true, "high_pressure_cng_png_lines": true, "seamless_carbon_steel_sch40": true, "radiography_testing_welds": true, "industrial_boiler_fuel_piping": true}'::jsonb,
    '{"full": "38, Peenya Industrial Area 2nd Stage, Bengaluru 560058", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
    '+91 98421 11243',
    4.88,
    'ASSOCIATION'
  ),
  (
    '0d500000-0000-4000-8000-000000000344',
    '0dc00000-0000-4000-8000-000000000344',
    '0db00000-0000-4000-8000-000000000344',
    'gas04@otpdemo.test',
    'Premier Gas Reticulation Manager',
    'Premier Gas Reticulation & Utility Systems',
    ARRAY['industrial_supplies_hardware', 'property_facility_management', 'pipes_fittings'],
    '{"gas_pipeline": true, "apartment_gated_community_gas_metering": true, "prepaid_gas_meters": true, "polyethylene_underground_piping": true, "annual_leak_testing": true}'::jsonb,
    '{"full": "18, Perundurai Road, Erode 638011", "city": "Erode", "state": "Tamil Nadu"}'::jsonb,
    '+91 98421 11244',
    4.78,
    'BNI'
  );

-- Auth users (password: 'password')
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
FROM tmp_gas_suppliers s
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
FROM tmp_gas_suppliers s
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Profiles
INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin)
SELECT s.profile_id, s.auth_id, s.email, s.full_name, false
FROM tmp_gas_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name;

-- Suppliers
INSERT INTO public.suppliers (
  id, business_name, source, status, categories, capabilities,
  address, contact_phone, contact_email, rating_avg, created_at, updated_at
)
SELECT
  s.supplier_id, s.business_name, s.source, 'ACTIVE'::supplier_status, s.categories, s.capabilities,
  s.address, s.phone, s.email, s.rating, now(), now()
FROM tmp_gas_suppliers s
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

-- Supplier Users
INSERT INTO public.supplier_users (id, supplier_id, profile_id, role, created_at)
SELECT gen_random_uuid(), s.supplier_id, s.profile_id, 'OWNER'::supplier_user_role, now()
FROM tmp_gas_suppliers s
ON CONFLICT (supplier_id, profile_id) DO NOTHING;

-- Re-invite suppliers to the Gas Pipeline RFQ if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rfqs WHERE id = '69cd2e78-354b-45a3-b2cb-c0240eea85dc') THEN
    DELETE FROM rfq_invitations WHERE rfq_id = '69cd2e78-354b-45a3-b2cb-c0240eea85dc';

    INSERT INTO rfq_invitations (rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons)
    VALUES
      ('69cd2e78-354b-45a3-b2cb-c0240eea85dc', '0d500000-0000-4000-8000-000000000341', 'Supplier A', 'INVITED', 98.0, ARRAY['capability_match:gas_pipeline', 'PESO_approved']),
      ('69cd2e78-354b-45a3-b2cb-c0240eea85dc', '0d500000-0000-4000-8000-000000000342', 'Supplier B', 'INVITED', 95.0, ARRAY['capability_match:gas_piping_manifold', 'source:ONDC']),
      ('69cd2e78-354b-45a3-b2cb-c0240eea85dc', '0d500000-0000-4000-8000-000000000343', 'Supplier C', 'INVITED', 96.5, ARRAY['capability_match:high_pressure_lines', 'source:ASSOCIATION']),
      ('69cd2e78-354b-45a3-b2cb-c0240eea85dc', '0d500000-0000-4000-8000-000000000344', 'Supplier D', 'INVITED', 94.0, ARRAY['capability_match:gas_reticulation_erode', 'source:BNI']);

    UPDATE rfqs SET status = 'OPEN' WHERE id = '69cd2e78-354b-45a3-b2cb-c0240eea85dc';
  END IF;
END $$;

COMMIT;

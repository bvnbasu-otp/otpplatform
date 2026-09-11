-- 00089_seed_royal_teak_and_specialized_furniture_supplier_users.sql
-- Creates active auth accounts and profile links for Royal Teak and furniture suppliers

BEGIN;

CREATE TEMP TABLE tmp_furniture_suppliers (
  supplier_id   uuid PRIMARY KEY,
  auth_id       uuid NOT NULL,
  profile_id    uuid NOT NULL,
  email         text NOT NULL,
  full_name     text NOT NULL,
  business_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_furniture_suppliers (
  supplier_id, auth_id, profile_id, email, full_name, business_name
) VALUES
  (
    '0d500000-0000-4000-8000-000000000082',
    '0dc00000-0000-4000-8000-000000000082',
    '0db00000-0000-4000-8000-000000000082',
    'info@royalteak-furniture.test',
    'Venkatesh Rao (Director)',
    'Royal Teak & Home Furnishing Solutions Private Limited'
  ),
  (
    '0d500000-0000-4000-8000-000000000081',
    '0dc00000-0000-4000-8000-000000000081',
    '0db00000-0000-4000-8000-000000000081',
    'sales@urbanspace-interiors.test',
    'Pooja Hegde (Sales Head)',
    'UrbanSpace Modular Workstations & Office Interiors'
  ),
  (
    '0d500000-0000-4000-8000-000000000083',
    '0dc00000-0000-4000-8000-000000000083',
    '0db00000-0000-4000-8000-000000000083',
    'orders@societycomfort.test',
    'M. Manjunath (Manager)',
    'SocietyComfort RWA & Outdoor Community Seating'
  );

-- 1. Update Suppliers Business Name
UPDATE public.suppliers s
SET business_name = t.business_name,
    contact_email = t.email,
    status = 'ACTIVE'::supplier_status
FROM tmp_furniture_suppliers t
WHERE s.id = t.supplier_id;

-- 2. Auth Users (Password: "password")
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
FROM tmp_furniture_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = now();

-- 3. Auth Identities
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
)
SELECT
  s.auth_id::text, s.auth_id,
  jsonb_build_object('sub', s.auth_id::text, 'email', s.email),
  'email', now(), now(), now(), gen_random_uuid()
FROM tmp_furniture_suppliers s
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 4. Profiles
INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin)
SELECT s.profile_id, s.auth_id, s.email, s.full_name, false
FROM tmp_furniture_suppliers s
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name;

-- 5. Supplier Users Linking
INSERT INTO public.supplier_users (id, supplier_id, profile_id, role, created_at)
SELECT gen_random_uuid(), s.supplier_id, s.profile_id, 'OWNER'::supplier_user_role, now()
FROM tmp_furniture_suppliers s
ON CONFLICT (supplier_id, profile_id) DO NOTHING;

COMMIT;

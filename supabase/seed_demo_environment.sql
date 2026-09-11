-- Demo environment.
--
-- A believable slice of the market: four buyers of different kinds, forty-five
-- suppliers across six cities with real capability profiles, and five live
-- requirements sitting at different points in the lifecycle so a walkthrough
-- can start anywhere.
--
-- Everything here is flagged is_demo, which is what makes demo_reset safe.
--
-- UUIDs use the 0d... namespace ("d" for demo) to stay clear of the earlier
-- seed files. Logins are all password "password".
--
-- The staged states at the end are not written out by hand. They are produced
-- by calling the same functions the application calls: discovery invites the
-- suppliers, the simulator generates the bids, the committee votes, the award
-- locks. So if any of those break, the seed breaks, and we find out here
-- rather than in front of an audience.

BEGIN;

-- ---------------------------------------------------------------------------
-- People
--
-- Collected in one place so the auth user, the identity row GoTrue needs, and
-- the profile all come from a single list and cannot drift apart.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_people (
  auth_id    uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  email      text NOT NULL,
  full_name  text NOT NULL,
  is_admin   boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO demo_people (auth_id, profile_id, email, full_name, is_admin) VALUES
  -- Platform
  ('0dc00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000001', 'admin@otp.test',                'OTP Platform Admin',   true),

  -- Sunrise Residency Owners Association (COMMUNITY, 96 flats)
  ('0dc00000-0000-4000-8000-000000000011', '0db00000-0000-4000-8000-000000000011', 'secretary@sunrise.test',        'Ramesh Iyer',          false),
  ('0dc00000-0000-4000-8000-000000000012', '0db00000-0000-4000-8000-000000000012', 'treasurer@sunrise.test',        'Kavitha Nair',         false),
  ('0dc00000-0000-4000-8000-000000000013', '0db00000-0000-4000-8000-000000000013', 'member1@sunrise.test',          'Suresh Babu',          false),
  ('0dc00000-0000-4000-8000-000000000014', '0db00000-0000-4000-8000-000000000014', 'member2@sunrise.test',          'Fathima Rahman',       false),

  -- Kovai Precision Components (MSME, owner-run machine shop)
  ('0dc00000-0000-4000-8000-000000000021', '0db00000-0000-4000-8000-000000000021', 'owner@kovaiprecision.test',     'Murugesan K',          false),
  ('0dc00000-0000-4000-8000-000000000022', '0db00000-0000-4000-8000-000000000022', 'partner@kovaiprecision.test',   'Selvi Murugesan',      false),

  -- Sri Lakshmi Knitwear Exports (ENTERPRISE, formal procurement committee)
  ('0dc00000-0000-4000-8000-000000000031', '0db00000-0000-4000-8000-000000000031', 'procurement@srilakshmi.test',   'Anand Subramanian',    false),
  ('0dc00000-0000-4000-8000-000000000032', '0db00000-0000-4000-8000-000000000032', 'quality@srilakshmi.test',       'Deepa Venkat',         false),
  ('0dc00000-0000-4000-8000-000000000033', '0db00000-0000-4000-8000-000000000033', 'finance@srilakshmi.test',       'Prakash Raman',        false),

  -- Bharathi Agro (INDIVIDUAL, sole trader)
  ('0dc00000-0000-4000-8000-000000000041', '0db00000-0000-4000-8000-000000000041', 'bharathi@agrotrade.test',       'Bharathi Selvam',      false);

-- Supplier logins, one owner each.
INSERT INTO demo_people (auth_id, profile_id, email, full_name)
SELECT
  ('0dc10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('0db10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'supplier' || lpad(n::text, 2, '0') || '@otpdemo.test',
  'Supplier ' || lpad(n::text, 2, '0') || ' Owner'
FROM generate_series(1, 45) AS n;

-- Supplier direct contact logins matching suppliers.contact_email
INSERT INTO demo_people (auth_id, profile_id, email, full_name)
SELECT
  ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('0db20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'contact' || lpad(n::text, 2, '0') || '@otpdemo.test',
  'Supplier ' || lpad(n::text, 2, '0') || ' Contact'
FROM generate_series(1, 45) AS n;

DELETE FROM auth.users WHERE email IN (SELECT email FROM demo_people) AND id NOT IN (SELECT auth_id FROM demo_people);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  p.auth_id, 'authenticated', 'authenticated', p.email,
  crypt('password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', ''
FROM demo_people p
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    updated_at = now();

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
)
SELECT
  p.auth_id::text, p.auth_id,
  jsonb_build_object('sub', p.auth_id::text, 'email', p.email),
  'email', now(), now(), now(), gen_random_uuid()
FROM demo_people p
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
SELECT p.profile_id, p.auth_id, p.email, p.full_name, p.is_admin, true
FROM demo_people p
ON CONFLICT (id) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_platform_admin = EXCLUDED.is_platform_admin,
    is_demo = true,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Buying organizations
--
-- Four buyer types, deliberately: the same platform serves a 96-flat
-- association, an owner-run machine shop, an exporter with a procurement
-- committee, and one man trading turmeric. Their org_type is what sets voting
-- power, so the difference is visible in the vote tally rather than described
-- in a slide.
--
-- The contact columns are filled because they are what a winning supplier
-- receives when the award is revealed. Left empty, the demo's Phase 4 would hand
-- the winner an organization name and no way to reach it, which is the gap the
-- reveal exists to close. Nothing here is visible to any supplier before that
-- moment.
-- ---------------------------------------------------------------------------

INSERT INTO organizations (
  id, name, org_type, is_demo,
  contact_person, contact_phone, contact_email, tax_registration, city, address
) VALUES
  ('0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY',  true,
   'Priya Sharma',   '+919845012201', 'manager@sunrise-residency.demo',  '29AABCS1429B1ZQ', 'Bengaluru',
   '{"line1":"Sunrise Residency, Tower B","line2":"Kundalahalli Gate","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"}'::jsonb),
  ('0da00000-0000-4000-8000-000000000002', 'Kovai Precision Components',           'MSME',       true,
   'Selvam Kumar',   '+919842233105', 'owner@kovai-precision.demo',      '33AACCK5678M1Z4', 'Coimbatore',
   '{"line1":"Unit 7, SIDCO Industrial Estate","line2":"Kurichi","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641021","country":"IN"}'::jsonb),
  ('0da00000-0000-4000-8000-000000000003', 'Sri Lakshmi Knitwear Exports',         'ENTERPRISE', true,
   'Meenakshi Rao',  '+919886745510', 'procurement@srilakshmi-knit.demo', '33AAECS9012P1ZR', 'Tiruppur',
   '{"line1":"14/3 Avinashi Road","line2":"Kongu Nagar","city":"Tiruppur","state":"Tamil Nadu","postalCode":"641603","country":"IN"}'::jsonb),
  ('0da00000-0000-4000-8000-000000000004', 'Bharathi Agro Trading',                'INDIVIDUAL', true,
   'Bharathi Raman', '+919443398820', 'bharathi@agro-trading.demo',      '33AFTPB3456L1ZK', 'Erode',
   '{"line1":"Shop 12, Regulated Market Yard","city":"Erode","state":"Tamil Nadu","postalCode":"638001","country":"IN"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    org_type = EXCLUDED.org_type,
    is_demo = true,
    contact_person = EXCLUDED.contact_person,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    tax_registration = EXCLUDED.tax_registration,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    updated_at = now();

INSERT INTO organization_members (id, organization_id, profile_id, role) VALUES
  ('0de00000-0000-4000-8000-000000000011', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000011', 'MANAGER'),
  ('0de00000-0000-4000-8000-000000000012', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000012', 'COMMITTEE_MEMBER'),
  ('0de00000-0000-4000-8000-000000000013', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000013', 'COMMITTEE_MEMBER'),
  ('0de00000-0000-4000-8000-000000000014', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000014', 'COMMITTEE_MEMBER'),

  ('0de00000-0000-4000-8000-000000000021', '0da00000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000021', 'OWNER'),
  ('0de00000-0000-4000-8000-000000000022', '0da00000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000022', 'COMMITTEE_MEMBER'),

  ('0de00000-0000-4000-8000-000000000031', '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000031', 'MANAGER'),
  ('0de00000-0000-4000-8000-000000000032', '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000032', 'COMMITTEE_MEMBER'),
  ('0de00000-0000-4000-8000-000000000033', '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000033', 'COMMITTEE_MEMBER'),

  ('0de00000-0000-4000-8000-000000000041', '0da00000-0000-4000-8000-000000000004', '0db00000-0000-4000-8000-000000000041', 'OWNER')
ON CONFLICT (organization_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- Suppliers
--
-- Forty-five real-shaped businesses. The numbers that matter to evaluation -
-- rating, completed jobs, on-time percentage, dispute rate - vary genuinely,
-- because a comparison screen where everyone scores the same proves nothing.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_suppliers (
  n            integer PRIMARY KEY,
  id           uuid NOT NULL,
  name         text NOT NULL,
  source       supplier_source NOT NULL,
  city         text NOT NULL,
  pincode      text NOT NULL,
  lat          numeric NOT NULL,
  lng          numeric NOT NULL,
  radius_km    numeric NOT NULL,
  rating       numeric NOT NULL,
  jobs         integer NOT NULL,
  on_time      numeric NOT NULL,
  dispute      numeric NOT NULL,
  verification supplier_verification_status NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_suppliers VALUES
  -- Motors, pumps and water — Bengaluru, Salem, Coimbatore
  ( 1, '0d500000-0000-4000-8000-000000000001', 'Aqua Prime Borewell Works',        'DIRECT',         'Bengaluru',  '560034', 12.9352, 77.6245, 30, 4.60,  84, 92.0, 1.2, 'PLATFORM_VERIFIED'),
  ( 2, '0d500000-0000-4000-8000-000000000002', 'Sri Venkateswara Motor Winding',   'LOCAL_REGISTRY', 'Bengaluru',  '560022', 12.9899, 77.5730, 22, 4.30,  61, 88.0, 2.0, 'DOCUMENT_VERIFIED'),
  ( 3, '0d500000-0000-4000-8000-000000000003', 'Deep Earth Pump Services',         'REFERRAL',       'Bengaluru',  '560066', 12.9698, 77.7500, 35, 4.75, 132, 95.0, 0.8, 'PLATFORM_VERIFIED'),
  ( 4, '0d500000-0000-4000-8000-000000000004', 'Nandi Electricals & Rewinding',    'ASSOCIATION',    'Bengaluru',  '560043', 13.0206, 77.6479, 18, 3.90,  37, 79.0, 4.5, 'SELF_DECLARED'),
  ( 5, '0d500000-0000-4000-8000-000000000005', 'Kaveri Submersible Solutions',     'DIRECT',         'Bengaluru',  '560076', 12.8996, 77.5849, 28, 4.45,  96, 90.0, 1.5, 'DOCUMENT_VERIFIED'),
  ( 6, '0d500000-0000-4000-8000-000000000006', 'Salem Motor Rewinding Centre',     'LOCAL_REGISTRY', 'Salem',      '636001', 11.6643, 78.1460, 40, 4.20,  73, 86.0, 2.4, 'DOCUMENT_VERIFIED'),
  ( 7, '0d500000-0000-4000-8000-000000000007', 'Blue Drop Water Systems',          'DIRECT',         'Bengaluru',  '560095', 12.9350, 77.6270, 25, 4.10,  52, 84.0, 2.8, 'SELF_DECLARED'),
  ( 8, '0d500000-0000-4000-8000-000000000008', 'Cauvery Borewell Drilling',        'ASSOCIATION',    'Bengaluru',  '560064', 13.1050, 77.5940, 45, 4.35,  118, 89.0, 1.9, 'PLATFORM_VERIFIED'),
  ( 9, '0d500000-0000-4000-8000-000000000009', 'Shakti Motors & Controls',         'DIRECT',         'Coimbatore', '641004', 11.0168, 76.9558, 40, 4.55, 141, 93.0, 1.1, 'PLATFORM_VERIFIED'),

  -- Lifts, facility and security — Bengaluru
  (10, '0d500000-0000-4000-8000-000000000010', 'Vertex Elevator Services',         'DIRECT',         'Bengaluru',  '560001', 12.9716, 77.5946, 30, 4.50,  88, 91.0, 1.4, 'PLATFORM_VERIFIED'),
  (11, '0d500000-0000-4000-8000-000000000011', 'SkyLift Maintenance',              'REFERRAL',       'Bengaluru',  '560038', 12.9784, 77.6408, 25, 4.05,  46, 82.0, 3.6, 'SELF_DECLARED'),
  (12, '0d500000-0000-4000-8000-000000000012', 'Prime Facility Solutions',         'ASSOCIATION',    'Bengaluru',  '560102', 12.9081, 77.6476, 35, 4.40, 167, 90.0, 1.7, 'DOCUMENT_VERIFIED'),
  (13, '0d500000-0000-4000-8000-000000000013', 'GreenKeep Housekeeping',           'LOCAL_REGISTRY', 'Bengaluru',  '560037', 12.9591, 77.6974, 28, 4.15,  74, 85.0, 2.6, 'SELF_DECLARED'),
  (14, '0d500000-0000-4000-8000-000000000014', 'SafeGuard Security Services',      'DIRECT',         'Bengaluru',  '560068', 12.9010, 77.6250, 32, 4.25, 103, 87.0, 2.1, 'DOCUMENT_VERIFIED'),
  (15, '0d500000-0000-4000-8000-000000000015', 'PestFree Bengaluru',               'REFERRAL',       'Bengaluru',  '560029', 12.9420, 77.5960, 30, 3.95,  58, 81.0, 3.9, 'SELF_DECLARED'),

  -- Machining and engineering — Coimbatore, Salem
  (16, '0d500000-0000-4000-8000-000000000016', 'Kovai CNC Works',                  'DIRECT',         'Coimbatore', '641021', 11.0510, 77.0100, 30, 4.55, 129, 93.0, 1.0, 'PLATFORM_VERIFIED'),
  (17, '0d500000-0000-4000-8000-000000000017', 'Precision Turn Engineering',       'LOCAL_REGISTRY', 'Coimbatore', '641006', 11.0290, 76.9900, 25, 4.20,  67, 87.0, 2.2, 'DOCUMENT_VERIFIED'),
  (18, '0d500000-0000-4000-8000-000000000018', 'Annapoorna Machine Tools',         'ASSOCIATION',    'Coimbatore', '641045', 10.9950, 76.9400, 35, 4.70, 184, 96.0, 0.6, 'PLATFORM_VERIFIED'),
  (19, '0d500000-0000-4000-8000-000000000019', 'SKM Foundry & Casting',            'DIRECT',         'Coimbatore', '641062', 11.0700, 76.9200, 40, 4.00,  91, 80.0, 3.4, 'DOCUMENT_VERIFIED'),
  (20, '0d500000-0000-4000-8000-000000000020', 'Coimbatore Spindle Care',          'REFERRAL',       'Coimbatore', '641015', 11.0080, 77.0300, 28, 4.35,  55, 90.0, 1.6, 'DOCUMENT_VERIFIED'),
  (21, '0d500000-0000-4000-8000-000000000021', 'Bharath Sheet Metal',              'LOCAL_REGISTRY', 'Coimbatore', '641029', 11.0400, 76.9700, 25, 3.85,  43, 78.0, 4.8, 'SELF_DECLARED'),
  (22, '0d500000-0000-4000-8000-000000000022', 'Velan Gear & Transmission',        'DIRECT',         'Coimbatore', '641103', 11.1200, 77.0500, 32, 4.45, 112, 92.0, 1.3, 'PLATFORM_VERIFIED'),
  (23, '0d500000-0000-4000-8000-000000000023', 'Sakthi Structural Fabricators',    'ASSOCIATION',    'Salem',      '636005', 11.6800, 78.1300, 45, 4.10,  79, 83.0, 2.9, 'DOCUMENT_VERIFIED'),

  -- Textile — Tiruppur, Erode, Coimbatore
  (24, '0d500000-0000-4000-8000-000000000024', 'Tirupur Combed Yarn Traders',      'DIRECT',         'Tiruppur',   '641604', 11.1085, 77.3411, 30, 4.40,  95, 90.0, 1.5, 'DOCUMENT_VERIFIED'),
  (25, '0d500000-0000-4000-8000-000000000025', 'Sri Amman Spinning Mills',         'ASSOCIATION',    'Tiruppur',   '641606', 11.0900, 77.3600, 60, 4.80, 231, 97.0, 0.4, 'PLATFORM_VERIFIED'),
  (26, '0d500000-0000-4000-8000-000000000026', 'Kongu Yarn Agencies',              'LOCAL_REGISTRY', 'Erode',      '638001', 11.3410, 77.7172, 55, 4.05,  62, 82.0, 3.2, 'SELF_DECLARED'),
  (27, '0d500000-0000-4000-8000-000000000027', 'Lakshmi Knit Fabrics',             'REFERRAL',       'Tiruppur',   '641603', 11.1150, 77.3300, 28, 4.30, 108, 88.0, 2.0, 'DOCUMENT_VERIFIED'),
  (28, '0d500000-0000-4000-8000-000000000028', 'Erode Weaving Centre',             'DIRECT',         'Erode',      '638011', 11.3300, 77.7300, 35, 4.15,  71, 85.0, 2.5, 'DOCUMENT_VERIFIED'),
  (29, '0d500000-0000-4000-8000-000000000029', 'Colour Craft Dyeing',              'LOCAL_REGISTRY', 'Tiruppur',   '641605', 11.1000, 77.3500, 25, 3.90,  84, 77.0, 5.1, 'SELF_DECLARED'),
  (30, '0d500000-0000-4000-8000-000000000030', 'Stitchwell Garments',              'DIRECT',         'Tiruppur',   '641607', 11.1250, 77.3250, 30, 4.35, 143, 89.0, 1.8, 'PLATFORM_VERIFIED'),
  (31, '0d500000-0000-4000-8000-000000000031', 'Cotton Valley Yarn Mart',          'REFERRAL',       'Coimbatore', '641009', 11.0250, 76.9700, 70, 4.20,  77, 86.0, 2.3, 'DOCUMENT_VERIFIED'),

  -- Agriculture — Erode, Salem
  (32, '0d500000-0000-4000-8000-000000000032', 'Erode Turmeric Traders',           'ASSOCIATION',    'Erode',      '638003', 11.3450, 77.7100, 50, 4.55, 162, 93.0, 1.1, 'PLATFORM_VERIFIED'),
  (33, '0d500000-0000-4000-8000-000000000033', 'Kongu Agri Commodities',           'DIRECT',         'Erode',      '638002', 11.3380, 77.7250, 45, 4.25, 118, 87.0, 2.2, 'DOCUMENT_VERIFIED'),
  (34, '0d500000-0000-4000-8000-000000000034', 'Sathy Spice Exporters',            'LOCAL_REGISTRY', 'Erode',      '638455', 11.5000, 77.2400, 60, 4.10,  89, 84.0, 2.7, 'DOCUMENT_VERIFIED'),
  (35, '0d500000-0000-4000-8000-000000000035', 'Salem Grain Mandi Traders',        'DIRECT',         'Salem',      '636009', 11.6700, 78.1500, 65, 3.95, 134, 80.0, 3.7, 'SELF_DECLARED'),
  (36, '0d500000-0000-4000-8000-000000000036', 'Bhavani Cold Storage',             'ASSOCIATION',    'Erode',      '638301', 11.4450, 77.6800, 55, 4.40,  66, 91.0, 1.4, 'PLATFORM_VERIFIED'),
  (37, '0d500000-0000-4000-8000-000000000037', 'Green Harvest Fertilisers',        'REFERRAL',       'Salem',      '636016', 11.6550, 78.1600, 50, 4.00,  58, 82.0, 3.1, 'SELF_DECLARED'),

  -- Electrical, construction, logistics, IT — Chennai, Bengaluru
  (38, '0d500000-0000-4000-8000-000000000038', 'Chennai Power Systems',            'DIRECT',         'Chennai',    '600032', 13.0100, 80.2200, 45, 4.60, 176, 94.0, 0.9, 'PLATFORM_VERIFIED'),
  (39, '0d500000-0000-4000-8000-000000000039', 'Metro Electrical Contractors',     'LOCAL_REGISTRY', 'Chennai',    '600002', 13.0827, 80.2707, 35, 4.20,  97, 86.0, 2.4, 'DOCUMENT_VERIFIED'),
  (40, '0d500000-0000-4000-8000-000000000040', 'SunVolt Solar Solutions',          'REFERRAL',       'Chennai',    '600096', 12.9900, 80.2400, 60, 4.35, 71, 90.0, 1.7, 'DOCUMENT_VERIFIED'),
  (41, '0d500000-0000-4000-8000-000000000041', 'Coromandel Freight Lines',         'DIRECT',         'Chennai',    '600001', 13.0900, 80.2900, 90, 4.15, 289, 85.0, 2.6, 'PLATFORM_VERIFIED'),
  (42, '0d500000-0000-4000-8000-000000000042', 'QuickShift Packers & Movers',      'ASSOCIATION',    'Bengaluru',  '560017', 12.9600, 77.6600, 50, 3.90, 152, 79.0, 4.2, 'SELF_DECLARED'),
  (43, '0d500000-0000-4000-8000-000000000043', 'Netcore IT Solutions',             'DIRECT',         'Chennai',    '600042', 12.9800, 80.2200, 40, 4.45, 124, 92.0, 1.2, 'PLATFORM_VERIFIED'),
  (44, '0d500000-0000-4000-8000-000000000044', 'SecureVision CCTV',               'LOCAL_REGISTRY', 'Bengaluru',  '560078', 12.8900, 77.5800, 30, 4.10,  81, 84.0, 2.8, 'DOCUMENT_VERIFIED'),
  (45, '0d500000-0000-4000-8000-000000000045', 'BuildRight Civil Contractors',     'REFERRAL',       'Bengaluru',  '560100', 12.8450, 77.6600, 40, 4.30, 113, 88.0, 2.0, 'DOCUMENT_VERIFIED');

INSERT INTO suppliers (
  id, business_name, source, status, verification_status, rating_avg,
  completed_jobs, on_time_percent, dispute_rate, city, pincode,
  contact_phone, contact_email, address, categories, capabilities, service_area, is_demo
)
SELECT
  d.id, d.name, d.source, 'ACTIVE', d.verification, d.rating,
  d.jobs, d.on_time, d.dispute, d.city, d.pincode,
  '+9198' || lpad((45000000 + d.n)::text, 8, '0'),
  'contact' || lpad(d.n::text, 2, '0') || '@otpdemo.test',
  jsonb_build_object(
    'line1', d.n || ' Industrial Estate',
    'city', d.city, 'state',
    CASE WHEN d.city = 'Bengaluru' THEN 'Karnataka' ELSE 'Tamil Nadu' END,
    'postalCode', d.pincode, 'country', 'IN'
  ),
  '{}'::text[],
  '{}'::jsonb,
  jsonb_build_object('centerLat', d.lat, 'centerLng', d.lng, 'radiusKm', d.radius_km),
  true
FROM demo_suppliers d
ON CONFLICT (id) DO UPDATE
SET business_name = EXCLUDED.business_name,
    source = EXCLUDED.source,
    status = EXCLUDED.status,
    verification_status = EXCLUDED.verification_status,
    rating_avg = EXCLUDED.rating_avg,
    completed_jobs = EXCLUDED.completed_jobs,
    on_time_percent = EXCLUDED.on_time_percent,
    dispute_rate = EXCLUDED.dispute_rate,
    city = EXCLUDED.city,
    pincode = EXCLUDED.pincode,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    address = EXCLUDED.address,
    categories = EXCLUDED.categories,
    capabilities = EXCLUDED.capabilities,
    service_area = EXCLUDED.service_area,
    is_demo = true,
    updated_at = now();

INSERT INTO supplier_users (id, supplier_id, profile_id, role)
SELECT
  ('0d600000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  d.id,
  ('0db10000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  'OWNER'
FROM demo_suppliers d
ON CONFLICT (supplier_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;

INSERT INTO supplier_users (id, supplier_id, profile_id, role)
SELECT
  ('0d620000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  d.id,
  ('0db20000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  'OWNER'
FROM demo_suppliers d
ON CONFLICT (supplier_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;


-- ---------------------------------------------------------------------------
-- What each supplier can actually do
--
-- This is the table discovery runs on. The capacity ceiling matters: a shop
-- that tops out at 10 HP is correctly excluded from a 12.5 HP motor, which is
-- the behaviour the motor scenario below demonstrates.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_caps (
  n        integer NOT NULL,
  cap      text NOT NULL,
  capacity numeric
) ON COMMIT DROP;

-- Real local businesses do not stay inside one category, and neither do these.
-- Each supplier declares five to ten capabilities covering the trades that
-- firm would genuinely take on, which is what makes discovery interesting: a
-- motor rewinding job reaches a borewell driller, a pump service, a lift
-- maintenance company and an electrical contractor, because all four rewind
-- motors, however differently they describe themselves.
INSERT INTO demo_caps (n, cap, capacity) VALUES
  -- 1 Aqua Prime Borewell Works — borewell firm that also rewinds and wires
  ( 1, 'motor_rewinding',          20),  ( 1, 'pump_installation',        20), ( 1, 'borewell_flushing',        600),
  ( 1, 'borewell_drilling',       800),  ( 1, 'submersible_pump_supply',  20), ( 1, 'water_plumbing',          NULL),
  ( 1, 'tank_cleaning',         20000),  ( 1, 'electrical_contracting', NULL),

  -- 2 Sri Venkateswara Motor Winding — winding shop with an electrical licence
  ( 2, 'motor_rewinding',          15),  ( 2, 'motor_supply',             15), ( 2, 'pump_installation',         15),
  ( 2, 'electrical_contracting', NULL),  ( 2, 'electrical_testing',     NULL), ( 2, 'machine_spares_supply',   NULL),
  ( 2, 'gearbox_repair',           30),  ( 2, 'motor_control_automation', 11),

  -- 3 Deep Earth Pump Services
  ( 3, 'motor_rewinding',          25),  ( 3, 'submersible_pump_supply',  25), ( 3, 'pump_installation',        25),
  ( 3, 'borewell_flushing',       750),  ( 3, 'water_plumbing',         NULL), ( 3, 'water_testing',           NULL),
  ( 3, 'machine_spares_supply',  NULL),  ( 3, 'electrical_contracting', NULL),

  -- 4 Nandi Electricals & Rewinding — deliberately capped at 10 HP, so the
  -- 12.5 HP job excludes it on capacity and not on trade
  ( 4, 'motor_rewinding',          10),  ( 4, 'electrical_contracting', NULL), ( 4, 'panel_manufacturing',      200),
  ( 4, 'earthing_installation',  NULL),  ( 4, 'electrical_testing',     NULL), ( 4, 'ups_service',               20),
  ( 4, 'lighting_supply',        NULL),  ( 4, 'cable_supply',           NULL),

  -- 5 Kaveri Submersible Solutions
  ( 5, 'motor_rewinding',          30),  ( 5, 'submersible_pump_supply',  30), ( 5, 'pump_installation',        30),
  ( 5, 'borewell_drilling',      1000),  ( 5, 'borewell_flushing',      1000), ( 5, 'water_treatment_plant',   5000),
  ( 5, 'tank_cleaning',         30000),  ( 5, 'electrical_contracting', NULL),

  -- 6 Salem Motor Rewinding Centre — capable, but out of range of Bengaluru
  ( 6, 'motor_rewinding',          40),  ( 6, 'gearbox_repair',           55), ( 6, 'pump_installation',         40),
  ( 6, 'motor_supply',             40),  ( 6, 'machine_spares_supply',  NULL), ( 6, 'electrical_contracting',  NULL),
  ( 6, 'bearing_supply',         NULL),  ( 6, 'machine_installation',   NULL),

  -- 7 Blue Drop Water Systems
  ( 7, 'tank_cleaning',         25000),  ( 7, 'water_testing',          NULL), ( 7, 'water_plumbing',         NULL),
  ( 7, 'water_treatment_plant', 10000),  ( 7, 'sewage_treatment_plant', 5000), ( 7, 'rainwater_harvesting',    NULL),
  ( 7, 'water_chemical_supply',  2000),  ( 7, 'cleaning_chemical_supply', 500),

  -- 8 Cauvery Borewell Drilling
  ( 8, 'borewell_drilling',       900),  ( 8, 'borewell_flushing',       900), ( 8, 'submersible_pump_supply',   25),
  ( 8, 'pump_installation',        25),  ( 8, 'earthmoving',            NULL), ( 8, 'rainwater_harvesting',    NULL),
  ( 8, 'civil_construction',     NULL),

  -- 9 Shakti Motors & Controls — the largest winding capacity in the demo
  ( 9, 'motor_rewinding',          60),  ( 9, 'motor_control_automation', 45), ( 9, 'panel_manufacturing',      400),
  ( 9, 'motor_supply',             60),  ( 9, 'pump_installation',        60), ( 9, 'electrical_contracting',  NULL),
  ( 9, 'electrical_testing',     NULL),  ( 9, 'machine_installation',   NULL), ( 9, 'iot_automation',          NULL),

  -- 10 Vertex Elevator Services — lift firms rewind their own traction motors,
  -- which is how a facility company reaches a borewell motor enquiry
  (10, 'lift_maintenance',       NULL),  (10, 'facility_amc',           NULL), (10, 'motor_rewinding',           25),
  (10, 'electrical_contracting', NULL),  (10, 'machine_installation',   NULL), (10, 'fire_system_installation', NULL),
  (10, 'access_control_installation', NULL),

  -- 11 SkyLift Maintenance
  (11, 'lift_maintenance',       NULL),  (11, 'facility_amc',           NULL), (11, 'electrical_contracting',  NULL),
  (11, 'machine_installation',   NULL),  (11, 'painting_service',      20000), (11, 'housekeeping',            NULL),

  -- 12 Prime Facility Solutions
  (12, 'lift_maintenance',       NULL),  (12, 'facility_amc',           NULL), (12, 'housekeeping',            NULL),
  (12, 'security_manpower',      NULL),  (12, 'pest_control',          50000), (12, 'gardening_landscaping',  40000),
  (12, 'waste_collection',       5000),  (12, 'plumbing_service',       NULL), (12, 'painting_service',       30000),

  -- 13 GreenKeep Housekeeping
  (13, 'housekeeping',           NULL),  (13, 'gardening_landscaping', 60000), (13, 'facility_amc',            NULL),
  (13, 'waste_collection',       8000),  (13, 'pest_control',          60000), (13, 'cleaning_chemical_supply', 400),
  (13, 'painting_service',      25000),

  -- 14 SafeGuard Security Services
  (14, 'security_manpower',      NULL),  (14, 'security_services',      NULL), (14, 'cctv_installation',       NULL),
  (14, 'access_control_installation', NULL), (14, 'alarm_installation', NULL), (14, 'fire_extinguisher_amc',   NULL),
  (14, 'facility_amc',           NULL),  (14, 'ppe_supply',             NULL),

  -- 15 PestFree Bengaluru
  (15, 'pest_control',          80000),  (15, 'housekeeping',           NULL), (15, 'waste_collection',        3000),
  (15, 'cleaning_chemical_supply', 300), (15, 'gardening_landscaping', 30000), (15, 'facility_amc',            NULL),

  -- 16 Kovai CNC Works
  (16, 'cnc_machining',           600),  (16, 'turning_machining',       600), (16, 'vmc_machining',            500),
  (16, 'welding_fabrication',    NULL),  (16, 'machine_spares_supply',  NULL), (16, 'cutting_tool_supply',     NULL),
  (16, 'spindle_repair',         NULL),  (16, 'machine_installation',   NULL),

  -- 17 Precision Turn Engineering
  (17, 'turning_machining',       400),  (17, 'cnc_machining',           400), (17, 'vmc_machining',            350),
  (17, 'machine_spares_supply',  NULL),  (17, 'welding_fabrication',    NULL), (17, 'bearing_supply',          NULL),
  (17, 'tool_supply',            NULL),

  -- 18 Annapoorna Machine Tools — machinery firm that also serves the mills
  (18, 'cnc_machining',           800),  (18, 'vmc_machining',           700), (18, 'machine_installation',    NULL),
  (18, 'turning_machining',       800),  (18, 'machine_spares_supply',  NULL), (18, 'spindle_repair',          NULL),
  (18, 'gearbox_repair',           90),  (18, 'engineering_design',     NULL), (18, 'textile_machinery_supply', NULL),

  -- 19 SKM Foundry & Casting
  (19, 'foundry_casting',        2500),  (19, 'cnc_machining',           300), (19, 'turning_machining',        300),
  (19, 'welding_fabrication',    NULL),  (19, 'machine_spares_supply',  NULL), (19, 'steel_supply',              50),
  (19, 'material_handling_supply', 3000),

  -- 20 Coimbatore Spindle Care
  (20, 'spindle_repair',         NULL),  (20, 'machine_installation',   NULL), (20, 'bearing_supply',          NULL),
  (20, 'gearbox_repair',           45),  (20, 'machine_spares_supply',  NULL), (20, 'textile_machinery_supply', NULL),
  (20, 'turning_machining',       250),

  -- 21 Bharath Sheet Metal
  (21, 'sheet_metal_work',       3000),  (21, 'welding_fabrication',    NULL), (21, 'structural_fabrication',    12),
  (21, 'painting_work',         20000),  (21, 'steel_supply',             30), (21, 'machine_spares_supply',   NULL),

  -- 22 Velan Gear & Transmission — gearbox specialist that also rewinds
  (22, 'gearbox_repair',          250),  (22, 'machine_spares_supply',  NULL), (22, 'bearing_supply',          NULL),
  (22, 'machine_installation',   NULL),  (22, 'turning_machining',       400), (22, 'motor_rewinding',           75),
  (22, 'lubricant_supply',       2000),

  -- 23 Sakthi Structural Fabricators
  (23, 'structural_fabrication',   25),  (23, 'welding_fabrication',    NULL), (23, 'sheet_metal_work',        2500),
  (23, 'steel_supply',             80),  (23, 'civil_construction',     NULL), (23, 'painting_work',          40000),
  (23, 'guard_rail_installation', 500),

  -- 24 Tirupur Combed Yarn Traders — trader who also warehouses and delivers
  (24, 'cotton_yarn_supply',    50000),  (24, 'synthetic_yarn_supply', 20000), (24, 'knitted_fabric_supply',  15000),
  (24, 'textile_accessory_supply', NULL), (24, 'agri_trading',         20000), (24, 'warehousing',             8000),
  (24, 'local_delivery',         5000),

  -- 25 Sri Amman Spinning Mills
  (25, 'cotton_yarn_supply',   200000),  (25, 'synthetic_yarn_supply', 80000), (25, 'dyeing_processing',      40000),
  (25, 'knitting_job_work',     30000),  (25, 'woven_fabric_supply',   50000), (25, 'textile_machinery_supply', NULL),
  (25, 'warehousing',           20000),  (25, 'freight_transport',        20),

  -- 26 Kongu Yarn Agencies
  (26, 'cotton_yarn_supply',    30000),  (26, 'synthetic_yarn_supply', 15000), (26, 'woven_fabric_supply',    20000),
  (26, 'textile_accessory_supply', NULL), (26, 'agri_trading',         15000), (26, 'local_delivery',          4000),

  -- 27 Lakshmi Knit Fabrics
  (27, 'knitted_fabric_supply', 40000),  (27, 'knitting_job_work',     40000), (27, 'cotton_yarn_supply',     20000),
  (27, 'dyeing_processing',     20000),  (27, 'embroidery_printing',   30000), (27, 'garment_manufacturing',  20000),
  (27, 'textile_accessory_supply', NULL), (27, 'label_printing',       40000), (27, 'local_delivery',          3000),

  -- 28 Erode Weaving Centre
  (28, 'woven_fabric_supply',   60000),  (28, 'cotton_yarn_supply',    25000), (28, 'dyeing_processing',      20000),
  (28, 'textile_accessory_supply', NULL), (28, 'knitted_fabric_supply', 15000), (28, 'label_printing',        50000),

  -- 29 Colour Craft Dyeing — dyer who also sells the chemistry
  (29, 'dyeing_processing',     25000),  (29, 'dye_supply',             5000), (29, 'chemical_supply',         8000),
  (29, 'embroidery_printing',   20000),  (29, 'knitted_fabric_supply', 10000), (29, 'water_chemical_supply',   3000),

  -- 30 Stitchwell Garments
  (30, 'garment_manufacturing', 50000),  (30, 'embroidery_printing',   50000), (30, 'knitted_fabric_supply',  25000),
  (30, 'textile_accessory_supply', NULL), (30, 'label_printing',      100000), (30, 'carton_manufacturing',   20000),
  (30, 'knitting_job_work',     20000),

  -- 31 Cotton Valley Yarn Mart
  (31, 'cotton_yarn_supply',    45000),  (31, 'synthetic_yarn_supply', 20000), (31, 'woven_fabric_supply',    20000),
  (31, 'textile_accessory_supply', NULL), (31, 'agri_trading',         25000), (31, 'warehousing',             6000),
  (31, 'local_delivery',         4000),

  -- 32 Erode Turmeric Traders — commodity house with its own cold store
  (32, 'turmeric_supply',      100000),  (32, 'agri_trading',         100000), (32, 'spice_supply',           50000),
  (32, 'grain_supply',          50000),  (32, 'oilseed_supply',        30000), (32, 'cold_storage',             300),
  (32, 'woven_sack_supply',     20000),  (32, 'freight_transport',        18), (32, 'warehousing',            10000),

  -- 33 Kongu Agri Commodities
  (33, 'turmeric_supply',       60000),  (33, 'grain_supply',          80000), (33, 'agri_trading',           80000),
  (33, 'spice_supply',          30000),  (33, 'oilseed_supply',        40000), (33, 'animal_feed_supply',     50000),
  (33, 'fertilizer_supply',     40000),  (33, 'warehousing',           12000), (33, 'local_delivery',          8000),

  -- 34 Sathy Spice Exporters
  (34, 'spice_supply',          40000),  (34, 'turmeric_supply',       40000), (34, 'agri_trading',           60000),
  (34, 'oilseed_supply',        20000),  (34, 'cold_storage',            200), (34, 'flexible_packaging',      5000),
  (34, 'woven_sack_supply',     15000),

  -- 35 Salem Grain Mandi Traders
  (35, 'grain_supply',         150000),  (35, 'oilseed_supply',        60000), (35, 'agri_trading',          150000),
  (35, 'animal_feed_supply',    80000),  (35, 'seed_supply',           10000), (35, 'woven_sack_supply',      40000),
  (35, 'warehousing',           25000),  (35, 'freight_transport',        25),

  -- 36 Bhavani Cold Storage — storage firm that also trades and hauls
  (36, 'cold_storage',            500),  (36, 'cold_chain_transport',     25), (36, 'warehousing',            30000),
  (36, 'agri_trading',          50000),  (36, 'turmeric_supply',       30000), (36, 'freight_transport',         20),
  (36, 'waste_management',       2000),

  -- 37 Green Harvest Fertilisers
  (37, 'fertilizer_supply',     80000),  (37, 'seed_supply',            5000), (37, 'agri_trading',           40000),
  (37, 'chemical_supply',       20000),  (37, 'animal_feed_supply',    30000), (37, 'farm_equipment_supply',   NULL),

  -- 38 Chennai Power Systems
  (38, 'dg_supply',               500),  (38, 'dg_maintenance',          500), (38, 'transformer_service',     1000),
  (38, 'electrical_contracting', NULL),  (38, 'panel_manufacturing',    1200), (38, 'ups_service',              100),
  (38, 'electrical_testing',     NULL),  (38, 'earthing_installation',  NULL), (38, 'motor_control_automation',  90),

  -- 39 Metro Electrical Contractors — an electrical firm that rewinds motors
  (39, 'electrical_contracting', NULL),  (39, 'panel_manufacturing',     800), (39, 'earthing_installation',   NULL),
  (39, 'electrical_testing',     NULL),  (39, 'cable_supply',           NULL), (39, 'lighting_supply',         NULL),
  (39, 'motor_rewinding',          45),  (39, 'motor_control_automation',  75), (39, 'ups_service',              40),

  -- 40 SunVolt Solar Solutions
  (40, 'solar_installation',      500),  (40, 'electrical_contracting', NULL), (40, 'panel_manufacturing',      300),
  (40, 'earthing_installation',  NULL),  (40, 'electrical_testing',     NULL), (40, 'ups_service',               50),
  (40, 'iot_automation',         NULL),

  -- 41 Coromandel Freight Lines
  (41, 'freight_transport',        30),  (41, 'heavy_equipment_transport', 60), (41, 'warehousing',            40000),
  (41, 'local_delivery',        10000),  (41, 'cold_chain_transport',     15), (41, 'packers_movers',          NULL),
  (41, 'customs_clearance',      NULL),  (41, 'fleet_hire',             NULL),

  -- 42 QuickShift Packers & Movers
  (42, 'packers_movers',         NULL),  (42, 'local_delivery',         3000), (42, 'courier_service',          500),
  (42, 'freight_transport',        12),  (42, 'warehousing',            5000), (42, 'fleet_hire',              NULL),

  -- 43 Netcore IT Solutions
  (43, 'networking_equipment_supply', NULL), (43, 'it_amc',             NULL), (43, 'cctv_it_integration',     NULL),
  (43, 'computer_supply',        NULL),  (43, 'software_licensing',     NULL), (43, 'data_backup_service',     5000),
  (43, 'telecom_service',        1000),  (43, 'printer_supply',         NULL),

  -- 44 SecureVision CCTV — security firm that overlaps into IT
  (44, 'cctv_installation',      NULL),  (44, 'access_control_installation', NULL), (44, 'alarm_installation', NULL),
  (44, 'fire_system_installation', NULL), (44, 'cctv_it_integration',   NULL), (44, 'networking_equipment_supply', NULL),
  (44, 'it_amc',                 NULL),  (44, 'security_services',      NULL),

  -- 45 BuildRight Civil Contractors
  (45, 'civil_construction',     NULL),  (45, 'interior_renovation',    NULL), (45, 'tiling_flooring',        30000),
  (45, 'waterproofing',         25000),  (45, 'painting_work',         50000), (45, 'earthmoving',             NULL),
  (45, 'sanitary_fitting',       NULL),  (45, 'structural_fabrication',    15), (45, 'plumbing_service',        NULL);

INSERT INTO supplier_capabilities (supplier_id, capability_id, max_capacity_value, capacity_unit, notes)
SELECT d.id, c.id, dc.capacity, c.capacity_unit, 'Declared on the demo supplier profile'
FROM demo_caps dc
JOIN demo_suppliers d ON d.n = dc.n
JOIN capabilities c ON c.code = dc.cap
ON CONFLICT (supplier_id, capability_id) DO UPDATE
SET max_capacity_value = EXCLUDED.max_capacity_value,
    capacity_unit = EXCLUDED.capacity_unit,
    notes = EXCLUDED.notes;

-- Every capability code above must exist, or a supplier would silently end up
-- with no profile and vanish from discovery.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(DISTINCT dc.cap, ', ')
  INTO v_missing
  FROM demo_caps dc
  WHERE NOT EXISTS (SELECT 1 FROM capabilities c WHERE c.code = dc.cap);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Demo seed refers to unknown capabilities: %', v_missing;
  END IF;
END;
$$;

-- The demo's whole argument is that a category does not decide who can do the
-- work. A supplier declaring one or two capabilities cannot make that argument,
-- so hold the seed to the breadth it claims.
DO $$
DECLARE
  v_thin      text;
  v_confined  text;
BEGIN
  SELECT string_agg(n::text || ' (' || cnt || ')', ', ' ORDER BY n)
  INTO v_thin
  FROM (SELECT n, count(*) AS cnt FROM demo_caps GROUP BY n) c
  WHERE cnt < 5 OR cnt > 10;

  IF v_thin IS NOT NULL THEN
    RAISE EXCEPTION
      'Every demo supplier needs 5 to 10 capabilities; these have other counts: %',
      v_thin;
  END IF;

  SELECT string_agg(n::text, ', ' ORDER BY n)
  INTO v_confined
  FROM (
    SELECT dc.n, count(DISTINCT sub.category_id) AS categories
    FROM demo_caps dc
    JOIN capabilities c ON c.code = dc.cap
    JOIN subcategory_capabilities scc ON scc.capability_id = c.id
    JOIN requirement_subcategories sub ON sub.id = scc.subcategory_id
    GROUP BY dc.n
  ) spread
  WHERE categories < 2;

  IF v_confined IS NOT NULL THEN
    RAISE EXCEPTION
      'These demo suppliers are confined to a single category, so discovery has nothing to prove: %',
      v_confined;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Where they work
--
-- Home city first. A few suppliers cover a second city, which is what lets the
-- Tiruppur yarn enquiry reach traders in Erode and Coimbatore while keeping
-- the Bengaluru motor job away from the Salem workshop.
-- ---------------------------------------------------------------------------

DELETE FROM supplier_service_areas WHERE supplier_id IN (SELECT id FROM demo_suppliers);

INSERT INTO supplier_service_areas (supplier_id, city, radius_km, center_lat, center_lng, is_primary)
SELECT d.id, d.city, d.radius_km, d.lat, d.lng, true
FROM demo_suppliers d;

INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT d.id, d.city, d.pincode, false
FROM demo_suppliers d;

-- Buyer pin codes, so the strongest geographic signal is available.
INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT d.id, 'Bengaluru', '560103', false
FROM demo_suppliers d WHERE d.n IN (1, 3, 5, 10, 12, 13, 14, 15, 45);

INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT d.id, 'Coimbatore', '641021', false
FROM demo_suppliers d WHERE d.n IN (16, 17, 18, 19, 20);

INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT d.id, 'Tiruppur', '641604', false
FROM demo_suppliers d WHERE d.n IN (24, 25, 27, 29, 30);

INSERT INTO supplier_service_areas (supplier_id, city, pincode, is_primary)
SELECT d.id, 'Erode', '638003', false
FROM demo_suppliers d WHERE d.n IN (32, 33, 34);

-- Second-city coverage.
INSERT INTO supplier_service_areas (supplier_id, city, radius_km, is_primary)
SELECT d.id, x.city, 60, false
FROM demo_suppliers d
JOIN (VALUES
  (26, 'Tiruppur'),    -- Erode yarn agency sells into Tiruppur
  (31, 'Tiruppur'),    -- Coimbatore yarn mart likewise
  (35, 'Erode'),       -- Salem grain trader covers Erode mandi
  (36, 'Salem'),
  ( 6, 'Erode'),
  ( 9, 'Tiruppur'),
  (22, 'Salem'),
  (41, 'Bengaluru'),
  (41, 'Coimbatore'),
  (38, 'Bengaluru')
) AS x(n, city) ON x.n = d.n;

-- ---------------------------------------------------------------------------
-- Requirements and RFQs
--
-- Written the way a buyer would state them, then classified by the same
-- function the intake wizard uses, so the taxonomy assignment here is the
-- taxonomy assignment a real user would get.
-- ---------------------------------------------------------------------------

-- 1. Sunrise Residency: the borewell motor has burnt out again.
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, requirement_mode, status,
  title, description, subcategory_id, quantity, unit, attributes, quality, commercial,
  required_by_mode, required_by_days, fulfilment_mode,
  delivery_city, delivery_pincode, delivery_line1, site_notes, is_demo, published_at
) VALUES (
  '0d700000-0000-4000-8000-000000000001',
  '0da00000-0000-4000-8000-000000000001',
  '0db00000-0000-4000-8000-000000000011',
  'SERVICE', 'REPAIR_MAINTENANCE', 'RFQ_CREATED',
  '12.5 HP borewell submersible motor rewinding',
  'Block B borewell motor stopped last Thursday. Electrician says the winding has burnt. 12.5 HP submersible, three phase. Motor has been pulled out and is in the pump room. We need it back in service quickly — the block is on tanker water.',
  (SELECT id FROM requirement_subcategories WHERE code = 'motor_rewinding'),
  1, 'motor',
  '{"motor_hp": 12.5, "phase": "Three phase", "pump_type": "Submersible", "winding_type": "Copper", "pickup_required": true, "failure_symptom": "Burnt winding"}'::jsonb,
  '{"warrantyMonths": 12, "testReportRequired": true}'::jsonb,
  '{"paymentTerms": "On completion", "gstRequired": true}'::jsonb,
  'WITHIN_DAYS', 5, 'SUPPLIER_ONSITE',
  'Bengaluru', '560103', 'Sunrise Residency, Sarjapur Road',
  'Pump room is in the basement of Block B. Watchman has the key.',
  true, now() - interval '4 days'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    created_by = EXCLUDED.created_by,
    requirement_type = EXCLUDED.requirement_type,
    requirement_mode = EXCLUDED.requirement_mode,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    subcategory_id = EXCLUDED.subcategory_id,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    attributes = EXCLUDED.attributes,
    quality = EXCLUDED.quality,
    commercial = EXCLUDED.commercial,
    required_by_mode = EXCLUDED.required_by_mode,
    required_by_days = EXCLUDED.required_by_days,
    fulfilment_mode = EXCLUDED.fulfilment_mode,
    delivery_city = EXCLUDED.delivery_city,
    delivery_pincode = EXCLUDED.delivery_pincode,
    delivery_line1 = EXCLUDED.delivery_line1,
    site_notes = EXCLUDED.site_notes,
    is_demo = true,
    published_at = EXCLUDED.published_at;

-- 2. Sunrise Residency: annual lift contract is up for renewal.
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, requirement_mode, status,
  title, description, subcategory_id, quantity, unit, attributes, quality, commercial,
  required_by_mode, required_by_days, fulfilment_mode,
  delivery_city, delivery_pincode, delivery_line1, is_demo, published_at
) VALUES (
  '0d700000-0000-4000-8000-000000000002',
  '0da00000-0000-4000-8000-000000000001',
  '0db00000-0000-4000-8000-000000000012',
  'SERVICE', 'AMC', 'RFQ_CREATED',
  'Annual maintenance contract for 2 passenger lifts',
  'Our lift AMC expires next month. Two 8-passenger lifts, one in each block, both about six years old. We want a comprehensive contract including spares, with monthly service visits and emergency call-out.',
  (SELECT id FROM requirement_subcategories WHERE code = 'lift_amc'),
  2, 'lifts',
  '{"lift_count": 2, "amc_type": "Comprehensive", "service_frequency": "Monthly", "contract_months": 12, "materials_included": true, "property_type": "Residential"}'::jsonb,
  '{"responseTimeHours": 4}'::jsonb,
  '{"paymentTerms": "Quarterly in advance", "gstRequired": true}'::jsonb,
  'WITHIN_DAYS', 25, 'SUPPLIER_ONSITE',
  'Bengaluru', '560103', 'Sunrise Residency, Sarjapur Road',
  true, now() - interval '2 days'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    created_by = EXCLUDED.created_by,
    requirement_type = EXCLUDED.requirement_type,
    requirement_mode = EXCLUDED.requirement_mode,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    subcategory_id = EXCLUDED.subcategory_id,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    attributes = EXCLUDED.attributes,
    quality = EXCLUDED.quality,
    commercial = EXCLUDED.commercial,
    required_by_mode = EXCLUDED.required_by_mode,
    required_by_days = EXCLUDED.required_by_days,
    fulfilment_mode = EXCLUDED.fulfilment_mode,
    delivery_city = EXCLUDED.delivery_city,
    delivery_pincode = EXCLUDED.delivery_pincode,
    delivery_line1 = EXCLUDED.delivery_line1,
    is_demo = true,
    published_at = EXCLUDED.published_at;

-- 3. Kovai Precision: job work for an export order.
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, requirement_mode, status,
  title, description, subcategory_id, quantity, unit, attributes, quality, commercial,
  required_by_mode, required_by_days, fulfilment_mode,
  delivery_city, delivery_pincode, delivery_line1, is_demo, published_at
) VALUES (
  '0d700000-0000-4000-8000-000000000003',
  '0da00000-0000-4000-8000-000000000002',
  '0db00000-0000-4000-8000-000000000021',
  'SERVICE', 'JOB_WORK', 'RFQ_CREATED',
  'CNC turning job work — 500 pieces EN8 shaft',
  'Need CNC turning for 500 pieces of EN8 shaft, 45 mm diameter, 180 mm length. Tolerance 0.02 mm on the bearing seat. Drawing available. Material will be supplied by us. Inspection report needed with each batch.',
  (SELECT id FROM requirement_subcategories WHERE code = 'cnc_machining'),
  500, 'pieces',
  '{"batch_size": 500, "material": "EN8", "tolerance_mm": 0.02, "machine_type": "CNC turning centre", "drawing_available": true, "inspection_report": true}'::jsonb,
  '{"inspectionRequired": true}'::jsonb,
  '{"paymentTerms": "30 days", "gstRequired": true}'::jsonb,
  'WITHIN_DAYS', 15, 'BUYER_PICKUP',
  'Coimbatore', '641021', 'Kovai Precision Components, SIDCO Industrial Estate',
  true, now() - interval '6 days'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    created_by = EXCLUDED.created_by,
    requirement_type = EXCLUDED.requirement_type,
    requirement_mode = EXCLUDED.requirement_mode,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    subcategory_id = EXCLUDED.subcategory_id,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    attributes = EXCLUDED.attributes,
    quality = EXCLUDED.quality,
    commercial = EXCLUDED.commercial,
    required_by_mode = EXCLUDED.required_by_mode,
    required_by_days = EXCLUDED.required_by_days,
    fulfilment_mode = EXCLUDED.fulfilment_mode,
    delivery_city = EXCLUDED.delivery_city,
    delivery_pincode = EXCLUDED.delivery_pincode,
    delivery_line1 = EXCLUDED.delivery_line1,
    is_demo = true,
    published_at = EXCLUDED.published_at;

-- 4. Sri Lakshmi: yarn for a knitwear order.
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, requirement_mode, status,
  title, description, subcategory_id, quantity, unit, attributes, quality, commercial,
  required_by_mode, required_by_days, fulfilment_mode,
  delivery_city, delivery_pincode, delivery_line1, is_demo, published_at
) VALUES (
  '0d700000-0000-4000-8000-000000000004',
  '0da00000-0000-4000-8000-000000000003',
  '0db00000-0000-4000-8000-000000000031',
  'PRODUCT', 'PRODUCT_MATERIAL', 'RFQ_CREATED',
  '40s combed compact cotton yarn — 2000 kg',
  'Requirement of 2000 kg 40s combed compact cotton yarn for a knitwear export order. Single lot preferred. Need uster report and OEKO-TEX certification. Delivery to our Tiruppur unit.',
  (SELECT id FROM requirement_subcategories WHERE code = 'cotton_yarn'),
  2000, 'kg',
  '{"yarn_count": "40s", "yarn_process": "Combed", "fiber_type": "Cotton", "lot_type": "Single lot", "certification": "OEKO-TEX", "package_type": "Cone"}'::jsonb,
  '{"testReportRequired": true, "certification": "OEKO-TEX"}'::jsonb,
  '{"paymentTerms": "45 days", "gstRequired": true}'::jsonb,
  'WITHIN_DAYS', 12, 'SUPPLIER_DELIVERY',
  'Tiruppur', '641604', 'Sri Lakshmi Knitwear Exports, Mangalam Road',
  true, now() - interval '9 days'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    created_by = EXCLUDED.created_by,
    requirement_type = EXCLUDED.requirement_type,
    requirement_mode = EXCLUDED.requirement_mode,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    subcategory_id = EXCLUDED.subcategory_id,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    attributes = EXCLUDED.attributes,
    quality = EXCLUDED.quality,
    commercial = EXCLUDED.commercial,
    required_by_mode = EXCLUDED.required_by_mode,
    required_by_days = EXCLUDED.required_by_days,
    fulfilment_mode = EXCLUDED.fulfilment_mode,
    delivery_city = EXCLUDED.delivery_city,
    delivery_pincode = EXCLUDED.delivery_pincode,
    delivery_line1 = EXCLUDED.delivery_line1,
    is_demo = true,
    published_at = EXCLUDED.published_at;

-- 5. Bharathi Agro: turmeric for onward sale.
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, requirement_mode, status,
  title, description, subcategory_id, quantity, unit, attributes, quality, commercial,
  required_by_mode, required_by_days, fulfilment_mode,
  delivery_city, delivery_pincode, delivery_line1, is_demo, published_at
) VALUES (
  '0d700000-0000-4000-8000-000000000005',
  '0da00000-0000-4000-8000-000000000004',
  '0db00000-0000-4000-8000-000000000041',
  'PRODUCT', 'COMMODITY_TRADING', 'RFQ_CREATED',
  'Turmeric finger 5000 kg — Erode variety',
  'Looking for 5000 kg turmeric finger, Erode variety, good colour. Curcumin above 3 percent and moisture below 10 percent. Lab report required. Will collect from the trader godown myself.',
  (SELECT id FROM requirement_subcategories WHERE code = 'turmeric'),
  5000, 'kg',
  '{"variety": "Erode local", "form": "Finger", "curcumin_percent": 3, "moisture_percent": 10, "quality_grade": "Grade A", "lab_report_required": true, "packaging_type": "Gunny bag"}'::jsonb,
  '{"testReportRequired": true}'::jsonb,
  '{"paymentTerms": "Advance", "gstRequired": true}'::jsonb,
  'FLEXIBLE', NULL, 'BUYER_PICKUP',
  'Erode', '638003', 'Bharathi Agro Trading, Perundurai Road',
  true, now() - interval '1 day'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    created_by = EXCLUDED.created_by,
    requirement_type = EXCLUDED.requirement_type,
    requirement_mode = EXCLUDED.requirement_mode,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    subcategory_id = EXCLUDED.subcategory_id,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    attributes = EXCLUDED.attributes,
    quality = EXCLUDED.quality,
    commercial = EXCLUDED.commercial,
    required_by_mode = EXCLUDED.required_by_mode,
    required_by_days = EXCLUDED.required_by_days,
    fulfilment_mode = EXCLUDED.fulfilment_mode,
    delivery_city = EXCLUDED.delivery_city,
    delivery_pincode = EXCLUDED.delivery_pincode,
    delivery_line1 = EXCLUDED.delivery_line1,
    site_notes = EXCLUDED.site_notes,
    is_demo = true,
    published_at = EXCLUDED.published_at;

INSERT INTO rfqs (
  id, requirement_id, organization_id, status, reveal_status, sourcing_mode,
  title, quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
  min_quotes_required, created_by, is_demo
) VALUES
  ('0d800000-0000-4000-8000-000000000001', '0d700000-0000-4000-8000-000000000001',
   '0da00000-0000-4000-8000-000000000001', 'DRAFT', 'BLIND', 'IDENTITY_PROTECTED',
   'Borewell motor rewinding — 12.5 HP',
   now() + interval '3 days', now() + interval '6 days', true, 3,
   '0db00000-0000-4000-8000-000000000011', true),

  ('0d800000-0000-4000-8000-000000000002', '0d700000-0000-4000-8000-000000000002',
   '0da00000-0000-4000-8000-000000000001', 'DRAFT', 'BLIND', 'IDENTITY_PROTECTED',
   'Lift AMC — 2 passenger lifts',
   now() + interval '10 days', now() + interval '18 days', true, 3,
   '0db00000-0000-4000-8000-000000000012', true),

  ('0d800000-0000-4000-8000-000000000003', '0d700000-0000-4000-8000-000000000003',
   '0da00000-0000-4000-8000-000000000002', 'DRAFT', 'BLIND', 'IDENTITY_PROTECTED',
   'CNC turning job work — 500 pcs EN8 shaft',
   now() + interval '4 days', now() + interval '8 days', true, 3,
   '0db00000-0000-4000-8000-000000000021', true),

  ('0d800000-0000-4000-8000-000000000004', '0d700000-0000-4000-8000-000000000004',
   '0da00000-0000-4000-8000-000000000003', 'DRAFT', 'BLIND', 'IDENTITY_PROTECTED',
   '40s combed compact cotton yarn — 2000 kg',
   now() + interval '2 days', now() + interval '5 days', true, 3,
   '0db00000-0000-4000-8000-000000000031', true),

  ('0d800000-0000-4000-8000-000000000005', '0d700000-0000-4000-8000-000000000005',
   '0da00000-0000-4000-8000-000000000004', 'DRAFT', 'BLIND', 'IDENTITY_PROTECTED',
   'Turmeric finger — 5000 kg',
   now() + interval '7 days', now() + interval '11 days', false, 3,
   '0db00000-0000-4000-8000-000000000041', true)
ON CONFLICT (id) DO UPDATE
SET requirement_id = EXCLUDED.requirement_id,
    organization_id = EXCLUDED.organization_id,
    status = EXCLUDED.status,
    reveal_status = EXCLUDED.reveal_status,
    sourcing_mode = EXCLUDED.sourcing_mode,
    title = EXCLUDED.title,
    quote_deadline = EXCLUDED.quote_deadline,
    evaluation_deadline = EXCLUDED.evaluation_deadline,
    buyer_anonymous_to_suppliers = EXCLUDED.buyer_anonymous_to_suppliers,
    min_quotes_required = EXCLUDED.min_quotes_required,
    created_by = EXCLUDED.created_by,
    is_demo = true;

-- Committees. The individual trader has none — he decides alone, and the
-- tally view should show that as honestly as it shows a five-member vote.
INSERT INTO committee_assignments (id, rfq_id, profile_id) VALUES
  ('0d900000-0000-4000-8000-000000000011', '0d800000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000012'),
  ('0d900000-0000-4000-8000-000000000012', '0d800000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000013'),
  ('0d900000-0000-4000-8000-000000000013', '0d800000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000014'),

  ('0d900000-0000-4000-8000-000000000021', '0d800000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000012'),
  ('0d900000-0000-4000-8000-000000000022', '0d800000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000013'),

  ('0d900000-0000-4000-8000-000000000031', '0d800000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000022'),

  ('0d900000-0000-4000-8000-000000000041', '0d800000-0000-4000-8000-000000000004', '0db00000-0000-4000-8000-000000000032'),
  ('0d900000-0000-4000-8000-000000000042', '0d800000-0000-4000-8000-000000000004', '0db00000-0000-4000-8000-000000000033')
ON CONFLICT (rfq_id, profile_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Approval policies
-- ---------------------------------------------------------------------------

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  ('0da10000-0000-4000-8000-000000000001', '0da00000-0000-4000-8000-000000000001',
   'COMMUNITY_SIMPLE_MAJORITY', '{"type": "simple_majority", "minVotes": 2}'::jsonb, true),
  ('0da10000-0000-4000-8000-000000000002', '0da00000-0000-4000-8000-000000000002',
   'MANAGER_ONLY', '{"type": "manager_only"}'::jsonb, true),
  ('0da10000-0000-4000-8000-000000000003', '0da00000-0000-4000-8000-000000000003',
   'COMMUNITY_SIMPLE_MAJORITY', '{"type": "simple_majority", "minVotes": 2}'::jsonb, true),
  ('0da10000-0000-4000-8000-000000000004', '0da00000-0000-4000-8000-000000000004',
   'MANAGER_ONLY', '{"type": "manager_only"}'::jsonb, true)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    policy_type = EXCLUDED.policy_type,
    threshold = EXCLUDED.threshold,
    is_default = EXCLUDED.is_default;

-- ---------------------------------------------------------------------------
-- Scenarios and quick-login accounts
-- ---------------------------------------------------------------------------

INSERT INTO demo_scenarios (
  code, title, narrative, buyer_type, organization_id, requirement_id, rfq_id,
  stage_label, target_stage, invite_limit, sort_order
) VALUES
  ('sunrise_motor',
   'Community borewell motor rewinding',
   'A 96-flat association''s borewell motor has burnt out. Three committee members vote on blind quotes, and because they buy for many households their vote carries the weight of a community rather than an individual. Watch the 10 HP workshop get excluded on capacity while the 20, 25 and 30 HP shops are invited.',
   'COMMUNITY', '0da00000-0000-4000-8000-000000000001',
   '0d700000-0000-4000-8000-000000000001', '0d800000-0000-4000-8000-000000000001',
   'Committee evaluating blind quotes', 'EVALUATION', 6, 1),

  ('sunrise_lift_amc',
   'Annual lift maintenance contract',
   'The same association renewing a lift AMC. A short, specialised market: only three vendors in the city hold the capability, which is exactly the minimum this buyer requires. Bids are in and waiting to be scored.',
   'COMMUNITY', '0da00000-0000-4000-8000-000000000001',
   '0d700000-0000-4000-8000-000000000002', '0d800000-0000-4000-8000-000000000002',
   'Quotes received, not yet evaluated', 'QUOTING', 6, 2),

  ('kovai_cnc',
   'MSME job work, award locked',
   'An owner-run machine shop placing CNC turning job work for an export order. The owner decides with one partner. The award is locked with the vote tally frozen, but identities are still hidden — the reveal is a separate, deliberate act.',
   'MSME', '0da00000-0000-4000-8000-000000000002',
   '0d700000-0000-4000-8000-000000000003', '0d800000-0000-4000-8000-000000000003',
   'Award locked, identities still blind', 'AWARDED', 6, 3),

  ('lakshmi_yarn',
   'Enterprise yarn purchase, identities revealed',
   'A knitwear exporter buying 2,000 kg of combed cotton yarn. A formal procurement committee, the heaviest voting power on the platform, and the full arc completed: scored, voted, awarded, revealed. The audit trail shows who won and why, with the alias they held before the reveal.',
   'ENTERPRISE', '0da00000-0000-4000-8000-000000000003',
   '0d700000-0000-4000-8000-000000000004', '0d800000-0000-4000-8000-000000000004',
   'Awarded and revealed', 'REVEALED', 6, 4),

  ('bharathi_turmeric',
   'Individual trader sourcing turmeric',
   'One man buying 5,000 kg of turmeric. No committee, one vote, and he has waived his own anonymity — suppliers can see who is asking. Suppliers have just been found; no bids yet. This is the lightest possible use of the platform.',
   'INDIVIDUAL', '0da00000-0000-4000-8000-000000000004',
   '0d700000-0000-4000-8000-000000000005', '0d800000-0000-4000-8000-000000000005',
   'Suppliers invited, awaiting quotes', 'SOURCING', 5, 5)
ON CONFLICT (code) DO UPDATE
SET title = EXCLUDED.title,
    narrative = EXCLUDED.narrative,
    buyer_type = EXCLUDED.buyer_type,
    organization_id = EXCLUDED.organization_id,
    requirement_id = EXCLUDED.requirement_id,
    rfq_id = EXCLUDED.rfq_id,
    stage_label = EXCLUDED.stage_label,
    target_stage = EXCLUDED.target_stage,
    invite_limit = EXCLUDED.invite_limit,
    sort_order = EXCLUDED.sort_order;

-- Every account row must name either an organization or a supplier. The admin
-- is nominally attached to Sunrise; the ADMIN persona is what actually grants
-- the platform-wide view.
INSERT INTO demo_accounts (email, label, persona, description, organization_id, profile_id, scenario_code, sort_order) VALUES
  ('admin@otp.test',              'Platform admin',                 'ADMIN',         'Sees everything. Use this to inspect the audit trail or reset the demo.', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000001', NULL,                 1),
  ('secretary@sunrise.test',      'Sunrise — Secretary (manager)',  'BUYER_MANAGER', 'Raises requirements, sets evaluation weights, locks and reveals awards.', '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000011', 'sunrise_motor',     10),
  ('treasurer@sunrise.test',      'Sunrise — Treasurer',            'COMMITTEE',     'Votes on blind quotes. Community voting power.',                          '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000012', 'sunrise_motor',     11),
  ('member1@sunrise.test',        'Sunrise — Committee member',     'COMMITTEE',     'Votes on blind quotes.',                                                 '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000013', 'sunrise_motor',     12),
  ('member2@sunrise.test',        'Sunrise — Committee member',     'COMMITTEE',     'Votes on blind quotes.',                                                 '0da00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000014', 'sunrise_motor',     13),
  ('owner@kovaiprecision.test',   'Kovai Precision — Owner',        'BUYER_OWNER',   'Owner-run MSME. Decides with one partner.',                              '0da00000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000021', 'kovai_cnc',         20),
  ('partner@kovaiprecision.test', 'Kovai Precision — Partner',      'COMMITTEE',     'Second opinion on the award.',                                           '0da00000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000022', 'kovai_cnc',         21),
  ('procurement@srilakshmi.test', 'Sri Lakshmi — Procurement head', 'BUYER_MANAGER', 'Enterprise procurement. Heaviest voting power.',                         '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000031', 'lakshmi_yarn',      30),
  ('quality@srilakshmi.test',     'Sri Lakshmi — Quality',          'COMMITTEE',     'Votes on technical fit and certification.',                              '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000032', 'lakshmi_yarn',      31),
  ('finance@srilakshmi.test',     'Sri Lakshmi — Finance',          'COMMITTEE',     'Votes on price and payment terms.',                                      '0da00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000033', 'lakshmi_yarn',      32),
  ('bharathi@agrotrade.test',     'Bharathi Agro — Proprietor',     'BUYER_OWNER',   'Individual trader. No committee, one vote.',                             '0da00000-0000-4000-8000-000000000004', '0db00000-0000-4000-8000-000000000041', 'bharathi_turmeric', 40)
ON CONFLICT (email) DO UPDATE
SET label = EXCLUDED.label,
    persona = EXCLUDED.persona,
    description = EXCLUDED.description,
    organization_id = EXCLUDED.organization_id,
    supplier_id = EXCLUDED.supplier_id,
    profile_id = EXCLUDED.profile_id,
    scenario_code = EXCLUDED.scenario_code,
    sort_order = EXCLUDED.sort_order;

-- Supplier logins, labelled by what they can do so a presenter can pick the
-- right one to show the bidder's side of a given scenario.
INSERT INTO demo_accounts (email, label, persona, description, supplier_id, profile_id, scenario_code, sort_order)
SELECT
  'supplier' || lpad(d.n::text, 2, '0') || '@otpdemo.test',
  d.name || ' (' || d.city || ')',
  'SUPPLIER',
  'Capabilities: ' || (
    SELECT string_agg(c.name, ', ' ORDER BY c.name)
    FROM supplier_capabilities sc JOIN capabilities c ON c.id = sc.capability_id
    WHERE sc.supplier_id = d.id
  ),
  d.id,
  ('0db10000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  CASE
    WHEN d.n IN (1, 2, 3, 4, 5)      THEN 'sunrise_motor'
    WHEN d.n IN (10, 11, 12)         THEN 'sunrise_lift_amc'
    WHEN d.n IN (16, 17, 18, 19)     THEN 'kovai_cnc'
    WHEN d.n IN (24, 25, 26, 31)     THEN 'lakshmi_yarn'
    WHEN d.n IN (32, 33, 34, 35)     THEN 'bharathi_turmeric'
  END,
  100 + d.n
FROM demo_suppliers d
ON CONFLICT (email) DO UPDATE
SET label = EXCLUDED.label,
    persona = EXCLUDED.persona,
    description = EXCLUDED.description,
    supplier_id = EXCLUDED.supplier_id,
    profile_id = EXCLUDED.profile_id,
    scenario_code = EXCLUDED.scenario_code,
    sort_order = EXCLUDED.sort_order;

INSERT INTO demo_accounts (email, label, persona, description, supplier_id, profile_id, scenario_code, sort_order)
SELECT
  'contact' || lpad(d.n::text, 2, '0') || '@otpdemo.test',
  d.name || ' [Contact] (' || d.city || ')',
  'SUPPLIER',
  'Direct Contact for ' || d.name,
  d.id,
  ('0db20000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid,
  'contact_login',
  200 + d.n
FROM demo_suppliers d
ON CONFLICT (email) DO UPDATE
SET label = EXCLUDED.label,
    persona = EXCLUDED.persona,
    description = EXCLUDED.description,
    supplier_id = EXCLUDED.supplier_id,
    profile_id = EXCLUDED.profile_id,
    scenario_code = EXCLUDED.scenario_code,
    sort_order = EXCLUDED.sort_order;


-- ---------------------------------------------------------------------------
-- Turn demo mode on and record the seed
-- ---------------------------------------------------------------------------

UPDATE demo_settings
SET demo_mode_enabled = true,
    demo_seed = 'otp-demo-2026',
    updated_at = now()
WHERE id = true;

-- Fill in anything the taxonomy can derive that the seed left implicit.
SELECT public.backfill_taxonomy();

COMMIT;

-- ---------------------------------------------------------------------------
-- Stage the scenarios by running the real thing
--
-- Each scenario is advanced by the same RPCs the application calls, acting as
-- the buyer who owns it. Outside a transaction because staging touches enum
-- values added by earlier migrations and calls functions that commit audit
-- events of their own.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_sc     record;
  v_result jsonb;
BEGIN
  FOR v_sc IN
    SELECT
      s.code,
      s.target_stage,
      -- A manager or owner of the buying organization. Raising a requirement
      -- and running the sourcing for it are different rights: the lift AMC
      -- here was raised by a committee member who cannot invite suppliers,
      -- which is the separation working rather than a gap in the seed.
      (
        SELECT p.auth_user_id
        FROM organization_members m
        JOIN profiles p ON p.id = m.profile_id
        WHERE m.organization_id = r.organization_id
          AND m.role IN ('OWNER', 'MANAGER')
        ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END, p.email
        LIMIT 1
      ) AS auth_user_id
    FROM demo_scenarios s
    JOIN rfqs r ON r.id = s.rfq_id
    ORDER BY s.sort_order
  LOOP
    IF v_sc.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'Scenario % has no manager to act as', v_sc.code;
    END IF;

    -- Act as that manager, so staging goes through exactly the authorization
    -- the application enforces.
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_sc.auth_user_id::text, 'role', 'authenticated')::text,
      true
    );

    v_result := public.demo_stage_scenario(v_sc.code);
    RAISE NOTICE 'staged % -> %', v_sc.code, v_result;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

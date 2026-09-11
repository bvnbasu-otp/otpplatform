-- Migration 00138: Seed Contact Supplier Logins (contact01 - contact45)
-- Ensures that all seeded suppliers can authenticate using their listed contact_email
-- ('contactXX@otpdemo.test') with password 'password', with valid profile and supplier_users ownership.

BEGIN;

SET search_path = public, extensions, auth;

-- 1. Ensure all 45 demo suppliers exist in suppliers table (idempotent upsert)
CREATE TEMP TABLE tmp_demo_suppliers (
  n           integer,
  id          uuid,
  name        text,
  source      supplier_source,
  city        text,
  pincode     text,
  lat         double precision,
  lng         double precision,
  radius_km   integer,
  rating      numeric(3, 2),
  jobs        integer,
  on_time     numeric(4, 1),
  dispute     numeric(4, 1),
  verification supplier_verification_status
) ON COMMIT DROP;

INSERT INTO tmp_demo_suppliers VALUES
  (1,  '0d500000-0000-4000-8000-000000000001', 'Aqua Prime Borewell Works',          'LOCAL_REGISTRY', 'Bengaluru',  '560037', 12.9698, 77.7500, 25, 4.65, 142, 94.2, 0.8, 'PLATFORM_VERIFIED'),
  (2,  '0d500000-0000-4000-8000-000000000002', 'Sri Venkateswara Motor Winding',     'DIRECT',         'Bengaluru',  '560048', 12.9850, 77.7200, 20, 4.40,  98, 91.0, 1.4, 'DOCUMENT_VERIFIED'),
  (3,  '0d500000-0000-4000-8000-000000000003', 'Deep Earth Pump Services',           'LOCAL_REGISTRY', 'Bengaluru',  '560066', 12.9600, 77.7400, 15, 4.80, 210, 96.5, 0.3, 'PLATFORM_VERIFIED'),
  (4,  '0d500000-0000-4000-8000-000000000004', 'Nandi Electricals & Rewinding',      'REFERRAL',       'Bengaluru',  '560036', 12.9900, 77.7000, 18, 3.90,  45, 78.0, 4.5, 'SELF_DECLARED'),
  (5,  '0d500000-0000-4000-8000-000000000005', 'Kaveri Submersible Solutions',       'DIRECT',         'Bengaluru',  '560067', 12.9500, 77.7600, 30, 4.25,  76, 88.0, 2.1, 'DOCUMENT_VERIFIED'),
  (6,  '0d500000-0000-4000-8000-000000000006', 'Salem Motor Rewinding Centre',       'ASSOCIATION',    'Salem',      '636001', 11.6643, 78.1460, 40, 4.50, 120, 93.0, 1.0, 'PLATFORM_VERIFIED'),
  (7,  '0d500000-0000-4000-8000-000000000007', 'Blue Drop Water Systems',            'LOCAL_REGISTRY', 'Bengaluru',  '560043', 13.0100, 77.6500, 25, 4.15,  60, 85.0, 3.0, 'DOCUMENT_VERIFIED'),
  (8,  '0d500000-0000-4000-8000-000000000008', 'Cauvery Borewell Drilling',          'DIRECT',         'Bengaluru',  '560075', 12.9800, 77.6300, 35, 4.30,  88, 89.0, 1.8, 'DOCUMENT_VERIFIED'),
  (9,  '0d500000-0000-4000-8000-000000000009', 'Shakti Motors & Controls',           'REFERRAL',       'Coimbatore', '641018', 11.0000, 76.9600, 40, 4.60, 150, 95.0, 0.7, 'PLATFORM_VERIFIED'),
  (10, '0d500000-0000-4000-8000-000000000010', 'Vertex Elevator Services',           'DIRECT',         'Bengaluru',  '560001', 12.9716, 77.5946, 30, 4.75, 165, 96.0, 0.5, 'PLATFORM_VERIFIED'),
  (11, '0d500000-0000-4000-8000-000000000011', 'SkyLift Maintenance',                'ASSOCIATION',    'Bengaluru',  '560025', 12.9600, 77.6000, 25, 4.20,  70, 86.0, 2.5, 'DOCUMENT_VERIFIED'),
  (12, '0d500000-0000-4000-8000-000000000012', 'Prime Facility Solutions',           'REFERRAL',       'Bengaluru',  '560008', 12.9700, 77.6200, 35, 4.10,  55, 84.0, 3.2, 'SELF_DECLARED'),
  (13, '0d500000-0000-4000-8000-000000000013', 'GreenKeep Housekeeping',             'LOCAL_REGISTRY', 'Bengaluru',  '560034', 12.9300, 77.6200, 20, 4.35,  85, 90.0, 1.5, 'DOCUMENT_VERIFIED'),
  (14, '0d500000-0000-4000-8000-000000000014', 'SafeGuard Security Services',        'DIRECT',         'Bengaluru',  '560068', 12.9100, 77.6400, 30, 4.55, 130, 93.5, 1.0, 'PLATFORM_VERIFIED'),
  (15, '0d500000-0000-4000-8000-000000000015', 'PestFree Bengaluru',                 'ASSOCIATION',    'Bengaluru',  '560076', 12.9000, 77.6000, 25, 4.00,  40, 80.0, 4.0, 'SELF_DECLARED'),
  (16, '0d500000-0000-4000-8000-000000000016', 'Kovai CNC Works',                    'LOCAL_REGISTRY', 'Coimbatore', '641006', 11.0200, 76.9800, 30, 4.65, 140, 94.0, 0.8, 'PLATFORM_VERIFIED'),
  (17, '0d500000-0000-4000-8000-000000000017', 'Precision Turn Engineering',         'DIRECT',         'Coimbatore', '641037', 11.0100, 76.9900, 25, 4.30,  80, 88.0, 2.0, 'DOCUMENT_VERIFIED'),
  (18, '0d500000-0000-4000-8000-000000000018', 'Annapoorna Machine Tools',         'ASSOCIATION',    'Coimbatore', '641045', 10.9950, 76.9400, 35, 4.70, 184, 96.0, 0.6, 'PLATFORM_VERIFIED'),
  (19, '0d500000-0000-4000-8000-000000000019', 'SKM Foundry & Casting',            'DIRECT',         'Coimbatore', '641062', 11.0700, 76.9200, 40, 4.00,  91, 80.0, 3.4, 'DOCUMENT_VERIFIED'),
  (20, '0d500000-0000-4000-8000-000000000020', 'Coimbatore Spindle Care',          'REFERRAL',       'Coimbatore', '641015', 11.0080, 77.0300, 28, 4.35,  55, 90.0, 1.6, 'DOCUMENT_VERIFIED'),
  (21, '0d500000-0000-4000-8000-000000000021', 'Bharath Sheet Metal',              'LOCAL_REGISTRY', 'Coimbatore', '641029', 11.0400, 76.9700, 25, 3.85,  43, 78.0, 4.8, 'SELF_DECLARED'),
  (22, '0d500000-0000-4000-8000-000000000022', 'Velan Gear & Transmission',        'DIRECT',         'Coimbatore', '641103', 11.1200, 77.0500, 32, 4.45, 112, 92.0, 1.3, 'PLATFORM_VERIFIED'),
  (23, '0d500000-0000-4000-8000-000000000023', 'Sakthi Structural Fabricators',    'ASSOCIATION',    'Salem',      '636005', 11.6800, 78.1300, 45, 4.10,  79, 83.0, 2.9, 'DOCUMENT_VERIFIED'),
  (24, '0d500000-0000-4000-8000-000000000024', 'Tirupur Combed Yarn Traders',      'DIRECT',         'Tiruppur',   '641604', 11.1085, 77.3411, 30, 4.40,  95, 90.0, 1.5, 'DOCUMENT_VERIFIED'),
  (25, '0d500000-0000-4000-8000-000000000025', 'Sri Amman Spinning Mills',         'ASSOCIATION',    'Tiruppur',   '641606', 11.0900, 77.3600, 60, 4.80, 231, 97.0, 0.4, 'PLATFORM_VERIFIED'),
  (26, '0d500000-0000-4000-8000-000000000026', 'Kongu Yarn Agencies',              'LOCAL_REGISTRY', 'Erode',      '638001', 11.3410, 77.7172, 55, 4.05,  62, 82.0, 3.2, 'SELF_DECLARED'),
  (27, '0d500000-0000-4000-8000-000000000027', 'Lakshmi Knit Fabrics',             'REFERRAL',       'Tiruppur',   '641603', 11.1150, 77.3300, 28, 4.30, 108, 88.0, 2.0, 'DOCUMENT_VERIFIED'),
  (28, '0d500000-0000-4000-8000-000000000028', 'Erode Weaving Centre',             'DIRECT',         'Erode',      '638011', 11.3300, 77.7300, 35, 4.15,  71, 85.0, 2.5, 'DOCUMENT_VERIFIED'),
  (29, '0d500000-0000-4000-8000-000000000029', 'Colour Craft Dyeing',              'LOCAL_REGISTRY', 'Tiruppur',   '641605', 11.1000, 77.3500, 25, 3.90,  84, 77.0, 5.1, 'SELF_DECLARED'),
  (30, '0d500000-0000-4000-8000-000000000030', 'Stitchwell Garments',              'DIRECT',         'Tiruppur',   '641607', 11.1250, 77.3250, 30, 4.35, 143, 89.0, 1.8, 'PLATFORM_VERIFIED'),
  (31, '0d500000-0000-4000-8000-000000000031', 'Cotton Valley Yarn Mart',          'REFERRAL',       'Coimbatore', '641009', 11.0250, 76.9700, 70, 4.20,  77, 86.0, 2.3, 'DOCUMENT_VERIFIED'),
  (32, '0d500000-0000-4000-8000-000000000032', 'Erode Turmeric Traders',           'ASSOCIATION',    'Erode',      '638003', 11.3450, 77.7100, 50, 4.55, 162, 93.0, 1.1, 'PLATFORM_VERIFIED'),
  (33, '0d500000-0000-4000-8000-000000000033', 'Kongu Agri Commodities',           'DIRECT',         'Erode',      '638002', 11.3380, 77.7250, 45, 4.25, 118, 87.0, 2.2, 'DOCUMENT_VERIFIED'),
  (34, '0d500000-0000-4000-8000-000000000034', 'Sathy Spice Exporters',            'LOCAL_REGISTRY', 'Erode',      '638455', 11.5000, 77.2400, 60, 4.10,  89, 84.0, 2.7, 'DOCUMENT_VERIFIED'),
  (35, '0d500000-0000-4000-8000-000000000035', 'Salem Grain Mandi Traders',        'DIRECT',         'Salem',      '636009', 11.6700, 78.1500, 65, 3.95, 134, 80.0, 3.7, 'SELF_DECLARED'),
  (36, '0d500000-0000-4000-8000-000000000036', 'Bhavani Cold Storage',             'ASSOCIATION',    'Erode',      '638301', 11.4450, 77.6800, 55, 4.40,  66, 91.0, 1.4, 'PLATFORM_VERIFIED'),
  (37, '0d500000-0000-4000-8000-000000000037', 'Green Harvest Fertilisers',        'REFERRAL',       'Salem',      '636016', 11.6550, 78.1600, 50, 4.00,  58, 82.0, 3.1, 'SELF_DECLARED'),
  (38, '0d500000-0000-4000-8000-000000000038', 'Chennai Power Systems',            'DIRECT',         'Chennai',    '600032', 13.0100, 80.2200, 45, 4.60, 176, 94.0, 0.9, 'PLATFORM_VERIFIED'),
  (39, '0d500000-0000-4000-8000-000000000039', 'Metro Electrical Contractors',     'LOCAL_REGISTRY', 'Chennai',    '600002', 13.0827, 80.2707, 35, 4.20,  97, 86.0, 2.4, 'DOCUMENT_VERIFIED'),
  (40, '0d500000-0000-4000-8000-000000000040', 'SunVolt Solar Solutions',          'REFERRAL',       'Chennai',    '600096', 12.9900, 80.2400, 60, 4.35,  71, 90.0, 1.7, 'DOCUMENT_VERIFIED'),
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
FROM tmp_demo_suppliers d
ON CONFLICT (id) DO UPDATE
SET contact_email = EXCLUDED.contact_email,
    business_name = coalesce(suppliers.business_name, EXCLUDED.business_name),
    status = 'ACTIVE';

-- 2. Insert/Update auth.users for contact01@otpdemo.test through contact45@otpdemo.test
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'contact' || lpad(n::text, 2, '0') || '@otpdemo.test',
  extensions.crypt('password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', '', '', '', ''
FROM generate_series(1, 45) AS n
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = extensions.crypt('password', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    banned_until = NULL,
    updated_at = now();

-- Update password for any existing auth.users record matching contactXX@otpdemo.test
UPDATE auth.users
SET encrypted_password = extensions.crypt('password', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    banned_until = NULL
WHERE email LIKE 'contact%@otpdemo.test';

-- 3. Insert/Update auth.identities
INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0')),
  ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  jsonb_build_object('sub', ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0')), 'email', 'contact' || lpad(n::text, 2, '0') || '@otpdemo.test'),
  'email',
  now(), now(), now()
FROM generate_series(1, 45) AS n
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

-- 4. Insert profiles with active_role_code = NULL initially to respect assert_active_role_held trigger
INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo, active_role_code)
SELECT
  ('0db20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('0dc20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'contact' || lpad(n::text, 2, '0') || '@otpdemo.test',
  coalesce(s.business_name, 'Supplier ' || lpad(n::text, 2, '0')) || ' Contact',
  false,
  true,
  NULL
FROM generate_series(1, 45) AS n
LEFT JOIN suppliers s ON s.id = ('0d500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    is_demo = true,
    updated_at = now();

-- 5. Insert profile_roles (granting SUPPLIER_FOUNDER)
INSERT INTO profile_roles (profile_id, role_code, is_demo)
SELECT
  ('0db20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'SUPPLIER_FOUNDER',
  true
FROM generate_series(1, 45) AS n
ON CONFLICT (profile_id, role_code) DO NOTHING;

-- 6. Now set active_role_code to SUPPLIER_FOUNDER safely
UPDATE profiles
SET active_role_code = 'SUPPLIER_FOUNDER'
WHERE email LIKE 'contact%@otpdemo.test' AND is_demo = true;

-- 7. Insert supplier_users (linking profile to the supplier as OWNER)
INSERT INTO supplier_users (id, supplier_id, profile_id, role)
SELECT
  ('0d620000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('0d500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('0db20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'OWNER'::supplier_user_role
FROM generate_series(1, 45) AS n
ON CONFLICT (supplier_id, profile_id) DO UPDATE
SET role = 'OWNER';

-- 8. Register in demo_accounts for easy persona selection
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
FROM tmp_demo_suppliers d
ON CONFLICT (email) DO UPDATE
SET supplier_id = EXCLUDED.supplier_id,
    profile_id = EXCLUDED.profile_id,
    label = EXCLUDED.label;

-- 9. Update notify_suppliers_of_outcome to accurately record distinct suppliers notified in audit trail
CREATE OR REPLACE FUNCTION private.notify_suppliers_of_outcome(p_rfq_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ref            text;
  v_count          integer := 0;
  v_supplier_count integer := 0;
BEGIN
  SELECT public_ref INTO v_ref FROM rfqs WHERE id = p_rfq_id;

  SELECT count(DISTINCT ri.supplier_id) INTO v_supplier_count
  FROM rfq_invitations ri
  JOIN quotes q ON q.invitation_id = ri.id
  WHERE ri.rfq_id = p_rfq_id
    AND q.status IN ('SELECTED', 'NOT_SELECTED');

  INSERT INTO notifications (profile_id, channel, event_type, payload)
  SELECT
    su.profile_id,
    'IN_APP',
    CASE WHEN q.status = 'SELECTED' THEN 'rfq.awarded_to_you' ELSE 'rfq.not_selected' END,
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'publicRef', v_ref,
      'alias', ri.anonymous_label,
      'outcome', CASE WHEN q.status = 'SELECTED' THEN 'WON' ELSE 'NOT_SELECTED' END
    )
  FROM rfq_invitations ri
  JOIN quotes q          ON q.invitation_id = ri.id
  JOIN supplier_users su ON su.supplier_id = ri.supplier_id
  WHERE ri.rfq_id = p_rfq_id
    AND q.status IN ('SELECTED', 'NOT_SELECTED');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  )
  SELECT
    'rfq.suppliers_closed_out',
    private.get_profile_id(),
    r.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'publicRef', v_ref,
      'notified', v_supplier_count,
      'notificationsSent', v_count,
      'selected', (SELECT jsonb_agg(ri.anonymous_label)
                   FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                   WHERE ri.rfq_id = p_rfq_id AND q.status = 'SELECTED'),
      'notSelected', (SELECT jsonb_agg(ri.anonymous_label)
                      FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                      WHERE ri.rfq_id = p_rfq_id AND q.status = 'NOT_SELECTED')
    )
  FROM rfqs r WHERE r.id = p_rfq_id;

  RETURN v_count;
END;
$function$;

-- 10. Record migration in otp_schema_migrations
INSERT INTO otp_schema_migrations (version, applied_at)
VALUES ('00138_seed_contact_supplier_logins.sql', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now();

COMMIT;

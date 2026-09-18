-- Borewell MVP golden path seed (10 HP Motor Winding)
-- Fixed UUIDs for deterministic test references.
--
-- ⚠️  LOCAL DEVELOPMENT / DEMO ONLY. This file creates auth users with the
-- shared password "password". Do NOT apply against a production project.
-- Production deployments run migrations only — see docs/DEPLOYMENT.md.

-- ---------------------------------------------------------------------------
-- Auth users (local dev passwords: "password")
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'manager@greenview.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'committee1@greenview.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'committee2@greenview.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated',
    'buyer@greenview.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated',
    'supplier-a@borewell.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000006',
    'authenticated', 'authenticated',
    'supplier-b@borewell.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000007',
    'authenticated', 'authenticated',
    'supplier-c@borewell.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000008',
    'authenticated', 'authenticated',
    'supplier-d@borewell.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000009',
    'authenticated', 'authenticated',
    'supplier-e@borewell.test',
    crypt('password', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    updated_at = now();

-- Auth identities (required for signInWithPassword in local Supabase)
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '{"sub":"c0000000-0000-4000-8000-000000000001","email":"manager@greenview.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', '{"sub":"c0000000-0000-4000-8000-000000000002","email":"committee1@greenview.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', '{"sub":"c0000000-0000-4000-8000-000000000003","email":"committee2@greenview.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', '{"sub":"c0000000-0000-4000-8000-000000000004","email":"buyer@greenview.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005', '{"sub":"c0000000-0000-4000-8000-000000000005","email":"supplier-a@borewell.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000006', '{"sub":"c0000000-0000-4000-8000-000000000006","email":"supplier-b@borewell.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000007', '{"sub":"c0000000-0000-4000-8000-000000000007","email":"supplier-c@borewell.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000008', '{"sub":"c0000000-0000-4000-8000-000000000008","email":"supplier-d@borewell.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid()),
  ('c0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000009', '{"sub":"c0000000-0000-4000-8000-000000000009","email":"supplier-e@borewell.test"}'::jsonb, 'email', now(), now(), now(), gen_random_uuid())
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

-- GoTrue expects empty strings (not NULL) on token columns for password sign-in
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change = COALESCE(email_change, '');

-- ---------------------------------------------------------------------------
-- Organization: Greenview Apartments (Borewell MVP community)
-- ---------------------------------------------------------------------------

INSERT INTO organizations (id, name, org_type) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Greenview Apartments', 'COMMUNITY')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    org_type = EXCLUDED.org_type;

INSERT INTO profiles (id, auth_user_id, email, full_name) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'manager@greenview.test', 'Ravi Manager'),
  ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'committee1@greenview.test', 'Priya Committee'),
  ('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'committee2@greenview.test', 'Arun Committee'),
  ('b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', 'buyer@greenview.test', 'Meena Buyer'),
  ('b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005', 'supplier-a@borewell.test', 'Supplier A Owner'),
  ('b0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000006', 'supplier-b@borewell.test', 'Supplier B Owner'),
  ('b0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000007', 'supplier-c@borewell.test', 'Supplier C Owner'),
  ('b0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000008', 'supplier-d@borewell.test', 'Supplier D Owner'),
  ('b0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000009', 'supplier-e@borewell.test', 'Supplier E Owner')
ON CONFLICT (id) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

INSERT INTO organization_members (id, organization_id, profile_id, role) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'MANAGER'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'COMMITTEE_MEMBER'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'COMMITTEE_MEMBER'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'BUYER')
ON CONFLICT (organization_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- Suppliers — Borewell / Motor Winding (10 HP capable)
-- ---------------------------------------------------------------------------

INSERT INTO suppliers (
  id, business_name, source, status, categories, capabilities, rating_avg,
  service_area, contact_phone, contact_email, address
) VALUES
  (
    'd0000000-0000-4000-8000-000000000001',
    'AquaFlow Borewell Services',
    'DIRECT', 'ACTIVE',
    ARRAY['Borewell', 'Motor Winding'],
    '{"maxHp": 15, "services": ["motor_winding", "borewell_repair"]}'::jsonb,
    4.50,
    '{"centerLat": 12.9716, "centerLng": 77.5946, "radiusKm": 25, "pinCodes": ["560001", "560034"]}'::jsonb,
    '+919800000001', 'contact@aquaflow.test',
    '{"line1": "12 Industrial Area", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560001", "country": "IN"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'DeepWell Motor Experts',
    'LOCAL_REGISTRY', 'ACTIVE',
    ARRAY['Borewell', 'Motor Winding'],
    '{"maxHp": 12, "services": ["motor_winding"]}'::jsonb,
    4.20,
    '{"centerLat": 12.9352, "centerLng": 77.6245, "radiusKm": 20}'::jsonb,
    '+919800000002', 'info@deepwell.test',
    '{"line1": "45 MG Road", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560002", "country": "IN"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    'HydroTech Winding Co',
    'REFERRAL', 'ACTIVE',
    ARRAY['Borewell', 'Motor Winding'],
    '{"maxHp": 20, "services": ["motor_winding", "pump_service"]}'::jsonb,
    4.70,
    '{"centerLat": 12.9698, "centerLng": 77.7500, "radiusKm": 30}'::jsonb,
    '+919800000003', 'hello@hydrotech.test',
    '{"line1": "88 Whitefield Main", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560066", "country": "IN"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000004',
    'Bengaluru Pump & Motor',
    'ASSOCIATION', 'ACTIVE',
    ARRAY['Borewell', 'Motor Winding'],
    '{"maxHp": 10, "services": ["motor_winding"]}'::jsonb,
    3.90,
    '{"centerLat": 12.9141, "centerLng": 77.6101, "radiusKm": 15}'::jsonb,
    '+919800000004', 'sales@bpm.test',
    '{"line1": "3 Koramangala", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560034", "country": "IN"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000005',
    'SouthCity Borewell Works',
    'DIRECT', 'ACTIVE',
    ARRAY['Borewell', 'Motor Winding'],
    '{"maxHp": 10, "services": ["borewell_repair", "motor_winding"]}'::jsonb,
    4.10,
    '{"centerLat": 12.8996, "centerLng": 77.5849, "radiusKm": 18}'::jsonb,
    '+919800000005', 'ops@southcity.test',
    '{"line1": "22 BTM Layout", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560076", "country": "IN"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET business_name = EXCLUDED.business_name,
    source = EXCLUDED.source,
    status = EXCLUDED.status,
    categories = EXCLUDED.categories,
    capabilities = EXCLUDED.capabilities,
    rating_avg = EXCLUDED.rating_avg,
    service_area = EXCLUDED.service_area,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    address = EXCLUDED.address;

INSERT INTO supplier_users (id, supplier_id, profile_id, role) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'OWNER'),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006', 'OWNER'),
  ('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000007', 'OWNER'),
  ('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000008', 'OWNER'),
  ('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000009', 'OWNER')
ON CONFLICT (supplier_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- Approval policy
-- ---------------------------------------------------------------------------

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'COMMUNITY_SIMPLE_MAJORITY',
    '{"type": "simple_majority", "minVotes": 2}'::jsonb,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Requirement & RFQ — 10 HP Borewell Motor Winding (QUOTING stage)
-- ---------------------------------------------------------------------------

INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, status, title, description,
  structured_specs, published_at
) VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  'SERVICE',
  'EVALUATION',
  '10 HP Borewell Motor Winding',
  'Community borewell motor needs winding repair. 10 HP submersible pump motor.',
  '{
    "requirementType": "SERVICE",
    "title": "10 HP Borewell Motor Winding",
    "attributes": {"hp": 10, "motorType": "submersible", "service": "motor_winding"},
    "quantity": 1,
    "unit": "HP",
    "deliveryLocation": {"line1": "Greenview Apartments", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560034", "country": "IN"},
    "notes": "Motor removed and available at pump room."
  }'::jsonb,
  now() - interval '3 days'
)
ON CONFLICT (id) DO UPDATE
SET status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    structured_specs = EXCLUDED.structured_specs;

INSERT INTO rfqs (
  id, requirement_id, organization_id, status, reveal_status, title,
  quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
  min_quotes_required, created_by
) VALUES (
  'f1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'EVALUATING',
  'BLIND',
  'RFQ: 10 HP Borewell Motor Winding',
  now() + interval '7 days',
  now() + interval '14 days',
  true,
  3,
  'b0000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO UPDATE
SET status = EXCLUDED.status,
    reveal_status = EXCLUDED.reveal_status,
    title = EXCLUDED.title,
    quote_deadline = EXCLUDED.quote_deadline,
    evaluation_deadline = EXCLUDED.evaluation_deadline,
    min_quotes_required = EXCLUDED.min_quotes_required;

-- Demo suppliers A/B/C + 2 more invited
INSERT INTO rfq_invitations (
  id, rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at
) VALUES
  ('a4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Supplier A', 'VIEWED', 92.5, ARRAY['10HP capable', 'within 15km'], now() - interval '2 days'),
  ('a4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Supplier B', 'VIEWED', 88.0, ARRAY['motor winding specialist'], now() - interval '2 days'),
  ('a4000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Supplier C', 'QUOTED', 85.5, ARRAY['high rating'], now() - interval '2 days'),
  ('a4000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Supplier D', 'INVITED', 78.0, ARRAY['10HP capable'], now() - interval '2 days'),
  ('a4000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'Supplier E', 'INVITED', 75.0, ARRAY['local supplier'], now() - interval '2 days')
ON CONFLICT (id) DO UPDATE
SET status = EXCLUDED.status,
    match_score = EXCLUDED.match_score,
    anonymous_label = EXCLUDED.anonymous_label;

-- Committee assignments
INSERT INTO committee_assignments (id, rfq_id, profile_id) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('ca000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Demo quotes from Supplier A, B, C (canonical borewell scenario)
INSERT INTO quotes (
  id, rfq_id, supplier_id, invitation_id, status, current_version,
  evaluation_score, submitted_at
) VALUES
  (
    'a5000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'FINAL', 1, 88.0, now() - interval '1 day'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000002',
    'FINAL', 1, 85.0, now() - interval '1 day'
  ),
  (
    'a5000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003',
    'a4000000-0000-4000-8000-000000000003',
    'FINAL', 1, 86.5, now() - interval '1 day'
  )
ON CONFLICT (id) DO UPDATE
SET status = EXCLUDED.status,
    current_version = EXCLUDED.current_version,
    evaluation_score = EXCLUDED.evaluation_score;

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES
  (
    'a6000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001', 1,
    '{"basePrice": 8500, "gstAmount": 1530, "transportCost": 0, "totalCost": 10030, "deliveryDays": 2, "warrantyMonths": 12, "currency": "INR"}'::jsonb,
    'b0000000-0000-4000-8000-000000000005'
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000002', 1,
    '{"basePrice": 7800, "gstAmount": 1404, "transportCost": 0, "totalCost": 9204, "deliveryDays": 4, "warrantyMonths": 6, "currency": "INR"}'::jsonb,
    'b0000000-0000-4000-8000-000000000006'
  ),
  (
    'a6000000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000003', 1,
    '{"basePrice": 9200, "gstAmount": 1656, "transportCost": 0, "totalCost": 10856, "deliveryDays": 2, "warrantyMonths": 12, "currency": "INR"}'::jsonb,
    'b0000000-0000-4000-8000-000000000007'
  )
ON CONFLICT (id) DO NOTHING;

UPDATE rfq_invitations SET status = 'QUOTED'
WHERE id IN (
  'a4000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000003'
);

-- Governance-ready: FINAL quotes + evaluations (COI/vote/award via UI)
UPDATE requirements SET status = 'EVALUATION', updated_at = now()
WHERE id = 'a2000000-0000-4000-8000-000000000001';

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1, 88.0, '{"price":35,"delivery":30,"warranty":23}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  ('e5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 1, 91.2, '{"price":40,"delivery":22,"warranty":29.2}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  ('e5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 1, 85.1, '{"price":28,"delivery":30,"warranty":27.1}'::jsonb, 'COMPUTED', now() - interval '6 hours')
ON CONFLICT (id) DO UPDATE
SET evaluation_score = EXCLUDED.evaluation_score,
    breakdown = EXCLUDED.breakdown,
    status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Subscription plans (schema only — no billing)
-- ---------------------------------------------------------------------------

INSERT INTO subscription_plans (id, code, name, description, price_monthly, features) VALUES
  (
    'a8000000-0000-4000-8000-000000000001',
    'COMMUNITY_FREE',
    'Community Free',
    'MVP community tier — no billing',
    0,
    '{"maxRfqsPerMonth": 10, "committeeVoting": true}'::jsonb
  ),
  (
    'a8000000-0000-4000-8000-000000000002',
    'MSME_STARTER',
    'MSME Starter',
    'Small business starter plan',
    999,
    '{"maxRfqsPerMonth": 25, "committeeVoting": false}'::jsonb
  ),
  (
    'a8000000-0000-4000-8000-000000000003',
    'ENTERPRISE',
    'Enterprise',
    'Future enterprise tier',
    0,
    '{"custom": true}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- Phase 8: fulfillment scenario (see seed_fulfillment.sql — inlined below)
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, status, title, description, created_at, updated_at
) VALUES (
  'a2000001-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'SERVICE',
  'AWARDED',
  '10 HP Borewell Motor Winding (Fulfillment)',
  'Post-award fulfillment track for PO / work order demo',
  now() - interval '1 day',
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO rfqs (
  id, requirement_id, organization_id, status, reveal_status, title,
  quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
  min_quotes_required, created_by
) VALUES (
  'f2000000-0000-4000-8000-000000000001',
  'a2000001-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'AWARDED',
  'REVEALED',
  'RFQ: Borewell Motor Winding (Awarded)',
  now() - interval '2 days',
  now() - interval '1 day',
  true,
  1,
  'b0000000-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- This workshop also bids on the open RFQ above. Its alias here is allocated
-- from this RFQ's own salt rather than hard-coded, because reusing "Supplier B"
-- across two rounds would let anyone reading both tell they were the same firm,
-- which is the one thing the alias exists to prevent.
INSERT INTO rfq_invitations (id, rfq_id, supplier_id, anonymous_label, status, invited_at) VALUES (
  'a4000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  private.assign_anonymous_label(
    'f2000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002'
  ),
  'QUOTED',
  now() - interval '3 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, submitted_at) VALUES (
  'a5000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'a4000001-0000-4000-8000-000000000001',
  'SELECTED',
  1,
  now() - interval '2 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES (
  'a6000001-0000-4000-8000-000000000001',
  'a5000001-0000-4000-8000-000000000001',
  1,
  '{"basePrice": 7800, "gstAmount": 1404, "transportCost": 0, "totalCost": 9204, "deliveryDays": 4, "warrantyMonths": 6, "currency": "INR"}'::jsonb,
  'b0000000-0000-4000-8000-000000000006'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO awards (id, rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at) VALUES (
  'b7000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'a5000001-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  '{"text":"Best value at ₹7,800 base with acceptable 4-day delivery for community borewell repair."}'::jsonb,
  'REVEALED',
  now() - interval '1 day',
  now() - interval '1 day'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (
  id, award_id, rfq_id, organization_id, supplier_id, po_number, status,
  total_amount, currency, issued_at, created_at, updated_at
) VALUES (
  'c8000001-0000-4000-8000-000000000001',
  'b7000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'PO-GV-2026-0001',
  'COMPLETED',
  9204.00,
  'INR',
  now() - interval '12 hours',
  now() - interval '1 day',
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO work_orders (
  id, purchase_order_id, supplier_id, status, title, progress_percent,
  actual_start, completed_at, buyer_accepted_at, inspection_notes,
  created_at, updated_at
) VALUES (
  'd9000001-0000-4000-8000-000000000001',
  'c8000001-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'COMPLETED',
  '10 HP Borewell Motor Winding — Site Work',
  100,
  now() - interval '8 hours',
  now() - interval '2 hours',
  now() - interval '90 minutes',
  'Motor winding tested on site — vibration within spec.',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Phase 9: fulfillment completion — invoice, payment, performance, audit trail
UPDATE requirements SET status = 'COMPLETED', closed_at = now() - interval '6 hours', updated_at = now()
WHERE id = 'a2000001-0000-4000-8000-000000000002';

INSERT INTO invoices (
  id, work_order_id, purchase_order_id, supplier_id, invoice_number, amount, currency, status,
  paid_amount, balance_due, submitted_at, approved_at
) VALUES (
  'e0000001-0000-4000-8000-000000000001',
  'd9000001-0000-4000-8000-000000000001',
  'c8000001-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'GV-INV-2026-0042',
  9204.00,
  'INR',
  'PAID',
  9204.00,
  0.00,
  now() - interval '3 hours',
  now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (
  id, invoice_id, purchase_order_id, amount, currency, method, status,
  unallocated_amount, reference, recorded_by, recorded_at, verified_at
) VALUES (
  'e0000002-0000-4000-8000-000000000001',
  'e0000001-0000-4000-8000-000000000001',
  'c8000001-0000-4000-8000-000000000001',
  9204.00,
  'INR',
  'UPI',
  'VERIFIED',
  0.00,
  'UPI/GV9204182736',
  'b0000000-0000-4000-8000-000000000001',
  now() - interval '2 hours',
  now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO payment_allocations (
  payment_id, invoice_id, allocated_amount, status
) VALUES (
  'e0000002-0000-4000-8000-000000000001',
  'e0000001-0000-4000-8000-000000000001',
  9204.00,
  'ALLOCATED'
) ON CONFLICT DO NOTHING;

INSERT INTO procurement_performance_records (
  id, supplier_id, rfq_id, organization_id,
  quoted_total, actual_total, quoted_delivery_days, actual_delivery_days,
  quality_rating, variance, recorded_at
) VALUES (
  'e1000001-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  9204.00,
  9204.00,
  4,
  3,
  4.5,
  '{"costDelta":0,"deliveryDeltaDays":-1}'::jsonb,
  now() - interval '1 hour'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload, occurred_at, correlation_id) VALUES
  ('requirement.created', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'requirement', 'a2000000-0000-4000-8000-000000000001', '{"type":"SERVICE"}'::jsonb, now() - interval '3 days', 'gv-borewell-001'),
  ('rfq.opened', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'rfq', 'f1000000-0000-4000-8000-000000000001', '{"invitations":5}'::jsonb, now() - interval '2 days', 'gv-borewell-001'),
  ('quote.submitted', NULL, 'a0000000-0000-4000-8000-000000000001', 'quote', 'a5000000-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier A"}'::jsonb, now() - interval '1 day', 'gv-borewell-001'),
  ('quote.submitted', NULL, 'a0000000-0000-4000-8000-000000000001', 'quote', 'a5000000-0000-4000-8000-000000000002', '{"anonymousLabel":"Supplier B"}'::jsonb, now() - interval '20 hours', 'gv-borewell-001'),
  ('quote.submitted', NULL, 'a0000000-0000-4000-8000-000000000001', 'quote', 'a5000000-0000-4000-8000-000000000003', '{"anonymousLabel":"Supplier C"}'::jsonb, now() - interval '18 hours', 'gv-borewell-001'),
  ('evaluation.computed', NULL, 'a0000000-0000-4000-8000-000000000001', 'rfq', 'f1000000-0000-4000-8000-000000000001', '{"quoteCount":3}'::jsonb, now() - interval '12 hours', 'gv-borewell-001'),
  ('award.recorded', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'award', 'b7000001-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '1 day', 'gv-fulfill-001'),
  ('po.issued', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'purchase_order', 'c8000001-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '12 hours', 'gv-fulfill-001'),
  ('work_order.completed', NULL, 'a0000000-0000-4000-8000-000000000001', 'work_order', 'd9000001-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '2 hours', 'gv-fulfill-001'),
  ('payment.verified', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'payment', 'e0000002-0000-4000-8000-000000000001', '{"reference":"UPI/GV9204182736"}'::jsonb, now() - interval '2 hours', 'gv-fulfill-001'),
  ('performance.recorded', NULL, 'a0000000-0000-4000-8000-000000000001', 'supplier_performance', 'e1000001-0000-4000-8000-000000000001', '{"qualityRating":4.5}'::jsonb, now() - interval '1 hour', 'gv-fulfill-001'),
  ('requirement.completed', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'requirement', 'a2000001-0000-4000-8000-000000000002', '{}'::jsonb, now() - interval '1 hour', 'gv-fulfill-001');

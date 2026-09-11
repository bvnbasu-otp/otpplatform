-- Demo test accounts.
--
-- Adds accounts whose purpose is testing and demonstration across categories
-- rather than telling one of the five walkthrough stories. The walkthrough
-- scenarios stage themselves at fixed lifecycle points and get re-staged by
-- demo_reset, which is what makes them predictable. Testers need the opposite:
-- a stable buyer they can raise fresh requirements as, without disturbing the
-- staged demo.
--
-- These accounts:
--
--   * are flagged is_demo, so demo_reset still cleans up anything they raise,
--   * have no scenario_code, so demo_reset does not attempt to re-stage them
--     (there is no fixed target lifecycle),
--   * live in their own organizations so a tester can log in without
--     colliding with any of the four scenario buyers.
--
-- Two accounts are provided:
--
--   qa-buyer@otp.test        — INDIVIDUAL owner. One-decision flow, so the
--                              tester can publish and reach award without
--                              waiting on a committee vote.
--   qa-committee@otp.test    — COMMUNITY manager. Uses the committee-vote
--                              path when a category needs the fuller flow.
--                              A second committee member is seeded so the
--                              simple-majority policy can actually pass.
--
-- Both buyers can raise requirements in every category. Supplier discovery
-- runs on capabilities, not on any relationship to the buyer, so both accounts
-- can source from the full 45-supplier catalogue seeded in
-- seed_demo_environment.sql.
--
-- The shared password is the same as every other demo account: "password".

BEGIN;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_test_people (
  auth_id    uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  email      text NOT NULL,
  full_name  text NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_test_people (auth_id, profile_id, email, full_name) VALUES
  -- QA test owner (INDIVIDUAL)
  ('0dc00000-0000-4000-8000-000000000051', '0db00000-0000-4000-8000-000000000051',
   'qa-buyer@otp.test',      'QA Test Buyer'),

  -- QA test committee (COMMUNITY)
  ('0dc00000-0000-4000-8000-000000000061', '0db00000-0000-4000-8000-000000000061',
   'qa-committee@otp.test',  'QA Test Committee Chair'),
  ('0dc00000-0000-4000-8000-000000000062', '0db00000-0000-4000-8000-000000000062',
   'qa-voter@otp.test',      'QA Test Committee Member');

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
FROM demo_test_people p
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
FROM demo_test_people p
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
SELECT p.profile_id, p.auth_id, p.email, p.full_name, false, true
FROM demo_test_people p
ON CONFLICT (id) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_demo = true,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

INSERT INTO organizations (
  id, name, org_type, is_demo,
  contact_person, contact_phone, contact_email, tax_registration, city, address
) VALUES
  ('0da00000-0000-4000-8000-000000000051', 'QA Test Buyer (Individual)', 'INDIVIDUAL', true,
   'QA Test Buyer', '+919000050001', 'qa-buyer@otp.test', '29AAAAA1111A1Z1', 'Bengaluru',
   '{"line1":"QA Test Site","city":"Bengaluru","state":"Karnataka","postalCode":"560001","country":"IN"}'::jsonb),

  ('0da00000-0000-4000-8000-000000000061', 'QA Test Community Association', 'COMMUNITY', true,
   'QA Test Committee', '+919000050002', 'qa-committee@otp.test', '29BBBBB2222B2Z2', 'Bengaluru',
   '{"line1":"QA Test Community","city":"Bengaluru","state":"Karnataka","postalCode":"560002","country":"IN"}'::jsonb)
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
  ('0de00000-0000-4000-8000-000000000051', '0da00000-0000-4000-8000-000000000051',
   '0db00000-0000-4000-8000-000000000051', 'OWNER'),

  ('0de00000-0000-4000-8000-000000000061', '0da00000-0000-4000-8000-000000000061',
   '0db00000-0000-4000-8000-000000000061', 'MANAGER'),
  ('0de00000-0000-4000-8000-000000000062', '0da00000-0000-4000-8000-000000000061',
   '0db00000-0000-4000-8000-000000000062', 'COMMITTEE_MEMBER')
ON CONFLICT (organization_id, profile_id) DO UPDATE
SET role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- Approval policies
-- ---------------------------------------------------------------------------

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  ('0da10000-0000-4000-8000-000000000051', '0da00000-0000-4000-8000-000000000051',
   'MANAGER_ONLY', '{"type": "manager_only"}'::jsonb, true),

  ('0da10000-0000-4000-8000-000000000061', '0da00000-0000-4000-8000-000000000061',
   'COMMUNITY_SIMPLE_MAJORITY', '{"type": "simple_majority", "minVotes": 2}'::jsonb, true)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    policy_type = EXCLUDED.policy_type,
    threshold = EXCLUDED.threshold,
    is_default = EXCLUDED.is_default;

-- ---------------------------------------------------------------------------
-- Login registry entries
--
-- No scenario_code — these accounts are for freeform testing, not walkthrough
-- staging. sort_order pushes them below the walkthrough personas but above the
-- 45 supplier entries.
-- ---------------------------------------------------------------------------

INSERT INTO demo_accounts (email, label, persona, description, organization_id, profile_id, scenario_code, sort_order) VALUES
  ('qa-buyer@otp.test',      'QA Test Buyer (Individual)',
   'BUYER_OWNER',
   'Freeform tester login. Individual buyer, single decision-maker. Use this to raise a fresh requirement in any category without touching the walkthrough scenarios.',
   '0da00000-0000-4000-8000-000000000051', '0db00000-0000-4000-8000-000000000051', NULL, 90),

  ('qa-committee@otp.test',  'QA Test Buyer (Committee chair)',
   'BUYER_MANAGER',
   'Freeform tester login. Community buyer with simple-majority voting. Use this to exercise the committee vote flow in any category.',
   '0da00000-0000-4000-8000-000000000061', '0db00000-0000-4000-8000-000000000061', NULL, 91),

  ('qa-voter@otp.test',      'QA Test Buyer (Committee voter)',
   'COMMITTEE',
   'Second committee member for the QA Test Community Association. Log in to cast the vote that carries a simple-majority award.',
   '0da00000-0000-4000-8000-000000000061', '0db00000-0000-4000-8000-000000000062', NULL, 92)
ON CONFLICT (email) DO UPDATE
SET label = EXCLUDED.label,
    persona = EXCLUDED.persona,
    description = EXCLUDED.description,
    organization_id = EXCLUDED.organization_id,
    profile_id = EXCLUDED.profile_id,
    scenario_code = EXCLUDED.scenario_code,
    sort_order = EXCLUDED.sort_order;

COMMIT;

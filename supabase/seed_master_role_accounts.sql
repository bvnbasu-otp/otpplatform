-- Master Role-Based Accounts Seed
-- Sets up exact requested accounts across all 5 organizational workflows.

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS temp_master_accounts (
  auth_id    uuid,
  profile_id uuid,
  email      text NOT NULL,
  full_name  text NOT NULL,
  org_id     uuid NOT NULL,
  org_name   text NOT NULL,
  org_type   org_type NOT NULL,
  member_role org_member_role NOT NULL,
  profile_role text NOT NULL
) ON COMMIT DROP;

INSERT INTO temp_master_accounts (
  auth_id, profile_id, email, full_name, org_id, org_name, org_type, member_role, profile_role
) VALUES
  -- 1. INDIVIDUAL: buyer1 & buyer2 (all rights from start to closure)
  ('11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001',
   'buyer1@otp.test', 'Individual Buyer 1',
   '33333333-0000-4000-8000-000000000001', 'Individual Property Owner (buyer1)', 'INDIVIDUAL', 'OWNER', 'PROCUREMENT_LEAD'),
  ('11111111-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002',
   'buyer2@otp.test', 'Individual Buyer 2',
   '33333333-0000-4000-8000-000000000002', 'Individual Property Owner (buyer2)', 'INDIVIDUAL', 'OWNER', 'PROCUREMENT_LEAD'),

  -- 2. RWA / COMMUNITY: Sunrise Residency
  -- Requester / Manager
  ('11111111-0000-4000-8000-000000000010', '22222222-0000-4000-8000-000000000010',
   'manager@sunrise.test', 'RWA Estate Manager',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'MANAGER', 'FACILITY_MANAGER'),
  -- President
  ('11111111-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000011',
   'president@sunrise.test', 'RWA President',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'OWNER', 'COMMITTEE_MEMBER'),
  -- Secretary
  ('0dc00000-0000-4000-8000-000000000001', '0db00000-0000-4000-8000-000000000001',
   'secretary@sunrise.test', 'RWA Secretary',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'MANAGER', 'COMMITTEE_MEMBER'),
  -- Treasurer
  ('0dc00000-0000-4000-8000-000000000002', '0db00000-0000-4000-8000-000000000002',
   'treasurer@sunrise.test', 'RWA Treasurer',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'COMMITTEE_MEMBER', 'COMMITTEE_MEMBER'),
  -- 3 Committee Members
  ('0dc00000-0000-4000-8000-000000000003', '0db00000-0000-4000-8000-000000000003',
   'member1@sunrise.test', 'RWA Committee Member 1',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'COMMITTEE_MEMBER', 'COMMITTEE_MEMBER'),
  ('11111111-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000013',
   'member3@sunrise.test', 'RWA Committee Member 3',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'COMMITTEE_MEMBER', 'COMMITTEE_MEMBER'),
  ('11111111-0000-4000-8000-000000000014', '22222222-0000-4000-8000-000000000014',
   'member4@sunrise.test', 'RWA Committee Member 4',
   '0da00000-0000-4000-8000-000000000001', 'Sunrise Residency Owners Association', 'COMMUNITY', 'COMMITTEE_MEMBER', 'COMMITTEE_MEMBER'),

  -- 3. MSME & TEXTILES: Tanish Tex Mills (Dual-Partner Review Workflow)
  -- Owner
  ('11111111-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000021',
   'owner@tanish.test', 'Tanish Tex Managing Partner',
   '33333333-0000-4000-8000-000000000003', 'Tanish Tex Mills LLP', 'MSME', 'OWNER', 'PROCUREMENT_LEAD'),
  -- Partner
  ('11111111-0000-4000-8000-000000000022', '22222222-0000-4000-8000-000000000022',
   'partner@tanish.test', 'Tanish Tex Operations Partner',
   '33333333-0000-4000-8000-000000000003', 'Tanish Tex Mills LLP', 'MSME', 'MANAGER', 'COMMITTEE_MEMBER'),

  -- 4. AGRICULTURE & MANDI: Kongu Agri Commodities (Direct Fast-Track Commercial Workflow)
  -- Owner
  ('11111111-0000-4000-8000-000000000031', '22222222-0000-4000-8000-000000000031',
   'owner@kongu.test', 'Kongu Agri Lead Partner',
   '33333333-0000-4000-8000-000000000004', 'Kongu Agri Commodities', 'MSME', 'OWNER', 'PROCUREMENT_LEAD'),
  -- Partner
  ('11111111-0000-4000-8000-000000000032', '22222222-0000-4000-8000-000000000032',
   'partner@kongu.test', 'Kongu Agri Trading Partner',
   '33333333-0000-4000-8000-000000000004', 'Kongu Agri Commodities', 'MSME', 'MANAGER', 'COMMITTEE_MEMBER'),

  -- 5. CORPORATE & FACILITIES: Apex Global Logistics (Multi-Tier Enterprise Workflow)
  -- 1. Procurement Manager (Author & Buyer)
  ('11111111-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000041',
   'buyer@apex.test', 'Apex Procurement Manager',
   '33333333-0000-4000-8000-000000000005', 'Apex Global Logistics & Facilities Ltd', 'ENTERPRISE', 'MANAGER', 'PROCUREMENT_LEAD'),
  -- 2. Technical Evaluation Head (Voter)
  ('11111111-0000-4000-8000-000000000042', '22222222-0000-4000-8000-000000000042',
   'tech-head@apex.test', 'Apex Technical Head',
   '33333333-0000-4000-8000-000000000005', 'Apex Global Logistics & Facilities Ltd', 'ENTERPRISE', 'COMMITTEE_MEMBER', 'COMMITTEE_MEMBER'),
  -- 3. Finance Controller (Approver & Voter)
  ('11111111-0000-4000-8000-000000000043', '22222222-0000-4000-8000-000000000043',
   'finance@apex.test', 'Apex Finance Controller',
   '33333333-0000-4000-8000-000000000005', 'Apex Global Logistics & Facilities Ltd', 'ENTERPRISE', 'APPROVER', 'FINANCE_APPROVER'),
  -- 4. Managing Director (Executive Sign-Off)
  ('11111111-0000-4000-8000-000000000044', '22222222-0000-4000-8000-000000000044',
   'director@apex.test', 'Apex Managing Director',
   '33333333-0000-4000-8000-000000000005', 'Apex Global Logistics & Facilities Ltd', 'ENTERPRISE', 'OWNER', 'PROPERTY_OWNER');

-- 1. Insert/Update Organizations
INSERT INTO organizations (
  id, name, org_type, is_demo, contact_person, contact_phone, contact_email, tax_registration, city, address
)
SELECT DISTINCT ON (org_id)
  org_id, org_name, org_type, true,
  full_name, '+919000000000', email, '29AAAAA0000A1Z5', 'Bengaluru',
  '{"line1":"Main Business Park","city":"Bengaluru","state":"Karnataka","postalCode":"560001","country":"IN"}'::jsonb
FROM temp_master_accounts
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, org_type = EXCLUDED.org_type;

-- 2. Upsert Auth Users
DO $$
DECLARE
  r RECORD;
  v_user_id uuid;
  v_profile_id uuid;
BEGIN
  FOR r IN SELECT * FROM temp_master_accounts LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = r.email;
    IF v_user_id IS NULL THEN
      v_user_id := r.auth_id;
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new,
        email_change_token_current, phone_change_token, reauthentication_token, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated', r.email,
        crypt('password', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', '', '', '', ''
      );

      INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
      ) VALUES (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', r.email),
        'email', now(), now(), now(), gen_random_uuid()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt('password', gen_salt('bf')), updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- Upsert Profile
    SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = v_user_id;
    IF v_profile_id IS NULL THEN
      v_profile_id := r.profile_id;
      INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
      VALUES (v_profile_id, v_user_id, r.email, r.full_name, false, true);
    ELSE
      UPDATE profiles
      SET full_name = r.full_name, email = r.email, updated_at = now()
      WHERE id = v_profile_id;
    END IF;

    -- Upsert Org Membership
    INSERT INTO organization_members (organization_id, profile_id, role, joined_at)
    VALUES (r.org_id, v_profile_id, r.member_role, now())
    ON CONFLICT (organization_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role;

    -- Upsert Profile Role
    INSERT INTO profile_roles (profile_id, role_code, is_demo)
    VALUES (v_profile_id, r.profile_role, true)
    ON CONFLICT (profile_id, role_code) DO NOTHING;
  END LOOP;
END;
$$;

COMMIT;

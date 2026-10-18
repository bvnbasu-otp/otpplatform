/**
 * provision-e2e-demo-fixture.ts
 *
 * Dedicated opt-in fixture provisioning for PIN 560048 (Bengaluru - Electrical & Automation).
 * Creates isolated dummy buyer and 3 distinct dummy suppliers with distinct GSTIN/PAN and is_demo = true.
 *
 * STRICT GUARDRAILS:
 * - Runs only on local / test environments (disposable databases).
 * - Zero data pollution in migrations or production databases.
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeEnvironment } from './env-guard.js';

assertSafeEnvironment('provision-e2e-demo-fixture');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const PROVISION_SQL = `
BEGIN;

-- 1. Demo Buyer Organization in Bengaluru PIN 560048
INSERT INTO public.organizations (
  id,
  name,
  org_type,
  status,
  is_demo
) VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'Durga Rainbow Flat Owner Welfare Association',
  'COMMUNITY',
  'ACTIVE',
  true
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_demo = true;

-- 2. Demo Buyer User (Auth & Profile)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd1000004-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'buyer@durga-rainbow.community',
  extensions.crypt('not-a-login', extensions.gen_salt('bf')),
  now(),
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id,
  auth_user_id,
  email,
  full_name,
  active_portal_side,
  status,
  is_demo
) VALUES (
  'd1000004-0000-4000-8000-000000000001',
  'd1000004-0000-4000-8000-000000000001',
  'buyer@durga-rainbow.community',
  'Vikram Patel (Demo Buyer)',
  'BUYER',
  'ACTIVE',
  true
) ON CONFLICT (id) DO UPDATE SET
  active_portal_side = 'BUYER',
  is_demo = true;

-- Link Buyer User to Org
INSERT INTO public.organization_members (
  organization_id,
  profile_id,
  role
) VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'd1000004-0000-4000-8000-000000000001',
  'OWNER'
) ON CONFLICT (organization_id, profile_id) DO NOTHING;

-- 3. Demo Supplier A: Shree Sai Electricals (PIN 560048)
INSERT INTO public.suppliers (
  id,
  legal_name,
  business_name,
  gstin,
  pan,
  status,
  is_demo,
  city,
  pincode,
  address,
  contact_email,
  contact_phone
) VALUES (
  'd1000010-0000-4000-8000-000000000001',
  'Shree Sai Electricals Private Limited',
  'Shree Sai Electricals',
  '29AABCS1429B1Z1',
  'AABCS1429B',
  'ACTIVE',
  true,
  'Bengaluru',
  '560048',
  '{"line1": "ITPL Main Road, Mahadevapura", "city": "Bengaluru", "pincode": "560048"}'::jsonb,
  'supplier-a@durga-demo.test',
  '+91 98450 11111'
) ON CONFLICT (id) DO UPDATE SET
  status = 'ACTIVE',
  is_demo = true;

-- 4. Demo Supplier B: Krishna Pump & Motor Services (PIN 560048)
INSERT INTO public.suppliers (
  id,
  legal_name,
  business_name,
  gstin,
  pan,
  status,
  is_demo,
  city,
  pincode,
  address,
  contact_email,
  contact_phone
) VALUES (
  'd1000011-0000-4000-8000-000000000001',
  'Krishna Pump & Motor Works',
  'Krishna Pump Services',
  '29AABCK2341M1Z5',
  'AABCK2341M',
  'ACTIVE',
  true,
  'Bengaluru',
  '560048',
  '{"line1": "Whitefield Road, Hoodi", "city": "Bengaluru", "pincode": "560048"}'::jsonb,
  'supplier-b@durga-demo.test',
  '+91 98450 22222'
) ON CONFLICT (id) DO UPDATE SET
  status = 'ACTIVE',
  is_demo = true;

-- 5. Demo Supplier C: AquaTech Borewell & Rewinding (PIN 560048)
INSERT INTO public.suppliers (
  id,
  legal_name,
  business_name,
  gstin,
  pan,
  status,
  is_demo,
  city,
  pincode,
  address,
  contact_email,
  contact_phone
) VALUES (
  'd1000012-0000-4000-8000-000000000001',
  'AquaTech Engineering Solutions LLP',
  'AquaTech Borewell Solutions',
  '29AABCA9812L1Z9',
  'AABCA9812L',
  'ACTIVE',
  true,
  'Bengaluru',
  '560048',
  '{"line1": "Garudacharpalya, Mahadevapura", "city": "Bengaluru", "pincode": "560048"}'::jsonb,
  'supplier-c@durga-demo.test',
  '+91 98450 33333'
) ON CONFLICT (id) DO UPDATE SET
  status = 'ACTIVE',
  is_demo = true;

COMMIT;
`;

export async function provisionE2eDemoFixture() {
  console.log('[Demo Fixture] Provisioning isolated Bengaluru PIN 560048 demo records...');
  const { Client } = await import('pg');
  const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    database: process.env.OTP_PG_DATABASE ?? 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  try {
    await client.query(PROVISION_SQL);
    console.log('[Demo Fixture] Successfully provisioned PIN 560048 buyer and 3 distinct suppliers.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  provisionE2eDemoFixture().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

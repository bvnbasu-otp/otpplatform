/**
 * teardown-e2e-demo-fixture.ts
 *
 * Tears down and deletes demo records provisioned for Bengaluru PIN 560048.
 *
 * STRICT GUARDRAILS:
 * - Runs only on local / test environments (disposable databases).
 * - Targets only is_demo = true records.
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeEnvironment } from './env-guard.js';

assertSafeEnvironment('teardown-e2e-demo-fixture');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const TEARDOWN_SQL = `
BEGIN;

-- Delete demo supplier users and suppliers
DELETE FROM public.supplier_users
WHERE supplier_id IN (
  'd1000010-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'd1000012-0000-4000-8000-000000000001'
);

DELETE FROM public.suppliers
WHERE id IN (
  'd1000010-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'd1000012-0000-4000-8000-000000000001'
) AND is_demo = true;

-- Delete demo buyer organization members and org
DELETE FROM public.organization_members
WHERE organization_id = 'd1000000-0000-4000-8000-000000000001';

DELETE FROM public.organizations
WHERE id = 'd1000000-0000-4000-8000-000000000001' AND is_demo = true;

-- Delete demo buyer profile & auth user
DELETE FROM public.profiles
WHERE id = 'd1000004-0000-4000-8000-000000000001' AND is_demo = true;

DELETE FROM auth.users
WHERE id = 'd1000004-0000-4000-8000-000000000001';

COMMIT;
`;

export async function teardownE2eDemoFixture() {
  console.log('[Demo Fixture] Tearing down isolated Bengaluru PIN 560048 demo records...');
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
    await client.query(TEARDOWN_SQL);
    console.log('[Demo Fixture] Successfully tore down PIN 560048 demo records.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  teardownE2eDemoFixture().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

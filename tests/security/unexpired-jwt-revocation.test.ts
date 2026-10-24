/**
 * unexpired-jwt-revocation.test.ts
 *
 * Verifies Phase 2 Single Authoritative Access and Immediate Revocation (T-14):
 * An active internal operator or SuperAdmin whose status is set to SUSPENDED or REVOKED
 * immediately loses internal access on subsequent queries even when using an unexpired JWT.
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
    return client;
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL unavailable at 127.0.0.1:54322');
    return null;
  }
}

async function asUser(client: Client, authUserId: string, email = 'user@example.test'): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated', email }),
  ]);
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query('SET LOCAL ROLE authenticated');
}

async function asOperator(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
}

async function createPerson(client: Client, label: string, side: 'BUYER' | 'SUPPLIER' = 'BUYER'): Promise<string> {
  const id = randomUUID();
  const email = `${label}-${id}@example.test`;
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token,
       is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt('not-a-login', extensions.gen_salt('bf')), now(),
       '', '', '', '', '', '', '', '', false, false, false,
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
     )`,
    [id, email],
  );
  await client.query(
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, active_portal_side, status)
     VALUES ($1, $1, $2, $3, false, $4, 'ACTIVE')`,
    [id, email, label, side],
  );
  return id;
}

describe('Unexpired JWT Immediate Revocation (T-14)', () => {
  it('instantly revokes internal operator privileges upon SUSPENDED or REVOKED status even with unexpired JWT (rolled back)', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);

      // Fetch active platform admin profile
      const adminRes = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM public.profiles WHERE is_platform_admin = true AND status = 'ACTIVE' LIMIT 1`,
      );
      expect(adminRes.rows.length).toBeGreaterThan(0);
      const adminId = adminRes.rows[0].id;
      const adminEmail = adminRes.rows[0].email;

      // 1. Verify that while status is ACTIVE, authoritative_internal_operator_access returns true
      const adminActiveRes = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [adminId],
      );
      expect(adminActiveRes.rows[0].authoritative).toBe(true);

      // Create an RFQ to test administrative oversight SELECT
      const buyerOrgId = randomUUID();
      await client.query(
        `INSERT INTO public.organizations (id, name, org_type, status)
         VALUES ($1, 'Acme Corp', 'ENTERPRISE', 'ACTIVE')`,
        [buyerOrgId],
      );
      const genuineBuyerId = await createPerson(client, 'Genuine Buyer', 'BUYER');
      const reqId = randomUUID();
      await client.query(
        `INSERT INTO public.requirements (id, title, requirement_type, organization_id, created_by)
         VALUES ($1, 'Genuine Spec Lathe', 'PRODUCT', $2, $3)`,
        [reqId, buyerOrgId, genuineBuyerId],
      );
      const rfqId = randomUUID();
      await client.query(
        `INSERT INTO public.rfqs (id, requirement_id, title, organization_id, created_by, status)
         VALUES ($1, $2, 'Genuine RFQ', $3, $4, 'OPEN')`,
        [rfqId, reqId, buyerOrgId, genuineBuyerId],
      );

      // Enable platform privilege writes for test fixture manipulation
      await client.query(`SELECT set_config('otp.platform_privilege_write', 'on', true)`);

      // 1. Create a secondary platform admin to test immediate revocation without breaching recovery floor
      const testAdminId = await createPerson(client, 'Test Platform Admin', 'CONSOLE');
      const testAdminEmail = `Test Platform Admin-${testAdminId}@example.test`;
      await client.query(
        `UPDATE public.profiles SET is_platform_admin = true, status = 'ACTIVE' WHERE id = $1`,
        [testAdminId],
      );

      // Verify active access for platform admin
      const testAdminActiveRes = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [testAdminId],
      );
      expect(testAdminActiveRes.rows[0].authoritative).toBe(true);

      // 2. Query RFQ using testAdmin JWT (must succeed via rfqs_admin_select policy)
      await asUser(client, testAdminId, testAdminEmail);
      const rfqAdminSelect = await client.query(`SELECT count(*) FROM public.rfqs WHERE id = $1`, [rfqId]);
      expect(Number(rfqAdminSelect.rows[0].count)).toBe(1);

      // 3. Emergency Suspension: Suspend testAdmin profile
      await asOperator(client);
      await client.query(`SELECT set_config('otp.platform_privilege_write', 'on', true)`);
      await client.query(`UPDATE public.profiles SET status = 'SUSPENDED' WHERE id = $1`, [testAdminId]);

      // authoritative_internal_operator_access returns false immediately despite is_platform_admin = true
      const suspendedCheck = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [testAdminId],
      );
      expect(suspendedCheck.rows[0].authoritative).toBe(false);

      // 4. Using the UNEXPIRED JWT for testAdmin, attempt the administrative SELECT on rfqs
      await asUser(client, testAdminId, testAdminEmail);
      const rfqSuspendedSelect = await client.query(`SELECT count(*) FROM public.rfqs WHERE id = $1`, [rfqId]);
      // Access must immediately be 0 rows because profile_is_active_operator returns false
      expect(Number(rfqSuspendedSelect.rows[0].count)).toBe(0);

      // 5. Permanent Revocation: Revoke testAdmin profile
      await asOperator(client);
      await client.query(`SELECT set_config('otp.platform_privilege_write', 'on', true)`);
      await client.query(`UPDATE public.profiles SET status = 'REVOKED' WHERE id = $1`, [testAdminId]);

      const revokedCheck = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [testAdminId],
      );
      expect(revokedCheck.rows[0].authoritative).toBe(false);

      // Query with unexpired JWT after revocation
      await asUser(client, testAdminId, testAdminEmail);
      const rfqRevokedSelect = await client.query(`SELECT count(*) FROM public.rfqs WHERE id = $1`, [rfqId]);
      expect(Number(rfqRevokedSelect.rows[0].count)).toBe(0);

      // 6. Test Internal Staff Operator assignment lifecycle
      await asOperator(client);
      const staffId = await createPerson(client, 'Staff Operator', 'CONSOLE');
      const roleRes = await client.query<{ id: string }>(
        `SELECT id FROM public.internal_roles WHERE code = 'INTERNAL_OPERATOR' LIMIT 1`,
      );
      const roleId = roleRes.rows[0].id;
      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [staffId, roleId, adminId],
      );

      // Active staff operator has authoritative access
      const staffActiveRes = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [staffId],
      );
      expect(staffActiveRes.rows[0].authoritative).toBe(true);

      // Suspend staff operator
      await client.query(`UPDATE public.profiles SET status = 'SUSPENDED' WHERE id = $1`, [staffId]);
      const staffSuspendedRes = await client.query<{ authoritative: boolean }>(
        `SELECT private.authoritative_internal_operator_access($1) as authoritative`,
        [staffId],
      );
      expect(staffSuspendedRes.rows[0].authoritative).toBe(false);

    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

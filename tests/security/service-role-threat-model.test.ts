/**
 * service-role-threat-model.test.ts
 *
 * Verifies Phase 2 Vector B actor binding protections (T-12 and T-13):
 * T-12: Service-role or privileged caller cannot insert or assign an internal profile as a procurement actor.
 * T-13: Legitimate automated/system writes for customer profiles succeed.
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
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

async function asServiceRole(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ role: 'service_role' }),
  ]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
}

async function asOperator(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
}

async function messageOf(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return '';
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return `${err?.code ?? ''} ${err?.message ?? ''}`;
  }
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

describe('Service Role Threat Model & Vector B Actor Binding (T-12, T-13)', () => {
  it('blocks internal profiles from being assigned as procurement actors via service_role, while allowing genuine customers (rolled back)', async () => {
    const client = await connect();
    if (!client) return;

    try {
      await client.query('BEGIN');
      await asOperator(client);

      // Obtain existing platform admin profile
      const adminRes = await client.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE is_platform_admin = true AND status = 'ACTIVE' LIMIT 1`,
      );
      expect(adminRes.rows.length).toBeGreaterThan(0);
      const adminId = adminRes.rows[0].id;

      // Create genuine customer buyer profile and org
      const buyerId = await createPerson(client, 'Genuine Buyer', 'BUYER');
      const buyerOrgId = randomUUID();
      await client.query(
        `INSERT INTO public.organizations (id, name, org_type, status)
         VALUES ($1, 'Genuine Motors Corp', 'ENTERPRISE', 'ACTIVE')`,
        [buyerOrgId],
      );
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role)
         VALUES ($1, $2, 'OWNER')`,
        [buyerOrgId, buyerId],
      );

      // Create customer supplier
      const supplierId = randomUUID();
      await client.query(
        `INSERT INTO public.suppliers (id, legal_name, business_name, status)
         VALUES ($1, 'Acme Parts Ltd', 'Acme Parts', 'ACTIVE')`,
        [supplierId],
      );

      // Set session to service_role (background webhook / automation role)
      await asServiceRole(client);

      // T-12: Vector B blocks internal operator in actor column (NEW.created_by = adminId)
      const errT12Req = await messageOf(
        client,
        `INSERT INTO public.requirements (id, title, requirement_type, organization_id, created_by)
         VALUES ($1, 'Injected Requirement', 'PRODUCT', $2, $3)`,
        [randomUUID(), buyerOrgId, adminId],
      );
      expect(errT12Req).toContain('42501');
      expect(errT12Req).toContain('INTERNAL_ACTOR_FORBIDDEN');

      // T-12 (Payment): Vector B blocks internal operator in NEW.recorded_by
      const errT12Pay = await messageOf(
        client,
        `INSERT INTO public.payments (id, invoice_id, amount, currency, method, recorded_by, status)
         VALUES ($1, $2, 50000, 'INR', 'MANUAL', $3, 'RECORDED')`,
        [randomUUID(), randomUUID(), adminId],
      );
      expect(errT12Pay).toContain('42501');
      expect(errT12Pay).toContain('INTERNAL_ACTOR_FORBIDDEN');

      // T-13: Legitimate system automation with customer actor succeeds
      const requirementId = randomUUID();
      const insertT13Req = await client.query(
        `INSERT INTO public.requirements (id, title, requirement_type, organization_id, created_by)
         VALUES ($1, 'Automated Requirement', 'PRODUCT', $2, $3)
         RETURNING id`,
        [requirementId, buyerOrgId, buyerId],
      );
      expect(insertT13Req.rows[0].id).toBe(requirementId);

      const rfqId = randomUUID();
      const insertT13Rfq = await client.query(
        `INSERT INTO public.rfqs (id, requirement_id, title, organization_id, created_by, status)
         VALUES ($1, $2, 'Automated RFQ', $3, $4, 'OPEN')
         RETURNING id`,
        [rfqId, requirementId, buyerOrgId, buyerId],
      );
      expect(insertT13Rfq.rows[0].id).toBe(rfqId);

      const paymentId = randomUUID();
      const insertT13Pay = await client.query(
        `INSERT INTO public.payments (id, invoice_id, amount, currency, method, recorded_by, status)
         VALUES ($1, NULL, 50000, 'INR', 'MANUAL', $2, 'RECORDED')
         RETURNING id`,
        [paymentId, buyerId],
      );
      expect(insertT13Pay.rows[0].id).toBe(paymentId);

    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

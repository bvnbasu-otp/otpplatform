/**
 * 00281: personal ownership foundation for Individual buyers (organization_id = NULL).
 *
 * Database cases run in rolled-back transactions against the local PostgreSQL used
 * for SQL parity (127.0.0.1:54322) and are skipped with a logged reason when it is
 * unavailable or lacks 00281. They prove the ownership model and its RLS at the
 * database boundary; the end-to-end Individual journey is NOT covered because
 * signup provisioning and the lifecycle functions still use the legacy organization.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { catalogAcceptance } from '../helpers/legal-evidence-fixture';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00281 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00281_individual_personal_ownership_foundation.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('requires exactly one owner and never reassigns legacy rows', () => {
    expect(sql).toContain('num_nonnulls(organization_id, owner_profile_id) = 1');
    expect(sql).not.toMatch(/UPDATE\s+public\.(requirements|rfqs|purchase_orders)\s+SET\s+organization_id/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.organizations/i);
  });

  it('only adds personal policies for the owning profile', () => {
    expect(sql).toMatch(/owner_profile_id = private\.get_profile_id\(\)/);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });
});

async function connect(): Promise<Client | null> {
  const client = new Client(LOCAL_POSTGRES);
  try {
    await client.connect();
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const installed = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'rfqs' AND column_name = 'owner_profile_id') AS ok`,
  );
  if (!installed.rows[0].ok) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00281 applied');
    await client.end();
    return null;
  }
  return client;
}

async function expectError(client: Client, text: string, params: unknown[], code: string) {
  await client.query('SAVEPOINT expect_error');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  expect(message).toContain(code);
}

type Account = { profileId: string; authUserId: string; orgId: string | null };

async function signup(client: Client, buyerType: 'MSME' | 'INDIVIDUAL'): Promise<Account> {
  const email = `own81-${randomUUID()}@example.test`;
  await client.query('RESET ROLE');
  const legal = await catalogAcceptance(client, 'BUYER');
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [
    JSON.stringify({
      side: 'BUYER',
      buyer_type: buyerType,
      business_name: buyerType === 'INDIVIDUAL' ? 'Self' : `Ownership Org ${randomUUID().slice(0, 6)}`,
      contact_first_name: 'Own',
      contact_last_name: 'Tester',
      phone: '9876543210',
      verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru',
      coverage_pincode: '560001',
      ...legal,
      email,
    }),
  ]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const p = await client.query(
    `SELECT id, auth_user_id, active_organization_id FROM public.profiles WHERE lower(email) = lower($1)`, [email],
  );
  return { profileId: p.rows[0].id, authUserId: p.rows[0].auth_user_id, orgId: p.rows[0].active_organization_id };
}

async function actAs(client: Client, account: Account) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: account.authUserId, role: 'authenticated' }),
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

const PERSONAL_REQ = `INSERT INTO public.requirements (organization_id, owner_profile_id, created_by, requirement_type, title)
                      VALUES (NULL, $1, $1, 'SERVICE', 'Personal requirement') RETURNING id`;

describe('00281 personal ownership (database, rolled back)', () => {
  it('lets an Individual own requirements and RFQs with organization_id NULL', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      await actAs(client, alice);
      const req = await client.query(PERSONAL_REQ, [alice.profileId]);
      const reqId = req.rows[0].id;
      // RFQs are created through RPCs in production; the row is inserted directly here only to test ownership.
      await client.query('RESET ROLE');
      const rfq = await client.query(
        `INSERT INTO public.rfqs (organization_id, owner_profile_id, created_by, requirement_id, title)
         VALUES (NULL, $1, $1, $2, 'Personal RFQ') RETURNING id, organization_id, owner_profile_id`,
        [alice.profileId, reqId],
      );
      expect(rfq.rows[0].organization_id).toBeNull();
      expect(rfq.rows[0].owner_profile_id).toBe(alice.profileId);

      await actAs(client, alice);
      const mine = await client.query(`SELECT count(*)::int AS n FROM public.rfqs WHERE id = $1`, [rfq.rows[0].id]);
      expect(mine.rows[0].n).toBe(1);
      const updated = await client.query(`UPDATE public.rfqs SET title = 'Renamed' WHERE id = $1`, [rfq.rows[0].id]);
      expect(updated.rowCount).toBe(1);

      const bob = await signup(client, 'INDIVIDUAL');
      await actAs(client, bob);
      const bobSees = await client.query(`SELECT count(*)::int AS n FROM public.rfqs WHERE id = $1`, [rfq.rows[0].id]);
      expect(bobSees.rows[0].n).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('rejects ambiguous or ownerless rows at the database boundary', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      const org = await signup(client, 'MSME');
      await expectError(
        client,
        `INSERT INTO public.requirements (organization_id, owner_profile_id, created_by, requirement_type, title)
         VALUES ($2, $1, $1, 'SERVICE', 'both owners')`,
        [alice.profileId, org.orgId],
        'requirements_single_owner',
      );
      await expectError(
        client,
        `INSERT INTO public.requirements (organization_id, owner_profile_id, created_by, requirement_type, title)
         VALUES (NULL, NULL, $1, 'SERVICE', 'no owner')`,
        [alice.profileId],
        'PERSONAL_OWNER_REQUIRES_INDIVIDUAL',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('rejects cross-user reads and writes of personal records and cross-ownership inserts', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      const bob = await signup(client, 'INDIVIDUAL');
      const victimOrg = await signup(client, 'MSME');
      await actAs(client, alice);
      const reqId = (await client.query(PERSONAL_REQ, [alice.profileId])).rows[0].id;

      await actAs(client, bob);
      const seen = await client.query(`SELECT count(*)::int AS n FROM public.requirements WHERE id = $1`, [reqId]);
      expect(seen.rows[0].n).toBe(0);
      const changed = await client.query(`UPDATE public.requirements SET title = 'hijack' WHERE id = $1`, [reqId]);
      expect(changed.rowCount).toBe(0);
      // Cannot create a record owned by someone else, or claim another owner's organization.
      await expectError(client, PERSONAL_REQ, [alice.profileId], 'row-level security');
      await expectError(
        client,
        `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title)
         VALUES ($1, $2, 'SERVICE', 'into another org')`,
        [victimOrg.orgId, bob.profileId],
        'row-level security',
      );
      // Cannot move a personal record onto an organization.
      await actAs(client, alice);
      await expectError(
        client, `UPDATE public.requirements SET organization_id = $2, owner_profile_id = NULL WHERE id = $1`,
        [reqId, victimOrg.orgId], 'OWNERSHIP_IMMUTABLE',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps organization-owned RWA/MSME records isolated from personal ones', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      const msme = await signup(client, 'MSME');
      await actAs(client, alice);
      const personalId = (await client.query(PERSONAL_REQ, [alice.profileId])).rows[0].id;

      await actAs(client, msme);
      const orgReq = await client.query(
        `INSERT INTO public.requirements (organization_id, created_by, requirement_type, title)
         VALUES ($1, $2, 'SERVICE', 'Org requirement') RETURNING id`,
        [msme.orgId, msme.profileId],
      );
      const visible = await client.query(`SELECT id FROM public.requirements WHERE id = ANY($1::uuid[])`, [[personalId, orgReq.rows[0].id]]);
      expect(visible.rows.map((r) => r.id)).toEqual([orgReq.rows[0].id]);

      await actAs(client, alice);
      const aliceSees = await client.query(`SELECT id FROM public.requirements WHERE id = ANY($1::uuid[])`, [[personalId, orgReq.rows[0].id]]);
      expect(aliceSees.rows.map((r) => r.id)).toEqual([personalId]);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('classifies legacy Individual organizations for admins only and reassigns nothing', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const alice = await signup(client, 'INDIVIDUAL');
      // A legacy Individual: a "Self" organization with its single owner member (created before 00282).
      const legacyOrg = randomUUID();
      await client.query(`INSERT INTO public.organizations (id, name, org_type) VALUES ($1, 'Self', 'INDIVIDUAL')`, [legacyOrg]);
      await client.query(`INSERT INTO public.organization_members (organization_id, profile_id, role) VALUES ($1, $2, 'OWNER')`, [legacyOrg, alice.profileId]);
      const before = await client.query(
        `SELECT count(*)::int AS n FROM public.requirements WHERE organization_id = $1`, [legacyOrg],
      );
      const report = await client.query(`SELECT public.individual_ownership_migration_report() AS r`);
      const ids = (report.rows[0].r.unambiguous as Array<{ organizationId: string; ownerProfileId: string }>);
      const mine = ids.find((o) => o.organizationId === legacyOrg);
      expect(mine?.ownerProfileId).toBe(alice.profileId);
      const after = await client.query(
        `SELECT count(*)::int AS n FROM public.requirements WHERE organization_id = $1`, [legacyOrg],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
      expect((await client.query(`SELECT org_type::text AS t FROM public.organizations WHERE id = $1`, [legacyOrg])).rows[0].t).toBe('INDIVIDUAL');

      await actAs(client, alice);
      await expectError(client, `SELECT public.individual_ownership_migration_report()`, [], 'ADMIN-ONLY');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

/**
 * 00277: an RWA Estate/Facility Manager is operational only (audit finding RBAC-1).
 *
 * Behavioural cases run in a rolled-back transaction against the local
 * PostgreSQL used for SQL parity (127.0.0.1:54322) and are skipped with a
 * logged reason when it is unavailable or lacks 00277.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00277 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00277_rwa_facility_manager_operational_only.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('restricts only APPROVE and AWARD for FACILITY_MANAGER in committee-governed orgs', () => {
    expect(sql).toMatch(/p_permission IN \('APPROVE'::role_permission, 'AWARD'::role_permission\)/);
    expect(sql).toMatch(/o\.org_type::text IN \('COMMUNITY', 'RWA', 'SOCIETY'\)/);
    expect(sql).toContain("= 'FACILITY_MANAGER'");
  });

  it('does not change the role catalogue shared with MSME sourcing leads', () => {
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?user_roles/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+(public\.)?user_roles/i);
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
    `SELECT pg_get_functiondef('private.has_role_permission(role_permission)'::regprocedure) ILIKE '%FACILITY_MANAGER%' AS ok`,
  );
  if (!installed.rows[0].ok) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00277 applied');
    await client.end();
    return null;
  }
  return client;
}

async function signup(client: Client, payload: Record<string, unknown>) {
  const email = `rbac-${randomUUID()}@example.test`;
  await client.query('SET LOCAL ROLE anon');
  const res = await client.query('SELECT public.submit_signup_request($1::jsonb) AS r', [
    JSON.stringify({
      contact_first_name: 'Rbac',
      contact_last_name: 'Tester',
      phone: '9876543210',
      verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru',
      coverage_pincode: '560001',
      eula_accepted: true,
      eula_version: 'v1.0-20261014',
      side: 'BUYER',
      email,
      ...payload,
    }),
  ]);
  await client.query('RESET ROLE');
  expect(res.rows[0].r.status).toBe('ONBOARDED');
  const profile = await client.query(
    `SELECT p.id, p.auth_user_id, p.active_organization_id
     FROM public.profiles p WHERE lower(p.email) = lower($1)`,
    [email],
  );
  return profile.rows[0] as { id: string; auth_user_id: string; active_organization_id: string };
}

async function hasPermission(client: Client, authUserId: string, permission: string): Promise<boolean> {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUserId, role: 'authenticated' }),
  ]);
  const res = await client.query('SELECT private.has_role_permission($1::role_permission) AS allowed', [permission]);
  return res.rows[0].allowed as boolean;
}

describe('00277 database outcomes (rolled back)', () => {
  it('denies APPROVE/AWARD to a non-owner Facility Manager in an RWA but keeps operational rights', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const rwaOwner = await signup(client, {
        buyer_type: 'COMMUNITY',
        business_name: `RWA ${randomUUID().slice(0, 8)}`,
      });
      const manager = await signup(client, {
        buyer_type: 'MSME',
        business_name: `Estate Manager ${randomUUID().slice(0, 8)}`,
      });
      const managerOwnOrg = manager.active_organization_id;

      // The manager works for the RWA as a non-owner member.
      await client.query(`DELETE FROM public.organization_members WHERE profile_id = $1 AND role = 'OWNER'`, [manager.id]);
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role) VALUES ($1, $2, 'MANAGER')`,
        [rwaOwner.active_organization_id, manager.id],
      );
      await client.query(`UPDATE public.profiles SET active_organization_id = $2 WHERE id = $1`, [
        manager.id,
        rwaOwner.active_organization_id,
      ]);

      const roleRow = await client.query('SELECT active_role_code FROM public.profiles WHERE id = $1', [manager.id]);
      expect(roleRow.rows[0].active_role_code).toBe('FACILITY_MANAGER');

      expect(await hasPermission(client, manager.auth_user_id, 'AWARD')).toBe(false);
      expect(await hasPermission(client, manager.auth_user_id, 'APPROVE')).toBe(false);
      expect(await hasPermission(client, manager.auth_user_id, 'WRITE')).toBe(true);
      expect(await hasPermission(client, manager.auth_user_id, 'PROPOSE')).toBe(true);
      expect(await hasPermission(client, manager.auth_user_id, 'VOTE')).toBe(false);

      // The same role keeps AWARD where the organization is not committee-governed (MSME).
      await client.query(`UPDATE public.profiles SET active_organization_id = $2 WHERE id = $1`, [
        manager.id,
        managerOwnOrg,
      ]);
      await client.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role) VALUES ($1, $2, 'MANAGER')
         ON CONFLICT (organization_id, profile_id) DO UPDATE SET role = 'MANAGER'`,
        [managerOwnOrg, manager.id],
      );
      expect(await hasPermission(client, manager.auth_user_id, 'AWARD')).toBe(true);

      // The RWA owner and the committee role are not affected by the restriction.
      expect(await hasPermission(client, rwaOwner.auth_user_id, 'AWARD')).toBe(true);
      const committeeRole = await client.query(
        `SELECT permissions::text[] AS permissions FROM public.user_roles WHERE code = 'COMMITTEE_MEMBER'`,
      );
      expect(committeeRole.rows[0].permissions).toEqual(expect.arrayContaining(['VOTE', 'APPROVE']));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

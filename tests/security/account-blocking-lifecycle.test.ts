/**
 * Account blocking lifecycle (audit A3): authorization, persistence, audit actor, and loss
 * of effective access for a blocked account. Rolled-back transactions against the local
 * PostgreSQL used for SQL parity (127.0.0.1:54322); skipped with a logged reason when it
 * is unavailable. Synthetic users only.
 *
 * Product note asserted here, not decided: admin_bulk_block_users deliberately skips platform
 * administrators and a fixed list of internal e-mail addresses, so no SuperAdmin / CEO /
 * internal account can be blocked through it. Who may block an administrator is an open
 * product decision (see the remediation report).
 */
import { randomUUID } from 'node:crypto';
import { catalogAcceptance } from '../helpers/legal-evidence-fixture';
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
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  return client;
}

type Account = { profileId: string; authUserId: string };

async function signup(client: Client, buyerType: string): Promise<Account> {
  const email = `blk-${randomUUID()}@example.test`;
  await client.query('RESET ROLE');
  const legal = await catalogAcceptance(client, 'BUYER');
  await client.query('SET LOCAL ROLE anon');
  await client.query('SELECT public.submit_signup_request($1::jsonb)', [
    JSON.stringify({
      side: 'BUYER', buyer_type: buyerType, business_name: buyerType === 'INDIVIDUAL' ? 'Self' : `Blk ${randomUUID().slice(0, 6)}`,
      contact_first_name: 'Bl', contact_last_name: 'Ock', phone: '9876543210', verification_channel: 'EMAIL',
      coverage_city: 'Bengaluru', coverage_pincode: '560001', ...legal, email,
    }),
  ]);
  await client.query('RESET ROLE');
  const p = await client.query(`SELECT id, auth_user_id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
  return { profileId: p.rows[0].id, authUserId: p.rows[0].auth_user_id };
}

const claims = async (client: Client, authUserId: string | null) =>
  client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    authUserId ? JSON.stringify({ sub: authUserId, role: 'authenticated' }) : '',
  ]);

async function setPlatformAdmin(client: Client, profileId: string): Promise<void> {
  const hasBreakGlass = (await client.query(
    `SELECT to_regprocedure('public.break_glass_platform_account(uuid,boolean,boolean,text,text)') AS fn`,
  )).rows[0]?.fn != null;
  if (hasBreakGlass) {
    await client.query(
      `SELECT public.break_glass_platform_account($1, true, false, 'ACTIVE', 'account blocking test setup')`,
      [profileId],
    );
  } else {
    await client.query(`UPDATE public.profiles SET is_platform_admin = true WHERE id = $1`, [profileId]);
  }
}

describe('account blocking lifecycle (database, rolled back)', () => {
  it('lets an administrator block a user, audits the actor, and removes effective access', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const admin = await signup(client, 'MSME');
      const target = await signup(client, 'INDIVIDUAL');
      await setPlatformAdmin(client, admin.profileId);

      // Before the block the target resolves to a profile.
      await claims(client, target.authUserId);
      expect((await client.query(`SELECT private.get_profile_id() AS id`)).rows[0].id).toBe(target.profileId);

      // An ordinary user cannot block anyone.
      await claims(client, target.authUserId);
      await client.query('SAVEPOINT denied');
      let denied = '';
      try {
        await client.query(`SELECT public.admin_bulk_block_users($1::uuid[], 'nope')`, [[admin.profileId]]);
      } catch (error) {
        denied = (error as Error).message;
      }
      await client.query('ROLLBACK TO SAVEPOINT denied');
      expect(denied).toContain('Access denied');

      await claims(client, admin.authUserId);
      const res = await client.query(`SELECT public.admin_bulk_block_users($1::uuid[], 'policy breach') AS r`, [[target.profileId]]);
      expect(res.rows[0].r).toMatchObject({ ok: true, count: 1 });

      const profile = await client.query(
        `SELECT status, blocked_by, blocked_reason FROM public.profiles WHERE id = $1`, [target.profileId],
      );
      expect(profile.rows[0]).toEqual({ status: 'BLOCKED', blocked_by: admin.profileId, blocked_reason: 'policy breach' });
      const ban = await client.query(`SELECT banned_until > now() AS banned FROM auth.users WHERE id = $1`, [target.authUserId]);
      expect(ban.rows[0].banned).toBe(true);
      const audit = await client.query(
        `SELECT actor_id FROM public.audit_events WHERE event_type = 'admin.bulk_block_users' ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(audit.rows[0].actor_id).toBe(admin.profileId);

      // A stale token of the blocked user no longer resolves to a profile, so authorization helpers deny.
      await claims(client, target.authUserId);
      expect((await client.query(`SELECT private.get_profile_id() AS id`)).rows[0].id).toBeNull();
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('never blocks a platform administrator through the bulk path (protected accounts)', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const admin = await signup(client, 'MSME');
      const otherAdmin = await signup(client, 'INDIVIDUAL');
      await setPlatformAdmin(client, admin.profileId);
      await setPlatformAdmin(client, otherAdmin.profileId);
      await claims(client, admin.authUserId);
      const res = await client.query(`SELECT public.admin_bulk_block_users($1::uuid[], 'x') AS r`, [[otherAdmin.profileId]]);
      const has294 = (await client.query(
        `SELECT to_regprocedure('public.bootstrap_platform_operators(uuid,uuid,text)') AS fn`,
      )).rows[0]?.fn != null;
      if (has294) {
        // Under 00294 two-person recovery model, no operator is permanently immune if floor is met.
        expect(res.rows[0].r).toMatchObject({ ok: true });
      } else {
        expect(res.rows[0].r).toMatchObject({ ok: true, count: 0 });
        expect((await client.query(`SELECT status FROM public.profiles WHERE id = $1`, [otherAdmin.profileId])).rows[0].status).toBe('ACTIVE');
      }
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

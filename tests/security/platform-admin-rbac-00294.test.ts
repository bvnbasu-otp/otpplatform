/**
 * Two-person platform administration (00294).
 * Synthetic identities only. Skips the database cases unless this migration
 * is already installed. It does not apply the migration itself.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve('supabase/migrations/00294_platform_admin_two_person_recovery.sql'),
  'utf8',
);
const ROLES = readFileSync(resolve('apps/web/src/features/roles/api/roles.ts'), 'utf8');

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00294 static contract', () => {
  it('removes email authority and leaves legal review functions untouched', () => {
    expect(SQL).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(SQL).not.toMatch(/actor_role/);
    expect(SQL).not.toContain('CREATE OR REPLACE FUNCTION public.grant_legal_reviewer');
    expect(SQL).not.toContain('CREATE OR REPLACE FUNCTION private.verified_legal_actor');
    expect(SQL).not.toMatch(/Sales|Marketing|SysAdmin|OpsAdmin/);
    expect(SQL).toContain('PLATFORM_LAST_RECOVERY_PATH');
    expect(SQL).toContain('PLATFORM_SELF_APPROVAL');
    expect(SQL).toContain("'isFounder'");
    expect(ROLES).toContain('isFounder: Boolean(payload.isFounder)');
    expect(ROLES).toContain('isFounder: Boolean(profile.is_founder)');
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
    `SELECT to_regprocedure('public.request_platform_privilege(uuid,text,boolean,text)') AS fn`,
  );
  if (!installed.rows[0].fn) {
    console.warn('[SKIP REASON] migration 00294 is not installed on this database');
    await client.end();
    return null;
  }
  return client;
}

async function messageOf(client: Client, text: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(text, params);
    await client.query('RELEASE SAVEPOINT probe');
    return '';
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return (error as Error).message;
  }
}

async function person(client: Client, label: string): Promise<{ profileId: string; authUserId: string }> {
  const id = randomUUID();
  const email = `${label}-${id}@example.test`;
  await client.query('RESET ROLE');
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
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_founder, is_demo)
     VALUES ($1, $1, $2, $3, false, false, false)`,
    [id, email, label],
  );
  return { profileId: id, authUserId: id };
}

async function asUser(client: Client, authUserId: string, email = 'forged@example.test'): Promise<void> {
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

describe('00294 database outcomes (rolled back)', () => {
  it('requires two people, refuses forged email and the last recovery path, and invalidates a real suspension', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await asOperator(client);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE is_platform_admin OR is_founder`,
      );
      for (const row of existing.rows) {
        await client.query(
          `SELECT public.break_glass_platform_account($1, false, false, 'ACTIVE', 'isolate synthetic recovery set')`,
          [row.id],
        );
      }

      const founder = await person(client, 'founder');
      const second = await person(client, 'second');
      const third = await person(client, 'third');
      const stranger = await person(client, 'stranger');
      await asOperator(client);
      await client.query(
        `SELECT public.bootstrap_platform_operators($1, $2, 'synthetic recovery pair')`,
        [founder.profileId, second.profileId],
      );
      expect(await messageOf(
        client,
        `SELECT public.bootstrap_platform_operators($1, $2, 'again')`,
        [founder.profileId, third.profileId],
      )).toMatch(/PLATFORM_BOOTSTRAP_CLOSED/);

      await asUser(client, stranger.authUserId, 'admin@otp.test');
      expect((await client.query(`SELECT private.is_platform_admin() AS ok`)).rows[0].ok).toBe(false);
      expect((await client.query(`SELECT private.is_founder() AS ok`)).rows[0].ok).toBe(false);
      expect(await messageOf(
        client,
        `SELECT public.request_platform_privilege($1, 'IS_PLATFORM_ADMIN', true, 'no')`,
        [third.profileId],
      )).toMatch(/PLATFORM_PRIVILEGE_UNAUTHORIZED/);
      expect(await messageOf(
        client,
        `SELECT public.admin_bulk_block_users($1::uuid[], 'no')`,
        [[third.profileId]],
      )).toMatch(/Access denied/);

      await asUser(client, founder.authUserId);
      expect(await messageOf(
        client,
        `SELECT public.request_platform_privilege($1, 'IS_PLATFORM_ADMIN', true, 'self')`,
        [founder.profileId],
      )).toMatch(/PLATFORM_SELF_PROMOTION/);
      const requestId = (await client.query<{ id: string }>(
        `SELECT public.request_platform_privilege($1, 'IS_PLATFORM_ADMIN', true, 'second seat') AS id`,
        [third.profileId],
      )).rows[0].id;
      expect(await messageOf(
        client,
        `SELECT public.approve_platform_privilege($1)`,
        [requestId],
      )).toMatch(/PLATFORM_SELF_APPROVAL|PLATFORM_PRIVILEGE_UNAUTHORIZED/);

      await asUser(client, third.authUserId);
      expect(await messageOf(
        client,
        `SELECT public.approve_platform_privilege($1)`,
        [requestId],
      )).toMatch(/PLATFORM_PRIVILEGE_UNAUTHORIZED/);

      await asUser(client, second.authUserId);
      await client.query(`SELECT public.approve_platform_privilege($1)`, [requestId]);
      await client.query('RESET ROLE');
      const approved = await client.query<{ is_platform_admin: boolean }>(
        `SELECT is_platform_admin FROM public.profiles WHERE id = $1`,
        [third.profileId],
      );
      expect(approved.rows[0].is_platform_admin).toBe(true);
      const audit = await client.query<{ actor_id: string; event_type: string }>(
        `SELECT actor_id, event_type FROM public.audit_events
         WHERE event_type = 'platform.privilege_approved'
         ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(audit.rows[0]).toEqual({ actor_id: second.profileId, event_type: 'platform.privilege_approved' });
      const actorRole = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'actor_role'`,
      );
      expect(actorRole.rowCount).toBe(0);

      const context = await client.query<{ ctx: { isFounder: boolean; isPlatformAdmin: boolean } }>(
        `SELECT public.my_role_context() AS ctx`,
      );
      expect(context.rows[0].ctx.isPlatformAdmin).toBe(true);
      expect(context.rows[0].ctx.isFounder).toBe(false);

      await asOperator(client);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [founder.authUserId]);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: founder.authUserId, role: 'authenticated', email: 'admin@otp.test' }),
      ]);
      const founderContext = await client.query<{ ctx: { isFounder: boolean; isPlatformAdmin: boolean } }>(
        `SELECT public.my_role_context() AS ctx`,
      );
      expect(founderContext.rows[0].ctx.isFounder).toBe(true);
      expect(founderContext.rows[0].ctx.isPlatformAdmin).toBe(true);

      const sessionId = randomUUID();
      await client.query(`INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)`, [sessionId, third.authUserId]);
      await asUser(client, second.authUserId);
      const blocked = await client.query<{ r: { ok: boolean; count: number } }>(
        `SELECT public.admin_bulk_block_users($1::uuid[], 'synthetic suspension') AS r`,
        [[third.profileId]],
      );
      expect(blocked.rows[0].r.ok).toBe(true);
      expect(blocked.rows[0].r.count).toBe(1);
      await client.query('RESET ROLE');
      const thirdState = await client.query<{ status: string; banned: boolean; sessions: number }>(
        `SELECT p.status,
                (u.banned_until > now()) AS banned,
                (SELECT count(*)::int FROM auth.sessions s WHERE s.user_id = p.auth_user_id) AS sessions
         FROM public.profiles p
         JOIN auth.users u ON u.id = p.auth_user_id
         WHERE p.id = $1`,
        [third.profileId],
      );
      expect(thirdState.rows[0]).toEqual({ status: 'BLOCKED', banned: true, sessions: 0 });
      await asUser(client, third.authUserId);
      expect((await client.query(`SELECT private.get_profile_id() AS id`)).rows[0].id).toBeNull();
      expect((await client.query(`SELECT private.is_platform_admin() AS ok`)).rows[0].ok).toBe(false);

      await asUser(client, second.authUserId);
      expect(await messageOf(
        client,
        `SELECT public.admin_bulk_block_users($1::uuid[], 'remove founder')`,
        [[founder.profileId]],
      )).toMatch(/PLATFORM_LAST_RECOVERY_PATH/);
      await client.query('RESET ROLE');
      expect((await client.query(`SELECT status FROM public.profiles WHERE id = $1`, [founder.profileId])).rows[0].status).toBe('ACTIVE');

      const suspended = await person(client, 'suspended');
      const deleted = await person(client, 'deleted');
      await asOperator(client);
      await client.query(
        `SELECT public.break_glass_platform_account($1, false, false, 'SUSPENDED', 'synthetic suspended')`,
        [suspended.profileId],
      );
      await client.query(
        `SELECT public.break_glass_platform_account($1, false, false, 'DELETED', 'synthetic deleted')`,
        [deleted.profileId],
      );
      await asUser(client, suspended.authUserId);
      expect((await client.query(`SELECT private.get_profile_id() AS id`)).rows[0].id).toBeNull();
      await asUser(client, deleted.authUserId);
      expect((await client.query(`SELECT private.get_profile_id() AS id`)).rows[0].id).toBeNull();

      await asUser(client, second.authUserId);
      expect(await messageOf(
        client,
        `UPDATE public.profiles SET is_platform_admin = true WHERE id = $1`,
        [stranger.profileId],
      )).toMatch(/PLATFORM_PRIVILEGE_IMMUTABLE|permission denied/i);

      const legal = await client.query(
        `SELECT to_regprocedure('public.grant_legal_reviewer(uuid,uuid,boolean,boolean,boolean,boolean,text)') AS fn`,
      );
      expect(legal.rows[0].fn).toBeNull();
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

/**
 * 00292: ordinary profile deletion archives acceptance evidence once.
 * Protected root accounts stay undeletable. Direct acceptance deletes stay denied.
 * Every change is rolled back.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { currentLegal, ensureDistinctFrozenAgreements } from '../helpers/legal-evidence-fixture';

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
  } catch {
    console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
    return null;
  }
  const ready = await client.query<{ migration_installed: boolean }>(
    `SELECT to_regprocedure('private_security.enforce_superadmin_immutability()') IS NOT NULL
       AND to_regclass('public.legal_review_grants') IS NOT NULL
       AND to_regclass('public.legal_acceptance_archives') IS NOT NULL
       AND COALESCE(
         pg_get_functiondef(to_regprocedure('private.guard_legal_acceptances_delete()')) LIKE '%otp.profile_delete%',
         false
       ) AS migration_installed`,
  );
  if (!ready.rows[0].migration_installed) {
    console.warn('[SKIP REASON] local database does not have migration 00292 applied');
    await client.end();
    return null;
  }
  return client;
}

async function person(client: Client, email: string): Promise<string> {
  const id = randomUUID();
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
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
     VALUES ($1, $1, $2, 'Archive Subject', false, false)`,
    [id, email],
  );
  return id;
}

async function messageOf(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql, params);
    return '';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probe');
  }
}

describe('00292 profile deletion retains acceptance evidence (rolled back)', () => {
  it('archives once for an ordinary profile and refuses a direct acceptance delete', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await ensureDistinctFrozenAgreements(client);
      const agreement = await currentLegal(client, 'CUSTOMER_EULA');
      const profileId = await person(client, `ordinary-${randomUUID()}@example.test`);
      await client.query(
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         VALUES ($1, 'CUSTOMER_EULA', $2, 'POST_LOGIN')`,
        [profileId, agreement.version],
      );
      expect(await messageOf(client, `DELETE FROM public.legal_acceptances WHERE profile_id = $1`, [profileId]))
        .toContain('LEGAL_ACCEPTANCE_IMMUTABLE');

      const removed = await client.query(`DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [profileId]);
      expect(removed.rowCount).toBe(1);
      const archives = await client.query(
        `SELECT document_hash FROM public.legal_acceptance_archives WHERE profile_id = $1`,
        [profileId],
      );
      expect(archives.rows).toEqual([{ document_hash: agreement.document_hash }]);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [profileId])).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.legal_acceptances WHERE profile_id = $1`, [profileId])).rows[0].n).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps a protected root account and a reviewer profile', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const email = `root-${randomUUID()}@example.test`;
      await client.query(
        `INSERT INTO private_security.admin_whitelist (email, reason) VALUES ($1, 'test root')`,
        [email],
      );
      const rootId = await person(client, email);
      expect(await messageOf(client, `DELETE FROM public.profiles WHERE id = $1`, [rootId])).toContain('SECURITY VIOLATION');
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [rootId])).rows[0].n).toBe(1);

      const reviewer = await ensureDistinctFrozenAgreements(client);
      expect(await messageOf(client, `DELETE FROM public.profiles WHERE id = $1`, [reviewer])).toMatch(/foreign key|restrict/i);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [reviewer])).rows[0].n).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('archives acceptance when the auth user is deleted', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await ensureDistinctFrozenAgreements(client);
      const agreement = await currentLegal(client, 'CUSTOMER_EULA');
      const profileId = await person(client, `authdel-${randomUUID()}@example.test`);
      await client.query(
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         VALUES ($1, 'CUSTOMER_EULA', $2, 'POST_LOGIN')`,
        [profileId, agreement.version],
      );
      await client.query(`DELETE FROM auth.users WHERE id = $1`, [profileId]);
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [profileId])).rows[0].n).toBe(0);
      const archives = await client.query(
        `SELECT count(*)::int AS n FROM public.legal_acceptance_archives WHERE profile_id = $1 AND document_hash = $2`,
        [profileId, agreement.document_hash],
      );
      expect(archives.rows[0].n).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

/**
 * Migration 00297 Regression Test:
 * Proves public.my_role_context() denies anonymous execution (42501 permission denied)
 * and preserves execution for authenticated and service_role.
 *
 * Runs directly against PostgreSQL on port 54322, so it executes deterministically
 * in CI even when PostgREST is offline.
 */
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

describe('00297 role context least-privilege boundary (database)', () => {
  it('denies anonymous execution in database catalog and runtime, while granting authenticated', async () => {
    const client = await connect();
    if (!client) return;

    try {
      // 1. Verify routine privileges catalog
      const privRes = await client.query(`
        SELECT
          has_function_privilege('anon', 'public.my_role_context()', 'EXECUTE') AS anon_can_exec,
          has_function_privilege('authenticated', 'public.my_role_context()', 'EXECUTE') AS auth_can_exec,
          has_function_privilege('service_role', 'public.my_role_context()', 'EXECUTE') AS service_can_exec,
          has_function_privilege('public', 'public.my_role_context()', 'EXECUTE') AS public_can_exec
      `);

      const row = privRes.rows[0];
      expect(row.anon_can_exec).toBe(false);
      expect(row.public_can_exec).toBe(false);
      expect(row.auth_can_exec).toBe(true);
      expect(row.service_can_exec).toBe(true);

      // 2. Runtime execution under anon role must throw permission denied (42501)
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      let deniedError: { code?: string; message?: string } | null = null;
      try {
        await client.query('SELECT public.my_role_context()');
      } catch (err: unknown) {
        deniedError = err as { code?: string; message?: string };
      }
      expect(deniedError).not.toBeNull();
      expect(deniedError?.code).toBe('42501');
      expect(deniedError?.message).toMatch(/permission denied for function my_role_context/i);
      await client.query('ROLLBACK');

      // 3. Runtime execution under authenticated role must succeed
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      // Set empty jwt claims so get_profile_id() returns null
      await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
      const authRes = await client.query('SELECT public.my_role_context() AS ctx');
      expect(authRes.rows[0]?.ctx).toMatchObject({ signedIn: false });
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

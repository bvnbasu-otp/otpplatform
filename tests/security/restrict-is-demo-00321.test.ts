import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_POSTGRES_ADDRESS,
  LOCAL_POSTGRES_PORT,
  requireLocalPostgresSqlParity,
} from '../helpers/local-postgres-sql-parity';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');
const PROPOSAL = resolve(ROOT, 'supabase/00321_restrict_is_demo_marker.UNAPPLIED.sql');
const DELETE_PROPOSAL = resolve(ROOT, 'supabase/00320_superadmin_demo_user_deletion.UNAPPLIED.sql');
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: LOCAL_POSTGRES_PORT,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function stripTransaction(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:BEGIN|COMMIT);\s*$/.test(line))
    .join('\n');
}

async function captureError(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT expected_error');
  try {
    await client.query(sql, params);
    return '';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_error');
    await client.query('RELEASE SAVEPOINT expected_error');
  }
}

async function insertAuthUser(client: Client, id: string, email: string): Promise<void> {
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
}

describe('00321 profile demo-marker guard static contract', () => {
  const sql = readFileSync(PROPOSAL, 'utf8');
  const executable = stripComments(sql);

  it('keeps 00321 outside the runner and makes it a 00320 prerequisite', () => {
    const migrations = readdirSync(MIGRATIONS).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
    expect(migrations.at(-1)).toBe('00314_internal_invitation_acceptance.sql');
    expect(migrations.some((file) => file.startsWith('00321_'))).toBe(false);
    expect(readdirSync(resolve(ROOT, 'supabase')).filter((file) => file.startsWith('00321_'))).toEqual([
      '00321_restrict_is_demo_marker.UNAPPLIED.sql',
    ]);
    expect(readFileSync(DELETE_PROPOSAL, 'utf8')).toContain(
      "to_regprocedure('private_security.guard_profile_is_demo_marker()')",
    );
  });

  it('adds a separate fail-closed trigger without replacing existing guards', () => {
    expect(sql.startsWith('-- STATUS: UNAPPLIED')).toBe(true);
    expect(executable).toContain('CREATE FUNCTION private_security.guard_profile_is_demo_marker()');
    expect(executable).toMatch(
      /CREATE TRIGGER trg_guard_profile_is_demo_marker\s+BEFORE INSERT OR UPDATE OF is_demo, is_founder ON public\.profiles/i,
    );
    expect(executable).not.toMatch(/CREATE OR REPLACE FUNCTION private\.(?:guard_profile_privileges|assert_active_role_held)/i);
    expect(executable).not.toMatch(/\bDROP\s+(?:TRIGGER|FUNCTION|TABLE)\b/i);
    expect(executable).not.toMatch(/DISABLE\s+TRIGGER|session_replication_role|SET\s+CONSTRAINTS/i);
  });

  it('allows trusted seed creation only and has no admin, service-role, or RPC bypass', () => {
    expect(executable).toContain("session_user IN ('postgres', 'supabase_admin')");
    expect(executable).toContain('auth.uid() IS NULL');
    expect(executable).toContain("COALESCE(auth.role(), '') = ''");
    expect(executable).toContain('DEMO_MARKER_TRUSTED_INSERT_REQUIRED');
    expect(executable).not.toMatch(/private\.is_platform_admin|SUPER_ADMIN|service_role'\s*\)/i);
    expect(executable).not.toMatch(/current_setting|set_config/i);
    expect(executable).not.toMatch(/GRANT\s+EXECUTE/i);
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION private_security\.guard_profile_is_demo_marker\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i,
    );
  });

  it('denies founder demo status and every false-to-true update while allowing true-to-false', () => {
    expect(executable).toContain('NEW.is_founder IS TRUE AND NEW.is_demo IS TRUE');
    expect(executable).toContain('OLD.is_demo IS DISTINCT FROM TRUE AND NEW.is_demo IS TRUE');
    expect(executable).toContain('DEMO_MARKER_IMMUTABLE');
    expect(executable).not.toMatch(/OLD\.is_demo IS TRUE AND NEW\.is_demo IS DISTINCT FROM TRUE[\s\S]*RAISE/i);
  });
});

describe('00321 profile demo-marker guard behavior (local postgres, always rolled back)', () => {
  it('rejects prohibited transitions and preserves unrelated updates', async (ctx) => {
    const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
    } catch (error) {
      const reason = `local PostgreSQL unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
      if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
      else console.warn(`[SKIP REASON] ${reason}`);
      ctx.skip();
      return;
    }

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '60s'`);
      const ready = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('public.profiles') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'profiles'
              AND column_name IN ('is_demo', 'is_founder')
            GROUP BY table_schema, table_name HAVING count(*) = 2
          ) AS ok`,
      );
      if (!ready.rows[0]?.ok) {
        throw new Error('00321 behavior prerequisites missing: profiles.is_demo/is_founder');
      }

      await client.query(stripTransaction(readFileSync(PROPOSAL, 'utf8')));
      const ordinary = randomUUID();
      const demo = randomUUID();
      const founder = randomUUID();
      const sessionDemo = randomUUID();
      for (const [id, prefix] of [
        [ordinary, 'ordinary'],
        [demo, 'demo'],
        [founder, 'founder'],
        [sessionDemo, 'session-demo'],
      ]) {
        await insertAuthUser(client, id, `${prefix}-${id}@example.test`);
      }

      await client.query(
        `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_demo, is_founder)
         VALUES ($1, $1, $2, 'Ordinary rollback fixture', false, false)`,
        [ordinary, `ordinary-${ordinary}@example.test`],
      );
      await client.query(
        `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_demo, is_founder)
         VALUES ($1, $1, $2, 'Demo rollback fixture', true, false)`,
        [demo, `demo-${demo}@example.test`],
      );

      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ordinary]);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: 'authenticated', sub: ordinary }),
      ]);
      expect(
        await captureError(
          client,
          `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_demo, is_founder)
           VALUES ($1, $1, $2, 'Session demo fixture', true, false)`,
          [sessionDemo, `session-demo-${sessionDemo}@example.test`],
        ),
      ).toContain('DEMO_MARKER_TRUSTED_INSERT_REQUIRED');
      await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await client.query(`SELECT set_config('request.jwt.claims', '', true)`);

      expect(
        await captureError(
          client,
          `UPDATE public.profiles SET is_demo = true WHERE id = $1`,
          [ordinary],
        ),
      ).toContain('DEMO_MARKER_IMMUTABLE');
      expect(
        await captureError(
          client,
          `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_demo, is_founder)
           VALUES ($1, $1, $2, 'Founder rollback fixture', true, true)`,
          [founder, `founder-${founder}@example.test`],
        ),
      ).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
      const canonicalFounder = await client.query<{ id: string }>(
        `SELECT id::text FROM public.profiles WHERE is_founder IS TRUE AND lower(email) = 'bvnbasu@gmail.com'`,
      );
      expect(canonicalFounder.rows).toHaveLength(1);
      expect(
        await captureError(
          client,
          `UPDATE public.profiles SET is_demo = true WHERE id = $1`,
          [canonicalFounder.rows[0].id],
        ),
      ).toContain('DEMO_MARKER_IMMUTABLE: a founder profile cannot be a demo account');

      await client.query(`UPDATE public.profiles SET is_demo = false WHERE id = $1`, [demo]);
      expect(
        await captureError(client, `UPDATE public.profiles SET is_demo = true WHERE id = $1`, [demo]),
      ).toContain('DEMO_MARKER_IMMUTABLE');
      const unrelated = await client.query(
        `UPDATE public.profiles SET full_name = 'Updated rollback fixture' WHERE id = $1 RETURNING full_name`,
        [ordinary],
      );
      expect(unrelated.rows[0]?.full_name).toBe('Updated rollback fixture');
    } catch (error) {
      failed = error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        failed = failed ?? error;
      }
      await client.end();
    }
    if (failed) throw failed;
  });
});

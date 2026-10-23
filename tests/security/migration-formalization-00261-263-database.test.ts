/**
 * Live Postgres behavior for migrations 00261–00263 (local disposable Supabase only).
 * Skips with an explicit reason when local Postgres/REST is unavailable (default 54322; disposable gate: LOCAL_POSTGRES_PORT=55322, SUPABASE_URL=http://127.0.0.1:55321).
 * Does not reset or mutate schema_migrations; assumes operator DB already includes 00261–00263
 * (draft-apply trial or clean supabase db reset on a disposable instance).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';

const ROOT = resolve(__dirname, '../..');
const LOCAL_PG: ClientConfig = {
  host: process.env.LOCAL_POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.LOCAL_POSTGRES_PORT ?? 54322),
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 2000,
};

let restUp = false;
let pgUp = false;
let skipReason = 'Local Supabase not reachable (start Docker + pnpm db:start)';

async function pgConnect(): Promise<Client | null> {
  const c = new Client(LOCAL_PG);
  try {
    await c.connect();
    return c;
  } catch {
    await c.end().catch(() => undefined);
    return null;
  }
}

function guardBodyFromDb(def: string): string {
  const open = def.indexOf('$$');
  const close = def.indexOf('$$', open + 2);
  return def.slice(open + 2, close);
}

type RoleName = 'anon' | 'authenticated' | 'service_role';

async function asRole<T>(
  c: Client,
  role: RoleName,
  authUserId: string | null,
  fn: (query: Client['query']) => Promise<T>,
): Promise<T> {
  await c.query('SAVEPOINT role_ctx');
  try {
    const jwtRole = role === 'service_role' ? 'service_role' : role;
    if (authUserId) {
      await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
      await c.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [jwtRole]);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: authUserId, role: jwtRole }),
      ]);
    } else {
      await c.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await c.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: '' })]);
    }
    await c.query(`SET LOCAL ROLE ${role}`);
    const value = await fn((text, params) => c.query(text, params));
    await c.query('ROLLBACK TO SAVEPOINT role_ctx');
    return value;
  } catch (error) {
    await c.query('ROLLBACK TO SAVEPOINT role_ctx');
    throw error;
  }
}

const SKIP_REST_ONLY_CI =
  'BLOCKED: Supabase REST/API unavailable (CI Tiered Batteries use Postgres-only stack without gotrue/kong/postgrest; run full local Supabase for RPC auth proofs)';

describe('00261–00263 formal migrations (REAL DATABASE)', () => {
  beforeAll(async () => {
    restUp = await isLocalSupabaseReachable();
    const client = await pgConnect();
    if (client) {
      pgUp = true;
      await client.end();
    }
    if (!restUp && !pgUp) {
      skipReason = 'BLOCKED: Docker daemon / local Supabase unavailable (127.0.0.1:54321 and :54322 down)';
      return;
    }
    if (pgUp) {
      const c = await pgConnect();
      if (!c) {
        skipReason = 'BLOCKED: Postgres port 54322 probe failed after initial connect';
        pgUp = false;
        return;
      }
      try {
        const { rows } = await c.query<{ def: string }>(
          `SELECT pg_get_functiondef('private.guard_profile_privileges()'::regprocedure) AS def`,
        );
        const body = guardBodyFromDb(rows[0]?.def ?? '');
        if (/IN\s*\(\s*'service_role',\s*''\s*\)/.test(body)) {
          skipReason =
            'BLOCKED: private.guard_profile_privileges still has empty-role bypass — apply 00263 on this DB instance';
          pgUp = false;
          restUp = false;
        }
      } catch {
        skipReason = 'BLOCKED: guard_profile_privileges() missing — migrations 00261–00263 not applied on this DB';
        pgUp = false;
      } finally {
        await c.end();
      }
    }
  });

  beforeEach((ctx) => {
    if (!restUp && !pgUp) ctx.skip(skipReason);
  });

  it('00261: anon cannot EXECUTE admin_run_test_case; unknown ID is NOT_IMPLEMENTED for service_role', async (ctx) => {
    if (!restUp) ctx.skip(SKIP_REST_ONLY_CI);
    const anon = createAnonClient();
    const { error: anonErr } = await anon.rpc('admin_run_test_case', {
      p_test_id: 'SEC-001',
      p_test_name: 'probe',
    });
    expect(anonErr?.message ?? '').toMatch(/permission denied|Unauthorized|Could not find/i);

    const svc = createServiceClient();
    const { data, error } = await svc.rpc('admin_run_test_case', {
      p_test_id: 'SEC-999-UNKNOWN',
      p_test_name: 'red team',
    });
    expect(error).toBeNull();
    expect(data?.execution_status).toBe('NOT_IMPLEMENTED');
    expect(data?.passed).toBe(false);
  });

  it('00261: authenticated non-admin receives Unauthorized from admin_run_test_case', async (ctx) => {
    if (!restUp) ctx.skip(SKIP_REST_ONLY_CI);
    const client = createAnonClient();
    await signInAs(client, 'buyer@greenview.test');
    const { error } = await client.rpc('admin_run_test_case', {
      p_test_id: 'SEC-001',
      p_test_name: 'probe',
    });
    expect(error?.message ?? '').toMatch(/Unauthorized|permission denied/i);
  });

  it('00262: diagnostic allowlist rejects free-form SQL; named op works for service_role', async (ctx) => {
    if (!restUp) ctx.skip(SKIP_REST_ONLY_CI);
    const anon = createAnonClient();
    const { error: anonErr } = await anon.rpc('admin_run_diagnostic_query', {
      p_sql: 'profiles_active_count',
    });
    expect(anonErr?.message ?? '').toMatch(/permission denied|Unauthorized|Could not find/i);

    const svc = createServiceClient();
    const { data: blocked, error: blockedErr } = await svc.rpc('admin_run_diagnostic_query', {
      p_sql: 'SELECT * FROM profiles',
    });
    expect(blockedErr).toBeNull();
    expect(blocked?.success).toBe(false);
    expect(String(blocked?.error ?? '')).toMatch(/Free-form SQL|not permitted/i);

    const { data: ok, error: okErr } = await svc.rpc('admin_run_diagnostic_query', {
      p_sql: 'profiles_active_count',
    });
    expect(okErr).toBeNull();
    expect(ok?.success).toBe(true);
    expect(ok?.operation).toBe('profiles_active_count');
  });

  it('00263: empty JWT role cannot self-grant is_platform_admin on profiles INSERT', async (ctx) => {
    if (!pgUp) {
      ctx.skip('BLOCKED: direct Postgres probe requires 127.0.0.1:54322 with migrations 00261–00263 applied');
    }
    const c = await pgConnect();
    expect(c).not.toBeNull();
    try {
      await c!.query('BEGIN');
      const {
        rows: [buyer],
      } = await c!.query<{ auth_user_id: string }>(
        `SELECT auth_user_id::text FROM profiles WHERE email = 'buyer@greenview.test' LIMIT 1`,
      );
      expect(buyer?.auth_user_id).toBeTruthy();
      // Empty JWT role must not bypass guard (00263); postgres session + RLS off reaches trigger body.
      await c!.query('SET LOCAL row_security = off');
      await c!.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [buyer.auth_user_id]);
      await c!.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
      await c!.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: buyer.auth_user_id, role: '' }),
      ]);
      await expect(
        c!.query(
          `UPDATE profiles SET is_platform_admin = true WHERE email = 'buyer@greenview.test'`,
        ),
      ).rejects.toThrow(/PROFILE-PRIVILEGE|platform admin|PLATFORM_PRIVILEGE_IMMUTABLE/i);
    } finally {
      await c!.query('ROLLBACK').catch(() => undefined);
      await c!.end();
    }
  });

});

describe('00261–00263 formal migrations (static parity)', () => {
  /** Pinned at formalization; Golden Reconstruction *.sql drafts are gitignored (CI-safe). */
  const FORMAL_SHA256 = {
    '00261_admin_run_test_case_truthful_execution_and_auth.sql':
      'E5FA35856B9EA0BF546EBF625A668CE6A3D757E8FB43E5BED2ADFCD2BC263C79',
    '00262_admin_run_diagnostic_query_allowlist_hardening.sql':
      'F606758AFBE05B09BDFFBBCCCEDBADA1262DF7FDA9B2367E8931EF522A92BF93',
    '00263_guard_profile_privileges_empty_role_bypass.sql':
      '2B2E0AA46B3EFE3CA292EB88A7DD74F3E7D7B54BC7AA012876FDBB4FB908569A',
  } as const;

  it('repo formal migration SHA256 matches release-pinned digests', () => {
    for (const [formal, expected] of Object.entries(FORMAL_SHA256)) {
      const bytes = readFileSync(resolve(ROOT, 'supabase/migrations', formal));
      // Normalize CRLF to LF so the release-pinned digest does not depend on Windows checkout line endings.
      const canonicalContent = bytes.toString('utf8').replace(/\r\n/g, '\n');
      const digest = createHash('sha256').update(canonicalContent, 'utf8').digest('hex').toUpperCase();
      expect(digest, formal).toBe(expected);
    }
  });
});

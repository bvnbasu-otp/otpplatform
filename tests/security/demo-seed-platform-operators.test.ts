/**
 * Demo seed must not grant platform claims itself.
 * Disposable databases on local supabase_db_otp-clean. Drops only databases
 * this file created. Restores datallowconn on the original postgres database.
 * Does not skip when PostgreSQL is unavailable.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SEED = readFileSync(resolve('supabase/seed_demo_environment.sql'), 'utf8');
const HOST = '127.0.0.1';
const PORT = 54322;
const STAMP = `${Date.now().toString(36)}${randomUUID().slice(0, 8).replace(/-/g, '')}`;
const BASE = `otp_seed_base_${STAMP}`;
const OPEN = `otp_seed_open_${STAMP}`;
const CLOSED = `otp_seed_closed_${STAMP}`;
const createdDatabases: string[] = [];

const FOUNDER_PROFILE = '0db00000-0000-4000-8000-0000000000f1';
const ADMIN_PROFILE = '0db00000-0000-4000-8000-000000000001';
const FOUNDER_AUTH = '0dc00000-0000-4000-8000-0000000000f1';
const ADMIN_AUTH = '0dc00000-0000-4000-8000-000000000001';
const SECRETARY_AUTH = '0dc00000-0000-4000-8000-000000000011';
const DEMO_REASON =
  'Local demo seed provisions the dedicated founder and the second platform operator so walkthrough login matches audited platform claims.';

const adminConfig = {
  host: HOST,
  port: PORT,
  database: 'template1',
  user: 'supabase_admin',
  password: 'postgres',
};

function dbConfig(database: string) {
  return {
    host: HOST,
    port: PORT,
    database,
    user: 'postgres',
    password: 'postgres',
  };
}

type Claim = {
  id: string;
  email: string;
  is_founder: boolean;
  is_platform_admin: boolean;
  status: string;
};

let admin: Client;
let adminConnected = false;
let originalAllowConn: boolean | undefined;
let allowConnAltered = false;
let openDb: Client;
let closedDb: Client;

async function restoreAllowConn(): Promise<void> {
  if (!allowConnAltered || originalAllowConn === undefined || !adminConnected) return;
  const allow = originalAllowConn;
  await admin.query(
    `ALTER DATABASE postgres WITH ALLOW_CONNECTIONS ${allow ? 'true' : 'false'}`,
  );
  const restored = await admin.query(
    `SELECT datallowconn FROM pg_database WHERE datname = 'postgres'`,
  );
  if (restored.rows[0]?.datallowconn !== allow) {
    throw new Error('failed to restore datallowconn on the original postgres database');
  }
  allowConnAltered = false;
}

async function createTrackedDatabase(name: string, statement: string): Promise<void> {
  await admin.query(statement);
  createdDatabases.push(name);
}

async function applyFile(client: Client, fileName: string): Promise<void> {
  const sql = readFileSync(resolve('supabase/migrations', fileName), 'utf8');
  try {
    await client.query(sql);
  } catch (error) {
    throw new Error(`applying ${fileName} failed: ${(error as Error).message}`, { cause: error });
  }
}

async function applySeed(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(SEED);
}

async function clearStagedRfqs(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query('TRUNCATE public.rfqs CASCADE');
}

async function detachOperators(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(
    `DELETE FROM public.organization_members
     WHERE profile_id IN (
       SELECT id FROM public.profiles
       WHERE email IN ('founder@otp.test', 'admin@otp.test') OR id IN ($1, $2)
     )`,
    [FOUNDER_PROFILE, ADMIN_PROFILE],
  );
  await client.query(
    `DELETE FROM public.supplier_users
     WHERE profile_id IN (
       SELECT id FROM public.profiles
       WHERE email IN ('founder@otp.test', 'admin@otp.test') OR id IN ($1, $2)
     )`,
    [FOUNDER_PROFILE, ADMIN_PROFILE],
  );
}

async function claimsOf(client: Client): Promise<Claim[]> {
  const result = await client.query<Claim>(
    `SELECT id::text, email, is_founder, is_platform_admin, COALESCE(status, 'ACTIVE') AS status
     FROM public.profiles
     WHERE COALESCE(is_founder, false) OR COALESCE(is_platform_admin, false)
     ORDER BY email, id`,
  );
  return result.rows;
}

async function pgNow(client: Client): Promise<Date> {
  const result = await client.query<{ t: Date }>(`SELECT clock_timestamp() AS t`);
  return result.rows[0].t;
}

async function bootstrapAuditsSince(client: Client, since: Date): Promise<number> {
  const result = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM public.audit_events
     WHERE event_type = 'platform.bootstrap_operators'
       AND occurred_at >= $1`,
    [since],
  );
  return result.rows[0].n;
}

async function clearOperators(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM public.profiles
     WHERE COALESCE(is_platform_admin, false) OR COALESCE(is_founder, false)`,
  );
  for (const row of existing.rows) {
    await client.query(
      `SELECT public.break_glass_platform_account($1, false, false, 'ACTIVE', 'isolate disposable demo seed from existing recovery claims')`,
      [row.id],
    );
  }
}

async function insertPlainProfile(client: Client, label: string): Promise<string> {
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
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_founder, is_demo)
     VALUES ($1, $1, $2, $3, false, false, false)`,
    [id, email, label],
  );
  return id;
}

async function rejection(
  client: Client,
  sql: string,
  params: unknown[] = [],
  setup?: { sql: string; params?: unknown[] },
): Promise<string> {
  await client.query('BEGIN');
  try {
    await client.query('RESET ROLE');
    if (setup) await client.query(setup.sql, setup.params);
    await client.query(sql, params);
    throw new Error(`expected rejection for ${sql}`);
  } catch (error) {
    const message = (error as Error).message;
    await client.query('ROLLBACK');
    if (message.startsWith('expected rejection')) throw error;
    return message;
  }
}

async function roleContext(
  client: Client,
  authUserId: string,
): Promise<{ isFounder: boolean; isPlatformAdmin: boolean }> {
  await client.query('BEGIN');
  try {
    await client.query('RESET ROLE');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: authUserId, role: 'authenticated', email: 'forged-admin@otp.test' }),
    ]);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await client.query<{ ctx: { isFounder: boolean; isPlatformAdmin: boolean } }>(
      `SELECT public.my_role_context() AS ctx`,
    );
    return result.rows[0].ctx;
  } finally {
    await client.query('ROLLBACK');
  }
}

describe('demo seed platform operators (static)', () => {
  it('does not write platform claims and bootstraps two dedicated operators', () => {
    expect(SEED).not.toMatch(/is_platform_admin\s*=/);
    expect(SEED).not.toMatch(/is_founder\s*=/);
    expect(SEED).not.toMatch(/otp\.platform_privilege_write/);
    expect(SEED).not.toMatch(/otp\.platform_bootstrap/);
    expect(SEED).not.toMatch(/DISABLE TRIGGER/i);
    expect(SEED).not.toMatch(/\bis_admin\b/);
    expect(SEED).toContain('public.bootstrap_platform_operators');
    expect(SEED).toContain('PLATFORM_BOOTSTRAP_CLOSED');
    expect(SEED).toContain(DEMO_REASON);
    expect(SEED).toContain("'founder@otp.test'");
    expect(SEED).toContain("'admin@otp.test'");
    expect(FOUNDER_PROFILE).not.toBe(ADMIN_PROFILE);

    const membersStart = SEED.indexOf('INSERT INTO organization_members');
    const membersEnd = SEED.indexOf('ON CONFLICT (organization_id, profile_id)');
    const members = SEED.slice(membersStart, membersEnd);
    expect(members).not.toContain(FOUNDER_PROFILE);
    expect(members).not.toContain(ADMIN_PROFILE);
  });
});

describe('demo seed platform operators (disposable databases)', () => {
  beforeAll(async () => {
    admin = new Client(adminConfig);
    try {
      await admin.connect();
      adminConnected = true;
    } catch (error) {
      throw new Error(
        `local PostgreSQL at ${HOST}:${PORT} as supabase_admin is required; this test does not skip. ${(error as Error).message}`,
        { cause: error },
      );
    }

    const original = await admin.query(
      `SELECT datallowconn FROM pg_database WHERE datname = 'postgres'`,
    );
    const originalAllow = original.rows[0]?.datallowconn;
    if (typeof originalAllow !== 'boolean') {
      throw new Error('could not read datallowconn on the original postgres database');
    }
    originalAllowConn = originalAllow;

    let cloneError: unknown;
    try {
      allowConnAltered = true;
      await admin.query('ALTER DATABASE postgres WITH ALLOW_CONNECTIONS false');
      await admin.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = 'postgres' AND pid <> pg_backend_pid()`,
      );
      await createTrackedDatabase(BASE, `CREATE DATABASE ${BASE} TEMPLATE postgres OWNER postgres`);
    } catch (error) {
      cloneError = error;
    } finally {
      try {
        await restoreAllowConn();
      } catch (restoreError) {
        if (cloneError === undefined) cloneError = restoreError;
      }
    }
    if (cloneError !== undefined) throw cloneError;

    const base = new Client({ ...adminConfig, database: BASE });
    await base.connect();
    try {
      const has294 = (await base.query(
        `SELECT to_regprocedure('public.bootstrap_platform_operators(uuid,uuid,text)') AS fn`,
      )).rows[0]?.fn != null;
      if (!has294) {
        const migrationsDir = resolve('supabase/migrations');
        const files = readdirSync(migrationsDir).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
        const startIdx = files.findIndex((f) => f.startsWith('00267_'));
        const endIdx = files.findIndex((f) => f.startsWith('00297_'));
        for (const file of files.slice(startIdx, endIdx + 1)) {
          await applyFile(base, file);
        }
      }
      const enforcement = await base.query<{ enforcement_enabled: boolean }>(
        `SELECT enforcement_enabled FROM public.legal_enforcement_config`,
      );
      if (enforcement.rows.some((row) => row.enforcement_enabled)) {
        throw new Error('legal enforcement is enabled on the disposable database');
      }
    } finally {
      await base.end();
    }

    await createTrackedDatabase(OPEN, `CREATE DATABASE ${OPEN} TEMPLATE ${BASE} OWNER postgres`);
    await createTrackedDatabase(CLOSED, `CREATE DATABASE ${CLOSED} TEMPLATE ${BASE} OWNER postgres`);

    openDb = new Client(dbConfig(OPEN));
    closedDb = new Client(dbConfig(CLOSED));
    await openDb.connect();
    await closedDb.connect();
    openDb.on('notice', () => undefined);
    closedDb.on('notice', () => undefined);

    const installed = await openDb.query(
      `SELECT to_regprocedure('public.bootstrap_platform_operators(uuid,uuid,text)') AS fn,
              session_user AS session_user`,
    );
    if (!installed.rows[0].fn) {
      throw new Error(
        `public.bootstrap_platform_operators is not installed on the cloned database. The seed cannot provision operators without that audited function.`,
      );
    }
    process.stderr.write(`disposable databases on supabase_db_otp-clean: ${OPEN}, ${CLOSED}\n`);
    if (installed.rows[0].session_user !== 'postgres') {
      throw new Error(
        `seed connection session_user is ${installed.rows[0].session_user}; bootstrap_platform_operators accepts only the database operator session`,
      );
    }
    const privilege = await openDb.query<{ ok: boolean }>(
      `SELECT has_function_privilege(current_user, 'public.bootstrap_platform_operators(uuid,uuid,text)', 'EXECUTE') AS ok`,
    );
    if (!privilege.rows[0].ok) {
      throw new Error(
        'postgres cannot execute public.bootstrap_platform_operators. The seed must not grant that privilege or set a bypass flag.',
      );
    }
  }, 180_000);

  afterAll(async () => {
    const errors: string[] = [];
    for (const client of [openDb, closedDb]) {
      if (!client) continue;
      try {
        await client.end();
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    if (adminConnected) {
      for (const name of [...createdDatabases].reverse()) {
        try {
          await admin.query(
            `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
             WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [name],
          );
          await admin.query(`DROP DATABASE IF EXISTS ${name}`);
        } catch (error) {
          errors.push(`${name}: ${(error as Error).message}`);
        }
      }
      try {
        await restoreAllowConn();
      } catch (error) {
        errors.push((error as Error).message);
      }
      if (originalAllowConn !== undefined) {
        const check = await admin.query(
          `SELECT datallowconn FROM pg_database WHERE datname = 'postgres'`,
        );
        if (check.rows[0]?.datallowconn !== originalAllowConn) {
          errors.push('datallowconn on postgres was not restored');
        }
      }
      try {
        await admin.end();
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  }, 180_000);

  it('bootstraps the dedicated operators, reruns without resetting claims, and still rejects direct writes', async () => {
    await clearOperators(openDb);
    await detachOperators(openDb);
    await clearStagedRfqs(openDb);
    const before = await pgNow(openDb);
    await applySeed(openDb);
    await openDb.query('RESET ROLE');

    const founder = await openDb.query<{ is_founder: boolean; is_platform_admin: boolean; status: string }>(
      `SELECT is_founder, is_platform_admin, status FROM public.profiles WHERE id = $1`,
      [FOUNDER_PROFILE],
    );
    const adminProfile = await openDb.query<{ is_founder: boolean; is_platform_admin: boolean; status: string }>(
      `SELECT is_founder, is_platform_admin, status FROM public.profiles WHERE id = $1`,
      [ADMIN_PROFILE],
    );
    expect(founder.rows[0]).toEqual({ is_founder: true, is_platform_admin: true, status: 'ACTIVE' });
    expect(adminProfile.rows[0]).toEqual({ is_founder: false, is_platform_admin: true, status: 'ACTIVE' });

    const ordinary = await openDb.query<{ email: string; is_founder: boolean; is_platform_admin: boolean }>(
      `SELECT email, is_founder, is_platform_admin
       FROM public.profiles
       WHERE email IN ('secretary@sunrise.test', 'supplier01@otpdemo.test', 'bharathi@agrotrade.test')
       ORDER BY email`,
    );
    expect(ordinary.rows).toEqual([
      { email: 'bharathi@agrotrade.test', is_founder: false, is_platform_admin: false },
      { email: 'secretary@sunrise.test', is_founder: false, is_platform_admin: false },
      { email: 'supplier01@otpdemo.test', is_founder: false, is_platform_admin: false },
    ]);

    const links = await openDb.query<{ orgs: number; suppliers: number }>(
      `SELECT
         (SELECT count(*)::int FROM public.organization_members om
           WHERE om.profile_id IN ($1, $2)) AS orgs,
         (SELECT count(*)::int FROM public.supplier_users su
           WHERE su.profile_id IN ($1, $2)) AS suppliers`,
      [FOUNDER_PROFILE, ADMIN_PROFILE],
    );
    expect(links.rows[0]).toEqual({ orgs: 0, suppliers: 0 });

    const logins = await openDb.query<{ email: string; persona: string; is_active: boolean; label: string }>(
      `SELECT email, persona, is_active, label
       FROM public.demo_accounts
       WHERE email IN ('founder@otp.test', 'admin@otp.test')
       ORDER BY email`,
    );
    expect(logins.rows).toEqual([
      { email: 'admin@otp.test', persona: 'ADMIN', is_active: true, label: 'Platform admin' },
      { email: 'founder@otp.test', persona: 'ADMIN', is_active: true, label: 'Platform founder' },
    ]);

    expect(await roleContext(openDb, FOUNDER_AUTH)).toMatchObject({ isFounder: true, isPlatformAdmin: true });
    expect(await roleContext(openDb, ADMIN_AUTH)).toMatchObject({ isFounder: false, isPlatformAdmin: true });
    expect(await roleContext(openDb, SECRETARY_AUTH)).toMatchObject({ isFounder: false, isPlatformAdmin: false });

    const audit = await openDb.query<{ payload: { second_admin: string; reason: string } }>(
      `SELECT payload
       FROM public.audit_events
       WHERE event_type = 'platform.bootstrap_operators'
         AND occurred_at >= $1
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [before],
    );
    expect(audit.rows[0].payload.reason).toBe(DEMO_REASON);
    expect(audit.rows[0].payload.second_admin).toBe(ADMIN_PROFILE);
    expect(await bootstrapAuditsSince(openDb, before)).toBe(1);

    const granted = await claimsOf(openDb);
    await applySeed(openDb);
    await openDb.query('RESET ROLE');
    expect(await claimsOf(openDb)).toEqual(granted);
    expect(await bootstrapAuditsSince(openDb, before)).toBe(1);

    const probe = randomUUID();
    const probeEmail = `${probe}@example.test`;
    expect(await rejection(
      openDb,
      `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_founder)
       VALUES ($1, $1, $2, 'direct grant', true, false)`,
      [probe, probeEmail],
      {
        sql: `INSERT INTO auth.users (
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
        params: [probe, probeEmail],
      },
    )).toMatch(/PLATFORM_PRIVILEGE_IMMUTABLE/);
    expect(await rejection(
      openDb,
      `UPDATE public.profiles SET is_founder = true WHERE id = $1`,
      [ADMIN_PROFILE],
    )).toMatch(/PLATFORM_PRIVILEGE_IMMUTABLE/);
    expect(await rejection(
      openDb,
      `UPDATE public.profiles SET is_platform_admin = true WHERE email = 'secretary@sunrise.test'`,
    )).toMatch(/PLATFORM_PRIVILEGE_IMMUTABLE/);
  }, 300_000);

  it('leaves an already completed bootstrap unchanged and does not advertise ordinary operators', async () => {
    await clearOperators(closedDb);
    const founder = await insertPlainProfile(closedDb, 'existing-founder');
    const second = await insertPlainProfile(closedDb, 'existing-operator');
    await closedDb.query(
      `SELECT public.bootstrap_platform_operators($1, $2, 'pre-existing recovery pair on the disposable database')`,
      [founder, second],
    );
    await detachOperators(closedDb);
    const beforeClaims = await claimsOf(closedDb);
    await clearStagedRfqs(closedDb);
    const mark = await pgNow(closedDb);
    await applySeed(closedDb);
    await closedDb.query('RESET ROLE');

    expect(await claimsOf(closedDb)).toEqual(beforeClaims);
    expect(await bootstrapAuditsSince(closedDb, mark)).toBe(0);

    const demo = await closedDb.query<{ email: string; is_founder: boolean; is_platform_admin: boolean }>(
      `SELECT email, is_founder, is_platform_admin
       FROM public.profiles
       WHERE email IN ('founder@otp.test', 'admin@otp.test')
       ORDER BY email`,
    );
    expect(demo.rows).toEqual([
      { email: 'admin@otp.test', is_founder: false, is_platform_admin: false },
      { email: 'founder@otp.test', is_founder: false, is_platform_admin: false },
    ]);

    const advertised = await closedDb.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM public.demo_accounts
       WHERE email IN ('founder@otp.test', 'admin@otp.test')
         AND is_active
         AND persona = 'ADMIN'`,
    );
    expect(advertised.rows[0].n).toBe(0);
    const closedLinks = await closedDb.query<{ orgs: number; suppliers: number }>(
      `SELECT
         (SELECT count(*)::int FROM public.organization_members om
           WHERE om.profile_id IN ($1, $2)) AS orgs,
         (SELECT count(*)::int FROM public.supplier_users su
           WHERE su.profile_id IN ($1, $2)) AS suppliers`,
      [FOUNDER_PROFILE, ADMIN_PROFILE],
    );
    expect(closedLinks.rows[0]).toEqual({ orgs: 0, suppliers: 0 });
    expect(await roleContext(closedDb, ADMIN_AUTH)).toMatchObject({ isFounder: false, isPlatformAdmin: false });
    expect(await roleContext(closedDb, FOUNDER_AUTH)).toMatchObject({ isFounder: false, isPlatformAdmin: false });
  }, 300_000);
});

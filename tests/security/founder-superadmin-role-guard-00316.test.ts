/**
 * Founder SUPER_ADMIN role guard (review file, not a migration).
 * Static checks always run. The database case connects only to local
 * Postgres at 127.0.0.1 (port 54322 or LOCAL_PG_PORT), installs the review SQL inside a transaction,
 * and rolls that transaction back. It does not insert schema_migrations,
 * does not set otp.allow_audit_purge, does not change legal enforcement,
 * and does not contact a hosted database.
 *
 * A prohibited statement is a failure when it succeeds. Savepoints capture
 * SQLSTATE 42501 without aborting the proof transaction. Rolling a savepoint
 * back is cleanup, not evidence that a write was rejected.
 */
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
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const PROPOSAL = resolve(ROOT, 'supabase/00316_founder_superadmin_role_guard.UNAPPLIED.sql');
const AUDIT_MIGRATION = resolve(ROOT, 'supabase/00315_audit_actor_identity_registry.UNAPPLIED.sql');
// Deterministic local founder created by migration 00113. The proposal itself
// resolves the founder by authoritative claim + reserved founder email so it
// also protects the hosted profile whose UUID differs.
const FOUNDER_ID = 'dd2dedee-0c2a-4254-b2af-342b41d56385';
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: LOCAL_POSTGRES_PORT,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

const NEW_TRIGGERS = [
  'aa_guard_founder_active_role',
  'aa_guard_founder_profile_delete',
  'aa_guard_founder_profile_id',
  'aa_guard_founder_profile_role',
  'aa_guard_founder_profile_role_truncate',
  'aa_guard_founder_internal_assignment',
  'aa_guard_founder_internal_assignment_truncate',
  'aa_guard_founder_internal_role',
  'aa_guard_founder_internal_role_truncate',
  'aa_guard_founder_user_role',
  'aa_guard_founder_user_role_truncate',
];

const GUARD_FUNCTIONS = [
  'private_security.guard_founder_superadmin_active_role()',
  'private_security.guard_founder_superadmin_profile_role()',
  'private_security.guard_founder_superadmin_internal_assignment()',
  'private_security.guard_founder_superadmin_internal_role()',
  'private_security.guard_founder_superadmin_user_role()',
];

type FounderIdentity = {
  id: string;
  auth_user_id: string;
  email: string;
  is_founder: boolean;
  is_platform_admin: boolean;
  active_role_code: string | null;
  auth_email: string | null;
};

type Holdings = {
  profile_role_ids: string[];
  assignment_ids: string[];
  assignment_role_id: string | null;
  internal_role_id: string | null;
  internal_name: string | null;
  user_label: string | null;
  user_active: boolean | null;
};

type AuditTrigger = { tgname: string; tgenabled: string; def: string };
type LegalConfig = { enforcement_enabled: boolean; rollout_at: string | null };
type Probe = { allowed: boolean; rowCount: number; sqlstate: string | null; message: string };

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function isLocalServerAddr(raw: string | null): boolean {
  if (!raw) return false;
  const host = raw.split('/')[0].replace(/%.*$/, '');
  if (host === '::1' || host.startsWith('127.')) return true;
  const parts = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!parts) return false;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}

function unavailable(reason: string): null {
  if (requireLocalPostgresSqlParity()) {
    expect(false, reason).toBe(true);
  } else {
    console.warn(`[SKIP REASON] ${reason}`);
  }
  return null;
}

async function openLocal(): Promise<Client | null> {
  if (LOCAL_PG.host !== '127.0.0.1' || LOCAL_PG.port !== LOCAL_POSTGRES_PORT || LOCAL_PG.database !== 'postgres') {
    throw new Error('refusing non-local postgres config');
  }
  const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
  } catch (error) {
    return unavailable(`local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`);
  }
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = addr.rows[0]?.addr ?? null;
  if (!isLocalServerAddr(host)) {
    await client.end();
    throw new Error(`refusing non-local postgres at ${host ?? 'unknown'}`);
  }
  const ready = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.profiles') IS NOT NULL
        AND to_regclass('public.profile_roles') IS NOT NULL
        AND to_regclass('public.internal_user_assignments') IS NOT NULL
        AND to_regclass('public.internal_roles') IS NOT NULL
        AND to_regclass('public.user_roles') IS NOT NULL
        AND to_regclass('public.legal_enforcement_config') IS NOT NULL
        AND to_regprocedure('private.prevent_audit_mutation()') IS NOT NULL
        AND to_regprocedure('private.guard_profile_privileges()') IS NOT NULL
        AND to_regprocedure('private_security.enforce_superadmin_immutability()') IS NOT NULL
        AND to_regprocedure('private.assert_active_role_held()') IS NOT NULL
        AND to_regprocedure('public.switch_active_role(text)') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
        AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
        AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS ok`,
  );
  if (!ready.rows[0]?.ok) {
    await client.end();
    return unavailable('local database does not have the founder role, audit, and legal schema');
  }
  return client;
}

async function functionDef(client: Client, schema: string, name: string): Promise<string> {
  const result = await client.query<{ def: string }>(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.proname = $2
     ORDER BY p.oid`,
    [schema, name],
  );
  expect(result.rows, `${schema}.${name}`).toHaveLength(1);
  return result.rows[0].def;
}

async function founderIdentity(client: Client): Promise<FounderIdentity | null> {
  const result = await client.query<FounderIdentity>(
    `SELECT p.id::text AS id,
            p.auth_user_id::text AS auth_user_id,
            p.email,
            p.is_founder,
            p.is_platform_admin,
            p.active_role_code,
            u.email AS auth_email
     FROM public.profiles p
     LEFT JOIN auth.users u ON u.id = p.auth_user_id
     WHERE p.id = $1::uuid`,
    [FOUNDER_ID],
  );
  return result.rows[0] ?? null;
}

async function holdings(client: Client): Promise<Holdings> {
  const roles = await client.query<{ id: string }>(
    `SELECT pr.id::text AS id
     FROM public.profile_roles pr
     WHERE pr.profile_id = $1::uuid AND pr.role_code = 'SUPER_ADMIN'
     ORDER BY pr.id`,
    [FOUNDER_ID],
  );
  const assignments = await client.query<{ id: string; role_id: string }>(
    `SELECT ua.id::text AS id, ua.role_id::text AS role_id
     FROM public.internal_user_assignments ua
     JOIN public.internal_roles r ON r.id = ua.role_id
     WHERE ua.profile_id = $1::uuid AND r.code = 'SUPER_ADMIN'
     ORDER BY ua.id`,
    [FOUNDER_ID],
  );
  const internalRole = await client.query<{ id: string; name: string }>(
    `SELECT id::text AS id, name FROM public.internal_roles WHERE code = 'SUPER_ADMIN'`,
  );
  const userRole = await client.query<{ label: string; is_active: boolean }>(
    `SELECT label, is_active FROM public.user_roles WHERE code = 'SUPER_ADMIN'`,
  );
  return {
    profile_role_ids: roles.rows.map((row) => row.id),
    assignment_ids: assignments.rows.map((row) => row.id),
    assignment_role_id: assignments.rows[0]?.role_id ?? null,
    internal_role_id: internalRole.rows[0]?.id ?? null,
    internal_name: internalRole.rows[0]?.name ?? null,
    user_label: userRole.rows[0]?.label ?? null,
    user_active: userRole.rows[0]?.is_active ?? null,
  };
}

async function legalConfig(client: Client): Promise<LegalConfig> {
  const result = await client.query<{ enforcement_enabled: boolean; rollout_at: string | null }>(
    `SELECT enforcement_enabled, rollout_at::text AS rollout_at
     FROM public.legal_enforcement_config
     WHERE singleton IS TRUE`,
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

async function migrationVersions(client: Client): Promise<string[]> {
  const versions = await client.query<{ version: string }>(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  );
  return versions.rows.map((row) => row.version);
}

async function auditTriggers(client: Client): Promise<AuditTrigger[]> {
  const result = await client.query<AuditTrigger>(
    `SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND n.nspname = 'public'
       AND c.relname = 'audit_events'
       AND t.tgname IN ('audit_events_no_update', 'audit_events_no_delete')
     ORDER BY t.tgname`,
  );
  return result.rows;
}

/**
 * Runs one statement in a savepoint. allowed: true means the statement
 * succeeded. The following rollback does not change that result and must
 * not be read as a denial.
 */
async function captureStatement(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  await client.query('SAVEPOINT founder_role_probe');
  try {
    const result = await client.query(sql, params);
    return { allowed: true, rowCount: result.rowCount ?? 0, sqlstate: null, message: '' };
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    return { allowed: false, rowCount: 0, sqlstate: pgError.code ?? null, message: pgError.message ?? '' };
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT founder_role_probe');
    await client.query('RELEASE SAVEPOINT founder_role_probe');
  }
}

function expectRejected(result: Probe, label: string): void {
  expect(result.allowed, `${label} succeeded; sqlstate=${result.sqlstate ?? 'none'} ${result.message}`).toBe(false);
  expect(result.sqlstate, label).toBe('42501');
  expect(result.message, label).toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
}

async function insertDisposableProfile(client: Client): Promise<string> {
  const id = randomUUID();
  const email = `founder-role-guard-${id}@example.test`;
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
     VALUES ($1, $1, $2, 'Role Guard Disposable', false, false, false)`,
    [id, email],
  );
  return id;
}

describe('00316 founder SUPER_ADMIN role guard proposal', () => {
  it('keeps the proposal out of the migration runner and out of 00315', () => {
    const proposal = readFileSync(PROPOSAL, 'utf8');
    const executable = stripComments(proposal);
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(proposal.startsWith('-- STATUS: UNAPPLIED')).toBe(true);
    expect(PROPOSAL.replace(/\\/g, '/')).not.toContain('/migrations/');
    expect(migrations.some((file) => file.startsWith('00316'))).toBe(false);
    expect(proposal).toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
    expect(proposal).toContain('bvnbasu@gmail.com');
    expect(proposal).toContain('admin@otp.test');
    expect(proposal).toContain('ops@otp.test');
    expect(executable).toContain("lower(p.email) = 'bvnbasu@gmail.com'");
    expect(executable).toContain('internal_user_assignments');
    expect(executable).toContain('internal_roles');
    expect(executable).toContain('user_roles');
    expect(executable).toContain('profile_roles');
    expect(executable).toContain('active_role_code');
    expect(executable).toContain('BEFORE TRUNCATE');
    expect(executable).toContain('BEFORE UPDATE OF email, is_founder ON public.profiles');
    expect(executable).toContain('SECURITY DEFINER');
    expect(executable).toContain('SET search_path = pg_catalog, public');
    expect(executable).toContain('OWNER TO postgres');
    expect(executable).toContain('service_role');
    expect(executable).toContain('FOUNDER_SUPERADMIN_PRECONDITION_FAILED');
    expect(executable).toContain('JOIN auth.users au ON au.id = p.auth_user_id');
    expect(executable).toContain("NULLIF(btrim(p.active_role_code), '') IS NOT NULL");
    expect(executable).not.toMatch(/INSERT\s+INTO\s+public\.(?:user_roles|internal_roles|profile_roles|internal_user_assignments)/i);
    expect(executable).not.toMatch(/ON\s+CONFLICT\s+DO\s+NOTHING/i);
    expect(executable).not.toMatch(/\bGRANT\b/i);
    expect(executable).not.toMatch(/\bDROP\s+(?:TRIGGER|FUNCTION)\b/i);
    expect(executable).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:private\.guard_profile_privileges|private\.assert_active_role_held)/i);
    expect(executable).not.toMatch(/DO UPDATE/i);
    expect(executable).not.toMatch(/DROP\s+TABLE/i);
    expect(executable).not.toMatch(/UPDATE\s+public\.profiles/i);
    expect(executable).not.toMatch(/DELETE\s+FROM\s+public\.profiles/i);
    expect(executable).toContain('bvnbasu@gmail.com');
    expect(executable).not.toContain('admin@otp.test');
    expect(executable).not.toContain('ops@otp.test');
    expect(executable).not.toContain('founder@otp.test');
    expect(executable).toContain('p.is_founder IS TRUE');
    expect(executable).toContain('p.is_platform_admin IS TRUE');
    expect(executable).not.toContain('3c993f64-1ecb-42b0-bb7c-7b3283e7e902');
    expect(executable).not.toContain('current_setting');
    expect(executable).not.toContain('set_config');
    expect(executable).not.toContain('auth.uid');
    expect(executable).not.toContain('allow_audit_purge');
    expect(executable).not.toContain('guard_profile_privileges');
    expect(executable).not.toContain('enforce_superadmin_immutability');
    expect(executable).not.toContain('prevent_audit_mutation');
    expect(executable).not.toContain('legal_enforcement');
    expect(executable).not.toContain('schema_migrations');
    expect(LOCAL_PG.host).toBe('127.0.0.1');
    expect(LOCAL_PG.port).toBe(LOCAL_POSTGRES_PORT);
    expect(readFileSync(AUDIT_MIGRATION, 'utf8')).not.toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
  });

  it('rejects founder role removal inside a rolled-back local transaction', async (ctx) => {
    const client = await openLocal();
    if (!client) {
      ctx.skip();
      return;
    }

    const beforeFounder = await founderIdentity(client);
    const beforeHoldings = await holdings(client);
    const beforeLegal = await legalConfig(client);
    const beforeVersions = await migrationVersions(client);
    const beforeAudit = await auditTriggers(client);
    const beforePrevention = await functionDef(client, 'private', 'prevent_audit_mutation');
    const beforePrivileges = await functionDef(client, 'private', 'guard_profile_privileges');
    const beforeImmutability = await functionDef(client, 'private_security', 'enforce_superadmin_immutability');
    const beforeHeld = await functionDef(client, 'private', 'assert_active_role_held');
    const beforeSwitch = await functionDef(client, 'public', 'switch_active_role');
    expect(beforeLegal.enforcement_enabled).toBe(false);
    expect(beforeLegal.rollout_at).toBeNull();
    expect(beforeAudit.map((row) => row.tgname)).toEqual(['audit_events_no_delete', 'audit_events_no_update']);
    expect(beforeAudit.every((row) => row.tgenabled === 'O')).toBe(true);
    expect(beforePrevention).toContain('INV-071');
    expect(beforePrevention).toContain('INV-072');

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '60s'`);
      const guardedAddr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
      if (!isLocalServerAddr(guardedAddr.rows[0]?.addr ?? null)) {
        throw new Error(`refusing non-local postgres at ${guardedAddr.rows[0]?.addr ?? 'unknown'}`);
      }
      if (
        !beforeFounder
        || !beforeFounder.active_role_code?.trim()
        || beforeHoldings.profile_role_ids.length !== 1
        || beforeHoldings.assignment_ids.length !== 1
        || beforeHoldings.user_active !== true
      ) {
        await client.query('ROLLBACK');
        await client.end();
        if (requireLocalPostgresSqlParity()) {
          throw new Error('local database does not already contain the canonical founder SUPER_ADMIN identity and holdings');
        }
        console.warn('[SKIP REASON] local database does not already contain the canonical founder SUPER_ADMIN identity and holdings');
        ctx.skip();
        return;
      }
      const seededFounder = await founderIdentity(client);
      if (!seededFounder) throw new Error('canonical founder profile missing');

      await client.query('SAVEPOINT missing_holding_precondition');
      const removedHolding = await client.query(
        `DELETE FROM public.profile_roles
          WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'`,
        [FOUNDER_ID],
      );
      expect(removedHolding.rowCount).toBe(1);
      let preconditionError: { message?: string } | null = null;
      try {
        await client.query(readFileSync(PROPOSAL, 'utf8'));
      } catch (error) {
        preconditionError = error as { message?: string };
      }
      expect(preconditionError?.message).toContain('FOUNDER_SUPERADMIN_PRECONDITION_FAILED');
      await client.query('ROLLBACK TO SAVEPOINT missing_holding_precondition');
      await client.query('RELEASE SAVEPOINT missing_holding_precondition');

      await client.query(readFileSync(PROPOSAL, 'utf8'));

      const replication = await client.query<{ role: string }>(
        `SELECT current_setting('session_replication_role') AS role`,
      );
      expect(replication.rows[0].role).toBe('origin');
      const purge = await client.query<{ v: string | null }>(
        `SELECT current_setting('otp.allow_audit_purge', true) AS v`,
      );
      expect(purge.rows[0].v === 'on').toBe(false);

      const installedFounder = await founderIdentity(client);
      const installedHoldings = await holdings(client);
      expect(installedFounder).toEqual(seededFounder);
      expect(installedHoldings.profile_role_ids).toEqual(beforeHoldings.profile_role_ids);
      expect(installedHoldings.assignment_ids).toEqual(beforeHoldings.assignment_ids);
      expect(installedHoldings.assignment_role_id).toBe(beforeHoldings.assignment_role_id);
      if (beforeHoldings.internal_role_id) {
        expect(installedHoldings.internal_role_id).toBe(beforeHoldings.internal_role_id);
        expect(installedHoldings.internal_name).toBe(beforeHoldings.internal_name);
      }
      if (beforeHoldings.user_label !== null) {
        expect(installedHoldings.user_label).toBe(beforeHoldings.user_label);
        expect(installedHoldings.user_active).toBe(beforeHoldings.user_active);
      }
      expect(installedHoldings.profile_role_ids.length).toBeGreaterThan(0);
      expect(installedHoldings.assignment_ids.length).toBeGreaterThan(0);
      expect(installedHoldings.user_active).toBe(true);

      expect(await functionDef(client, 'private', 'prevent_audit_mutation')).toBe(beforePrevention);
      expect(await functionDef(client, 'private', 'guard_profile_privileges')).toBe(beforePrivileges);
      expect(await functionDef(client, 'private_security', 'enforce_superadmin_immutability')).toBe(beforeImmutability);
      expect(await functionDef(client, 'private', 'assert_active_role_held')).toBe(beforeHeld);
      expect(await functionDef(client, 'public', 'switch_active_role')).toBe(beforeSwitch);
      expect(await legalConfig(client)).toEqual(beforeLegal);
      expect(await migrationVersions(client)).toEqual(beforeVersions);
      expect(await auditTriggers(client)).toEqual(beforeAudit);

      for (const fn of [...GUARD_FUNCTIONS, 'private_security.founder_profile_protected(uuid)']) {
        const name = fn.slice(fn.indexOf('.') + 1, fn.indexOf('('));
        const args = fn.endsWith('(uuid)') ? '%uuid%' : '';
        const meta = await client.query<{ prosecdef: boolean; owner: string; proconfig: string[] | null }>(
          `SELECT p.prosecdef, r.rolname AS owner, p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_roles r ON r.oid = p.proowner
           WHERE n.nspname = 'private_security'
             AND p.proname = $1
             AND (
               ($2 = '' AND pg_get_function_identity_arguments(p.oid) = '')
               OR ($2 <> '' AND pg_get_function_identity_arguments(p.oid) LIKE $2)
             )`,
          [name, args],
        );
        expect(meta.rows, fn).toHaveLength(1);
        expect(meta.rows[0].owner).toBe('postgres');
        expect(meta.rows[0].prosecdef).toBe(fn !== 'private_security.founder_profile_protected(uuid)');
        expect((meta.rows[0].proconfig ?? []).join(' ')).toContain('search_path=pg_catalog');
        for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
          const privilege = await client.query<{ ok: boolean }>(
            `SELECT has_function_privilege($1, $2, 'execute') AS ok`,
            [role, fn],
          );
          expect(privilege.rows[0].ok, `${role} ${fn}`).toBe(false);
        }
      }

      await client.query('SAVEPOINT installed');

      const visibleSuccess = await captureStatement(
        client,
        `UPDATE public.internal_roles
            SET description = description
          WHERE code = 'SUPER_ADMIN'
          RETURNING code AS value`,
      );
      expect(visibleSuccess.allowed, 'helper must report a successful write before savepoint cleanup').toBe(true);
      expect(visibleSuccess.rowCount).toBe(1);

      const probeCode = `ROLE_GUARD_${randomUUID().replace(/-/g, '').slice(0, 16)}`.toUpperCase();
      await client.query(
        `INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order, is_active)
         VALUES ($1, 'CONSOLE'::public.signup_side, 'Role Guard Probe', 'Disposable probe role',
                 ARRAY['READ']::public.role_permission[], 999, true)`,
        [probeCode],
      );
      await client.query(
        `INSERT INTO public.internal_roles (code, name, description, is_system)
         VALUES ($1, 'Role Guard Probe', 'Disposable probe role', false)`,
        [probeCode],
      );

      const unheldBuyer = await client.query<{ code: string }>(
        `SELECT ur.code
         FROM public.user_roles ur
         WHERE ur.is_active
           AND ur.code <> 'SUPER_ADMIN'
           AND NOT EXISTS (SELECT 1 FROM public.internal_roles ir WHERE ir.code = ur.code)
           AND NOT EXISTS (
             SELECT 1 FROM public.profile_roles pr
             WHERE pr.profile_id = $1::uuid AND pr.role_code = ur.code
           )
         ORDER BY ur.code
         LIMIT 1`,
        [FOUNDER_ID],
      );
      let buyerCode = unheldBuyer.rows[0]?.code;
      if (!buyerCode) {
        buyerCode = `${probeCode}_BUYER`;
        await client.query(
          `INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order, is_active)
           VALUES ($1, 'BUYER'::public.signup_side, 'Role Guard Buyer', 'Disposable unheld role',
                   ARRAY['READ']::public.role_permission[], 998, true)`,
          [buyerCode],
        );
      }

      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET active_role_code = NULL WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'null founder active role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET active_role_code = '   ' WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'blank founder active role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET active_role_code = $2 WHERE id = $1::uuid`,
        [FOUNDER_ID, buyerCode],
      ), 'unheld founder profile role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET active_role_code = $2 WHERE id = $1::uuid`,
        [FOUNDER_ID, probeCode],
      ), 'unheld founder internal role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET id = extensions.gen_random_uuid() WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'founder profile id change');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles
            SET auth_user_id = extensions.gen_random_uuid()
          WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'founder Auth identity retarget');

      await client.query('SAVEPOINT held_switch');
      try {
        const granted = await client.query(
          `INSERT INTO public.profile_roles (profile_id, role_code)
           VALUES ($1::uuid, $2)
           RETURNING role_code AS value`,
          [FOUNDER_ID, buyerCode],
        );
        expect(granted.rows[0].value).toBe(buyerCode);
        const switched = await client.query(
          `UPDATE public.profiles
              SET active_role_code = $2
            WHERE id = $1::uuid
            RETURNING active_role_code AS value`,
          [FOUNDER_ID, buyerCode],
        );
        expect(switched.rowCount).toBe(1);
        expect(switched.rows[0].value).toBe(buyerCode);
        const restored = await client.query(
          `UPDATE public.profiles
              SET active_role_code = 'SUPER_ADMIN'
            WHERE id = $1::uuid
            RETURNING active_role_code AS value`,
          [FOUNDER_ID],
        );
        expect(restored.rows[0].value).toBe('SUPER_ADMIN');
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT held_switch');
        await client.query('RELEASE SAVEPOINT held_switch');
      }

      expectRejected(await captureStatement(
        client,
        `DELETE FROM public.profile_roles WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'`,
        [FOUNDER_ID],
      ), 'delete founder profile role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profile_roles
            SET role_code = $2
          WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'`,
        [FOUNDER_ID, buyerCode],
      ), 'retarget founder profile role code');
      expectRejected(await captureStatement(
        client,
        `DELETE FROM public.internal_user_assignments ua
          USING public.internal_roles r
          WHERE ua.profile_id = $1::uuid
            AND ua.role_id = r.id
            AND r.code = 'SUPER_ADMIN'`,
        [FOUNDER_ID],
      ), 'delete founder internal assignment');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.internal_user_assignments
            SET role_id = (SELECT id FROM public.internal_roles WHERE code = $2)
          WHERE profile_id = $1::uuid
            AND role_id = (SELECT id FROM public.internal_roles WHERE code = 'SUPER_ADMIN')`,
        [FOUNDER_ID, probeCode],
      ), 'retarget founder internal assignment');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.internal_roles SET code = $1 WHERE code = 'SUPER_ADMIN'`,
        [probeCode],
      ), 'rename SUPER_ADMIN internal role');
      expectRejected(await captureStatement(
        client,
        `DELETE FROM public.internal_roles WHERE code = 'SUPER_ADMIN'`,
      ), 'delete SUPER_ADMIN internal role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.internal_roles SET id = extensions.gen_random_uuid() WHERE code = 'SUPER_ADMIN'`,
      ), 'change SUPER_ADMIN internal role id');
      expectRejected(await captureStatement(
        client,
        `TRUNCATE public.internal_roles CASCADE`,
      ), 'truncate internal roles');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.user_roles SET code = $1 WHERE code = 'SUPER_ADMIN'`,
        [`${probeCode}_USER`],
      ), 'rename SUPER_ADMIN user role');
      expectRejected(await captureStatement(
        client,
        `DELETE FROM public.user_roles WHERE code = 'SUPER_ADMIN'`,
      ), 'delete SUPER_ADMIN user role');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.user_roles SET is_active = false WHERE code = 'SUPER_ADMIN'`,
      ), 'deactivate SUPER_ADMIN user role');
      expectRejected(await captureStatement(
        client,
        `TRUNCATE public.user_roles CASCADE`,
      ), 'truncate user roles');
      expectRejected(await captureStatement(
        client,
        `TRUNCATE public.profile_roles`,
      ), 'truncate profile roles');
      expectRejected(await captureStatement(
        client,
        `TRUNCATE public.internal_user_assignments`,
      ), 'truncate internal assignments');

      const renamedProbe = await client.query<{ value: string }>(
        `UPDATE public.internal_roles
            SET code = $2
          WHERE code = $1
          RETURNING code AS value`,
        [probeCode, `${probeCode}_B`],
      );
      expect(renamedProbe.rows[0].value).toBe(`${probeCode}_B`);
      const removedProbe = await client.query(
        `DELETE FROM public.internal_roles WHERE code = $1 RETURNING code AS value`,
        [`${probeCode}_B`],
      );
      expect(removedProbe.rowCount).toBe(1);
      const removedProbeUser = await client.query(
        `DELETE FROM public.user_roles WHERE code = $1 RETURNING code AS value`,
        [probeCode],
      );
      expect(removedProbeUser.rowCount).toBe(1);

      const harmlessRole = await client.query(
        `UPDATE public.profile_roles
            SET is_demo = is_demo
          WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'
          RETURNING id::text AS value`,
        [FOUNDER_ID],
      );
      expect(harmlessRole.rowCount).toBe(1);
      const harmlessAssignment = await client.query(
        `UPDATE public.internal_user_assignments
            SET assigned_at = assigned_at
          WHERE profile_id = $1::uuid
            AND role_id = (SELECT id FROM public.internal_roles WHERE code = 'SUPER_ADMIN')
          RETURNING id::text AS value`,
        [FOUNDER_ID],
      );
      expect(harmlessAssignment.rowCount).toBe(1);
      const harmlessCatalog = await client.query(
        `UPDATE public.internal_roles SET name = name WHERE code = 'SUPER_ADMIN' RETURNING code AS value`,
      );
      expect(harmlessCatalog.rows[0].value).toBe('SUPER_ADMIN');
      const harmlessUser = await client.query(
        `UPDATE public.user_roles SET label = label WHERE code = 'SUPER_ADMIN' RETURNING code AS value`,
      );
      expect(harmlessUser.rows[0].value).toBe('SUPER_ADMIN');

      const other = await insertDisposableProfile(client);
      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code) VALUES ($1::uuid, 'SUPER_ADMIN')`,
        [other],
      );
      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id)
         SELECT $1::uuid, r.id FROM public.internal_roles r WHERE r.code = 'SUPER_ADMIN'`,
        [other],
      );
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profile_roles
            SET profile_id = $2::uuid
          WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'`,
        [FOUNDER_ID, other],
      ), 'retarget founder profile role to another profile');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.internal_user_assignments
            SET profile_id = $2::uuid
          WHERE profile_id = $1::uuid
            AND role_id = (SELECT id FROM public.internal_roles WHERE code = 'SUPER_ADMIN')`,
        [FOUNDER_ID, other],
      ), 'retarget founder assignment to another profile');

      const otherHeld = await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code)
         VALUES ($1::uuid, $2)
         ON CONFLICT (profile_id, role_code) DO NOTHING
         RETURNING role_code AS value`,
        [other, buyerCode],
      );
      expect(otherHeld.rowCount).toBe(1);
      const otherSwitch = await client.query(
        `UPDATE public.profiles SET active_role_code = $2 WHERE id = $1::uuid RETURNING active_role_code AS value`,
        [other, buyerCode],
      );
      expect(otherSwitch.rows[0].value).toBe(buyerCode);
      const otherClear = await client.query(
        `UPDATE public.profiles SET active_role_code = NULL WHERE id = $1::uuid RETURNING id::text AS value`,
        [other],
      );
      expect(otherClear.rowCount).toBe(1);
      const otherRole = await client.query(
        `DELETE FROM public.profile_roles WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN' RETURNING role_code AS value`,
        [other],
      );
      expect(otherRole.rows[0].value).toBe('SUPER_ADMIN');
      const otherAssignment = await client.query(
        `DELETE FROM public.internal_user_assignments ua
          USING public.internal_roles r
          WHERE ua.profile_id = $1::uuid AND ua.role_id = r.id AND r.code = 'SUPER_ADMIN'
          RETURNING ua.id::text AS value`,
        [other],
      );
      expect(otherAssignment.rowCount).toBe(1);

      await client.query(`SELECT set_config('otp.platform_privilege_write', 'on', true)`);
      const promoted = await client.query(
        `UPDATE public.profiles
            SET is_founder = true, is_platform_admin = true
          WHERE id = $1::uuid
          RETURNING id::text AS value`,
        [other],
      );
      expect(promoted.rowCount).toBe(1);
      await client.query(`SELECT set_config('otp.platform_privilege_write', 'off', true)`);
      const adminOnlyCode = `${probeCode}_ADMIN`;
      await client.query(
        `INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order, is_active)
         VALUES ($1, 'CONSOLE'::public.signup_side, 'Role Guard Admin', 'Catalog role without a holding',
                 ARRAY['READ']::public.role_permission[], 997, true)`,
        [adminOnlyCode],
      );
      const adminUnheld = await client.query(
        `UPDATE public.profiles SET active_role_code = $2 WHERE id = $1::uuid RETURNING active_role_code AS value`,
        [other, adminOnlyCode],
      );
      expect(adminUnheld.rows[0].value).toBe(adminOnlyCode);
      const adminClear = await client.query(
        `UPDATE public.profiles SET active_role_code = NULL WHERE id = $1::uuid RETURNING id::text AS value`,
        [other],
      );
      expect(adminClear.rowCount).toBe(1);
      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code) VALUES ($1::uuid, 'SUPER_ADMIN')`,
        [other],
      );
      const adminRole = await client.query(
        `DELETE FROM public.profile_roles WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN' RETURNING role_code AS value`,
        [other],
      );
      expect(adminRole.rows[0].value).toBe('SUPER_ADMIN');

      for (const email of ['admin@otp.test', 'ops@otp.test', 'bvnbasu@gmail.com']) {
        const clone = await insertDisposableProfile(client);
        const emailed = await client.query(
          `UPDATE public.profiles SET email = $2 WHERE id = $1::uuid RETURNING email AS value`,
          [clone, email],
        );
        expect(emailed.rows[0].value).toBe(email);
        await client.query(
          `INSERT INTO public.profile_roles (profile_id, role_code) VALUES ($1::uuid, 'SUPER_ADMIN')`,
          [clone],
        );
        await client.query(
          `INSERT INTO public.internal_user_assignments (profile_id, role_id)
           SELECT $1::uuid, r.id FROM public.internal_roles r WHERE r.code = 'SUPER_ADMIN'`,
          [clone],
        );
        const cleared = await client.query(
          `DELETE FROM public.profile_roles WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN' RETURNING role_code AS value`,
          [clone],
        );
        expect(cleared.rows[0].value, email).toBe('SUPER_ADMIN');
        const clearedAssignment = await client.query(
          `DELETE FROM public.internal_user_assignments ua
            USING public.internal_roles r
            WHERE ua.profile_id = $1::uuid AND ua.role_id = r.id AND r.code = 'SUPER_ADMIN'
            RETURNING ua.id::text AS value`,
          [clone],
        );
        expect(clearedAssignment.rowCount, email).toBe(1);
      }

      const otherFounders = await client.query<{ id: string }>(
        `SELECT id::text AS id
         FROM public.profiles
         WHERE is_founder IS TRUE AND id <> $1::uuid`,
        [FOUNDER_ID],
      );
      for (const row of otherFounders.rows) {
        await client.query('SAVEPOINT other_founder');
        try {
          const cleared = await client.query(
            `UPDATE public.profiles SET active_role_code = NULL WHERE id = $1::uuid RETURNING id::text AS value`,
            [row.id],
          );
          expect(cleared.rowCount, 'other founder active role').toBe(1);
          const removed = await client.query(
            `DELETE FROM public.profile_roles
              WHERE profile_id = $1::uuid AND role_code = 'SUPER_ADMIN'
              RETURNING role_code AS value`,
            [row.id],
          );
          if ((removed.rowCount ?? 0) > 0) {
            expect(removed.rows[0].value).toBe('SUPER_ADMIN');
          }
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT other_founder');
          await client.query('RELEASE SAVEPOINT other_founder');
        }
      }

      const founderStill = await founderIdentity(client);
      expect(founderStill).toEqual(installedFounder);
      expect((await captureStatement(
        client,
        `UPDATE public.profiles SET is_founder = false WHERE id = $1::uuid`,
        [FOUNDER_ID],
      )).message).toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
      expectRejected(await captureStatement(
        client,
        `UPDATE public.profiles SET email = 'retargeted-founder@example.test' WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'canonical founder email change');
      expect((await captureStatement(
        client,
        `UPDATE public.profiles SET is_platform_admin = false WHERE id = $1::uuid`,
        [FOUNDER_ID],
      )).message).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
      expectRejected(await captureStatement(
        client,
        `DELETE FROM public.profiles WHERE id = $1::uuid`,
        [FOUNDER_ID],
      ), 'founder profile delete');

      await client.query('ROLLBACK TO SAVEPOINT installed');
      expect(await founderIdentity(client)).toEqual(installedFounder);
      expect(await holdings(client)).toEqual(installedHoldings);
      expect(await legalConfig(client)).toEqual(beforeLegal);
      expect(await migrationVersions(client)).toEqual(beforeVersions);
      expect(await auditTriggers(client)).toEqual(beforeAudit);
      expect(await functionDef(client, 'private', 'prevent_audit_mutation')).toBe(beforePrevention);
      expect(await functionDef(client, 'private', 'prevent_audit_mutation')).toContain('INV-071');
      expect(await functionDef(client, 'private', 'prevent_audit_mutation')).toContain('INV-072');
      const purgeAfter = await client.query<{ v: string | null }>(
        `SELECT current_setting('otp.allow_audit_purge', true) AS v`,
      );
      expect(purgeAfter.rows[0].v === 'on').toBe(false);
    } catch (error) {
      failed = error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        failed = failed ?? error;
      }
      try {
        expect(await founderIdentity(client)).toEqual(beforeFounder);
        expect(await holdings(client)).toEqual(beforeHoldings);
        expect(await legalConfig(client)).toEqual(beforeLegal);
        expect(await migrationVersions(client)).toEqual(beforeVersions);
        expect(await auditTriggers(client)).toEqual(beforeAudit);
        const purge = await client.query<{ v: string | null }>(
          `SELECT current_setting('otp.allow_audit_purge', true) AS v`,
        );
        expect(purge.rows[0].v === 'on').toBe(false);
        const triggers = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n
           FROM pg_trigger
           WHERE tgname = ANY($1::text[])`,
          [NEW_TRIGGERS],
        );
        expect(triggers.rows[0].n).toBe(0);
      } catch (error) {
        failed = failed ?? error;
      }
      await client.end();
    }
    if (failed) throw failed;
  });
});

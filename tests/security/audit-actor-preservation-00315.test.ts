/**
 * 00315 audit actor registry.
 * Static checks always run. Database cases use local Postgres at
 * 127.0.0.1 only (port 54322 or LOCAL_PG_PORT), install the migration inside a transaction, and roll
 * it back. They do not insert schema_migrations, do not set
 * otp.allow_audit_purge, and do not contact a hosted database.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { currentLegal, ensureDistinctFrozenAgreements } from '../helpers/legal-evidence-fixture';
import {
  LOCAL_POSTGRES_ADDRESS,
  LOCAL_POSTGRES_PORT,
  requireLocalPostgresSqlParity,
} from '../helpers/local-postgres-sql-parity';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00315_audit_actor_identity_registry.UNAPPLIED.sql';
const PROPOSAL = resolve(ROOT, 'supabase', FILE);
const PREVIOUS = '00313_quote_invitation_state_boundary.sql';
const INVITATION = '00314_internal_invitation_acceptance.sql';
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: LOCAL_POSTGRES_PORT,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

type AuditFingerprint = {
  n: number;
  ids: string;
  actors: string;
  stamps: string;
  payloads: string;
  rows_fp: string;
};

type FounderSnapshot = {
  profiles: unknown[];
  roles: unknown[];
  assignments: unknown[];
};

type CountRow = { table_name: string; n: number };

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
}

function readMigration(): string {
  return readFileSync(PROPOSAL, 'utf8');
}

function stripTransaction(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*BEGIN;\s*$/.test(line) && !/^\s*COMMIT;\s*$/.test(line))
    .join('\n');
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
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

async function assertLocal(client: Client): Promise<void> {
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = String(addr.rows[0]?.addr ?? '');
  if (host && !host.startsWith('127.') && host !== '::1' && !host.includes('172.') && !host.includes('192.168.')) {
    throw new Error(`refusing non-local postgres at ${host}`);
  }
}

async function openLocal(): Promise<Client | null> {
  if (LOCAL_PG.host !== '127.0.0.1' || LOCAL_PG.port !== LOCAL_POSTGRES_PORT || LOCAL_PG.database !== 'postgres') {
    throw new Error('refusing non-local postgres config');
  }
  const client = new Client(LOCAL_PG);
  try {
    await client.connect();
  } catch (error) {
    const reason = `local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
    if (requireLocalPostgresSqlParity()) {
      expect(false, reason).toBe(true);
    } else {
      console.warn(`[SKIP REASON] ${reason}`);
    }
    return null;
  }
  await assertLocal(client);
  const ready = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.audit_events') IS NOT NULL
        AND to_regclass('public.legal_acceptance_archives') IS NOT NULL
        AND to_regclass('public.legal_enforcement_config') IS NOT NULL
        AND to_regclass('private_security.admin_whitelist') IS NOT NULL
        AND to_regprocedure('private.prevent_audit_mutation()') IS NOT NULL AS ok`,
  );
  if (!ready.rows[0]?.ok) {
    const reason = 'local database does not have the audit, legal archive, and founder-whitelist schema';
    await client.end();
    if (requireLocalPostgresSqlParity()) {
      expect(false, reason).toBe(true);
    } else {
      console.warn(`[SKIP REASON] ${reason}`);
    }
    return null;
  }
  return client;
}

async function fingerprint(client: Client): Promise<AuditFingerprint> {
  const result = await client.query<AuditFingerprint>(
    `SELECT count(*)::int AS n,
            md5(coalesce(string_agg(id::text, ',' ORDER BY id), '')) AS ids,
            md5(coalesce(string_agg(coalesce(actor_id::text, '<null>'), ',' ORDER BY id), '')) AS actors,
            md5(coalesce(string_agg(occurred_at::text, ',' ORDER BY id), '')) AS stamps,
            md5(coalesce(string_agg(payload::text, ',' ORDER BY id), '')) AS payloads,
            md5(coalesce(string_agg(md5(audit_events::text), ',' ORDER BY id), '')) AS rows_fp
     FROM public.audit_events`,
  );
  return result.rows[0];
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

async function founderSnapshot(client: Client): Promise<FounderSnapshot> {
  const profiles = await client.query(
    `SELECT id, lower(email) AS email, is_platform_admin, is_founder, active_role_code, status
     FROM public.profiles
     WHERE lower(email) = 'bvnbasu@gmail.com'
     ORDER BY id`,
  );
  const roles = await client.query(
    `SELECT pr.profile_id, pr.role_code
     FROM public.profile_roles pr
     JOIN public.profiles p ON p.id = pr.profile_id
     WHERE lower(p.email) = 'bvnbasu@gmail.com'
     ORDER BY pr.profile_id, pr.role_code`,
  );
  const assignments = await client.query(
    `SELECT ua.profile_id, r.code
     FROM public.internal_user_assignments ua
     JOIN public.internal_roles r ON r.id = ua.role_id
     JOIN public.profiles p ON p.id = ua.profile_id
     WHERE lower(p.email) = 'bvnbasu@gmail.com'
     ORDER BY ua.profile_id, r.code`,
  );
  return { profiles: profiles.rows, roles: roles.rows, assignments: assignments.rows };
}

async function relationCounts(client: Client): Promise<CountRow[]> {
  const tables = await client.query<{ table_name: string }>(
    `SELECT c.relname AS table_name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname ~ '^(suppliers|supplier_|requirement_categories|service_categories|taxonomy)'
     ORDER BY c.relname`,
  );
  const counts: CountRow[] = [];
  for (const row of tables.rows) {
    if (!/^[a-z0-9_]+$/.test(row.table_name)) continue;
    const count = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${row.table_name}`);
    counts.push({ table_name: row.table_name, n: count.rows[0].n });
  }
  return counts;
}

async function migrationVersions(client: Client): Promise<string[]> {
  const versions = await client.query<{ version: string }>(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  );
  return versions.rows.map((row) => row.version);
}

async function legalConfig(client: Client): Promise<{ enforcement_enabled: boolean; rollout_at: string | null; n: number }> {
  const result = await client.query<{ enforcement_enabled: boolean | null; rollout_present: boolean | null; n: number }>(
    `SELECT bool_and(enforcement_enabled) AS enforcement_enabled,
            bool_or(rollout_at IS NOT NULL) AS rollout_present,
            count(*)::int AS n
     FROM public.legal_enforcement_config`,
  );
  const row = result.rows[0];
  return {
    enforcement_enabled: row?.enforcement_enabled === true,
    rollout_at: row?.rollout_present ? 'set' : null,
    n: row?.n ?? 0,
  };
}

type Baseline = {
  fingerprint: AuditFingerprint;
  prevention: string;
  immutability: string;
  privileges: string;
  founder: FounderSnapshot;
  counts: CountRow[];
  versions: string[];
  legal: { enforcement_enabled: boolean; rollout_at: string | null; n: number };
};

async function profileBlockers(client: Client): Promise<Array<{ table_name: string; column_name: string; constraint_name: string; delete_action: string }>> {
  const result = await client.query(
    `SELECT ns.nspname || '.' || src.relname AS table_name,
            string_agg(att.attname, ',' ORDER BY att.attnum) AS column_name,
            c.conname AS constraint_name,
            c.confdeltype AS delete_action
     FROM pg_constraint c
     JOIN pg_class src ON src.oid = c.conrelid
     JOIN pg_namespace ns ON ns.oid = src.relnamespace
     JOIN pg_class tgt ON tgt.oid = c.confrelid
     JOIN pg_namespace nt ON nt.oid = tgt.relnamespace
     JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confdeltype IN ('a', 'r')
       AND (
         (nt.nspname = 'public' AND tgt.relname = 'profiles')
         OR (nt.nspname = 'auth' AND tgt.relname = 'users')
       )
     GROUP BY ns.nspname, src.relname, c.conname, c.confdeltype
     ORDER BY 1, 3`,
  );
  return result.rows;
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

async function insertProfile(client: Client, id: string, email: string, fullName: string, admin = false): Promise<void> {
  await insertAuthUser(client, id, email);
  await client.query(
    `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_founder, is_demo)
     VALUES ($1, $1, $2, $3, $4, $4, false)`,
    [id, email, fullName, admin],
  );
}

async function withMigration(fn: (client: Client, baseline: Baseline) => Promise<void>): Promise<void> {
  const client = await openLocal();
  if (!client) return;
  const existed = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.audit_actor_identities') IS NOT NULL AS present`,
  );
  if (existed.rows[0]?.present) {
    await client.end();
    throw new Error('local database already has audit_actor_identities; refusing to reapply 00315 in place');
  }
  let fnError: unknown;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '180s'`);
    const baseline: Baseline = {
      fingerprint: await fingerprint(client),
      prevention: await functionDef(client, 'private', 'prevent_audit_mutation'),
      immutability: await functionDef(client, 'private_security', 'enforce_superadmin_immutability'),
      privileges: await functionDef(client, 'private', 'guard_profile_privileges'),
      founder: await founderSnapshot(client),
      counts: await relationCounts(client),
      versions: await migrationVersions(client),
      legal: await legalConfig(client),
    };
    console.info(`AUDIT_PRESERVATION before ${JSON.stringify(baseline.fingerprint)}`);
    await client.query(stripTransaction(readMigration()));
    const after = await fingerprint(client);
    console.info(`AUDIT_PRESERVATION after ${JSON.stringify(after)}`);
    expect(after).toEqual(baseline.fingerprint);
    expect(await functionDef(client, 'private', 'prevent_audit_mutation')).toBe(baseline.prevention);
    expect(await functionDef(client, 'private_security', 'enforce_superadmin_immutability')).toBe(baseline.immutability);
    expect(await functionDef(client, 'private', 'guard_profile_privileges')).toBe(baseline.privileges);
    expect(baseline.prevention).toContain('INV-071');
    expect(baseline.prevention).toContain('INV-072');
    expect(baseline.immutability).toContain('Cannot delete protected root SuperAdmin');
    expect(baseline.immutability).toContain('assert_recovery_floor_after');
    expect(baseline.privileges).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
    expect(await founderSnapshot(client)).toEqual(baseline.founder);
    expect(await relationCounts(client)).toEqual(baseline.counts);
    expect(await migrationVersions(client)).toEqual(baseline.versions);
    expect(await legalConfig(client)).toEqual(baseline.legal);
    expect(baseline.legal).toEqual({ enforcement_enabled: false, rollout_at: null, n: 1 });
    await fn(client, baseline);
  } catch (error) {
    fnError = error;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      fnError = fnError ?? error;
    }
    try {
      const still = await client.query<{ present: boolean }>(
        `SELECT to_regclass('public.audit_actor_identities') IS NOT NULL AS present`,
      );
      if (still.rows[0]?.present) {
        throw new Error('00315 persisted after ROLLBACK');
      }
    } catch (error) {
      fnError = fnError ?? error;
    }
    await client.end();
  }
  if (fnError) throw fnError;
}

describe('00315 audit actor registry static contract', () => {
  const sql = readMigration();
  const executable = stripTransaction(sql);
  const files = migrationFiles();

  it('keeps 00315 outside the runner while 00314 remains the last approved migration', () => {
    expect(files.at(-1)).toBe(INVITATION);
    expect(files.at(-2)).toBe(PREVIOUS);
    expect(files.some((file) => file.startsWith('00315_'))).toBe(false);
    expect(PROPOSAL.replace(/\\/g, '/')).not.toContain('/migrations/');
    expect(FILE).toMatch(/\.UNAPPLIED\.sql$/);
    expect(files.filter((file) => file.startsWith('00314_'))).toEqual([INVITATION]);

    const supplierAddressDraft = readFileSync(
      resolve(ROOT, 'supabase/00314_internal_procurement_and_supplier_business_address.UNAPPLIED.sql'),
      'utf8',
    );
    expect(supplierAddressDraft).toContain('STATUS: UNAPPLIED');
    expect(supplierAddressDraft).toContain('has not been applied');
  });

  it('backfills the registry before retargeting the actor foreign key', () => {
    const backfill = executable.indexOf('INSERT INTO public.audit_actor_identities');
    const dropFk = executable.indexOf('DROP CONSTRAINT audit_events_actor_id_fkey');
    const addFk = executable.indexOf('REFERENCES public.audit_actor_identities (actor_id)');
    expect(backfill).toBeGreaterThan(0);
    expect(dropFk).toBeGreaterThan(backfill);
    expect(addFk).toBeGreaterThan(dropFk);
    expect(executable).toContain('ON DELETE SET NULL');
    expect(executable).toContain('ON DELETE RESTRICT');
    expect(executable).toContain('pre-check failed');
    expect(executable).toContain('post-check failed');
    expect(executable).toContain('existing audit_events rows changed');
  });

  it('does not purge audit rows, weaken append-only enforcement, or touch legal and supplier data', () => {
    const code = stripComments(executable);
    expect(executable).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(executable).not.toMatch(/^\s*COMMIT;\s*$/m);
    expect(code).not.toMatch(/UPDATE\s+public\.audit_events/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.audit_events/i);
    expect(code).not.toMatch(/TRUNCATE\s+/i);
    expect(code).not.toMatch(/set_config\(\s*'otp\.allow_audit_purge'/i);
    expect(code).not.toMatch(/SET\s+otp\.allow_audit_purge/i);
    expect(code).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(code).not.toMatch(/SET\s+session_replication_role/i);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.prevent_audit_mutation/i);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private_security\.enforce_superadmin_immutability/i);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.guard_profile_privileges/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.profiles/i);
    expect(code).not.toMatch(/UPDATE\s+public\.profiles/i);
    expect(code).not.toMatch(/legal_enforcement_config/i);
    expect(code).not.toMatch(/\bsuppliers\b/i);
    expect(code).not.toMatch(/requirement_categories/i);
    expect(code).not.toMatch(/schema_migrations/i);
    expect(code).toContain('Cannot delete protected root SuperAdmin');
    expect(code).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
    expect(code).toContain('INV-071');
    expect(code).toContain('INV-072');
    expect(sql).toContain('do not apply a down migration');
  });
});

describe('00315 audit actor registry (local postgres, rolled back)', () => {
  it('preserves existing audit rows, enforcement, suppliers, and migration history', async () => {
    await withMigration(async (client, baseline) => {
      expect(await fingerprint(client)).toEqual(baseline.fingerprint);
      expect(await legalConfig(client)).toEqual({ enforcement_enabled: false, rollout_at: null, n: 1 });
      expect(baseline.versions.length).toBeGreaterThan(0);

      const fk = await client.query<{ target: string; validated: boolean; delete_action: string }>(
        `SELECT c.confrelid::regclass::text AS target, c.convalidated AS validated, c.confdeltype AS delete_action
         FROM pg_constraint c
         WHERE c.conname = 'audit_events_actor_id_fkey'`,
      );
      expect(fk.rows[0]?.target).toContain('audit_actor_identities');
      expect(fk.rows[0]?.validated).toBe(true);
      expect(fk.rows[0]?.delete_action).toBe('r');

      const blockers = await profileBlockers(client);
      console.info(`AUDIT_PROFILE_FK_BLOCKERS ${JSON.stringify(blockers)}`);
      expect(blockers.some((row) => row.table_name === 'public.audit_events')).toBe(false);
    });
  });

  it('deletes a disposable profile without rewriting its audit history', async () => {
    await withMigration(async (client, before) => {
      const id = randomUUID();
      const email = `audit-disposable-${id}@example.test`;
      await insertProfile(client, id, email, 'Disposable Actor');
      const registry = await client.query<{ actor_id: string; profile_id: string; email: string }>(
        `SELECT actor_id, profile_id, email FROM public.audit_actor_identities WHERE actor_id = $1`,
        [id],
      );
      expect(registry.rows).toEqual([{ actor_id: id, profile_id: id, email }]);

      const occurredAt = '2026-10-22T00:00:00.000Z';
      const payload = { keep: true, actor: id };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload, occurred_at)
         VALUES ('audit.actor.registry.test', $1, 'profile', $2, $3::jsonb, $4::timestamptz)
         RETURNING id`,
        [id, id, JSON.stringify(payload), occurredAt],
      );
      const eventId = inserted.rows[0].id;
      const systemEvent = await client.query(
        `INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
         VALUES ('audit.actor.registry.system', 'profile', $1, '{}'::jsonb)
         RETURNING id`,
        [id],
      );
      expect(systemEvent.rowCount).toBe(1);

      const removed = await client.query(`DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [id]);
      expect(removed.rowCount).toBe(1);
      const event = await client.query(
        `SELECT id, actor_id, event_type, entity_type, entity_id, payload, occurred_at
         FROM public.audit_events WHERE id = $1`,
        [eventId],
      );
      expect(event.rows[0].id).toBe(eventId);
      expect(event.rows[0].actor_id).toBe(id);
      expect(event.rows[0].payload).toEqual(payload);
      expect(new Date(event.rows[0].occurred_at).toISOString()).toBe(occurredAt);

      const preserved = await client.query<{ actor_id: string; profile_id: string | null; email: string; profile_deleted_at: string | null }>(
        `SELECT actor_id, profile_id, email, profile_deleted_at
         FROM public.audit_actor_identities WHERE actor_id = $1`,
        [id],
      );
      expect(preserved.rows[0].actor_id).toBe(id);
      expect(preserved.rows[0].profile_id).toBeNull();
      expect(preserved.rows[0].email).toBe(email);
      expect(preserved.rows[0].profile_deleted_at).toBeTruthy();

      const resolved = await client.query<{ email: string; profile_id: string | null }>(
        `SELECT email, profile_id FROM public.resolve_audit_actor($1)`,
        [id],
      );
      expect(resolved.rows).toEqual([{ email, profile_id: null }]);

      const historical = await client.query<{ n: number; rows_fp: string }>(
        `SELECT count(*)::int AS n,
                md5(coalesce(string_agg(md5(e::text), ',' ORDER BY e.id), '')) AS rows_fp
         FROM public.audit_events e
         WHERE e.id IS DISTINCT FROM $1::uuid
           AND e.id IS DISTINCT FROM $2::uuid`,
        [eventId, systemEvent.rows[0].id],
      );
      expect(historical.rows[0]).toEqual({ n: before.fingerprint.n, rows_fp: before.fingerprint.rows_fp });
    });
  });

  it('keeps founder and SUPER_ADMIN protection in force', async (ctx) => {
    await withMigration(async (client) => {
      const whitelist = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM private_security.admin_whitelist
         WHERE lower(email) = 'bvnbasu@gmail.com'`,
      );
      expect(whitelist.rows[0].n).toBe(1);

      const existing = await client.query<{ id: string; is_platform_admin: boolean; active_role_code: string | null }>(
        `SELECT id, is_platform_admin, active_role_code
         FROM public.profiles
         WHERE lower(email) = 'bvnbasu@gmail.com'
         ORDER BY id
         LIMIT 1`,
      );
      if (existing.rows[0]) {
        expect(existing.rows[0].is_platform_admin).toBe(true);
        expect(existing.rows[0].active_role_code).toBe('SUPER_ADMIN');
      }
      const founderId = existing.rows[0]?.id;
      if (!founderId) {
        console.warn('[SKIP REASON] canonical founder profile is absent; the test will not seed or change founder security records');
        ctx.skip();
        return;
      }
      const superAdmin = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM public.profile_roles
         WHERE profile_id = $1 AND role_code = 'SUPER_ADMIN'`,
        [founderId],
      );

      expect(await messageOf(client, `DELETE FROM public.profiles WHERE id = $1`, [founderId]))
        .toContain('SECURITY VIOLATION');
      expect(await messageOf(
        client,
        `UPDATE public.profiles SET is_platform_admin = false WHERE id = $1`,
        [founderId],
      )).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
      expect(await messageOf(
        client,
        `UPDATE public.profiles SET is_founder = false WHERE id = $1`,
        [founderId],
      )).toContain('PLATFORM_PRIVILEGE_IMMUTABLE');
      const roleClear = await messageOf(
        client,
        `UPDATE public.profiles SET active_role_code = NULL WHERE id = $1`,
        [founderId],
      );
      const roleDelete = await messageOf(
        client,
        `DELETE FROM public.profile_roles WHERE profile_id = $1 AND role_code = 'SUPER_ADMIN'`,
        [founderId],
      );
      console.info(`AUDIT_SUPER_ADMIN_ROLE_CLEAR ${roleClear || 'allowed'}`);
      console.info(`AUDIT_SUPER_ADMIN_ROLE_DELETE ${roleDelete || 'allowed'}`);
      expect((await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`,
        [founderId],
      )).rows[0].n).toBe(1);
      expect((await client.query<{ is_platform_admin: boolean }>(
        `SELECT is_platform_admin FROM public.profiles WHERE id = $1`,
        [founderId],
      )).rows[0].is_platform_admin).toBe(existing.rows[0]?.is_platform_admin ?? true);
      if (existing.rows[0]) {
        expect((await client.query<{ active_role_code: string | null }>(
          `SELECT active_role_code FROM public.profiles WHERE id = $1`,
          [founderId],
        )).rows[0].active_role_code).toBe(existing.rows[0].active_role_code);
      }
      expect((await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.profile_roles WHERE profile_id = $1 AND role_code = 'SUPER_ADMIN'`,
        [founderId],
      )).rows[0].n).toBe(superAdmin.rows[0].n);
    });
  });

  it('blocks direct audit updates and deletes and direct registry mutation', async () => {
    await withMigration(async (client) => {
      const id = randomUUID();
      await insertProfile(client, id, `audit-immutable-${id}@example.test`, 'Immutable Actor');
      const event = await client.query<{ id: string }>(
        `INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
         VALUES ('audit.actor.registry.immutable', $1::uuid, 'profile', $2, '{"v":1}'::jsonb)
         RETURNING id`,
        [id, id],
      );
      const eventId = event.rows[0].id;
      expect(await messageOf(
        client,
        `UPDATE public.audit_events SET payload = '{"v":2}'::jsonb WHERE id = $1`,
        [eventId],
      )).toContain('INV-071');
      expect(await messageOf(client, `DELETE FROM public.audit_events WHERE id = $1`, [eventId]))
        .toContain('INV-071');
      expect(await messageOf(
        client,
        `UPDATE public.audit_actor_identities SET email = 'stolen@example.test' WHERE actor_id = $1`,
        [id],
      )).toContain('AUDIT_ACTOR_IDENTITY_IMMUTABLE');
      expect(await messageOf(
        client,
        `DELETE FROM public.audit_actor_identities WHERE actor_id = $1`,
        [id],
      )).toContain('AUDIT_ACTOR_IDENTITY_IMMUTABLE');
      expect((await client.query<{ payload: { v: number } }>(
        `SELECT payload FROM public.audit_events WHERE id = $1`,
        [eventId],
      )).rows[0].payload).toEqual({ v: 1 });
      const purge = await client.query<{ v: string | null }>(`SELECT current_setting('otp.allow_audit_purge', true) AS v`);
      expect(purge.rows[0].v === 'on').toBe(false);

      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [randomUUID()]);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: 'authenticated', sub: randomUUID() }),
      ]);
      expect(await messageOf(client, `SELECT * FROM public.resolve_audit_actor($1)`, [id]))
        .toContain('AUDIT_ACTOR_RESOLUTION_DENIED');
    });
  });

  it('archives legal acceptance while retaining the audit event', async () => {
    await withMigration(async (client) => {
      await ensureDistinctFrozenAgreements(client);
      const agreement = await currentLegal(client, 'CUSTOMER_EULA');
      const id = randomUUID();
      await insertProfile(client, id, `audit-legal-${id}@example.test`, 'Legal Subject');
      await client.query(
        `INSERT INTO public.legal_acceptances (profile_id, agreement_type, version, acceptance_source)
         VALUES ($1, 'CUSTOMER_EULA', $2, 'POST_LOGIN')`,
        [id, agreement.version],
      );
      await client.query(
        `INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
         VALUES ('legal.acceptance.test', $1::uuid, 'profile', $2, '{"archived":true}'::jsonb)`,
        [id, id],
      );
      const removed = await client.query(`DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [id]);
      expect(removed.rowCount).toBe(1);
      const archives = await client.query(
        `SELECT document_hash FROM public.legal_acceptance_archives WHERE profile_id = $1`,
        [id],
      );
      expect(archives.rows).toEqual([{ document_hash: agreement.document_hash }]);
      const audit = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM public.audit_events
         WHERE actor_id = $1 AND payload = '{"archived":true}'::jsonb`,
        [id],
      );
      expect(audit.rows[0].n).toBe(1);
      const legal = await legalConfig(client);
      expect(legal.enforcement_enabled).toBe(false);
      expect(legal.rollout_at).toBeNull();
    });
  });
});

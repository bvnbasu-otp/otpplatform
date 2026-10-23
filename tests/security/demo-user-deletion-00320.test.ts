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
const AUDIT_PROPOSAL = resolve(ROOT, 'supabase/00315_audit_actor_identity_registry.UNAPPLIED.sql');
const FOUNDER_PROPOSAL = resolve(ROOT, 'supabase/00316_founder_superadmin_role_guard.UNAPPLIED.sql');
const DELETE_PROPOSAL = resolve(ROOT, 'supabase/00320_superadmin_demo_user_deletion.UNAPPLIED.sql');
const DEMO_MARKER_PROPOSAL = resolve(ROOT, 'supabase/00321_restrict_is_demo_marker.UNAPPLIED.sql');
// Migration 00113 creates this deterministic local founder. 00316 resolves the
// founder by claim + reserved email and therefore also covers hosted UUIDs.
const FOUNDER_ID = 'dd2dedee-0c2a-4254-b2af-342b41d56385';
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

function stripPreconditions(sql: string): string {
  return sql.replace(/DO \$preconditions\$[\s\S]*?\$preconditions\$;/, '');
}

const RETAINED_CATEGORIES = [
  'audit_history',
  'legal_evidence',
  'procurement_finance_tax',
  'organization_supplier',
  'messaging_delivery',
  'security_identity',
];

const NON_BLOCKING_MANIFEST = [
  'auth.identities.user_id:existing_auth_ephemeral_cascade',
  'auth.mfa_factors.user_id:existing_auth_ephemeral_cascade',
  'auth.mfa_recovery_code_sets.user_id:existing_auth_ephemeral_cascade',
  'auth.oauth_authorizations.user_id:existing_auth_ephemeral_cascade',
  'auth.oauth_consents.user_id:existing_auth_ephemeral_cascade',
  'auth.one_time_tokens.user_id:existing_auth_ephemeral_cascade',
  'auth.sessions.user_id:existing_auth_ephemeral_cascade',
  'auth.webauthn_challenges.user_id:existing_auth_ephemeral_cascade',
  'auth.webauthn_credentials.user_id:existing_auth_ephemeral_cascade',
  'private.password_history.profile_id:delete_allowlisted_before_profile',
  'public.audit_actor_identities.profile_id:preserve_evidence_set_null',
  'public.demo_accounts.profile_id:delete_allowlisted_before_profile',
  'public.internal_user_assignments.profile_id:delete_allowlisted_before_profile',
  'public.notification_preferences.user_id:delete_allowlisted_before_profile',
  'public.profile_roles.profile_id:delete_allowlisted_before_profile',
  'public.profile_verification_otps.profile_id:delete_allowlisted_before_profile',
  'public.profiles.auth_user_id:delete_target_profile_explicitly',
].sort();

async function connectLocalOnly(): Promise<Client | null> {
  const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
  } catch (error) {
    const reason = `local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = addr.rows[0]?.addr ?? '';
  if (host && !host.startsWith('127.') && host !== '::1' && !host.startsWith('172.') && !host.startsWith('192.168.')) {
    await client.end();
    throw new Error(`refusing non-local postgres at ${host}`);
  }
  return client;
}

async function openLocal(): Promise<Client | null> {
  const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
  } catch (error) {
    const reason = `local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = addr.rows[0]?.addr ?? '';
  if (host && !host.startsWith('127.') && host !== '::1' && !host.startsWith('172.') && !host.startsWith('192.168.')) {
    await client.end();
    throw new Error(`refusing non-local postgres at ${host}`);
  }
  const ready = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.profiles') IS NOT NULL
        AND to_regclass('public.profile_roles') IS NOT NULL
        AND to_regclass('public.internal_user_assignments') IS NOT NULL
        AND to_regclass('public.legal_enforcement_config') IS NOT NULL
        AND to_regprocedure('private.prevent_audit_mutation()') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          JOIN auth.users au ON au.id = p.auth_user_id
          JOIN public.profile_roles pr ON pr.profile_id = p.id AND pr.role_code = 'SUPER_ADMIN'
          JOIN public.internal_user_assignments ua ON ua.profile_id = p.id
          JOIN public.internal_roles ir ON ir.id = ua.role_id AND ir.code = 'SUPER_ADMIN'
          WHERE p.id = '${FOUNDER_ID}'::uuid
            AND p.is_founder IS TRUE
            AND p.is_platform_admin IS TRUE
            AND p.active_role_code = 'SUPER_ADMIN'
        ) AS ok`,
  );
  if (!ready.rows[0]?.ok) {
    await client.end();
    const reason = 'local database lacks the canonical founder/Auth identity, SUPER_ADMIN holdings, or required legal/audit schema';
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  return client;
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

async function setRequester(client: Client, authId: string): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authId]);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ role: 'authenticated', sub: authId }),
  ]);
}

async function insertDisposableProfile(
  client: Client,
  input: { id?: string; emailPrefix: string; isDemo: boolean },
): Promise<{ profileId: string; authId: string }> {
  const id = input.id ?? randomUUID();
  const email = `${input.emailPrefix}-${id}@example.test`;
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
    `INSERT INTO public.profiles (
       id, auth_user_id, email, full_name, is_platform_admin, is_founder, is_demo, active_role_code
     ) VALUES ($1, $1, $2, 'Disposable QA Fixture', false, false, $3, NULL)`,
    [id, email, input.isDemo],
  );
  return { profileId: id, authId: id };
}

describe('00320 disposable demo/QA deletion proposal', () => {
  const sql = readFileSync(DELETE_PROPOSAL, 'utf8');
  const executable = stripComments(sql);

  it('keeps proposals 00315 through 00321 outside the migration runner', () => {
    const migrations = readdirSync(MIGRATIONS).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
    expect(migrations.at(-1)).toBe('00314_internal_invitation_acceptance.sql');
    for (const number of ['00315', '00316', '00317', '00318', '00319', '00320', '00321']) {
      expect(migrations.some((file) => file.startsWith(number))).toBe(false);
      const proposals = readdirSync(resolve(ROOT, 'supabase')).filter((file) => file.startsWith(number));
      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatch(/\.UNAPPLIED\.sql$/);
    }
    expect(readFileSync(AUDIT_PROPOSAL, 'utf8')).toContain('00315: keep audit attribution');
    expect(readFileSync(FOUNDER_PROPOSAL, 'utf8')).toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
    expect(sql.startsWith('-- STATUS: UNAPPLIED')).toBe(true);
    expect(sql).toContain("to_regprocedure('private_security.guard_profile_is_demo_marker()')");
  });

  it('requires effective server-side SUPER_ADMIN authorization and trusted is_demo classification', () => {
    expect(executable).toContain('effective_superadmin_requester');
    expect(executable).toContain("auth.role(), '') IS DISTINCT FROM 'authenticated'");
    expect(executable).toContain("p.active_role_code = 'SUPER_ADMIN'");
    expect(executable).toContain("pr.role_code = 'SUPER_ADMIN'");
    expect(executable).toContain("ir.code = 'SUPER_ADMIN'");
    expect(executable).toContain('v_target.is_demo IS DISTINCT FROM TRUE');
    expect(executable).toContain('FOUNDER_IDENTITY_PROTECTED');
    expect(executable).toContain('LAST_EFFECTIVE_SUPERADMIN_PROTECTED');
    expect(executable).not.toMatch(/lower\s*\(\s*v_target\.email/i);
    expect(executable).not.toMatch(/v_target\.(?:email|full_name|title)\s+(?:LIKE|~|=)/i);
  });

  it('binds one-time confirmation to requester, target, dependency fingerprint, and expiry', () => {
    expect(executable).toContain('requester_profile_id = v_requester');
    expect(executable).toContain('target_profile_id = p_target_profile_id');
    expect(executable).toContain("extensions.gen_random_bytes(32)");
    expect(executable).toContain("extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256')");
    expect(executable).toContain("interval '10 minutes'");
    expect(executable).toContain('v_preview.expires_at <= clock_timestamp()');
    expect(executable).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
    expect(executable).toContain('DEMO_USER_DELETE_STALE_PREVIEW');
    expect(executable.indexOf('DEMO_USER_DELETE_STALE_PREVIEW')).toBeLessThan(
      executable.indexOf('current preview is not eligible'),
    );
  });

  it('inventories FK actions, blocks retained and unknown dependencies, and uses an explicit delete allowlist', () => {
    expect(executable).toContain("c.contype = 'f'");
    expect(executable).toContain("tgt.relname = 'profiles'");
    expect(executable).toContain("tgt.relname = 'users'");
    expect(executable).toContain("'NO ACTION'");
    expect(executable).toContain("'RESTRICT'");
    expect(executable).toContain("'CASCADE'");
    expect(executable).toContain("'SET NULL'");
    expect(executable).toContain('block_unknown_fk');
    expect(executable).toContain('block_retained_dependency');
    for (const category of [
      'audit_history',
      'legal_evidence',
      'procurement_finance_tax',
      'organization_supplier',
      'messaging_delivery',
      'security_identity',
    ]) {
      expect(executable).toContain(`'${category}'`);
    }
    const deletes = [...executable.matchAll(/DELETE\s+FROM\s+([a-z_]+\.[a-z_]+)/gi)].map((match) => match[1]);
    expect(deletes).toEqual([
      'public.internal_user_assignments',
      'public.profile_roles',
      'public.notification_preferences',
      'public.profile_verification_otps',
      'public.demo_accounts',
      'private.password_history',
      'public.profiles',
      'auth.users',
    ]);
    expect(executable).toContain('private_security.demo_user_deletion_fk_manifest()');
    expect(executable).toContain('block_fk_action_drift');
    expect(executable).not.toMatch(/source_table\s*~/);
    expect(executable).not.toMatch(/relname\s*~/);
    expect(executable).not.toMatch(/DELETE\s+FROM[\s\S]{0,100}\bCASCADE\b/i);
    expect(executable).not.toMatch(/DISABLE\s+TRIGGER|SET\s+CONSTRAINTS/i);
    expect(executable).not.toMatch(/SET\s+(?:LOCAL\s+|SESSION\s+)?session_replication_role|set_config\s*\(\s*'session_replication_role'/i);
    expect(executable.match(/session_replication_role/g)).toHaveLength(2);
  });

  it('keeps every retained category blocking and limits non-blocking manifest rows to the reviewed allowlist', () => {
    const manifestBody = executable.match(/\$manifest\$([\s\S]*?)\$manifest\$/)?.[1] ?? '';
    const rows = [...manifestBody.matchAll(/\('([a-z]+)', '([a-z_]+)', '([a-z_]+)', '([A-Z ]+)', '([a-z_]+)', '([a-z_]+)', (NULL|'[a-z_]+')\)/g)];
    expect(rows.length).toBe(120);
    const keys = rows.map((row) => `${row[1]}.${row[2]}.${row[3]}`);
    expect(new Set(keys).size).toBe(keys.length);
    const nonBlocking = rows
      .filter((row) => row[6] !== 'block_retained_dependency')
      .map((row) => `${row[1]}.${row[2]}.${row[3]}:${row[6]}`)
      .sort();
    expect(nonBlocking).toEqual(NON_BLOCKING_MANIFEST);
    for (const row of rows) {
      if (RETAINED_CATEGORIES.includes(row[5]) && row[6] !== 'block_retained_dependency') {
        expect(`${row[1]}.${row[2]}.${row[3]}:${row[6]}`).toBe('public.audit_actor_identities.profile_id:preserve_evidence_set_null');
      }
    }
    expect(executable).toMatch(/IF \(v_snapshot ->> 'eligible'\)::boolean IS DISTINCT FROM TRUE THEN\s+RETURN v_snapshot/);
    expect(executable).toContain("current_setting('session_replication_role') IS DISTINCT FROM 'origin'");
  });

  it('requires reason/outcome, preserves audit evidence, postchecks, and closes the historical bypass', () => {
    expect(executable).toContain('DEMO_USER_DELETE_REASON_REQUIRED');
    expect(executable).toContain('DEMO_USER_DELETE_OUTCOME_REQUIRED');
    expect(executable).toContain('audit_actor_identities');
    expect(executable).toContain('admin.demo_user_deleted');
    expect(executable).toContain('DEMO_USER_DELETE_POSTCHECK_FAILED');
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_bulk_delete_users\(uuid\[\], boolean\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i,
    );
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.preview_demo_user_deletion\(uuid\) FROM PUBLIC, anon, service_role/i,
    );
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.execute_demo_user_deletion\(uuid, text, text, text\) FROM PUBLIC, anon, service_role/i,
    );
    expect(executable).toMatch(/GRANT EXECUTE ON FUNCTION public\.preview_demo_user_deletion\(uuid\) TO authenticated/i);
    expect(executable).toMatch(/GRANT EXECUTE ON FUNCTION public\.execute_demo_user_deletion\(uuid, text, text, text\) TO authenticated/i);
  });

  it('classifies every live profile/Auth foreign key through the manifest and blocks retained rows (local postgres, rolled back)', async (ctx) => {
    const client = await connectLocalOnly();
    if (!client) {
      ctx.skip();
      return;
    }

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '120s'`);
      // Compile-only install: the 00315/00316 preconditions are not evaluated here,
      // and no preview/execute RPC is called, so no founder record is required.
      await client.query(stripTransaction(stripPreconditions(sql)));

      const coverage = await client.query<{
        fk: string;
        catalog_action: string;
        column_count: number;
        manifest_action: string | null;
        disposition: string | null;
      }>(`
        WITH fk AS (
          SELECT ns.nspname || '.' || src.relname || '.' || att.attname AS fk,
                 ns.nspname AS s, src.relname AS t, att.attname AS col,
                 CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                   WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS catalog_action,
                 array_length(c.conkey, 1) AS column_count
          FROM pg_constraint c
          JOIN pg_class src ON src.oid = c.conrelid
          JOIN pg_namespace ns ON ns.oid = src.relnamespace
          JOIN pg_class tgt ON tgt.oid = c.confrelid
          JOIN pg_namespace nt ON nt.oid = tgt.relnamespace
          LEFT JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = c.conkey[1]
          WHERE c.contype = 'f'
            AND ((nt.nspname = 'public' AND tgt.relname = 'profiles') OR (nt.nspname = 'auth' AND tgt.relname = 'users'))
        )
        SELECT fk.fk, fk.catalog_action, fk.column_count, m.delete_action AS manifest_action, m.disposition
        FROM fk
        LEFT JOIN private_security.demo_user_deletion_fk_manifest() m
          ON m.source_schema = fk.s AND m.source_table = fk.t AND m.source_column = fk.col
        ORDER BY fk.fk`);
      console.log(`DEMO_DELETE_FK_INVENTORY live=${coverage.rows.length}`);
      const unreviewed = coverage.rows.filter(
        (row) => row.disposition === null || row.manifest_action !== row.catalog_action || row.column_count !== 1,
      );
      expect(unreviewed).toEqual([]);
      expect(coverage.rows.length).toBeGreaterThan(100);

      const target = await insertDisposableProfile(client, { emailPrefix: 'manifest-clean', isDemo: true });
      const requester = randomUUID();
      const snapshot = async (profileId: string) =>
        (await client.query<{ s: any }>(
          `SELECT private_security.demo_user_deletion_snapshot($1::uuid, $2::uuid) AS s`,
          [profileId, requester],
        )).rows[0].s;

      const realAccount = await insertDisposableProfile(client, { emailPrefix: 'manifest-not-demo', isDemo: false });
      const notDemo = await snapshot(realAccount.profileId);
      expect(notDemo.eligible).toBe(false);
      expect(notDemo.policyBlockers).toEqual([{ code: 'TARGET_NOT_TRUSTED_DEMO_QA', category: 'identity' }]);

      const clean = await snapshot(target.profileId);
      expect(clean.trustedDemoQa).toBe(true);
      expect(clean.eligible).toBe(true);
      expect(clean.blockerCount).toBe(0);
      expect(clean.dependencies.length).toBe(coverage.rows.length);

      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code, assigned_by) VALUES ($1, 'PROPERTY_OWNER', $1)`,
        [target.profileId],
      );
      const selfAssigned = await snapshot(target.profileId);
      expect(selfAssigned.eligible).toBe(true);
      const assignedBy = selfAssigned.dependencies.find(
        (d: any) => d.table === 'profile_roles' && d.column === 'assigned_by',
      );
      expect(assignedBy).toMatchObject({ count: 0, blocks: false, disposition: 'block_retained_dependency' });

      await client.query(
        `INSERT INTO public.notifications (profile_id, channel, event_type) VALUES ($1, 'IN_APP', 'qa.fixture')`,
        [target.profileId],
      );
      await client.query(
        `INSERT INTO public.buyer_addresses (profile_id, address_line1, city, state, pincode)
         VALUES ($1, 'Fixture line', 'Bengaluru', 'Karnataka', '560001')`,
        [target.profileId],
      );
      await client.query(`INSERT INTO public.personal_subscriptions (profile_id) VALUES ($1)`, [target.profileId]);
      const retained = await snapshot(target.profileId);
      expect(retained.eligible).toBe(false);
      for (const [table, category] of [
        ['notifications', 'messaging_delivery'],
        ['buyer_addresses', 'organization_supplier'],
        ['personal_subscriptions', 'procurement_finance_tax'],
      ]) {
        expect(retained.dependencies.find((d: any) => d.table === table && d.column === 'profile_id')).toMatchObject({
          category,
          disposition: 'block_retained_dependency',
          count: 1,
          blocks: true,
        });
      }

      await client.query(`
        CREATE TABLE public.zz_unreviewed_profile_dependency (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          subject uuid REFERENCES public.profiles(id) ON DELETE CASCADE
        )`);
      const unreviewedTarget = await insertDisposableProfile(client, { emailPrefix: 'manifest-unknown', isDemo: true });
      const unknown = await snapshot(unreviewedTarget.profileId);
      expect(unknown.eligible).toBe(false);
      expect(unknown.dependencies.find((d: any) => d.table === 'zz_unreviewed_profile_dependency')).toMatchObject({
        category: 'unknown',
        disposition: 'block_unknown_fk',
        count: 0,
        blocks: true,
      });
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

  it('executes only against rollback-only disposable fixtures when local prerequisites exist', async (ctx) => {
    const client = await openLocal();
    if (!client) {
      ctx.skip();
      return;
    }

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '180s'`);

      if ((await client.query(`SELECT to_regclass('public.audit_actor_identities') IS NULL AS missing`)).rows[0].missing) {
        await client.query(stripTransaction(readFileSync(AUDIT_PROPOSAL, 'utf8')));
      }
      if ((await client.query(`SELECT to_regprocedure('private_security.guard_founder_superadmin_active_role()') IS NULL AS missing`)).rows[0].missing) {
        await client.query(readFileSync(FOUNDER_PROPOSAL, 'utf8'));
      }
      if ((await client.query(`SELECT to_regprocedure('private_security.guard_profile_is_demo_marker()') IS NULL AS missing`)).rows[0].missing) {
        await client.query(stripTransaction(readFileSync(DEMO_MARKER_PROPOSAL, 'utf8')));
      }
      await client.query(stripTransaction(sql));

      const founder = await client.query<{ auth_user_id: string }>(
        `SELECT auth_user_id::text
         FROM public.profiles
         WHERE id = $1::uuid`,
        [FOUNDER_ID],
      );
      expect(founder.rows).toHaveLength(1);
      // 00321 only accepts is_demo inserts from the seed operator with no JWT
      // claims, so every demo fixture is created before a requester is set.
      const target = await insertDisposableProfile(client, {
        emailPrefix: 'delete-success',
        isDemo: true,
      });
      const otherTarget = await insertDisposableProfile(client, {
        emailPrefix: 'delete-token-mismatch',
        isDemo: true,
      });
      const ordinary = await insertDisposableProfile(client, {
        emailPrefix: 'delete-denied-caller',
        isDemo: true,
      });
      const expiring = await insertDisposableProfile(client, {
        emailPrefix: 'delete-expired',
        isDemo: true,
      });
      const stale = await insertDisposableProfile(client, {
        emailPrefix: 'delete-stale',
        isDemo: true,
      });
      const retained = await insertDisposableProfile(client, {
        emailPrefix: 'delete-retained-dependencies',
        isDemo: true,
      });
      const unknown = await insertDisposableProfile(client, {
        emailPrefix: 'delete-unknown-fk',
        isDemo: true,
      });
      await setRequester(client, founder.rows[0].auth_user_id);

      const preview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1::uuid) AS payload`,
        [target.profileId],
      );
      expect(preview.rows[0].payload.eligible).toBe(true);
      expect(preview.rows[0].payload.blockerCount).toBe(0);

      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, '', 'removed disposable QA fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_REASON_REQUIRED');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', '')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_OUTCOME_REQUIRED');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, 'wrong-token', 'approved QA cleanup', 'removed fixture')`,
        [target.profileId],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [otherTarget.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');

      await client.query('SAVEPOINT late_failure');
      await client.query(`
        CREATE FUNCTION pg_temp.fail_auth_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'EXPECTED_LATE_DELETE_FAILURE';
        END
        $$;
        CREATE TRIGGER zz_test_late_auth_delete
          BEFORE DELETE ON auth.users
          FOR EACH ROW
          WHEN (OLD.id = '${target.authId}'::uuid)
          EXECUTE FUNCTION pg_temp.fail_auth_delete();
      `);
      const lateFailure = await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      );
      expect(lateFailure).toContain('EXPECTED_LATE_DELETE_FAILURE');
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [target.profileId])).rows[0].n).toBe(1);
      await client.query('ROLLBACK TO SAVEPOINT late_failure');
      await client.query('RELEASE SAVEPOINT late_failure');

      const executed = await client.query<{ payload: any }>(
        `SELECT public.execute_demo_user_deletion($1, $2, $3, $4) AS payload`,
        [
          target.profileId,
          preview.rows[0].payload.confirmationToken,
          'approved disposable QA cleanup',
          'fixture identity removed; retained evidence preserved',
        ],
      );
      expect(executed.rows[0].payload.ok).toBe(true);
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [target.profileId])).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM auth.users WHERE id = $1`, [target.authId])).rows[0].n).toBe(0);
      expect((await client.query(
        `SELECT count(*)::int AS n
         FROM public.audit_actor_identities
         WHERE actor_id = $1 AND profile_id IS NULL AND profile_deleted_at IS NOT NULL`,
        [target.profileId],
      )).rows[0].n).toBe(1);
      expect((await client.query(
        `SELECT count(*)::int AS n
         FROM public.audit_events
         WHERE event_type = 'admin.demo_user_deleted' AND entity_id = $1`,
        [target.profileId],
      )).rows[0].n).toBe(1);

      await setRequester(client, ordinary.authId);
      expect(await captureError(
        client,
        `SELECT public.preview_demo_user_deletion($1)`,
        [FOUNDER_ID],
      )).toContain('DEMO_USER_DELETE_DENIED');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [founder.rows[0].auth_user_id]);
      expect(await captureError(
        client,
        `SELECT public.preview_demo_user_deletion($1)`,
        [ordinary.profileId],
      )).toContain('authenticated user context required');
      await setRequester(client, founder.rows[0].auth_user_id);

      const founderPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [FOUNDER_ID],
      );
      expect(founderPreview.rows[0].payload.eligible).toBe(false);
      expect(founderPreview.rows[0].payload.confirmationToken).toBeNull();
      expect(JSON.stringify(founderPreview.rows[0].payload.policyBlockers)).toContain('FOUNDER_IDENTITY_PROTECTED');
      if (founderPreview.rows[0].payload.effectiveSuperAdminCount === 1) {
        expect(JSON.stringify(founderPreview.rows[0].payload.policyBlockers)).toContain(
          'LAST_EFFECTIVE_SUPERADMIN_PROTECTED',
        );
      }

      const expiringPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [expiring.profileId],
      );
      await client.query(
        `UPDATE private_security.demo_user_deletion_previews
         SET created_at = clock_timestamp() - interval '20 minutes',
             expires_at = clock_timestamp() - interval '10 minutes'
         WHERE id = $1`,
        [expiringPreview.rows[0].payload.previewId],
      );
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [expiring.profileId, expiringPreview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_EXPIRED');

      const stalePreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [stale.profileId],
      );
      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
         VALUES ($1, 'PROPERTY_OWNER', $1)`,
        [stale.profileId],
      );
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [stale.profileId, stalePreview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_STALE_PREVIEW');

      await client.query(
        `INSERT INTO public.notifications (profile_id, channel, event_type) VALUES ($1, 'IN_APP', 'qa.fixture')`,
        [retained.profileId],
      );
      await client.query(
        `INSERT INTO public.buyer_addresses (profile_id, address_line1, city, state, pincode)
         VALUES ($1, 'Fixture line', 'Bengaluru', 'Karnataka', '560001')`,
        [retained.profileId],
      );
      await client.query(`INSERT INTO public.personal_subscriptions (profile_id) VALUES ($1)`, [retained.profileId]);
      const retainedPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [retained.profileId],
      );
      expect(retainedPreview.rows[0].payload.eligible).toBe(false);
      expect(retainedPreview.rows[0].payload.confirmationToken).toBeNull();
      const blocking = retainedPreview.rows[0].payload.dependencies.filter((d: any) => d.blocks);
      expect(blocking.map((d: any) => d.category).sort()).toEqual([
        'messaging_delivery',
        'organization_supplier',
        'procurement_finance_tax',
      ]);

      await client.query(`
        CREATE TABLE public.zz_unclassified_dependency (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          subject uuid REFERENCES public.profiles(id) ON DELETE RESTRICT
        )
      `);
      const unknownPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [unknown.profileId],
      );
      expect(unknownPreview.rows[0].payload.eligible).toBe(false);
      expect(JSON.stringify(unknownPreview.rows[0].payload.dependencies)).toContain('block_unknown_fk');
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

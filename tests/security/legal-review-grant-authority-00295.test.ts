/**
 * 00295 against disposable databases on local supabase_db_otp-clean.
 * Drops only disposable databases whose CREATE DATABASE succeeded.
 * Temporarily disables connections to the original database named postgres
 * and terminates sessions on that database, then restores the saved
 * datallowconn value. Does not connect to hosted Postgres and does not
 * enable enforcement.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { asLegalReviewer } from '../helpers/legal-evidence-fixture';

const HOST = '127.0.0.1';
const PORT = 54322;
const STAMP = `${Date.now().toString(36)}${randomUUID().slice(0, 8).replace(/-/g, '')}`;
const BASE = `otp_m295_base_${STAMP}`;
const EMPTY = `otp_m295_empty_${STAMP}`;
const LEGACY = `otp_m295_legacy_${STAMP}`;
const FRESH = `otp_m295_fresh_${STAMP}`;
const createdDatabases: string[] = [];

const MIGRATION = readFileSync(
  resolve('supabase/migrations/00295_legal_review_grant_authority_columns.sql'),
  'utf8',
);

const adminConfig = {
  host: HOST,
  port: PORT,
  database: 'template1',
  user: 'supabase_admin',
  password: 'postgres',
};

function dbConfig(database: string): typeof adminConfig {
  return { ...adminConfig, database };
}

type LegacySnapshot = {
  profile_id: string;
  can_register: boolean;
  can_decide: boolean;
  can_activate: boolean;
  granted_at: string;
  revoked_at: string | null;
};

let admin: Client;
let adminConnected = false;
let originalAllowConn: boolean | undefined;
let allowConnAltered = false;
let primaryFailure: unknown;
const pendingCleanupErrors: unknown[] = [];
const closedClients = new WeakSet<Client>();
let emptyDb: Client;
let legacyDb: Client;
let freshDb: Client;
let legacyBefore: LegacySnapshot;
let legacyProfileId = '';
let authorizerId = '';
let subjectId = '';
const counselRef = 'COUNSEL-RECORD-2026-014';
const subjectRef = 'BOARD-MINUTE-2026-088';
const revokeRef = 'COUNSEL-REVOKE-2026-015';

async function applyFile(client: Client, fileName: string): Promise<void> {
  const sql = readFileSync(resolve('supabase/migrations', fileName), 'utf8');
  try {
    await client.query(sql);
  } catch (error) {
    throw new Error(`applying ${fileName} failed: ${(error as Error).message}`, { cause: error });
  }
}

async function rejectMessage(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT otp_m295_probe');
  try {
    await client.query(sql, params);
    throw new Error(`expected rejection for ${sql}`);
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('expected rejection')) throw error;
    await client.query('ROLLBACK TO SAVEPOINT otp_m295_probe');
    await client.query('RELEASE SAVEPOINT otp_m295_probe');
    return message;
  }
}

async function insertAuthProfile(client: Client, fullName: string): Promise<string> {
  const id = randomUUID();
  const email = `m295-${id}@example.test`;
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
     VALUES ($1, $1, $2, $3, false, false)`,
    [id, email, fullName],
  );
  return id;
}

async function legacyRow(client: Client): Promise<LegacySnapshot & { can_authorize: boolean; external_record_ref: string | null }> {
  const result = await client.query(
    `SELECT profile_id::text,
            can_register, can_decide, can_activate, can_authorize,
            granted_at::text AS granted_at,
            revoked_at::text AS revoked_at,
            external_record_ref
     FROM public.legal_review_grants
     WHERE profile_id = $1`,
    [legacyProfileId],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0];
}

async function createTrackedDatabase(name: string, statement: string): Promise<void> {
  await admin.query(statement);
  createdDatabases.push(name);
}

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

function rememberFailure(error: unknown): void {
  if (primaryFailure === undefined) primaryFailure = error;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function bundleCleanupErrors(cleanupErrors: unknown[]): Error {
  const notes = cleanupErrors.map(toError);
  if (notes.length === 1) return notes[0];
  return new AggregateError(notes, 'cleanup and restore also failed');
}

function attachCleanupTo(failure: object, cleanupErrors: unknown[]): void {
  if (cleanupErrors.length === 0) return;
  const bundle = bundleCleanupErrors(cleanupErrors);
  let tail = failure as { cause?: unknown };
  const seen = new Set<object>([failure]);
  while (tail.cause != null && typeof tail.cause === 'object' && !seen.has(tail.cause)) {
    seen.add(tail.cause);
    tail = tail.cause as { cause?: unknown };
  }
  if (tail.cause == null) {
    tail.cause = bundle;
    return;
  }
  const host = failure as { cleanupErrors?: Error[] };
  host.cleanupErrors = [...(host.cleanupErrors ?? []), ...cleanupErrors.map(toError)];
}

function attachCleanupFailure(cleanupErrors: unknown[]): void {
  if (cleanupErrors.length === 0) return;
  if (primaryFailure != null && typeof primaryFailure === 'object') {
    attachCleanupTo(primaryFailure, cleanupErrors);
    return;
  }
  pendingCleanupErrors.push(...cleanupErrors);
}

function keepCleanupError(failure: unknown, cleanupError: unknown): unknown {
  if (failure === undefined) return cleanupError;
  if (failure !== null && typeof failure === 'object') {
    attachCleanupTo(failure, [cleanupError]);
    return failure;
  }
  pendingCleanupErrors.push(cleanupError);
  return failure;
}

async function cleanupCreatedDatabases(): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const client of [emptyDb, legacyDb, freshDb]) {
    if (!client || closedClients.has(client)) continue;
    try {
      await client.end();
      closedClients.add(client);
    } catch (error) {
      errors.push(error);
    }
  }
  if (!adminConnected) return errors;

  const createdAtCleanup = [...createdDatabases];
  for (const name of [...createdAtCleanup].reverse()) {
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [name],
      );
    } catch (error) {
      errors.push(error);
    }
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    await restoreAllowConn();
  } catch (error) {
    errors.push(error);
  }

  if (originalAllowConn !== undefined) {
    try {
      const check = createdAtCleanup.length === 0
        ? await admin.query(
          `SELECT datallowconn, false AS leftover
           FROM pg_database
           WHERE datname = 'postgres'`,
        )
        : await admin.query(
          `SELECT d.datallowconn,
                  EXISTS (
                    SELECT 1 FROM pg_database WHERE datname = ANY($1::name[])
                  ) AS leftover
           FROM pg_database d
           WHERE d.datname = 'postgres'`,
          [createdAtCleanup],
        );
      if (check.rows[0]?.datallowconn !== originalAllowConn || check.rows[0]?.leftover !== false) {
        throw new Error(`cleanup incomplete: ${JSON.stringify(check.rows[0])}`);
      }
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

async function cleanupWithoutReplacing(): Promise<void> {
  const cleanupErrors: unknown[] = pendingCleanupErrors.splice(0, pendingCleanupErrors.length);
  try {
    cleanupErrors.push(...await cleanupCreatedDatabases());
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError);
  }
  if (cleanupErrors.length === 0) return;
  if (primaryFailure !== undefined) {
    attachCleanupFailure(cleanupErrors);
    return;
  }
  throw bundleCleanupErrors(cleanupErrors);
}

beforeAll(async () => {
  try {
    admin = new Client(adminConfig);
    try {
      await admin.connect();
      adminConnected = true;
    } catch (error) {
      throw new Error(
        `local PostgreSQL at ${HOST}:${PORT} is required; this test does not skip. ${(error as Error).message}`,
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
      await createTrackedDatabase(
        BASE,
        `CREATE DATABASE ${BASE} TEMPLATE postgres OWNER postgres`,
      );
    } catch (error) {
      cloneError = error;
    } finally {
      try {
        await restoreAllowConn();
      } catch (restoreError) {
        cloneError = keepCleanupError(cloneError, restoreError);
      }
    }
    if (cloneError !== undefined) throw cloneError;

    const base = new Client(dbConfig(BASE));
    await base.connect();
    let baseSetupError: unknown;
    try {
      await applyFile(base, '00292_profile_delete_keeps_acceptance_archive.sql');
      await applyFile(base, '00293_legal_reviewer_must_be_the_session.sql');
      await applyFile(base, '00294_platform_admin_two_person_recovery.sql');
    } catch (error) {
      baseSetupError = error;
    } finally {
      try {
        await base.end();
      } catch (endError) {
        baseSetupError = keepCleanupError(baseSetupError, endError);
      }
    }
    if (baseSetupError !== undefined) throw baseSetupError;

    await createTrackedDatabase(EMPTY, `CREATE DATABASE ${EMPTY} TEMPLATE ${BASE} OWNER postgres`);
    await createTrackedDatabase(LEGACY, `CREATE DATABASE ${LEGACY} TEMPLATE ${BASE} OWNER postgres`);
    await createTrackedDatabase(FRESH, `CREATE DATABASE ${FRESH} OWNER postgres`);

    legacyDb = new Client(dbConfig(LEGACY));
    await legacyDb.connect();
    legacyProfileId = await insertAuthProfile(legacyDb, 'Legacy Reviewer');
    await legacyDb.query(
      `INSERT INTO public.legal_review_grants (
         profile_id, can_register, can_decide, can_activate, granted_at, revoked_at
       ) VALUES ($1, true, true, false, '2026-01-15 00:00:00+00', NULL)`,
      [legacyProfileId],
    );
    const before = await legacyDb.query<LegacySnapshot>(
      `SELECT profile_id::text, can_register, can_decide, can_activate,
              granted_at::text AS granted_at, revoked_at::text AS revoked_at
       FROM public.legal_review_grants
       WHERE profile_id = $1`,
      [legacyProfileId],
    );
    legacyBefore = before.rows[0];

    await applyFile(legacyDb, '00295_legal_review_grant_authority_columns.sql');
    await applyFile(legacyDb, '00295_legal_review_grant_authority_columns.sql');

    emptyDb = new Client(dbConfig(EMPTY));
    await emptyDb.connect();
    await applyFile(emptyDb, '00295_legal_review_grant_authority_columns.sql');
    await applyFile(emptyDb, '00295_legal_review_grant_authority_columns.sql');

    freshDb = new Client(dbConfig(FRESH));
    await freshDb.connect();
    await freshDb.query(`
      CREATE SCHEMA IF NOT EXISTS private;
      CREATE TABLE public.legal_review_grants (
        profile_id uuid PRIMARY KEY,
        can_register boolean NOT NULL DEFAULT false,
        can_decide boolean NOT NULL DEFAULT false,
        can_activate boolean NOT NULL DEFAULT false,
        can_authorize boolean NOT NULL DEFAULT false,
        granted_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        external_record_ref text NOT NULL CHECK (btrim(external_record_ref) <> ''),
        CHECK (can_register OR can_decide OR can_activate OR can_authorize)
      );
      INSERT INTO public.legal_review_grants (
        profile_id, can_register, can_decide, can_activate, can_authorize, external_record_ref
      ) VALUES ('11111111-1111-4111-8111-111111111111', true, false, false, true, 'FRESH-COUNSEL-001');
    `);
    await applyFile(freshDb, '00295_legal_review_grant_authority_columns.sql');
    await applyFile(freshDb, '00295_legal_review_grant_authority_columns.sql');
  } catch (error) {
    rememberFailure(error);
    try {
      await cleanupWithoutReplacing();
    } catch (cleanupError) {
      const errors = cleanupError instanceof AggregateError ? [...cleanupError.errors] : [cleanupError];
      attachCleanupFailure(errors);
    }
    throw error;
  }
}, 180_000);

afterEach((context) => {
  const result = context.task.result;
  if (result?.state === 'fail') {
    rememberFailure(result.errors?.[0] ?? new Error(context.task.name));
  }
});

afterAll(async () => {
  const trailing: unknown[] = [];
  try {
    await cleanupWithoutReplacing();
  } catch (error) {
    if (error instanceof AggregateError) trailing.push(...error.errors);
    else trailing.push(error);
  } finally {
    if (admin) {
      try {
        await admin.end();
      } catch (error) {
        trailing.push(error);
      }
      adminConnected = false;
    }
  }
  if (pendingCleanupErrors.length > 0) {
    trailing.push(...pendingCleanupErrors.splice(0, pendingCleanupErrors.length));
  }
  if (trailing.length === 0) return;
  if (primaryFailure !== undefined) {
    attachCleanupFailure(trailing);
    return;
  }
  throw bundleCleanupErrors(trailing);
}, 60_000);

describe('00295 legacy legal grant repair', () => {
  it('defines legacy null evidence without backfill, seeding, or enforcement', () => {
    expect(MIGRATION).toContain('NULL means "no external record"');
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.legal_review_grants/i);
    expect(MIGRATION).not.toMatch(/INSERT\s+INTO\s+public\.legal_review_grants/i);
    expect(MIGRATION).not.toMatch(/enforcement_enabled\s*=/);
    expect(MIGRATION).toContain('IS NOT DISTINCT FROM');
    expect(MIGRATION).toContain('otp.legal_grant_write');
    expect(MIGRATION).not.toContain('DISABLE TRIGGER');
    expect(MIGRATION).not.toContain('DROP TRIGGER');
  });

  it('migrates a legacy grant table that has zero rows', async () => {
    const count = await emptyDb.query(`SELECT count(*)::int AS n FROM public.legal_review_grants`);
    expect(count.rows[0].n).toBe(0);
    const columns = await emptyDb.query(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'legal_review_grants'
         AND column_name IN ('can_authorize', 'external_record_ref')
       ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      { column_name: 'can_authorize', is_nullable: 'NO', column_default: 'false' },
      { column_name: 'external_record_ref', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('keeps an existing active grant, its flags, and its identity', async () => {
    const row = await legacyRow(legacyDb);
    expect(row.profile_id).toBe(legacyBefore.profile_id);
    expect(row.can_register).toBe(legacyBefore.can_register);
    expect(row.can_decide).toBe(legacyBefore.can_decide);
    expect(row.can_activate).toBe(legacyBefore.can_activate);
    expect(row.granted_at).toBe(legacyBefore.granted_at);
    expect(row.revoked_at).toBe(legacyBefore.revoked_at);
    expect(row.can_authorize).toBe(false);
    const count = await legacyDb.query(`SELECT count(*)::int AS n FROM public.legal_review_grants`);
    expect(count.rows[0].n).toBe(1);
  });

  it('does not fabricate an external reference for a legacy grant', async () => {
    const row = await legacyRow(legacyDb);
    expect(row.external_record_ref).toBeNull();
    const filled = await legacyDb.query(
      `SELECT count(*)::int AS n
       FROM public.legal_review_grants
       WHERE external_record_ref IS NOT NULL`,
    );
    expect(filled.rows[0].n).toBe(0);
  });

  it('rejects a new grant that has no genuine external reference', async () => {
    authorizerId = await insertAuthProfile(emptyDb, 'Evidenced Authorizer');
    await emptyDb.query('BEGIN');
    try {
      for (const ref of [null, '', '   ']) {
        const message = await rejectMessage(
          emptyDb,
          `SELECT public.grant_legal_reviewer(NULL, $1, true, false, false, true, $2)`,
          [authorizerId, ref],
        );
        expect(message).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      }
      const direct = await rejectMessage(
        emptyDb,
        `INSERT INTO public.legal_review_grants (
           profile_id, can_register, can_decide, can_activate, can_authorize, external_record_ref
         ) VALUES ($1, false, false, false, true, NULL)`,
        [authorizerId],
      );
      expect(direct).toContain('legal_review_grants_authorize_needs_evidence');
      const blank = await rejectMessage(
        emptyDb,
        `INSERT INTO public.legal_review_grants (
           profile_id, can_register, can_decide, can_activate, can_authorize, external_record_ref
         ) VALUES ($1, true, false, false, false, '   ')`,
        [authorizerId],
      );
      expect(blank).toContain('legal_review_grants_external_record_ref_check');
      const stillEmpty = await emptyDb.query(`SELECT count(*)::int AS n FROM public.legal_review_grants`);
      expect(stillEmpty.rows[0].n).toBe(0);
    } finally {
      await emptyDb.query('ROLLBACK');
    }
  });

  it('does not let a legacy grant without evidence gain authorization', async () => {
    await legacyDb.query('BEGIN');
    try {
      await legacyDb.query(`SELECT private.assert_legal_review_grant($1, 'register')`, [legacyProfileId]);
      await legacyDb.query(`SELECT private.assert_legal_review_grant($1, 'decide')`, [legacyProfileId]);
      const activate = await rejectMessage(
        legacyDb,
        `SELECT private.assert_legal_review_grant($1, 'activate')`,
        [legacyProfileId],
      );
      expect(activate).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      const authorize = await rejectMessage(
        legacyDb,
        `SELECT private.assert_legal_review_grant($1, 'authorize')`,
        [legacyProfileId],
      );
      expect(authorize).toContain('LEGAL_REVIEW_UNAUTHORIZED');

      const rewrite = await rejectMessage(
        legacyDb,
        `UPDATE public.legal_review_grants
         SET can_authorize = true
         WHERE profile_id = $1`,
        [legacyProfileId],
      );
      expect(rewrite).toContain('LEGAL_GRANT_IMMUTABLE');

      const inventRef = await rejectMessage(
        legacyDb,
        `UPDATE public.legal_review_grants
         SET external_record_ref = 'FABRICATED-REF'
         WHERE profile_id = $1`,
        [legacyProfileId],
      );
      expect(inventRef).toContain('LEGAL_GRANT_IMMUTABLE');

      const selfGrant = await asLegalReviewer(legacyDb, legacyProfileId, () =>
        legacyDb.query(
          `SELECT public.grant_legal_reviewer(NULL, $1, true, true, true, true, $2)`,
          [legacyProfileId, counselRef],
        ),
      ).then(
        () => '',
        (error: Error) => error.message,
      );
      expect(selfGrant).toContain('LEGAL_REVIEW_UNAUTHORIZED');
    } finally {
      await legacyDb.query('ROLLBACK');
    }

    const row = await legacyRow(legacyDb);
    expect(row.can_authorize).toBe(false);
    expect(row.external_record_ref).toBeNull();
    expect(row.can_register).toBe(true);
    expect(row.can_activate).toBe(false);
  });

  it('keeps authorization for a grant that names a real external record', async () => {
    authorizerId = await insertAuthProfile(emptyDb, 'Evidenced Authorizer');
    subjectId = await insertAuthProfile(emptyDb, 'Evidenced Subject');
    await emptyDb.query(
      `SELECT public.grant_legal_reviewer(NULL, $1, true, false, false, true, $2)`,
      [authorizerId, `  ${counselRef}  `],
    );
    const stored = await emptyDb.query(
      `SELECT can_register, can_decide, can_activate, can_authorize, external_record_ref
       FROM public.legal_review_grants WHERE profile_id = $1`,
      [authorizerId],
    );
    expect(stored.rows[0]).toEqual({
      can_register: true,
      can_decide: false,
      can_activate: false,
      can_authorize: true,
      external_record_ref: counselRef,
    });

    await emptyDb.query('BEGIN');
    let committed = false;
    try {
      await emptyDb.query(`SELECT private.assert_legal_review_grant($1, 'authorize')`, [authorizerId]);
      await emptyDb.query(`SELECT private.assert_legal_review_grant($1, 'register')`, [authorizerId]);
      const decide = await rejectMessage(
        emptyDb,
        `SELECT private.assert_legal_review_grant($1, 'decide')`,
        [authorizerId],
      );
      expect(decide).toContain('LEGAL_REVIEW_UNAUTHORIZED');
      await asLegalReviewer(emptyDb, authorizerId, () =>
        emptyDb.query(
          `SELECT public.grant_legal_reviewer(NULL, $1, false, true, false, false, $2)`,
          [subjectId, subjectRef],
        ),
      );
      committed = true;
    } finally {
      await emptyDb.query(committed ? 'COMMIT' : 'ROLLBACK');
    }

    const subject = await emptyDb.query(
      `SELECT can_decide, can_authorize, external_record_ref, revoked_at
       FROM public.legal_review_grants WHERE profile_id = $1`,
      [subjectId],
    );
    expect(subject.rows[0]).toMatchObject({
      can_decide: true,
      can_authorize: false,
      external_record_ref: subjectRef,
      revoked_at: null,
    });
    let subjectAuthorize = '';
    try {
      await emptyDb.query(`SELECT private.assert_legal_review_grant($1, 'authorize')`, [subjectId]);
    } catch (error) {
      subjectAuthorize = (error as Error).message;
    }
    expect(subjectAuthorize).toContain('LEGAL_REVIEW_UNAUTHORIZED');
  });

  it('revokes through an audit row and refuses to rewrite grant history', async () => {
    await emptyDb.query('BEGIN');
    await legacyDb.query('BEGIN');
    let committed = false;
    try {
      const missing = await asLegalReviewer(legacyDb, legacyProfileId, () =>
        legacyDb.query(
          `SELECT public.revoke_legal_reviewer(NULL, $1, $2)`,
          [legacyProfileId, revokeRef],
        ),
      ).then(
        () => '',
        (error: Error) => error.message,
      );
      expect(missing).toContain('LEGAL_REVIEW_UNAUTHORIZED');

      await asLegalReviewer(emptyDb, authorizerId, () =>
        emptyDb.query(
          `SELECT public.revoke_legal_reviewer(NULL, $1, $2)`,
          [subjectId, revokeRef],
        ),
      );
      const revoked = await emptyDb.query(
        `SELECT can_register, can_decide, can_activate, can_authorize,
                external_record_ref, revoked_at IS NOT NULL AS revoked
         FROM public.legal_review_grants WHERE profile_id = $1`,
        [subjectId],
      );
      expect(revoked.rows[0]).toEqual({
        can_register: false,
        can_decide: true,
        can_activate: false,
        can_authorize: false,
        external_record_ref: subjectRef,
        revoked: true,
      });
      const audit = await emptyDb.query(
        `SELECT event_type, actor_id::text, entity_id, payload
         FROM public.audit_events
         WHERE event_type = 'legal.reviewer_revoked' AND entity_id = $1`,
        [subjectId],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].actor_id).toBe(authorizerId);
      expect(audit.rows[0].payload.external_record_ref).toBe(revokeRef);

      await emptyDb.query(`SELECT set_config('otp.legal_grant_write', 'on', true)`);
      const rewrite = await rejectMessage(
        emptyDb,
        `UPDATE public.legal_review_grants
         SET can_decide = false, external_record_ref = 'REPLACED'
         WHERE profile_id = $1`,
        [subjectId],
      );
      expect(rewrite).toContain('LEGAL_GRANT_IMMUTABLE');
      await emptyDb.query(`SELECT set_config('otp.legal_grant_write', 'on', true)`);
      const unrevoke = await rejectMessage(
        emptyDb,
        `UPDATE public.legal_review_grants SET revoked_at = NULL WHERE profile_id = $1`,
        [subjectId],
      );
      expect(unrevoke).toContain('LEGAL_GRANT_IMMUTABLE');
      const auditAfter = await emptyDb.query(
        `SELECT count(*)::int AS n FROM public.audit_events
         WHERE event_type = 'legal.reviewer_revoked' AND entity_id = $1`,
        [subjectId],
      );
      expect(auditAfter.rows[0].n).toBe(1);

      await legacyDb.query(`SELECT set_config('otp.legal_grant_write', 'on', true)`);
      const legacyBlocked = await rejectMessage(
        legacyDb,
        `UPDATE public.legal_review_grants
         SET can_authorize = true, revoked_at = clock_timestamp()
         WHERE profile_id = $1`,
        [legacyProfileId],
      );
      expect(legacyBlocked).toContain('LEGAL_GRANT_IMMUTABLE');
      await legacyDb.query(`SELECT set_config('otp.legal_grant_write', 'on', true)`);
      await legacyDb.query(
        `UPDATE public.legal_review_grants
         SET revoked_at = clock_timestamp()
         WHERE profile_id = $1`,
        [legacyProfileId],
      );
      const legacyRevoked = await legacyRow(legacyDb);
      expect(legacyRevoked.can_register).toBe(true);
      expect(legacyRevoked.can_decide).toBe(true);
      expect(legacyRevoked.can_activate).toBe(false);
      expect(legacyRevoked.can_authorize).toBe(false);
      expect(legacyRevoked.external_record_ref).toBeNull();
      expect(legacyRevoked.revoked_at).not.toBeNull();
      await legacyDb.query(`SELECT set_config('otp.legal_grant_write', 'on', true)`);
      const legacyUnrevoke = await rejectMessage(
        legacyDb,
        `UPDATE public.legal_review_grants SET revoked_at = NULL WHERE profile_id = $1`,
        [legacyProfileId],
      );
      expect(legacyUnrevoke).toContain('LEGAL_GRANT_IMMUTABLE');
      committed = true;
    } finally {
      await emptyDb.query(committed ? 'COMMIT' : 'ROLLBACK');
      await legacyDb.query(committed ? 'COMMIT' : 'ROLLBACK');
    }

    const trigger = await legacyDb.query(
      `SELECT tgenabled, pg_get_triggerdef(oid) AS def
       FROM pg_trigger
       WHERE tgrelid = 'public.legal_review_grants'::regclass
         AND tgname = 'legal_review_grants_guard'
         AND NOT tgisinternal`,
    );
    expect(trigger.rowCount).toBe(1);
    expect(trigger.rows[0].tgenabled).toBe('O');
    expect(trigger.rows[0].def).toContain('BEFORE DELETE OR UPDATE');
    const guard = await legacyDb.query(
      `SELECT pg_get_functiondef('private.guard_legal_review_grants()'::regprocedure) AS def`,
    );
    expect(guard.rows[0].def).toContain('IS NOT DISTINCT FROM');
    expect(guard.rows[0].def).toContain('otp.legal_grant_write');
    expect(guard.rows[0].def).toContain('LEGAL_GRANT_IMMUTABLE');
  });

  it('can be applied again without inventing evidence or restoring a revoked grant', async () => {
    await applyFile(emptyDb, '00295_legal_review_grant_authority_columns.sql');
    await applyFile(legacyDb, '00295_legal_review_grant_authority_columns.sql');
    await applyFile(freshDb, '00295_legal_review_grant_authority_columns.sql');

    const legacy = await legacyRow(legacyDb);
    expect(legacy.external_record_ref).toBeNull();
    expect(legacy.can_authorize).toBe(false);
    expect(legacy.can_register).toBe(true);
    expect(legacy.revoked_at).not.toBeNull();

    const subject = await emptyDb.query(
      `SELECT external_record_ref, can_decide, revoked_at IS NOT NULL AS revoked
       FROM public.legal_review_grants WHERE profile_id = $1`,
      [subjectId],
    );
    expect(subject.rows[0]).toEqual({
      external_record_ref: subjectRef,
      can_decide: true,
      revoked: true,
    });

    const fresh = await freshDb.query<{
      is_nullable: string;
      external_record_ref: string;
      can_authorize: boolean;
    }>(
      `SELECT c.is_nullable, g.external_record_ref, g.can_authorize
       FROM information_schema.columns c
       CROSS JOIN public.legal_review_grants g
       WHERE c.table_schema = 'public'
         AND c.table_name = 'legal_review_grants'
         AND c.column_name = 'external_record_ref'`,
    );
    expect(fresh.rows[0].is_nullable).toBe('NO');
    expect(fresh.rows[0].external_record_ref).toBe('FRESH-COUNSEL-001');
    expect(fresh.rows[0].can_authorize).toBe(true);
    await freshDb.query(
      `SELECT private.assert_legal_review_grant('11111111-1111-4111-8111-111111111111', 'authorize')`,
    );
  });
});

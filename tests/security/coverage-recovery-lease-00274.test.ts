/**
 * Coverage recovery lease and retry contract (migration 00274) plus the
 * repository-managed scheduler (audit findings DISC-1 / DISC-2).
 *
 * Database cases run in a rolled-back transaction against the local PostgreSQL
 * used for SQL parity (127.0.0.1:54322) and are skipped with a logged reason
 * when it is unavailable or lacks 00274. No provider is called.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('supplier coverage recovery scheduler (static)', () => {
  const workflow = readFileSync(resolve('.github/workflows/supplier-coverage-recovery.yml'), 'utf8');

  it('is scheduled and invokes the worker mode of the coverage function', () => {
    expect(workflow).toMatch(/cron:\s*'0 \*\/4 \* \* \*'/);
    expect(workflow).toContain('/functions/v1/location-pin-coverage');
    expect(workflow).toContain('"mode":"run_due_retries"');
  });

  it('authenticates with the service-role secret and never prints it', () => {
    expect(workflow).toContain('secrets.SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).not.toMatch(/echo[^\n]*\$\{?SUPABASE_SERVICE_ROLE_KEY/);
    expect(workflow).not.toMatch(/set -x|--verbose/);
  });

  it('fails the run on a non-2xx response and does not overlap itself', () => {
    expect(workflow).toMatch(/-lt 200 \] \|\| \[ "\$\{status\}" -ge 300/);
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('matches the worker contract implemented by the edge function', () => {
    const fn = readFileSync(resolve('supabase/functions/location-pin-coverage/index.ts'), 'utf8');
    expect(fn).toContain("body.mode === 'run_due_retries'");
    expect(fn).toContain('isLocationCoverageWorkerRequest(req)');
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
    `SELECT to_regprocedure('public.location_pin_coverage_list_due_retries(integer)') AS f,
            to_regclass('public.location_pin_coverage_generation') AS t`,
  );
  if (!installed.rows[0].f || !installed.rows[0].t) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00274 applied');
    await client.end();
    return null;
  }
  return client;
}

async function newScope(client: Client) {
  const scopeKey = `lease-test:${randomUUID()}`;
  await client.query(
    `INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
     VALUES ($1, 'Karnataka', 'Bengaluru', '560001', 'Lease Test > Scope')`,
    [scopeKey],
  );
  return scopeKey;
}

const acquire = async (client: Client, scopeKey: string, token: string) =>
  (await client.query(`SELECT public.location_pin_coverage_try_acquire_generation($1, $2::uuid, 15) AS s`, [scopeKey, token]))
    .rows[0].s as string;

const complete = async (client: Client, scopeKey: string, token: string, status: string, code: string | null) =>
  (await client.query(`SELECT public.location_pin_coverage_complete_generation($1, $2::uuid, $3, $4) AS ok`, [
    scopeKey, token, status, code,
  ])).rows[0].ok as boolean;

const dueKeys = async (client: Client) =>
  ((await client.query(`SELECT public.location_pin_coverage_list_due_retries(10) AS jobs`)).rows[0].jobs as Array<{ scope_key: string }>)
    .map((job) => job.scope_key);

const generation = async (client: Client, scopeKey: string) =>
  (await client.query(
    `SELECT status, retry_count, next_attempt_at IS NOT NULL AS has_next, error_code
     FROM public.location_pin_coverage_generation WHERE scope_key = $1`,
    [scopeKey],
  )).rows[0] as { status: string; retry_count: number; has_next: boolean; error_code: string | null };

describe('coverage recovery lease (database outcomes, rolled back)', () => {
  it('lets one worker hold a scope and rejects a second claim and a stale worker completion', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const scopeKey = await newScope(client);
      const workerA = randomUUID();
      const workerB = randomUUID();

      expect(await acquire(client, scopeKey, workerA)).toBe('acquired');
      expect(await acquire(client, scopeKey, workerB)).toBe('wait');
      expect(await dueKeys(client)).not.toContain(scopeKey);

      // Worker A dies; its lease goes stale and the scope becomes due again.
      await client.query(
        `UPDATE public.location_pin_coverage_generation SET started_at = now() - interval '20 minutes' WHERE scope_key = $1`,
        [scopeKey],
      );
      expect(await dueKeys(client)).toContain(scopeKey);
      expect(await acquire(client, scopeKey, workerB)).toBe('acquired');

      // The interrupted worker can no longer overwrite the newer attempt.
      expect(await complete(client, scopeKey, workerA, 'failed', 'PROVIDER_ERROR')).toBe(false);
      expect((await generation(client, scopeKey)).status).toBe('in_progress');
      expect(await complete(client, scopeKey, workerB, 'completed', null)).toBe(true);
      expect((await generation(client, scopeKey)).status).toBe('completed');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('backs off failed attempts, exhausts at the retry limit, and recovers only through the bounded manual retry', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const scopeKey = await newScope(client);
      expect(await acquire(client, scopeKey, randomUUID())).toBe('acquired');
      await client.query(`UPDATE public.location_pin_coverage_generation SET max_retries = 2 WHERE scope_key = $1`, [scopeKey]);

      const first = randomUUID();
      await client.query(`UPDATE public.location_pin_coverage_generation SET lock_token = $2 WHERE scope_key = $1`, [scopeKey, first]);
      expect(await complete(client, scopeKey, first, 'failed', 'PROVIDER_ERROR')).toBe(true);
      expect(await generation(client, scopeKey)).toMatchObject({ status: 'queued', retry_count: 1, has_next: true });
      // Backed off into the future: not yet due and not claimable.
      expect(await dueKeys(client)).not.toContain(scopeKey);
      expect(await acquire(client, scopeKey, randomUUID())).toBe('wait');

      await client.query(`UPDATE public.location_pin_coverage_generation SET next_attempt_at = now() - interval '1 minute' WHERE scope_key = $1`, [scopeKey]);
      expect(await dueKeys(client)).toContain(scopeKey);
      const second = randomUUID();
      expect(await acquire(client, scopeKey, second)).toBe('acquired');
      expect(await complete(client, scopeKey, second, 'failed', 'PROVIDER_ERROR')).toBe(true);

      // Retry limit reached: terminal, never listed for the worker and not claimable.
      expect(await generation(client, scopeKey)).toMatchObject({ status: 'exhausted', retry_count: 2, has_next: false });
      expect(await dueKeys(client)).not.toContain(scopeKey);
      expect(await acquire(client, scopeKey, randomUUID())).toBe('wait');

      const manual = await client.query(`SELECT public.location_pin_coverage_retry_generation($1) AS ok`, [scopeKey]);
      expect(manual.rows[0].ok).toBe(true);
      expect(await generation(client, scopeKey)).toMatchObject({ status: 'queued', retry_count: 0, error_code: 'MANUAL_RETRY' });
      const again = await client.query(`SELECT public.location_pin_coverage_retry_generation($1) AS ok`, [scopeKey]);
      expect(again.rows[0].ok).toBe(false);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps the worker, list and retry functions away from client roles', async () => {
    const client = await connect();
    if (!client) return;
    try {
      const privileges = await client.query(
        `SELECT p.proname,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN (
           'location_pin_coverage_list_due_retries', 'location_pin_coverage_retry_generation',
           'location_pin_coverage_list_recovery_jobs', 'location_pin_coverage_try_acquire_generation',
           'location_pin_coverage_complete_generation')`,
      );
      expect(privileges.rowCount).toBe(5);
      for (const row of privileges.rows) {
        expect({ fn: row.proname, anon: row.anon_exec, authenticated: row.auth_exec }).toEqual({
          fn: row.proname, anon: false, authenticated: false,
        });
      }
    } finally {
      await client.end();
    }
  });
});

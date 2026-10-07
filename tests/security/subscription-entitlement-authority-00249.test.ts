/**
 * Subscription entitlement authority, migration 00249.
 * Static checks always run. The database cases use local Postgres at
 * 127.0.0.1:54322 only. They install the guard inside a transaction and roll
 * it back. They do not apply 00248, do not insert schema_migrations, and do
 * not contact a hosted database.
 *
 * The 00233 body of process_subscription_payment is what the local database
 * still runs. 00249 does not replace that function. 00250 does, and it does
 * not grant a plan. The database case below calls the installed 00233 body
 * inside a transaction and rolls it back.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00249_freeze_organization_subscription_entitlement_fields.sql';
const ENT01 = '00248_yearly_plan_quarterly_rfq_bonus.sql';
const GUARD_00243 = '00243_p1_freeze_organization_classification_fields.sql';
const PAYMENT_00233 = '00233_platform_role_wallet_denial.sql';
const ENT01_SHA256 = 'a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f';
const GUARD_00243_SHA256 = '0e3c9f4986c158f72fd9f0088d2ea1622552b4ce487f2a4c023317f21f4c2ab0';
const PAYMENT_00233_SHA256 = '9c2c8ff73f554f185389808b2bd8332369a4ed6602b2ce1db9698b4714f32211';
const DENIED = /SUBSCRIPTION-ENTITLEMENT-IMMUTABLE/;
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;
let skipReason = 'local postgres 127.0.0.1:54322 is not reachable';

type Owner = {
  orgId: string;
  otherOrgId: string;
  authUserId: string;
  otherAuthUserId: string;
  name: string;
};

let owner: Owner | null = null;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
}

function readMigration(name: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
}

function executableGuardSql(): string {
  const lines = readMigration(FILE).split(/\r?\n/);
  const begin = lines.findIndex((line) => line.trim() === 'BEGIN;');
  const commit = lines.findIndex((line) => line.trim() === 'COMMIT;');
  return lines.filter((_, index) => index !== begin && index !== commit).join('\n');
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION ${name}(`;
  const start = sql.lastIndexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open + 2, close);
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
      await c.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [jwtRole]);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: jwtRole }),
      ]);
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

async function versions(c: Client): Promise<string[]> {
  const result = await c.query(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  );
  return result.rows.map((row) => String(row.version));
}

async function withGuard(fn: (c: Client) => Promise<void>): Promise<void> {
  if (!dbUp || !owner) return;
  const c = new Client(LOCAL_PG);
  await c.connect();
  const before = await versions(c);
  let fnError: unknown;
  let leaked = '';
  try {
    await c.query('BEGIN');
    await c.query(executableGuardSql());
    try {
      await fn(c);
    } catch (error) {
      fnError = error;
    }
  } finally {
    try {
      await c.query('ROLLBACK');
    } catch (error) {
      leaked = `rollback failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
      const after = await versions(c);
      const trigger = await c.query(
        `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_aa_guard_org_subscription_entitlement_fields'`,
      );
      if (after.join(',') !== before.join(',')) leaked = 'schema_migrations changed';
      if ((trigger.rowCount ?? 0) > 0) leaked = 'subscription guard trigger remained installed';
      if (after.includes('00248') && !before.includes('00248')) leaked = '00248 was applied';
    } catch (error) {
      leaked = leaked || (error instanceof Error ? error.message : String(error));
    }
    await c.end();
  }
  if (leaked) throw new Error(leaked);
  if (fnError) throw fnError;
}

describe('subscription entitlement authority 00249', () => {
  const files = migrationFiles();
  const sql = readMigration(FILE);
  const code = stripComments(sql);
  const body = functionBody(code, 'private.guard_org_subscription_entitlement_fields');

  beforeAll(async () => {
    if (LOCAL_PG.host !== '127.0.0.1' || LOCAL_PG.port !== 54322) {
      skipReason = 'refusing non-local postgres config';
      return;
    }
    const c = new Client(LOCAL_PG);
    try {
      await c.connect();
      const addr = await c.query(`SELECT inet_server_addr()::text AS addr`);
      const host = String(addr.rows[0]?.addr ?? '');
      if (host && !host.startsWith('127.') && host !== '::1' && !host.includes('172.') && !host.includes('192.168.')) {
        skipReason = 'refusing non-local postgres address';
        return;
      }
      const found = await c.query<{
        org_id: string;
        auth_user_id: string;
        name: string;
      }>(`
        SELECT o.id AS org_id, p.auth_user_id::text AS auth_user_id, o.name
        FROM public.organizations o
        JOIN public.organization_members om ON om.organization_id = o.id
        JOIN public.profiles p ON p.id = om.profile_id
        WHERE om.role = 'OWNER'
          AND p.auth_user_id IS NOT NULL
          AND p.is_platform_admin = false
          AND upper(btrim(COALESCE(o.subscription_plan, ''))) = 'MONTHLY'
        ORDER BY o.id
        LIMIT 2
      `);
      if (found.rows.length < 2) {
        skipReason = 'local postgres has fewer than two ordinary monthly owners';
        return;
      }
      owner = {
        orgId: found.rows[0].org_id,
        authUserId: found.rows[0].auth_user_id,
        name: found.rows[0].name,
        otherOrgId: found.rows[1].org_id,
        otherAuthUserId: found.rows[1].auth_user_id,
      };
      dbUp = true;
    } catch {
      dbUp = false;
    } finally {
      try {
        await c.end();
      } catch {
        /* connection never opened */
      }
    }
  });

  it('is 00249, leaves 00248 and 00243 byte-for-byte, and does not edit the payment function', () => {
    const index = files.indexOf(FILE);
    expect(files[index + 1]).toBe('00250_financial_authority_client_grant_boundary.sql');
    expect(index).toBe(files.length - 2);
    expect(files[index - 1]).toBe(ENT01);
    files.forEach((file, i) => expect(file.slice(0, 5), file).toBe(String(i + 1).padStart(5, '0')));
    expect(sha256(resolve(MIGRATIONS_DIR, ENT01))).toBe(ENT01_SHA256);
    expect(sha256(resolve(MIGRATIONS_DIR, GUARD_00243))).toBe(GUARD_00243_SHA256);
    expect(sha256(resolve(MIGRATIONS_DIR, PAYMENT_00233))).toBe(PAYMENT_00233_SHA256);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_subscription_payment/i);
    expect(code).not.toMatch(/enforce_pilot_rfq_allowance|razorpay|stripe|hmac/i);
    expect(code).not.toMatch(/schema_migrations/i);
  });

  it('freezes the three columns for anon and authenticated and preserves other roles', () => {
    expect(code).not.toMatch(/SECURITY\s+DEFINER/);
    expect(code).toContain('SET search_path = public, private, pg_temp');
    expect(body).toContain("IF current_user NOT IN ('anon', 'authenticated') THEN");
    expect(body).toContain('NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan');
    expect(body).toContain('NEW.subscription_status IS DISTINCT FROM OLD.subscription_status');
    expect(body).toContain('NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at');
    expect(body).toContain("upper(btrim(COALESCE(NEW.subscription_plan, ''))) = 'YEARLY'");
    expect(body).toContain("ERRCODE = '42501'");
    expect(body).toContain('SUBSCRIPTION-ENTITLEMENT-IMMUTABLE');
    expect(code).toContain('REVOKE ALL ON FUNCTION private.guard_org_subscription_entitlement_fields() FROM PUBLIC');
    expect(code).toContain(
      'GRANT EXECUTE ON FUNCTION private.guard_org_subscription_entitlement_fields() TO anon, authenticated, service_role',
    );
    expect(code).toMatch(
      /CREATE TRIGGER trg_aa_guard_org_subscription_entitlement_fields\s+BEFORE INSERT OR UPDATE OF subscription_plan, subscription_status, subscription_expires_at\s+ON public\.organizations/s,
    );
    expect(code).not.toMatch(/\b(is_platform_admin|auth\.uid|request\.jwt)\b/);
  });

  it('leaves the 00233 writer in place and records 00250 as the non-granting body', () => {
    const paymentFiles = files.filter((file) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_subscription_payment\s*\(/.test(readMigration(file)),
    );
    expect(paymentFiles.at(-2)).toBe(PAYMENT_00233);
    expect(paymentFiles.at(-1)).toBe('00250_financial_authority_client_grant_boundary.sql');
    const previousBody = functionBody(stripComments(readMigration(PAYMENT_00233)), 'public.process_subscription_payment');
    expect(previousBody).toContain('subscription_plan = v_cycle_upper');
    const paymentBody = functionBody(
      stripComments(readMigration('00250_financial_authority_client_grant_boundary.sql')),
      'public.process_subscription_payment',
    );
    expect(paymentBody).not.toContain('subscription_plan = v_cycle_upper');
    expect(paymentBody).not.toContain('subscription_expires_at = v_new_expires');
    expect(paymentBody).toContain("'entitlement_granted', false");
    expect(paymentBody).toContain('PLATFORM_WALLET_DENIED');
    const later = files.slice(files.indexOf(PAYMENT_00233) + 1);
    const revokedFromAuthenticated = later.some((file) =>
      /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.process_subscription_payment\b[^;]*\bauthenticated\b/i.test(
        stripComments(readMigration(file)),
      ),
    );
    expect(revokedFromAuthenticated).toBe(false);
  });

  it('skips database cases only when local postgres is unavailable', () => {
    if (!dbUp || !owner) {
      expect(skipReason.length).toBeGreaterThan(0);
      return;
    }
    expect(dbUp).toBe(true);
  });

  it('rejects an owner update of each entitlement column and of all three together', async () => {
    await withGuard(async (c) => {
      const id = owner!.orgId;
      const uid = owner!.authUserId;
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`UPDATE public.organizations SET subscription_plan = 'YEARLY' WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(DENIED);
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`UPDATE public.organizations SET subscription_plan = 'yearly' WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(DENIED);
      await c.query(`UPDATE public.organizations SET subscription_status = 'EXPIRED' WHERE id = $1`, [id]);
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`UPDATE public.organizations SET subscription_status = 'ACTIVE' WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(DENIED);
      const status = await c.query(`SELECT subscription_status FROM public.organizations WHERE id = $1`, [id]);
      expect(status.rows[0].subscription_status).toBe('EXPIRED');
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(
            `UPDATE public.organizations SET subscription_expires_at = now() + interval '400 days' WHERE id = $1`,
            [id],
          ),
        ),
      ).rejects.toThrow(DENIED);
      const expiry = await c.query(
        `SELECT subscription_expires_at FROM public.organizations WHERE id = $1`,
        [id],
      );
      expect(expiry.rows[0].subscription_expires_at).not.toBeNull();
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`UPDATE public.organizations SET subscription_expires_at = NULL WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(DENIED);
      const admin = await c.query<{ auth_user_id: string }>(
        `SELECT auth_user_id::text AS auth_user_id
         FROM public.profiles
         WHERE is_platform_admin = true AND auth_user_id IS NOT NULL
         LIMIT 1`,
      );
      if (admin.rows.length === 1) {
        await expect(
          asRole(c, 'authenticated', admin.rows[0].auth_user_id, (q) =>
            q(`UPDATE public.organizations SET subscription_plan = 'YEARLY' WHERE id = $1`, [id]),
          ),
        ).rejects.toThrow(DENIED);
      }
      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(
            `UPDATE public.organizations
             SET name = name || ' hacked',
                 subscription_plan = 'YEARLY',
                 subscription_status = 'ACTIVE',
                 subscription_expires_at = now() + interval '400 days'
             WHERE id = $1`,
            [id],
          ),
        ),
      ).rejects.toThrow(DENIED);
      const row = await c.query(
        `SELECT name, subscription_plan FROM public.organizations WHERE id = $1`,
        [id],
      );
      expect(row.rows[0].name).toBe(owner!.name);
      expect(row.rows[0].subscription_plan).toBe('MONTHLY');
    });
  });

  it('rejects a member, another organisation, anon, and a client insert of YEARLY', async () => {
    await withGuard(async (c) => {
      const id = owner!.orgId;
      const member = await c.query<{ auth_user_id: string }>(`
        SELECT p.auth_user_id::text AS auth_user_id
        FROM public.profiles p
        WHERE p.auth_user_id IS NOT NULL
          AND p.is_platform_admin = false
          AND NOT EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.profile_id = p.id AND om.organization_id = $1
          )
        LIMIT 1
      `, [id]);
      expect(member.rows.length).toBe(1);
      await c.query(
        `INSERT INTO public.organization_members (organization_id, profile_id, role)
         SELECT $1, p.id, 'MANAGER'
         FROM public.profiles p
         WHERE p.auth_user_id = $2
         ON CONFLICT (organization_id, profile_id) DO NOTHING`,
        [id, member.rows[0].auth_user_id],
      );
      const memberUpdate = await asRole(c, 'authenticated', member.rows[0].auth_user_id, (q) =>
        q(
          `UPDATE public.organizations SET subscription_plan = 'YEARLY' WHERE id = $1 RETURNING id`,
          [id],
        ),
      );
      expect(memberUpdate.rowCount).toBe(0);
      const other = await asRole(c, 'authenticated', owner!.otherAuthUserId, (q) =>
        q(
          `UPDATE public.organizations SET subscription_plan = 'YEARLY', subscription_status = 'ACTIVE', subscription_expires_at = now() + interval '400 days' WHERE id = $1 RETURNING id`,
          [id],
        ),
      );
      expect(other.rowCount).toBe(0);
      const anon = await asRole(c, 'anon', null, (q) =>
        q(`UPDATE public.organizations SET subscription_plan = 'YEARLY' WHERE id = $1 RETURNING id`, [id]),
      );
      expect(anon.rowCount).toBe(0);
      await expect(
        asRole(c, 'authenticated', owner!.authUserId, (q) =>
          q(
            `INSERT INTO public.organizations (name, org_type, subscription_plan, subscription_status, subscription_expires_at)
             VALUES ('Yearly Hack', 'INDIVIDUAL', 'yearly', 'ACTIVE', now() + interval '400 days')`,
          ),
        ),
      ).rejects.toThrow(DENIED);
      const plan = await c.query(`SELECT subscription_plan FROM public.organizations WHERE id = $1`, [id]);
      expect(plan.rows[0].subscription_plan).toBe('MONTHLY');
    });
  });

  it('still allows an owner to rename the organisation and to change a non-entitlement column', async () => {
    await withGuard(async (c) => {
      const renamed = await asRole(c, 'authenticated', owner!.authUserId, async (q) => {
        await q(
          `UPDATE public.organizations
           SET name = $2, subscription_plan = 'MONTHLY', subscription_tier = 'TIER_2_ENTERPRISE'
           WHERE id = $1`,
          [owner!.orgId, `${owner!.name} renamed`],
        );
        const row = await q(
          `SELECT name, subscription_plan, subscription_tier FROM public.organizations WHERE id = $1`,
          [owner!.orgId],
        );
        return row.rows[0] as { name: string; subscription_plan: string; subscription_tier: string };
      });
      expect(renamed.name).toBe(`${owner!.name} renamed`);
      expect(renamed.subscription_plan).toBe('MONTHLY');
      expect(renamed.subscription_tier).toBe('TIER_2_ENTERPRISE');
    });
  });

  it('still allows service_role and a funded wallet debit to write the columns', async () => {
    await withGuard(async (c) => {
      const id = owner!.orgId;
      const written = await asRole(c, 'service_role', null, async (q) => {
        const row = await q(
          `UPDATE public.organizations
           SET subscription_plan = 'YEARLY', subscription_status = 'ACTIVE', subscription_expires_at = now() + interval '365 days'
           WHERE id = $1
           RETURNING subscription_plan`,
          [id],
        );
        return row.rows[0] as { subscription_plan: string };
      });
      expect(written.subscription_plan).toBe('YEARLY');

      const price = await c.query(
        `SELECT private.subscription_wallet_credit_inr('INDIVIDUAL', 'YEARLY') AS amount`,
      );
      const amount = price.rows[0].amount;
      await c.query(
        `INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (organization_id) DO UPDATE SET balance_credits = EXCLUDED.balance_credits`,
        [id, amount],
      );
      const funded = await asRole(c, 'authenticated', owner!.authUserId, async (q) => {
        const call = await q(
          `SELECT public.apply_wallet_credits_to_subscription_atomic($1, 'INDIVIDUAL', 'YEARLY', $2, $3) AS result`,
          [id, amount, `entauth-${id}`],
        );
        const row = await q(
          `SELECT o.subscription_plan, w.balance_credits
           FROM public.organizations o
           JOIN public.organization_wallets w ON w.organization_id = o.id
           WHERE o.id = $1`,
          [id],
        );
        return {
          result: call.rows[0].result as { ok?: boolean },
          plan: String(row.rows[0].subscription_plan),
          balance: Number(row.rows[0].balance_credits),
        };
      });
      expect(funded.result.ok).toBe(true);
      expect(funded.plan).toBe('YEARLY');
      expect(funded.balance).toBe(0);
    });
  });

  it('does not let an ordinary member mint wallet balance', async () => {
    await withGuard(async (c) => {
      const id = owner!.orgId;
      await expect(
        asRole(c, 'authenticated', owner!.authUserId, (q) =>
          q(
            `INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
             VALUES ($1, 100000, 'ACTIVE')
             ON CONFLICT (organization_id) DO UPDATE SET balance_credits = 100000`,
            [id],
          ),
        ),
      ).rejects.toThrow(/row-level security|PLATFORM_WALLET_DENIED|permission denied/i);
      const price = await c.query(
        `SELECT private.subscription_wallet_credit_inr('INDIVIDUAL', 'YEARLY') AS amount`,
      );
      await c.query(
        `INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
         VALUES ($1, 0, 'ACTIVE')
         ON CONFLICT (organization_id) DO UPDATE SET balance_credits = 0`,
        [id],
      );
      await expect(
        asRole(c, 'authenticated', owner!.authUserId, (q) =>
          q(
            `SELECT public.apply_wallet_credits_to_subscription_atomic($1, 'INDIVIDUAL', 'YEARLY', $2, $3)`,
            [id, price.rows[0].amount, `entauth-empty-${id}`],
          ),
        ),
      ).rejects.toThrow(/Insufficient wallet balance/);
      const plan = await c.query(`SELECT subscription_plan FROM public.organizations WHERE id = $1`, [id]);
      expect(plan.rows[0].subscription_plan).toBe('MONTHLY');
    });
  });

  it('observes that the installed local payment function still grants until 00250 is applied', async () => {
    await withGuard(async (c) => {
      const id = owner!.orgId;
      const price = await c.query(
        `SELECT private.subscription_wallet_credit_inr('INDIVIDUAL', 'YEARLY') AS amount`,
      );
      const amount = price.rows[0].amount;
      const observed = await asRole(c, 'authenticated', owner!.authUserId, async (q) => {
        await c.query('SAVEPOINT wrong_amount');
        let wrong: Error | null = null;
        try {
          await q(
            `SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', 1, 'UPI-TXN-FAKE-WRONG', 'pay@otp') AS result`,
            [id],
          );
        } catch (error) {
          wrong = error instanceof Error ? error : new Error(String(error));
        }
        await c.query('ROLLBACK TO SAVEPOINT wrong_amount');
        const first = await q(
          `SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', $2, 'UPI-TXN-FAKE-ENTAUTH', 'pay@otp') AS result`,
          [id, amount],
        );
        const mid = await q(
          `SELECT subscription_plan, subscription_status, subscription_expires_at
           FROM public.organizations WHERE id = $1`,
          [id],
        );
        const replay = await q(
          `SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', $2, 'UPI-TXN-FAKE-ENTAUTH', 'pay@otp') AS result`,
          [id, amount],
        );
        const end = await q(
          `SELECT subscription_expires_at FROM public.organizations WHERE id = $1`,
          [id],
        );
        return {
          wrong,
          first: first.rows[0].result as { ok?: boolean },
          replay: replay.rows[0].result as { ok?: boolean },
          plan: String(mid.rows[0].subscription_plan),
          status: String(mid.rows[0].subscription_status),
          firstExpiry: String(mid.rows[0].subscription_expires_at),
          replayExpiry: String(end.rows[0].subscription_expires_at),
        };
      });
      expect(observed.wrong).toBeInstanceOf(Error);
      expect(String((observed.wrong as Error).message)).toMatch(/catalog price/i);
      expect(observed.first.ok).toBe(true);
      expect(observed.plan).toBe('YEARLY');
      expect(observed.status).toBe('ACTIVE');
      expect(observed.replay.ok).toBe(true);
      expect(new Date(observed.replayExpiry).getTime()).toBeGreaterThan(new Date(observed.firstExpiry).getTime());
    });
  });
});

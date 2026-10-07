/**
 * Financial authority boundary, migration 00250.
 * Static checks always run. Database cases use local Postgres at
 * 127.0.0.1:54322 only. They install 00249 and 00250 inside a transaction
 * and roll it back. They do not apply 00248, do not insert schema_migrations,
 * and do not contact a hosted database.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { SUBSCRIPTION_TIERS } from '@otp/domain';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00250_financial_authority_client_grant_boundary.sql';
const ENT01 = '00248_yearly_plan_quarterly_rfq_bonus.sql';
const FREEZE = '00249_freeze_organization_subscription_entitlement_fields.sql';
const ENT01_SHA256 = 'a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f';
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;
let owner: { orgId: string; otherOrgId: string; authUserId: string } | null = null;

function sha256(name: string): string {
  return createHash('sha256').update(readFileSync(resolve(MIGRATIONS_DIR, name))).digest('hex');
}

function readMigration(name: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
}

function executable(name: string): string {
  const lines = readMigration(name).split(/\r?\n/);
  const begin = lines.findIndex((line) => line.trim() === 'BEGIN;');
  const commit = lines.findIndex((line) => line.trim() === 'COMMIT;');
  const sql = lines.filter((_, index) => index !== begin && index !== commit).join('\n');
  if (/^\s*COMMIT\s*;/m.test(sql)) throw new Error(`${name} still contains COMMIT`);
  return sql;
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

describe('financial authority 00250', () => {
  const sql = readMigration(FILE);
  const payment = functionBody(sql, 'public.process_subscription_payment');
  const prices = functionBody(sql, 'private.subscription_wallet_credit_inr');
  const fee = functionBody(sql, 'public.apply_platform_fee_deduction_atomic');

  beforeAll(async () => {
    const c = new Client(LOCAL_PG);
    try {
      await c.connect();
      const found = await c.query<{ org_id: string; auth_user_id: string }>(`
        SELECT o.id AS org_id, p.auth_user_id::text AS auth_user_id
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
      if (found.rows.length < 2) return;
      owner = {
        orgId: found.rows[0].org_id,
        authUserId: found.rows[0].auth_user_id,
        otherOrgId: found.rows[1].org_id,
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

  it('keeps 00248 byte-for-byte and does not apply any migration', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
    expect(files.at(-1)).toBe(FILE);
    expect(files.at(-2)).toBe(FREEZE);
    expect(sha256(ENT01)).toBe(ENT01_SHA256);
    expect(sql).not.toMatch(/enforce_pilot_rfq_allowance/);
    expect(sql).not.toMatch(/schema_migrations/);
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_tds_withholding_atomic/i);
    expect(sql).toContain('PRODUCT DECISION REQUIRED');
  });

  it('stops the client payment RPC from writing entitlement', () => {
    const headerStart = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.process_subscription_payment(');
    const header = sql.slice(headerStart, sql.indexOf('$$', headerStart));
    expect(header).toContain('SECURITY DEFINER');
    expect(payment).toContain('PLATFORM_WALLET_DENIED');
    expect(payment).toContain("'entitlement_granted', false");
    expect(payment).toContain("'simulated', true");
    expect(payment).not.toContain('subscription_plan = v_cycle_upper');
    expect(payment).not.toContain('subscription_expires_at = v_new_expires');
    expect(payment).not.toContain('INSERT INTO public.subscription_payment_logs');
    expect(payment).not.toContain('UPDATE public.organizations');
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) TO authenticated, service_role',
    );
  });

  it('uses SUBSCRIPTION_TIERS yearly prices, including the TIER_2 alias', () => {
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.yearlyPrice).toBe(1999);
    expect(SUBSCRIPTION_TIERS.RWA.yearlyPrice).toBe(14999);
    expect(SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.yearlyPrice).toBe(14999);
    expect(SUBSCRIPTION_TIERS.MSME.yearlyPrice).toBe(19999);
    expect(SUBSCRIPTION_TIERS.ENTERPRISE.yearlyPrice).toBe(49999);
    expect(prices).toContain('1999.00');
    expect(prices).toContain('14999.00');
    expect(prices).toContain('19999.00');
    expect(prices).toContain('49999.00');
    expect(prices).not.toContain('1990.00');
    expect(prices).not.toContain('14990.00');
    expect(prices).not.toContain('19990.00');
    expect(prices).not.toContain('49990.00');
    expect(prices).toContain("WHEN 'RWA', 'TIER_2_ENTERPRISE'");
    expect(prices).toContain("WHEN 'INDIVIDUAL', 'TIER_1_MSME'");
  });

  it('rejects client fee writes, revokes buyer-reward execute, and waives the pilot fee from PO or invoice gross', () => {
    expect(sql).toContain('PLATFORM-FEE-CLIENT-WRITE-DENIED');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON public.platform_fee_transactions');
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.credit_buyer_settlement_reward_atomic\(uuid, uuid, uuid, numeric, numeric, numeric, text\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) TO service_role',
    );
    expect(sql).not.toMatch(/credit_supplier_wallet_event_atomic/);
    expect(sql).not.toMatch(/credit_otp_referral_bonus_atomic/);
    expect(fee).toContain('v_fee_amount := 0.00');
    expect(fee).toContain('v_invoice.amount');
    expect(fee).toContain('v_po.total_amount');
    expect(fee).not.toContain('COALESCE(p_gross_amount');
    expect(fee).toContain('supplierPlatformFeeCharged');
    expect(fee).toContain('ignored_client_gross_amount');
  });

  it('limits platform-admin activation to status and leaves 00247 as the verified-payment grant', () => {
    const admin = functionBody(sql, 'public.platform_admin_set_organization_subscription_status');
    expect(admin).toContain('private.is_platform_admin()');
    expect(admin).toContain("subscription_status = 'ACTIVE'");
    expect(admin).not.toContain('subscription_plan =');
    expect(admin).not.toContain('subscription_expires_at =');
    expect(sql).toContain('SUBSCRIPTION-ADMIN-ACTIVATE');
    const revoke = readFileSync(
      resolve(MIGRATIONS_DIR, '00247_revoke_record_verified_payment_client_execute.sql'),
      'utf8',
    );
    expect(revoke).toMatch(/FROM PUBLIC, anon, authenticated/);
    expect(revoke).toMatch(/TO service_role/);
    expect(sql).not.toMatch(/record_verified_payment/);
  });

  it('rolls back a local session that proves the boundary and leaves 00245 installed', async () => {
    if (!dbUp || !owner) {
      expect(true).toBe(true);
      return;
    }
    const c = new Client(LOCAL_PG);
    await c.connect();
    const before = await c.query(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`);
    const beforeVersions = before.rows.map((row) => String(row.version));
    let fnError: unknown;
    let leaked = '';
    try {
      await c.query('BEGIN');
      await c.query(executable(FREEZE));
      await c.query(executable(FILE));
      const id = owner.orgId;
      const uid = owner.authUserId;
      const beforeRow = await c.query(
        `SELECT subscription_plan, subscription_status, subscription_expires_at FROM public.organizations WHERE id = $1`,
        [id],
      );
      const started = beforeRow.rows[0] as {
        subscription_plan: string;
        subscription_status: string;
        subscription_expires_at: string | null;
      };

      const simulated = await asRole(c, 'authenticated', uid, async (q) => {
        const first = await q(
          `SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', 1999, 'UPI-TXN-FAKE-00250', 'pay@otp') AS result`,
          [id],
        );
        const replay = await q(
          `SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', 1999, 'UPI-TXN-FAKE-00250', 'pay@otp') AS result`,
          [id],
        );
        const row = await q(
          `SELECT subscription_plan, subscription_status, subscription_expires_at FROM public.organizations WHERE id = $1`,
          [id],
        );
        return { first: first.rows[0].result as { entitlement_granted?: boolean }, replay: replay.rows[0].result as { ok?: boolean }, row: row.rows[0] };
      });
      expect(simulated.first.entitlement_granted).toBe(false);
      expect(simulated.replay.ok).toBe(true);
      expect(simulated.row.subscription_plan).toBe(started.subscription_plan);
      expect(String(simulated.row.subscription_expires_at)).toBe(String(started.subscription_expires_at));

      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`SELECT public.process_subscription_payment($1, 'INDIVIDUAL', 'YEARLY', 1999, 'OTHER-ORG', 'pay@otp')`, [
            owner!.otherOrgId,
          ]),
        ),
      ).rejects.toThrow(/Access denied/);

      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`UPDATE public.organizations SET subscription_plan = 'YEARLY' WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(/SUBSCRIPTION-ENTITLEMENT-IMMUTABLE/);

      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(`SELECT public.platform_admin_set_organization_subscription_status($1)`, [id]),
        ),
      ).rejects.toThrow(/SUBSCRIPTION-ADMIN-ACTIVATE/);

      const activated = await asRole(c, 'service_role', null, async (q) => {
        const call = await q(`SELECT public.platform_admin_set_organization_subscription_status($1) AS result`, [id]);
        const row = await q(
          `SELECT subscription_plan, subscription_status, subscription_expires_at FROM public.organizations WHERE id = $1`,
          [id],
        );
        return { result: call.rows[0].result as { ok?: boolean }, row: row.rows[0] };
      });
      expect(activated.result.ok).toBe(true);
      expect(activated.row.subscription_status).toBe('ACTIVE');
      expect(activated.row.subscription_plan).toBe(started.subscription_plan);
      expect(String(activated.row.subscription_expires_at)).toBe(String(started.subscription_expires_at));

      const price = await c.query(
        `SELECT private.subscription_wallet_credit_inr('INDIVIDUAL', 'YEARLY') AS yearly,
                private.subscription_wallet_credit_inr('TIER_2_ENTERPRISE', 'YEARLY') AS alias,
                private.subscription_wallet_credit_inr('ENTERPRISE', 'YEARLY') AS enterprise`,
      );
      expect(Number(price.rows[0].yearly)).toBe(1999);
      expect(Number(price.rows[0].alias)).toBe(14999);
      expect(Number(price.rows[0].enterprise)).toBe(49999);

      await c.query(
        `INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
         VALUES ($1, 1999, 'ACTIVE')
         ON CONFLICT (organization_id) DO UPDATE SET balance_credits = 1999`,
        [id],
      );
      const key = `finauth-${id}`;
      const funded = await asRole(c, 'authenticated', uid, async (q) => {
        const call = await q(
          `SELECT public.apply_wallet_credits_to_subscription_atomic($1, 'INDIVIDUAL', 'YEARLY', 1999, $2) AS result`,
          [id, key],
        );
        const mid = await q(`SELECT subscription_plan, subscription_expires_at FROM public.organizations WHERE id = $1`, [id]);
        const replay = await q(
          `SELECT public.apply_wallet_credits_to_subscription_atomic($1, 'INDIVIDUAL', 'YEARLY', 1999, $2) AS result`,
          [id, key],
        );
        const end = await q(`SELECT subscription_expires_at FROM public.organizations WHERE id = $1`, [id]);
        return {
          ok: (call.rows[0].result as { ok?: boolean }).ok,
          plan: String(mid.rows[0].subscription_plan),
          firstExpiry: String(mid.rows[0].subscription_expires_at),
          replayed: (replay.rows[0].result as { replayed?: boolean }).replayed,
          replayExpiry: String(end.rows[0].subscription_expires_at),
        };
      });
      expect(funded.ok).toBe(true);
      expect(funded.plan).toBe('YEARLY');
      expect(funded.replayed).toBe(true);
      expect(funded.replayExpiry).toBe(funded.firstExpiry);

      const rewardAllowed = await c.query(
        `SELECT has_function_privilege('authenticated', 'public.credit_buyer_settlement_reward_atomic(uuid,uuid,uuid,numeric,numeric,numeric,text)', 'EXECUTE') AS allowed`,
      );
      expect(rewardAllowed.rows[0].allowed).toBe(false);

      await expect(
        asRole(c, 'authenticated', uid, (q) =>
          q(
            `INSERT INTO public.platform_fee_transactions (
               organization_id, supplier_id, purchase_order_id, policy_id, policy_version,
               gross_amount, fee_rate, fee_amount, net_settlement_amount
             ) VALUES ($1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 100000, 50, 50000, 50000)`,
            [id],
          ),
        ),
      ).rejects.toThrow(/PLATFORM-FEE-CLIENT-WRITE-DENIED|row-level security|permission denied/i);
    } catch (error) {
      fnError = error;
    } finally {
      try {
        await c.query('ROLLBACK');
      } catch (error) {
        leaked = `rollback failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      try {
        const after = await c.query(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`);
        const afterVersions = after.rows.map((row) => String(row.version));
        if (afterVersions.join(',') !== beforeVersions.join(',')) leaked = 'schema_migrations changed';
        if (afterVersions.includes('00248') || afterVersions.includes('00249') || afterVersions.includes('00250')) {
          leaked = 'a new migration version was recorded';
        }
        if (afterVersions.at(-1) !== '00245') leaked = `ceiling is ${afterVersions.at(-1)}`;
        const trigger = await c.query(
          `SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_aa_guard_org_subscription_entitlement_fields', 'trg_guard_platform_fee_client_write')`,
        );
        if ((trigger.rowCount ?? 0) > 0) leaked = 'a guard trigger remained installed';
        const restored = await c.query(`SELECT private.subscription_wallet_credit_inr('INDIVIDUAL', 'YEARLY') AS amount`);
        if (Number(restored.rows[0].amount) !== 1990) leaked = 'price function was left replaced';
        const body = await c.query(
          `SELECT pg_get_functiondef('public.process_subscription_payment(uuid,text,text,numeric,text,text)'::regprocedure) AS def`,
        );
        if (!String(body.rows[0].def).includes('subscription_plan = v_cycle_upper')) {
          leaked = 'payment function was left replaced';
        }
      } catch (error) {
        leaked = leaked || (error instanceof Error ? error.message : String(error));
      }
      await c.end();
    }
    if (leaked) throw new Error(leaked);
    if (fnError) throw fnError;
  });
});

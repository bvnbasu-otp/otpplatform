/**
 * 00280: subscription_plans is the canonical runtime subscription price source.
 *
 * Database cases run in rolled-back transactions against the local PostgreSQL used
 * for SQL parity (127.0.0.1:54322) with synthetic plan rows only. They are skipped
 * with a logged reason when it is unavailable or lacks 00280. No approved price is
 * asserted or chosen here.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: process.env.OTP_PG_DATABASE ?? 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00280 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00280_canonical_subscription_pricing.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('chooses no price: no plan rows are inserted or updated by the migration', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.subscription_plans/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.subscription_plans/i);
  });

  it('fails closed with specific PRICE-* errors', () => {
    for (const code of [
      'PRICE-PLAN-NOT-CONFIGURED', 'PRICE-PLAN-INACTIVE', 'PRICE-CURRENCY-MISMATCH',
      'PRICE-CYCLE-NOT-CONFIGURED', 'PRICE-NOT-PAYABLE', 'PRICE-UNKNOWN-CYCLE', 'PAY-V-PRICE-MISMATCH',
    ]) {
      expect(sql).toContain(code);
    }
  });

  it('keeps the webhook function service_role only and compares against the canonical price', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_verified_payment\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_verified_payment\([^)]*\) TO service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION private\.record_verified_payment_bound\([^)]*\)\s+TO service_role/);
    expect(sql).toContain('private.canonical_subscription_price(p_tier, p_billing_cycle, p_currency)');
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
    `SELECT to_regprocedure('private.canonical_subscription_price(text,text,text)') AS f`,
  );
  if (!installed.rows[0].f) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migration 00280 applied');
    await client.end();
    return null;
  }
  return client;
}

async function expectError(client: Client, text: string, params: unknown[], code: string) {
  await client.query('SAVEPOINT expect_error');
  let message = '';
  try {
    await client.query(text, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  expect(message).toContain(code);
}

const PRICE = `SELECT private.canonical_subscription_price($1, $2, $3)::float AS p`;
const price = async (client: Client, tier: string, cycle: string, currency = 'INR') =>
  (await client.query(PRICE, [tier, cycle, currency])).rows[0].p as number;

const SETTLE = `SELECT public.record_verified_payment('SUBSCRIPTION', $1::uuid, NULL, $2::numeric, 'INR', 'RAZORPAY', $3, $4, $5, $6, '{}'::jsonb) AS r`;

async function newOrg(client: Client): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.organizations (id, name, org_type, subscription_tier, subscription_status)
     VALUES ($1, 'Pricing Org', 'MSME', 'TIER_1_MSME', 'ACTIVE')`,
    [id],
  );
  return id;
}

describe('00280 database outcomes (rolled back, synthetic plans)', () => {
  it('fails closed for unmapped, inactive, mismatched or non-payable plans', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      // Nothing is mapped yet in a fresh database: every tier fails closed.
      await expectError(client, PRICE, ['TIER_1_MSME', 'MONTHLY', 'INR'], 'PRICE-PLAN-NOT-CONFIGURED');

      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code, is_active)
         VALUES ('SYN_PAID', 'Synthetic paid', 250, 2500, 'INR', 'SYN_PAID', true),
                ('SYN_NOYEAR', 'Synthetic no yearly', 250, NULL, 'INR', 'SYN_NOYEAR', true),
                ('SYN_FREE', 'Synthetic free', 0, 0, 'INR', 'SYN_FREE', true),
                ('SYN_OFF', 'Synthetic inactive', 250, 2500, 'INR', 'SYN_OFF', false),
                ('SYN_USD', 'Synthetic usd', 250, 2500, 'USD', 'SYN_USD', true)`,
      );
      expect(await price(client, 'syn_paid', 'monthly')).toBe(250);
      expect(await price(client, 'SYN_PAID', 'YEARLY')).toBe(2500);
      await expectError(client, PRICE, ['SYN_NOYEAR', 'YEARLY', 'INR'], 'PRICE-CYCLE-NOT-CONFIGURED');
      await expectError(client, PRICE, ['SYN_FREE', 'MONTHLY', 'INR'], 'PRICE-NOT-PAYABLE');
      await expectError(client, PRICE, ['SYN_OFF', 'MONTHLY', 'INR'], 'PRICE-PLAN-INACTIVE');
      await expectError(client, PRICE, ['SYN_USD', 'MONTHLY', 'INR'], 'PRICE-CURRENCY-MISMATCH');
      await expectError(client, PRICE, ['SYN_PAID', 'WEEKLY', 'INR'], 'PRICE-UNKNOWN-CYCLE');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('settles only the canonical amount, never the payload amount, and never provisions on a mismatch', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const orgId = await newOrg(client);
      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code)
         VALUES ('SYN_PAID', 'Synthetic paid', 250, 2500, 'INR', 'TIER_2_ENTERPRISE')`,
      );
      const event = () => `evt_${randomUUID()}`;

      // Unconfigured tier: the affected activation fails closed instead of using a fallback price.
      await expectError(client, SETTLE, [orgId, 100, event(), 'ref', 'TIER_1_MSME', 'MONTHLY'], 'PRICE-PLAN-NOT-CONFIGURED');
      // Under-, over- and wrong-cycle payments are rejected.
      await expectError(client, SETTLE, [orgId, 1, event(), 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY'], 'PAY-V-PRICE-MISMATCH');
      await expectError(client, SETTLE, [orgId, 251, event(), 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY'], 'PAY-V-PRICE-MISMATCH');
      await expectError(client, SETTLE, [orgId, 250, event(), 'ref', 'TIER_2_ENTERPRISE', 'YEARLY'], 'PAY-V-PRICE-MISMATCH');

      const untouched = await client.query(
        `SELECT subscription_tier, (SELECT count(*) FROM public.subscription_payment_logs WHERE organization_id = $1)::int AS logs
         FROM public.organizations WHERE id = $1`, [orgId],
      );
      expect(untouched.rows[0]).toEqual({ subscription_tier: 'TIER_1_MSME', logs: 0 });

      const ok = await client.query(SETTLE, [orgId, 250, event(), 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY']);
      expect(ok.rows[0].r.ok).toBe(true);
      const after = await client.query(
        `SELECT subscription_tier, subscription_plan FROM public.organizations WHERE id = $1`, [orgId],
      );
      expect(after.rows[0]).toEqual({ subscription_tier: 'TIER_2_ENTERPRISE', subscription_plan: 'MONTHLY' });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('exposes the canonical price to signed-in users and the inconsistency report only to admins', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code)
         VALUES ('SYN_PAID', 'Synthetic paid', 250, 2500, 'INR', 'SYN_PAID')`,
      );
      const quote = await client.query(`SELECT public.get_canonical_subscription_price('SYN_PAID', 'YEARLY') AS q`);
      expect(quote.rows[0].q).toMatchObject({ planCode: 'SYN_PAID', cycle: 'YEARLY', currency: 'INR', amount: 2500 });

      const report = await client.query(`SELECT public.subscription_pricing_report() AS r`);
      // The seeded MVP plans have no tier mapping: that exact inconsistency is reported, not hidden.
      const unmapped = (report.rows[0].r.plansWithoutTierMapping as Array<{ code: string }>).map((p) => p.code);
      expect(unmapped).toEqual(expect.arrayContaining(['COMMUNITY_FREE', 'MSME_STARTER', 'ENTERPRISE']));
      expect(Array.isArray(report.rows[0].r.tiersInUseWithoutPlan)).toBe(true);

      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: randomUUID(), role: 'authenticated' }),
      ]);
      await client.query('SET LOCAL ROLE authenticated');
      await expectError(client, `SELECT public.subscription_pricing_report()`, [], 'ADMIN-ONLY');
      await client.query('SET LOCAL ROLE anon');
      await expectError(client, `SELECT public.get_canonical_subscription_price('SYN_PAID', 'MONTHLY')`, [], 'permission denied');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

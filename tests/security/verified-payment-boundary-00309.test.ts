/**
 * 00309 verified-payment invoice boundary.
 * Subscription rows are created inside a transaction and rolled back.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL = {
  host: '127.0.0.1',
  port: Number(process.env.LOCAL_PG_PORT ?? 54322),
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

const PUBLIC_PAY = `SELECT public.record_verified_payment($1, $2::uuid, $3::uuid, $4::numeric, 'INR', 'RAZORPAY', $5, $6, $7, $8, '{}'::jsonb) AS r`;

async function withRollback(run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client(LOCAL);
  await client.connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    await client.end();
  }
}

async function captureError(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT otp_expect_error');
  let message = '';
  try {
    await client.query(sql, params);
  } catch (error) {
    message = (error as Error).message;
  }
  await client.query('ROLLBACK TO SAVEPOINT otp_expect_error');
  return message;
}

async function orgId(client: Client): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.organizations (id, name, org_type, subscription_tier, subscription_status)
     VALUES ($1, 'closure payment boundary', 'MSME', 'TIER_1_MSME', 'ACTIVE')`,
    [id],
  );
  return id;
}

describe('00309 verified payment invoice boundary', () => {
  it('rejects INVOICE on the public RPC and denies a direct private call by service_role', async () => {
    await withRollback(async (client) => {
      const owner = await client.query<{ owner: string }>(
        `SELECT pg_get_userbyid(proowner) AS owner
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_verified_payment'`,
      );
      expect(owner.rows[0].owner).toBe('postgres');
      const granted = await client.query(
        `SELECT grantee FROM information_schema.routine_privileges
         WHERE routine_name = 'record_verified_payment_bound' AND grantee = 'service_role'`,
      );
      expect(granted.rowCount).toBe(0);

      const invoice = await captureError(
        client,
        PUBLIC_PAY,
        ['INVOICE', null, randomUUID(), 100, `evt_${randomUUID()}`, 'ref', 'TIER_1_MSME', 'MONTHLY'],
      );
      expect(invoice).toContain('PAY-V-INVOICE-OFF-PLATFORM');

      await client.query('SAVEPOINT service_role_invoice');
      await client.query('SET LOCAL ROLE service_role');
      let asService = '';
      try {
        await client.query(PUBLIC_PAY, ['INVOICE', null, randomUUID(), 100, `evt_${randomUUID()}`, 'ref', 'TIER_1_MSME', 'MONTHLY']);
      } catch (error) {
        asService = (error as Error).message;
      }
      await client.query('ROLLBACK TO SAVEPOINT service_role_invoice');
      expect(asService).toContain('PAY-V-INVOICE-OFF-PLATFORM');

      await client.query('SAVEPOINT private_call');
      await client.query('SET LOCAL ROLE service_role');
      let direct = '';
      try {
        await client.query(
          `SELECT private.record_verified_payment_bound('INVOICE', NULL, $1::uuid, 100, 'INR', 'RAZORPAY', $2, 'ref', 'TIER_1_MSME', 'MONTHLY', '{}'::jsonb)`,
          [randomUUID(), `evt_${randomUUID()}`],
        );
      } catch (error) {
        direct = (error as Error).message;
      }
      await client.query('ROLLBACK TO SAVEPOINT private_call');
      expect(direct.toLowerCase()).toMatch(/permission denied/);
    });
  });

  it('settles the canonical subscription amount once and rejects a mismatched price', async () => {
    await withRollback(async (client) => {
      const id = await orgId(client);
      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code)
         VALUES ('SYN_BOUNDARY', 'Synthetic boundary', 250, 2500, 'INR', 'TIER_2_ENTERPRISE')`,
      );
      const event = `evt_${randomUUID()}`;
      const mismatch = await captureError(
        client,
        PUBLIC_PAY,
        ['SUBSCRIPTION', id, null, 1, event, 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY'],
      );
      expect(mismatch).toContain('PAY-V-PRICE-MISMATCH');

      const paid = await client.query<{ r: { ok: boolean; duplicate?: boolean } }>(
        PUBLIC_PAY,
        ['SUBSCRIPTION', id, null, 250, event, 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY'],
      );
      expect(paid.rows[0].r.ok).toBe(true);
      expect(paid.rows[0].r.duplicate).toBeUndefined();
      const replay = await client.query<{ r: { ok: boolean; duplicate: boolean } }>(
        PUBLIC_PAY,
        ['SUBSCRIPTION', id, null, 250, event, 'ref', 'TIER_2_ENTERPRISE', 'MONTHLY'],
      );
      expect(replay.rows[0].r.duplicate).toBe(true);
      const logs = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.subscription_payment_logs WHERE organization_id = $1`,
        [id],
      );
      expect(logs.rows[0].n).toBe('1');
    });
  });

  it('keeps buyer invoice recording on record_invoice_payment_atomic', async () => {
    await withRollback(async (client) => {
      const missing = await captureError(
        client,
        `SELECT public.record_invoice_payment_atomic($1::uuid, 10, 'UPI'::public.payment_method, 'UTR-BOUNDARY', 'INR', NULL, NULL, 'idem-boundary')`,
        [randomUUID()],
      );
      expect(missing).toMatch(/Target Invoice/);
      expect(missing).not.toContain('PAY-V-INVOICE-OFF-PLATFORM');
    });
  });
});

/**
 * 00278: verified gateway payments are bound to authoritative records (audit finding FIN-1).
 *
 * Behavioural cases run in a rolled-back transaction against the local
 * PostgreSQL used for SQL parity (127.0.0.1:54322) with simulated gateway
 * values only; they are skipped with a logged reason when it is unavailable or
 * lacks 00278. No real payment or provider is involved.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { settlementDisposition } from '../../supabase/functions/payment-webhook/verify-webhook.ts';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

describe('00278 static contract', () => {
  const sql = readFileSync(resolve('supabase/migrations/00278_bind_verified_payments_to_authoritative_records.sql'), 'utf8')
    .replace(/--.*$/gm, '');

  it('validates amount, currency, binding and idempotency inside the function', () => {
    for (const code of [
      'PAY-V-EVENT-ID-REQUIRED',
      'PAY-V-INVALID-AMOUNT',
      'PAY-V-CURRENCY-MISMATCH',
      'PAY-V-AMOUNT-EXCEEDS-BALANCE',
      'PAY-V-ORG-MISMATCH',
      'PAY-V-INVOICE-NOT-PAYABLE',
    ]) {
      expect(sql).toContain(code);
    }
    expect(sql).toMatch(/FROM public\.invoices[\s\S]{0,400}FOR UPDATE/);
    expect(sql).toContain('INSERT INTO public.payment_allocations');
  });

  it('no longer marks an invoice PAID directly', () => {
    expect(sql).not.toMatch(/UPDATE public\.invoices\s+SET\s+status\s*=\s*'PAID'/i);
  });

  it('keeps the function service_role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_verified_payment\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_verified_payment\([^)]*\) TO service_role/);
  });
});

describe('settlementDisposition (webhook event gating)', () => {
  it('settles only captured Razorpay payments', () => {
    const captured = { event: 'payment.captured', payload: { payment: { entity: { status: 'captured' } } } };
    expect(settlementDisposition('RAZORPAY', captured)).toEqual({ settle: true });
    for (const event of ['payment.failed', 'payment.authorized', 'refund.processed', 'payment.dispute.created', '']) {
      expect(settlementDisposition('RAZORPAY', { event }).settle).toBe(false);
    }
    expect(settlementDisposition('RAZORPAY', {}).settle).toBe(false);
    expect(
      settlementDisposition('RAZORPAY', { event: 'payment.captured', payload: { payment: { entity: { status: 'failed' } } } })
        .settle,
    ).toBe(false);
  });

  it('settles only succeeded Stripe payments', () => {
    expect(settlementDisposition('STRIPE', { type: 'payment_intent.succeeded', data: { object: { status: 'succeeded' } } }))
      .toEqual({ settle: true });
    expect(settlementDisposition('STRIPE', { type: 'payment_intent.payment_failed' }).settle).toBe(false);
    expect(settlementDisposition('STRIPE', { type: 'charge.refunded' }).settle).toBe(false);
    expect(
      settlementDisposition('STRIPE', { type: 'checkout.session.completed', data: { object: { payment_status: 'unpaid' } } })
        .settle,
    ).toBe(false);
    expect(
      settlementDisposition('STRIPE', { type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } })
        .settle,
    ).toBe(true);
  });

  it('rejects generic events that report an unsettled status and unknown providers', () => {
    expect(settlementDisposition('GENERIC_SECURE', { status: 'failed' }).settle).toBe(false);
    expect(settlementDisposition('GENERIC_SECURE', { status: 'PAID' }).settle).toBe(true);
    expect(settlementDisposition('UNKNOWN', {}).settle).toBe(false);
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
    `SELECT pg_get_functiondef(to_regprocedure('private.record_verified_payment_bound(text,uuid,uuid,numeric,text,text,text,text,text,text,jsonb)')) ILIKE '%PAY-V-INVALID-AMOUNT%' AS ok`,
  ).catch(() => ({ rows: [{ ok: false }] }));
  if (!installed.rows[0]?.ok) {
    console.warn('[SKIP REASON] local PostgreSQL does not have migrations 00278/00280 applied');
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

const PAY = `SELECT private.record_verified_payment_bound($1, $2::uuid, $3::uuid, $4::numeric, $5, 'RAZORPAY', $6, $7, $8, $9, '{}'::jsonb) AS r`;
const pay = (
  type: string,
  org: string | null,
  invoice: string | null,
  amount: number,
  currency: string,
  eventId: string | null,
  tier = 'TIER_1_MSME',
  cycle = 'MONTHLY',
) => [type, org, invoice, amount, currency, eventId, eventId ? `pay_${eventId}` : null, tier, cycle];

async function createFixture(client: Client) {
  const orgId = randomUUID();
  const poId = randomUUID();
  const invoiceId = randomUUID();
  const supplierId = randomUUID();
  const workOrderId = randomUUID();
  await client.query(`SET LOCAL session_replication_role = replica`);
  await client.query(
    `INSERT INTO public.organizations (id, name, org_type, subscription_tier, subscription_status)
     VALUES ($1, 'Payment Binding Org', 'MSME', 'TIER_1_MSME', 'ACTIVE')`,
    [orgId],
  );
  await client.query(`INSERT INTO public.suppliers (id, business_name) VALUES ($1, 'Payment Binding Supplier')`, [supplierId]);
  await client.query(
    `INSERT INTO public.purchase_orders (id, award_id, rfq_id, organization_id, supplier_id, po_number, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6, 1000)`,
    [poId, randomUUID(), randomUUID(), orgId, supplierId, `PO-${randomUUID().slice(0, 8)}`],
  );
  await client.query(
    `INSERT INTO public.work_orders (id, purchase_order_id, supplier_id, title) VALUES ($1, $2, $3, 'Payment binding WO')`,
    [workOrderId, poId, supplierId],
  );
  await client.query(
    `INSERT INTO public.invoices (id, work_order_id, supplier_id, invoice_number, amount, status, purchase_order_id,
                                  balance_due, paid_amount)
     VALUES ($1, $2, $3, $4, 1000, 'APPROVED', $5, 1000, 0)`,
    [invoiceId, workOrderId, supplierId, `INV-${randomUUID().slice(0, 8)}`, poId],
  );
  await client.query(`SET LOCAL session_replication_role = origin`);
  return { orgId, invoiceId };
}

describe('00278 database outcomes (rolled back, simulated gateway events)', () => {
  it('rejects invalid, mismatched and unbound invoice payments without changing the invoice', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const { orgId, invoiceId } = await createFixture(client);
      const event = () => `evt_${randomUUID()}`;

      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, 100, 'INR', null), 'PAY-V-EVENT-ID-REQUIRED');
      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, 0, 'INR', event()), 'PAY-V-INVALID-AMOUNT');
      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, -5, 'INR', event()), 'PAY-V-INVALID-AMOUNT');
      await expectError(client, PAY, pay('INVOICE', orgId, randomUUID(), 100, 'INR', event()), 'PAY-V-INVOICE-NOT-FOUND');
      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, 100, 'USD', event()), 'PAY-V-CURRENCY-MISMATCH');
      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, 1000.01, 'INR', event()), 'PAY-V-AMOUNT-EXCEEDS-BALANCE');
      await expectError(client, PAY, pay('INVOICE', randomUUID(), invoiceId, 100, 'INR', event()), 'PAY-V-ORG-MISMATCH');

      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(`UPDATE public.invoices SET status = 'SUBMITTED' WHERE id = $1`, [invoiceId]);
      await client.query(`SET LOCAL session_replication_role = origin`);
      await expectError(client, PAY, pay('INVOICE', orgId, invoiceId, 100, 'INR', event()), 'PAY-V-INVOICE-NOT-PAYABLE');
      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(`UPDATE public.invoices SET status = 'APPROVED' WHERE id = $1`, [invoiceId]);
      await client.query(`SET LOCAL session_replication_role = origin`);

      const untouched = await client.query(
        `SELECT status, paid_amount::float AS paid, balance_due::float AS due,
                (SELECT count(*) FROM public.payments WHERE invoice_id = $1)::int AS payments
         FROM public.invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(untouched.rows[0]).toEqual({ status: 'APPROVED', paid: 0, due: 1000, payments: 0 });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('settles partial then final invoice payments through allocations and ignores replays', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const { orgId, invoiceId } = await createFixture(client);

      const firstEvent = `evt_${randomUUID()}`;
      const first = await client.query(PAY, pay('INVOICE', orgId, invoiceId, 400, 'INR', firstEvent));
      expect(first.rows[0].r.ok).toBe(true);

      const afterFirst = await client.query(
        `SELECT status, paid_amount::float AS paid, balance_due::float AS due FROM public.invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(afterFirst.rows[0]).toEqual({ status: 'PARTIALLY_PAID', paid: 400, due: 600 });

      const replay = await client.query(PAY, pay('INVOICE', orgId, invoiceId, 400, 'INR', firstEvent));
      expect(replay.rows[0].r.duplicate).toBe(true);
      const counts = await client.query(
        `SELECT (SELECT count(*) FROM public.payments WHERE invoice_id = $1)::int AS payments,
                (SELECT count(*) FROM public.payment_allocations WHERE invoice_id = $1)::int AS allocations`,
        [invoiceId],
      );
      expect(counts.rows[0]).toEqual({ payments: 1, allocations: 1 });

      const final = await client.query(PAY, pay('INVOICE', orgId, invoiceId, 600, 'INR', `evt_${randomUUID()}`));
      expect(final.rows[0].r.ok).toBe(true);
      const settled = await client.query(
        `SELECT status, paid_amount::float AS paid, balance_due::float AS due FROM public.invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(settled.rows[0]).toEqual({ status: 'PAID', paid: 1000, due: 0 });

      await expectError(
        client, PAY, pay('INVOICE', orgId, invoiceId, 1, 'INR', `evt_${randomUUID()}`), 'PAY-V-INVOICE-NOT-PAYABLE',
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('validates subscription payments and keeps them idempotent', async () => {
    const client = await connect();
    if (!client) return;
    try {
      await client.query('BEGIN');
      const { orgId } = await createFixture(client);
      const event = () => `evt_${randomUUID()}`;

      // Synthetic plan rows for this rolled-back transaction only; no approved price is implied.
      await client.query(
        `INSERT INTO public.subscription_plans (code, name, price_monthly, price_yearly, currency, tier_code)
         VALUES ('TEST_T1', 'Test T1', 100, 1000, 'INR', 'TIER_1_MSME'),
                ('TEST_T2', 'Test T2', 1000, 10000, 'INR', 'TIER_2_ENTERPRISE')`,
      );

      await expectError(client, PAY, pay('SUBSCRIPTION', orgId, null, 0, 'INR', event()), 'PAY-V-PRICE-MISMATCH');
      await expectError(client, PAY, pay('SUBSCRIPTION', orgId, null, 100, 'USD', event()), 'PRICE-CURRENCY-MISMATCH');
      await expectError(client, PAY, pay('SUBSCRIPTION', orgId, null, 100, 'INR', event(), 'TIER_9_FREE'), 'PRICE-PLAN-NOT-CONFIGURED');
      await expectError(
        client, PAY, pay('SUBSCRIPTION', orgId, null, 100, 'INR', event(), 'TIER_1_MSME', 'DAILY'), 'PRICE-UNKNOWN-CYCLE',
      );
      await expectError(client, PAY, pay('SUBSCRIPTION', randomUUID(), null, 100, 'INR', event()), 'not found');

      const eventId = event();
      const ok = await client.query(PAY, pay('SUBSCRIPTION', orgId, null, 10000, 'INR', eventId, 'TIER_2_ENTERPRISE', 'YEARLY'));
      expect(ok.rows[0].r.ok).toBe(true);
      const org = await client.query(
        `SELECT subscription_tier, subscription_plan, subscription_status FROM public.organizations WHERE id = $1`, [orgId],
      );
      expect(org.rows[0]).toEqual({
        subscription_tier: 'TIER_2_ENTERPRISE', subscription_plan: 'YEARLY', subscription_status: 'ACTIVE',
      });

      // A replay is answered as a duplicate even after the plan price changes.
      await client.query(`UPDATE public.subscription_plans SET price_yearly = 12000 WHERE tier_code = 'TIER_2_ENTERPRISE'`);
      const replay = await client.query(PAY, pay('SUBSCRIPTION', orgId, null, 10000, 'INR', eventId, 'TIER_2_ENTERPRISE', 'YEARLY'));
      expect(replay.rows[0].r.duplicate).toBe(true);
      const logs = await client.query(
        `SELECT count(*)::int AS n FROM public.subscription_payment_logs WHERE gateway_event_id = $1`, [eventId],
      );
      expect(logs.rows[0].n).toBe(1);

      await client.query(`UPDATE public.organizations SET blocked_at = now() WHERE id = $1`, [orgId]);
      await expectError(client, PAY, pay('SUBSCRIPTION', orgId, null, 100, 'INR', event()), 'PAY-V-ORG-BLOCKED');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

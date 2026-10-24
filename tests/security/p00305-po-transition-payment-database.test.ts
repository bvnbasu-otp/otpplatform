/**
 * Migration 00305/00306: PO transition RPC, direct-write guard, payment idempotency, GST invoice guard.
 * REAL local PostgreSQL only.
 */
import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

let up = false;
let migrationReady = false;
let service: ReturnType<typeof createServiceClient>;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;
  service = createServiceClient();
  const pg = new Client({
    host: '127.0.0.1',
    port: Number(process.env.LOCAL_PG_PORT ?? 54322),
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await pg.connect();
  try {
    const { rows } = await pg.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'transition_purchase_order' LIMIT 1`,
    );
    migrationReady = rows.length > 0;
  } finally {
    await pg.end();
  }
});

beforeEach((ctx) => {
  if (!up || !migrationReady) ctx.skip();
});

describe('00305/00306 — PO transition and payment integrity (REAL DATABASE)', () => {
  it('blocks authenticated direct purchase_orders.status updates', async () => {
    const { data: po } = await service
      .from('purchase_orders')
      .select('id, status')
      .eq('status', 'ISSUED')
      .limit(1)
      .maybeSingle();
    if (!po?.id) return;

    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const attempt = await buyer
      .from('purchase_orders')
      .update({ status: 'ACCEPTED' })
      .eq('id', po.id)
      .select('id');

    const blocked =
      Boolean(attempt.error?.message?.match(/PO-TRANSITION-DIRECT-WRITE|must change via transition/i)) ||
      (attempt.data?.length ?? 0) === 0;
    expect(blocked).toBe(true);

    const { data: after } = await service.from('purchase_orders').select('status').eq('id', po.id).single();
    expect(after?.status).toBe('ISSUED');
  });

  it('rejects stale expected_from_status on transition_purchase_order', async () => {
    const { data: po } = await service
      .from('purchase_orders')
      .select('id, status')
      .eq('status', 'ISSUED')
      .limit(1)
      .maybeSingle();
    if (!po?.id) return;

    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { error } = await buyer.rpc('transition_purchase_order', {
      p_po_id: po.id,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'IN_PROGRESS',
    });
    expect(error?.message ?? '').toMatch(/PO-TRANSITION-STALE/i);
  });

  it('rejects idempotency key reuse with conflicting payment payload', async () => {
    const pg = new Client({
      host: '127.0.0.1',
      port: Number(process.env.LOCAL_PG_PORT ?? 54322),
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
    });
    await pg.connect();
    try {
      const { rows: invRows } = await pg.query<{ id: string; purchase_order_id: string; amount: string }>(
        `SELECT i.id, i.purchase_order_id, i.amount::text
         FROM invoices i
         WHERE i.status IN ('APPROVED', 'PARTIALLY_PAID')
           AND COALESCE(i.balance_due, i.amount) > 0
         LIMIT 1`,
      );
      if (invRows.length === 0) return;

      const inv = invRows[0];
      const key = `test-idem-${Date.now()}`;
      const amt1 = Math.min(1, Number(inv.amount) / 2 || 1);

      await pg.query(`SELECT public.record_invoice_payment_atomic($1::uuid, $2::numeric, 'UPI'::payment_method, 'UTR-A', 'INR', $3::uuid, NULL, $4)`, [
        inv.id,
        amt1,
        inv.purchase_order_id,
        key,
      ]);

      await expect(
        pg.query(
          `SELECT public.record_invoice_payment_atomic($1::uuid, $2::numeric, 'UPI'::payment_method, 'UTR-B', 'INR', $3::uuid, NULL, $4)`,
          [inv.id, amt1 + 0.01, inv.purchase_order_id, key],
        ),
      ).rejects.toThrow(/PAY-IDEMPOTENCY-CONFLICT/i);
    } finally {
      await pg.end();
    }
  });

  it('blocks GST tax lines on REVIEW_REQUIRED supplier invoices', async () => {
    const pg = new Client({
      host: '127.0.0.1',
      port: Number(process.env.LOCAL_PG_PORT ?? 54322),
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
    });
    await pg.connect();
    try {
      const { rows: woRows } = await pg.query<{ id: string; supplier_id: string }>(
        `SELECT id, supplier_id FROM work_orders ORDER BY created_at DESC LIMIT 1`,
      );
      if (woRows.length === 0) return;
      const wo = woRows[0];

      await pg.query(
        `UPDATE suppliers SET supply_gst_treatment = 'REVIEW_REQUIRED' WHERE id = $1`,
        [wo.supplier_id],
      );

      await expect(
        pg.query(
          `INSERT INTO invoices (work_order_id, supplier_id, invoice_number, amount, cgst_total, sgst_total, status)
           VALUES ($1, $2, $3, 1000, 90, 90, 'SUBMITTED')`,
          [wo.id, wo.supplier_id, `GST-BLOCK-${Date.now()}`],
        ),
      ).rejects.toThrow(/INV-GST-CLASSIFICATION/i);
    } finally {
      await pg.end();
    }
  });
});

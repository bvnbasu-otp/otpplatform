/**
 * Master Prompt 20 — expanded REAL DATABASE coverage for PO transitions and payments.
 */
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';
import { deleteFixtureRequirements } from '../helpers/fixture-teardown';

const HOUR = 3_600_000;
const BUYER_ORG = DEMO.orgs.sunrise;
const LOGIN = {
  estateManager: DEMO.logins.sunriseManager,
  committeeA: DEMO.logins.sunriseCommittee,
  committeeB: DEMO.logins.sunriseCommittee2,
  president: 'president@sunrise.test',
  supplier: DEMO.logins.motorSupplier,
  rival: DEMO.logins.kovaiOwner,
};

let service: SupabaseClient;
let up = false;
let ready = false;
let stubWasEnabled = false;
const requirementIds: string[] = [];

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
  const { rows } = await pg.query(`SELECT 1 FROM pg_proc WHERE proname = 'transition_purchase_order' LIMIT 1`);
  ready = rows.length > 0;
  await pg.end();

  const { data: demo } = await service.from('demo_settings').select('supplier_network_stub_enabled').eq('id', true).single();
  stubWasEnabled = Boolean(demo?.supplier_network_stub_enabled);
  if (stubWasEnabled) {
    await service.from('demo_settings').update({ supplier_network_stub_enabled: false }).eq('id', true);
  }
});

afterAll(async () => {
  if (!up) return;
  if (stubWasEnabled) {
    await service.from('demo_settings').update({ supplier_network_stub_enabled: true }).eq('id', true);
  }
});

beforeEach((ctx) => {
  if (!up || !ready) ctx.skip();
});

afterEach(async () => {
  if (!up) return;
  const ids = requirementIds.splice(0);
  if (ids.length > 0) await deleteFixtureRequirements(ids);
});

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

async function sessionFor(email: string): Promise<SupabaseClient> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const STD_SNAPSHOT = {
  basePrice: 10000,
  gstAmount: 1800,
  totalCost: 11800,
  deliveryDays: 7,
  warrantyMonths: 12,
  isInterState: false,
  currency: 'INR',
};

async function makeRound(): Promise<{ rfqId: string; winnerQuoteId: string }> {
  const creator = await profileIdFor(LOGIN.estateManager);
  const { data: sub } = await service.from('requirement_subcategories').select('id, category_id').eq('code', 'motor_rewinding').single();
  const { data: requirement } = await service
    .from('requirements')
    .insert({
      organization_id: BUYER_ORG,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: sub!.category_id,
      subcategory_id: sub!.id,
      status: 'QUOTING',
      title: 'Gate20 PO fixture',
      description: 'p00320-gate20',
      delivery_city: 'Bengaluru',
      commercial: { paymentTerms: '25% 25% 25% 25%' },
    })
    .select('id')
    .single();
  requirementIds.push(requirement!.id);

  const { data: rfq } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: BUYER_ORG,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'Gate20 RFQ',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();
  await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

  const suppliers = [DEMO.suppliers.aquaPrime, DEMO.suppliers.nandi];
  const quoteIds: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const { data: invitation } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: suppliers[i],
        anonymous_label: `G20-${i}`,
        status: 'QUOTED',
      })
      .select('id')
      .single();
    const { data: quote } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: suppliers[i],
        invitation_id: invitation!.id,
        status: 'FINAL',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    await service.from('quote_versions').upsert({
      quote_id: quote!.id,
      version: 1,
      snapshot: { ...STD_SNAPSHOT, totalCost: 11800 - i * 200 },
      created_by: creator,
    });
    quoteIds.push(quote!.id);
  }
  await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);

  for (const email of [LOGIN.committeeA, LOGIN.committeeB]) {
    await service.from('committee_assignments').upsert(
      { rfq_id: rfq!.id, profile_id: await profileIdFor(email) },
      { onConflict: 'rfq_id,profile_id' },
    );
    await service.from('committee_votes').insert({
      rfq_id: rfq!.id,
      profile_id: await profileIdFor(email),
      recommended_quote_id: quoteIds[0],
      choice: 'RECOMMEND',
      voting_power: 1,
    });
  }

  const manager = await sessionFor(LOGIN.estateManager);
  const lock = await manager.rpc('lock_award', {
    p_rfq_id: rfq!.id,
    p_quote_id: quoteIds[0],
    p_justification: 'Gate20 award.',
  });
  expect(lock.error).toBeNull();
  const reveal = await manager.rpc('reveal_award', { p_rfq_id: rfq!.id });
  expect(reveal.error).toBeNull();

  return { rfqId: rfq!.id, winnerQuoteId: quoteIds[0] };
}

async function freshIssuedPo(): Promise<string> {
  const round = await makeRound();
  const { data: po } = await service.from('purchase_orders').select('id, status').eq('rfq_id', round.rfqId).single();
  expect(po!.status).toBe('ISSUED');
  return po!.id as string;
}

describe('Gate 20 — PO transition matrix (REAL DATABASE)', () => {
  it('permits ISSUED → ACCEPTED (supplier) and ACCEPTED → IN_PROGRESS (buyer manager)', async () => {
    const poId = await freshIssuedPo();
    const supplier = await sessionFor(LOGIN.supplier);
    const accept = await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    });
    expect(accept.error).toBeNull();

    const manager = await sessionFor(LOGIN.estateManager);
    const progress = await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'IN_PROGRESS',
      p_expected_from_status: 'ACCEPTED',
    });
    expect(progress.error).toBeNull();
    const { data: row } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(row!.status).toBe('IN_PROGRESS');
  });

  it('rejects illegal ISSUED → IN_PROGRESS and unauthorized supplier on buyer-only transition', async () => {
    const poId = await freshIssuedPo();
    const manager = await sessionFor(LOGIN.estateManager);
    const illegal = await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'IN_PROGRESS',
      p_expected_from_status: 'ISSUED',
    });
    expect(illegal.error?.message ?? '').toMatch(/PO-TRANSITION-ILLEGAL/i);

    const supplier = await sessionFor(LOGIN.supplier);
    const unauth = await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'IN_PROGRESS',
      p_expected_from_status: 'ISSUED',
    });
    expect(unauth.error?.message ?? '').toMatch(/PO-TRANSITION-UNAUTHORIZED|PO-TRANSITION-ILLEGAL/i);
  });

  it('rejects COMPLETED without inspection and financial prerequisites', async () => {
    const poId = await freshIssuedPo();
    const supplier = await sessionFor(LOGIN.supplier);
    await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    });
    const manager = await sessionFor(LOGIN.estateManager);
    await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'IN_PROGRESS',
      p_expected_from_status: 'ACCEPTED',
    });
    const complete = await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'COMPLETED',
      p_expected_from_status: 'IN_PROGRESS',
    });
    expect(complete.error?.message ?? '').toMatch(/PO-COMPLETE/i);
  });

  it('returns idempotent success when target status already applied', async () => {
    const poId = await freshIssuedPo();
    const supplier = await sessionFor(LOGIN.supplier);
    const first = await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    });
    expect(first.error).toBeNull();
    const second = await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ACCEPTED',
    });
    expect(second.error).toBeNull();
    expect((second.data as { idempotent?: boolean })?.idempotent).toBe(true);
  });

  it('preserves cancel_purchase_order_atomic for pre-acceptance cancellation', async () => {
    const poId = await freshIssuedPo();
    const manager = await sessionFor(LOGIN.estateManager);
    const cancel = await manager.rpc('cancel_purchase_order_atomic', {
      p_po_id: poId,
      p_reason: 'Scope revised before supplier acceptance.',
    });
    expect(cancel.error).toBeNull();
    const { data: row } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(row!.status).toBe('CANCELLED');
  });

  it('records po.status_transition audit on successful transition', async () => {
    const poId = await freshIssuedPo();
    const supplier = await sessionFor(LOGIN.supplier);
    await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    });
    const { data: events } = await service
      .from('audit_events')
      .select('event_type, entity_id')
      .eq('event_type', 'po.status_transition')
      .eq('entity_id', poId)
      .limit(1);
    expect(events?.length).toBeGreaterThan(0);
  });
});

describe('Gate 20 — payment idempotency and balances (REAL DATABASE)', () => {
  async function payableInvoice(): Promise<{ id: string; poId: string; balance: number }> {
    const poId = await freshIssuedPo();
    const { data: wo } = await service.from('work_orders').select('id, supplier_id').eq('purchase_order_id', poId).single();
    const { data: po } = await service.from('purchase_orders').select('total_amount').eq('id', poId).single();
    const amount = Number(po!.total_amount);
    const { data: inv } = await service
      .from('invoices')
      .insert({
        work_order_id: wo!.id,
        purchase_order_id: poId,
        supplier_id: wo!.supplier_id,
        invoice_number: `G20-INV-${Date.now()}`,
        amount,
        currency: 'INR',
        status: 'APPROVED',
        balance_due: amount,
        paid_amount: 0,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    return { id: inv!.id as string, poId, balance: amount };
  }

  it('records first payment, idempotent retry, and rejects overpayment', async () => {
    const { id, poId, balance } = await payableInvoice();
    const key = `g20-pay-${Date.now()}`;
    const partial = Math.round(balance / 2);
    const manager = await sessionFor(LOGIN.estateManager);

    const payArgs = {
      p_invoice_id: id,
      p_amount: partial,
      p_method: 'UPI' as const,
      p_reference: 'UTR-1',
      p_currency: 'INR',
      p_purchase_order_id: poId,
      p_notes: 'Gate20 partial',
      p_idempotency_key: key,
    };

    const first = await manager.rpc('record_invoice_payment_atomic', payArgs);
    expect(first.error).toBeNull();
    expect((first.data as { ok?: boolean })?.ok).toBe(true);

    const retry = await manager.rpc('record_invoice_payment_atomic', payArgs);
    expect(retry.error).toBeNull();
    expect((retry.data as { idempotent_replay?: boolean })?.idempotent_replay).toBe(true);

    const conflict = await manager.rpc('record_invoice_payment_atomic', {
      ...payArgs,
      p_amount: partial + 0.01,
    });
    expect(conflict.error?.message ?? '').toMatch(/PAY-IDEMPOTENCY-CONFLICT/i);

    const over = await manager.rpc('record_invoice_payment_atomic', {
      ...payArgs,
      p_idempotency_key: `g20-over-${Date.now()}`,
      p_amount: balance + 1,
    });
    expect(over.error?.message ?? '').toMatch(/PAY-OVERPAYMENT|balance due/i);

    const second = await manager.rpc('record_invoice_payment_atomic', {
      ...payArgs,
      p_amount: balance - partial,
      p_reference: 'UTR-2',
      p_idempotency_key: `g20-pay-2-${Date.now()}`,
    });
    expect(second.error).toBeNull();

    const { data: inv } = await service.from('invoices').select('status, balance_due, paid_amount').eq('id', id).single();
    expect(Number(inv!.balance_due)).toBe(0);
    expect(inv!.status).toBe('PAID');
  });
});

/**
 * Master Prompt 21 — PO completion happy path, concurrent transitions, payment auth (REAL DATABASE).
 */
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
const RIVAL_ORG = DEMO.orgs.kovai;
const LOGIN = {
  estateManager: DEMO.logins.sunriseManager,
  committeeA: DEMO.logins.sunriseCommittee,
  committeeB: DEMO.logins.sunriseCommittee2,
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
  const { data: proc } = await service.from('purchase_orders').select('id').limit(1);
  ready = Boolean(proc?.length);
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

async function makeRound(paymentTerms = '100% on delivery'): Promise<{ rfqId: string; poId: string }> {
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
      title: 'P21 integrity fixture',
      description: 'p00321-final-integrity',
      delivery_city: 'Bengaluru',
      commercial: { paymentTerms },
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
      title: 'P21 RFQ',
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
        anonymous_label: `P21-${i}`,
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
  expect((await manager.rpc('lock_award', { p_rfq_id: rfq!.id, p_quote_id: quoteIds[0], p_justification: 'P21.' })).error).toBeNull();
  expect((await manager.rpc('reveal_award', { p_rfq_id: rfq!.id })).error).toBeNull();

  const { data: po } = await service.from('purchase_orders').select('id, status, total_amount, payment_structure').eq('rfq_id', rfq!.id).single();
  expect(po!.status).toBe('ISSUED');
  return { rfqId: rfq!.id, poId: po!.id as string };
}

async function advanceToInProgress(poId: string): Promise<{ woId: string; total: number }> {
  const supplier = await sessionFor(LOGIN.supplier);
  expect(
    (await supplier.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    })).error,
  ).toBeNull();
  const manager = await sessionFor(LOGIN.estateManager);
  expect(
    (await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'IN_PROGRESS',
      p_expected_from_status: 'ACCEPTED',
    })).error,
  ).toBeNull();
  const { data: po } = await service.from('purchase_orders').select('total_amount').eq('id', poId).single();
  const { data: wo } = await service.from('work_orders').select('id').eq('purchase_order_id', poId).single();
  return { woId: wo!.id as string, total: Number(po!.total_amount) };
}

describe('P21 — PO completion happy path (REAL DATABASE)', () => {
  it('completes only after inspection sign-off and full payment; invoice PAID precedes PO COMPLETED', async () => {
    const { poId } = await makeRound('100% on delivery');
    const { woId, total } = await advanceToInProgress(poId);

    const { data: poPlan } = await service.from('purchase_orders').select('payment_structure').eq('id', poId).single();
    expect(poPlan!.payment_structure).toBe('SINGLE_PAYMENT');

    const supplier = await sessionFor(LOGIN.supplier);
    const prog = await supplier
      .from('work_orders')
      .update({ progress_percent: 100, status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
      .eq('id', woId)
      .eq('progress_percent', 0)
      .select('id');
    expect(prog.error).toBeNull();
    expect(prog.data?.length).toBe(1);

    const manager = await sessionFor(LOGIN.estateManager);
    const inspectEarly = await manager.rpc('accept_delivery_inspection', {
      p_work_order_id: woId,
      p_rating: 5,
      p_notes: 'Signed off',
    });
    expect(inspectEarly.error).toBeNull();

    const { data: poMid } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(poMid!.status).toBe('IN_PROGRESS');

    const failComplete = await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'COMPLETED',
      p_expected_from_status: 'IN_PROGRESS',
    });
    expect(failComplete.error?.message ?? '').toMatch(/PO-COMPLETE/i);

    const { data: woRow } = await service.from('work_orders').select('supplier_id').eq('id', woId).single();
    const { data: inv } = await service
      .from('invoices')
      .insert({
        work_order_id: woId,
        purchase_order_id: poId,
        supplier_id: woRow!.supplier_id,
        invoice_number: `P21-INV-${Date.now()}`,
        amount: total,
        currency: 'INR',
        status: 'APPROVED',
        balance_due: total,
        paid_amount: 0,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const payBefore = await service.from('payments').select('id', { count: 'exact', head: true }).eq('invoice_id', inv!.id);
    expect(payBefore.count).toBe(0);

    const pay = await manager.rpc('record_invoice_payment_atomic', {
      p_invoice_id: inv!.id,
      p_amount: total,
      p_method: 'UPI',
      p_reference: 'P21-UTR',
      p_currency: 'INR',
      p_purchase_order_id: poId,
      p_notes: 'P21 full',
      p_idempotency_key: `p21-${Date.now()}`,
    });
    expect(pay.error).toBeNull();

    const { data: invPaid } = await service.from('invoices').select('status, balance_due').eq('id', inv!.id).single();
    expect(invPaid!.status).toBe('PAID');
    expect(Number(invPaid!.balance_due)).toBe(0);

    const { data: poBeforeComplete } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(poBeforeComplete!.status).toBe('IN_PROGRESS');

    const complete = await manager.rpc('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'COMPLETED',
      p_expected_from_status: 'IN_PROGRESS',
    });
    expect(complete.error).toBeNull();

    const { data: poDone } = await service.from('purchase_orders').select('status, updated_at').eq('id', poId).single();
    expect(poDone!.status).toBe('COMPLETED');
    expect(poDone!.updated_at).toBeTruthy();

    const { data: audits } = await service
      .from('audit_events')
      .select('event_type')
      .eq('entity_id', poId)
      .in('event_type', ['po.status_transition', 'PAYMENT_RECORDED_ATOMIC']);
    expect((audits ?? []).some((a) => a.event_type === 'po.status_transition')).toBe(true);

    const { count: payCount } = await service.from('payments').select('id', { count: 'exact', head: true }).eq('invoice_id', inv!.id);
    expect(payCount).toBe(1);
  });
});

describe('P21 — concurrent PO transitions (REAL DATABASE)', () => {
  it('serializes competing ISSUED→ACCEPTED transitions; one succeeds and one is stale', async () => {
    const { poId } = await makeRound();
    const supplier = await sessionFor(LOGIN.supplier);
    const [a, b] = await Promise.all([
      supplier.rpc('transition_purchase_order', {
        p_po_id: poId,
        p_to_status: 'ACCEPTED',
        p_expected_from_status: 'ISSUED',
      }),
      supplier.rpc('transition_purchase_order', {
        p_po_id: poId,
        p_to_status: 'ACCEPTED',
        p_expected_from_status: 'ISSUED',
      }),
    ]);

    const okCount = [a, b].filter((r) => !r.error).length;
    const staleCount = [a, b].filter((r) => (r.error?.message ?? '').match(/PO-TRANSITION-STALE/i)).length;
    expect(okCount).toBe(1);
    expect(staleCount).toBe(1);

    const { data: row } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(row!.status).toBe('ACCEPTED');
  });
});

describe('P21 — payment authorization (REAL DATABASE)', () => {
  async function sunrisePayableInvoice(): Promise<{ invId: string; poId: string; amount: number; wrongPoId: string }> {
    const { poId } = await makeRound();
    const { data: wo } = await service.from('work_orders').select('id, supplier_id').eq('purchase_order_id', poId).single();
    const { data: po } = await service.from('purchase_orders').select('total_amount').eq('id', poId).single();
    const amount = Number(po!.total_amount);
    const { data: inv } = await service
      .from('invoices')
      .insert({
        work_order_id: wo!.id,
        purchase_order_id: poId,
        supplier_id: wo!.supplier_id,
        invoice_number: `P21-PAY-${Date.now()}`,
        amount,
        currency: 'INR',
        status: 'APPROVED',
        balance_due: amount,
        paid_amount: 0,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const { data: otherPo } = await service
      .from('purchase_orders')
      .select('id')
      .eq('organization_id', RIVAL_ORG)
      .limit(1)
      .maybeSingle();

    return {
      invId: inv!.id as string,
      poId,
      amount,
      wrongPoId: (otherPo?.id as string) ?? '00000000-0000-4000-8000-000000009999',
    };
  }

  it('rejects rival buyer and supplier payment recording; leaves no payment rows', async () => {
    const { invId, poId, amount } = await sunrisePayableInvoice();
    const before = await service.from('payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invId);

    const rival = await sessionFor(LOGIN.rival);
    const rivalPay = await rival.rpc('record_invoice_payment_atomic', {
      p_invoice_id: invId,
      p_amount: amount,
      p_method: 'UPI',
      p_reference: 'RIVAL',
      p_currency: 'INR',
      p_purchase_order_id: poId,
      p_notes: 'forged',
      p_idempotency_key: `rival-${Date.now()}`,
    });
    expect(rivalPay.error?.message ?? '').toMatch(/PAY-UNAUTHORIZED|not authorized/i);

    const supplier = await sessionFor(LOGIN.supplier);
    const supPay = await supplier.rpc('record_invoice_payment_atomic', {
      p_invoice_id: invId,
      p_amount: amount,
      p_method: 'UPI',
      p_reference: 'SUP',
      p_currency: 'INR',
      p_purchase_order_id: poId,
      p_notes: 'forged',
      p_idempotency_key: `sup-${Date.now()}`,
    });
    expect(supPay.error?.message ?? '').toMatch(/PAY-UNAUTHORIZED|not authorized/i);

    const after = await service.from('payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invId);
    expect(after.count).toBe(before.count);
  });

  it('rejects payment when caller supplies a non-matching purchase_order_id', async () => {
    const { invId, amount, wrongPoId } = await sunrisePayableInvoice();
    if (wrongPoId === invId) return;

    const manager = await sessionFor(LOGIN.estateManager);
    const bad = await manager.rpc('record_invoice_payment_atomic', {
      p_invoice_id: invId,
      p_amount: 1,
      p_method: 'UPI',
      p_reference: 'BAD-PO',
      p_currency: 'INR',
      p_purchase_order_id: wrongPoId,
      p_notes: 'wrong po',
      p_idempotency_key: `bad-po-${Date.now()}`,
    });
    expect(bad.error).not.toBeNull();

    const { count } = await service.from('payment_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', invId);
    expect(count ?? 0).toBe(0);
  });
});

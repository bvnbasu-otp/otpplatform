/**
 * P1 cluster RC-A / RC-B (migration 00242) against the REAL local database.
 *
 *   F-01 awards                     no client INSERT / UPDATE
 *   F-02 purchase_orders            no client INSERT; commercial columns frozen on UPDATE
 *   F-03 quotes                     column guard (score / SELECTED / identity / version window)
 *   F-04 conflict_of_interest       subject cannot clear / rewrite a DECLARED_CONFLICT
 *   F-05 organization_members       no client INSERT (manager cannot mint an OWNER)
 *   F-06 MSME approval route        zero stages passes only when the route does not apply
 *
 * Every prohibited action is attempted with a real signed-in user JWT (never the service role)
 * and the surviving state is re-read with the service role. Legitimate paths are exercised in
 * the same file so a boundary can never be "closed" by breaking the product.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`, plus migration 00242. Skips otherwise.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAnonClient, createServiceClient, isLocalSupabaseReachable, signInAs } from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';
import { deleteFixtureRequirements } from '../helpers/fixture-teardown';

const HOUR = 3_600_000;
const RWA_ORG = 'e2e00000-0000-4000-8000-0000000000b5';
const MSME_ORG = 'e2e00000-0000-4000-8000-0000000000b6';

const LOGIN = {
  estateManager: DEMO.logins.sunriseManager, // MANAGER + active role FACILITY_MANAGER (RWA)
  committeeA: DEMO.logins.sunriseCommittee, // COMMITTEE_MEMBER
  committeeB: DEMO.logins.sunriseCommittee2, // COMMITTEE_MEMBER
  president: 'president@sunrise.test', // OWNER
  supplier: DEMO.logins.motorSupplier, // user of aquaPrime
  rival: DEMO.logins.kovaiOwner,
  msmeBuyer: 'buyer@apex.test', // MANAGER, RFQ creator
  msmeFinance: 'finance@apex.test', // APPROVER
  msmeDirector: 'director@apex.test', // OWNER
};

let service: SupabaseClient;
let up = false;
let stubWasEnabled = false;
const requirementIds: string[] = [];
const retainedRequirementIds: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;
  service = createServiceClient();

  const { data: demo } = await service.from('demo_settings').select('supplier_network_stub_enabled').eq('id', true).single();
  stubWasEnabled = Boolean(demo?.supplier_network_stub_enabled);
  if (stubWasEnabled) {
    const { error } = await service.from('demo_settings').update({ supplier_network_stub_enabled: false }).eq('id', true);
    if (error) throw new Error(`cannot disable supplier stub: ${error.message}`);
  }

  for (const [id, name, type] of [
    [RWA_ORG, 'P1 00242 RWA Fixture', 'COMMUNITY'],
    [MSME_ORG, 'P1 00242 MSME Fixture', 'MSME'],
  ] as const) {
    const { error } = await service.from('organizations').upsert({
      id,
      name,
      org_type: type,
      city: 'Bengaluru',
      status: 'ACTIVE',
      subscription_plan: 'MONTHLY',
      subscription_status: 'ACTIVE',
      is_demo: false,
    });
    if (error) throw new Error(`fixture org ${name}: ${error.message}`);
  }
  await service.from('organization_members').delete().in('organization_id', [RWA_ORG, MSME_ORG]);
  const members: Array<[string, string, string]> = [
    [RWA_ORG, LOGIN.estateManager, 'MANAGER'],
    [RWA_ORG, LOGIN.committeeA, 'COMMITTEE_MEMBER'],
    [RWA_ORG, LOGIN.committeeB, 'COMMITTEE_MEMBER'],
    [RWA_ORG, LOGIN.president, 'OWNER'],
    [MSME_ORG, LOGIN.msmeBuyer, 'MANAGER'],
    [MSME_ORG, LOGIN.msmeFinance, 'APPROVER'],
    [MSME_ORG, LOGIN.msmeDirector, 'OWNER'],
  ];
  for (const [org, email, role] of members) {
    const { error } = await service
      .from('organization_members')
      .insert({ organization_id: org, profile_id: await profileIdFor(email), role });
    if (error) throw new Error(`fixture member ${email}: ${error.message}`);
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterEach(async () => {
  if (!up) return;
  retainedRequirementIds.splice(0);
  const ids = requirementIds.splice(0);
  if (ids.length > 0) await deleteFixtureRequirements(ids);
  await service.from('org_role_assignments').delete().eq('organization_id', RWA_ORG);
  await service.from('organization_approval_policies').delete().eq('organization_id', MSME_ORG);
  const spare = await Promise.all(['member2@sunrise.test', 'member3@sunrise.test'].map(profileIdFor));
  await service.from('organization_members').delete().eq('organization_id', RWA_ORG).in('profile_id', spare);
});

afterAll(async () => {
  if (!up) return;
  if (stubWasEnabled) {
    await service.from('demo_settings').update({ supplier_network_stub_enabled: true }).eq('id', true);
  }
  await service.from('organization_members').delete().in('organization_id', [RWA_ORG, MSME_ORG]);
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

interface Round {
  orgId: string;
  rfqId: string;
  requirementId: string;
  quoteIds: string[];
  winnerQuoteId: string;
}

/** An enquiry with sealed quotes. quotes[0] is the winner. */
async function makeRound(opts: {
  orgId: string;
  creatorEmail: string;
  totals?: number[];
  quoteStatus?: string;
  versions?: number;
  rfqStatus?: 'OPEN' | 'EVALUATING';
  retain?: boolean;
}): Promise<Round> {
  const creator = await profileIdFor(opts.creatorEmail);
  const suppliers = [DEMO.suppliers.aquaPrime, DEMO.suppliers.nandi];
  const totals = opts.totals ?? [11800, 12400];
  const { data: sub } = await service.from('requirement_subcategories').select('id, category_id').eq('code', 'motor_rewinding').single();

  const { data: requirement, error: reqError } = await service
    .from('requirements')
    .insert({
      organization_id: opts.orgId,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: sub!.category_id,
      subcategory_id: sub!.id,
      status: 'QUOTING',
      title: 'P1 00242 fixture',
      description: 'tests/security/p1-rca-rcb-write-boundaries-00242-database.test.ts',
      delivery_city: 'Bengaluru',
      commercial: {},
    })
    .select('id')
    .single();
  expect(reqError).toBeNull();
  (opts.retain ? retainedRequirementIds : requirementIds).push(requirement!.id);

  const { data: rfq, error: rfqError } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: opts.orgId,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'P1 00242 fixture RFQ',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();
  expect(rfqError).toBeNull();
  await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

  const quoteIds: string[] = [];
  for (let i = 0; i < totals.length; i += 1) {
    const { data: invitation, error: inviteError } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: suppliers[i],
        anonymous_label: `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: 'QUOTED',
      })
      .select('id')
      .single();
    expect(inviteError).toBeNull();

    const versions = opts.versions ?? 1;
    const { data: quote, error: quoteError } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: suppliers[i],
        invitation_id: invitation!.id,
        status: opts.quoteStatus ?? 'FINAL',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(quoteError).toBeNull();
    for (let v = 1; v <= versions; v += 1) {
      const { error: versionError } = await service.from('quote_versions').upsert({
        quote_id: quote!.id,
        version: v,
        snapshot: { ...STD_SNAPSHOT, totalCost: totals[i], basePrice: totals[i] },
        created_by: creator,
      });
      expect(versionError).toBeNull();
    }
    quoteIds.push(quote!.id);
  }

  if ((opts.rfqStatus ?? 'EVALUATING') === 'EVALUATING') {
    const { error } = await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);
    expect(error).toBeNull();
  }

  return { orgId: opts.orgId, rfqId: rfq!.id, requirementId: requirement!.id, quoteIds, winnerQuoteId: quoteIds[0]! };
}

async function seat(rfqId: string, emails: string[]): Promise<void> {
  for (const email of emails) {
    const { error } = await service
      .from('committee_assignments')
      .upsert({ rfq_id: rfqId, profile_id: await profileIdFor(email) }, { onConflict: 'rfq_id,profile_id' });
    if (error) throw new Error(`seat ${email}: ${error.message}`);
  }
}

async function recommendWinner(round: Round): Promise<void> {
  await seat(round.rfqId, [LOGIN.committeeA, LOGIN.committeeB]);
  for (const email of [LOGIN.committeeA, LOGIN.committeeB]) {
    const { error } = await service.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(email),
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(error).toBeNull();
  }
}

/** RWA path through the RPCs: quorum, lock, (optionally) reveal -> award (+ PO). */
async function awardRwa(round: Round, reveal: boolean): Promise<{ awardId: string; poId: string | null }> {
  await recommendWinner(round);
  const manager = await sessionFor(LOGIN.estateManager);
  const lock = await manager.rpc('lock_award', {
    p_rfq_id: round.rfqId,
    p_quote_id: round.winnerQuoteId,
    p_justification: 'Best fit on compliance and turnaround.',
  });
  expect(lock.error).toBeNull();
  if (reveal) {
    const rev = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(rev.error).toBeNull();
  }
  const { data: award } = await service.from('awards').select('id').eq('rfq_id', round.rfqId).single();
  const { data: po } = await service.from('purchase_orders').select('id').eq('rfq_id', round.rfqId).maybeSingle();
  return { awardId: award!.id as string, poId: (po?.id as string | undefined) ?? null };
}

/** Rejected means: an error, OR (RLS-filtered UPDATE) zero affected rows. Never a success. */
function rejected(res: { error: { message: string } | null; data?: unknown[] | null }): boolean {
  return res.error !== null || (res.data ?? []).length === 0;
}

// ---------------------------------------------------------------------------
// F-01 awards
// ---------------------------------------------------------------------------
describe('F-01 awards: no ordinary client INSERT / UPDATE', () => {
  it('owner, manager and approver cannot INSERT an award directly (bypassing quorum/snapshot/verification)', async () => {
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer });
    for (const email of [LOGIN.msmeDirector, LOGIN.msmeBuyer, LOGIN.msmeFinance]) {
      const session = await sessionFor(email);
      const { error } = await session.from('awards').insert({
        rfq_id: round.rfqId,
        quote_id: round.winnerQuoteId,
        awarded_by: await profileIdFor(email),
        justification: { text: 'forged' },
        status: 'LOCKED',
      });
      expect(error, `${email} direct award insert`).not.toBeNull();
    }
    const { count } = await service.from('awards').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(count).toBe(0);
  });

  it('owner, manager and approver cannot UPDATE an award (swap quote_id / status / justification)', async () => {
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const lock = await buyer.rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'Lowest landed cost with compliant references.',
    });
    expect(lock.error).toBeNull(); // legitimate RPC path still works (sub-5L, route not applicable)

    const { data: before } = await service.from('awards').select('quote_id, status, justification').eq('rfq_id', round.rfqId).single();
    expect(before!.quote_id).toBe(round.winnerQuoteId);

    for (const email of [LOGIN.msmeDirector, LOGIN.msmeBuyer, LOGIN.msmeFinance]) {
      const session = await sessionFor(email);
      for (const patch of [
        { quote_id: round.quoteIds[1] },
        { status: 'REVEALED' },
        { justification: { text: 'rewritten' } },
      ]) {
        const res = await session.from('awards').update(patch).eq('rfq_id', round.rfqId).select('id');
        expect(rejected(res), `${email} ${JSON.stringify(patch)}`).toBe(true);
      }
    }
    const { data: after } = await service.from('awards').select('quote_id, status, justification').eq('rfq_id', round.rfqId).single();
    expect(after).toEqual(before);
  });

  it('the legitimate RWA lock + reveal RPCs still create the award and the PO', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { awardId, poId } = await awardRwa(round, true);
    expect(awardId).toBeTruthy();
    expect(poId).toBeTruthy();
  });

  it('the runner-up RPC (internal path) still reassigns awards.quote_id and voids the PO', async () => {
    // The runner-up RPC re-hides identities, which the platform only permits before the reveal
    // (rfqs_no_rehide, unchanged). A PO that already exists against a still-blind RFQ is therefore the
    // reachable state for the PO-cancel leg; it is fixtured with the service role.
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { awardId } = await awardRwa(round, false);
    const { data: poRow, error: poError } = await service
      .from('purchase_orders')
      .insert({
        award_id: awardId,
        rfq_id: round.rfqId,
        organization_id: RWA_ORG,
        supplier_id: DEMO.suppliers.aquaPrime,
        po_number: `PO-00242-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'ISSUED',
        total_amount: 11800,
      })
      .select('id')
      .single();
    expect(poError).toBeNull();
    const poId = poRow!.id as string;

    const manager = await sessionFor(LOGIN.estateManager);
    const { data, error } = await manager.rpc('award_runner_up_quote', {
      p_rfq_id: round.rfqId,
      p_reason: 'Supplier failed inspection.',
    });
    expect(error).toBeNull();
    expect((data as { runner_up_quote_id: string }).runner_up_quote_id).toBe(round.quoteIds[1]);

    const { data: award } = await service.from('awards').select('id, quote_id, status').eq('rfq_id', round.rfqId).single();
    expect(award!.id).toBe(awardId);
    expect(award!.quote_id).toBe(round.quoteIds[1]);
    expect(award!.status).toBe('LOCKED');

    const { data: po } = await service
      .from('purchase_orders')
      .select('status, cancellation_reason, cancelled_at')
      .eq('id', poId!)
      .single();
    expect(po!.status).toBe('CANCELLED');
    expect(po!.cancelled_at).toBeTruthy();
    expect(po!.cancellation_reason).toMatch(/runner-up/i);

    // The same reassignment attempted directly by a client is still refused.
    const direct = await manager.from('awards').update({ quote_id: round.quoteIds[0] }).eq('rfq_id', round.rfqId).select('id');
    expect(rejected(direct)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F-02 purchase_orders
// ---------------------------------------------------------------------------
describe('F-02 purchase_orders: no client INSERT, commercial columns frozen', () => {
  it('a manager cannot pre-insert a PO for a locked award; the legitimate reveal creates it', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { awardId, poId } = await awardRwa(round, false);
    expect(poId).toBeNull();

    const manager = await sessionFor(LOGIN.estateManager);
    const { error } = await manager.from('purchase_orders').insert({
      award_id: awardId,
      rfq_id: round.rfqId,
      organization_id: RWA_ORG,
      supplier_id: DEMO.suppliers.nandi,
      po_number: 'PO-FORGED-0001',
      status: 'ISSUED',
      total_amount: 1,
    });
    expect(error).not.toBeNull();
    const { count } = await service.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(count).toBe(0);

    expect((await manager.rpc('reveal_award', { p_rfq_id: round.rfqId })).error).toBeNull();
    const { data: po } = await service.from('purchase_orders').select('supplier_id, total_amount').eq('rfq_id', round.rfqId).single();
    expect(po!.supplier_id).toBe(DEMO.suppliers.aquaPrime);
    expect(Number(po!.total_amount)).toBe(11800);
  });

  it('manager and supplier cannot rewrite any commercial column of an existing PO', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { poId } = await awardRwa(round, true);
    const { data: before } = await service.from('purchase_orders').select('*').eq('id', poId!).single();

    const patches: Array<Record<string, unknown>> = [
      { total_amount: 1 },
      { supplier_id: DEMO.suppliers.nandi },
      { organization_id: MSME_ORG },
      { award_id: '00000000-0000-4000-8000-000000000001' },
      { rfq_id: '00000000-0000-4000-8000-000000000002' },
      { po_number: 'PO-HACKED' },
      { currency: 'USD' },
      { taxable_total: 1 },
      { cgst_total: 1 },
      { sgst_total: 1 },
      { igst_total: 1 },
      { tax_snapshot: { forged: true } },
      { delivery_address_snapshot: { forged: true } },
      { billing_address_snapshot: { forged: true } },
      { payment_structure: 'MILESTONE_BASED' },
      { payment_terms_text: '100% advance' },
      { payment_schedule: [{ forged: true }] },
    ];
    for (const email of [LOGIN.estateManager, LOGIN.supplier]) {
      const session = await sessionFor(email);
      for (const patch of patches) {
        const res = await session.from('purchase_orders').update(patch).eq('id', poId!).select('id');
        expect(rejected(res), `${email} ${JSON.stringify(patch)}`).toBe(true);
        if ('organization_id' in patch) continue; // may be refused by RLS WITH CHECK before the trigger message
        expect(res.error?.message, `${email} ${JSON.stringify(patch)}`).toMatch(/PO-COMMERCIAL-IMMUTABLE/);
      }
    }
    const { data: after } = await service.from('purchase_orders').select('*').eq('id', poId!).single();
    expect(after).toEqual(before);
  });

  it('supplier acceptance (status + acknowledged_at) and buyer cancellation still work', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { poId } = await awardRwa(round, true);

    const supplier = await sessionFor(LOGIN.supplier);
    const ack = new Date().toISOString();
    const accept = await supplier
      .from('purchase_orders')
      .update({ status: 'ACCEPTED', acknowledged_at: ack, updated_at: ack })
      .eq('id', poId!)
      .select('status, acknowledged_at');
    expect(accept.error).toBeNull();
    expect(accept.data![0]!.status).toBe('ACCEPTED');
    expect(accept.data![0]!.acknowledged_at).toBeTruthy();

    const round2 = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const second = await awardRwa(round2, true);
    const manager = await sessionFor(LOGIN.estateManager);
    const direct = await manager.from('purchase_orders').update({ status: 'CANCELLED' }).eq('id', second.poId!);
    expect(direct.error?.message).toMatch(/PO-CANCEL-DIRECT-WRITE/); // 00239 guard still in force
    const cancel = await manager.rpc('cancel_purchase_order_atomic', {
      p_po_id: second.poId,
      p_reason: 'Scope changed before supplier acceptance.',
    });
    expect(cancel.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F-03 quotes
// ---------------------------------------------------------------------------
describe('F-03 quotes: supplier flow intact, score / SELECTED / identity / version window frozen', () => {
  async function submittedRound(rfqStatus: 'OPEN' | 'EVALUATING' = 'OPEN') {
    return makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president, quoteStatus: 'SUBMITTED', versions: 2, rfqStatus });
  }

  async function stateOf(quoteId: string) {
    const { data } = await service
      .from('quotes')
      .select('rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score')
      .eq('id', quoteId)
      .single();
    return data!;
  }

  it('a supplier cannot write evaluation_score, SELECTED / NOT_SELECTED, rfq_id or supplier_id', async () => {
    const round = await submittedRound();
    const quoteId = round.winnerQuoteId;
    const before = await stateOf(quoteId);
    const supplier = await sessionFor(LOGIN.supplier);

    const other = await submittedRound();
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['score', { evaluation_score: 99 }, /QUOTE-SCORE-DIRECT-WRITE/],
      ['SELECTED', { status: 'SELECTED' }, /QUOTE-CLIENT-STATUS/],
      ['NOT_SELECTED', { status: 'NOT_SELECTED' }, /QUOTE-CLIENT-STATUS/],
      ['rfq_id', { rfq_id: other.rfqId }, /QUOTE-IDENTITY-IMMUTABLE/],
      ['supplier_id', { supplier_id: DEMO.suppliers.nandi }, /QUOTE-IDENTITY-IMMUTABLE|row-level security/],
      ['invitation_id', { invitation_id: '00000000-0000-4000-8000-000000000003' }, /QUOTE-IDENTITY-IMMUTABLE/],
    ];
    for (const [label, patch, message] of cases) {
      const res = await supplier.from('quotes').update(patch).eq('id', quoteId).select('id');
      expect(res.error?.message, label).toMatch(message);
    }
    expect(await stateOf(quoteId)).toEqual(before);
  });

  it('a supplier cannot re-point current_version to a non-latest or non-existent version, or outside the window', async () => {
    const round = await submittedRound();
    const quoteId = round.winnerQuoteId; // versions 1 and 2 exist, current_version = 1
    const supplier = await sessionFor(LOGIN.supplier);

    const missing = await supplier.from('quotes').update({ current_version: 9 }).eq('id', quoteId).select('id');
    expect(missing.error?.message).toMatch(/QUOTE-VERSION-BOUND/);

    // Window closes: RFQ moves to EVALUATING; even the genuine latest version cannot be selected now.
    await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', round.rfqId);
    const late = await supplier.from('quotes').update({ current_version: 2 }).eq('id', quoteId).select('id');
    expect(late.error?.message).toMatch(/QUOTE-WINDOW-CLOSED/);
    expect((await stateOf(quoteId)).current_version).toBe(1);
  });

  it('a buyer manager cannot update quotes at all (quotes_update_manager is gone)', async () => {
    const round = await submittedRound('EVALUATING');
    const before = await stateOf(round.winnerQuoteId);
    const manager = await sessionFor(LOGIN.estateManager);
    for (const patch of [{ evaluation_score: 100 }, { status: 'SELECTED' }, { current_version: 2 }]) {
      const res = await manager.from('quotes').update(patch).eq('id', round.winnerQuoteId).select('id');
      expect(rejected(res), JSON.stringify(patch)).toBe(true);
    }
    expect(await stateOf(round.winnerQuoteId)).toEqual(before);
  });

  it('a supplier cannot INSERT a quote with a score, a decided status, a wild version or a foreign invitation', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president, totals: [], rfqStatus: 'OPEN' });
    const creator = await profileIdFor(LOGIN.president);
    const { data: mine } = await service
      .from('rfq_invitations')
      .insert({ rfq_id: round.rfqId, supplier_id: DEMO.suppliers.aquaPrime, anonymous_label: 'Supplier QX', status: 'INVITED' })
      .select('id')
      .single();
    const { data: rivalInv } = await service
      .from('rfq_invitations')
      .insert({ rfq_id: round.rfqId, supplier_id: DEMO.suppliers.nandi, anonymous_label: 'Supplier QY', status: 'INVITED' })
      .select('id')
      .single();
    expect(creator).toBeTruthy();

    const supplier = await sessionFor(LOGIN.supplier);
    const base = {
      rfq_id: round.rfqId,
      supplier_id: DEMO.suppliers.aquaPrime,
      invitation_id: mine!.id,
      status: 'SUBMITTED',
      current_version: 1,
      submitted_at: new Date().toISOString(),
    };
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...base, evaluation_score: 100 }, /QUOTE-SCORE-DIRECT-WRITE/],
      [{ ...base, status: 'SELECTED' }, /QUOTE-CLIENT-STATUS/],
      [{ ...base, status: 'FINAL' }, /QUOTE-CLIENT-STATUS/],
      [{ ...base, current_version: 7 }, /QUOTE-VERSION-BOUND/],
      [{ ...base, invitation_id: rivalInv!.id }, /QUOTE-INVITATION-MISMATCH/],
    ];
    for (const [row, message] of bad) {
      const res = await supplier.from('quotes').insert(row).select('id');
      expect(res.error?.message, JSON.stringify(row)).toMatch(message);
    }
    const { count } = await service.from('quotes').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(count).toBe(0);

    // Legitimate: submit -> revise (new version, score cleared) -> finalize.
    const profile = await profileIdFor(LOGIN.supplier);
    const submit = await supplier.from('quotes').insert(base).select('id').single();
    expect(submit.error).toBeNull();
    const quoteId = submit.data!.id as string;
    const v1 = await supplier.from('quote_versions').insert({ quote_id: quoteId, version: 1, snapshot: STD_SNAPSHOT, created_by: profile });
    expect(v1.error).toBeNull();

    const v2 = await supplier
      .from('quote_versions')
      .insert({ quote_id: quoteId, version: 2, snapshot: { ...STD_SNAPSHOT, totalCost: 11000 }, created_by: profile });
    expect(v2.error).toBeNull();
    const revise = await supplier
      .from('quotes')
      .update({ status: 'REVISED', current_version: 2, submitted_at: new Date().toISOString(), evaluation_score: null })
      .eq('id', quoteId)
      .select('status, current_version');
    expect(revise.error).toBeNull();
    expect(revise.data![0]).toEqual({ status: 'REVISED', current_version: 2 });

    const fin = await supplier.from('quotes').update({ status: 'FINAL' }).eq('id', quoteId).select('status');
    expect(fin.error).toBeNull();
    expect(fin.data![0]!.status).toBe('FINAL');

    // Once the platform has decided, the supplier cannot reopen it.
    await service.from('quotes').update({ status: 'NOT_SELECTED' }).eq('id', quoteId);
    const reopen = await supplier.from('quotes').update({ status: 'REVISED' }).eq('id', quoteId).select('id');
    expect(reopen.error?.message).toMatch(/QUOTE-DECIDED/);
  });

  it('compute_quote_evaluations (internal definer path) can still write evaluation_score', async () => {
    const round = await submittedRound('EVALUATING');
    const manager = await sessionFor(LOGIN.estateManager);
    const { data, error } = await manager.rpc('compute_quote_evaluations', { p_rfq_id: round.rfqId });
    expect(error).toBeNull();
    expect((data as { scored: number }).scored).toBeGreaterThanOrEqual(1);
    const { data: rows } = await service.from('quotes').select('evaluation_score').eq('rfq_id', round.rfqId);
    expect(rows!.some((r) => r.evaluation_score !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F-04 conflict of interest
// ---------------------------------------------------------------------------
describe('F-04 COI: a subject cannot clear or rewrite their own DECLARED_CONFLICT', () => {
  async function voteCount(rfqId: string): Promise<number> {
    const { count } = await service.from('committee_votes').select('id', { count: 'exact', head: true }).eq('rfq_id', rfqId);
    return count ?? 0;
  }

  it('declare via own JWT, then clearing / rewriting / deleting / waiving is rejected; vote stays VOTE-UNAUTHORIZED', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await seat(round.rfqId, [LOGIN.committeeA, LOGIN.committeeB]);
    const profile = await profileIdFor(LOGIN.committeeA);

    const a = await sessionFor(LOGIN.committeeA);
    const declared = await a
      .from('conflict_of_interest_declarations')
      .insert({ rfq_id: round.rfqId, profile_id: profile, status: 'DECLARED_CONFLICT', description: 'Related to the supplier.' })
      .select('id')
      .single();
    expect(declared.error).toBeNull(); // legitimate declarant INSERT preserved
    const coiId = declared.data!.id as string;

    const manager = await sessionFor(LOGIN.estateManager);
    for (const [who, session] of [
      ['subject', a],
      ['manager', manager],
    ] as const) {
      for (const patch of [
        { status: 'DECLARED_NONE' },
        { status: 'WAIVED' },
        { description: 'rewritten' },
        { waived_by: profile, waived_at: new Date().toISOString() },
      ]) {
        const res = await session.from('conflict_of_interest_declarations').update(patch).eq('id', coiId).select('id');
        expect(rejected(res), `${who} ${JSON.stringify(patch)}`).toBe(true);
      }
      const del = await session.from('conflict_of_interest_declarations').delete().eq('id', coiId).select('id');
      expect(rejected(del), `${who} delete`).toBe(true);
    }

    // No self-waived row can be inserted either.
    const selfWaive = await a
      .from('conflict_of_interest_declarations')
      .insert({ rfq_id: round.rfqId, profile_id: profile, status: 'WAIVED', waived_by: profile, waived_at: new Date().toISOString() });
    expect(selfWaive.error).not.toBeNull();

    const { data: row } = await service.from('conflict_of_interest_declarations').select('status, description').eq('id', coiId).single();
    expect(row).toEqual({ status: 'DECLARED_CONFLICT', description: 'Related to the supplier.' });

    // 00238 stays: the conflicted member cannot vote (RPC or direct row), the unconflicted one still can.
    const rpcVote = await a.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(rpcVote.error?.message).toMatch(/VOTE-UNAUTHORIZED|Conflict of Interest/i);
    const direct = await a.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: profile,
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(direct.error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);

    const b = await sessionFor(LOGIN.committeeB);
    const ok = await b.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(ok.error).toBeNull();
    expect(await voteCount(round.rfqId)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// F-05 organization_members
// ---------------------------------------------------------------------------
describe('F-05 organization_members: no ordinary client INSERT', () => {
  it('a manager (and even an owner) cannot insert a membership row, in particular role OWNER', async () => {
    const victim = await profileIdFor('member2@sunrise.test');
    for (const email of [LOGIN.estateManager, LOGIN.president]) {
      const session = await sessionFor(email);
      for (const role of ['OWNER', 'MANAGER', 'APPROVER']) {
        const { error } = await session.from('organization_members').insert({ organization_id: RWA_ORG, profile_id: victim, role });
        expect(error, `${email} insert ${role}`).not.toBeNull();
      }
      // A self-escalation attempt: the manager inserting an OWNER row for themselves into another org.
      const self = await session
        .from('organization_members')
        .insert({ organization_id: MSME_ORG, profile_id: await profileIdFor(email), role: 'OWNER' });
      expect(self.error).not.toBeNull();
    }
    const { count } = await service
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', RWA_ORG)
      .eq('profile_id', victim);
    expect(count).toBe(0);
  });

  it('invite RPC still forbids OWNER; first-org provisioning (definer) and service creation can still insert OWNER', async () => {
    const president = await sessionFor(LOGIN.president);
    const asOwner = await president.rpc('invite_org_member', {
      p_organization_id: RWA_ORG,
      p_email: 'member2@sunrise.test',
      p_role: 'OWNER',
    });
    expect(asOwner.error?.message).toMatch(/Ownership cannot be assigned/i);

    // First-org creation as the product does it: a signed-in user with no membership calls the
    // SECURITY DEFINER ensure_buyer_organization(), which inserts the OWNER row on their behalf
    // even though the client INSERT policy / grant is gone.
    const email = DEMO.logins.tooSmallSupplier;
    const profileId = await profileIdFor(email);
    const { data: prior } = await service
      .from('profiles')
      .select('active_organization_id, active_portal_side')
      .eq('id', profileId)
      .single();
    const { count: priorMemberships } = await service
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId);
    expect(priorMemberships).toBe(0);
    try {
      const newcomer = await sessionFor(email);
      const provision = await newcomer.rpc('ensure_buyer_organization');
      expect(provision.error).toBeNull();
      const { data: owned } = await service
        .from('organization_members')
        .select('organization_id, role')
        .eq('profile_id', profileId);
      expect(owned).toHaveLength(1);
      expect(owned![0]!.role).toBe('OWNER');
      // ...while that same user still cannot add themselves to somebody else's organisation.
      const hijack = await newcomer
        .from('organization_members')
        .insert({ organization_id: RWA_ORG, profile_id: profileId, role: 'OWNER' });
      expect(hijack.error).not.toBeNull();
    } finally {
      const { data: created } = await service.from('organization_members').select('organization_id').eq('profile_id', profileId);
      await service.from('profiles').update(prior!).eq('id', profileId);
      await service.from('organization_members').delete().eq('profile_id', profileId);
      for (const row of created ?? []) {
        await service.from('organizations').delete().eq('id', row.organization_id).eq('org_type', 'INDIVIDUAL');
      }
    }

    // Internal / service creation can mint OWNER as well.
    const internal = await service
      .from('organization_members')
      .insert({ organization_id: RWA_ORG, profile_id: await profileIdFor('member3@sunrise.test'), role: 'OWNER' });
    expect(internal.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F-06 MSME approval route derivation
// ---------------------------------------------------------------------------
describe('F-06 MSME award requires the evaluated approval route when it applies', () => {
  const lockArgs = (round: Round) => ({
    p_rfq_id: round.rfqId,
    p_quote_id: round.winnerQuoteId,
    p_justification: 'Best landed cost with compliant references.',
  });

  it('not applicable (sub-5L, no policy): zero stages may award', async () => {
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [11800, 12400], retain: true });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const { count } = await service.from('rfq_approval_stages').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(count).toBe(0);
    expect((await buyer.rpc('lock_award', lockArgs(round))).error).toBeNull();
  });

  it('applicable (>= 5L) with NO stages is rejected, for tier-2 and tier-3 amounts', async () => {
    for (const total of [1_000_000, 3_000_000]) {
      const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [total, total + 100_000], retain: true });
      const buyer = await sessionFor(LOGIN.msmeBuyer);
      const lock = await buyer.rpc('lock_award', lockArgs(round));
      expect(lock.error?.message, String(total)).toMatch(/APPROVAL-ROUTE-REQUIRED/);
      const { count } = await service.from('awards').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
      expect(count).toBe(0);
    }
  });

  it('applicable because an active policy exists (small amount) with NO stages is rejected', async () => {
    const { error } = await service.from('organization_approval_policies').insert({ organization_id: MSME_ORG });
    expect(error).toBeNull();
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [11800, 12400], retain: true });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    expect((await buyer.rpc('lock_award', lockArgs(round))).error?.message).toMatch(/APPROVAL-ROUTE-REQUIRED/);
  });

  it('applicable with the correct evaluated + approved stages proceeds', async () => {
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [1_000_000, 1_100_000], retain: true });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const finance = await sessionFor(LOGIN.msmeFinance);
    expect(
      (await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: round.rfqId, p_procurement_amount: 1_000_000 })).error,
    ).toBeNull();
    // Pending stages still block (existing control).
    expect((await buyer.rpc('lock_award', lockArgs(round))).error?.message).toMatch(/pending satisfaction|APPROVAL-GATE/i);
    for (const tier of ['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']) {
      expect((await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: tier })).error).toBeNull();
    }
    expect((await buyer.rpc('lock_award', lockArgs(round))).error).toBeNull();
  });

  it('stale route (evaluated low, award high) and self-approval stay rejected', async () => {
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [3_000_000, 1_000_000], retain: true });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const finance = await sessionFor(LOGIN.msmeFinance);
    expect(
      (await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: round.rfqId, p_procurement_amount: 1_000_000 })).error,
    ).toBeNull();
    expect(
      (await buyer.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_1_MANAGER' })).error?.message,
    ).toMatch(/creator/i);
    for (const tier of ['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']) {
      expect((await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: tier })).error).toBeNull();
    }
    expect((await buyer.rpc('lock_award', lockArgs(round))).error?.message).toMatch(/APPROVAL-ROUTE-STALE/);
  });

  it('a runner-up reassignment must still satisfy the route of the new (costlier) quote', async () => {
    // Winner is sub-5L (route not applicable); the runner-up is 30L and needs a 3-tier chain.
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [11800, 3_000_000], retain: true });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    expect((await buyer.rpc('lock_award', lockArgs(round))).error).toBeNull();

    const runnerUp = await buyer.rpc('award_runner_up_quote', { p_rfq_id: round.rfqId, p_reason: 'Winner failed inspection.' });
    expect(runnerUp.error?.message).toMatch(/APPROVAL-ROUTE-REQUIRED/);
    const { data: award } = await service.from('awards').select('quote_id').eq('rfq_id', round.rfqId).single();
    expect(award!.quote_id).toBe(round.winnerQuoteId); // the failed reassignment rolled back completely
    const { data: quote } = await service.from('quotes').select('status').eq('id', round.winnerQuoteId).single();
    expect(quote!.status).not.toBe('WITHDRAWN');
  });
});

// ---------------------------------------------------------------------------
// F-06 residual (00243): organizations.org_type / is_demo are frozen against client UPDATE, so an
// owner cannot make the approval route "not applicable" before awarding.
// ---------------------------------------------------------------------------
describe('F-06 residual: an organisation owner cannot reclassify the organisation (00243)', () => {
  const lockArgs = (round: Round) => ({
    p_rfq_id: round.rfqId,
    p_quote_id: round.winnerQuoteId,
    p_justification: 'Best landed cost with compliant references.',
  });

  async function orgRow(id: string) {
    const { data } = await service.from('organizations').select('org_type, is_demo, city, name').eq('id', id).single();
    return data!;
  }

  it('owner cannot change org_type; it stays MSME', async () => {
    const owner = await sessionFor(LOGIN.msmeDirector);
    for (const target of ['INDIVIDUAL', 'COMMUNITY', 'ENTERPRISE']) {
      const { error } = await owner.from('organizations').update({ org_type: target }).eq('id', MSME_ORG);
      expect(error?.message, target).toMatch(/ORG-TYPE-IMMUTABLE/);
    }
    expect((await orgRow(MSME_ORG)).org_type).toBe('MSME');
  });

  it('owner cannot set is_demo (false -> true) and cannot clear it (true -> false); value unchanged', async () => {
    const owner = await sessionFor(LOGIN.msmeDirector);
    const set = await owner.from('organizations').update({ is_demo: true }).eq('id', MSME_ORG);
    expect(set.error?.message).toMatch(/ORG-DEMO-IMMUTABLE/);
    expect((await orgRow(MSME_ORG)).is_demo).toBe(false);

    // Reverse: a demo-flagged organisation (flag set by the service role) cannot be un-flagged by its owner.
    const { error: flag } = await service.from('organizations').update({ is_demo: true }).eq('id', MSME_ORG);
    expect(flag).toBeNull();
    try {
      const clear = await owner.from('organizations').update({ is_demo: false }).eq('id', MSME_ORG);
      expect(clear.error?.message).toMatch(/ORG-DEMO-IMMUTABLE/);
      expect((await orgRow(MSME_ORG)).is_demo).toBe(true);
    } finally {
      await service.from('organizations').update({ is_demo: false }).eq('id', MSME_ORG);
    }
    expect((await orgRow(MSME_ORG)).is_demo).toBe(false);
  });

  it('the exploit cannot be staged: flipping org_type / is_demo fails, so an above-threshold award with no stages still fails closed', async () => {
    const owner = await sessionFor(LOGIN.msmeDirector);
    const round = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, totals: [3_000_000, 3_100_000], retain: true });

    const flipType = await owner.from('organizations').update({ org_type: 'INDIVIDUAL' }).eq('id', MSME_ORG);
    expect(flipType.error?.message).toMatch(/ORG-TYPE-IMMUTABLE/);
    const flipDemo = await owner.from('organizations').update({ is_demo: true }).eq('id', MSME_ORG);
    expect(flipDemo.error?.message).toMatch(/ORG-DEMO-IMMUTABLE/);
    // Both at once, as a real exploit would send them.
    const both = await owner.from('organizations').update({ org_type: 'COMMUNITY', is_demo: true }).eq('id', MSME_ORG);
    expect(both.error).not.toBeNull();
    expect(await orgRow(MSME_ORG)).toMatchObject({ org_type: 'MSME', is_demo: false });

    const { count: stages } = await service.from('rfq_approval_stages').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(stages).toBe(0);
    for (const email of [LOGIN.msmeBuyer, LOGIN.msmeDirector]) {
      const session = await sessionFor(email);
      expect((await session.rpc('lock_award', lockArgs(round))).error?.message, email).toMatch(/APPROVAL-ROUTE-REQUIRED/);
    }
    const { count: awards } = await service.from('awards').select('id', { count: 'exact', head: true }).eq('rfq_id', round.rfqId);
    expect(awards).toBe(0);
  });

  it('other owner updates are untouched; a no-op org_type write and the service role still work', async () => {
    const owner = await sessionFor(LOGIN.msmeDirector);
    const before = await orgRow(MSME_ORG);
    try {
      const profile = await owner.from('organizations').update({ city: 'Mysuru' }).eq('id', MSME_ORG);
      expect(profile.error).toBeNull();
      expect((await orgRow(MSME_ORG)).city).toBe('Mysuru');

      const noop = await owner.from('organizations').update({ org_type: 'MSME', is_demo: false, city: 'Bengaluru' }).eq('id', MSME_ORG);
      expect(noop.error).toBeNull();
      expect((await orgRow(MSME_ORG)).city).toBe('Bengaluru');

      // Trusted (service-role) classification change is still possible.
      const trusted = await service.from('organizations').update({ org_type: 'ENTERPRISE' }).eq('id', MSME_ORG);
      expect(trusted.error).toBeNull();
      expect((await orgRow(MSME_ORG)).org_type).toBe('ENTERPRISE');
    } finally {
      await service.from('organizations').update({ org_type: before.org_type, is_demo: before.is_demo, city: before.city }).eq('id', MSME_ORG);
    }
    expect(await orgRow(MSME_ORG)).toMatchObject({ org_type: 'MSME', is_demo: false });
  });

  it('trusted creation path: ensure_buyer_organization inserts an INDIVIDUAL org, whose owner then cannot reclassify it', async () => {
    const email = DEMO.logins.tooSmallSupplier;
    const profileId = await profileIdFor(email);
    const { data: prior } = await service.from('profiles').select('active_organization_id, active_portal_side').eq('id', profileId).single();
    const { count: priorMemberships } = await service
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId);
    expect(priorMemberships).toBe(0);
    try {
      const newcomer = await sessionFor(email);
      const provision = await newcomer.rpc('ensure_buyer_organization');
      expect(provision.error).toBeNull();
      const orgId = (provision.data as { organizationId: string }).organizationId;
      expect((await orgRow(orgId)).org_type).toBe('INDIVIDUAL'); // INSERT with the correct org_type succeeded

      const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('profile_id', profileId)
        .single();
      expect(member!.role).toBe('OWNER');

      // Ordinary owner updates still work ...
      const rename = await newcomer.from('organizations').update({ city: 'Pune' }).eq('id', orgId);
      expect(rename.error).toBeNull();
      // ... but the classification is frozen in both directions.
      const toMsme = await newcomer.from('organizations').update({ org_type: 'MSME' }).eq('id', orgId);
      expect(toMsme.error?.message).toMatch(/ORG-TYPE-IMMUTABLE/);
      const toDemo = await newcomer.from('organizations').update({ is_demo: true }).eq('id', orgId);
      expect(toDemo.error?.message).toMatch(/ORG-DEMO-IMMUTABLE/);
      expect(await orgRow(orgId)).toMatchObject({ org_type: 'INDIVIDUAL', is_demo: false });
    } finally {
      const { data: created } = await service.from('organization_members').select('organization_id').eq('profile_id', profileId);
      await service.from('profiles').update(prior!).eq('id', profileId);
      await service.from('organization_members').delete().eq('profile_id', profileId);
      for (const row of created ?? []) {
        await service.from('organizations').delete().eq('id', row.organization_id).eq('org_type', 'INDIVIDUAL');
      }
    }
  });
});
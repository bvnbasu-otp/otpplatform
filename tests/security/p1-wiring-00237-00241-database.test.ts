/**
 * P1 wiring remediation (migrations 00237 - 00241) against the REAL local database.
 *
 *   P1-A  MSME multi-tier approval stages are persisted and gate the award (00237)
 *   P1-B  RWA committee votes are authorised at the write boundary (00238)
 *   P1-C  PO cancellation is an authoritative RPC, enforced against direct writes (00239)
 *   P1-D  The buyer's payment plan persists onto the PO, schedule and milestones (00240)
 *   P1-E  The decision receipt only carries authoritative data (00241)
 *
 * Every prohibited action is attempted through the backend (RPC or direct table write with a
 * real user session), never by checking a hidden button.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
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
const RWA_ORG = 'e2e00000-0000-4000-8000-0000000000a5';
const MSME_ORG = 'e2e00000-0000-4000-8000-0000000000a6';

const LOGIN = {
  estateManager: DEMO.logins.sunriseManager, // secretary@sunrise.test: MANAGER + active role FACILITY_MANAGER
  committeeA: DEMO.logins.sunriseCommittee, // treasurer@sunrise.test: COMMITTEE_MEMBER
  committeeB: DEMO.logins.sunriseCommittee2, // member1@sunrise.test: COMMITTEE_MEMBER
  president: 'president@sunrise.test', // OWNER
  supplier: DEMO.logins.motorSupplier,
  rival: DEMO.logins.kovaiOwner,
  msmeBuyer: 'buyer@apex.test', // becomes MANAGER (and RFQ creator)
  msmeFinance: 'finance@apex.test', // becomes APPROVER
  msmeDirector: 'director@apex.test', // becomes OWNER
};

let service: SupabaseClient;
let up = false;
const requirementIds: string[] = [];
/** Requirements whose RFQs hold append-only approval route evaluations (00191) cannot be deleted. */
const retainedRequirementIds: string[] = [];
let stubWasEnabled = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;
  service = createServiceClient();

  // The local demo environment auto-accepts every PO (pilot supplier stub, 00110). That simulator would
  // accept the PO before the buyer can cancel it, so it is switched off for this suite and restored after.
  const { data: demo } = await service.from('demo_settings').select('supplier_network_stub_enabled').eq('id', true).single();
  stubWasEnabled = Boolean(demo?.supplier_network_stub_enabled);
  if (stubWasEnabled) {
    const { error } = await service.from('demo_settings').update({ supplier_network_stub_enabled: false }).eq('id', true);
    if (error) throw new Error(`cannot disable supplier stub: ${error.message}`);
  }

  for (const [id, name, type] of [
    [RWA_ORG, 'P1 Wiring RWA Fixture', 'COMMUNITY'],
    [MSME_ORG, 'P1 Wiring MSME Fixture', 'MSME'],
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
    const profile = await profileIdFor(email);
    const { error } = await service
      .from('organization_members')
      .insert({ organization_id: org, profile_id: profile, role });
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
  // P1-B2 fixtures: offices and spare members are per-test.
  await service.from('org_role_assignments').delete().eq('organization_id', RWA_ORG);
  const spare = await Promise.all(
    ['manager@sunrise.test', 'member2@sunrise.test', 'member3@sunrise.test', 'member4@sunrise.test'].map(profileIdFor),
  );
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

interface QuoteSpec {
  supplierId: string;
  snapshot: Record<string, unknown>;
  evaluationScore?: number;
}

interface Round {
  orgId: string;
  rfqId: string;
  requirementId: string;
  quoteIds: string[];
  winnerQuoteId: string;
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

/** An enquiry sitting in EVALUATING with sealed quotes. quotes[0] is the winner. */
async function makeRound(opts: {
  orgId: string;
  creatorEmail: string;
  quotes?: QuoteSpec[];
  paymentTerms?: string | null;
  deliveryAddress?: Record<string, unknown> | null;
  retain?: boolean;
}): Promise<Round> {
  const creator = await profileIdFor(opts.creatorEmail);
  const quotes = opts.quotes ?? [
    { supplierId: DEMO.suppliers.aquaPrime, snapshot: STD_SNAPSHOT },
    { supplierId: DEMO.suppliers.nandi, snapshot: { ...STD_SNAPSHOT, totalCost: 12400 } },
  ];

  const { data: sub } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const commercial = opts.paymentTerms === undefined ? {} : { paymentTerms: opts.paymentTerms };
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
      title: 'P1 wiring fixture',
      description: 'tests/security/p1-wiring-00237-00241-database.test.ts',
      delivery_city: 'Bengaluru',
      commercial,
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
      title: 'P1 wiring fixture RFQ',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
      ...(opts.deliveryAddress ? { delivery_address_snapshot: opts.deliveryAddress } : {}),
    })
    .select('id')
    .single();
  expect(rfqError).toBeNull();
  await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

  const quoteIds: string[] = [];
  for (const spec of quotes) {
    const { data: invitation, error: inviteError } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: spec.supplierId,
        anonymous_label: `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: 'QUOTED',
      })
      .select('id')
      .single();
    expect(inviteError).toBeNull();

    const { data: quote, error: quoteError } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: spec.supplierId,
        invitation_id: invitation!.id,
        status: 'FINAL',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(quoteError).toBeNull();

    const { error: versionError } = await service.from('quote_versions').upsert({
      quote_id: quote!.id,
      version: 1,
      snapshot: spec.snapshot,
      created_by: creator,
    });
    expect(versionError).toBeNull();
    if (spec.evaluationScore !== undefined) {
      const { error } = await service
        .from('quotes')
        .update({ evaluation_score: spec.evaluationScore })
        .eq('id', quote!.id);
      expect(error).toBeNull();
    }
    quoteIds.push(quote!.id);
  }

  const { error: statusError } = await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);
  expect(statusError).toBeNull();

  return {
    orgId: opts.orgId,
    rfqId: rfq!.id,
    requirementId: requirement!.id,
    quoteIds,
    winnerQuoteId: quoteIds[0]!,
  };
}

/**
 * Mirrors close_clarification_for_evaluation (00050), which auto-seats org members on the RFQ.
 * The fixture builder flips status directly, so the RFQ-level seat is added explicitly here.
 */
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

/** RWA path: quorum votes, lock, reveal -> PO + receipts. */
async function awardAndRevealRwa(round: Round): Promise<{ awardId: string; poId: string }> {
  await recommendWinner(round);
  const manager = await sessionFor(LOGIN.estateManager);
  const lock = await manager.rpc('lock_award', {
    p_rfq_id: round.rfqId,
    p_quote_id: round.winnerQuoteId,
    p_justification: 'Best fit on compliance and turnaround.',
  });
  expect(lock.error).toBeNull();
  const reveal = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
  expect(reveal.error).toBeNull();
  const { data: award } = await service.from('awards').select('id').eq('rfq_id', round.rfqId).single();
  const { data: po, error } = await service
    .from('purchase_orders')
    .select('id')
    .eq('rfq_id', round.rfqId)
    .single();
  expect(error).toBeNull();
  return { awardId: award!.id as string, poId: po!.id as string };
}

// ---------------------------------------------------------------------------
// P1-A  MSME approval stages
// ---------------------------------------------------------------------------

describe('P1-A MSME multi-tier approval: policy -> route -> persisted stages -> approvers -> award', () => {
  const BIG_QUOTE = { ...STD_SNAPSHOT, basePrice: 2542372.88, gstAmount: 457627.12, totalCost: 3_000_000 };

  async function bigRound(): Promise<Round> {
    return makeRound({
      orgId: MSME_ORG,
      creatorEmail: LOGIN.msmeBuyer,
      retain: true,
      quotes: [
        { supplierId: DEMO.suppliers.aquaPrime, snapshot: BIG_QUOTE },
        { supplierId: DEMO.suppliers.nandi, snapshot: { ...BIG_QUOTE, totalCost: 3_100_000 } },
      ],
    });
  }

  async function stagesOf(rfqId: string) {
    const { data } = await service
      .from('rfq_approval_stages')
      .select('tier_level, stage_order, status, approver_profile_id, procurement_amount')
      .eq('rfq_id', rfqId)
      .order('stage_order');
    return data ?? [];
  }

  it('evaluating the route for a > 25L quote persists three ordered PENDING stages', async () => {
    const round = await bigRound();
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const { data, error } = await buyer.rpc('evaluate_and_stamp_approval_route_atomic', {
      p_rfq_id: round.rfqId,
      p_procurement_amount: 3_000_000,
    });
    expect(error).toBeNull();
    expect((data as { stagesMaterialized: boolean }).stagesMaterialized).toBe(true);

    const stages = await stagesOf(round.rfqId);
    expect(stages.map((s) => s.tier_level)).toEqual(['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE']);
    expect(stages.map((s) => s.stage_order)).toEqual([1, 2, 3]);
    expect(stages.every((s) => s.status === 'PENDING')).toBe(true);
    expect(Number(stages[0]!.procurement_amount)).toBe(3_000_000);

    // Idempotent: evaluating again never duplicates or resets the chain.
    const again = await buyer.rpc('evaluate_and_stamp_approval_route_atomic', {
      p_rfq_id: round.rfqId,
      p_procurement_amount: 3_000_000,
    });
    expect(again.error).toBeNull();
    expect(await stagesOf(round.rfqId)).toHaveLength(3);
  });

  it('a 5L-25L quote needs two stages; a sub-5L quote with no policy needs none', async () => {
    const mid = await makeRound({
      orgId: MSME_ORG,
      creatorEmail: LOGIN.msmeBuyer,
      retain: true,
      quotes: [
        { supplierId: DEMO.suppliers.aquaPrime, snapshot: { ...STD_SNAPSHOT, totalCost: 1_000_000 } },
        { supplierId: DEMO.suppliers.nandi, snapshot: { ...STD_SNAPSHOT, totalCost: 1_100_000 } },
      ],
    });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    expect(
      (await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: mid.rfqId, p_procurement_amount: 1_000_000 }))
        .error,
    ).toBeNull();
    expect((await stagesOf(mid.rfqId)).map((s) => s.tier_level)).toEqual(['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']);

    const small = await makeRound({ orgId: MSME_ORG, creatorEmail: LOGIN.msmeBuyer, retain: true });
    expect(
      (await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: small.rfqId, p_procurement_amount: 11800 }))
        .error,
    ).toBeNull();
    expect(await stagesOf(small.rfqId)).toHaveLength(0);
  });

  it('refuses an evaluated amount that matches no live quote (cannot dodge higher tiers)', async () => {
    const round = await bigRound();
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const { error } = await buyer.rpc('evaluate_and_stamp_approval_route_atomic', {
      p_rfq_id: round.rfqId,
      p_procurement_amount: 100,
    });
    expect(error?.message).toMatch(/APPROVAL-ROUTE-AMOUNT/);
    expect(await stagesOf(round.rfqId)).toHaveLength(0);
  });

  it('refuses a caller outside the buying organisation', async () => {
    const round = await bigRound();
    const rival = await sessionFor(LOGIN.rival);
    const { error } = await rival.rpc('evaluate_and_stamp_approval_route_atomic', {
      p_rfq_id: round.rfqId,
      p_procurement_amount: 3_000_000,
    });
    expect(error?.message).toMatch(/APPROVAL-ROUTE-UNAUTHORIZED|Cross-tenant/i);
  });

  it('stages cannot be created, edited or deleted by a client directly', async () => {
    const round = await bigRound();
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: round.rfqId, p_procurement_amount: 3_000_000 });

    const approver = await sessionFor(LOGIN.msmeFinance);
    const forge = await approver
      .from('rfq_approval_stages')
      .update({ status: 'APPROVED' })
      .eq('rfq_id', round.rfqId);
    expect(forge.error?.message).toMatch(/APPROVAL-STAGE-DIRECT-WRITE/);
    const wipe = await approver.from('rfq_approval_stages').delete().eq('rfq_id', round.rfqId);
    expect(wipe.error?.message).toMatch(/APPROVAL-STAGE-DIRECT-WRITE/);
    const insert = await approver.from('rfq_approval_stages').insert({
      rfq_id: round.rfqId,
      organization_id: MSME_ORG,
      tier_level: 'TIER_1_MANAGER',
      stage_order: 9,
      procurement_amount: 1,
    });
    expect(insert.error?.message).toMatch(/APPROVAL-STAGE-DIRECT-WRITE/);
    expect((await stagesOf(round.rfqId)).every((s) => s.status === 'PENDING')).toBe(true);
  });

  it('award is blocked until every required stage is approved, by the authorised approver, in order', async () => {
    const round = await bigRound();
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const finance = await sessionFor(LOGIN.msmeFinance);
    const director = await sessionFor(LOGIN.msmeDirector);

    await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: round.rfqId, p_procurement_amount: 3_000_000 });

    const lockArgs = {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'Best landed cost with compliant references.',
    };

    // Gate is no longer vacuous.
    expect((await buyer.rpc('lock_award', lockArgs)).error?.message).toMatch(/pending satisfaction|APPROVAL-GATE/i);

    // Sequence: tier 2 cannot be signed before tier 1.
    expect(
      (await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_2_DEPT_HEAD' }))
        .error?.message,
    ).toMatch(/Sequential governance/i);

    // Anti-self-approval: the RFQ creator cannot sign.
    expect(
      (await buyer.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_1_MANAGER' }))
        .error?.message,
    ).toMatch(/creator/i);

    // Tier 1 by an authorised approver.
    const t1 = await finance.rpc('submit_rfq_tier_approval_atomic', {
      p_rfq_id: round.rfqId,
      p_tier_level: 'TIER_1_MANAGER',
    });
    expect(t1.error).toBeNull();
    expect((t1.data as { status: string }).status).toBe('APPROVED');
    expect((await buyer.rpc('lock_award', lockArgs)).error?.message).toMatch(/pending satisfaction|APPROVAL-GATE/i);

    // Replay is refused.
    expect(
      (await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_1_MANAGER' }))
        .error?.message,
    ).toMatch(/already APPROVED|replay/i);

    // Tier 2.
    expect(
      (await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_2_DEPT_HEAD' }))
        .error,
    ).toBeNull();

    // Tier 3 is executive-only: APPROVER role is refused, OWNER is accepted.
    expect(
      (await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: 'TIER_3_EXECUTIVE' }))
        .error?.message,
    ).toMatch(/not authorized for Tier 3/i);
    expect((await buyer.rpc('lock_award', lockArgs)).error?.message).toMatch(/pending satisfaction|APPROVAL-GATE/i);

    const t3 = await director.rpc('submit_rfq_tier_approval_atomic', {
      p_rfq_id: round.rfqId,
      p_tier_level: 'TIER_3_EXECUTIVE',
    });
    expect(t3.error).toBeNull();
    expect((t3.data as { allStagesApproved: boolean }).allStagesApproved).toBe(true);

    // All stages complete -> award proceeds.
    const lock = await buyer.rpc('lock_award', lockArgs);
    expect(lock.error).toBeNull();
    const { data: award } = await service.from('awards').select('quote_id').eq('rfq_id', round.rfqId).single();
    expect(award!.quote_id).toBe(round.winnerQuoteId);

    const { data: audit } = await service
      .from('audit_events')
      .select('event_type')
      .eq('organization_id', MSME_ORG)
      .eq('entity_type', 'rfq_approval_stage')
      .in('event_type', ['rfq.tier_approved']);
    expect((audit ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('an award for a quote costlier than the evaluated route is refused (stale route)', async () => {
    // Evaluate at the cheap quote, then try to award a quote that needs a longer chain.
    const round = await makeRound({
      orgId: MSME_ORG,
      creatorEmail: LOGIN.msmeBuyer,
      retain: true,
      quotes: [
        { supplierId: DEMO.suppliers.aquaPrime, snapshot: BIG_QUOTE },
        { supplierId: DEMO.suppliers.nandi, snapshot: { ...STD_SNAPSHOT, totalCost: 1_000_000 } },
      ],
    });
    const buyer = await sessionFor(LOGIN.msmeBuyer);
    const finance = await sessionFor(LOGIN.msmeFinance);
    expect(
      (await buyer.rpc('evaluate_and_stamp_approval_route_atomic', { p_rfq_id: round.rfqId, p_procurement_amount: 1_000_000 }))
        .error,
    ).toBeNull();
    for (const tier of ['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']) {
      expect(
        (await finance.rpc('submit_rfq_tier_approval_atomic', { p_rfq_id: round.rfqId, p_tier_level: tier })).error,
      ).toBeNull();
    }
    const lock = await buyer.rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId, // the 30L quote
      p_justification: 'Attempt to award above the evaluated route.',
    });
    expect(lock.error?.message).toMatch(/APPROVAL-ROUTE-STALE/);
  });
});

// ---------------------------------------------------------------------------
// P1-B  RWA votes
// ---------------------------------------------------------------------------

describe('P1-B RWA committee vote authority is enforced by the database', () => {
  it('rejects an Estate / Facility Manager vote through the cast_committee_vote RPC', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const estate = await sessionFor(LOGIN.estateManager);
    const { error } = await estate.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    const { count } = await service
      .from('committee_votes')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', round.rfqId);
    expect(count).toBe(0);
  });

  it('rejects the same vote written directly into committee_votes with the manager session (RLS path)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const estate = await sessionFor(LOGIN.estateManager);
    const { data: me } = await estate.from('profiles').select('id').eq('email', LOGIN.estateManager).single();
    const { error } = await estate.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: me!.id,
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(error).not.toBeNull();
    const { count } = await service
      .from('committee_votes')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', round.rfqId);
    expect(count).toBe(0);
  });

  it('rejects the Estate Manager even when the service role writes the row (trigger, not UI)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { error } = await service.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(LOGIN.estateManager),
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(error?.message).toMatch(/VOTE-UNAUTHORIZED/);
  });

  it('keeps a facility manager out even when an RFQ-level committee seat was auto-assigned', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { error: seatError } = await service.from('committee_assignments').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(LOGIN.estateManager),
    });
    expect(seatError).toBeNull();
    const estate = await sessionFor(LOGIN.estateManager);
    const { error } = await estate.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(error?.message).toMatch(/VOTE-UNAUTHORIZED/);
  });

  it('still lets authorised committee members vote, with weight stamped and revisions allowed', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await seat(round.rfqId, [LOGIN.committeeA, LOGIN.committeeB, LOGIN.president]);
    for (const email of [LOGIN.committeeA, LOGIN.committeeB, LOGIN.president]) {
      const session = await sessionFor(email);
      const { error } = await session.rpc('cast_committee_vote', {
        p_rfq_id: round.rfqId,
        p_recommended_quote_id: round.winnerQuoteId,
        p_choice: 'RECOMMEND',
      });
      expect(error, `${email} must be able to vote`).toBeNull();
    }
    const { data: votes } = await service
      .from('committee_votes')
      .select('profile_id, voting_power, choice')
      .eq('rfq_id', round.rfqId);
    expect(votes).toHaveLength(3);
    expect(votes!.every((v) => Number(v.voting_power) > 0)).toBe(true);

    // Revision by the same member is a new append-only vote, not a rejection.
    const a = await sessionFor(LOGIN.committeeA);
    const revise = await a.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.quoteIds[1],
      p_choice: 'RECOMMEND',
    });
    expect(revise.error).toBeNull();
  });

  it('still refuses a user from another organisation (org isolation) and a locked award', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const rival = await sessionFor(LOGIN.rival);
    const out = await rival.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(out.error).not.toBeNull();

    await recommendWinner(round);
    const manager = await sessionFor(LOGIN.estateManager);
    expect(
      (await manager.rpc('lock_award', {
        p_rfq_id: round.rfqId,
        p_quote_id: round.winnerQuoteId,
        p_justification: 'Quorum met with two committee recommendations.',
      })).error,
    ).toBeNull();
    const late = await (await sessionFor(LOGIN.president)).rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
    expect(late.error?.message).toMatch(/Voting is closed/i);
  });

  it('quorum still requires two unconflicted committee votes', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const manager = await sessionFor(LOGIN.estateManager);
    const lock = await manager.rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'No votes at all.',
    });
    expect(lock.error?.message).toMatch(/quorum/i);
  });
});

describe('P1-B2 RWA vote needs an active appointment AND the RFQ seat AND no COI', () => {
  const SPARE = {
    manager: 'manager@sunrise.test', // plain MANAGER, no active facility role
    buyer: 'member2@sunrise.test', // re-homed as BUYER in the fixture RWA
    expired: 'member3@sunrise.test', // COMMITTEE_MEMBER whose office has lapsed
    unseated: 'member4@sunrise.test', // legitimate COMMITTEE_MEMBER, never seated on the RFQ
  };

  async function setMember(email: string, role: string): Promise<void> {
    const profile = await profileIdFor(email);
    await service.from('organization_members').delete().eq('organization_id', RWA_ORG).eq('profile_id', profile);
    const { error } = await service
      .from('organization_members')
      .insert({ organization_id: RWA_ORG, profile_id: profile, role });
    if (error) throw new Error(`fixture member ${email}: ${error.message}`);
  }

  async function office(email: string, roleId: string, fromMs: number, toMs: number | null, status = 'ACTIVE') {
    const { error } = await service.from('org_role_assignments').insert({
      organization_id: RWA_ORG,
      person_id: await profileIdFor(email),
      role_id: roleId,
      role_name: roleId,
      status,
      effective_from: at(fromMs),
      effective_to: toMs === null ? null : at(toMs),
    });
    if (error) throw new Error(`fixture office ${email}: ${error.message}`);
  }

  async function voteCount(rfqId: string): Promise<number> {
    const { count } = await service.from('committee_votes').select('id', { count: 'exact', head: true }).eq('rfq_id', rfqId);
    return count ?? 0;
  }

  async function rpcVote(email: string, round: Round) {
    const session = await sessionFor(email);
    return session.rpc('cast_committee_vote', {
      p_rfq_id: round.rfqId,
      p_recommended_quote_id: round.winnerQuoteId,
      p_choice: 'RECOMMEND',
    });
  }

  async function directVote(email: string, round: Round, power = 1) {
    return service.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(email),
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: power,
    });
  }

  it('NEGATIVE: a MANAGER holding the auto-assigned RFQ seat is rejected (RPC and direct INSERT)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.manager, 'MANAGER');
    await seat(round.rfqId, [SPARE.manager]);
    expect((await rpcVote(SPARE.manager, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect((await directVote(SPARE.manager, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: a BUYER holding the auto-assigned RFQ seat is rejected (RPC and direct INSERT)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.buyer, 'BUYER');
    await seat(round.rfqId, [SPARE.buyer]);
    expect((await rpcVote(SPARE.buyer, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect((await directVote(SPARE.buyer, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: an Estate Manager (active FACILITY_MANAGER office) holding the seat is rejected', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.manager, 'MANAGER');
    await office(SPARE.manager, 'ESTATE_MANAGER', -HOUR, null);
    await seat(round.rfqId, [SPARE.manager]);
    expect((await rpcVote(SPARE.manager, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect((await directVote(SPARE.manager, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: an EXPIRED qualifying office plus the RFQ seat is rejected (RPC and direct INSERT)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.expired, 'COMMITTEE_MEMBER');
    await office(SPARE.expired, 'PRESIDENT', -400 * 24 * HOUR, -24 * HOUR); // ACTIVE row, effective_to in the past
    await seat(round.rfqId, [SPARE.expired]);
    expect((await rpcVote(SPARE.expired, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect((await directVote(SPARE.expired, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: a revoked office plus the RFQ seat is rejected', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.expired, 'COMMITTEE_MEMBER');
    await office(SPARE.expired, 'TREASURER', -48 * HOUR, null, 'REVOKED');
    await seat(round.rfqId, [SPARE.expired]);
    expect((await directVote(SPARE.expired, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: an appointed committee member WITHOUT the RFQ seat is rejected (RPC and direct INSERT)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.unseated, 'COMMITTEE_MEMBER');
    await office(SPARE.unseated, 'COMMITTEE_MEMBER', -HOUR, null);
    expect((await rpcVote(SPARE.unseated, round)).error).not.toBeNull();
    expect((await directVote(SPARE.unseated, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('NEGATIVE: a declared conflict of interest still recuses a seated, appointed member', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await seat(round.rfqId, [LOGIN.committeeA]);
    const { error: coiError } = await service.from('conflict_of_interest_declarations').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(LOGIN.committeeA),
      status: 'DECLARED_CONFLICT',
      description: 'P1-B2 recusal fixture',
    });
    expect(coiError).toBeNull();
    expect((await rpcVote(LOGIN.committeeA, round)).error?.message).toMatch(/Conflict of Interest/i);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  // Direct table INSERT with the voter's OWN JWT (user client, never service_role).
  async function authenticatedDirectVote(email: string, round: Round) {
    const session = await sessionFor(email);
    return session.from('committee_votes').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(email),
      recommended_quote_id: round.winnerQuoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
  }

  it('NEGATIVE: a declared COI blocks a seated, appointed voter writing committee_votes directly with their own JWT', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await office(LOGIN.committeeA, 'COMMITTEE_MEMBER', -HOUR, null); // active appointment
    await seat(round.rfqId, [LOGIN.committeeA]); // valid RFQ committee assignment
    const { data: rfq } = await service.from('rfqs').select('status').eq('id', round.rfqId).single();
    expect(rfq!.status).toBe('EVALUATING');
    const { error: coiError } = await service.from('conflict_of_interest_declarations').insert({
      rfq_id: round.rfqId,
      profile_id: await profileIdFor(LOGIN.committeeA),
      status: 'DECLARED_CONFLICT',
      description: 'P1-B2 direct-insert COI bypass fixture',
    });
    expect(coiError).toBeNull();

    const { error } = await authenticatedDirectVote(LOGIN.committeeA, round);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/VOTE-UNAUTHORIZED/);
    expect(error?.message).toMatch(/Conflict of Interest/i);
    expect(await voteCount(round.rfqId)).toBe(0);
  });

  it('POSITIVE: the same appointed + seated voter WITHOUT a COI can write committee_votes directly with their own JWT', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await office(LOGIN.committeeA, 'COMMITTEE_MEMBER', -HOUR, null);
    await seat(round.rfqId, [LOGIN.committeeA]);
    const { error } = await authenticatedDirectVote(LOGIN.committeeA, round);
    expect(error).toBeNull();
    expect(await voteCount(round.rfqId)).toBe(1);
  });

  it('POSITIVE: an active President (unexpired office) with the RFQ seat votes', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await office(LOGIN.president, 'PRESIDENT', -HOUR, 365 * 24 * HOUR);
    await seat(round.rfqId, [LOGIN.president]);
    expect((await rpcVote(LOGIN.president, round)).error).toBeNull();
    expect(await voteCount(round.rfqId)).toBe(1);
  });

  it('POSITIVE: an active committee member holding an unexpired office plus the seat votes', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await office(LOGIN.committeeA, 'COMMITTEE_MEMBER', -HOUR, null);
    await seat(round.rfqId, [LOGIN.committeeA]);
    expect((await rpcVote(LOGIN.committeeA, round)).error).toBeNull();
    expect(await voteCount(round.rfqId)).toBe(1);
  });

  it('weighted vote unchanged: power is stamped from buyer_type_config and a client-supplied weight is discarded', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await seat(round.rfqId, [LOGIN.committeeA]);
    const { data: cfg } = await service.from('buyer_type_config').select('voting_power').eq('org_type', 'COMMUNITY').single();
    const { error } = await directVote(LOGIN.committeeA, round, 99);
    expect(error).toBeNull();
    const { data: vote } = await service
      .from('committee_votes')
      .select('voting_power, buyer_type')
      .eq('rfq_id', round.rfqId)
      .single();
    expect(vote!.voting_power).toBe(cfg!.voting_power);
    expect(vote!.buyer_type).toBe('COMMUNITY');
  });

  it('quorum unchanged: one authorised vote is not quorum, and a rejected seat-only vote cannot complete it', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    await setMember(SPARE.manager, 'MANAGER');
    await seat(round.rfqId, [LOGIN.committeeA, SPARE.manager]);
    expect((await rpcVote(LOGIN.committeeA, round)).error).toBeNull();
    expect((await rpcVote(SPARE.manager, round)).error?.message).toMatch(/VOTE-UNAUTHORIZED/);

    const lock = await (await sessionFor(LOGIN.estateManager)).rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'One authorised vote plus a rejected seat-only vote.',
    });
    expect(lock.error?.message).toMatch(/quorum/i);

    // A second legitimate (appointed + seated) member satisfies quorum exactly as before.
    await seat(round.rfqId, [LOGIN.committeeB]);
    expect((await rpcVote(LOGIN.committeeB, round)).error).toBeNull();
    const ok = await (await sessionFor(LOGIN.estateManager)).rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'Two appointed and seated members recommended the winner.',
    });
    expect(ok.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1-C / P1-D / P1-E share an awarded + revealed RWA round
// ---------------------------------------------------------------------------

describe('P1-C buyer PO cancellation is enforced at the mutation boundary', () => {
  it('discovery: the cancellation columns now exist on purchase_orders', async () => {
    const { error } = await service
      .from('purchase_orders')
      .select('id, cancellation_reason, cancelled_at, cancelled_by')
      .limit(1);
    expect(error).toBeNull();
  });

  it('buyer manager cancels an ISSUED PO after reveal with a reason, and it is audited', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { poId } = await awardAndRevealRwa(round);

    const { data: before } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(before!.status).toBe('ISSUED');
    const { data: rfqRow } = await service.from('rfqs').select('reveal_status').eq('id', round.rfqId).single();
    expect(rfqRow!.reveal_status).toBe('REVEALED');

    const manager = await sessionFor(LOGIN.estateManager);
    const noReason = await manager.rpc('cancel_purchase_order_atomic', { p_po_id: poId, p_reason: '  ' });
    expect(noReason.error?.message).toMatch(/PO-CANCEL-REASON/);

    const ok = await manager.rpc('cancel_purchase_order_atomic', {
      p_po_id: poId,
      p_reason: 'Scope changed before supplier acceptance.',
    });
    expect(ok.error).toBeNull();

    const { data: after } = await service
      .from('purchase_orders')
      .select('status, cancellation_reason, cancelled_at, cancelled_by')
      .eq('id', poId)
      .single();
    expect(after!.status).toBe('CANCELLED');
    expect(after!.cancellation_reason).toBe('Scope changed before supplier acceptance.');
    expect(after!.cancelled_at).toBeTruthy();
    expect(after!.cancelled_by).toBe(await profileIdFor(LOGIN.estateManager));

    const { data: audit } = await service
      .from('audit_events')
      .select('payload')
      .eq('event_type', 'po.cancelled')
      .eq('entity_id', poId);
    expect(audit).toHaveLength(1);
    expect((audit![0]!.payload as { reason: string }).reason).toBe('Scope changed before supplier acceptance.');

    const twice = await manager.rpc('cancel_purchase_order_atomic', { p_po_id: poId, p_reason: 'Cancel again please.' });
    expect(twice.error?.message).toMatch(/PO-CANCEL-STATE/);
  });

  it('the supplier, an outsider and a non-manager member cannot cancel (RPC and direct update)', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { poId } = await awardAndRevealRwa(round);

    for (const [who, email] of [
      ['supplier', LOGIN.supplier],
      ['rival buyer org', LOGIN.rival],
      ['committee member (no manager authority)', LOGIN.committeeA],
    ] as const) {
      const session = await sessionFor(email);
      const rpc = await session.rpc('cancel_purchase_order_atomic', {
        p_po_id: poId,
        p_reason: 'Trying to cancel without authority.',
      });
      expect(rpc.error?.message, `${who} RPC`).toMatch(/PO-CANCEL-UNAUTHORIZED/);

      const direct = await session
        .from('purchase_orders')
        .update({ status: 'CANCELLED' })
        .eq('id', poId)
        .select('id');
      // Either RLS hides the row (no rows) or the guard trigger refuses; never a success.
      expect(direct.error !== null || (direct.data ?? []).length === 0, `${who} direct update`).toBe(true);
    }

    // Even a manager of the buyer org cannot bypass the RPC with a direct write.
    const manager = await sessionFor(LOGIN.estateManager);
    const direct = await manager
      .from('purchase_orders')
      .update({ status: 'CANCELLED', cancellation_reason: 'no audit' })
      .eq('id', poId);
    expect(direct.error?.message).toMatch(/PO-CANCEL-DIRECT-WRITE/);

    const { data: still } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(still!.status).toBe('ISSUED');
  });

  it('an accepted PO cannot be cancelled', async () => {
    const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president });
    const { poId } = await awardAndRevealRwa(round);
    const { error: acceptError } = await service
      .from('purchase_orders')
      .update({ status: 'ACCEPTED', acknowledged_at: new Date().toISOString() })
      .eq('id', poId);
    expect(acceptError).toBeNull();

    const manager = await sessionFor(LOGIN.estateManager);
    const { error } = await manager.rpc('cancel_purchase_order_atomic', {
      p_po_id: poId,
      p_reason: 'Trying to cancel an accepted order.',
    });
    expect(error?.message).toMatch(/PO-CANCEL-STATE/);
    const { data } = await service.from('purchase_orders').select('status').eq('id', poId).single();
    expect(data!.status).toBe('ACCEPTED');
  });
});

describe('P1-D payment plan persists onto the PO, its schedule and its milestones', () => {
  const PLANS = [
    {
      name: 'Single',
      terms: '100% on delivery',
      structure: 'SINGLE_PAYMENT',
      percentages: [100],
      cumulative: [100],
    },
    {
      name: '30/50/20',
      terms: '30% Advance, 50% on Delivery, 20% on Acceptance',
      structure: 'THREE_PART_PAYMENT',
      percentages: [30, 50, 20],
      cumulative: [30, 80, 100],
    },
    {
      name: '4x25',
      terms: '25% Kickoff, 25% Dispatch, 25% Installation, 25% Sign-off',
      structure: 'MILESTONE_BASED',
      percentages: [25, 25, 25, 25],
      cumulative: [25, 50, 75, 100],
    },
  ] as const;

  for (const plan of PLANS) {
    it(`${plan.name}: value persists, PO reflects it, milestones are derived, receipt agrees`, async () => {
      const round = await makeRound({ orgId: RWA_ORG, creatorEmail: LOGIN.president, paymentTerms: plan.terms });
      const { awardId, poId } = await awardAndRevealRwa(round);

      // The buyer's selection is persisted on the requirement (authoritative declaration)...
      const { data: req } = await service.from('requirements').select('commercial').eq('id', round.requirementId).single();
      expect((req!.commercial as { paymentTerms: string }).paymentTerms).toBe(plan.terms);

      // ...and frozen onto the PO.
      const { data: po } = await service
        .from('purchase_orders')
        .select('total_amount, payment_structure, payment_terms_text, payment_schedule')
        .eq('id', poId)
        .single();
      expect(po!.payment_structure).toBe(plan.structure);
      expect(po!.payment_terms_text).toBe(plan.terms);
      const schedule = po!.payment_schedule as Array<{ percentage: number; amount: number; cumulativePercentage: number }>;
      expect(schedule.map((s) => s.percentage)).toEqual(plan.percentages);
      expect(schedule.map((s) => s.cumulativePercentage)).toEqual(plan.cumulative);
      expect(schedule.reduce((sum, s) => sum + Number(s.amount), 0)).toBeCloseTo(Number(po!.total_amount), 2);

      // Milestones for the work order follow the plan (not a fixed template).
      const { data: wo } = await service.from('work_orders').select('id').eq('purchase_order_id', poId).single();
      const { data: milestones } = await service
        .from('work_order_milestones')
        .select('milestone_index, target_percentage, allocated_amount')
        .eq('work_order_id', wo!.id)
        .order('milestone_index');
      expect(milestones!.map((m) => m.target_percentage)).toEqual(plan.cumulative);
      expect(milestones!.reduce((sum, m) => sum + Number(m.allocated_amount), 0)).toBeCloseTo(Number(po!.total_amount), 2);

      // The issued PO document lists the plan.
      const { data: doc } = await service
        .from('issued_document_snapshots')
        .select('payload_json')
        .eq('source_entity_id', poId)
        .eq('perspective', 'BUYER')
        .eq('status', 'ISSUED')
        .single();
      const notes = (doc!.payload_json as { procurementDocumentInput: { notes: string[] } }).procurementDocumentInput.notes;
      expect(notes.join(' ')).toContain(`Payment plan (${plan.structure})`);

      // The decision receipt reports the same structure instead of a hard-coded MILESTONE_BASED.
      const { data: receipt } = await service
        .from('issued_document_snapshots')
        .select('payload_json')
        .eq('source_entity_id', awardId)
        .eq('identity_state', 'POST_REVEAL')
        .eq('perspective', 'BUYER')
        .eq('document_kind', 'DECISION_RECEIPT')
        .single();
      const offer = (receipt!.payload_json as { canonicalDecisionReceipt: { selectedOffer: { paymentStructure: string } } })
        .canonicalDecisionReceipt.selectedOffer;
      expect(offer.paymentStructure).toBe(plan.structure);
    });
  }

  it('a plan the platform does not model stays CUSTOM_TERMS with no invented schedule', async () => {
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      paymentTerms: '45 days credit from invoice',
    });
    const { poId } = await awardAndRevealRwa(round);
    const { data: po } = await service
      .from('purchase_orders')
      .select('payment_structure, payment_schedule')
      .eq('id', poId)
      .single();
    expect(po!.payment_structure).toBe('CUSTOM_TERMS');
    expect(po!.payment_schedule).toEqual([]);
    const { data: wo } = await service.from('work_orders').select('id').eq('purchase_order_id', poId).single();
    const { count } = await service
      .from('work_order_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('work_order_id', wo!.id);
    expect(count).toBe(0);
  });

  it('the plan is frozen at PO creation: editing the requirement later does not rewrite the PO', async () => {
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      paymentTerms: '30% Advance, 50% on Delivery, 20% on Acceptance',
    });
    const { poId } = await awardAndRevealRwa(round);
    await service
      .from('requirements')
      .update({ commercial: { paymentTerms: '100% on delivery' } })
      .eq('id', round.requirementId);
    const { data: po } = await service.from('purchase_orders').select('payment_structure').eq('id', poId).single();
    expect(po!.payment_structure).toBe('THREE_PART_PAYMENT');
  });

  it('SQL resolver maps the three buyer presets and defaults the intake default', async () => {
    const cases: Array<[string | null, string]> = [
      ['100% on delivery', 'SINGLE_PAYMENT'],
      [null, 'SINGLE_PAYMENT'],
      ['30% Advance, 50% on Delivery, 20% on Acceptance', 'THREE_PART_PAYMENT'],
      ['25% Kickoff, 25% Dispatch, 25% Installation, 25% Sign-off', 'MILESTONE_BASED'],
      ['100% advance then net 30', 'CUSTOM_TERMS'],
    ];
    for (const [terms, expected] of cases) {
      const { data, error } = await service.rpc('resolve_declared_payment_structure', { p_terms: terms });
      expect(error).toBeNull();
      expect(data, String(terms)).toBe(expected);
    }
  });
});

describe('P1-E decision receipt carries only authoritative data', () => {
  async function receiptFor(awardId: string, state: 'PRE_REVEAL' | 'POST_REVEAL') {
    const { data, error } = await service
      .from('issued_document_snapshots')
      .select('payload_json')
      .eq('source_entity_id', awardId)
      .eq('identity_state', state)
      .eq('perspective', 'BUYER')
      .eq('document_kind', 'DECISION_RECEIPT')
      .eq('status', 'ISSUED')
      .single();
    expect(error).toBeNull();
    return (data!.payload_json as { canonicalDecisionReceipt: Record<string, any> }).canonicalDecisionReceipt;
  }

  it('does not fabricate rank, lowest cost, category, delivery, warranty or state when unknown', async () => {
    // Selected quote (11,800) is NOT the cheapest (competitor 9,000); nothing was scored; the quote states
    // no delivery / warranty / interstate flag; the RFQ has no delivery state.
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      quotes: [
        {
          supplierId: DEMO.suppliers.aquaPrime,
          snapshot: { basePrice: 10000, gstAmount: 1800, totalCost: 11800, currency: 'INR' },
        },
        { supplierId: DEMO.suppliers.nandi, snapshot: { basePrice: 9000, gstAmount: 0, totalCost: 9000, currency: 'INR' } },
      ],
    });
    const { awardId } = await awardAndRevealRwa(round);
    const receipt = await receiptFor(awardId, 'PRE_REVEAL');

    expect(receipt.selectedOffer.quoteId).toBe(round.winnerQuoteId);
    expect(receipt.selectedOffer.totalLandedCost).toBe(11800);
    expect(receipt.meritEvaluation.rank).toBeNull();
    expect(receipt.meritEvaluation.score).toBeNull();
    expect(receipt.meritEvaluation.totalQuotesEvaluated).toBe(2);
    expect(receipt.meritEvaluation.lowestTotalCost).toBe(9000);
    expect(receipt.meritEvaluation.selectedIsLowestCost).toBe(false);
    expect(receipt.selectedOffer.deliveryTimelineDays).toBeNull();
    expect(receipt.selectedOffer.warrantyPeriodMonths).toBeNull();
    expect(receipt.buyerContext.deliveryStateCode).toBeNull();
    expect(receipt.selectedOffer.taxSplitBasis).toBe('UNAVAILABLE');
    expect(receipt.requirementSnapshot.categoryName).not.toBe('General Procurement');
    expect(receipt.authorityAttribution.awardedByRole).toBe('MANAGER');
  });

  it('reports rank, merit score and lowest-cost claim only when calculated, and real values when present', async () => {
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      deliveryAddress: { stateCode: '27', city: 'Mumbai', pincode: '400001', line1: 'Site' },
      quotes: [
        {
          supplierId: DEMO.suppliers.aquaPrime,
          snapshot: { ...STD_SNAPSHOT, deliveryDays: 21, warrantyMonths: 36, isInterState: true },
          evaluationScore: 64,
        },
        {
          supplierId: DEMO.suppliers.nandi,
          snapshot: { ...STD_SNAPSHOT, totalCost: 10000, basePrice: 8474.58, gstAmount: 1525.42 },
          evaluationScore: 81,
        },
      ],
    });
    const { awardId } = await awardAndRevealRwa(round);
    const receipt = await receiptFor(awardId, 'POST_REVEAL');

    // Selected quote is second on merit and not cheapest.
    expect(receipt.meritEvaluation.rank).toBe(2);
    expect(receipt.meritEvaluation.score).toBeCloseTo(6.4, 1);
    expect(receipt.meritEvaluation.lowestTotalCost).toBe(10000);
    expect(receipt.meritEvaluation.selectedIsLowestCost).toBe(false);
    expect(receipt.selectedOffer.deliveryTimelineDays).toBe(21);
    expect(receipt.selectedOffer.warrantyPeriodMonths).toBe(36);
    expect(receipt.buyerContext.deliveryStateCode).toBe('27');
    expect(receipt.selectedOffer.isInterState).toBe(true);
    expect(receipt.selectedOffer.taxSplitBasis).toBe('QUOTE_SNAPSHOT');
    expect(receipt.requirementSnapshot.categoryName).toBeTruthy();
    expect(receipt.requirementSnapshot.categoryName).not.toBe('General Procurement');
    expect(receipt.authorityAttribution.awardedByRole).toBe('MANAGER');

    // The integrity digest still verifies after the truthfulness change.
    const { data: docRow } = await service
      .from('issued_document_snapshots')
      .select('document_id')
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'POST_REVEAL')
      .eq('perspective', 'BUYER')
      .eq('document_kind', 'DECISION_RECEIPT')
      .single();
    const manager = await sessionFor(LOGIN.estateManager);
    const verify = await manager.rpc('verify_issued_document_digest', { p_document_id: docRow!.document_id });
    expect(verify.error).toBeNull();
    expect((verify.data as { valid?: boolean }).valid).toBe(true);
  });

  it('claims lowest cost only when the selected quote really is the cheapest', async () => {
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      quotes: [
        { supplierId: DEMO.suppliers.aquaPrime, snapshot: STD_SNAPSHOT, evaluationScore: 90 },
        { supplierId: DEMO.suppliers.nandi, snapshot: { ...STD_SNAPSHOT, totalCost: 13000 }, evaluationScore: 70 },
      ],
    });
    const { awardId } = await awardAndRevealRwa(round);
    const receipt = await receiptFor(awardId, 'PRE_REVEAL');
    expect(receipt.meritEvaluation.rank).toBe(1);
    expect(receipt.meritEvaluation.lowestTotalCost).toBe(11800);
    expect(receipt.meritEvaluation.selectedIsLowestCost).toBe(true);
  });

  it('does not rank when only some quotes carry a calculated score', async () => {
    const round = await makeRound({
      orgId: RWA_ORG,
      creatorEmail: LOGIN.president,
      quotes: [
        { supplierId: DEMO.suppliers.aquaPrime, snapshot: STD_SNAPSHOT, evaluationScore: 90 },
        { supplierId: DEMO.suppliers.nandi, snapshot: { ...STD_SNAPSHOT, totalCost: 13000 } },
      ],
    });
    const { awardId } = await awardAndRevealRwa(round);
    const receipt = await receiptFor(awardId, 'PRE_REVEAL');
    expect(receipt.meritEvaluation.rank).toBeNull();
  });
});

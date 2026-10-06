/**
 * R2-31 — issued_document_snapshots RLS (existing 00222 policies).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';
import { deleteFixtureRequirements } from '../helpers/fixture-teardown';

let service: ReturnType<typeof createServiceClient>;
let dbUp = false;

const HOUR = 3_600_000;
const createdReqs: string[] = [];

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

beforeAll(async () => {
  dbUp = await isLocalSupabaseReachable();
  if (dbUp) service = createServiceClient();
});

beforeEach((ctx) => {
  if (!dbUp) ctx.skip();
});

afterEach(async () => {
  if (!dbUp) return;
  const ids = createdReqs.splice(0);
  if (ids.length > 0) await deleteFixtureRequirements(ids);
});

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

async function sessionFor(email: string) {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

async function recommendWinner(rfqId: string, quoteId: string): Promise<void> {
  const voters = [
    await profileIdFor(DEMO.logins.sunriseCommittee),
    await profileIdFor(DEMO.logins.sunriseCommittee2),
  ];
  // RFQ-level seat (normally added by close_clarification_for_evaluation, 00050); a vote needs appointment AND seat (00238).
  const { error: seatError } = await service
    .from('committee_assignments')
    .upsert(voters.map((profile_id) => ({ rfq_id: rfqId, profile_id })), { onConflict: 'rfq_id,profile_id' });
  expect(seatError).toBeNull();
  for (const profileId of voters) {
    const { error } = await service.from('committee_votes').insert({
      rfq_id: rfqId,
      profile_id: profileId,
      recommended_quote_id: quoteId,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(error).toBeNull();
  }
}

async function seedRevealedAward(): Promise<{ orgId: string; awardId: string; rfqId: string }> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);
  const orgId = DEMO.orgs.sunrise;

  const { data: subcategory } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: requirement } = await service
    .from('requirements')
    .insert({
      organization_id: orgId,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      status: 'QUOTING',
      title: 'Issued doc access fixture',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();
  createdReqs.push(requirement!.id);

  const { data: rfq } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: orgId,
      status: 'OPEN',
      reveal_status: 'BLIND',
      title: 'Access fixture RFQ',
      created_by: creator,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();

  const winnerSupplier = DEMO.suppliers.aquaPrime;
  const loserSupplier = DEMO.suppliers.nandi;

  for (const supplierId of [winnerSupplier, loserSupplier]) {
    const { data: invitation } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: supplierId,
        anonymous_label: `Supplier ${rfq!.id.replace(/-/g, '').slice(0, 8)}${supplierId.slice(-2)}`,
        status: 'QUOTED',
      })
      .select('id')
      .single();

    const { data: quote } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: supplierId,
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
      snapshot: { basePrice: 5000, gstAmount: 900, totalCost: 5900, isInterState: false },
      created_by: creator,
    });
  }

  await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);

  const { data: winnerQuote } = await service
    .from('quotes')
    .select('id')
    .eq('rfq_id', rfq!.id)
    .eq('supplier_id', winnerSupplier)
    .single();

  await recommendWinner(rfq!.id as string, winnerQuote!.id as string);

  const buyer = await sessionFor(DEMO.logins.sunriseManager);
  await buyer.rpc('lock_award', {
    p_rfq_id: rfq!.id,
    p_quote_id: winnerQuote!.id,
    p_justification: 'Access test lock',
  });
  await buyer.rpc('reveal_award', { p_rfq_id: rfq!.id });

  const { data: award } = await service.from('awards').select('id').eq('rfq_id', rfq!.id).single();

  return { orgId, awardId: award!.id as string, rfqId: rfq!.id as string };
}

describe('00222 — issued snapshot access (REAL DATABASE)', () => {
  it('buyer org member can read own BUYER POST_REVEAL snapshot', async () => {
    const { orgId, awardId } = await seedRevealedAward();
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const { data, error } = await buyer
      .from('issued_document_snapshots')
      .select('id, identity_state, perspective')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'POST_REVEAL')
      .eq('perspective', 'BUYER');
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it('cross-org buyer cannot read another org issued snapshots', async () => {
    const { orgId, awardId } = await seedRevealedAward();
    const outsider = await sessionFor(DEMO.logins.kovaiOwner);
    const { data, error } = await outsider
      .from('issued_document_snapshots')
      .select('id')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('awarded supplier can read own SUPPLIER POST_REVEAL row only', async () => {
    const { awardId } = await seedRevealedAward();
    const winner = await sessionFor(DEMO.logins.motorSupplier);
    const { data, error } = await winner
      .from('issued_document_snapshots')
      .select('id, perspective, source_supplier_id')
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'POST_REVEAL');
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(1);
    expect(data!.every((r) => r.perspective === 'SUPPLIER')).toBe(true);
    expect(data!.every((r) => r.source_supplier_id === DEMO.suppliers.aquaPrime)).toBe(true);
  });

  it('losing supplier cannot read buyer PRE_REVEAL or POST_REVEAL buyer rows', async () => {
    const { awardId } = await seedRevealedAward();
    const loser = await sessionFor(DEMO.logins.tooSmallSupplier);
    const { data, error } = await loser
      .from('issued_document_snapshots')
      .select('id, perspective, payload_json')
      .eq('source_entity_id', awardId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('anonymous client cannot select issued_document_snapshots', async () => {
    const { awardId } = await seedRevealedAward();
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('issued_document_snapshots')
      .select('id')
      .eq('source_entity_id', awardId);
    if (error) {
      expect(error.message).toMatch(/permission denied|42501/i);
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('PRE_REVEAL buyer payload does not expose real supplier name to unauthorized supplier session', async () => {
    const { awardId } = await seedRevealedAward();
    const winner = await sessionFor(DEMO.logins.motorSupplier);
    const { data } = await winner
      .from('issued_document_snapshots')
      .select('payload_json')
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'PRE_REVEAL');
    expect(data ?? []).toHaveLength(0);
  });
});

async function seedRevealedAwardMsme(): Promise<{ orgId: string; awardId: string }> {
  const ownerId = await profileIdFor(DEMO.logins.kovaiOwner);
  const creator = await profileIdFor(DEMO.logins.kovaiPartner);
  const orgId = DEMO.orgs.kovai;

  const { data: subcategory } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: requirement, error: reqError } = await service
    .from('requirements')
    .insert({
      organization_id: orgId,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      status: 'QUOTING',
      title: 'MSME issued doc access fixture',
      delivery_city: 'Coimbatore',
    })
    .select('id')
    .single();
  expect(reqError).toBeNull();
  createdReqs.push(requirement!.id);

  const { data: rfq } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: orgId,
      status: 'OPEN',
      reveal_status: 'BLIND',
      title: 'MSME access fixture RFQ',
      created_by: creator,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();

  const winnerSupplier = DEMO.suppliers.aquaPrime;
  const loserSupplier = DEMO.suppliers.nandi;

  for (const supplierId of [winnerSupplier, loserSupplier]) {
    const { data: invitation } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: supplierId,
        anonymous_label: `Supplier ${rfq!.id.replace(/-/g, '').slice(0, 8)}${supplierId.slice(-2)}`,
        status: 'QUOTED',
      })
      .select('id')
      .single();

    const { data: quote } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: supplierId,
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
      snapshot: { basePrice: 8000, gstAmount: 1440, totalCost: 9440, isInterState: false },
      created_by: creator,
    });
  }

  await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);

  const { data: pendingStages } = await service
    .from('rfq_approval_stages')
    .select('tier_level, status, stage_order')
    .eq('rfq_id', rfq!.id)
    .order('stage_order', { ascending: true });
  if (pendingStages && pendingStages.length > 0) {
    const approver = await sessionFor(DEMO.logins.kovaiOwner);
    for (const stage of pendingStages) {
      if (stage.status === 'APPROVED') continue;
      const { error: approveError } = await approver.rpc('submit_rfq_tier_approval_atomic', {
        p_rfq_id: rfq!.id,
        p_tier_level: stage.tier_level,
        p_notes: 'MSME access test tier approval',
      });
      expect(approveError).toBeNull();
    }
  }

  const { data: winnerQuote } = await service
    .from('quotes')
    .select('id')
    .eq('rfq_id', rfq!.id)
    .eq('supplier_id', winnerSupplier)
    .single();

  const buyer = await sessionFor(DEMO.logins.kovaiOwner);
  const { error: lockError } = await buyer.rpc('lock_award', {
    p_rfq_id: rfq!.id,
    p_quote_id: winnerQuote!.id,
    p_justification: 'MSME access test lock',
  });
  expect(lockError).toBeNull();
  const { error: revealError } = await buyer.rpc('reveal_award', { p_rfq_id: rfq!.id });
  expect(revealError).toBeNull();

  const { data: award } = await service.from('awards').select('id').eq('rfq_id', rfq!.id).single();
  return { orgId, awardId: award!.id as string };
}

describe('00222 — RWA / MSME persona rows', () => {
  it('RWA committee member can read own org POST_REVEAL issued snapshots', async () => {
    const { orgId, awardId } = await seedRevealedAward();
    const committee = await sessionFor(DEMO.logins.sunriseCommittee);
    const { data, error } = await committee
      .from('issued_document_snapshots')
      .select('id, perspective, identity_state')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'POST_REVEAL')
      .eq('perspective', 'BUYER');
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it('RWA committee member cannot read another org issued snapshots', async () => {
    const { orgId, awardId } = await seedRevealedAwardMsme();
    const rwaCommittee = await sessionFor(DEMO.logins.sunriseCommittee);
    const { data, error } = await rwaCommittee
      .from('issued_document_snapshots')
      .select('id')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('MSME org member can read own POST_REVEAL BUYER snapshot', async () => {
    const { orgId, awardId } = await seedRevealedAwardMsme();
    const msmeOwner = await sessionFor(DEMO.logins.kovaiOwner);
    const { data, error } = await msmeOwner
      .from('issued_document_snapshots')
      .select('id, perspective')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId)
      .eq('identity_state', 'POST_REVEAL')
      .eq('perspective', 'BUYER');
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it('MSME org member cannot read another org issued snapshots', async () => {
    const { orgId, awardId } = await seedRevealedAward();
    const msmeOwner = await sessionFor(DEMO.logins.kovaiOwner);
    const { data, error } = await msmeOwner
      .from('issued_document_snapshots')
      .select('id')
      .eq('organization_id', orgId)
      .eq('source_entity_id', awardId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

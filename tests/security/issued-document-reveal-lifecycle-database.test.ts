/**
 * R2-31 B9 — lock → PRE_REVEAL snapshot → reveal → POST_REVEAL new row;
 * original PRE_REVEAL row immutable on re-read.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

let service: ReturnType<typeof createServiceClient>;
let dbUp = false;

const HOUR = 3_600_000;
const createdReqs: string[] = [];

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function freshAlias(): string {
  return `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
  for (const id of createdReqs.splice(0)) {
    await service.from('requirements').delete().eq('id', id);
  }
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

interface Round {
  rfqId: string;
  orgId: string;
  winnerQuoteId: string;
  winnerSupplierId: string;
  winnerAlias: string;
  awardId?: string;
}

async function makeIndividualBuyerRound(): Promise<Round> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);
  const orgId = DEMO.orgs.sunrise;

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
      title: 'Issued doc lifecycle fixture',
      description: 'tests/security/issued-document-reveal-lifecycle-database.test.ts',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();
  expect(reqError).toBeNull();
  createdReqs.push(requirement!.id);

  const { data: rfq, error: rfqError } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: orgId,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'Issued doc lifecycle RFQ',
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

  const bidders = [
    { supplierId: DEMO.suppliers.aquaPrime, login: DEMO.logins.motorSupplier },
    { supplierId: DEMO.suppliers.nandi, login: DEMO.logins.tooSmallSupplier },
  ];

  let winnerQuoteId = '';
  let winnerSupplierId = '';
  let winnerAlias = '';

  for (const bidder of bidders) {
    const alias = freshAlias();
    const { data: invitation, error: inviteError } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: bidder.supplierId,
        anonymous_label: alias,
        status: 'QUOTED',
      })
      .select('id, anonymous_label')
      .single();
    expect(inviteError).toBeNull();

    const { data: quote, error: quoteError } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: bidder.supplierId,
        invitation_id: invitation!.id,
        status: 'FINAL',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(quoteError).toBeNull();

    await service.from('quote_versions').upsert({
      quote_id: quote!.id,
      version: 1,
      snapshot: {
        basePrice: 10000,
        gstAmount: 1800,
        totalCost: 11800,
        deliveryDays: 7,
        warrantyMonths: 12,
        isInterState: false,
        currency: 'INR',
      },
      created_by: creator,
    });

    if (!winnerQuoteId) {
      winnerQuoteId = quote!.id;
      winnerSupplierId = bidder.supplierId;
      winnerAlias = invitation!.anonymous_label || alias;
    }
  }

  await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);

  return {
    rfqId: rfq!.id,
    orgId,
    winnerQuoteId,
    winnerSupplierId,
    winnerAlias,
  };
}

describe('00222 — protected reveal document lifecycle (REAL DATABASE)', () => {
  it('PRE_REVEAL snapshot survives reveal; POST_REVEAL is a new integrity row', async () => {
    const round = await makeIndividualBuyerRound();
    await recommendWinner(round.rfqId, round.winnerQuoteId);
    const manager = await sessionFor(DEMO.logins.sunriseManager);

    const { error: lockError } = await manager.rpc('lock_award', {
      p_rfq_id: round.rfqId,
      p_quote_id: round.winnerQuoteId,
      p_justification: 'Lowest compliant landed cost.',
    });
    expect(lockError).toBeNull();

    const { data: awardRow } = await service.from('awards').select('id').eq('rfq_id', round.rfqId).single();
    expect(awardRow?.id).toBeTruthy();
    round.awardId = awardRow!.id as string;

    const { data: preSnap, error: preErr } = await service
      .from('issued_document_snapshots')
      .select(
        'id, document_id, identity_state, verification_digest, verification_ref, payload_json, document_number',
      )
      .eq('source_entity_id', round.awardId)
      .eq('identity_state', 'PRE_REVEAL')
      .eq('perspective', 'BUYER')
      .eq('status', 'ISSUED')
      .single();
    expect(preErr).toBeNull();
    expect(preSnap).toBeTruthy();

    const preId = preSnap!.id as string;
    const preDocId = preSnap!.document_id as string;
    const preDigest = preSnap!.verification_digest as string;
    const prePayload = preSnap!.payload_json as Record<string, unknown>;
    const canonicalPre = (prePayload.canonicalDecisionReceipt ?? {}) as Record<string, unknown>;
    const offerPre = (canonicalPre.selectedOffer ?? {}) as Record<string, unknown>;
    expect(offerPre.supplierId).toBeNull();
    expect(offerPre.businessName).toBeNull();
    expect(offerPre.maskedSupplierLabel).toBeTruthy();
    expect(String(offerPre.maskedSupplierLabel)).not.toMatch(/Aqua|Nandi|Pvt/i);

    const verifyPre = await manager.rpc('verify_issued_document_digest', { p_document_id: preDocId });
    expect(verifyPre.error).toBeNull();
    expect((verifyPre.data as { valid?: boolean }).valid).toBe(true);

    const { error: revealError } = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(revealError).toBeNull();

    const { data: postSnap, error: postErr } = await service
      .from('issued_document_snapshots')
      .select('id, document_id, identity_state, verification_digest, payload_json')
      .eq('source_entity_id', round.awardId)
      .eq('identity_state', 'POST_REVEAL')
      .eq('perspective', 'BUYER')
      .eq('status', 'ISSUED')
      .single();
    expect(postErr).toBeNull();
    expect(postSnap!.id).not.toBe(preId);
    expect(postSnap!.verification_digest).not.toBe(preDigest);
    expect(postSnap!.document_id).not.toBe(preDocId);

    const postCanonical = (postSnap!.payload_json as Record<string, unknown>).canonicalDecisionReceipt as Record<
      string,
      unknown
    >;
    const postOffer = (postCanonical.selectedOffer ?? {}) as Record<string, unknown>;
    expect(postOffer.supplierId).toBeTruthy();
    expect(String(postOffer.businessName ?? '')).not.toBe(round.winnerAlias);

    const { data: preAgain } = await service
      .from('issued_document_snapshots')
      .select('verification_digest, payload_json, identity_state')
      .eq('id', preId)
      .single();
    expect(preAgain!.verification_digest).toBe(preDigest);
    expect(preAgain!.payload_json).toEqual(prePayload);
    expect(preAgain!.identity_state).toBe('PRE_REVEAL');

    const { error: tamperError } = await service
      .from('issued_document_snapshots')
      .update({ payload_json: { tampered: true } })
      .eq('id', preId);
    expect(tamperError).not.toBeNull();
    expect(tamperError!.message).toMatch(/DOC-SNAPSHOT-FROZEN|immutable/i);
  });
});

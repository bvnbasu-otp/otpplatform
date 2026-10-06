/**
 * F-07 (migration 00244): public.reveal_award must be verified-supplier gated and atomic with PO creation.
 *
 * Every case drives the real RPC with a real authenticated JWT (or service role where stated) against the
 * local database, then reads the persisted state back with the service role.
 *
 *   F07-1  unverified supplier: reveal fails, no identity, no PO, award/rfq not REVEALED
 *   F07-2  verified supplier + PO succeeds: identity returned, po_id non-null, PO row exists
 *   F07-3  verified supplier, PO creation fails (pending approval stage): reveal fails and rolls back
 *   F07-4  direct authenticated rpc('reveal_award') cannot bypass verification or tenancy
 *   F07-5  lock_and_reveal_award_atomic is untouched (covered by the existing award tests, plus a guard here)
 *
 * Requires a local Supabase with 00244 applied. Skips otherwise.
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

type Client = ReturnType<typeof createAnonClient>;

let service: ReturnType<typeof createServiceClient>;
let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) service = createServiceClient();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** aquaPrime is VERIFIED / VERIFIED in the local seed; nandi is VERIFICATION_PENDING / PENDING. */
const VERIFIED_SUPPLIER = DEMO.suppliers.aquaPrime;
const UNVERIFIED_SUPPLIER = DEMO.suppliers.nandi;

const created: string[] = [];
const notified: string[] = [];

afterEach(async () => {
  if (!up) return;
  for (const rfqId of notified.splice(0)) {
    await service.from('notifications').delete().eq('payload->>rfqId', rfqId);
  }
  const ids = created.splice(0);
  if (ids.length > 0) await deleteFixtureRequirements(ids);
});

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

interface Round {
  rfqId: string;
  winnerQuoteId: string;
  winnerSupplierId: string;
}

/** Two sealed quotes in EVALUATING, committee quorum recorded for the winner, then lock_award (no reveal). */
async function lockedRound(winnerSupplierId: string): Promise<Round> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);
  const { data: sub } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: requirement, error: reqError } = await service
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: sub!.category_id,
      subcategory_id: sub!.id,
      status: 'QUOTING',
      title: 'F-07 reveal fixture',
      description: 'tests/security/f07-reveal-award-verified-atomic-00244-database.test.ts',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();
  expect(reqError).toBeNull();
  created.push(requirement!.id);

  const { data: rfq, error: rfqError } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: DEMO.orgs.sunrise,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'F-07 reveal fixture RFQ',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();
  expect(rfqError).toBeNull();
  notified.push(rfq!.id);
  await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

  const otherSupplier = winnerSupplierId === VERIFIED_SUPPLIER ? UNVERIFIED_SUPPLIER : VERIFIED_SUPPLIER;
  const quoteIds: string[] = [];
  for (const supplierId of [winnerSupplierId, otherSupplier]) {
    const { data: invitation, error: inviteError } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: supplierId,
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
        supplier_id: supplierId,
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
      snapshot: { basePrice: 10000, gstAmount: 1800, totalCost: 11800, deliveryDays: 7, currency: 'INR' },
      created_by: creator,
    });
    expect(versionError).toBeNull();
    quoteIds.push(quote!.id);
  }

  const { error: statusError } = await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfq!.id);
  expect(statusError).toBeNull();

  const voters = [
    await profileIdFor(DEMO.logins.sunriseCommittee),
    await profileIdFor(DEMO.logins.sunriseCommittee2),
  ];
  const { error: seatError } = await service
    .from('committee_assignments')
    .upsert(voters.map((profile_id) => ({ rfq_id: rfq!.id, profile_id })), { onConflict: 'rfq_id,profile_id' });
  expect(seatError).toBeNull();
  for (const profileId of voters) {
    const { error: voteError } = await service.from('committee_votes').insert({
      rfq_id: rfq!.id,
      profile_id: profileId,
      recommended_quote_id: quoteIds[0]!,
      choice: 'RECOMMEND',
      voting_power: 1,
    });
    expect(voteError).toBeNull();
  }

  const manager = await sessionFor(DEMO.logins.sunriseManager);
  const lock = await manager.rpc('lock_award', {
    p_rfq_id: rfq!.id,
    p_quote_id: quoteIds[0]!,
    p_justification: 'F-07 fixture award.',
  });
  expect(lock.error).toBeNull();

  return { rfqId: rfq!.id, winnerQuoteId: quoteIds[0]!, winnerSupplierId };
}

async function persisted(rfqId: string) {
  const { data: award } = await service.from('awards').select('id, status, revealed_at').eq('rfq_id', rfqId).single();
  const { data: rfq } = await service.from('rfqs').select('reveal_status').eq('id', rfqId).single();
  const { data: pos } = await service.from('purchase_orders').select('id, po_number, supplier_id').eq('rfq_id', rfqId);
  const { data: audits } = await service
    .from('audit_events')
    .select('id')
    .eq('event_type', 'identity.revealed')
    .eq('entity_id', award!.id as string);
  return { award: award!, rfqRevealStatus: rfq!.reveal_status as string, pos: pos ?? [], revealAudits: audits ?? [] };
}

describe('F-07 reveal_award: verified-supplier gate and PO atomicity (00244)', () => {
  it('fixture sanity: the verified/unverified suppliers match the predicate the RPC enforces', async () => {
    const { data } = await service
      .from('suppliers')
      .select('id, lifecycle_state, verification_status')
      .in('id', [VERIFIED_SUPPLIER, UNVERIFIED_SUPPLIER]);
    const byId = new Map((data ?? []).map((s) => [s.id, s]));
    expect(byId.get(VERIFIED_SUPPLIER)).toMatchObject({ lifecycle_state: 'VERIFIED', verification_status: 'VERIFIED' });
    expect(byId.get(UNVERIFIED_SUPPLIER)?.lifecycle_state).not.toBe('VERIFIED');
  });

  it('F07-1: an unverified winner cannot be revealed - no identity, no PO, nothing left REVEALED', async () => {
    const round = await lockedRound(UNVERIFIED_SUPPLIER);
    const before = await persisted(round.rfqId);
    expect(before.award.status).toBe('PENDING_REVEAL');
    expect(before.rfqRevealStatus).toBe('BLIND');

    const manager = await sessionFor(DEMO.logins.sunriseManager);
    const { data, error } = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/verification/i);
    expect(data).toBeNull();
    // No identity anywhere in the failure.
    expect(JSON.stringify({ data, error })).not.toMatch(/contact_phone|contact_email|business_name/);

    const after = await persisted(round.rfqId);
    expect(after.award.status).toBe('PENDING_REVEAL');
    expect(after.award.revealed_at).toBeNull();
    expect(after.rfqRevealStatus).toBe('BLIND');
    expect(after.pos).toEqual([]);
    expect(after.revealAudits).toEqual([]);
  });

  it('F07-1b: the service role does not bypass the verification predicate either', async () => {
    const round = await lockedRound(UNVERIFIED_SUPPLIER);
    const { data, error } = await service.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
    const after = await persisted(round.rfqId);
    expect(after.award.status).toBe('PENDING_REVEAL');
    expect(after.rfqRevealStatus).toBe('BLIND');
    expect(after.pos).toEqual([]);
  });

  it('F07-2: verified supplier + PO succeeds - reveal persisted, identity returned, real po_id, PO row exists', async () => {
    const round = await lockedRound(VERIFIED_SUPPLIER);
    const manager = await sessionFor(DEMO.logins.sunriseManager);
    const { data, error } = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });

    expect(error).toBeNull();
    const res = data as Record<string, unknown>;
    expect(res.supplier_id).toBe(VERIFIED_SUPPLIER);
    expect(res.business_name).toBeTruthy();
    expect(res.buyer_released_to_supplier).toBe(true);
    expect(typeof res.po_id).toBe('string');
    expect(res.po_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.po_number).toBeTruthy();

    const after = await persisted(round.rfqId);
    expect(after.award.status).toBe('REVEALED');
    expect(after.rfqRevealStatus).toBe('REVEALED');
    expect(after.pos).toHaveLength(1);
    expect(after.pos[0]!.id).toBe(res.po_id);
    expect(after.pos[0]!.supplier_id).toBe(VERIFIED_SUPPLIER);
    expect(after.revealAudits).toHaveLength(1);

    // Idempotent re-call: same PO, never a null po_id.
    const again = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(again.error).toBeNull();
    expect((again.data as Record<string, unknown>).already_revealed).toBe(true);
    expect((again.data as Record<string, unknown>).po_id).toBe(res.po_id);
  });

  it('F07-3: verified supplier but PO creation fails (pending approval stage) - whole reveal rolls back', async () => {
    const round = await lockedRound(VERIFIED_SUPPLIER);

    // A required approval stage that is still pending makes create_purchase_order_from_award raise
    // ('Required approval tier(s) are pending satisfaction'). lock_award already passed, so the stage
    // appears after the award - exactly the state the old swallow turned into a "successful" reveal.
    const { error: stageError } = await service.from('rfq_approval_stages').insert({
      rfq_id: round.rfqId,
      organization_id: DEMO.orgs.sunrise,
      tier_level: 'TIER_1_MANAGER',
      stage_order: 1,
      status: 'PENDING',
      procurement_amount: 11800,
    });
    expect(stageError).toBeNull();

    const manager = await sessionFor(DEMO.logins.sunriseManager);
    const { data, error } = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/approval/i);
    expect(data).toBeNull();
    expect(JSON.stringify({ data, error })).not.toMatch(/contact_phone|contact_email|business_name/);

    const after = await persisted(round.rfqId);
    expect(after.award.status).toBe('PENDING_REVEAL');
    expect(after.award.revealed_at).toBeNull();
    expect(after.rfqRevealStatus).toBe('BLIND');
    expect(after.pos).toEqual([]);
    expect(after.revealAudits).toEqual([]);
    const { data: wo } = await service.from('work_orders').select('id').eq('supplier_id', VERIFIED_SUPPLIER).limit(0);
    expect(wo).toEqual([]);

    // The failure was transient state, not a poisoned award: once the stage is satisfied the same RPC succeeds.
    const { error: approveError } = await service
      .from('rfq_approval_stages')
      .update({ status: 'APPROVED', approved_at: new Date().toISOString() })
      .eq('rfq_id', round.rfqId);
    expect(approveError).toBeNull();
    const retry = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(retry.error).toBeNull();
    expect((retry.data as Record<string, unknown>).po_id).toBeTruthy();
    const final = await persisted(round.rfqId);
    expect(final.award.status).toBe('REVEALED');
    expect(final.pos).toHaveLength(1);
  });

  it('F07-4: direct authenticated rpc cannot bypass verification, tenancy or anonymity', async () => {
    const round = await lockedRound(UNVERIFIED_SUPPLIER);

    // A manager of another organization.
    const outsider = await sessionFor(DEMO.logins.kovaiOwner);
    const outsiderRes = await outsider.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(outsiderRes.error).not.toBeNull();
    expect(outsiderRes.data).toBeNull();

    // The winning (unverified) supplier itself.
    const supplier = await sessionFor(DEMO.logins.tooSmallSupplier);
    const supplierRes = await supplier.rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(supplierRes.error).not.toBeNull();
    expect(supplierRes.data).toBeNull();

    // Anonymous.
    const anonRes = await createAnonClient().rpc('reveal_award', { p_rfq_id: round.rfqId });
    expect(anonRes.error).not.toBeNull();
    expect(anonRes.data).toBeNull();

    // The legitimate buyer manager, calling the RPC directly with a crafted/unknown rfq id, gets nothing either.
    const manager = await sessionFor(DEMO.logins.sunriseManager);
    const unknown = await manager.rpc('reveal_award', { p_rfq_id: '00000000-0000-4000-8000-0000000000f7' });
    expect(unknown.error).not.toBeNull();
    expect(unknown.data).toBeNull();

    const after = await persisted(round.rfqId);
    expect(after.award.status).toBe('PENDING_REVEAL');
    expect(after.rfqRevealStatus).toBe('BLIND');
    expect(after.pos).toEqual([]);
  });

  it('F07-5: lock_and_reveal_award_atomic is untouched - 00244 only replaces reveal_award', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql',
      ),
      'utf8',
    );
    expect(sql).not.toMatch(/FUNCTION\s+public\.lock_and_reveal_award_atomic/i);
    expect(sql).not.toMatch(/FUNCTION\s+public\.create_purchase_order_from_award/i);
    // The new reveal_award body has no exception handler that could convert a PO failure into success.
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.reveal_award'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_founder_executive_metrics'),
    );
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(body).not.toMatch(/RAISE\s+WARNING/i);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/lifecycle_state/);
    expect(body).toMatch(/verification_status/);
  });
});

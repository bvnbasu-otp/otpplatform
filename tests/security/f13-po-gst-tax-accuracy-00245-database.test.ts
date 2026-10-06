/**
 * F-13 (migration 00245): the purchase order carries the awarded quote's real GST.
 *
 * Against the REAL local database, through the real award path (lock_award -> reveal_award ->
 * create_purchase_order_from_award -> issue_po_document_snapshots). The PO row and the issued PO
 * document are read back and compared with the quote snapshot and the 00241 decision receipt.
 *
 * Requires a local Supabase with 00245 applied. Skips otherwise.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
const WINNER = DEMO.suppliers.aquaPrime; // VERIFIED / VERIFIED in the local seed
const OTHER = DEMO.suppliers.nandi;

const created: string[] = [];
let restoreSupplierAddress: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (!up) return;
  if (restoreSupplierAddress) {
    await restoreSupplierAddress();
    restoreSupplierAddress = null;
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

interface Awarded {
  awardId: string;
  poId: string;
  rfqId: string;
}

/** Two sealed quotes (winner first), committee quorum, lock_award, reveal_award -> PO. */
async function awardWith(
  winnerSnapshot: Record<string, unknown>,
  opts: { deliveryAddress?: Record<string, unknown> } = {},
): Promise<Awarded> {
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
      title: 'F-13 GST fixture',
      description: 'tests/security/f13-po-gst-tax-accuracy-00245-database.test.ts',
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
      title: 'F-13 GST fixture RFQ',
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

  const competitor = { basePrice: 20000, gstAmount: 3600, totalCost: 23600, currency: 'INR' };
  const quoteIds: string[] = [];
  for (const [supplierId, snapshot] of [
    [WINNER, winnerSnapshot],
    [OTHER, competitor],
  ] as const) {
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
      snapshot,
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
    p_justification: 'F-13 fixture award.',
  });
  expect(lock.error).toBeNull();
  const reveal = await manager.rpc('reveal_award', { p_rfq_id: rfq!.id });
  expect(reveal.error).toBeNull();

  const { data: award } = await service.from('awards').select('id').eq('rfq_id', rfq!.id).single();
  const { data: po, error: poError } = await service
    .from('purchase_orders')
    .select('id')
    .eq('rfq_id', rfq!.id)
    .single();
  expect(poError).toBeNull();
  return { awardId: award!.id as string, poId: po!.id as string, rfqId: rfq!.id as string };
}

interface PoRow {
  total_amount: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  utgst_total: number;
  igst_total: number;
  tax_snapshot: Record<string, unknown>;
}

async function poRow(poId: string): Promise<PoRow> {
  const { data, error } = await service
    .from('purchase_orders')
    .select('total_amount, taxable_total, cgst_total, sgst_total, utgst_total, igst_total, tax_snapshot')
    .eq('id', poId)
    .single();
  expect(error).toBeNull();
  const r = data as Record<string, unknown>;
  return {
    total_amount: Number(r.total_amount),
    taxable_total: Number(r.taxable_total),
    cgst_total: Number(r.cgst_total),
    sgst_total: Number(r.sgst_total),
    utgst_total: Number(r.utgst_total),
    igst_total: Number(r.igst_total),
    tax_snapshot: r.tax_snapshot as Record<string, unknown>,
  };
}

interface DocLine {
  rate: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

async function poDocument(poId: string, perspective: 'BUYER' | 'SUPPLIER') {
  const { data, error } = await service
    .from('issued_document_snapshots')
    .select('payload_json')
    .eq('source_entity_id', poId)
    .eq('document_kind', 'PURCHASE_ORDER')
    .eq('perspective', perspective)
    .eq('status', 'ISSUED')
    .single();
  expect(error).toBeNull();
  const input = (data!.payload_json as { procurementDocumentInput: { lines: DocLine[]; notes: string[] } })
    .procurementDocumentInput;
  return { line: input.lines[0]!, notes: input.notes };
}

async function receiptOffer(awardId: string) {
  const { data, error } = await service
    .from('issued_document_snapshots')
    .select('payload_json')
    .eq('source_entity_id', awardId)
    .eq('identity_state', 'POST_REVEAL')
    .eq('perspective', 'BUYER')
    .eq('document_kind', 'DECISION_RECEIPT')
    .eq('status', 'ISSUED')
    .single();
  expect(error).toBeNull();
  return (data!.payload_json as { canonicalDecisionReceipt: { selectedOffer: Record<string, any> } })
    .canonicalDecisionReceipt.selectedOffer;
}

const componentSum = (po: PoRow) => po.cgst_total + po.sgst_total + po.utgst_total + po.igst_total;

describe('F-13 PO GST accuracy (00245)', () => {
  it('F13-1 intra-state: total is the quoted total, taxable is the base, GST is split CGST+SGST, others zero', async () => {
    const { poId, awardId } = await awardWith({
      basePrice: 10000,
      gstAmount: 1800,
      totalCost: 11800,
      isInterState: false,
      currency: 'INR',
    });
    const po = await poRow(poId);
    expect(po.total_amount).toBe(11800);
    expect(po.taxable_total).toBe(10000);
    expect(po.cgst_total).toBe(900);
    expect(po.sgst_total).toBe(900);
    expect(po.utgst_total).toBe(0);
    expect(po.igst_total).toBe(0);
    // GST is neither added twice nor subtracted twice.
    expect(po.taxable_total + componentSum(po)).toBe(po.total_amount);
    // The persisted snapshot still equals the quote snapshot (plus the split basis).
    expect(po.tax_snapshot).toMatchObject({ basePrice: 10000, gstAmount: 1800, totalCost: 11800, taxSplitBasis: 'QUOTE_SNAPSHOT', isInterState: false });

    // The 00241 decision receipt is not contradicted.
    const offer = await receiptOffer(awardId);
    expect(offer.gstAmount).toBe(1800);
    expect(offer.cgstAmount).toBe(po.cgst_total);
    expect(offer.sgstAmount).toBe(po.sgst_total);
    expect(offer.igstAmount).toBe(po.igst_total);
    expect(offer.totalLandedCost).toBe(po.total_amount);
  });

  it('F13-2 inter-state: the whole GST sits in IGST, CGST/SGST/UTGST are zero', async () => {
    const { poId, awardId } = await awardWith({
      basePrice: 10000,
      gstAmount: 1800,
      totalCost: 11800,
      isInterState: true,
      currency: 'INR',
    });
    const po = await poRow(poId);
    expect(po.total_amount).toBe(11800);
    expect(po.taxable_total).toBe(10000);
    expect(po.igst_total).toBe(1800);
    expect(po.cgst_total).toBe(0);
    expect(po.sgst_total).toBe(0);
    expect(po.utgst_total).toBe(0);
    const offer = await receiptOffer(awardId);
    expect(offer.igstAmount).toBe(po.igst_total);
    expect(offer.cgstAmount).toBe(0);
    expect(offer.sgstAmount).toBe(0);
  });

  it('F13-3 transport is not lost, not taxed, and not double counted', async () => {
    const { poId } = await awardWith({
      basePrice: 10000,
      gstAmount: 1800,
      transportCost: 500,
      totalCost: 12300,
      isInterState: false,
      currency: 'INR',
    });
    const po = await poRow(poId);
    expect(po.total_amount).toBe(12300); // = quote totalCost, not inflated
    expect(po.taxable_total).toBe(10000); // transport is not in the taxable base (GST is on basePrice)
    expect(componentSum(po)).toBe(1800); // GST exactly the quote's GST
    expect(po.taxable_total + componentSum(po) + Number(po.tax_snapshot.transportCost)).toBe(po.total_amount);

    const doc = await poDocument(poId, 'BUYER');
    expect(doc.line.totalAmount).toBe(12300);
    expect(doc.notes.join(' ')).toMatch(/transport charges of INR 500/);
  });

  it('F13-4 zero-GST quote stays zero GST with correct taxable and total', async () => {
    const { poId } = await awardWith({
      basePrice: 9000,
      gstAmount: 0,
      totalCost: 9000,
      isInterState: false,
      currency: 'INR',
    });
    const po = await poRow(poId);
    expect(po.total_amount).toBe(9000);
    expect(po.taxable_total).toBe(9000);
    expect(componentSum(po)).toBe(0);
    const doc = await poDocument(poId, 'BUYER');
    expect(doc.line.taxableAmount).toBe(9000);
    expect(doc.line.gstAmount).toBe(0);
    expect(doc.line.gstRate).toBe(0);
    expect(doc.line.totalAmount).toBe(9000);
  });

  it('F13-5 jurisdiction unknown (no isInterState, no state codes): no split is invented, the GST total is still shown', async () => {
    const { poId, awardId } = await awardWith({
      basePrice: 10000,
      gstAmount: 1800,
      totalCost: 11800,
      currency: 'INR',
    });
    const po = await poRow(poId);
    expect(po.total_amount).toBe(11800);
    expect(po.taxable_total).toBe(10000);
    expect(componentSum(po)).toBe(0);
    expect(po.tax_snapshot.taxSplitBasis).toBe('UNAVAILABLE');
    expect(po.tax_snapshot.gstAmount).toBe(1800);
    expect((await receiptOffer(awardId)).taxSplitBasis).toBe('UNAVAILABLE');

    const doc = await poDocument(poId, 'SUPPLIER');
    expect(doc.line.taxableAmount).toBe(10000);
    expect(doc.line.gstAmount).toBe(1800);
    expect(doc.line.gstRate).toBe(18);
    expect(doc.line.totalAmount).toBe(11800);
  });

  it('F13-6 state codes: delivery vs supplier registered state decides IGST vs CGST+SGST exactly as the receipt does', async () => {
    const { data: before } = await service.from('suppliers').select('registered_address').eq('id', WINNER).single();
    restoreSupplierAddress = async () => {
      await service.from('suppliers').update({ registered_address: before!.registered_address }).eq('id', WINNER);
    };
    const { error: addrError } = await service
      .from('suppliers')
      .update({ registered_address: { ...(before!.registered_address as object | null), stateCode: '29' } })
      .eq('id', WINNER);
    expect(addrError).toBeNull();

    const snap = { basePrice: 10000, gstAmount: 1800, totalCost: 11800, currency: 'INR' };

    const inter = await awardWith(snap, { deliveryAddress: { stateCode: '27', city: 'Mumbai', pincode: '400001', line1: 'Site' } });
    const interPo = await poRow(inter.poId);
    expect(interPo.tax_snapshot.taxSplitBasis).toBe('STATE_CODES');
    expect(interPo.igst_total).toBe(1800);
    expect(interPo.cgst_total + interPo.sgst_total).toBe(0);
    const interOffer = await receiptOffer(inter.awardId);
    expect(interOffer.taxSplitBasis).toBe('STATE_CODES');
    expect(interOffer.igstAmount).toBe(interPo.igst_total);

    const intra = await awardWith(snap, { deliveryAddress: { stateCode: '29', city: 'Bengaluru', pincode: '560001', line1: 'Site' } });
    const intraPo = await poRow(intra.poId);
    expect(intraPo.cgst_total).toBe(900);
    expect(intraPo.sgst_total).toBe(900);
    expect(intraPo.igst_total).toBe(0);
    const intraOffer = await receiptOffer(intra.awardId);
    expect(intraOffer.cgstAmount).toBe(intraPo.cgst_total);
    expect(intraOffer.sgstAmount).toBe(intraPo.sgst_total);
  });

  it('F13-7 the issued PO document is not hard-coded to zero GST and equals the persisted PO (both perspectives)', async () => {
    const { poId } = await awardWith({
      basePrice: 8000,
      gstAmount: 1440,
      transportCost: 250,
      totalCost: 9690,
      isInterState: true,
      currency: 'INR',
    });
    const po = await poRow(poId);
    for (const perspective of ['BUYER', 'SUPPLIER'] as const) {
      const { line } = await poDocument(poId, perspective);
      expect(line.gstAmount).not.toBe(0);
      expect(line.taxableAmount).toBe(po.taxable_total);
      expect(line.rate).toBe(po.taxable_total);
      expect(line.gstAmount).toBe(componentSum(po));
      expect(line.gstRate).toBe(18);
      expect(line.totalAmount).toBe(po.total_amount);
      expect(line.totalAmount).toBe(9690);
    }
  });

  it('F13-8 re-running create_purchase_order_from_award is idempotent and leaves the tax fields untouched', async () => {
    const { awardId, poId } = await awardWith({
      basePrice: 10000,
      gstAmount: 1800,
      totalCost: 11800,
      isInterState: false,
      currency: 'INR',
    });
    const before = await poRow(poId);
    const again = await service.rpc('create_purchase_order_from_award', { p_award_id: awardId });
    expect(again.error).toBeNull();
    expect((again.data as { po_id: string }).po_id).toBe(poId);
    expect(await poRow(poId)).toEqual(before);
  });
});

describe('F-13 migration 00245 static guards', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/00245_f13_po_gst_tax_accuracy.sql'), 'utf8');

  it('replaces only the two PO functions and does not hard-code GST zero in the document', () => {
    const replaced = [...sql.matchAll(/CREATE OR REPLACE FUNCTION\s+([\w.]+)/gi)].map((m) => m[1]);
    expect(replaced).toEqual(['public.create_purchase_order_from_award', 'private.issue_po_document_snapshots']);
    expect(sql).not.toMatch(/'gstRate',\s*0\s*,/);
    expect(sql).not.toMatch(/'gstAmount',\s*0\s*,/);
    expect(sql).toMatch(/v_total, v_currency, v_base, v_cgst, v_sgst, 0, v_igst/);
  });
});

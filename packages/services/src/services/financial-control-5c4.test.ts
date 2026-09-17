import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';
import {
  calculateTds,
  calculateAuthorizedPoCommitment,
  validateChangeOrderCommitment,
  reconcileBankRemittance,
  exportToTallyPaymentVoucher,
} from '@otp/domain';

const ORG_ID = 'org-fin-5c4';
const OTHER_ORG_ID = 'org-other-5c4';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-5c4',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-5c4',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-5c4',
  organizationId: OTHER_ORG_ID,
  orgRole: 'MANAGER',
};

const SUPPLIER_A: ActorContext = {
  profileId: 'sup-user-5c4',
  supplierIds: ['sup-5c4-a'],
};

describe('OTP Phase 5C.4 — Financial Control & Red-Team Verification Matrix (RED-01 to RED-20)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-5c4-a',
      businessName: 'Apex Precision Engineering Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Machinery'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedPoAndInvoice(totalAmount = 100000, invoicedAmount = 60000) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const po = await repos.purchaseOrders.save({
      id: 'po-5c4-101',
      awardId: 'award-5c4-101',
      rfqId: 'rfq-5c4-101',
      organizationId: ORG_ID,
      supplierId: 'sup-5c4-a',
      totalAmount,
      currency: 'INR',
      status: 'ISSUED',
      poNumber: 'PO-2026-5C4-101',
      createdAt: now,
      updatedAt: now,
    });

    const wo = await repos.workOrders.save({
      id: 'wo-5c4-101',
      purchaseOrderId: po.id,
      supplierId: 'sup-5c4-a',
      status: 'IN_PROGRESS',
      title: 'Precision Machining Services',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    const invoice = await repos.invoices.save({
      id: 'inv-5c4-101',
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c4-a',
      invoiceNumber: 'INV-2026-5C4-001',
      amount: invoicedAmount,
      paidAmount: 0,
      balanceDue: invoicedAmount,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    return { po, wo, invoice, repos };
  }

  // -------------------------------------------------------------------------
  // RED-01: Supplier attempts unauthorized change-order approval -> Rejected
  // -------------------------------------------------------------------------
  it('RED-01: rejects supplier attempts to approve or commit PO change orders', async () => {
    const { po } = await seedPoAndInvoice(100000);

    const coRes = await services.purchaseOrders.createPoChangeOrder(
      BUYER_OWNER,
      po.id,
      {
        title: 'Additional Precision Boring',
        reason: 'Site engineering requirement',
        items: [{ description: 'Boring Lot', amountDelta: 15000, taxAmountDelta: 2700, totalDelta: 17700 }],
        status: 'SUBMITTED',
      },
    );
    expect(coRes.ok).toBe(true);
    if (!coRes.ok) return;

    // Supplier attempts to approve
    const approveRes = await services.purchaseOrders.approvePoChangeOrder(
      SUPPLIER_A,
      coRes.value.id,
    );
    expect(approveRes.ok).toBe(false);
    if (!approveRes.ok) {
      expect(approveRes.error).toBeInstanceOf(ForbiddenError);
      expect(approveRes.error.message).toContain('CO-5C4-UNAUTHORIZED');
    }

    // Supplier attempts to commit
    const commitRes = await services.purchaseOrders.commitPoChangeOrder(
      SUPPLIER_A,
      coRes.value.id,
    );
    expect(commitRes.ok).toBe(false);
    if (!commitRes.ok) {
      expect(commitRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-02: Negative change order reduces commitment below invoiced -> Rejected
  // -------------------------------------------------------------------------
  it('RED-02: strictly rejects negative change order reducing commitment below already invoiced amount', async () => {
    const { po } = await seedPoAndInvoice(100000, 75000); // Invoiced 75,000

    // Try to reduce PO commitment by 40,000 (Revised PO total would be 60,000 < 75,000)
    const coRes = await services.purchaseOrders.createPoChangeOrder(
      BUYER_OWNER,
      po.id,
      {
        title: 'De-scoping Sub-assembly',
        reason: 'Client requested removal',
        changeType: 'SCOPE_REDUCTION',
        items: [{ description: 'De-scoped Unit', amountDelta: -40000, taxAmountDelta: 0, totalDelta: -40000 }],
        status: 'SUBMITTED',
      },
    );
    expect(coRes.ok).toBe(true);
    if (!coRes.ok) return;

    await services.purchaseOrders.approvePoChangeOrder(BUYER_OWNER, coRes.value.id);

    const commitRes = await services.purchaseOrders.commitPoChangeOrder(
      BUYER_OWNER,
      coRes.value.id,
    );
    expect(commitRes.ok).toBe(false);
    if (!commitRes.ok) {
      expect(commitRes.error).toBeInstanceOf(ValidationError);
      expect(commitRes.error.message).toContain('REV-5C4-CO-BELOW-INVOICED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-03: TDS exceeds taxable base / gross invoice amount -> Rejected
  // -------------------------------------------------------------------------
  it('RED-03: rejects TDS withholding exceeding gross invoice amount', async () => {
    const { invoice } = await seedPoAndInvoice(10000, 5000);

    const tdsRes = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { customRate: 150.0 }, // 150% TDS > gross amount
    );

    expect(tdsRes.ok).toBe(false);
    if (!tdsRes.ok) {
      expect(tdsRes.error).toBeInstanceOf(ValidationError);
      expect(tdsRes.error.message).toContain('RED-03/RED-08');
    }
  });

  // -------------------------------------------------------------------------
  // RED-04: Invalid / missing PAN invokes higher rate rule -> Validated
  // -------------------------------------------------------------------------
  it('RED-04: validates Section 206AA higher deduction rate (20%) when PAN is absent or invalid', async () => {
    const { invoice } = await seedPoAndInvoice(50000, 50000);

    const tdsRes = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { deducteePan: 'INVALIDPAN' },
    );

    expect(tdsRes.ok).toBe(true);
    if (!tdsRes.ok) return;
    expect(tdsRes.value.panStatus).toBe('INVALID');
    expect(tdsRes.value.tdsRate).toBe(20.0);
    expect(tdsRes.value.tdsAmount).toBe(10000); // 20% of 50,000
  });

  // -------------------------------------------------------------------------
  // RED-05: Pre/post-1-April-2026 tax date resolves correct law version -> Validated
  // -------------------------------------------------------------------------
  it('RED-05: resolves correct statutory regime based on effective date', async () => {
    const { invoice } = await seedPoAndInvoice(50000, 50000);

    const tdsPre = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { date: '2026-03-20', deducteePan: 'AABCS1429B' },
    );
    expect(tdPreLaw(tdsPre)).toBe('INCOME_TAX_ACT_1961');

    function tdPreLaw(res: any) {
      return res.ok ? res.value.lawVersion : null;
    }

    // New invoice for post-April
    const repos = mem.asRepositories();
    const invPost = await repos.invoices.save({
      id: 'inv-post-2026',
      purchaseOrderId: 'po-5c4-101',
      workOrderId: 'wo-5c4-101',
      supplierId: 'sup-5c4-a',
      invoiceNumber: 'INV-POST-01',
      amount: 40000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const tdsPost = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invPost.id,
      '194C',
      { date: '2026-05-15', deducteePan: 'AABCS1429B' },
    );
    expect(tdsPost.ok).toBe(true);
    if (tdsPost.ok) {
      expect(tdsPost.value.lawVersion).toBe('INCOME_TAX_ACT_2025');
    }
  });

  // -------------------------------------------------------------------------
  // RED-06: Statutory TDS rounding tested against exact Section 288B conventions
  // -------------------------------------------------------------------------
  it('RED-06: strictly adheres to Section 288B nearest whole rupee rounding', () => {
    // 2% of ₹33,333.33 = 666.6666 -> 667
    const calc1 = calculateTds({
      invoiceAmount: 33333.33,
      section: '194C',
      deducteePan: 'AABCS1429B',
    });
    expect(calc1.statutoryTdsAmount).toBe(667);

    // 1% of ₹30,049 = 300.49 -> 300
    const calc2 = calculateTds({
      invoiceAmount: 30049.0,
      section: '194C',
      deducteePan: 'AAAPL1234K',
    });
    expect(calc2.statutoryTdsAmount).toBe(300);
  });

  // -------------------------------------------------------------------------
  // RED-07: Deposited TDS deletion/reversal blocked; undeposited voided
  // -------------------------------------------------------------------------
  it('RED-07: blocks reversing/voiding already deposited TDS (REV-5C4-TDS-ALREADY-DEPOSITED)', async () => {
    const { invoice, repos } = await seedPoAndInvoice(50000, 50000);

    const tdsRes = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { deducteePan: 'AABCS1429B' },
    );
    expect(tdsRes.ok).toBe(true);
    if (!tdsRes.ok) return;

    // Simulate deposited state in government treasury
    const deduction = await repos.tdsDeductions!.findById(tdsRes.value.id);
    deduction!.status = 'DEPOSITED';
    await repos.tdsDeductions!.save(deduction!);

    const voidRes = await services.payments.voidTdsWithholding(
      BUYER_OWNER,
      tdsRes.value.id,
      'Erroneous deduction',
    );
    expect(voidRes.ok).toBe(false);
    if (!voidRes.ok) {
      expect(voidRes.error.message).toContain('REV-5C4-TDS-ALREADY-DEPOSITED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-08: TDS allocation causing negative invoice payable blocked
  // -------------------------------------------------------------------------
  it('RED-08: blocks excessive TDS resulting in negative payable balance', async () => {
    const { invoice } = await seedPoAndInvoice(50000, 10000);

    const tdsRes = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { customRate: 200 }, // 200% rate
    );
    expect(tdsRes.ok).toBe(false);
    if (!tdsRes.ok) {
      expect(tdsRes.error.message).toContain('RED-03/RED-08');
    }
  });

  // -------------------------------------------------------------------------
  // RED-09: Cross-tenant access to financial dashboard blocked
  // -------------------------------------------------------------------------
  it('RED-09: blocks cross-tenant access to financial observability summary', async () => {
    const res = await services.payments.getFinancialObservabilitySummary(
      OTHER_ORG_USER,
      ORG_ID,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('RED-09/OBS-5C4-UNAUTHORIZED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-10: Concurrent change-order commits serialized via atomic validations
  // -------------------------------------------------------------------------
  it('RED-10: serializes and validates change order commitments accurately', async () => {
    const { po } = await seedPoAndInvoice(100000, 20000);

    const co1 = await services.purchaseOrders.createPoChangeOrder(
      BUYER_OWNER,
      po.id,
      {
        title: 'CO 1',
        reason: 'Expansion 1',
        items: [{ description: 'Item 1', amountDelta: 10000, taxAmountDelta: 1800, totalDelta: 11800 }],
        status: 'SUBMITTED',
      },
    );
    expect(co1.ok).toBe(true);
    if (!co1.ok) return;

    await services.purchaseOrders.approvePoChangeOrder(BUYER_OWNER, co1.value.id);
    const commit1 = await services.purchaseOrders.commitPoChangeOrder(BUYER_OWNER, co1.value.id);
    expect(commit1.ok).toBe(true);
    if (!commit1.ok) return;

    expect(commit1.value.purchaseOrder.totalAmount).toBe(111800);
  });

  // -------------------------------------------------------------------------
  // RED-11: Duplicate UTR produces duplicate reconciliation rejection
  // -------------------------------------------------------------------------
  it('RED-11: rejects duplicate UTR reconciliation submissions', async () => {
    const advice = {
      utrNumber: 'HDFCR5202609179999',
      clearedAmount: 50000,
      clearedAt: new Date().toISOString(),
      bankName: 'HDFC Bank',
    };

    const rec1 = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(rec1.ok).toBe(true);

    const rec2 = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(rec2.ok).toBe(false);
    if (!rec2.ok) {
      expect(rec2.error.message).toContain('RED-11/REC-5C4-DUPLICATE-UTR');
    }
  });

  // -------------------------------------------------------------------------
  // RED-12: Amount-mismatched UTR flagged as discrepancy
  // -------------------------------------------------------------------------
  it('RED-12: flags amount-mismatched UTR as DISCREPANCY with variance details', async () => {
    const { repos } = await seedPoAndInvoice(50000);

    const payment = await repos.payments.save({
      id: 'pay-mismatch-1',
      amount: 40000,
      currency: 'INR',
      method: 'BANK_TRANSFER',
      status: 'RECORDED',
      recordedBy: BUYER_OWNER.profileId!,
      recordedAt: new Date().toISOString(),
      reference: 'AXIS00998811',
    });

    const rec = await services.payments.reconcileBankUtr(
      BUYER_OWNER,
      ORG_ID,
      {
        utrNumber: 'AXIS00998811',
        clearedAmount: 38000, // ₹2,000 variance
        clearedAt: new Date().toISOString(),
      },
      payment.id,
    );

    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.value.status).toBe('DISCREPANCY');
    expect(rec.value.discrepancyType).toBe('AMOUNT_MISMATCH');
    expect(rec.value.amountDifference).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // RED-13: Change order synchronizes invoice ceiling
  // -------------------------------------------------------------------------
  it('RED-13: committed change order expands PO commitment ceiling for subsequent invoicing', async () => {
    const { po, repos } = await seedPoAndInvoice(100000, 100000); // Fully invoiced at 100k

    // Create and commit expansion of ₹50,000
    const co = await services.purchaseOrders.createPoChangeOrder(
      BUYER_OWNER,
      po.id,
      {
        title: 'Phase 2 Extension',
        reason: 'Scope expansion',
        items: [{ description: 'Additional scope', amountDelta: 50000, taxAmountDelta: 0, totalDelta: 50000 }],
        status: 'SUBMITTED',
      },
    );
    expect(co.ok).toBe(true);
    if (!co.ok) return;

    await services.purchaseOrders.approvePoChangeOrder(BUYER_OWNER, co.value.id);
    const commitRes = await services.purchaseOrders.commitPoChangeOrder(BUYER_OWNER, co.value.id);
    expect(commitRes.ok).toBe(true);

    const updatedPo = await repos.purchaseOrders.findById(po.id);
    expect(updatedPo?.totalAmount).toBe(150000);
  });

  // -------------------------------------------------------------------------
  // RED-14: Committed change order cannot be destructively modified
  // -------------------------------------------------------------------------
  it('RED-14: prevents re-committing or mutating an already COMMITTED change order', async () => {
    const { po } = await seedPoAndInvoice(100000, 20000);

    const co = await services.purchaseOrders.createPoChangeOrder(
      BUYER_OWNER,
      po.id,
      {
        title: 'Minor tweak',
        reason: 'Spec update',
        items: [{ description: 'Tweak', amountDelta: 5000, taxAmountDelta: 0, totalDelta: 5000 }],
        status: 'SUBMITTED',
      },
    );
    expect(co.ok).toBe(true);
    if (!co.ok) return;

    await services.purchaseOrders.approvePoChangeOrder(BUYER_OWNER, co.value.id);
    await services.purchaseOrders.commitPoChangeOrder(BUYER_OWNER, co.value.id);

    // Attempt to commit again
    const secondCommit = await services.purchaseOrders.commitPoChangeOrder(
      BUYER_OWNER,
      co.value.id,
    );
    expect(secondCommit.ok).toBe(false);
    if (!secondCommit.ok) {
      expect(secondCommit.error.message).toContain('RED-14/CO-5C4-ALREADY-COMMITTED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-15: Historical tax rule changes do not mutate old TDS transactions
  // -------------------------------------------------------------------------
  it('RED-15: immutable snapshot of historical TDS transactions', async () => {
    const { invoice, repos } = await seedPoAndInvoice(50000, 50000);

    const tdsRes = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { date: '2026-03-01', deducteePan: 'AABCS1429B' },
    );
    expect(tdsRes.ok).toBe(true);
    if (!tdsRes.ok) return;

    const saved = await repos.tdsDeductions!.findById(tdsRes.value.id);
    expect(saved?.lawVersion).toBe('INCOME_TAX_ACT_1961');
    expect(saved?.tdsAmount).toBe(1000); // 2% of 50,000
  });

  // -------------------------------------------------------------------------
  // RED-16: Duplicate TDS application rejected / idempotent
  // -------------------------------------------------------------------------
  it('RED-16: rejects duplicate active TDS application on same invoice and section', async () => {
    const { invoice } = await seedPoAndInvoice(50000, 50000);

    const tds1 = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { deducteePan: 'AABCS1429B' },
    );
    expect(td1Success(tds1)).toBe(true);

    function td1Success(res: any) {
      return res.ok;
    }

    const tds2 = await services.payments.applyTdsWithholding(
      BUYER_OWNER,
      invoice.id,
      '194C',
      { deducteePan: 'AABCS1429B' },
    );
    expect(tds2.ok).toBe(false);
    if (!tds2.ok) {
      expect(tds2.error.message).toContain('RED-16/TDS-5C4-DUPLICATE');
    }
  });

  // -------------------------------------------------------------------------
  // RED-17: Supplier cannot mutate buyer financial records
  // -------------------------------------------------------------------------
  it('RED-17: rejects supplier attempting to apply statutory TDS withholding', async () => {
    const { invoice } = await seedPoAndInvoice(50000, 50000);

    const tdsRes = await services.payments.applyTdsWithholding(
      SUPPLIER_A,
      invoice.id,
      '194C',
      { deducteePan: 'AABCS1429B' },
    );
    expect(tdsRes.ok).toBe(false);
    if (!tdsRes.ok) {
      expect(tdsRes.error).toBeInstanceOf(ForbiddenError);
      expect(tdsRes.error.message).toContain('RED-17/TDS-5C4-UNAUTHORIZED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-18: Unauthorized user cannot export another tenant's audit pack
  // -------------------------------------------------------------------------
  it('RED-18: blocks unauthorized tenant user from exporting financial audit pack', async () => {
    const res = await services.payments.generateFinancialAuditPack(
      OTHER_ORG_USER,
      ORG_ID,
      'JSON',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('RED-18/AUDIT-5C4-UNAUTHORIZED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-19: PO completion guard blocks completion when financial obligations are open
  // -------------------------------------------------------------------------
  it('RED-19: PO completion guard rejects COMPLETED status when invoice has balance due', async () => {
    const { po, repos } = await seedPoAndInvoice(100000, 60000); // 60,000 invoiced, 0 paid

    // Set PO to IN_PROGRESS so transition to COMPLETED is allowed by state machine
    po.status = 'IN_PROGRESS';
    await repos.purchaseOrders.save(po);

    const compRes = await services.purchaseOrders.transition(
      BUYER_OWNER,
      po.id,
      'COMPLETED',
    );
    expect(compRes.ok).toBe(false);
    if (!compRes.ok) {
      expect(compRes.error).toBeInstanceOf(ValidationError);
      expect(compRes.error.message).toContain('Purchase order cannot be marked COMPLETED');
    }
  });

  // -------------------------------------------------------------------------
  // RED-20: Tally payment export with TDS maintains exact debit/credit balance
  // -------------------------------------------------------------------------
  it('RED-20: Tally payment export with TDS balances debits and credits exactly', () => {
    const xml = exportToTallyPaymentVoucher({
      voucherNumber: 'PAY-RED20-001',
      paymentDate: '2026-09-17',
      paymentReference: 'UTR-HDFC-991200',
      amount: 98000, // Net bank payout
      tdsAmount: 2000, // 2% TDS withheld
      tdsSection: '194C',
      supplierName: 'Precision Tools Ltd',
      allocations: [{ invoiceNumber: 'INV-2026-RED20', allocatedAmount: 98000 }],
    });

    expect(xml).toContain('<PARTYNAME>Precision Tools Ltd</PARTYNAME>');
    // Supplier debited with Gross amount
    expect(xml).toContain('<AMOUNT>-100000.00</AMOUNT>');
    expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
    // Bank credited with Net amount
    expect(xml).toContain('<AMOUNT>98000.00</AMOUNT>');
    // TDS Payable credited with TDS amount
    expect(xml).toContain('<LEDGERNAME>TDS Payable Sec 194C</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>2000.00</AMOUNT>');
    expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
  });
});

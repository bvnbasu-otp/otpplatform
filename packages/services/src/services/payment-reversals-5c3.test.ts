import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';

const ORG_ID = 'org-fin-5c3';
const OTHER_ORG_ID = 'org-other-5c3';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-5c3',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-5c3',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-5c3',
  organizationId: OTHER_ORG_ID,
  orgRole: 'MANAGER',
};

const SUPPLIER_A: ActorContext = {
  profileId: 'sup-user-5c3',
  supplierIds: ['sup-5c3-a'],
};

describe('Phase 5C.3 Financial Adjustments, Reversals & Red-Team Matrix (5C3-RED-01 to 5C3-RED-10)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-5c3-a',
      businessName: 'Apex Precision Engineering Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Machinery'],
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedPoAndInvoice(totalAmount = 10000) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const po = await repos.purchaseOrders.save({
      id: 'po-5c3-101',
      awardId: 'award-5c3-101',
      rfqId: 'rfq-5c3-101',
      organizationId: ORG_ID,
      supplierId: 'sup-5c3-a',
      totalAmount,
      currency: 'INR',
      status: 'IN_PROGRESS',
      poNumber: 'PO-2026-5C3-101',
      createdAt: now,
      updatedAt: now,
    });

    const wo = await repos.workOrders.save({
      id: 'wo-5c3-101',
      purchaseOrderId: po.id,
      supplierId: 'sup-5c3-a',
      status: 'IN_PROGRESS',
      title: 'Precision Machining Services',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    const invoice = await repos.invoices.save({
      id: 'inv-5c3-101',
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c3-a',
      invoiceNumber: 'INV-2026-5C3-001',
      amount: totalAmount,
      paidAmount: 0,
      balanceDue: totalAmount,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    return { po, wo, invoice, repos };
  }

  // 5C3-RED-01: Reverse already reversed allocation -> Rejection
  it('5C3-RED-01: rejects reversing an already reversed payment allocation', async () => {
    const { po, invoice } = await seedPoAndInvoice(5000);

    // Record payment and allocation of 5000
    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      5000,
      'NEFT',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-01',
        allocations: [{ invoiceId: invoice.id, amount: 5000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await mem.asRepositories().paymentAllocations!.findByPaymentId(payRes.value.id);
    expect(allocations).toHaveLength(1);
    const allocId = allocations[0]!.id;

    // First reversal succeeds
    const rev1 = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'First reversal reason',
    });
    expect(rev1.ok).toBe(true);

    // Second reversal on same allocation must be rejected
    const rev2 = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Duplicate reversal attempt',
    });
    expect(rev2.ok).toBe(false);
    if (!rev2.ok) {
      expect(rev2.error.message).toMatch(/already reversed|REV-5C3-ALREADY-REVERSED/i);
    }
  });

  // 5C3-RED-02: Reverse allocation on completed PO -> Rejection (REV-5C3-PO-CLOSED)
  it('5C3-RED-02: rejects payment allocation reversal on a COMPLETED purchase order', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(8000);

    // Record payment
    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      8000,
      'RTGS',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-02',
        allocations: [{ invoiceId: invoice.id, amount: 8000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await repos.paymentAllocations!.findByPaymentId(payRes.value.id);
    const allocId = allocations[0]!.id;

    // Mark PO as COMPLETED
    await repos.purchaseOrders.save({
      ...po,
      status: 'COMPLETED',
    });

    // Attempt reversal on completed PO
    const rev = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Post-completion reversal attempt',
    });
    expect(rev.ok).toBe(false);
    if (!rev.ok) {
      expect(rev.error.message).toMatch(/REV-5C3-PO-CLOSED|COMPLETED/i);
    }
  });

  // 5C3-RED-03: Supplier attempts unauthorized reversal -> Rejection (REV-5C3-UNAUTHORIZED)
  it('5C3-RED-03: rejects supplier attempt to execute payment allocation reversal', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(4000);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      4000,
      'IMPS',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-03',
        allocations: [{ invoiceId: invoice.id, amount: 4000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await repos.paymentAllocations!.findByPaymentId(payRes.value.id);
    const allocId = allocations[0]!.id;

    // Supplier attempts reversal
    const rev = await services.payments.reversePaymentAllocation(SUPPLIER_A, {
      allocationId: allocId,
      reason: 'Unauthorized supplier reversal attempt',
    });
    expect(rev.ok).toBe(false);
    if (!rev.ok) {
      expect(rev.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // 5C3-RED-04: Debit note exceeds permitted balance -> Rejection
  it('5C3-RED-04: rejects debit note issuance exceeding permitted invoice amount', async () => {
    const { invoice } = await seedPoAndInvoice(10000);

    // Issue debit note for 15,000 against 10,000 invoice -> Must fail
    const cdnRes = await services.payments.issueCreditDebitNote(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      noteType: 'DEBIT_NOTE',
      amount: 15000,
      taxAmount: 0,
      reason: 'Excessive debit claim',
    });
    expect(cdnRes.ok).toBe(false);
    if (!cdnRes.ok) {
      expect(cdnRes.error.message).toMatch(/exceeds.*invoice|CDN-5C3-EXCEEDS-BALANCE|CDN-5C3-AMOUNT-EXCEEDED/i);
    }
  });

  // 5C3-RED-05: Tally voucher debit/credit imbalance -> Validated balance exact
  it('5C3-RED-05: produces exactly balanced debits and credits in Tally payment voucher XML', async () => {
    const { po, invoice } = await seedPoAndInvoice(12500.50);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      12500.50,
      'NEFT',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-05',
        allocations: [{ invoiceId: invoice.id, amount: 12500.50 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const exportRes = await services.payments.exportTallyPaymentVoucher(BUYER_OWNER, {
      poId: po.id,
      paymentId: payRes.value.id,
      bankLedgerName: 'HDFC Bank Corporate A/c',
    });
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    const xml = exportRes.value;
    // Check balanced amount tags: Debit (-12500.50) and Credit (12500.50)
    expect(xml).toContain('<AMOUNT>-12500.50</AMOUNT>');
    expect(xml).toContain('<AMOUNT>12500.50</AMOUNT>');
    expect(xml).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create">');
    expect(xml).toContain('<PARTYLEDGERNAME>Apex Precision Engineering Ltd</PARTYLEDGERNAME>');
  });

  // 5C3-RED-06: Cross-tenant ERP export -> Blocked with 403 / unauthorized
  it('5C3-RED-06: blocks cross-tenant user from exporting ERP payment vouchers', async () => {
    const { po, invoice } = await seedPoAndInvoice(6000);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      6000,
      'RTGS',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-06',
        allocations: [{ invoiceId: invoice.id, amount: 6000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    // User from different org tries to export Tally XML
    const expTally = await services.payments.exportTallyPaymentVoucher(OTHER_ORG_USER, {
      poId: po.id,
      paymentId: payRes.value.id,
    });
    expect(expTally.ok).toBe(false);
    if (!expTally.ok) {
      expect(expTally.error).toBeInstanceOf(ForbiddenError);
    }

    // User from different org tries to export Zoho JSON
    const expZoho = await services.payments.exportZohoPaymentReceipt(OTHER_ORG_USER, {
      poId: po.id,
      paymentId: payRes.value.id,
    });
    expect(expZoho.ok).toBe(false);
    if (!expZoho.ok) {
      expect(expZoho.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // 5C3-RED-07: Concurrent duplicate reversal -> Idempotent / serialized
  it('5C3-RED-07: serializes and protects against concurrent duplicate reversals', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(7500);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      7500,
      'NEFT',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-07',
        allocations: [{ invoiceId: invoice.id, amount: 7500 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await repos.paymentAllocations!.findByPaymentId(payRes.value.id);
    const allocId = allocations[0]!.id;

    // Simulate parallel concurrent reversal attempts
    const [res1, res2] = await Promise.all([
      services.payments.reversePaymentAllocation(BUYER_OWNER, {
        allocationId: allocId,
        reason: 'Concurrent reversal 1',
      }),
      services.payments.reversePaymentAllocation(BUYER_OWNER, {
        allocationId: allocId,
        reason: 'Concurrent reversal 2',
      }),
    ]);

    // Exactly one must succeed, one must fail
    const successCount = (res1.ok ? 1 : 0) + (res2.ok ? 1 : 0);
    expect(successCount).toBe(1);
  });

  // 5C3-RED-08: Reversal causing negative invoice paid amount -> Prevented
  it('5C3-RED-08: prevents reversal from corrupting invoice paid amount into negative values', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(5000);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      5000,
      'NEFT',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-08',
        allocations: [{ invoiceId: invoice.id, amount: 5000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await repos.paymentAllocations!.findByPaymentId(payRes.value.id);
    const allocId = allocations[0]!.id;

    // Artificially tamper invoice paidAmount to 2000 (less than 5000 allocation)
    const invToTamper = await repos.invoices.findById(invoice.id);
    await repos.invoices.save({
      ...invToTamper!,
      paidAmount: 2000,
    });

    // Reversal should be rejected or clamp to prevent negative
    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Underflow test reversal',
    });

    expect(revRes.ok).toBe(false);
    if (!revRes.ok) {
      expect(revRes.error.message).toMatch(/paid balance|REV-5C3-INVALID-INVOICE-PAID|underflow/i);
    }
  });

  // 5C3-RED-09: Reversal causing unallocated > payment amount -> Prevented
  it('5C3-RED-09: prevents unallocated payment amount from exceeding total payment amount', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(3000);

    const payRes = await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      3000,
      'NEFT',
      {
        purchaseOrderId: po.id,
        paymentReference: 'UTR-5C3-RED-09',
        allocations: [{ invoiceId: invoice.id, amount: 3000 }],
      },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocations = await repos.paymentAllocations!.findByPaymentId(payRes.value.id);
    const allocId = allocations[0]!.id;

    // Artificially tamper payment unallocated_amount to 1000 (which plus 3000 would exceed total 3000)
    const pmtToTamper = await repos.payments.findById(payRes.value.id);
    await repos.payments.save({
      ...pmtToTamper!,
      unallocatedAmount: 1000,
    });

    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Overflow test reversal',
    });

    expect(revRes.ok).toBe(false);
    if (!revRes.ok) {
      expect(revRes.error.message).toMatch(/resulting unallocated amount exceeds|REV-5C3-INVALID-PAYMENT-UNALLOC|overflow/i);
    }
  });

  // 5C3-RED-10: Multi-PO statement calculation excluding rejected invoices
  it('5C3-RED-10: excludes REJECTED invoices from multi-PO vendor settlement statement', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    // PO 1: 10,000 with 1 approved invoice (10,000) and full payment
    const po1 = await repos.purchaseOrders.save({
      id: 'po-5c3-201',
      poNumber: 'PO-2026-5C3-201',
      awardId: 'award-201',
      rfqId: 'rfq-201',
      organizationId: ORG_ID,
      supplierId: 'sup-5c3-a',
      totalAmount: 10000,
      currency: 'INR',
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
    });
    const inv1 = await repos.invoices.save({
      id: 'inv-5c3-201',
      purchaseOrderId: po1.id,
      workOrderId: 'wo-201',
      supplierId: 'sup-5c3-a',
      invoiceNumber: 'INV-201',
      amount: 10000,
      paidAmount: 10000,
      balanceDue: 0,
      currency: 'INR',
      status: 'PAID',
      submittedAt: now,
    });

    // Record payment for PO 1
    await services.payments.recordPayment(
      BUYER_OWNER,
      null,
      10000,
      'NEFT',
      {
        purchaseOrderId: po1.id,
        paymentReference: 'UTR-5C3-RED-10-P1',
        allocations: [{ invoiceId: inv1.id, amount: 10000 }],
      },
    );

    // PO 2: 15,000 with 1 APPROVED invoice (15,000) unpaid + 1 REJECTED invoice (5,000)
    const po2 = await repos.purchaseOrders.save({
      id: 'po-5c3-202',
      poNumber: 'PO-2026-5C3-202',
      awardId: 'award-202',
      rfqId: 'rfq-202',
      organizationId: ORG_ID,
      supplierId: 'sup-5c3-a',
      totalAmount: 15000,
      currency: 'INR',
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
    });
    const inv2Valid = await repos.invoices.save({
      id: 'inv-5c3-202-valid',
      purchaseOrderId: po2.id,
      workOrderId: 'wo-202',
      supplierId: 'sup-5c3-a',
      invoiceNumber: 'INV-202-VALID',
      amount: 15000,
      paidAmount: 0,
      balanceDue: 15000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });
    await repos.invoices.save({
      id: 'inv-5c3-202-rej',
      purchaseOrderId: po2.id,
      workOrderId: 'wo-202',
      supplierId: 'sup-5c3-a',
      invoiceNumber: 'INV-202-REJECTED',
      amount: 5000,
      paidAmount: 0,
      balanceDue: 5000,
      currency: 'INR',
      status: 'REJECTED',
      submittedAt: now,
    });

    // Issue a Debit Note of 2,000 against inv2Valid
    const noteRes = await services.payments.issueCreditDebitNote(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: inv2Valid.id,
      purchaseOrderId: po2.id,
      noteType: 'DEBIT_NOTE',
      amount: 2000,
      reason: 'Quality defect deduction',
    });
    expect(noteRes.ok).toBe(true);

    // Fetch multi-PO vendor settlement statement
    const stmtRes = await services.payments.getVendorSettlementStatement(BUYER_OWNER, {
      organizationId: ORG_ID,
      supplierId: 'sup-5c3-a',
    });
    expect(stmtRes.ok).toBe(true);
    if (!stmtRes.ok) return;

    const stmt = stmtRes.value;
    expect(stmt.totalPoAuthorized).toBe(25000); // 10k + 15k
    expect(stmt.totalInvoiced).toBe(25000); // 10k + 15k (EXCLUDES 5k rejected invoice)
    expect(stmt.totalPaid).toBe(10000); // 10k
    expect(stmt.totalOutstanding).toBe(15000); // 25k - 10k
    expect(stmt.totalDebitNotes).toBe(2000);
    expect(stmt.netPayable).toBe(13000); // 15000 - 2000 debit note = 13000
  });
});

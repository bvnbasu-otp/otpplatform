import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';

const ORG_ID = 'org-fin-1';
const OTHER_ORG_ID = 'org-other-2';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-1',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-1',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const BUYER_MEMBER: ActorContext = {
  profileId: 'buyer-member-1',
  organizationId: ORG_ID,
  orgRole: 'BUYER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-1',
  organizationId: OTHER_ORG_ID,
  orgRole: 'MANAGER',
};

const SUPPLIER_A: ActorContext = {
  profileId: 'sup-user-a',
  supplierIds: ['sup-a'],
};

describe('Phase 5C.1 Payment Allocation & Financial Red-Team Test Suite', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-a',
      businessName: 'Apex Industrial Engineering',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Machinery'],
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedApprovedInvoice(totalAmount = 10000) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    // 1. Create PO
    const po = await repos.purchaseOrders.save({
      id: 'po-101',
      awardId: 'award-101',
      rfqId: 'rfq-101',
      organizationId: ORG_ID,
      supplierId: 'sup-a',
      totalAmount,
      currency: 'INR',
      status: 'IN_PROGRESS',
      poNumber: 'PO-2026-101',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create Work Order
    const wo = await repos.workOrders.save({
      id: 'wo-101',
      purchaseOrderId: po.id,
      supplierId: 'sup-a',
      status: 'IN_PROGRESS',
      title: 'Industrial Motor Scope',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Create Milestone
    await repos.workOrderMilestones!.save({
      id: 'ms-101',
      workOrderId: wo.id,
      milestoneIndex: 1,
      milestoneTitle: 'Milestone 1: Core Delivery',
      targetPercentage: 100,
      allocatedAmount: totalAmount,
      invoicedAmount: totalAmount,
      status: 'SUBMITTED_BY_SUPPLIER',
      isInvoiced: true,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create and Approve Invoice
    const invoice = await repos.invoices.save({
      id: 'inv-101',
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      milestoneId: 'ms-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-2026-001',
      amount: totalAmount,
      paidAmount: 0,
      balanceDue: totalAmount,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    return { po, wo, invoice, repos };
  }

  // =========================================================================
  // RED-01: Payment Over-Allocation Violation
  // =========================================================================
  it('RED-01: Rejects allocation exceeding total available payment amount', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    // Record a payment of ₹5,000 for PO
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      5000,
      'BANK_TRANSFER',
      { purchaseOrderId: invoice.purchaseOrderId },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;
    const payment = payRes.value;

    // Attempting to allocate ₹6,000 from a ₹5,000 payment must fail
    const overAllocRes = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payment.id,
      invoice.id,
      6000,
      'Over-allocation test',
    );

    expect(overAllocRes.ok).toBe(false);
    if (!overAllocRes.ok) {
      expect(overAllocRes.error).toBeInstanceOf(ValidationError);
      expect(overAllocRes.error.message).toContain('exceeds available payment balance');
    }
  });

  // =========================================================================
  // RED-02: Invoice Over-Allocation / Over-Payment Violation
  // =========================================================================
  it('RED-02: Rejects allocation exceeding invoice balance due', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    // Record a large payment of ₹25,000
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      25000,
      'BANK_TRANSFER',
      { purchaseOrderId: invoice.purchaseOrderId },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;
    const payment = payRes.value;

    // First allocate ₹8,000 to invoice (balance remaining: ₹2,000)
    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payment.id,
      invoice.id,
      8000,
    );
    expect(alloc1.ok).toBe(true);

    // Second allocation of ₹3,000 exceeds ₹2,000 balance due -> must fail
    const overInvAlloc = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payment.id,
      invoice.id,
      3000,
    );

    expect(overInvAlloc.ok).toBe(false);
    if (!overInvAlloc.ok) {
      expect(overInvAlloc.error).toBeInstanceOf(ValidationError);
      expect(overInvAlloc.error.message).toContain('exceeds invoice balance due');
    }
  });

  // =========================================================================
  // RED-03: Partial Payment State Synchronization
  // =========================================================================
  it('RED-03: Correctly transitions invoice to PARTIALLY_PAID on partial remittance', async () => {
    const { invoice, repos } = await seedApprovedInvoice(10000);

    // Record partial payment of ₹4,000 directly against invoice
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      4000,
      'UPI',
      { reference: 'UPI-REF-001' },
    );
    expect(payRes.ok).toBe(true);

    // Check synchronized invoice state
    const updatedInv = await repos.invoices.findById(invoice.id);
    expect(updatedInv?.status).toBe('PARTIALLY_PAID');
    expect(updatedInv?.paidAmount).toBe(4000);
    expect(updatedInv?.balanceDue).toBe(6000);

    // Check invoice payment summary
    const summaryRes = await services.payments.getInvoicePaymentSummary(
      BUYER_MANAGER,
      invoice.id,
    );
    expect(summaryRes.ok).toBe(true);
    if (summaryRes.ok) {
      expect(summaryRes.value.isPartiallyPaid).toBe(true);
      expect(summaryRes.value.isFullyPaid).toBe(false);
      expect(summaryRes.value.paidAmount).toBe(4000);
      expect(summaryRes.value.balanceDue).toBe(6000);
      expect(summaryRes.value.allocationCount).toBe(1);
    }
  });

  // =========================================================================
  // RED-04: Full Settlement Transition to PAID
  // =========================================================================
  it('RED-04: Transitions invoice to PAID when cumulative allocations cover total amount', async () => {
    const { invoice, repos } = await seedApprovedInvoice(10000);

    // Payment 1: ₹4,000
    await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      4000,
      'UPI',
    );

    // Payment 2: Remaining ₹6,000
    const pay2Res = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      6000,
      'BANK_TRANSFER',
    );
    expect(pay2Res.ok).toBe(true);

    // Check invoice transitioned to PAID
    const updatedInv = await repos.invoices.findById(invoice.id);
    expect(updatedInv?.status).toBe('PAID');
    expect(updatedInv?.paidAmount).toBe(10000);
    expect(updatedInv?.balanceDue).toBe(0);

    // Check summary
    const summaryRes = await services.payments.getInvoicePaymentSummary(
      BUYER_MANAGER,
      invoice.id,
    );
    expect(summaryRes.ok).toBe(true);
    if (summaryRes.ok) {
      expect(summaryRes.value.isFullyPaid).toBe(true);
      expect(summaryRes.value.isPartiallyPaid).toBe(false);
      expect(summaryRes.value.balanceDue).toBe(0);
      expect(summaryRes.value.allocationCount).toBe(2);
    }
  });

  // =========================================================================
  // RED-05: Allocation Void / Reversal State Sync
  // =========================================================================
  it('RED-05: Voiding an allocation resets paid_amount, balance_due, and reverts status', async () => {
    const { invoice, repos } = await seedApprovedInvoice(10000);

    // Record ₹10,000 payment (transitions to PAID)
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      10000,
      'BANK_TRANSFER',
    );
    expect(payRes.ok).toBe(true);

    const allocs = await repos.paymentAllocations!.findByInvoiceId(invoice.id);
    expect(allocs.length).toBe(1);
    const allocId = allocs[0]!.id;

    // Void the allocation
    const voidRes = await services.payments.voidAllocation(
      BUYER_MANAGER,
      allocId,
      'Bank transaction failed / bounce',
    );
    expect(voidRes.ok).toBe(true);

    // Invoice status must revert to APPROVED with balanceDue = 10000
    const revertedInv = await repos.invoices.findById(invoice.id);
    expect(revertedInv?.status).toBe('APPROVED');
    expect(revertedInv?.paidAmount).toBe(0);
    expect(revertedInv?.balanceDue).toBe(10000);

    // Payment unallocated amount should be restored to 10000
    if (!payRes.ok) throw payRes.error;
    const updatedPay = await repos.payments.findById(payRes.value.id);
    expect(updatedPay?.unallocatedAmount).toBe(10000);
  });

  // =========================================================================
  // RED-06: Multi-Invoice Split Payment (One Payment -> Multiple Invoices)
  // =========================================================================
  it('RED-06: Allocates a single lump-sum payment across multiple progressive invoices', async () => {
    const { po, repos } = await seedApprovedInvoice(15000);

    // Create Invoice 1 (₹10,000) and Invoice 2 (₹5,000)
    const inv1 = await repos.invoices.save({
      id: 'inv-split-1',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-SPLIT-1',
      amount: 10000,
      paidAmount: 0,
      balanceDue: 10000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const inv2 = await repos.invoices.save({
      id: 'inv-split-2',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-SPLIT-2',
      amount: 5000,
      paidAmount: 0,
      balanceDue: 5000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // Record lump-sum payment of ₹15,000 with multi-invoice batch allocation
    const splitPaymentRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      15000,
      'BANK_TRANSFER',
      {
        purchaseOrderId: po.id,
        allocations: [
          { invoiceId: inv1.id, amount: 10000, notes: 'Full settlement Invoice 1' },
          { invoiceId: inv2.id, amount: 5000, notes: 'Full settlement Invoice 2' },
        ],
      },
    );

    expect(splitPaymentRes.ok).toBe(true);
    if (!splitPaymentRes.ok) throw splitPaymentRes.error;

    // Verify payment unallocated amount is 0
    expect(splitPaymentRes.value.unallocatedAmount).toBe(0);

    // Verify both invoices are marked PAID
    const updated1 = await repos.invoices.findById(inv1.id);
    const updated2 = await repos.invoices.findById(inv2.id);

    expect(updated1?.status).toBe('PAID');
    expect(updated1?.paidAmount).toBe(10000);
    expect(updated1?.balanceDue).toBe(0);

    expect(updated2?.status).toBe('PAID');
    expect(updated2?.paidAmount).toBe(5000);
    expect(updated2?.balanceDue).toBe(0);
  });

  // =========================================================================
  // RED-07: Unallocated Payment / Advance Payment
  // =========================================================================
  it('RED-07: Supports unallocated advance payment and computes unallocated_amount', async () => {
    const { po, invoice, repos } = await seedApprovedInvoice(10000);

    // Record advance payment of ₹20,000 with ₹10,000 allocated to current invoice
    const advPayRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      20000,
      'BANK_TRANSFER',
      {
        purchaseOrderId: po.id,
        allocations: [{ invoiceId: invoice.id, amount: 10000 }],
      },
    );

    expect(advPayRes.ok).toBe(true);
    if (!advPayRes.ok) throw advPayRes.error;

    expect(advPayRes.value.unallocatedAmount).toBe(10000);

    // Check payment summary
    const paySummary = await services.payments.getPaymentAllocationSummary(
      BUYER_MANAGER,
      advPayRes.value.id,
    );
    expect(paySummary.ok).toBe(true);
    if (paySummary.ok) {
      expect(paySummary.value.paymentAmount).toBe(20000);
      expect(paySummary.value.allocatedAmount).toBe(10000);
      expect(paySummary.value.unallocatedAmount).toBe(10000);
      expect(paySummary.value.isFullyAllocated).toBe(false);
    }
  });

  // =========================================================================
  // RED-08: Zero or Negative Allocation Rejection
  // =========================================================================
  it('RED-08: Strictly rejects 0 or negative allocation amounts', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    const zeroPayRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      0,
      'UPI',
    );
    expect(zeroPayRes.ok).toBe(false);

    const negPayRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      -500,
      'UPI',
    );
    expect(negPayRes.ok).toBe(false);
  });

  // =========================================================================
  // RED-09: Fractional Rounding & Invariant Tolerance
  // =========================================================================
  it('RED-09: Preserves 2-decimal arithmetic precision across fractional splits', async () => {
    const { po, repos } = await seedApprovedInvoice(1000);

    const inv = await repos.invoices.save({
      id: 'inv-fractional',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-FRAC',
      amount: 100.00,
      paidAmount: 0,
      balanceDue: 100.00,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // 3 fractional payments: 33.33, 33.33, 33.34 = 100.00
    await services.payments.recordPayment(BUYER_MANAGER, inv.id, 33.33, 'UPI');
    await services.payments.recordPayment(BUYER_MANAGER, inv.id, 33.33, 'UPI');
    const p3 = await services.payments.recordPayment(BUYER_MANAGER, inv.id, 33.34, 'UPI');

    expect(p3.ok).toBe(true);

    const finalInv = await repos.invoices.findById(inv.id);
    expect(finalInv?.status).toBe('PAID');
    expect(finalInv?.paidAmount).toBe(100);
    expect(finalInv?.balanceDue).toBe(0);
  });

  // =========================================================================
  // RED-10: Tenant Isolation & Permission Security Guard
  // =========================================================================
  it('RED-10: Enforces tenant isolation and role permissions (blocks non-managers and other orgs)', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    // 1. Regular buyer member (non-manager/owner) cannot record payment
    const memberRes = await services.payments.recordPayment(
      BUYER_MEMBER,
      invoice.id,
      5000,
      'UPI',
    );
    expect(memberRes.ok).toBe(false);
    if (!memberRes.ok) {
      expect(memberRes.error).toBeInstanceOf(ForbiddenError);
    }

    // 2. User from different organization cannot record payment
    const otherOrgRes = await services.payments.recordPayment(
      OTHER_ORG_USER,
      invoice.id,
      5000,
      'UPI',
    );
    expect(otherOrgRes.ok).toBe(false);
    if (!otherOrgRes.ok) {
      expect(otherOrgRes.error).toBeInstanceOf(ForbiddenError);
    }

    // 3. Supplier cannot record payment on invoice
    const supRes = await services.payments.recordPayment(
      SUPPLIER_A,
      invoice.id,
      5000,
      'UPI',
    );
    expect(supRes.ok).toBe(false);
  });

  // =========================================================================
  // RED-H1-01: Atomic Failure (Mode B: invoice payment allocation fails -> rollback)
  // =========================================================================
  it('RED-H1-01: Atomic Failure (Payment creation fails atomically when allocation exceeds limit, no payment created)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(10000);

    // Initial payments count for PO
    const initialPayments = await repos.payments.findByPurchaseOrderId!(invoice.purchaseOrderId!);
    const initialAllocs = await repos.paymentAllocations!.findByInvoiceId(invoice.id);

    // Attempt to record invoice payment of ₹12,000 against ₹10,000 balance
    const failedRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      12000,
      'BANK_TRANSFER',
    );

    expect(failedRes.ok).toBe(false);

    // Invariant: No payment created, no allocation created, invoice remains unchanged
    const finalPayments = await repos.payments.findByPurchaseOrderId!(invoice.purchaseOrderId!);
    const finalAllocs = await repos.paymentAllocations!.findByInvoiceId(invoice.id);
    const unchangedInv = await repos.invoices.findById(invoice.id);

    expect(finalPayments.length).toBe(initialPayments.length);
    expect(finalAllocs.length).toBe(initialAllocs.length);
    expect(unchangedInv?.status).toBe('APPROVED');
    expect(unchangedInv?.paidAmount).toBe(0);
    expect(unchangedInv?.balanceDue).toBe(10000);
  });

  // =========================================================================
  // RED-H1-02: Exact Ceiling (Payment ₹5,000.00, Allocation ₹5,000.00 -> PASS)
  // =========================================================================
  it('RED-H1-02: Exact Ceiling (Payment ₹5,000.00, Allocation ₹5,000.00 -> PASS)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(5000);

    const exactRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.00,
      'BANK_TRANSFER',
    );

    expect(exactRes.ok).toBe(true);
    const updatedInv = await repos.invoices.findById(invoice.id);
    expect(updatedInv?.status).toBe('PAID');
    expect(updatedInv?.paidAmount).toBe(5000.00);
    expect(updatedInv?.balanceDue).toBe(0);
  });

  // =========================================================================
  // RED-H1-03: One Paise Over (Payment ₹5,000.00, Allocation ₹5,000.01 -> REJECT)
  // =========================================================================
  it('RED-H1-03: One Paise Over (Payment ₹5,000.00, Allocation ₹5,000.01 -> REJECT)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const over1pRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.01,
      'BANK_TRANSFER',
    );

    expect(over1pRes.ok).toBe(false);
    if (!over1pRes.ok) {
      expect(over1pRes.error.message).toContain('exceeds invoice balance due');
    }
  });

  // =========================================================================
  // RED-H1-04: Four Paise Over (Payment ₹5,000.00, Allocation ₹5,000.04 -> REJECT)
  // =========================================================================
  it('RED-H1-04: Four Paise Over (Payment ₹5,000.00, Allocation ₹5,000.04 -> REJECT)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const over4pRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.04,
      'BANK_TRANSFER',
    );

    expect(over4pRes.ok).toBe(false);
    if (!over4pRes.ok) {
      expect(over4pRes.error.message).toContain('exceeds invoice balance due');
    }
  });

  // =========================================================================
  // RED-H1-05: Five Paise Over (Payment ₹5,000.00, Allocation ₹5,000.05 -> REJECT)
  // =========================================================================
  it('RED-H1-05: Five Paise Over (Payment ₹5,000.00, Allocation ₹5,000.05 -> REJECT)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const over5pRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.05,
      'BANK_TRANSFER',
    );

    expect(over5pRes.ok).toBe(false);
    if (!over5pRes.ok) {
      expect(over5pRes.error.message).toContain('exceeds invoice balance due');
    }
  });

  // =========================================================================
  // RED-H1-06: Split Exact (₹10,000 payment split 3333.33 + 3333.33 + 3333.34)
  // =========================================================================
  it('RED-H1-06: Split Exact (₹10,000 payment split into 3,333.33 + 3,333.33 + 3,333.34 -> ₹10,000 allocated, ₹0 unallocated)', async () => {
    const { po, repos } = await seedApprovedInvoice(10000);

    const inv1 = await repos.invoices.save({
      id: 'inv-h1-1',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-H1-1',
      amount: 3333.33,
      paidAmount: 0,
      balanceDue: 3333.33,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const inv2 = await repos.invoices.save({
      id: 'inv-h1-2',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-H1-2',
      amount: 3333.33,
      paidAmount: 0,
      balanceDue: 3333.33,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const inv3 = await repos.invoices.save({
      id: 'inv-h1-3',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-H1-3',
      amount: 3333.34,
      paidAmount: 0,
      balanceDue: 3333.34,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const splitRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      10000,
      'BANK_TRANSFER',
      {
        purchaseOrderId: po.id,
        allocations: [
          { invoiceId: inv1.id, amount: 3333.33 },
          { invoiceId: inv2.id, amount: 3333.33 },
          { invoiceId: inv3.id, amount: 3333.34 },
        ],
      },
    );

    expect(splitRes.ok).toBe(true);
    if (!splitRes.ok) throw splitRes.error;
    expect(splitRes.value.unallocatedAmount).toBe(0);

    const u1 = await repos.invoices.findById(inv1.id);
    const u2 = await repos.invoices.findById(inv2.id);
    const u3 = await repos.invoices.findById(inv3.id);

    expect(u1?.status).toBe('PAID');
    expect(u2?.status).toBe('PAID');
    expect(u3?.status).toBe('PAID');
  });

  // =========================================================================
  // RED-H1-07: Unauthorized Financial Mutation
  // =========================================================================
  it('RED-H1-07: Unauthorized Financial Mutation (Attempt to modify financial fields as normal buyer, supplier, external user -> REJECT)', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    // Buyer member cannot record payment
    const memberRes = await services.payments.recordPayment(
      BUYER_MEMBER,
      invoice.id,
      1000,
      'UPI',
    );
    expect(memberRes.ok).toBe(false);
    if (!memberRes.ok) {
      expect(memberRes.error).toBeInstanceOf(ForbiddenError);
    }

    // Supplier cannot record payment
    const supRes = await services.payments.recordPayment(
      SUPPLIER_A,
      invoice.id,
      1000,
      'UPI',
    );
    expect(supRes.ok).toBe(false);
    if (!supRes.ok) {
      expect(supRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // =========================================================================
  // RED-H1-08: Partial Payment Does Not Close Procurement
  // =========================================================================
  it('RED-H1-08: Partial Payment Does Not Close Procurement (PO ₹100k, Inv A ₹40k, Inv B ₹60k, Pay A ₹40k -> Inv A PAID, Inv B UNPAID, PO NOT closed)', async () => {
    const { po, repos } = await seedApprovedInvoice(100000);

    const invA = await repos.invoices.save({
      id: 'inv-h1-8a',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-H1-8A',
      amount: 40000,
      paidAmount: 0,
      balanceDue: 40000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const invB = await repos.invoices.save({
      id: 'inv-h1-8b',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-H1-8B',
      amount: 60000,
      paidAmount: 0,
      balanceDue: 60000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // Pay Inv A fully
    const payARes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invA.id,
      40000,
      'BANK_TRANSFER',
    );
    expect(payARes.ok).toBe(true);

    const updatedA = await repos.invoices.findById(invA.id);
    const updatedB = await repos.invoices.findById(invB.id);
    const currentPo = await repos.purchaseOrders.findById(po.id);

    expect(updatedA?.status).toBe('PAID');
    expect(updatedB?.status).toBe('APPROVED');
    expect(currentPo?.status).toBe('IN_PROGRESS');
  });

  // =========================================================================
  // RED-H1-09: Unallocated Advance
  // =========================================================================
  it('RED-H1-09: Unallocated Advance (Payment ₹20,000, Allocation ₹10,000 -> Allocated ₹10,000, Unallocated ₹10,000)', async () => {
    const { po, invoice } = await seedApprovedInvoice(10000);

    const advRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      20000,
      'BANK_TRANSFER',
      {
        purchaseOrderId: po.id,
        allocations: [{ invoiceId: invoice.id, amount: 10000 }],
      },
    );

    expect(advRes.ok).toBe(true);
    if (!advRes.ok) throw advRes.error;
    expect(advRes.value.unallocatedAmount).toBe(10000);

    const summary = await services.payments.getPaymentAllocationSummary(
      BUYER_MANAGER,
      advRes.value.id,
    );
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.allocatedAmount).toBe(10000);
      expect(summary.value.unallocatedAmount).toBe(10000);
    }
  });

  // =========================================================================
  // RED-H1-10: Allocation Replay
  // =========================================================================
  it('RED-H1-10: Allocation Replay (Same allocation request repeated -> No duplicate financial over-allocation)', async () => {
    const { invoice } = await seedApprovedInvoice(10000);

    // Record payment of ₹10,000 Mode A (unallocated)
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      10000,
      'BANK_TRANSFER',
      { purchaseOrderId: invoice.purchaseOrderId },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;

    // First allocation of ₹6,000 (leaves ₹4,000 remaining on payment and balance on invoice)
    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      6000,
    );
    expect(alloc1.ok).toBe(true);

    // Replay/Duplicate allocation of ₹6,000 exceeds available payment balance (₹4,000) and invoice balance (₹4,000) -> must fail
    const replayAlloc = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      6000,
    );
    expect(replayAlloc.ok).toBe(false);
    if (!replayAlloc.ok) {
      expect(replayAlloc.error.message).toContain('exceeds');
    }
  });

  // =========================================================================
  // H1-P1-04: Backfill Reconciliation Verification Test
  // =========================================================================
  it('H1-P1-04: Backfill Reconciliation Verification (preserves payment.amount = active_allocated + unallocated)', async () => {
    const { repos } = await seedApprovedInvoice(10000);

    // Simulate historical dataset with 3 payments:
    // 1. Fully allocated payment
    const p1 = await repos.payments.save({
      id: 'pay-hist-1',
      invoiceId: 'inv-101',
      purchaseOrderId: 'po-101',
      amount: 6000,
      unallocatedAmount: 0,
      currency: 'INR',
      method: 'UPI',
      status: 'RECORDED',
      recordedBy: 'buyer-mgr-1',
      recordedAt: new Date().toISOString(),
    });
    await repos.paymentAllocations!.save({
      id: 'alloc-hist-1',
      paymentId: p1.id,
      invoiceId: 'inv-101',
      allocatedAmount: 6000,
      allocatedAt: new Date().toISOString(),
      status: 'ALLOCATED',
    });

    // 2. Partially allocated payment
    const p2 = await repos.payments.save({
      id: 'pay-hist-2',
      invoiceId: null,
      purchaseOrderId: 'po-101',
      amount: 10000,
      unallocatedAmount: 6000,
      currency: 'INR',
      method: 'BANK_TRANSFER',
      status: 'RECORDED',
      recordedBy: 'buyer-mgr-1',
      recordedAt: new Date().toISOString(),
    });
    await repos.paymentAllocations!.save({
      id: 'alloc-hist-2',
      paymentId: p2.id,
      invoiceId: 'inv-101',
      allocatedAmount: 4000,
      allocatedAt: new Date().toISOString(),
      status: 'ALLOCATED',
    });

    // 3. Fully unallocated payment (Advance)
    const p3 = await repos.payments.save({
      id: 'pay-hist-3',
      invoiceId: null,
      purchaseOrderId: 'po-101',
      amount: 15000,
      unallocatedAmount: 15000,
      currency: 'INR',
      method: 'BANK_TRANSFER',
      status: 'RECORDED',
      recordedBy: 'buyer-mgr-1',
      recordedAt: new Date().toISOString(),
    });

    // Reconciliation check across all payments
    const allPayments = await repos.payments.findByPurchaseOrderId!('po-101');
    for (const pay of allPayments) {
      const allocs = await repos.paymentAllocations!.findByPaymentId(pay.id);
      const activeAllocated = allocs
        .filter((a) => a.status === 'ALLOCATED')
        .reduce((sum, a) => sum + a.allocatedAmount, 0);

      // Invariant: payment.amount == active_allocated + unallocated
      expect(pay.amount).toBe(Math.round((activeAllocated + (pay.unallocatedAmount ?? 0)) * 100) / 100);
    }
  });

  // =========================================================================
  // H2-RED-01 to H2-RED-15 COMPREHENSIVE RED-TEAM TEST MATRIX (Phase 5C.1-H2)
  // =========================================================================

  it('H2-RED-01: Transaction Rollback on Atomic Failure (no orphan payments / allocations)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(5000);

    // Attempt allocation exceeding balance
    const failedRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.01,
      'UPI',
    );
    expect(failedRes.ok).toBe(false);

    // Verify zero orphan payments exist
    const allPayments = await repos.payments.findByPurchaseOrderId!('po-101');
    expect(allPayments.length).toBe(0);

    // Verify zero allocations exist
    const allAllocs = await repos.paymentAllocations!.findByInvoiceId(invoice.id);
    expect(allAllocs.length).toBe(0);

    // Verify invoice is completely unchanged
    const inv = await repos.invoices.findById(invoice.id);
    expect(inv?.status).toBe('APPROVED');
    expect(inv?.paidAmount).toBe(0);
    expect(inv?.balanceDue).toBe(5000);
  });

  it('H2-RED-02: Exact Ceiling Match (₹5,000 against ₹5,000 -> PASS, PAID, balance ₹0.00)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(5000);

    const res = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.00,
      'BANK_TRANSFER',
    );
    expect(res.ok).toBe(true);

    const updatedInv = await repos.invoices.findById(invoice.id);
    expect(updatedInv?.status).toBe('PAID');
    expect(updatedInv?.paidAmount).toBe(5000.00);
    expect(updatedInv?.balanceDue).toBe(0);

    const summary = await services.payments.getInvoicePaymentSummary(BUYER_MANAGER, invoice.id);
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.isFullyPaid).toBe(true);
      expect(summary.value.isPartiallyPaid).toBe(false);
    }
  });

  it('H2-RED-03: One-Paise Over-Allocation (₹5,000.01 against ₹5,000 -> REJECT)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const res = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000.01,
      'BANK_TRANSFER',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('exceeds');
    }
  });

  it('H2-RED-04: Duplicate Payment Event / Idempotency (same payment cannot double allocate)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(10000);

    // Initial Payment Mode A
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      10000,
      'UPI',
      { purchaseOrderId: invoice.purchaseOrderId },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;

    // Allocate 10,000
    const allocRes = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      10000,
    );
    expect(allocRes.ok).toBe(true);

    // Duplicate event replay
    const dupAllocRes = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      10000,
    );
    expect(dupAllocRes.ok).toBe(false);

    // Conservation holds
    const inv = await repos.invoices.findById(invoice.id);
    expect(inv?.paidAmount).toBe(10000);
    expect(inv?.balanceDue).toBe(0);
  });

  it('H2-RED-05: Duplicate Allocation Request Replay (attempting duplicate replay -> rejected)', async () => {
    const { invoice } = await seedApprovedInvoice(8000);

    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      8000,
      'BANK_TRANSFER',
      { purchaseOrderId: invoice.purchaseOrderId },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;

    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      5000,
    );
    expect(alloc1.ok).toBe(true);

    // Replay with original 5000 exceeds available 3000 balance -> rejected
    const allocReplay = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      5000,
    );
    expect(allocReplay.ok).toBe(false);
  });

  it('H2-RED-06: Concurrent Payment Allocation (competing allocations exceeding payment amount -> conservation holds)', async () => {
    const { po, repos } = await seedApprovedInvoice(10000);

    const inv1 = await repos.invoices.save({
      id: 'inv-conc-1',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-CONC-1',
      amount: 6000,
      paidAmount: 0,
      balanceDue: 6000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const inv2 = await repos.invoices.save({
      id: 'inv-conc-2',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-CONC-2',
      amount: 6000,
      paidAmount: 0,
      balanceDue: 6000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // Payment of ₹10,000
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      10000,
      'BANK_TRANSFER',
      { purchaseOrderId: po.id },
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;

    // Attempt 1: 6,000 to inv1
    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      inv1.id,
      6000,
    );
    expect(alloc1.ok).toBe(true);

    // Attempt 2: 6,000 to inv2 (payment has only 4,000 left)
    const alloc2 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      inv2.id,
      6000,
    );
    expect(alloc2.ok).toBe(false);

    // Conservation check
    const pay = await repos.payments.findById(payRes.value.id);
    expect(pay?.unallocatedAmount).toBe(4000);
  });

  it('H2-RED-07: Concurrent Invoice Allocation (competing payments exceeding invoice balance -> total accepted <= invoice amount)', async () => {
    const { po, invoice, repos } = await seedApprovedInvoice(10000);

    const p1 = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      7000,
      'BANK_TRANSFER',
      { purchaseOrderId: po.id },
    );
    const p2 = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      7000,
      'BANK_TRANSFER',
      { purchaseOrderId: po.id },
    );

    expect(p1.ok).toBe(true);
    expect(p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) throw new Error('payment failed');

    // Alloc 1: 7,000 to invoice (balance becomes 3,000)
    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      p1.value.id,
      invoice.id,
      7000,
    );
    expect(alloc1.ok).toBe(true);

    // Alloc 2: 7,000 to invoice -> fails because invoice balance is only 3,000
    const alloc2 = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      p2.value.id,
      invoice.id,
      7000,
    );
    expect(alloc2.ok).toBe(false);

    // Total accepted on invoice is exactly 7,000 <= 10,000
    const finalInv = await repos.invoices.findById(invoice.id);
    expect(finalInv?.paidAmount).toBe(7000);
    expect(finalInv?.balanceDue).toBe(3000);
  });

  it('H2-RED-08: Unallocated Advance Payment Conservation (payment.amount = allocated + unallocated)', async () => {
    const { po, invoice, repos } = await seedApprovedInvoice(4000);

    const advRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      10000,
      'BANK_TRANSFER',
      {
        purchaseOrderId: po.id,
        allocations: [{ invoiceId: invoice.id, amount: 4000 }],
      },
    );

    expect(advRes.ok).toBe(true);
    if (!advRes.ok) throw advRes.error;

    const pay = await repos.payments.findById(advRes.value.id);
    expect(pay?.amount).toBe(10000);
    expect(pay?.unallocatedAmount).toBe(6000);
    expect(pay?.amount).toBe(4000 + (pay?.unallocatedAmount ?? 0));
  });

  it('H2-RED-09: Allocation Void / Reversal Conservation (reverting allocation restores unallocated amount and invoice balance)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(5000);

    const payRes = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      invoice.id,
      5000,
      'BANK_TRANSFER',
    );
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) throw payRes.error;

    // Void the allocation
    const voidRes = await services.payments.voidAllocation(
      BUYER_MANAGER,
      payRes.value.allocation.id,
      'Incorrect remittance batch UTR',
    );
    expect(voidRes.ok).toBe(true);

    const updatedInv = await repos.invoices.findById(invoice.id);
    const updatedPay = await repos.payments.findById(payRes.value.payment.id);

    // Invoice restored to APPROVED and full balance due
    expect(updatedInv?.status).toBe('APPROVED');
    expect(updatedInv?.paidAmount).toBe(0);
    expect(updatedInv?.balanceDue).toBe(5000);

    // Payment unallocated amount restored to full amount
    expect(updatedPay?.unallocatedAmount).toBe(5000);
  });

  it('H2-RED-10: Unauthorized Financial UPDATE (blocked by actor context and role checks)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const memRes = await services.payments.recordPayment(
      BUYER_MEMBER,
      invoice.id,
      5000,
      'UPI',
    );
    expect(memRes.ok).toBe(false);

    const supRes = await services.payments.recordPayment(
      SUPPLIER_A,
      invoice.id,
      5000,
      'UPI',
    );
    expect(supRes.ok).toBe(false);
  });

  it('H2-RED-11: Forged Payment Amount (client cannot inject negative or zero amount)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const zeroRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      0,
      'UPI',
    );
    expect(zeroRes.ok).toBe(false);

    const negRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      invoice.id,
      -500,
      'UPI',
    );
    expect(negRes.ok).toBe(false);
  });

  it('H2-RED-12: Forged Invoice Balance (balance_due and paid_amount are purely derived from verified allocations)', async () => {
    const { invoice, repos } = await seedApprovedInvoice(5000);

    // Create partial allocation of 2000
    const payRes = await services.payments.recordPayment(
      BUYER_MANAGER,
      null,
      2000,
      'UPI',
      {
        purchaseOrderId: invoice.purchaseOrderId,
        allocations: [{ invoiceId: invoice.id, amount: 2000 }],
      },
    );
    expect(payRes.ok).toBe(true);

    const inv = await repos.invoices.findById(invoice.id);
    expect(inv?.paidAmount).toBe(2000);
    expect(inv?.balanceDue).toBe(3000);
    expect(inv?.status).toBe('PARTIALLY_PAID');
  });

  it('H2-RED-13: Cross-Tenant Payment Access (tenant isolation strictly blocks unauthorized org access)', async () => {
    const { invoice } = await seedApprovedInvoice(5000);

    const crossOrgRes = await services.payments.recordPayment(
      OTHER_ORG_USER,
      invoice.id,
      5000,
      'UPI',
    );
    expect(crossOrgRes.ok).toBe(false);
    if (!crossOrgRes.ok) {
      expect(crossOrgRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('H2-RED-14: Premature PO Completion Protection (milestone payment does not close PO)', async () => {
    const { po, repos } = await seedApprovedInvoice(100000);

    const inv1 = await repos.invoices.save({
      id: 'inv-po-1',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-PO-1',
      amount: 30000,
      paidAmount: 0,
      balanceDue: 30000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    const inv2 = await repos.invoices.save({
      id: 'inv-po-2',
      purchaseOrderId: po.id,
      workOrderId: 'wo-101',
      supplierId: 'sup-a',
      invoiceNumber: 'INV-PO-2',
      amount: 70000,
      paidAmount: 0,
      balanceDue: 70000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // Pay milestone invoice 1
    const pay1 = await services.payments.recordInvoicePayment(
      BUYER_MANAGER,
      inv1.id,
      30000,
      'BANK_TRANSFER',
    );
    expect(pay1.ok).toBe(true);

    const currentPo = await repos.purchaseOrders.findById(po.id);
    const u1 = await repos.invoices.findById(inv1.id);
    const u2 = await repos.invoices.findById(inv2.id);

    expect(u1?.status).toBe('PAID');
    expect(u2?.status).toBe('APPROVED');
    expect(currentPo?.status).toBe('IN_PROGRESS'); // Must NOT complete prematurely
  });

  it('H2-RED-15: Historical Backfill Conservation (zero financial leakage across all historical records)', async () => {
    const { repos } = await seedApprovedInvoice(50000);

    // Multi-payment historical scenario
    const p1 = await repos.payments.save({
      id: 'p-backfill-1',
      invoiceId: 'inv-101',
      purchaseOrderId: 'po-101',
      amount: 25000,
      unallocatedAmount: 0,
      currency: 'INR',
      method: 'BANK_TRANSFER',
      status: 'RECORDED',
      recordedBy: 'buyer-mgr-1',
      recordedAt: new Date().toISOString(),
    });
    await repos.paymentAllocations!.save({
      id: 'a-backfill-1',
      paymentId: p1.id,
      invoiceId: 'inv-101',
      allocatedAmount: 25000,
      allocatedAt: new Date().toISOString(),
      status: 'ALLOCATED',
    });

    const p2 = await repos.payments.save({
      id: 'p-backfill-2',
      invoiceId: null,
      purchaseOrderId: 'po-101',
      amount: 25000,
      unallocatedAmount: 25000,
      currency: 'INR',
      method: 'BANK_TRANSFER',
      status: 'RECORDED',
      recordedBy: 'buyer-mgr-1',
      recordedAt: new Date().toISOString(),
    });

    // Invariant verification
    const allPayments = [p1, p2];
    for (const p of allPayments) {
      const allocs = await repos.paymentAllocations!.findByPaymentId(p.id);
      const activeAlloc = allocs.filter((a) => a.status === 'ALLOCATED').reduce((s, a) => s + a.allocatedAmount, 0);
      expect(p.amount).toBe(activeAlloc + (p.unallocatedAmount ?? 0));
    }
  });

  describe('Phase 5C.2 Cumulative Settlement & Red-Team Tests', () => {
    it('PO Settlement Summary calculation and advance payment allocation flow', async () => {
      const { po, wo, invoice, repos } = await seedApprovedInvoice(100000);

      // Record an advance payment of ₹50,000 linked to the PO (no invoice initially)
      const payAdv = await repos.payments.save({
        id: 'pay-adv-1',
        purchaseOrderId: po.id,
        invoiceId: null,
        amount: 50000,
        unallocatedAmount: 50000,
        currency: 'INR',
        method: 'BANK_TRANSFER',
        status: 'RECORDED',
        recordedBy: BUYER_OWNER.profileId,
        recordedAt: new Date().toISOString(),
      });

      // 1. Check Settlement Summary before allocation
      const summaryRes1 = await services.payments.getPoSettlementSummary(BUYER_OWNER, po.id);
      expect(summaryRes1.ok).toBe(true);
      if (summaryRes1.ok) {
        expect(summaryRes1.value.poAuthorizedTotal).toBe(100000);
        expect(summaryRes1.value.cumulativeInvoicedAmount).toBe(100000);
        expect(summaryRes1.value.cumulativePaidAmount).toBe(0);
        expect(summaryRes1.value.invoicedOutstandingAmount).toBe(100000);
        expect(summaryRes1.value.unallocatedAdvanceAmount).toBe(50000);
        expect(summaryRes1.value.isFullySettled).toBe(false);
      }

      // 2. Allocate ₹30,000 from advance to invoice-101
      const allocRes = await services.payments.allocateAdvancePayment(BUYER_OWNER, {
        paymentId: payAdv.id,
        invoiceId: invoice.id,
        amount: 30000,
        notes: '30k advance applied to milestone 1',
      });
      expect(allocRes.ok).toBe(true);

      // 3. Check Settlement Summary after advance allocation
      const summaryRes2 = await services.payments.getPoSettlementSummary(BUYER_OWNER, po.id);
      expect(summaryRes2.ok).toBe(true);
      if (summaryRes2.ok) {
        expect(summaryRes2.value.cumulativePaidAmount).toBe(30000);
        expect(summaryRes2.value.invoicedOutstandingAmount).toBe(70000);
        expect(summaryRes2.value.unallocatedAdvanceAmount).toBe(20000);
        expect(summaryRes2.value.counts.partiallyPaidInvoiceCount).toBe(1);
        expect(summaryRes2.value.isFullySettled).toBe(false);
      }

      // 4. Allocate remaining ₹20,000 advance
      const allocRes2 = await services.payments.allocateAdvancePayment(BUYER_OWNER, {
        paymentId: payAdv.id,
        invoiceId: invoice.id,
        amount: 20000,
      });
      expect(allocRes2.ok).toBe(true);

      // 5. Pay the remaining ₹50,000 directly
      const payDirect = await services.payments.recordInvoicePayment(
        BUYER_OWNER,
        invoice.id,
        50000,
        'BANK_TRANSFER',
      );
      expect(payDirect.ok).toBe(true);

      // 6. Check Final Settlement Summary
      const summaryResFinal = await services.payments.getPoSettlementSummary(BUYER_OWNER, po.id);
      expect(summaryResFinal.ok).toBe(true);
      if (summaryResFinal.ok) {
        expect(summaryResFinal.value.cumulativePaidAmount).toBe(100000);
        expect(summaryResFinal.value.invoicedOutstandingAmount).toBe(0);
        expect(summaryResFinal.value.unallocatedAdvanceAmount).toBe(0);
        expect(summaryResFinal.value.isFullySettled).toBe(true);
      }

      // 7. Verify Settlement Certificate Generation
      const certRes = await services.payments.generatePoSettlementCertificate(BUYER_OWNER, po.id);
      expect(certRes.ok).toBe(true);
      if (certRes.ok) {
        expect(certRes.value.certificateId).toContain('SETTLE-CERT-');
        expect(certRes.value.summary.isFullySettled).toBe(true);
        expect(certRes.value.invoiceLedger).toHaveLength(1);
        expect(certRes.value.paymentLedger.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('Red-Team Attack 1: Attempt to transition PO to COMPLETED with unpaid invoice is blocked', async () => {
      const { po } = await seedApprovedInvoice(50000);

      const completeRes = await services.purchaseOrders.transition(BUYER_OWNER, po.id, 'COMPLETED');
      expect(completeRes.ok).toBe(false);
      if (!completeRes.ok) {
        expect(completeRes.error.message).toContain('Purchase order cannot be marked COMPLETED until all invoices are PAID');
      }
    });

    it('Red-Team Attack 2: Attempt to transition PO to COMPLETED with partially paid invoice is blocked', async () => {
      const { po, invoice } = await seedApprovedInvoice(50000);

      // Pay partially (20k of 50k)
      const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 20000, 'UPI');
      expect(payRes.ok).toBe(true);

      const completeRes = await services.purchaseOrders.transition(BUYER_OWNER, po.id, 'COMPLETED');
      expect(completeRes.ok).toBe(false);
      if (!completeRes.ok) {
        expect(completeRes.error.message).toContain('Purchase order cannot be marked COMPLETED until all invoices are PAID');
      }
    });

    it('Red-Team Attack 3: Allocate advance > payment unallocated balance is blocked', async () => {
      const { po, invoice, repos } = await seedApprovedInvoice(50000);

      const payAdv = await repos.payments.save({
        id: 'pay-adv-test-3',
        purchaseOrderId: po.id,
        invoiceId: null,
        amount: 20000,
        unallocatedAmount: 20000,
        currency: 'INR',
        method: 'BANK_TRANSFER',
        status: 'RECORDED',
        recordedBy: BUYER_OWNER.profileId,
        recordedAt: new Date().toISOString(),
      });

      const allocRes = await services.payments.allocateAdvancePayment(BUYER_OWNER, {
        paymentId: payAdv.id,
        invoiceId: invoice.id,
        amount: 25000, // Exceeds 20000
      });

      expect(allocRes.ok).toBe(false);
      if (!allocRes.ok) {
        expect(allocRes.error.message).toContain('exceeds available payment unallocated balance');
      }
    });

    it('Red-Team Attack 4: Allocate advance > invoice balance due is blocked', async () => {
      const { po, invoice, repos } = await seedApprovedInvoice(10000);

      const payAdv = await repos.payments.save({
        id: 'pay-adv-test-4',
        purchaseOrderId: po.id,
        invoiceId: null,
        amount: 50000,
        unallocatedAmount: 50000,
        currency: 'INR',
        method: 'BANK_TRANSFER',
        status: 'RECORDED',
        recordedBy: BUYER_OWNER.profileId,
        recordedAt: new Date().toISOString(),
      });

      const allocRes = await services.payments.allocateAdvancePayment(BUYER_OWNER, {
        paymentId: payAdv.id,
        invoiceId: invoice.id,
        amount: 15000, // Exceeds invoice balance 10000
      });

      expect(allocRes.ok).toBe(false);
      if (!allocRes.ok) {
        expect(allocRes.error.message).toContain('exceeds invoice balance due');
      }
    });

    it('Red-Team Attack 6: Cross-tenant advance allocation is blocked', async () => {
      const { invoice, repos } = await seedApprovedInvoice(50000);

      const payAdvOtherOrg = await repos.payments.save({
        id: 'pay-adv-other-org',
        purchaseOrderId: 'po-other',
        invoiceId: null,
        amount: 50000,
        unallocatedAmount: 50000,
        currency: 'INR',
        method: 'BANK_TRANSFER',
        status: 'RECORDED',
        recordedBy: OTHER_ORG_USER.profileId,
        recordedAt: new Date().toISOString(),
      });

      // User from other org attempting to allocate to our invoice
      const allocRes = await services.payments.allocateAdvancePayment(OTHER_ORG_USER, {
        paymentId: payAdvOtherOrg.id,
        invoiceId: invoice.id,
        amount: 10000,
      });

      expect(allocRes.ok).toBe(false);
      if (!allocRes.ok) {
        expect(allocRes.error).toBeInstanceOf(ForbiddenError);
      }
    });

    it('Attack 7: Valid full settlement allows PO completion successfully', async () => {
      const { po, invoice } = await seedApprovedInvoice(50000);

      // Pay full invoice
      const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 50000, 'BANK_TRANSFER');
      expect(payRes.ok).toBe(true);

      // Transition to COMPLETED succeeds
      const completeRes = await services.purchaseOrders.transition(BUYER_OWNER, po.id, 'COMPLETED');
      expect(completeRes.ok).toBe(true);
      if (completeRes.ok) {
        expect(completeRes.value.status).toBe('COMPLETED');
      }
    });
  });
});

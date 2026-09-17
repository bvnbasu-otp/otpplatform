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
});

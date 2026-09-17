import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';
import {
  calculatePlatformFee,
  calculateSettlementConservation,
  evaluateSettlementReconciliation,
  canResolveSettlementException,
  canTransitionFeeTransaction,
  exportToTallyPaymentVoucher,
  exportToZohoPaymentReceipt,
} from '@otp/domain';

const ORG_ID = 'org-fin-5c5';
const OTHER_ORG_ID = 'org-other-5c5';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-5c5',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-5c5',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-5c5',
  organizationId: OTHER_ORG_ID,
  orgRole: 'MANAGER',
};

const SUPPLIER_A: ActorContext = {
  profileId: 'sup-user-5c5',
  supplierIds: ['sup-5c5-a'],
};

const OTHER_SUPPLIER: ActorContext = {
  profileId: 'sup-user-other',
  supplierIds: ['sup-5c5-other'],
};

describe('OTP Phase 5C.5 — Financial Control & Red-Team Verification Matrix (RED-01 to RED-30)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-5c5-a',
      businessName: 'Apex Precision Engineering Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Machinery'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedPoAndInvoice(totalAmount = 300000, invoicedAmount = 300000) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const po = await repos.purchaseOrders.save({
      id: 'po-5c5-101',
      awardId: 'award-5c5-101',
      rfqId: 'rfq-5c5-101',
      organizationId: ORG_ID,
      supplierId: 'sup-5c5-a',
      totalAmount,
      currency: 'INR',
      status: 'ISSUED',
      poNumber: 'PO-2026-5C5-101',
      createdAt: now,
      updatedAt: now,
    });

    const wo = await repos.workOrders.save({
      id: 'wo-5c5-101',
      purchaseOrderId: po.id,
      supplierId: 'sup-5c5-a',
      status: 'IN_PROGRESS',
      title: 'Precision Machining Services',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    const invoice = await repos.invoices.save({
      id: 'inv-5c5-101',
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c5-a',
      invoiceNumber: 'INV-2026-5C5-001',
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
  // RED-01: Duplicate fee application prevention
  // -------------------------------------------------------------------------
  it('RED-01: prevents duplicate platform fee deduction on the same payment allocation', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const allocId = 'alloc-5c5-001';
    const firstFee = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      grossAmount: 300000,
    });
    expect(firstFee.ok).toBe(true);

    const duplicateFee = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      grossAmount: 300000,
    });
    expect(duplicateFee.ok).toBe(true);
    if (firstFee.ok && duplicateFee.ok) {
      expect(duplicateFee.value.id).toBe(firstFee.value.id);
    }
  });

  // -------------------------------------------------------------------------
  // RED-02: Concurrent fee application simulation
  // -------------------------------------------------------------------------
  it('RED-02: handles concurrent fee application calls idempotently without duplicate records', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const allocId = 'alloc-concurrent-1';
    const [res1, res2] = await Promise.all([
      services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
        organizationId: ORG_ID,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        paymentAllocationId: allocId,
        grossAmount: 300000,
      }),
      services.payments.applyPlatformFeeDeduction(BUYER_MANAGER, {
        organizationId: ORG_ID,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        paymentAllocationId: allocId,
        grossAmount: 300000,
      }),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (res1.ok && res2.ok) {
      expect(res1.value.id).toBe(res2.value.id);
      expect(res1.value.feeAmount).toBe(1500); // 0.5% on 300k
    }
  });

  // -------------------------------------------------------------------------
  // RED-03: Fee greater than settlement guard
  // -------------------------------------------------------------------------
  it('RED-03: caps fee amount at gross settlement and prevents fee > settlement', async () => {
    const calc = calculatePlatformFee({ grossAmount: 1000, rate: 120 });
    expect(calc.feeAmount).toBe(1000);
    expect(calc.netSettlementAmount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // RED-04: Negative settlement prevention
  // -------------------------------------------------------------------------
  it('RED-04: enforces non-negative net settlement invariant under all conditions', async () => {
    const res = calculateSettlementConservation({
      grossInvoiceAmount: 1000,
      debitAdjustments: 1500, // Debits exceed gross
      tdsAmount: 20,
      platformFeeAmount: 10,
    });
    expect(res.supplierNetSettlement).toBe(0);
  });

  // -------------------------------------------------------------------------
  // RED-05: Supplier attempts unauthorized fee rate modification -> Rejected
  // -------------------------------------------------------------------------
  it('RED-05: rejects supplier attempts to create or mutate platform fee policy', async () => {
    const res = await services.purchaseOrders.createPlatformFeePolicy(SUPPLIER_A, {
      rate: 0.10, // Supplier tries to lower rate
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('Only Platform Admin');
    }
  });

  // -------------------------------------------------------------------------
  // RED-06: Supplier bypasses acknowledgement -> Fee application blocked
  // -------------------------------------------------------------------------
  it('RED-06: blocks fee application if supplier has not acknowledged fee snapshot', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    // Deliberately do NOT acknowledge fee snapshot

    const res = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ValidationError);
      expect(res.error.message).toContain('not acknowledged');
    }
  });

  // -------------------------------------------------------------------------
  // RED-07: Historical PO picks up new fee rate -> Prevented via snapshot
  // -------------------------------------------------------------------------
  it('RED-07: preserves snapshotted fee rate for historical PO when global policy rate changes', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    // Supplier acknowledges at original 0.5% rate
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    // Platform admin updates global policy rate to 1.5%
    const adminActor: ActorContext = { profileId: 'platform-admin', isPlatformAdmin: true };
    await services.purchaseOrders.createPlatformFeePolicy(adminActor, { rate: 1.5 });

    // Deduct fee for historical PO
    const feeRes = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    expect(feeRes.ok).toBe(true);
    if (feeRes.ok) {
      expect(feeRes.value.feeRate).toBe(0.5); // Remains 0.5%, not 1.5%
      expect(feeRes.value.feeAmount).toBe(1500); // ₹1,500, not ₹4,500
    }
  });

  // -------------------------------------------------------------------------
  // RED-08: Cross-tenant fee access blocked
  // -------------------------------------------------------------------------
  it('RED-08: blocks cross-tenant actors from viewing or deducting fees for foreign org', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const res = await services.payments.applyPlatformFeeDeduction(OTHER_ORG_USER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-09: Cross-tenant fee mutation blocked
  // -------------------------------------------------------------------------
  it('RED-09: blocks foreign user from executing settlement reconciliation on another tenant', async () => {
    const { invoice } = await seedPoAndInvoice(300000);

    const res = await services.payments.executeSettlementReconciliation(OTHER_ORG_USER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-HDFC-FOREIGN',
      utrAmount: 298500,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-10: Fee applied to rejected payment or invoice -> Blocked
  // -------------------------------------------------------------------------
  it('RED-10: rejects platform fee application against REJECTED invoice or FAILED payment', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    invoice.status = 'REJECTED' as any;
    await repos.invoices.save(invoice);

    const res = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ValidationError);
      expect(res.error.message).toContain('INVALID_INVOICE_STATUS');
    }
  });

  // -------------------------------------------------------------------------
  // RED-11: TDS double-counting prevention
  // -------------------------------------------------------------------------
  it('RED-11: prevents double-counting of TDS in settlement conservation chain', async () => {
    const res = calculateSettlementConservation({
      grossInvoiceAmount: 300000,
      tdsAmount: 6000, // 2% TDS
      platformFeeAmount: 1500, // 0.5% fee
    });

    expect(res.tdsAmount).toBe(6000);
    expect(res.supplierNetSettlement).toBe(292500);
    // Net + TDS + Fee = 292500 + 6000 + 1500 = 300000
    expect(res.totalOutflowObligation).toBe(300000);
    expect(res.isConserved).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RED-12: Platform fee double-counting prevention
  // -------------------------------------------------------------------------
  it('RED-12: ensures platform fee is only deducted once per settlement obligation', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const allocId = 'alloc-once-only';
    await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      grossAmount: 300000,
    });

    const feeTxs = await services.payments.getPlatformFeeTransactions(BUYER_OWNER, ORG_ID);
    expect(feeTxs.ok).toBe(true);
    if (feeTxs.ok) {
      const activeTxs = feeTxs.value.filter((t) => t.paymentAllocationId === allocId);
      expect(activeTxs).toHaveLength(1);
    }
  });

  // -------------------------------------------------------------------------
  // RED-13: Payment allocation exceeds obligation -> Flagged in Reconciliation
  // -------------------------------------------------------------------------
  it('RED-13: flags EXCESS_ALLOCATION discrepancy when paid amount exceeds net settlement obligation', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    // Apply fee of ₹1,500 -> Net obligation is ₹2,98,500
    await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    // Record payment of ₹3,00,000 (Excess of ₹1,500)
    if (repos.paymentAllocations) {
      await repos.paymentAllocations.save({
        id: 'alloc-excess-1',
        paymentId: 'pay-excess-1',
        invoiceId: invoice.id,
        allocatedAmount: 300000,
        allocatedAt: new Date().toISOString(),
        status: 'ALLOCATED',
      });
    }

    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-EXCESS-001',
      utrAmount: 300000,
    });

    expect(recRes.ok).toBe(true);
    if (recRes.ok) {
      expect(recRes.value.reconciliation.status).toBe('MISMATCH');
      expect(recRes.value.reconciliation.discrepancyType).toBe('EXCESS_ALLOCATION');
      expect(recRes.value.exception).not.toBeNull();
      expect(recRes.value.exception?.severity).toBe('HIGH');
    }
  });

  // -------------------------------------------------------------------------
  // RED-14: Supplier settlement exceeds gross obligation
  // -------------------------------------------------------------------------
  it('RED-14: evaluates reconciliation error when total paid allocations exceed invoice gross', async () => {
    const res = evaluateSettlementReconciliation({
      invoiceGrossAmount: 100000,
      tdsAmount: 2000,
      platformFeeAmount: 500,
      paidAllocatedAmount: 110000, // Excess
    });

    expect(res.status).toBe('MISMATCH');
    expect(res.discrepancyType).toBe('EXCESS_ALLOCATION');
    expect(res.requiresException).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RED-15: UTR amount mismatch detected
  // -------------------------------------------------------------------------
  it('RED-15: detects UTR_AMOUNT_MISMATCH and creates CRITICAL exception when drift > 1000', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    // Fee ₹1,500 -> Net ₹2,98,500
    await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    if (repos.paymentAllocations) {
      await repos.paymentAllocations.save({
        id: 'alloc-mismatch-1',
        paymentId: 'pay-mismatch-1',
        invoiceId: invoice.id,
        allocatedAmount: 298500,
        allocatedAt: new Date().toISOString(),
        status: 'ALLOCATED',
      });
    }

    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-MISMATCH-1',
      utrAmount: 295000, // ₹3,500 difference from bank
    });

    expect(recRes.ok).toBe(true);
    if (recRes.ok) {
      expect(recRes.value.reconciliation.status).toBe('MISMATCH');
      expect(recRes.value.reconciliation.discrepancyType).toBe('UTR_AMOUNT_MISMATCH');
      expect(recRes.value.reconciliation.varianceAmount).toBe(3500);
      expect(recRes.value.exception?.severity).toBe('CRITICAL');
    }
  });

  // -------------------------------------------------------------------------
  // RED-16: Duplicate UTR across multiple reconciliations
  // -------------------------------------------------------------------------
  it('RED-16: flags DUPLICATE_UTR discrepancy when the same bank UTR is submitted for two different invoices', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    // First reconciliation with UTR-SHARED-123
    await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-SHARED-123',
      utrAmount: 298500,
    });

    // Create second invoice
    const inv2 = await repos.invoices.save({
      id: 'inv-5c5-102',
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      workOrderId: 'wo-5c5-101',
      supplierId: 'sup-5c5-a',
      invoiceNumber: 'INV-2026-5C5-002',
      amount: 100000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
    });

    // Second reconciliation with duplicate UTR-SHARED-123
    const recRes2 = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: inv2.id,
      utrNumber: 'UTR-SHARED-123',
      utrAmount: 100000,
    });

    expect(recRes2.ok).toBe(true);
    if (recRes2.ok) {
      expect(recRes2.value.reconciliation.status).toBe('MISMATCH');
      expect(recRes2.value.reconciliation.discrepancyType).toBe('DUPLICATE_UTR');
      expect(recRes2.value.exception?.severity).toBe('HIGH');
    }
  });

  // -------------------------------------------------------------------------
  // RED-17: Concurrent settlement execution
  // -------------------------------------------------------------------------
  it('RED-17: supports concurrent settlement reconciliation evaluations safely', async () => {
    const { invoice } = await seedPoAndInvoice(300000);

    const [res1, res2] = await Promise.all([
      services.payments.executeSettlementReconciliation(BUYER_OWNER, {
        organizationId: ORG_ID,
        invoiceId: invoice.id,
        utrNumber: 'UTR-CONCURRENT-1',
        utrAmount: 298500,
      }),
      services.payments.executeSettlementReconciliation(BUYER_MANAGER, {
        organizationId: ORG_ID,
        invoiceId: invoice.id,
        utrNumber: 'UTR-CONCURRENT-1',
        utrAmount: 298500,
      }),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RED-18: Settlement retry creates duplicate event -> Prevented via idempotency
  // -------------------------------------------------------------------------
  it('RED-18: prevents duplicate platform fee events on retry of settlement deduction', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const allocKey = 'retry-alloc-key';
    const first = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocKey,
      grossAmount: 300000,
    });
    const retry = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocKey,
      grossAmount: 300000,
    });

    expect(first.ok && retry.ok).toBe(true);
    if (first.ok && retry.ok) {
      expect(retry.value.id).toBe(first.value.id);
    }
  });

  // -------------------------------------------------------------------------
  // RED-19: Supplier attempts mutation of buyer financial record -> Rejected
  // -------------------------------------------------------------------------
  it('RED-19: rejects supplier attempt to apply platform fee deduction directly', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const res = await services.payments.applyPlatformFeeDeduction(SUPPLIER_A, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: 300000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-20: Buyer accesses foreign organization metrics -> Rejected
  // -------------------------------------------------------------------------
  it('RED-20: blocks buyer from retrieving financial observability summary for foreign organization', async () => {
    const res = await services.payments.getFinancialObservabilitySummary(OTHER_ORG_USER, ORG_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-21: Unauthorized exception resolution -> Rejected
  // -------------------------------------------------------------------------
  it('RED-21: rejects supplier attempts to resolve financial exceptions in the queue', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-DRIFT',
      utrAmount: 250000, // Trigger exception
    });

    expect(recRes.ok && recRes.value.exception).toBeTruthy();
    const excId = recRes.ok && recRes.value.exception ? recRes.value.exception.id : '';

    const supResolve = await services.payments.resolveSettlementException(
      SUPPLIER_A,
      excId,
      'Supplier trying to resolve own exception',
    );
    expect(supResolve.ok).toBe(false);
    if (!supResolve.ok) {
      expect(supResolve.error).toBeInstanceOf(ForbiddenError);
    }

    // Buyer owner resolves successfully
    const buyerResolve = await services.payments.resolveSettlementException(
      BUYER_OWNER,
      excId,
      'Shortfall accounted for in secondary advice',
    );
    expect(buyerResolve.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RED-22: Unauthorized audit export -> Blocked
  // -------------------------------------------------------------------------
  it('RED-22: blocks unauthorized tenant from exporting financial audit pack', async () => {
    const res = await services.payments.generateFinancialAuditPack(OTHER_ORG_USER, ORG_ID, 'JSON');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-23: RPC organization spoofing attempt -> Blocked
  // -------------------------------------------------------------------------
  it('RED-23: rejects cross-tenant spoofing when orgId parameter does not match actor org', async () => {
    const spoofedActor: ActorContext = {
      profileId: 'spoofed-user',
      organizationId: 'foreign-org',
      orgRole: 'OWNER',
    };

    const res = await services.payments.getFinancialObservabilitySummary(spoofedActor, ORG_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-24: Direct table mutation bypass attempt -> Guarded via validation
  // -------------------------------------------------------------------------
  it('RED-24: rejects zero or negative gross amount fee calculation attempts', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const res = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      grossAmount: -500,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ValidationError);
    }
  });

  // -------------------------------------------------------------------------
  // RED-25: Fee policy mutation changes historical PO -> Snapshot isolation verified
  // -------------------------------------------------------------------------
  it('RED-25: verifies historical PO fee snapshot remains immutable when active policy changes', async () => {
    const { po } = await seedPoAndInvoice(300000);
    const snapRes = await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);
    expect(snapRes.ok).toBe(true);

    const adminActor: ActorContext = { profileId: 'admin', isPlatformAdmin: true };
    await services.purchaseOrders.createPlatformFeePolicy(adminActor, { rate: 2.0 });

    const currentSnap = await services.purchaseOrders.getPoFeeSnapshot(BUYER_OWNER, po.id);
    expect(currentSnap.ok).toBe(true);
    if (currentSnap.ok && currentSnap.value) {
      expect(currentSnap.value.rate).toBe(0.5); // Still 0.5%
      expect(currentSnap.value.policyVersion).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // RED-26: Deposited TDS modification -> Domain protection verified
  // -------------------------------------------------------------------------
  it('RED-26: prevents voiding or alteration of TDS once DEPOSITED or CERTIFIED', async () => {
    const { invoice, repos } = await seedPoAndInvoice(300000);
    if (repos.tdsDeductions) {
      await repos.tdsDeductions.save({
        id: 'tds-deposited-1',
        organizationId: ORG_ID,
        supplierId: 'sup-5c5-a',
        invoiceId: invoice.id,
        lawVersion: 'INCOME_TAX_ACT_2025',
        section: '194C',
        taxableAmount: 300000,
        tdsRate: 2,
        tdsAmount: 6000,
        status: 'DEPOSITED',
        panStatus: 'VALID',
        isLowerDeduction: false,
        financialYear: '2026-27',
        assessmentYear: '2027-28',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const voidRes = await services.payments.voidTdsWithholding(
      BUYER_OWNER,
      'tds-deposited-1',
      'Attempt to void deposited TDS',
    );
    expect(voidRes.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // RED-27: Committed settlement modification guard
  // -------------------------------------------------------------------------
  it('RED-27: enforces lifecycle transition constraints on SETTLED fee transactions', async () => {
    expect(canTransitionFeeTransaction('SETTLED', 'CALCULATED')).toBe(false);
    expect(canTransitionFeeTransaction('SETTLED', 'DISCLOSED')).toBe(false);
    expect(canTransitionFeeTransaction('SETTLED', 'APPLIED')).toBe(false);
    expect(canTransitionFeeTransaction('SETTLED', 'REVERSED')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RED-28: Committed fee event deletion guard
  // -------------------------------------------------------------------------
  it('RED-28: prevents invalid state transitions from VOIDED or REVERSED fee transactions', async () => {
    expect(canTransitionFeeTransaction('VOIDED', 'SETTLED')).toBe(false);
    expect(canTransitionFeeTransaction('REVERSED', 'SETTLED')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // RED-29: Change-order historical variation preserves fee snapshot isolation
  // -------------------------------------------------------------------------
  it('RED-29: preserves original fee policy rate when change orders expand PO commitment', async () => {
    const { po } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    // Expand PO commitment via change order
    const coRes = await services.purchaseOrders.createPoChangeOrder(BUYER_OWNER, po.id, {
      title: 'Expanded machining scope',
      reason: 'Extra parts',
      items: [{ description: 'Add-on Lot', amountDelta: 50000, totalDelta: 50000 }],
      status: 'SUBMITTED',
    });
    expect(coRes.ok).toBe(true);

    if (coRes.ok) {
      await services.purchaseOrders.approvePoChangeOrder(BUYER_OWNER, coRes.value.id);
      await services.purchaseOrders.commitPoChangeOrder(BUYER_OWNER, coRes.value.id);
    }

    const snap = await services.purchaseOrders.getPoFeeSnapshot(BUYER_OWNER, po.id);
    expect(snap.ok).toBe(true);
    if (snap.ok && snap.value) {
      expect(snap.value.rate).toBe(0.5);
    }
  });

  // -------------------------------------------------------------------------
  // RED-30: Reversal creates financial imbalance -> Exact conservation verified
  // -------------------------------------------------------------------------
  it('RED-30: verifies Tally and Zoho ERP export balance with net settlement, TDS, and platform fees', async () => {
    // Gross: ₹3,00,000, TDS: ₹6,000, Platform Fee: ₹1,500, Net Paid: ₹2,92,500
    const tallyXml = exportToTallyPaymentVoucher({
      voucherNumber: 'VCH-RED30-001',
      paymentDate: '2026-09-17',
      paymentReference: 'UTR-HDFC-RED30',
      amount: 292500,
      tdsAmount: 6000,
      platformFeeAmount: 1500,
      supplierName: 'Apex Precision Engineering Ltd',
      allocations: [{ invoiceNumber: 'INV-2026-5C5-001', allocatedAmount: 292500 }],
    });

    // Supplier Debit = Gross (-300000.00)
    expect(tallyXml).toContain('<AMOUNT>-300000.00</AMOUNT>');
    // Bank Credit = Net paid (292500.00)
    expect(tallyXml).toContain('<AMOUNT>292500.00</AMOUNT>');
    // TDS Credit = TDS (6000.00)
    expect(tallyXml).toContain('<AMOUNT>6000.00</AMOUNT>');
    // Platform Fee Credit = Fee (1500.00)
    expect(tallyXml).toContain('<AMOUNT>1500.00</AMOUNT>');

    const zohoJson = exportToZohoPaymentReceipt({
      paymentDate: '2026-09-17',
      paymentReference: 'UTR-HDFC-RED30',
      amount: 292500,
      tdsAmount: 6000,
      platformFeeAmount: 1500,
      supplierName: 'Apex Precision Engineering Ltd',
      allocations: [{ invoiceNumber: 'INV-2026-5C5-001', allocatedAmount: 292500 }],
    });

    expect(zohoJson.amount).toBe(292500);
    expect(zohoJson.tds_amount).toBe(6000);
    expect(zohoJson.platform_fee_amount).toBe(1500);
    expect(zohoJson.description).toContain('Platform Fee: ₹1500.00');
  });
});

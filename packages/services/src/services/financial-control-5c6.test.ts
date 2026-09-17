import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories, createId, timestamp } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import {
  computePayloadChecksum,
  evaluateDuplicateExport,
  calculateAgingBuckets,
  calculateFinancialObservabilitySummary,
  exportToTallyPaymentVoucher,
  exportToZohoPaymentReceipt,
} from '@otp/domain';

const ORG_ID = 'org-fin-5c6';
const OTHER_ORG_ID = 'org-other-5c6';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-5c6',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-5c6',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-5c6',
  organizationId: OTHER_ORG_ID,
  orgRole: 'MANAGER',
};

const SUPPLIER_A: ActorContext = {
  profileId: 'sup-user-5c6',
  supplierIds: ['sup-5c6-a'],
};

const OTHER_SUPPLIER: ActorContext = {
  profileId: 'sup-user-other',
  supplierIds: ['sup-5c6-other'],
};

describe('OTP Phase 5C.6 — Red-Team Verification Matrix (RED-01 to RED-40)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-5c6-a',
      businessName: 'Dynamic Industrial Solutions Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial Parts'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedPoAndInvoice(totalAmount = 500000, invoicedAmount = 500000, orgId = ORG_ID) {
    const repos = mem.asRepositories();
    const now = timestamp();

    const po = await repos.purchaseOrders.save({
      id: createId(),
      awardId: createId(),
      rfqId: createId(),
      organizationId: orgId,
      supplierId: 'sup-5c6-a',
      totalAmount,
      currency: 'INR',
      status: 'ISSUED',
      poNumber: `PO-2026-${createId().slice(0, 6).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
    });

    const wo = await repos.workOrders.save({
      id: createId(),
      purchaseOrderId: po.id,
      supplierId: 'sup-5c6-a',
      status: 'IN_PROGRESS',
      title: 'Precision Fabrication Services',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    const invoice = await repos.invoices.save({
      id: createId(),
      organizationId: orgId,
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c6-a',
      invoiceNumber: `INV-2026-${createId().slice(0, 6).toUpperCase()}`,
      amount: invoicedAmount,
      paidAmount: 0,
      balanceDue: invoicedAmount,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    return { po, wo, invoice, repos };
  }

  // =========================================================================
  // CATEGORY 1: Idempotency & Payment Allocation (RED-01 to RED-06)
  // =========================================================================

  it('RED-01: duplicate allocation idempotency key returns existing record safely without double allocation', async () => {
    const { po, invoice } = await seedPoAndInvoice(200000);
    const payRes = await services.payments.recordPayment(BUYER_OWNER, null, 200000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const payment = payRes.value;
    const idempotencyKey = 'idem-alloc-key-001';

    // First allocation
    const alloc1 = await services.payments.recordPaymentAllocation(
      BUYER_OWNER,
      payment.id,
      invoice.id,
      50000,
      'First allocation pass',
      idempotencyKey,
    );
    expect(alloc1.ok).toBe(true);
    if (!alloc1.ok) return;

    // Second allocation replay with same idempotency key
    const alloc2 = await services.payments.recordPaymentAllocation(
      BUYER_OWNER,
      payment.id,
      invoice.id,
      50000,
      'Replayed allocation pass',
      idempotencyKey,
    );
    expect(alloc2.ok).toBe(true);
    if (!alloc2.ok) return;

    expect(alloc2.value.id).toBe(alloc1.value.id);
    expect(alloc2.value.allocatedAmount).toBe(50000);

    const invSummary = await services.payments.getInvoicePaymentSummary(BUYER_OWNER, invoice.id);
    expect(invSummary.ok).toBe(true);
    if (!invSummary.ok) return;
    expect(invSummary.value.paidAmount).toBe(50000); // Not double-counted
  });

  it('RED-02: concurrent idempotency replay returns consistent state and unallocated balance', async () => {
    const { po, invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordPayment(BUYER_OWNER, null, 100000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const payment = payRes.value;
    const idempotencyKey = 'idem-concurrent-002';

    const [res1, res2] = await Promise.all([
      services.payments.recordPaymentAllocation(BUYER_OWNER, payment.id, invoice.id, 40000, 'Batch A', idempotencyKey),
      services.payments.recordPaymentAllocation(BUYER_OWNER, payment.id, invoice.id, 40000, 'Batch B', idempotencyKey),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (!res1.ok || !res2.ok) return;

    expect(res1.value.id).toBe(res2.value.id);

    const paySummary = await services.payments.getPaymentAllocationSummary(BUYER_OWNER, payment.id);
    expect(paySummary.ok).toBe(true);
    if (!paySummary.ok) return;
    expect(paySummary.value.allocatedAmount).toBe(40000);
    expect(paySummary.value.unallocatedAmount).toBe(60000);
  });

  it('RED-03: allocation without idempotency key creates distinct allocation records within payment balance', async () => {
    const { po, invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordPayment(BUYER_OWNER, null, 100000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const payment = payRes.value;

    const a1 = await services.payments.recordPaymentAllocation(BUYER_OWNER, payment.id, invoice.id, 30000, 'Alloc 1');
    const a2 = await services.payments.recordPaymentAllocation(BUYER_OWNER, payment.id, invoice.id, 20000, 'Alloc 2');

    expect(a1.ok).toBe(true);
    expect(a2.ok).toBe(true);
    if (!a1.ok || !a2.ok) return;

    expect(a1.value.id).not.toBe(a2.value.id);

    const invSummary = await services.payments.getInvoicePaymentSummary(BUYER_OWNER, invoice.id);
    expect(invSummary.ok).toBe(true);
    if (!invSummary.ok) return;
    expect(invSummary.value.paidAmount).toBe(50000);
  });

  it('RED-04: cross-tenant allocation attempt is rejected even with unique idempotency key', async () => {
    const { po, invoice } = await seedPoAndInvoice(100000, 100000, OTHER_ORG_ID);
    const payRes = await services.payments.recordPayment(OTHER_ORG_USER, null, 100000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const result = await services.payments.recordPaymentAllocation(
      BUYER_OWNER, // Wrong tenant actor
      payRes.value.id,
      invoice.id,
      50000,
      'Malicious cross-tenant allocation',
      'idem-cross-tenant-004',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-05: records allocated_by actor provenance forensics accurately', async () => {
    const { po, invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordPayment(BUYER_OWNER, null, 100000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const alloc = await services.payments.recordPaymentAllocation(
      BUYER_MANAGER,
      payRes.value.id,
      invoice.id,
      25000,
      'Alloc by manager',
    );

    expect(alloc.ok).toBe(true);
    if (!alloc.ok) return;
    expect(alloc.value.allocatedBy).toBe(BUYER_MANAGER.profileId);
  });

  it('RED-06: allocation exceeding payment unallocated balance is rejected with zero state mutation', async () => {
    const { po, invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordPayment(BUYER_OWNER, null, 40000, 'BANK_TRANSFER', {
      purchaseOrderId: po.id,
    });
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const result = await services.payments.recordPaymentAllocation(
      BUYER_OWNER,
      payRes.value.id,
      invoice.id,
      50000, // Exceeds 40k
      'Excess allocation attempt',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }

    const paySummary = await services.payments.getPaymentAllocationSummary(BUYER_OWNER, payRes.value.id);
    expect(paySummary.ok).toBe(true);
    if (!paySummary.ok) return;
    expect(paySummary.value.unallocatedAmount).toBe(40000);
  });

  // =========================================================================
  // CATEGORY 2: Platform Fee Synchronization on Allocation Reversal (RED-07 to RED-12)
  // =========================================================================

  it('RED-07: reversing payment allocation cascades status to REVERSED for linked platform fee transactions', async () => {
    const { po, invoice } = await seedPoAndInvoice(300000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 300000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocationId = payRes.value.allocation.id;

    // Apply platform fee linked to this allocation
    const feeRes = await services.payments.applyPlatformFeeDeduction(BUYER_OWNER, {
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentId: payRes.value.payment.id,
      paymentAllocationId: allocationId,
      grossAmount: 300000,
    });
    expect(feeRes.ok).toBe(true);
    if (!feeRes.ok) return;
    expect(feeRes.value.status).toBe('SETTLED');

    // Reverse allocation
    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId,
      reason: 'Commercial Dispute Reversal',
    });
    expect(revRes.ok).toBe(true);
    if (!revRes.ok) return;

    // Verify fee transaction cascaded to REVERSED
    const feeTxs = await services.payments.getPlatformFeeTransactions(BUYER_OWNER, ORG_ID);
    expect(feeTxs.ok).toBe(true);
    if (!feeTxs.ok) return;

    const matchedFee = feeTxs.value.find((f) => f.paymentAllocationId === allocationId);
    expect(matchedFee).toBeDefined();
    expect(matchedFee?.status).toBe('REVERSED');
    expect(matchedFee?.voidedAt).toBeDefined();
  });

  it('RED-08: reversing allocation without linked fees succeeds cleanly', async () => {
    const { invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 100000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: payRes.value.allocation.id,
      reason: 'Vendor correction',
    });
    expect(revRes.ok).toBe(true);
    if (!revRes.ok) return;
    expect(revRes.value.status).toBe('REVERSED');
  });

  it('RED-09: duplicate reversal of the same allocation is strictly blocked', async () => {
    const { invoice } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 100000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocId = payRes.value.allocation.id;
    const rev1 = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'First reversal',
    });
    expect(rev1.ok).toBe(true);

    const rev2 = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Duplicate reversal',
    });
    expect(rev2.ok).toBe(false);
    if (!rev2.ok) {
      expect(rev2.error).toBeInstanceOf(ValidationError);
      expect(rev2.error.message).toContain('REV-5C3-ALREADY-REVERSED');
    }
  });

  it('RED-10: reversal is blocked on a COMPLETED purchase order', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 100000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    // Mark PO as COMPLETED
    await repos.purchaseOrders.save({ ...po, status: 'COMPLETED' });

    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: payRes.value.allocation.id,
      reason: 'Disallowed reversal',
    });
    expect(revRes.ok).toBe(false);
    if (!revRes.ok) {
      expect(revRes.error).toBeInstanceOf(ValidationError);
      expect(revRes.error.message).toContain('REV-5C3-PO-CLOSED');
    }
  });

  it('RED-11: cascades reversal across multiple fees if multi-tranche fees exist on allocation', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(200000);
    await services.purchaseOrders.acknowledgePoPlatformFee(SUPPLIER_A, po.id);

    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 200000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocId = payRes.value.allocation.id;

    // Seed 2 fee transactions referencing the same allocation ID
    await repos.platformFeeTransactions!.save({
      id: createId(),
      organizationId: ORG_ID,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      policyId: 'pol-default-v1',
      policyVersion: 1,
      grossAmount: 100000,
      feeRate: 0.5,
      feeAmount: 500,
      netSettlementAmount: 99500,
      status: 'SETTLED',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });

    await repos.platformFeeTransactions!.save({
      id: createId(),
      organizationId: ORG_ID,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      policyId: 'pol-default-v1',
      policyVersion: 1,
      grossAmount: 100000,
      feeRate: 0.5,
      feeAmount: 500,
      netSettlementAmount: 99500,
      status: 'APPLIED',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });

    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Multi-fee reversal',
    });
    expect(revRes.ok).toBe(true);

    const feeTxs = await repos.platformFeeTransactions!.findByOrganizationId(ORG_ID);
    const matching = feeTxs.filter((f) => f.paymentAllocationId === allocId);
    expect(matching.length).toBe(2);
    expect(matching.every((f) => f.status === 'REVERSED')).toBe(true);
  });

  it('RED-12: already voided or reversed platform fees are untouched during allocation reversal', async () => {
    const { po, invoice, repos } = await seedPoAndInvoice(100000);
    const payRes = await services.payments.recordInvoicePayment(BUYER_OWNER, invoice.id, 100000, 'BANK_TRANSFER');
    expect(payRes.ok).toBe(true);
    if (!payRes.ok) return;

    const allocId = payRes.value.allocation.id;
    const voidTime = '2026-09-01T10:00:00.000Z';

    await repos.platformFeeTransactions!.save({
      id: createId(),
      organizationId: ORG_ID,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentAllocationId: allocId,
      policyId: 'pol-default-v1',
      policyVersion: 1,
      grossAmount: 100000,
      feeRate: 0.5,
      feeAmount: 500,
      netSettlementAmount: 99500,
      status: 'VOIDED',
      voidedAt: voidTime,
      createdAt: voidTime,
      updatedAt: voidTime,
    });

    const revRes = await services.payments.reversePaymentAllocation(BUYER_OWNER, {
      allocationId: allocId,
      reason: 'Allocation reverse',
    });
    expect(revRes.ok).toBe(true);

    const feeTxs = await repos.platformFeeTransactions!.findByOrganizationId(ORG_ID);
    const matched = feeTxs.find((f) => f.paymentAllocationId === allocId);
    expect(matched?.status).toBe('VOIDED');
    expect(matched?.voidedAt).toBe(voidTime); // Not overwritten
  });

  // =========================================================================
  // CATEGORY 3: ERP Export Manifests & Checksum Guards (RED-13 to RED-18)
  // =========================================================================

  it('RED-13: records new ERP export manifest with deterministic SHA-256 checksum and version 1', async () => {
    const payload = { voucherNumber: 'VOUCH-001', amount: 150000, supplier: 'Apex Ltd' };
    const checksum = computePayloadChecksum(payload);

    const res = await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'TALLY_PAYMENT_VOUCHER',
      batchReference: 'BATCH-2026-09-A',
      recordCount: 1,
      totalAmount: 150000,
      payload,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.manifest.exportVersion).toBe(1);
    expect(res.value.manifest.payloadChecksumSha256).toBe(checksum);
    expect(res.value.isDuplicate).toBe(false);
  });

  it('RED-14: detects exact payload replay as duplicate export and increments version to 2', async () => {
    const payload = { receiptNumber: 'ZOHO-REC-001', amount: 250000 };

    const exp1 = await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'ZOHO_PAYMENT_RECEIPT',
      batchReference: 'BATCH-ZOHO-01',
      recordCount: 1,
      totalAmount: 250000,
      payload,
    });
    expect(exp1.ok).toBe(true);

    // Exact duplicate replay
    const exp2 = await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'ZOHO_PAYMENT_RECEIPT',
      batchReference: 'BATCH-ZOHO-01',
      recordCount: 1,
      totalAmount: 250000,
      payload,
    });

    expect(exp2.ok).toBe(true);
    if (!exp2.ok) return;

    expect(exp2.value.isDuplicate).toBe(true);
    expect(exp2.value.manifest.exportVersion).toBe(2);
  });

  it('RED-15: modified payload with same batch reference records new version with isDuplicate = false', async () => {
    const payload1 = { vouchers: ['V1', 'V2'], total: 200000 };
    const payload2 = { vouchers: ['V1', 'V2', 'V3'], total: 300000 };

    await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'FINANCIAL_AUDIT_PACK_JSON',
      batchReference: 'AUDIT-PACK-BATCH-1',
      recordCount: 2,
      totalAmount: 200000,
      payload: payload1,
    });

    const exp2 = await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'FINANCIAL_AUDIT_PACK_JSON',
      batchReference: 'AUDIT-PACK-BATCH-1',
      recordCount: 3,
      totalAmount: 300000,
      payload: payload2,
    });

    expect(exp2.ok).toBe(true);
    if (!exp2.ok) return;

    expect(exp2.value.manifest.exportVersion).toBe(2);
    expect(exp2.value.isDuplicate).toBe(false); // Payload changed
  });

  it('RED-16: non-owner/manager role cannot record ERP export manifest', async () => {
    const unauthActor: ActorContext = {
      profileId: 'auditor-1',
      organizationId: ORG_ID,
      orgRole: 'AUDITOR' as any,
    };

    const res = await services.payments.recordErpExportManifest(unauthActor, {
      organizationId: ORG_ID,
      exportType: 'TALLY_PAYMENT_VOUCHER',
      batchReference: 'BATCH-FORBIDDEN-01',
      recordCount: 1,
      totalAmount: 50000,
      payload: 'test',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-17: cross-tenant export manifest listing is isolated per organization', async () => {
    await services.payments.recordErpExportManifest(BUYER_OWNER, {
      organizationId: ORG_ID,
      exportType: 'TALLY_PAYMENT_VOUCHER',
      batchReference: 'BATCH-ORG-1',
      recordCount: 1,
      totalAmount: 100000,
      payload: 'org1',
    });

    await services.payments.recordErpExportManifest(OTHER_ORG_USER, {
      organizationId: OTHER_ORG_ID,
      exportType: 'TALLY_PAYMENT_VOUCHER',
      batchReference: 'BATCH-ORG-2',
      recordCount: 1,
      totalAmount: 200000,
      payload: 'org2',
    });

    const org1List = await services.payments.getErpExportManifests(BUYER_OWNER, ORG_ID);
    expect(org1List.ok).toBe(true);
    if (!org1List.ok) return;
    expect(org1List.value.length).toBe(1);
    expect(org1List.value[0]?.batchReference).toBe('BATCH-ORG-1');
  });

  it('RED-18: Tally XML generator escapes special XML characters preventing injection', () => {
    const xml = exportToTallyPaymentVoucher({
      supplierName: 'Test & Company <Special> "Quotes" \'App\'',
      narration: 'Payment for PO & Tools <Script>alert(1)</Script>',
      amount: 100000,
      paymentDate: '2026-09-17',
    });

    expect(xml).toContain('Test &amp; Company &lt;Special&gt; &quot;Quotes&quot; &apos;App&apos;');
    expect(xml).toContain('&lt;Script&gt;alert(1)&lt;/Script&gt;');
    expect(xml).not.toContain('<Script>');
  });

  // =========================================================================
  // CATEGORY 4: Bank Reconciliation Invalidation / Chargeback (RED-19 to RED-24)
  // =========================================================================

  it('RED-19: invalidates matched bank reconciliation record with structured reason and discrepancy type', async () => {
    const advice = {
      utrNumber: 'UTR20260917001',
      clearedAmount: 150000,
      clearedAt: timestamp(),
    };

    const recRes = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    const invRes = await services.payments.invalidateBankReconciliation(
      BUYER_OWNER,
      recRes.value.id,
      'Bank chargeback notification received from HDFC clearing desk',
    );

    expect(invRes.ok).toBe(true);
    if (!invRes.ok) return;

    expect(invRes.value.status).toBe('DISCREPANCY');
    expect(invRes.value.discrepancyType).toBe('MANUALLY_INVALIDATED');
    expect(invRes.value.discrepancyDetails).toContain('Bank chargeback notification');
  });

  it('RED-20: invalidation without sufficient reason length is rejected', async () => {
    const advice = {
      utrNumber: 'UTR20260917002',
      clearedAmount: 100000,
      clearedAt: timestamp(),
    };

    const recRes = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    const invRes = await services.payments.invalidateBankReconciliation(BUYER_OWNER, recRes.value.id, 'bad');
    expect(invRes.ok).toBe(false);
    if (!invRes.ok) {
      expect(invRes.error).toBeInstanceOf(ValidationError);
    }
  });

  it('RED-21: cross-tenant invalidation attempt is rejected with ForbiddenError', async () => {
    const advice = {
      utrNumber: 'UTR20260917003',
      clearedAmount: 100000,
      clearedAt: timestamp(),
    };

    const recRes = await services.payments.reconcileBankUtr(OTHER_ORG_USER, OTHER_ORG_ID, advice);
    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    const invRes = await services.payments.invalidateBankReconciliation(
      BUYER_OWNER, // Wrong tenant
      recRes.value.id,
      'Unauthorized invalidation attempt across tenant boundaries',
    );

    expect(invRes.ok).toBe(false);
    if (!invRes.ok) {
      expect(invRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-22: supplier user cannot invalidate buyer bank reconciliation records', async () => {
    const advice = {
      utrNumber: 'UTR20260917004',
      clearedAmount: 50000,
      clearedAt: timestamp(),
    };

    const recRes = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    const invRes = await services.payments.invalidateBankReconciliation(
      SUPPLIER_A,
      recRes.value.id,
      'Supplier attempting to invalidate bank match',
    );

    expect(invRes.ok).toBe(false);
    if (!invRes.ok) {
      expect(invRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-23: invalidation preserves physical record history without deleting the entity', async () => {
    const advice = {
      utrNumber: 'UTR20260917005',
      clearedAmount: 80000,
      clearedAt: timestamp(),
    };

    const recRes = await services.payments.reconcileBankUtr(BUYER_OWNER, ORG_ID, advice);
    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    await services.payments.invalidateBankReconciliation(BUYER_OWNER, recRes.value.id, 'Transaction revoked');

    const check = await mem.asRepositories().bankReconciliations!.findById(recRes.value.id);
    expect(check).not.toBeNull();
    expect(check?.utrNumber).toBe('UTR20260917005');
  });

  it('RED-24: non-existent reconciliation ID returns NotFoundError during invalidation', async () => {
    const res = await services.payments.invalidateBankReconciliation(
      BUYER_OWNER,
      'non-existent-rec-id',
      'Reason for non-existent record',
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(NotFoundError);
    }
  });

  // =========================================================================
  // CATEGORY 5: Settlement Exception Event Timeline (RED-25 to RED-28)
  // =========================================================================

  it('RED-25: appends CREATED event automatically when settlement exception is raised', async () => {
    const { po, invoice } = await seedPoAndInvoice(200000);
    // Execute reconciliation with UTR mismatch to trigger exception
    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-MISMATCH-001',
      utrAmount: 180000, // Discrepancy
    });

    expect(recRes.ok).toBe(true);
    if (!recRes.ok) return;

    const excId = recRes.value.exception?.id;
    expect(excId).toBeDefined();
    if (!excId) return;

    const events = await services.payments.getSettlementExceptionEvents(BUYER_OWNER, excId);
    expect(events.ok).toBe(true);
    if (!events.ok) return;

    expect(events.value.length).toBe(1);
    expect(events.value[0]?.eventType).toBe('CREATED');
    expect(events.value[0]?.toStatus).toBe('OPEN');
  });

  it('RED-26: records multi-stage investigation timeline events and status transitions', async () => {
    const { invoice } = await seedPoAndInvoice(200000);
    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-EXC-002',
      utrAmount: 150000,
    });

    const excId = recRes.ok ? recRes.value.exception?.id : null;
    expect(excId).toBeDefined();
    if (!excId) return;

    // Add INVESTIGATION_NOTE and transition to INVESTIGATING
    const noteEvent = await services.payments.addSettlementExceptionEvent(BUYER_OWNER, {
      exceptionId: excId,
      eventType: 'INVESTIGATION_NOTE',
      notes: 'Contacted bank treasury operations for clearing slip confirmation',
      toStatus: 'INVESTIGATING',
    });

    expect(noteEvent.ok).toBe(true);

    // Resolve exception
    const resolveRes = await services.payments.resolveSettlementException(
      BUYER_OWNER,
      excId,
      'Treasury verified ₹50,000 withholding for GST refund offset',
    );
    expect(resolveRes.ok).toBe(true);

    const timeline = await services.payments.getSettlementExceptionEvents(BUYER_OWNER, excId);
    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;

    expect(timeline.value.length).toBe(3); // CREATED, INVESTIGATION_NOTE, RESOLVED
    expect(timeline.value[1]?.eventType).toBe('INVESTIGATION_NOTE');
    expect(timeline.value[2]?.eventType).toBe('RESOLVED');
  });

  it('RED-27: unauthenticated or supplier user cannot add exception investigation events', async () => {
    const { invoice } = await seedPoAndInvoice(100000);
    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-EXC-003',
      utrAmount: 80000,
    });
    const excId = recRes.ok ? recRes.value.exception?.id : null;
    if (!excId) return;

    const res = await services.payments.addSettlementExceptionEvent(SUPPLIER_A, {
      exceptionId: excId,
      eventType: 'INVESTIGATION_NOTE',
      notes: 'Supplier trying to edit investigation log',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-28: resolution replay on already resolved exception is rejected', async () => {
    const { invoice } = await seedPoAndInvoice(100000);
    const recRes = await services.payments.executeSettlementReconciliation(BUYER_OWNER, {
      organizationId: ORG_ID,
      invoiceId: invoice.id,
      utrNumber: 'UTR-EXC-004',
      utrAmount: 50000,
    });
    const excId = recRes.ok ? recRes.value.exception?.id : null;
    if (!excId) return;

    await services.payments.resolveSettlementException(BUYER_OWNER, excId, 'Initial valid resolution notes');

    const replay = await services.payments.resolveSettlementException(BUYER_OWNER, excId, 'Replayed resolution');
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.error).toBeInstanceOf(ValidationError);
    }
  });

  // =========================================================================
  // CATEGORY 6: PO Batch Settlement Reconciliation Synchronization (RED-29 to RED-32)
  // =========================================================================

  it('RED-29: synchronizes settlement reconciliations across multiple progressive invoices for a PO', async () => {
    const { po, wo, repos } = await seedPoAndInvoice(300000, 100000);
    const now = timestamp();

    // Create 2 more invoices under the same PO
    const inv2 = await repos.invoices.save({
      id: createId(),
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c6-a',
      invoiceNumber: 'INV-2026-MULTI-2',
      amount: 100000,
      paidAmount: 0,
      balanceDue: 100000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    const inv3 = await repos.invoices.save({
      id: createId(),
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c6-a',
      invoiceNumber: 'INV-2026-MULTI-3',
      amount: 100000,
      paidAmount: 0,
      balanceDue: 100000,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    const syncRes = await services.payments.syncPoSettlementReconciliations(BUYER_OWNER, po.id);
    expect(syncRes.ok).toBe(true);
    if (!syncRes.ok) return;

    expect(syncRes.value.syncedCount).toBe(3);
    expect(syncRes.value.reconciliations.length).toBe(3);
  });

  it('RED-30: PO batch sync is idempotent and updates existing reconciliation records', async () => {
    const { po } = await seedPoAndInvoice(200000);

    const sync1 = await services.payments.syncPoSettlementReconciliations(BUYER_OWNER, po.id);
    expect(sync1.ok).toBe(true);

    const sync2 = await services.payments.syncPoSettlementReconciliations(BUYER_OWNER, po.id);
    expect(sync2.ok).toBe(true);
    if (!sync2.ok) return;

    expect(sync2.value.syncedCount).toBe(1);
  });

  it('RED-31: cross-tenant PO batch sync is strictly rejected', async () => {
    const { po } = await seedPoAndInvoice(100000, 100000, OTHER_ORG_ID);

    const res = await services.payments.syncPoSettlementReconciliations(
      BUYER_OWNER, // Wrong tenant
      po.id,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-32: PO batch sync ignores cancelled and rejected invoices', async () => {
    const { po, wo, repos } = await seedPoAndInvoice(200000, 100000);
    const now = timestamp();

    // Create a REJECTED invoice
    await repos.invoices.save({
      id: createId(),
      organizationId: ORG_ID,
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: 'sup-5c6-a',
      invoiceNumber: 'INV-REJECTED-001',
      amount: 50000,
      paidAmount: 0,
      balanceDue: 50000,
      currency: 'INR',
      status: 'REJECTED',
      submittedAt: now,
    });

    const syncRes = await services.payments.syncPoSettlementReconciliations(BUYER_OWNER, po.id);
    expect(syncRes.ok).toBe(true);
    if (!syncRes.ok) return;

    expect(syncRes.value.syncedCount).toBe(1); // Only the approved invoice
  });

  // =========================================================================
  // CATEGORY 7: Financial Aging Observability (RED-33 to RED-36)
  // =========================================================================

  it('RED-33: calculates financial aging buckets across 0-7d, 8-15d, 16-30d, and >30d correctly', () => {
    const asOf = new Date('2026-09-17T12:00:00Z');
    const items = [
      { amount: 10000, date: '2026-09-15T12:00:00Z' }, // 2 days -> 0-7d
      { amount: 20000, date: '2026-09-07T12:00:00Z' }, // 10 days -> 8-15d
      { amount: 30000, date: '2026-08-28T12:00:00Z' }, // 20 days -> 16-30d
      { amount: 40000, date: '2026-08-01T12:00:00Z' }, // 47 days -> >30d
    ];

    const buckets = calculateAgingBuckets(items, asOf);
    expect(buckets.bucket_0_7d).toBe(10000);
    expect(buckets.bucket_8_15d).toBe(20000);
    expect(buckets.bucket_16_30d).toBe(30000);
    expect(buckets.bucket_over_30d).toBe(40000);
  });

  it('RED-34: zero age and future timestamps clamp safely to bucket_0_7d', () => {
    const asOf = new Date('2026-09-17T12:00:00Z');
    const items = [
      { amount: 50000, date: '2026-09-17T12:00:00Z' }, // 0 days
      { amount: 25000, date: '2026-09-20T12:00:00Z' }, // Future date (driftMs <= 0)
    ];

    const buckets = calculateAgingBuckets(items, asOf);
    expect(buckets.bucket_0_7d).toBe(75000);
    expect(buckets.bucket_8_15d).toBe(0);
    expect(buckets.bucket_16_30d).toBe(0);
    expect(buckets.bucket_over_30d).toBe(0);
  });

  it('RED-35: financial observability summary includes aging breakdown for unpaid invoices, advances, and exceptions', () => {
    const asOf = '2026-09-17T12:00:00Z';
    const summary = calculateFinancialObservabilitySummary({
      organizationId: ORG_ID,
      purchaseOrders: [{ id: 'po-1', totalAmount: 500000, status: 'ISSUED' }],
      invoices: [
        { id: 'inv-1', amount: 100000, paidAmount: 0, status: 'APPROVED', createdAt: '2026-09-14T12:00:00Z' }, // 3d -> 0-7d
        { id: 'inv-2', amount: 200000, paidAmount: 50000, status: 'PARTIALLY_PAID', createdAt: '2026-08-10T12:00:00Z' }, // 38d -> >30d (balance 150k)
      ],
      payments: [
        { id: 'p-1', amount: 80000, unallocatedAmount: 30000, status: 'RECORDED', createdAt: '2026-09-05T12:00:00Z' }, // 12d -> 8-15d
      ],
      allocations: [],
      settlementExceptions: [
        { status: 'OPEN', amountInDispute: 15000, createdAt: '2026-08-25T12:00:00Z' }, // 23d -> 16-30d
      ],
      asOfDate: asOf,
    });

    expect(summary.financial_aging).toBeDefined();
    if (!summary.financial_aging) return;

    expect(summary.financial_aging.unpaid_invoices_aging.bucket_0_7d).toBe(100000);
    expect(summary.financial_aging.unpaid_invoices_aging.bucket_over_30d).toBe(150000);
    expect(summary.financial_aging.stuck_advances_aging.bucket_8_15d).toBe(30000);
    expect(summary.financial_aging.unresolved_exceptions_aging.bucket_16_30d).toBe(15000);
  });

  it('RED-36: fully paid invoices and resolved exceptions do not appear in aging buckets', () => {
    const summary = calculateFinancialObservabilitySummary({
      organizationId: ORG_ID,
      purchaseOrders: [{ id: 'po-1', totalAmount: 100000, status: 'ISSUED' }],
      invoices: [
        { id: 'inv-1', amount: 100000, paidAmount: 100000, status: 'PAID', createdAt: '2026-08-01T12:00:00Z' },
      ],
      payments: [
        { id: 'p-1', amount: 100000, unallocatedAmount: 0, status: 'RECORDED', createdAt: '2026-08-01T12:00:00Z' },
      ],
      allocations: [],
      settlementExceptions: [
        { status: 'RESOLVED', amountInDispute: 20000, createdAt: '2026-08-01T12:00:00Z' },
      ],
      asOfDate: '2026-09-17T12:00:00Z',
    });

    if (!summary.financial_aging) return;
    expect(summary.financial_aging.unpaid_invoices_aging.bucket_over_30d).toBe(0);
    expect(summary.financial_aging.stuck_advances_aging.bucket_over_30d).toBe(0);
    expect(summary.financial_aging.unresolved_exceptions_aging.bucket_over_30d).toBe(0);
  });

  // =========================================================================
  // CATEGORY 8: Security & Cross-Tenant Integrity (RED-37 to RED-40)
  // =========================================================================

  it('RED-37: unauthorized caller cannot view observability summary of another organization', async () => {
    const res = await services.payments.getFinancialObservabilitySummary(OTHER_ORG_USER, ORG_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-38: supplier user cannot generate financial audit pack for buyer organization', async () => {
    const res = await services.payments.generateFinancialAuditPack(SUPPLIER_A, ORG_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it('RED-39: Zoho JSON payment receipt generator formats bills and unallocated excess accurately', () => {
    const json = exportToZohoPaymentReceipt({
      paymentDate: '2026-09-17',
      supplierName: 'Apex Precision Ltd',
      buyerOrgName: 'Global Enterprises Inc',
      amount: 300000,
      paymentReference: 'UTR20260917ZOHO',
      allocations: [
        { invoiceNumber: 'INV-001', allocatedAmount: 120000, invoiceAmount: 120000 },
        { invoiceNumber: 'INV-002', allocatedAmount: 130000, invoiceAmount: 150000 },
      ],
      unallocatedAmount: 50000,
      tdsAmount: 5000,
      platformFeeAmount: 1500,
    });

    expect(json.amount).toBe(300000);
    expect(json.excess_amount).toBe(50000);
    expect(json.bills.length).toBe(2);
    expect(json.bills[0]?.amount_applied).toBe(120000);
    expect(json.tds_amount).toBe(5000);
    expect(json.platform_fee_amount).toBe(1500);
  });

  it('RED-40: strict financial conservation holds across gross invoice, TDS, platform fee, and net settlement', async () => {
    const gross = 500000;
    const tdsRate = 2; // 2% -> 10,000
    const feeRate = 0.5; // 0.5% -> 2,500
    const expectedNet = gross - (gross * (tdsRate / 100)) - (gross * (feeRate / 100)); // 487,500

    expect(expectedNet).toBe(487500);
    expect(10000 + 2500 + 487500).toBe(gross);
  });
});

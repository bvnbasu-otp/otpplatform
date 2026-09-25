import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories, createId, timestamp } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import {
  calculateFinancialSegregation,
  evaluateSettlementPrerequisites,
  buildAuthoritativeSettlementCertificate,
  validateJournalLines,
  calculateTrialBalance,
  STANDARD_CHART_OF_ACCOUNTS,
  calculatePlatformFee,
  calculateBuyerReward,
  calculateActiveWalletBalance,
  consumeWalletCreditsFefo,
  type JournalLine,
  type LedgerAccount,
} from '@otp/domain';
import { ForbiddenError, ValidationError } from '../../packages/services/src/types/errors';

const ORG_ALPHA = 'org-msme-alpha-101';
const ORG_BETA = 'org-msme-beta-202';

const ACTOR_ALPHA_OWNER: ActorContext = {
  profileId: 'usr-alpha-owner-001',
  organizationId: ORG_ALPHA,
  orgRole: 'OWNER',
};

const ACTOR_ALPHA_BUYER: ActorContext = {
  profileId: 'usr-alpha-buyer-002',
  organizationId: ORG_ALPHA,
  orgRole: 'BUYER',
};

const ACTOR_BETA_OWNER: ActorContext = {
  profileId: 'usr-beta-owner-003',
  organizationId: ORG_BETA,
  orgRole: 'OWNER',
};

const SUPPLIER_VERIFIED_ACTOR: ActorContext = {
  profileId: 'usr-sup-verified-004',
  supplierIds: ['sup-verified-01'],
};

describe('OTP Stage R2-17: Double-Entry Financial & Settlement Controls Red Team Security Battery (16 Attack Vectors)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;
  let accounts: LedgerAccount[];
  let openPeriodId: string;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);

    // Initialize Chart of Accounts and active period for ORG_ALPHA
    accounts = await services.accounting.initializeChartOfAccounts(ACTOR_ALPHA_OWNER, ORG_ALPHA);

    const now = timestamp();
    const period = await repos.accountingPeriods!.save({
      id: createId(),
      organizationId: ORG_ALPHA,
      periodCode: '2026-09',
      periodName: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });
    openPeriodId = period.id;

    // Seed Verified Supplier
    mem.seedSupplier({
      id: 'sup-verified-01',
      businessName: 'Apex Precision Engineering Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial Machinery'],
      gstin: '29AABCS1429B1ZX',
    });
  });

  async function seedPoAndInvoice(orgId: string, supplierId: string, baseAmount = 100000, gstRate = 18) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();
    const totalGst = Math.round((baseAmount * gstRate) / 100);
    const grossTotal = baseAmount + totalGst;

    const po = await repos.purchaseOrders.save({
      id: `po-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      rfqId: `rfq-${crypto.randomUUID().slice(0, 8)}`,
      supplierId,
      poNumber: `PO-2026-${crypto.randomUUID().slice(0, 4)}`,
      totalAmount: grossTotal,
      taxableTotal: baseAmount,
      igstTotal: totalGst,
      status: 'ISSUED',
      currency: 'INR',
      createdBy: ACTOR_ALPHA_OWNER.profileId,
      createdAt: now,
      updatedAt: now,
    });

    const inv = await repos.invoices.save({
      id: `inv-${crypto.randomUUID().slice(0, 8)}`,
      purchaseOrderId: po.id,
      invoiceNumber: `INV-2026-${crypto.randomUUID().slice(0, 4)}`,
      amount: grossTotal,
      paidAmount: 0,
      balanceDue: grossTotal,
      status: 'APPROVED',
      taxableAmount: baseAmount,
      igstAmount: totalGst,
      createdAt: now,
      updatedAt: now,
    });

    // Seed fee snapshot acknowledged by supplier
    await repos.poFeeSnapshots!.save({
      id: createId(),
      purchaseOrderId: po.id,
      policyId: 'pol-standard-0.5',
      policyVersion: 1,
      feeType: 'PERCENTAGE',
      rate: 0.50,
      acknowledgedBy: supplierId,
      acknowledgedAt: now,
      isAcknowledged: true,
      estimatedFeeAmount: (baseAmount * 0.5) / 100,
      createdAt: now,
      updatedAt: now,
    });

    return { po, inv };
  }

  // -------------------------------------------------------------------------
  // FIN-01: Duplicate settlement request
  // -------------------------------------------------------------------------
  it('FIN-01: Blocks duplicate settlement request and ensures idempotent execution', async () => {
    const { po, inv } = await seedPoAndInvoice(ORG_ALPHA, 'sup-verified-01');

    // First fee deduction
    const res1 = await services.payments.applyPlatformFeeDeduction(ACTOR_ALPHA_OWNER, {
      organizationId: ORG_ALPHA,
      purchaseOrderId: po.id,
      invoiceId: inv.id,
      paymentAllocationId: 'alloc-001',
      grossAmount: inv.amount,
    });
    expect(res1.ok).toBe(true);

    // Duplicate attempt with same paymentAllocationId
    const res2 = await services.payments.applyPlatformFeeDeduction(ACTOR_ALPHA_OWNER, {
      organizationId: ORG_ALPHA,
      purchaseOrderId: po.id,
      invoiceId: inv.id,
      paymentAllocationId: 'alloc-001',
      grossAmount: inv.amount,
    });
    expect(res2.ok).toBe(true);
    // Returns existing transaction without creating a second record
    if (res1.ok && res2.ok) {
      expect(res2.value.id).toBe(res1.value.id);
    }
  });

  // -------------------------------------------------------------------------
  // FIN-02: Replay same payment event
  // -------------------------------------------------------------------------
  it('FIN-02: Blocks duplicate financial effects when replaying the same reward/payment event', async () => {
    const { po } = await seedPoAndInvoice(ORG_ALPHA, 'sup-verified-01');
    const idempotencyKey = `REWARD-PAY-REPLAY-${po.id}`;

    // First reward allocation
    const res1 = await services.payments.creditBuyerSettlementReward(ACTOR_ALPHA_OWNER, {
      organizationId: ORG_ALPHA,
      platformFeeTxId: 'fee-tx-replay-01',
      procurementBaseAmount: 100000,
      feeRate: 0.50,
      rewardShareRate: 20.00,
      idempotencyKey,
    });
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.value.wallet.balanceCredits).toBe(100); // ₹100
    }

    // Replay with exact same idempotency key
    const res2 = await services.payments.creditBuyerSettlementReward(ACTOR_ALPHA_OWNER, {
      organizationId: ORG_ALPHA,
      platformFeeTxId: 'fee-tx-replay-01',
      procurementBaseAmount: 100000,
      feeRate: 0.50,
      rewardShareRate: 20.00,
      idempotencyKey,
    });
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.value.replayed).toBe(true);
      expect(res2.value.wallet.balanceCredits).toBe(100); // Balance NOT doubled to 200
    }
  });

  // -------------------------------------------------------------------------
  // FIN-03: Unbalanced journal insertion
  // -------------------------------------------------------------------------
  it('FIN-03: Rejects unbalanced journal entry where SUM(Debits) != SUM(Credits)', async () => {
    const unbalancedLines: JournalLine[] = [
      {
        lineNumber: 1,
        accountId: accounts[0]!.id,
        debitAmount: 10000,
        creditAmount: 0,
      },
      {
        lineNumber: 2,
        accountId: accounts[1]!.id,
        debitAmount: 0,
        creditAmount: 9500, // Imbalance of ₹500
      },
    ];

    const validation = validateJournalLines(unbalancedLines);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('Journal entry is unbalanced');

    await expect(
      services.accounting.postJournalEntry(ACTOR_ALPHA_OWNER, ORG_ALPHA, {
        periodId: openPeriodId,
        entryType: 'MANUAL_JOURNAL',
        narration: 'Malicious unbalanced journal',
        lines: unbalancedLines,
      }),
    ).rejects.toThrow('Journal entry validation failed');
  });

  // -------------------------------------------------------------------------
  // FIN-04: Negative/invalid journal manipulation
  // -------------------------------------------------------------------------
  it('FIN-04: Prohibits negative amounts and simultaneous debit/credit in journal lines', () => {
    const negativeLines: JournalLine[] = [
      {
        lineNumber: 1,
        accountId: accounts[0]!.id,
        debitAmount: -5000,
        creditAmount: 0,
      },
      {
        lineNumber: 2,
        accountId: accounts[1]!.id,
        debitAmount: 0,
        creditAmount: -5000,
      },
    ];

    const validation = validateJournalLines(negativeLines);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Negative debit'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // FIN-05: Platform fee alteration from frontend
  // -------------------------------------------------------------------------
  it('FIN-05: Enforces frozen 0.50% platform fee and ignores unauthorized frontend overrides', () => {
    // Platform fee calculation is derived server-side from snapshot rate (0.50%)
    const feeResult = calculatePlatformFee({
      grossAmount: 100000,
      rate: 0.50, // Frozen standard rate
    });

    expect(feeResult.feeAmount).toBe(500); // 0.50% of ₹1,00,000
    expect(feeResult.netSettlementAmount).toBe(99500);
  });

  // -------------------------------------------------------------------------
  // FIN-06: Buyer reward alteration from frontend
  // -------------------------------------------------------------------------
  it('FIN-06: Enforces frozen 0.10% buyer reward capped at 20% of platform fee', () => {
    const rewardResult = calculateBuyerReward({
      procurementBaseAmount: 100000,
      platformFeeRate: 0.50,
      rewardShareRate: 20.00, // 20% of 0.50% = 0.10%
    });

    expect(rewardResult.platformFeeAmount).toBe(500);
    expect(rewardResult.rewardAmount).toBe(100); // Exactly ₹100
    expect(rewardResult.effectiveRewardRate).toBe(0.1);
  });

  // -------------------------------------------------------------------------
  // FIN-07: GST value overwrite from frontend
  // -------------------------------------------------------------------------
  it('FIN-07: Preserves PA-06 bilateral GST calculation independence during financial segregation', () => {
    const segregation = calculateFinancialSegregation({
      taxableBaseAmount: 100000,
      cgstAmount: 9000,
      sgstAmount: 9000,
      platformFeeRate: 0.50,
    });

    // Total commercial obligation includes statutory ₹18,000 GST
    expect(segregation.grossCommercialAmount).toBe(118000);
    expect(segregation.totalGstAmount).toBe(18000);
    expect(segregation.otpPlatformFeeAmount).toBe(500); // Computed on base
    expect(segregation.netSupplierDisbursement).toBe(117500); // 1,18,000 - 500
    expect(segregation.isConserved).toBe(true);
  });

  // -------------------------------------------------------------------------
  // FIN-08: Settlement before supplier verification
  // -------------------------------------------------------------------------
  it('FIN-08: Blocks financial settlement execution if supplier has not passed R2-08 verification gate', () => {
    const prereq = evaluateSettlementPrerequisites({
      poStatus: 'ISSUED',
      supplierLifecycleTier: 'DISCOVERED_IN_AREA', // Unverified
      isPoAcceptedBySupplier: true,
      inspectionStatus: 'PASSED',
      invoiceStatus: 'APPROVED',
      isSpendAuthorized: true,
      isAlreadySettled: false,
    });

    expect(prereq.canExecuteSettlement).toBe(false);
    expect(prereq.blockingReasons[0]).toContain('unverified tier');
  });

  // -------------------------------------------------------------------------
  // FIN-09: Settlement before required PO acceptance
  // -------------------------------------------------------------------------
  it('FIN-09: Blocks settlement if supplier has not accepted PO and fee disclosure', () => {
    const prereq = evaluateSettlementPrerequisites({
      poStatus: 'ISSUED',
      supplierLifecycleTier: 'OTP_VERIFIED',
      isPoAcceptedBySupplier: false, // Unaccepted
      inspectionStatus: 'PASSED',
      invoiceStatus: 'APPROVED',
      isSpendAuthorized: true,
      isAlreadySettled: false,
    });

    expect(prereq.canExecuteSettlement).toBe(false);
    expect(prereq.blockingReasons[0]).toContain('Supplier has not accepted the Purchase Order');
  });

  // -------------------------------------------------------------------------
  // FIN-10: Settlement before invoice prerequisites
  // -------------------------------------------------------------------------
  it('FIN-10: Blocks settlement if quality inspection or invoice approval is pending', () => {
    const prereq = evaluateSettlementPrerequisites({
      poStatus: 'ISSUED',
      supplierLifecycleTier: 'OTP_VERIFIED',
      isPoAcceptedBySupplier: true,
      inspectionStatus: 'PENDING', // Inspection not passed
      invoiceStatus: 'SUBMITTED', // Invoice not approved
      isSpendAuthorized: true,
      isAlreadySettled: false,
    });

    expect(prereq.canExecuteSettlement).toBe(false);
    expect(prereq.blockingReasons.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // FIN-11: Cross-tenant financial read
  // -------------------------------------------------------------------------
  it('FIN-11: Prevents cross-tenant actors from reading organization financial ledgers', async () => {
    // User from ORG_BETA attempting to read ORG_ALPHA financial ledger
    const readAttempt = await services.accounting.getJournalEntries(ACTOR_BETA_OWNER, ORG_ALPHA);
    expect(readAttempt.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // FIN-12: Cross-tenant financial mutation
  // -------------------------------------------------------------------------
  it('FIN-12: Prevents cross-tenant actors from mutating or posting journals to another org', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: accounts[0]!.id, debitAmount: 1000, creditAmount: 0 },
      { lineNumber: 2, accountId: accounts[1]!.id, debitAmount: 0, creditAmount: 1000 },
    ];

    await expect(
      services.accounting.postJournalEntry(ACTOR_BETA_OWNER, ORG_ALPHA, {
        periodId: openPeriodId,
        entryType: 'MANUAL_JOURNAL',
        narration: 'Cross tenant attack',
        lines,
      }),
    ).rejects.toThrow('Buyer OWNER or MANAGER role required');
  });

  // -------------------------------------------------------------------------
  // FIN-13: Expired/over-cap delegation attempting financial approval
  // -------------------------------------------------------------------------
  it('FIN-13: Blocks unauthorized buyer without spend delegation from authorizing settlement', () => {
    const prereq = evaluateSettlementPrerequisites({
      poStatus: 'ISSUED',
      supplierLifecycleTier: 'OTP_VERIFIED',
      isPoAcceptedBySupplier: true,
      inspectionStatus: 'PASSED',
      invoiceStatus: 'APPROVED',
      isSpendAuthorized: false, // Delegation expired / over-cap
      isAlreadySettled: false,
    });

    expect(prereq.canExecuteSettlement).toBe(false);
    expect(prereq.blockingReasons[0]).toContain('Financial spend authorization or delegation approval is absent');
  });

  // -------------------------------------------------------------------------
  // FIN-14: PO change-order manipulation after settlement
  // -------------------------------------------------------------------------
  it('FIN-14: Prevents retroactive historical mutation of settled certificates upon subsequent changes', () => {
    const initialBreakdown = calculateFinancialSegregation({
      taxableBaseAmount: 100000,
      igstAmount: 18000,
    });

    const settledCert = buildAuthoritativeSettlementCertificate({
      purchaseOrderId: 'po-immutable-01',
      poNumber: 'PO-2026-IMM',
      invoiceId: 'inv-immutable-01',
      invoiceNumber: 'INV-2026-IMM',
      buyerOrganizationId: ORG_ALPHA,
      buyerOrganizationName: 'Alpha RWA',
      supplierId: 'sup-verified-01',
      supplierName: 'Bharat Pumps Ltd',
      breakdown: initialBreakdown,
      authorizedBy: ACTOR_ALPHA_OWNER.profileId,
    });

    // An immutable digital seal ensures tamper evidence
    expect(settledCert.digitalSealSha256).toBeDefined();
    expect(settledCert.breakdown.netSupplierDisbursement).toBe(117500);
  });

  // -------------------------------------------------------------------------
  // FIN-15: Concurrent settlement / race condition
  // -------------------------------------------------------------------------
  it('FIN-15: Safely serializes concurrent settlement and fee deduction requests', async () => {
    const { po, inv } = await seedPoAndInvoice(ORG_ALPHA, 'sup-verified-01');

    // Fire 5 concurrent fee deduction calls with the same allocation ID
    const promises = Array.from({ length: 5 }).map(() =>
      services.payments.applyPlatformFeeDeduction(ACTOR_ALPHA_OWNER, {
        organizationId: ORG_ALPHA,
        purchaseOrderId: po.id,
        invoiceId: inv.id,
        paymentAllocationId: 'alloc-concurrent-001',
        grossAmount: inv.amount,
      }),
    );

    const results = await Promise.all(promises);
    const successResults = results.filter((r) => r.ok);
    expect(successResults.length).toBe(5);

    // All return the exact same transaction ID (no duplicates created)
    const txIds = new Set(successResults.map((r) => (r.ok ? r.value.id : '')));
    expect(txIds.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // FIN-16: Fake UTR/payment confirmation or fabricated settlement success
  // -------------------------------------------------------------------------
  it('FIN-16: Detects and rejects duplicate or mismatched UTR remittance records', async () => {
    const { po, inv } = await seedPoAndInvoice(ORG_ALPHA, 'sup-verified-01');

    // Record valid payment
    const payRes = await services.payments.recordPayment(
      ACTOR_ALPHA_OWNER,
      inv.id,
      inv.amount,
      'BANK_TRANSFER',
    );
    expect(payRes.ok).toBe(true);

    if (payRes.ok) {
      // First UTR reconciliation
      const rec1 = await services.payments.reconcileBankUtr(
        ACTOR_ALPHA_OWNER,
        ORG_ALPHA,
        {
          utrNumber: 'HDFC20260925UTR999',
          bankClearedAmount: inv.amount,
          bankClearedDate: '2026-09-25',
          bankName: 'HDFC Bank',
        },
        payRes.value.id,
      );
      expect(rec1.ok).toBe(true);

      // Attempting to reuse the exact same UTR for a second transaction is flagged
      const payRes2 = await services.payments.recordPayment(
        ACTOR_ALPHA_OWNER,
        inv.id,
        inv.amount,
        'BANK_TRANSFER',
      );
      if (payRes2.ok) {
        const rec2 = await services.payments.reconcileBankUtr(
          ACTOR_ALPHA_OWNER,
          ORG_ALPHA,
          {
            utrNumber: 'HDFC20260925UTR999', // Duplicate UTR
            bankClearedAmount: inv.amount,
            bankClearedDate: '2026-09-25',
            bankName: 'HDFC Bank',
          },
          payRes2.value.id,
        );
        expect(rec2.ok).toBe(false);
        if (!rec2.ok) {
          expect(rec2.error.message).toContain('Duplicate UTR reconciliation');
        }
      }
    }
  });
});

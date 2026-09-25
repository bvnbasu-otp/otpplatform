import { describe, expect, it } from 'vitest';
import {
  deriveFivePointMilestoneProjection,
  deriveProgressiveInvoiceStage,
  validateDoubleEntryLedgerBalance,
  computeTripleFinancialSegregation,
  evaluateFivePointInspection,
  verifyInspectionSignoffIntegrity,
  CUSTOMER_MILESTONE_KEYS,
  CANONICAL_GOLDEN_STATES,
} from './track-milestone';

describe('Track & 5-Point Milestone Stepper Domain Suite', () => {
  it('defines 5 canonical customer milestone keys and 8 golden states', () => {
    expect(CUSTOMER_MILESTONE_KEYS).toHaveLength(5);
    expect(CUSTOMER_MILESTONE_KEYS).toEqual([
      'REQUIREMENT',
      'OFFERS',
      'DECISION',
      'PURCHASE',
      'DELIVERY_SETTLEMENT',
    ]);
    expect(CANONICAL_GOLDEN_STATES).toHaveLength(8);
  });

  describe('5-Point Milestone Projection Engine', () => {
    it('projects Step 1 (Requirement) when RFQ is in DRAFT', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'DRAFT',
        rfqId: 'rfq-001',
        buyerPersona: 'INDIVIDUAL',
      });

      expect(res.goldenState).toBe('DRAFT');
      expect(res.activeMilestoneKey).toBe('REQUIREMENT');
      expect(res.activeMilestoneNumber).toBe(1);
      expect(res.milestones[0]?.status).toBe('IN_PROGRESS');
      expect(res.milestones[0]?.isCurrent).toBe(true);
      expect(res.milestones[1]?.status).toBe('PENDING');
      expect(res.overallProgressPercent).toBe(10);
    });

    it('projects Step 2 (Offers) when RFQ is in QUOTING / OPEN / PUBLISHED', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'PUBLISHED',
        rfqId: 'rfq-002',
        buyerPersona: 'MSME',
      });

      expect(res.goldenState).toBe('QUOTING');
      expect(res.activeMilestoneKey).toBe('OFFERS');
      expect(res.activeMilestoneNumber).toBe(2);
      expect(res.milestones[0]?.isCompleted).toBe(true);
      expect(res.milestones[1]?.isCurrent).toBe(true);
      expect(res.overallProgressPercent).toBe(25);
    });

    it('projects Step 3 (Decision) when RFQ is in EVALUATING', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'EVALUATING',
        rfqId: 'rfq-003',
        buyerPersona: 'RWA',
      });

      expect(res.goldenState).toBe('EVALUATING');
      expect(res.activeMilestoneKey).toBe('DECISION');
      expect(res.activeMilestoneNumber).toBe(3);
      expect(res.milestones[0]?.isCompleted).toBe(true);
      expect(res.milestones[1]?.isCompleted).toBe(true);
      expect(res.milestones[2]?.isCurrent).toBe(true);
      expect(res.overallProgressPercent).toBe(40);
    });

    it('projects Step 4 (Purchase) when PO is ISSUED awaiting acceptance', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'AWARDED',
        poStatus: 'ISSUED',
        poId: 'po-101',
        buyerPersona: 'MSME',
      });

      expect(res.goldenState).toBe('PO_ISSUED');
      expect(res.activeMilestoneKey).toBe('PURCHASE');
      expect(res.activeMilestoneNumber).toBe(4);
      expect(res.milestones[2]?.isCompleted).toBe(true);
      expect(res.milestones[3]?.isCurrent).toBe(true);
      expect(res.contextSummary.supplierAccepted).toBe(false);
      expect(res.milestones[3]?.badgeText).toBe('Awaiting Supplier Acceptance');
    });

    it('projects Step 5 (Delivery & Settlement) when PO is ACCEPTED with active work order progress', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'AWARDED',
        poStatus: 'ACCEPTED',
        poId: 'po-101',
        supplierAcceptedAt: '2026-09-25T10:00:00Z',
        workOrderStatus: 'IN_PROGRESS',
        workOrderProgressPercent: 60,
        buyerPersona: 'RWA',
      });

      expect(res.goldenState).toBe('PO_ISSUED');
      expect(res.activeMilestoneKey).toBe('DELIVERY_SETTLEMENT');
      expect(res.activeMilestoneNumber).toBe(5);
      expect(res.contextSummary.supplierAccepted).toBe(true);
      expect(res.contextSummary.workOrderProgressPercent).toBe(60);
      expect(res.milestones[3]?.isCompleted).toBe(true);
      expect(res.milestones[4]?.isCurrent).toBe(true);
      expect(res.overallProgressPercent).toBe(72);
    });

    it('projects 100% Settled state when all invoices are paid and settlement is confirmed', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'AWARDED',
        poStatus: 'COMPLETED',
        poId: 'po-101',
        supplierAcceptedAt: '2026-09-25T10:00:00Z',
        workOrderStatus: 'COMPLETED',
        workOrderProgressPercent: 100,
        inspectionStatus: 'APPROVED',
        inspectionPassed: true,
        invoices: [{ id: 'inv-1', status: 'PAID', amount: 500000 }],
        isSettled: true,
        buyerPersona: 'MSME',
      });

      expect(res.goldenState).toBe('SETTLED');
      expect(res.activeMilestoneKey).toBe('DELIVERY_SETTLEMENT');
      expect(res.activeMilestoneNumber).toBe(5);
      expect(res.overallProgressPercent).toBe(100);
      expect(res.milestones.every((m) => m.isCompleted)).toBe(true);
      expect(res.contextSummary.settlementCompleted).toBe(true);
    });

    it('handles STALLED exception state correctly', () => {
      const res = deriveFivePointMilestoneProjection({
        rfqStatus: 'EVALUATING',
        isStalled: true,
        stalledReason: 'Evaluation quorum stalled: missing committee votes for >48h',
        buyerPersona: 'RWA',
      });

      expect(res.goldenState).toBe('STALLED');
      expect(res.isStalled).toBe(true);
      expect(res.stalledReason).toContain('missing committee votes');
    });
  });

  describe('Progressive Bilateral GST Invoice State Derivation (PA-06)', () => {
    it('derives PENDING_DELIVERY when delivery is incomplete', () => {
      const stage = deriveProgressiveInvoiceStage({
        deliveryPercent: 50,
        inspectionPassed: false,
      });
      expect(stage).toBe('PENDING_DELIVERY');
    });

    it('derives INVOICE_PENDING when delivery is 100% or inspection approved without submitted invoice', () => {
      const stage = deriveProgressiveInvoiceStage({
        deliveryPercent: 100,
        inspectionPassed: true,
      });
      expect(stage).toBe('INVOICE_PENDING');
    });

    it('derives INVOICE_ISSUED when invoice is SUBMITTED', () => {
      const stage = deriveProgressiveInvoiceStage({
        deliveryPercent: 100,
        inspectionPassed: true,
        invoiceStatus: 'SUBMITTED',
      });
      expect(stage).toBe('INVOICE_ISSUED');
    });

    it('derives INVOICE_AVAILABLE when invoice is APPROVED', () => {
      const stage = deriveProgressiveInvoiceStage({
        deliveryPercent: 100,
        inspectionPassed: true,
        invoiceStatus: 'APPROVED',
      });
      expect(stage).toBe('INVOICE_AVAILABLE');
    });

    it('derives INVOICE_PAID when payment is complete', () => {
      const stage = deriveProgressiveInvoiceStage({
        deliveryPercent: 100,
        inspectionPassed: true,
        invoiceStatus: 'PAID',
        isPaid: true,
      });
      expect(stage).toBe('INVOICE_PAID');
    });
  });

  describe('Double-Entry GAAP Financial Settlement & Segregation (PA-07)', () => {
    it('verifies balanced double-entry debits and credits strictly equal', () => {
      const balancedLines = [
        { accountCode: '2110', accountName: 'Accounts Payable', debit: 500000, credit: 0 },
        { accountCode: '1010', accountName: 'Main Bank Account', debit: 0, credit: 497500 },
        { accountCode: '4010', accountName: 'OTP Platform Fee', debit: 0, credit: 2500 },
      ];

      const res = validateDoubleEntryLedgerBalance(balancedLines);
      expect(res.isBalanced).toBe(true);
      expect(res.totalDebits).toBe(500000);
      expect(res.totalCredits).toBe(500000);
      expect(res.delta).toBe(0);
      expect(res.error).toBeUndefined();
    });

    it('rejects unbalanced double-entry lines with explicit delta error', () => {
      const unbalancedLines = [
        { accountCode: '2110', accountName: 'Accounts Payable', debit: 500000, credit: 0 },
        { accountCode: '1010', accountName: 'Main Bank Account', debit: 0, credit: 490000 },
      ];

      const res = validateDoubleEntryLedgerBalance(unbalancedLines);
      expect(res.isBalanced).toBe(false);
      expect(res.delta).toBe(10000);
      expect(res.error).toContain('Debit/Credit mismatch');
    });

    it('computes triple financial segregation correctly (GMV, 0.50% Platform Fee, 0.10% Reward)', () => {
      const breakdown = computeTripleFinancialSegregation(1000000); // 10 Lakhs GMV
      expect(breakdown.grossProcurementGmv).toBe(1000000);
      expect(breakdown.otpPlatformFee).toBe(5000); // 0.50% of 10L = ₹5,000
      expect(breakdown.buyerRewardIncentive).toBe(1000); // 0.10% of 10L = ₹1,000
      expect(breakdown.netSupplierDisbursement).toBe(995000); // 10L - 5k = ₹9,95,000
    });
  });

  describe('5-Point Delivery Inspection QA Sign-off & Cryptographic Seal', () => {
    const valid5PointItems = [
      { category: 'MATERIALS' as const, description: 'Raw materials & specs verified', status: 'PASSED' as const, score: 95 },
      { category: 'COMPLETION' as const, description: 'All deliverables physical completion', status: 'PASSED' as const, score: 90 },
      { category: 'SAFETY' as const, description: 'Site safety and standards compliant', status: 'PASSED' as const, score: 100 },
      { category: 'QUALITY' as const, description: 'Performance and quality benchmarks met', status: 'PASSED' as const, score: 92 },
      { category: 'SPECIFICATION' as const, description: 'Brand and make matching quote', status: 'PASSED' as const, score: 95 },
    ];

    it('evaluates and passes complete 5-point inspection with cryptographic seal', () => {
      const evalRes = evaluateFivePointInspection(valid5PointItems, {
        workOrderId: 'wo-qa-101',
        inspectorId: 'usr-inspector-1',
        timestamp: '2026-09-25T11:00:00Z',
      });

      expect(evalRes.isValid).toBe(true);
      expect(evalRes.passed).toBe(true);
      expect(evalRes.overallScore).toBe(94);
      expect(evalRes.missingCategories).toHaveLength(0);
      expect(evalRes.digitalSignoffHash).toBeDefined();

      // Verify signoff integrity
      const verifyRes = verifyInspectionSignoffIntegrity({
        workOrderId: 'wo-qa-101',
        inspectorId: 'usr-inspector-1',
        score: evalRes.overallScore,
        passed: evalRes.passed,
        itemCount: valid5PointItems.length,
        timestamp: '2026-09-25T11:00:00Z',
        signoffHash: evalRes.digitalSignoffHash!,
      });

      expect(verifyRes.valid).toBe(true);
    });

    it('detects tampering in inspection signoff hash', () => {
      const evalRes = evaluateFivePointInspection(valid5PointItems, {
        workOrderId: 'wo-qa-101',
        inspectorId: 'usr-inspector-1',
        timestamp: '2026-09-25T11:00:00Z',
      });

      const tamperedVerify = verifyInspectionSignoffIntegrity({
        workOrderId: 'wo-qa-101',
        inspectorId: 'usr-inspector-1',
        score: 99, // tampered score
        passed: evalRes.passed,
        itemCount: valid5PointItems.length,
        timestamp: '2026-09-25T11:00:00Z',
        signoffHash: evalRes.digitalSignoffHash!,
      });

      expect(tamperedVerify.valid).toBe(false);
      expect(tamperedVerify.error).toContain('hash mismatch');
    });

    it('rejects inspection if any of the mandatory 5 categories is omitted', () => {
      const incompleteItems = valid5PointItems.slice(0, 3); // only 3 categories
      const evalRes = evaluateFivePointInspection(incompleteItems, {
        workOrderId: 'wo-qa-102',
        inspectorId: 'usr-inspector-2',
      });

      expect(evalRes.isValid).toBe(false);
      expect(evalRes.passed).toBe(false);
      expect(evalRes.missingCategories).toContain('QUALITY');
      expect(evalRes.missingCategories).toContain('SPECIFICATION');
      expect(evalRes.error).toContain('Missing mandatory 5-point inspection categories');
    });
  });
});

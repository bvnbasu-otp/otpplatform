import { describe, expect, it } from 'vitest';
import {
  calculateFinancialSegregation,
  evaluateSettlementPrerequisites,
  buildAuthoritativeSettlementCertificate,
} from './financial-settlement-controls';

describe('OTP Stage R2-17: Double-Entry Financial & Settlement Controls Domain Specification', () => {
  describe('Financial Segregation Invariant (0.50% Platform Fee, 0.10% Buyer Reward)', () => {
    it('calculates exact 4-way segregation with mathematical conservation', () => {
      // Procurement Base: ₹1,00,000, 18% IGST (₹18,000) -> Gross Commercial: ₹1,18,000
      const res = calculateFinancialSegregation({
        taxableBaseAmount: 100000,
        igstAmount: 18000,
        platformFeeRate: 0.50, // 0.50%
        rewardShareRate: 20.00, // 20% of fee = 0.10% net reward
        tdsAmount: 2000, // 2% under Sec 194C
      });

      expect(res.grossCommercialAmount).toBe(118000);
      expect(res.taxableBaseAmount).toBe(100000);
      expect(res.totalGstAmount).toBe(18000);
      expect(res.otpPlatformFeeAmount).toBe(500); // 0.50% of 1,00,000
      expect(res.buyerRewardAmount).toBe(100); // 20% of 500 = 0.10% of 1,00,000
      expect(res.tdsWithholdingAmount).toBe(2000);
      // Net disbursement = 1,18,000 - 2,000 TDS - 500 Fee = 1,15,500
      expect(res.netSupplierDisbursement).toBe(115500);
      expect(res.isConserved).toBe(true);
    });

    it('conserves balances when debit and credit adjustments are present', () => {
      const res = calculateFinancialSegregation({
        taxableBaseAmount: 200000,
        cgstAmount: 9000,
        sgstAmount: 9000,
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
        tdsAmount: 4000,
        debitNotes: 5000, // Reduced obligation
        creditNotes: 2000, // Increased obligation
      });

      expect(res.grossCommercialAmount).toBe(218000);
      expect(res.otpPlatformFeeAmount).toBe(1000); // 0.50% of 2,00,000
      expect(res.buyerRewardAmount).toBe(200); // 0.10% of 2,00,000
      // Adjusted Gross = 2,18,000 - 5,000 + 2,000 = 2,15,000
      // Net = 2,15,000 - 4,000 TDS - 1,000 Fee = 2,10,000
      expect(res.netSupplierDisbursement).toBe(210000);
      expect(res.isConserved).toBe(true);
    });
  });

  describe('Settlement Prerequisites State Guard', () => {
    it('permits settlement when all prerequisite business states are satisfied', () => {
      const check = evaluateSettlementPrerequisites({
        poStatus: 'ISSUED',
        supplierLifecycleTier: 'GST_VERIFIED',
        isPoAcceptedBySupplier: true,
        inspectionStatus: 'PASSED',
        invoiceStatus: 'APPROVED',
        isSpendAuthorized: true,
        isAlreadySettled: false,
      });

      expect(check.canExecuteSettlement).toBe(true);
      expect(check.blockingReasons).toHaveLength(0);
    });

    it('blocks settlement if supplier is not KYC verified (R2-08 gate)', () => {
      const check = evaluateSettlementPrerequisites({
        poStatus: 'ISSUED',
        supplierLifecycleTier: 'DISCOVERED_IN_AREA',
        isPoAcceptedBySupplier: true,
        inspectionStatus: 'PASSED',
        invoiceStatus: 'APPROVED',
        isSpendAuthorized: true,
        isAlreadySettled: false,
      });

      expect(check.canExecuteSettlement).toBe(false);
      expect(check.blockingReasons[0]).toContain('unverified tier');
    });

    it('blocks settlement if PO is not accepted or inspection is pending', () => {
      const check = evaluateSettlementPrerequisites({
        poStatus: 'ISSUED',
        supplierLifecycleTier: 'OTP_VERIFIED',
        isPoAcceptedBySupplier: false,
        inspectionStatus: 'PENDING',
        invoiceStatus: 'APPROVED',
        isSpendAuthorized: true,
        isAlreadySettled: false,
      });

      expect(check.canExecuteSettlement).toBe(false);
      expect(check.blockingReasons.length).toBeGreaterThanOrEqual(2);
    });

    it('blocks settlement if already settled (anti-duplicate)', () => {
      const check = evaluateSettlementPrerequisites({
        poStatus: 'INVOICED',
        supplierLifecycleTier: 'OTP_VERIFIED',
        isPoAcceptedBySupplier: true,
        inspectionStatus: 'PASSED',
        invoiceStatus: 'APPROVED',
        isSpendAuthorized: true,
        isAlreadySettled: true,
      });

      expect(check.canExecuteSettlement).toBe(false);
      expect(check.blockingReasons[0]).toContain('already been fully settled');
    });
  });

  describe('Authoritative Settlement Certificate', () => {
    it('builds a tamper-evident settlement certificate with digital seal', () => {
      const breakdown = calculateFinancialSegregation({
        taxableBaseAmount: 50000,
        igstAmount: 9000,
        platformFeeRate: 0.50,
      });

      const cert = buildAuthoritativeSettlementCertificate({
        purchaseOrderId: 'po-test-12345678',
        poNumber: 'PO-2026-001',
        invoiceId: 'inv-test-123',
        invoiceNumber: 'INV-2026-001',
        buyerOrganizationId: 'org-msme-01',
        buyerOrganizationName: 'Acme Enterprises',
        supplierId: 'sup-01',
        supplierName: 'Bharat Machinery Ltd',
        supplierGstin: '29AABCS1429B1ZX',
        breakdown,
        authorizedBy: 'usr-buyer-001',
      });

      expect(cert.certificateId).toContain('SETTLE-');
      expect(cert.digitalSealSha256).toBeDefined();
      expect(cert.digitalSealSha256.length).toBe(64); // SHA-256 hex string
      expect(cert.breakdown.netSupplierDisbursement).toBe(58750); // 59,000 - 250 fee
    });
  });
});

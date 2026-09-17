import { describe, expect, it } from 'vitest';
import {
  calculatePlatformFee,
  calculateSettlementConservation,
  canTransitionFeeTransaction,
} from './platform-fee';

describe('OTP Phase 5C.5: Platform Fee Domain Model', () => {
  describe('calculatePlatformFee', () => {
    it('calculates exact 0.5% platform fee on ₹3,00,000 gross settlement', () => {
      const res = calculatePlatformFee({ grossAmount: 300000, rate: 0.5 });
      expect(res.grossAmount).toBe(300000);
      expect(res.feeRate).toBe(0.5);
      expect(res.feeAmount).toBe(1500);
      expect(res.netSettlementAmount).toBe(298500);
    });

    it('calculates deterministic paise rounding for odd amounts', () => {
      // ₹1,43,281.33 @ 0.5% = 716.40665 -> 716.41
      const res = calculatePlatformFee({ grossAmount: 143281.33, rate: 0.5 });
      expect(res.feeAmount).toBe(716.41);
      expect(res.netSettlementAmount).toBe(142564.92);
      expect(Math.round((res.feeAmount + res.netSettlementAmount) * 100) / 100).toBe(143281.33);
    });

    it('caps fee amount at grossAmount if rate >= 100%', () => {
      const res = calculatePlatformFee({ grossAmount: 1000, rate: 120 });
      expect(res.feeAmount).toBe(1000);
      expect(res.netSettlementAmount).toBe(0);
    });

    it('returns zero fee for zero gross amount', () => {
      const res = calculatePlatformFee({ grossAmount: 0, rate: 0.5 });
      expect(res.feeAmount).toBe(0);
      expect(res.netSettlementAmount).toBe(0);
    });

    it('throws error for negative fee rates', () => {
      expect(() => calculatePlatformFee({ grossAmount: 1000, rate: -0.5 })).toThrow(
        'Platform fee rate cannot be negative',
      );
    });

    it('applies minFee and maxFee constraints when specified', () => {
      const resMin = calculatePlatformFee({ grossAmount: 1000, rate: 0.5, minFee: 25 });
      expect(resMin.feeAmount).toBe(25);
      expect(resMin.netSettlementAmount).toBe(975);

      const resMax = calculatePlatformFee({ grossAmount: 1000000, rate: 0.5, maxFee: 2000 });
      expect(resMax.feeAmount).toBe(2000);
      expect(resMax.netSettlementAmount).toBe(998000);
    });
  });

  describe('calculateSettlementConservation', () => {
    it('verifies exact mathematical conservation of settlement chain', () => {
      // Gross: ₹1,00,000, Debit: ₹5,000, Credit: ₹2,000
      // Adjusted: ₹97,000, TDS: ₹1,940 (2%), Platform Fee: ₹485 (0.5%)
      // Net Settlement: ₹97,000 - ₹1,940 - ₹485 = ₹94,575
      const res = calculateSettlementConservation({
        grossInvoiceAmount: 100000,
        debitAdjustments: 5000,
        creditAdjustments: 2000,
        tdsAmount: 1940,
        platformFeeAmount: 485,
      });

      expect(res.grossInvoiceAmount).toBe(100000);
      expect(res.adjustedGrossAmount).toBe(97000);
      expect(res.tdsAmount).toBe(1940);
      expect(res.platformFeeAmount).toBe(485);
      expect(res.supplierNetSettlement).toBe(94575);
      expect(res.totalOutflowObligation).toBe(97000);
      expect(res.isConserved).toBe(true);
    });

    it('handles zero adjustments and clean full payout', () => {
      const res = calculateSettlementConservation({
        grossInvoiceAmount: 50000,
        tdsAmount: 1000,
        platformFeeAmount: 250,
      });

      expect(res.adjustedGrossAmount).toBe(50000);
      expect(res.supplierNetSettlement).toBe(48750);
      expect(res.totalOutflowObligation).toBe(50000);
      expect(res.isConserved).toBe(true);
    });
  });

  describe('canTransitionFeeTransaction', () => {
    it('allows valid progressive lifecycle flow', () => {
      expect(canTransitionFeeTransaction('CALCULATED', 'DISCLOSED')).toBe(true);
      expect(canTransitionFeeTransaction('DISCLOSED', 'ACKNOWLEDGED')).toBe(true);
      expect(canTransitionFeeTransaction('ACKNOWLEDGED', 'APPLIED')).toBe(true);
      expect(canTransitionFeeTransaction('APPLIED', 'SETTLED')).toBe(true);
    });

    it('prevents illegal backward jumps or mutations from terminal states', () => {
      expect(canTransitionFeeTransaction('SETTLED', 'CALCULATED')).toBe(false);
      expect(canTransitionFeeTransaction('VOIDED', 'SETTLED')).toBe(false);
      expect(canTransitionFeeTransaction('REVERSED', 'APPLIED')).toBe(false);
      expect(canTransitionFeeTransaction('CALCULATED', 'SETTLED')).toBe(false);
    });

    it('allows voiding and disputing from valid active states', () => {
      expect(canTransitionFeeTransaction('CALCULATED', 'VOIDED')).toBe(true);
      expect(canTransitionFeeTransaction('ACKNOWLEDGED', 'DISPUTED')).toBe(true);
      expect(canTransitionFeeTransaction('APPLIED', 'REVERSED')).toBe(true);
    });
  });
});

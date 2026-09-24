import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_MONTHLY_RFQ_ALLOWANCE,
  evaluateRfqEntitlement,
  validatePurchaseOrderCancellation,
  buildIndividualBuyerWalletSummary,
} from '@otp/domain';
import { fetchOrganizationRequirements } from '../requirement/api/requirements';
import { cancelPurchaseOrder } from '../fulfillment/api/purchase-orders';

describe('Individual Buyer Experience - Stage R2-04 Integration Suite', () => {
  describe('1. Individual as Simplest Buyer (organization_id = NULL)', () => {
    it('handles requirement queries cleanly when organizationId is null', async () => {
      const res = await fetchOrganizationRequirements(null);
      // Under mock/real supabase, it should return an object with ok
      expect(res).toBeDefined();
      expect(typeof res.ok).toBe('boolean');
    });
  });

  describe('2. Direct PO Cancellation Rule Pre-Acceptance', () => {
    it('blocks cancellation when reason is too short', async () => {
      const res = await cancelPurchaseOrder('test-po-id', 'No');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('minimum 5 characters');
      }
    });

    it('passes domain validation for cancellation prior to supplier acceptance with valid reason', () => {
      const validation = validatePurchaseOrderCancellation({
        currentStatus: 'ISSUED',
        cancellationReason: 'Scope revised and budget cancelled by individual buyer',
      });

      expect(validation.canCancel).toBe(true);
      expect(validation.rejectionReason).toBeUndefined();
    });

    it('blocks cancellation after supplier acceptance', () => {
      const validation = validatePurchaseOrderCancellation({
        currentStatus: 'ACCEPTED',
        cancellationReason: 'Buyer changed mind after supplier accepted',
      });

      expect(validation.canCancel).toBe(false);
      expect(validation.rejectionReason).toContain('strictly blocked after supplier acceptance');
    });
  });

  describe('3. Subscription Entitlement & Quarterly Bonus', () => {
    it('grants 3 monthly RFQs and 1 quarterly bonus RFQ for annual subscribers', () => {
      const entitlement = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T00:00:00Z',
        rfqsUsedInCurrentMonth: 0,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-09-24T12:00:00Z',
      });

      expect(entitlement.canCreateRfq).toBe(true);
      expect(entitlement.monthlyAllowance).toBe(3);
      expect(entitlement.quarterlyBonusAllowance).toBe(1);
      expect(entitlement.totalAvailableRfqs).toBe(4);
    });

    it('expires quarterly bonus at quarter end without accumulating or carrying forward', () => {
      // In September (Q3)
      const q3 = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T00:00:00Z',
        rfqsUsedInCurrentMonth: 3,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-09-30T23:59:00Z',
      });
      expect(q3.monthlyRemaining).toBe(0);
      expect(q3.quarterlyBonusRemaining).toBe(1);
      expect(q3.totalAvailableRfqs).toBe(1);

      // In October (Q4)
      const q4 = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T00:00:00Z',
        rfqsUsedInCurrentMonth: 0,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-10-01T00:01:00Z',
      });
      // Exactly 3 monthly + 1 bonus for Q4 (not 1 from Q3 + 1 for Q4)
      expect(q4.monthlyRemaining).toBe(3);
      expect(q4.quarterlyBonusRemaining).toBe(1);
      expect(q4.totalAvailableRfqs).toBe(4);
    });
  });

  describe('4. Wallet UX & Separation from Procurement GMV', () => {
    it('summarizes Cashback, Referral Bonus, and Share in Success while isolating from GMV', () => {
      const summary = buildIndividualBuyerWalletSummary({
        cashbackCredits: 300,
        referralCredits: 200,
        shareInSuccessCredits: 100,
      });

      expect(summary.totalCredits).toBe(600);
      expect(summary.cashbackCredits).toBe(300);
      expect(summary.referralCredits).toBe(200);
      expect(summary.shareInSuccessCredits).toBe(100);
      expect(summary.isGmvSeparated).toBe(true);
    });
  });
});

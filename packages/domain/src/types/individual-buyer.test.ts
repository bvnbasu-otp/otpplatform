import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_MONTHLY_RFQ_ALLOWANCE,
  getCalendarQuarterWindow,
  evaluateRfqEntitlement,
  getSubscriptionEntitlementPolicy,
  SUBSCRIPTION_TIERS,
  resolveTierForOrgType,
  validatePurchaseOrderCancellation,
  buildIndividualBuyerWalletSummary,
} from '../index';

describe('Stage R2-04: Individual Buyer Experience Domain Engine', () => {
  describe('1. Individual Persona & Subscription Entitlement', () => {
    it('configures Individual tier with 3 monthly RFQs and 1 quarterly bonus RFQ for annual plans', () => {
      expect(INDIVIDUAL_MONTHLY_RFQ_ALLOWANCE).toBe(3);

      const tier = SUBSCRIPTION_TIERS.INDIVIDUAL;
      expect(tier.monthlyRfqs).toBe(3);
      expect(tier.quarterlyBonusRfqs).toBe(1);
      expect(tier.monthlyPrice).toBe(199);
      expect(tier.yearlyPrice).toBe(1999);
    });

    it('resolves tier correctly for null / individual org type', () => {
      expect(resolveTierForOrgType(null as any)).toBe('INDIVIDUAL');
      expect(resolveTierForOrgType(undefined)).toBe('INDIVIDUAL');
      expect(resolveTierForOrgType('INDIVIDUAL')).toBe('INDIVIDUAL');
    });

    it('calculates calendar quarters accurately across dates', () => {
      const q1 = getCalendarQuarterWindow(new Date('2026-02-14T10:00:00Z'));
      expect(q1.quarter).toBe(1);
      expect(q1.year).toBe(2026);
      expect(q1.startIso).toContain('2026-01-01');
      expect(q1.endIso).toContain('2026-03-31');
      expect(q1.label).toBe('Q1 2026');

      const q2 = getCalendarQuarterWindow(new Date('2026-05-01T10:00:00Z'));
      expect(q2.quarter).toBe(2);

      const q3 = getCalendarQuarterWindow(new Date('2026-09-24T10:00:00Z'));
      expect(q3.quarter).toBe(3);

      const q4 = getCalendarQuarterWindow(new Date('2026-11-20T10:00:00Z'));
      expect(q4.quarter).toBe(4);
    });

    it('evaluates entitlement for Monthly Individual subscriber: 3 RFQs/mo, bonus = 0', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-24T23:59:59Z',
        rfqsUsedInCurrentMonth: 1,
        billingMode: 'LIVE',
        now: '2026-09-24T12:00:00Z',
      });

      expect(res.isSubscriptionActive).toBe(true);
      expect(res.monthlyAllowance).toBe(3);
      expect(res.monthlyRemaining).toBe(2);
      expect(res.quarterlyBonusAllowance).toBe(0);
      expect(res.quarterlyBonusRemaining).toBe(0);
      expect(res.totalAvailableRfqs).toBe(2);
      expect(res.canCreateRfq).toBe(true);
    });

    it('evaluates entitlement for Annual Individual subscriber: 3 monthly + 1 quarterly bonus RFQ', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T23:59:59Z',
        rfqsUsedInCurrentMonth: 0,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-09-24T12:00:00Z',
      });

      expect(res.isSubscriptionActive).toBe(true);
      expect(res.monthlyAllowance).toBe(3);
      expect(res.monthlyRemaining).toBe(3);
      expect(res.quarterlyBonusAllowance).toBe(1);
      expect(res.quarterlyBonusRemaining).toBe(1);
      expect(res.totalAvailableRfqs).toBe(4);
      expect(res.canCreateRfq).toBe(true);
    });

    it('enforces quarterly bonus expiration at quarter end (does not carry forward)', () => {
      // In September (Q3): 1 bonus RFQ available
      const sepRes = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T23:59:59Z',
        rfqsUsedInCurrentMonth: 3,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-09-30T23:00:00Z',
      });
      expect(sepRes.monthlyRemaining).toBe(0);
      expect(sepRes.quarterlyBonusRemaining).toBe(1);
      expect(sepRes.totalAvailableRfqs).toBe(1);

      // In October (Q4): Q3 bonus expired, fresh Q4 bonus of 1 (not 1 + 1)
      const octRes = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-24T23:59:59Z',
        rfqsUsedInCurrentMonth: 0,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-10-01T00:01:00Z',
      });
      expect(octRes.monthlyAllowance).toBe(3);
      expect(octRes.monthlyRemaining).toBe(3);
      expect(octRes.quarterlyBonusAllowance).toBe(1);
      expect(octRes.quarterlyBonusRemaining).toBe(1);
      expect(octRes.totalAvailableRfqs).toBe(4);
    });

    it('returns policy configuration via getSubscriptionEntitlementPolicy', () => {
      const policy = getSubscriptionEntitlementPolicy('INDIVIDUAL');
      expect(policy.tierId).toBe('INDIVIDUAL');
      expect(policy.monthlyRfqs).toBe(3);
      expect(policy.quarterlyBonusRfqs).toBe(1);
    });
  });

  describe('2. Purchase Order Cancellation Rule (Directive 10)', () => {
    it('allows cancellation in pre-acceptance statuses (DRAFT, PENDING_APPROVAL, APPROVED, ISSUED) with valid reason', () => {
      const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED'] as const;

      for (const status of validStatuses) {
        const check = validatePurchaseOrderCancellation({
          currentStatus: status,
          cancellationReason: 'Site requirements changed and project is deferred.',
        });
        expect(check.canCancel).toBe(true);
        expect(check.rejectionReason).toBeUndefined();
      }
    });

    it('strictly blocks cancellation AFTER supplier acceptance (ACCEPTED, IN_PROGRESS, COMPLETED)', () => {
      const postAcceptanceStatuses = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] as const;

      for (const status of postAcceptanceStatuses) {
        const check = validatePurchaseOrderCancellation({
          currentStatus: status as any,
          cancellationReason: 'Buyer wants to cancel now.',
        });
        expect(check.canCancel).toBe(false);
        expect(check.rejectionReason).toContain('strictly blocked after supplier acceptance');
      }
    });

    it('enforces mandatory non-empty cancellation reason of >= 5 characters', () => {
      const emptyCheck = validatePurchaseOrderCancellation({
        currentStatus: 'ISSUED',
        cancellationReason: '   ',
      });
      expect(emptyCheck.canCancel).toBe(false);
      expect(emptyCheck.rejectionReason).toContain('valid cancellation reason');

      const shortCheck = validatePurchaseOrderCancellation({
        currentStatus: 'ISSUED',
        cancellationReason: 'Nope',
      });
      expect(shortCheck.canCancel).toBe(false);
      expect(shortCheck.rejectionReason).toContain('minimum 5 characters');
    });
  });

  describe('3. Wallet UX & GMV Segregation (Directive 12)', () => {
    it('builds individual buyer wallet summary with Cashback, Referral, and Share in Success', () => {
      const summary = buildIndividualBuyerWalletSummary({
        cashbackCredits: 150,
        referralCredits: 500,
        shareInSuccessCredits: 250,
      });

      expect(summary.totalCredits).toBe(900);
      expect(summary.cashbackCredits).toBe(150);
      expect(summary.referralCredits).toBe(500);
      expect(summary.shareInSuccessCredits).toBe(250);
      expect(summary.isGmvSeparated).toBe(true);
      expect(summary.formattedTotalCredits).toBe('₹900.00');
    });
  });
});

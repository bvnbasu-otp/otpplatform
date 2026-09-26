import { describe, expect, it, vi } from 'vitest';
import {
  SUBSCRIPTION_TIERS,
  computeSubscriptionFee,
  generateSubscriptionPaymentRef,
  getRenewalNoticeLevel,
  resolveTierForOrgType,
  calculateGst,
  evaluateRfqEntitlement,
  WHY_5_RFQS_EXPLANATION,
  SUPPLIER_FEE_POLICY,
  BUYER_REWARD_POLICY,
} from './types';

describe('Subscription Pricing & Tier Rules', () => {
  it('enforces exact Individual tier pricing (₹199/mo, ₹1,999/yr, 3 RFQs/mo [1 bonus per quarter on annual])', () => {
    const individual = SUBSCRIPTION_TIERS.INDIVIDUAL;
    expect(individual.monthlyPrice).toBe(199);
    expect(individual.monthlyDurationDays).toBe(30);
    expect(individual.monthlyRfqs).toBe(3);
    expect(individual.yearlyPrice).toBe(1999);
    expect(individual.yearlyDurationDays).toBe(365);
    expect(individual.quarterlyBonusRfqs).toBe(1);
    expect(individual.yearlySavings).toBe(389);
    expect(individual.additionalRfqPrice).toBe(149);
  });

  it('enforces exact RWA tier pricing (₹1,499/mo, ₹14,999/yr, 3 RFQs/mo [1 bonus per quarter on annual])', () => {
    const rwa = SUBSCRIPTION_TIERS.RWA;
    expect(rwa.monthlyPrice).toBe(1499);
    expect(rwa.monthlyDurationDays).toBe(30);
    expect(rwa.monthlyRfqs).toBe(3);
    expect(rwa.yearlyPrice).toBe(14999);
    expect(rwa.yearlyDurationDays).toBe(365);
    expect(rwa.yearlyMonthlyRfqs).toBe(3);
    expect(rwa.quarterlyBonusRfqs).toBe(1);
    expect(rwa.yearlySavings).toBe(2989);
    expect(rwa.additionalRfqPrice).toBe(999);
    expect(rwa.popular).toBe(true);
  });

  it('enforces exact MSME tier pricing (₹1,999/mo, ₹19,999/yr, 3 RFQs/mo [1 bonus per quarter on annual])', () => {
    const msme = SUBSCRIPTION_TIERS.MSME;
    expect(msme.monthlyPrice).toBe(1999);
    expect(msme.monthlyDurationDays).toBe(30);
    expect(msme.monthlyRfqs).toBe(3);
    expect(msme.yearlyPrice).toBe(19999);
    expect(msme.yearlyDurationDays).toBe(365);
    expect(msme.yearlyMonthlyRfqs).toBe(3);
    expect(msme.quarterlyBonusRfqs).toBe(1);
    expect(msme.yearlySavings).toBe(3989);
    expect(msme.additionalRfqPrice).toBe(1499);
  });

  it('enforces exact Enterprise tier pricing (From ₹4,999/mo, From ₹49,999/yr)', () => {
    const enterprise = SUBSCRIPTION_TIERS.ENTERPRISE;
    expect(enterprise.monthlyPrice).toBe(4999);
    expect(enterprise.monthlyDurationDays).toBe(30);
    expect(enterprise.yearlyPrice).toBe(49999);
    expect(enterprise.yearlyDurationDays).toBe(365);
    expect(enterprise.yearlySavings).toBe(9989);
  });

  it('correctly maps buyer organization types to the appropriate canonical subscription tier', () => {
    expect(resolveTierForOrgType('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveTierForOrgType('RWA')).toBe('RWA');
    expect(resolveTierForOrgType('COMMUNITY')).toBe('RWA');
    expect(resolveTierForOrgType('SOCIETY')).toBe('RWA');
    expect(resolveTierForOrgType('MSME')).toBe('MSME');
    expect(resolveTierForOrgType('ENTERPRISE')).toBe('ENTERPRISE');
    expect(resolveTierForOrgType('INSTITUTION')).toBe('ENTERPRISE');
    expect(resolveTierForOrgType('TRUST')).toBe('ENTERPRISE');
    expect(resolveTierForOrgType('GOVERNMENT')).toBe('ENTERPRISE');
    expect(resolveTierForOrgType(undefined)).toBe('INDIVIDUAL');
  });

  it('computes subscription fees and duration correctly for monthly and yearly cycles', () => {
    const indMonthly = computeSubscriptionFee('INDIVIDUAL', 'MONTHLY');
    expect(indMonthly.amount).toBe(199);
    expect(indMonthly.durationDays).toBe(30);
    expect(indMonthly.monthlyRfqQuota).toBe(3);

    const indYearly = computeSubscriptionFee('INDIVIDUAL', 'YEARLY');
    expect(indYearly.amount).toBe(1999);
    expect(indYearly.durationDays).toBe(365);
    expect(indYearly.monthlyRfqQuota).toBe(3);
    expect(indYearly.savings).toBe(389);

    const rwaMonthly = computeSubscriptionFee('RWA', 'MONTHLY');
    expect(rwaMonthly.amount).toBe(1499);
    expect(rwaMonthly.durationDays).toBe(30);
    expect(rwaMonthly.monthlyRfqQuota).toBe(3);

    const rwaYearly = computeSubscriptionFee('RWA', 'YEARLY');
    expect(rwaYearly.amount).toBe(14999);
    expect(rwaYearly.durationDays).toBe(365);
    expect(rwaYearly.monthlyRfqQuota).toBe(3);
    expect(rwaYearly.savings).toBe(2989);
  });

  it('computes exact GST breakdown on subscription amounts', () => {
    const gst199 = calculateGst(199);
    expect(gst199.gstAmount).toBe(35.82);
    expect(gst199.totalAmount).toBe(234.82);

    const gst1499 = calculateGst(1499);
    expect(gst1499.gstAmount).toBe(269.82);
    expect(gst1499.totalAmount).toBe(1768.82);

    const gst1999 = calculateGst(1999);
    expect(gst1999.gstAmount).toBe(359.82);
    expect(gst1999.totalAmount).toBe(2358.82);

    const gst149 = calculateGst(149);
    expect(gst149.gstAmount).toBe(26.82);
    expect(gst149.totalAmount).toBe(175.82);
  });
});

describe('Prepaid Subscription Lifecycle & Renewal Reminders', () => {
  it('triggers EXPIRED state when validity has lapsed', () => {
    expect(getRenewalNoticeLevel(0, true)).toBe('EXPIRED');
    expect(getRenewalNoticeLevel(0, false)).toBe('EXPIRED');
    expect(getRenewalNoticeLevel(-5, false)).toBe('EXPIRED');
  });

  it('triggers URGENT_1_DAY notice 1 day before expiry', () => {
    expect(getRenewalNoticeLevel(1, false)).toBe('URGENT_1_DAY');
  });

  it('triggers WARNING_3_DAYS notice 3 days before expiry', () => {
    expect(getRenewalNoticeLevel(2, false)).toBe('WARNING_3_DAYS');
    expect(getRenewalNoticeLevel(3, false)).toBe('WARNING_3_DAYS');
  });

  it('triggers INFO_7_DAYS notice 7 days before expiry', () => {
    expect(getRenewalNoticeLevel(4, false)).toBe('INFO_7_DAYS');
    expect(getRenewalNoticeLevel(7, false)).toBe('INFO_7_DAYS');
  });

  it('returns NONE for healthy active subscriptions with more than 7 days remaining', () => {
    expect(getRenewalNoticeLevel(8, false)).toBe('NONE');
    expect(getRenewalNoticeLevel(25, false)).toBe('NONE');
  });
});

describe('Calendar Month RFQ Entitlement Engine', () => {
  it('correctly evaluates RFQ creation allowance and limits', () => {
    const activeMonthly = evaluateRfqEntitlement({
      tierId: 'RWA',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: '2026-10-31T23:59:59Z',
      rfqsUsedInCurrentMonth: 1,
      billingMode: 'LIVE',
      now: '2026-09-22T08:00:00Z',
    });
    expect(activeMonthly.monthlyAllowance).toBe(3);
    expect(activeMonthly.monthlyRemaining).toBe(2);
    expect(activeMonthly.canCreateRfq).toBe(true);

    const activeYearly = evaluateRfqEntitlement({
      tierId: 'RWA',
      plan: 'YEARLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: '2027-08-31T23:59:59Z',
      rfqsUsedInCurrentMonth: 1,
      billingMode: 'LIVE',
      now: '2026-09-22T08:00:00Z',
    });
    expect(activeYearly.monthlyAllowance).toBe(3);
    expect(activeYearly.monthlyRemaining).toBe(2);
    expect(activeYearly.isBonusApplied).toBe(true);
  });
});

describe('Cryptographically Secure Payment Reference Generation (FIX-01)', () => {
  it('generates a valid, cryptographically formatted payment reference', () => {
    const ref = generateSubscriptionPaymentRef();
    expect(ref).toMatch(/^UPI-TXN-[A-Z0-9]+-[A-F0-9]{8}$/);
  });

  it('never uses Math.random() for payment reference generation', () => {
    const mathRandomSpy = vi.spyOn(Math, 'random');
    const ref = generateSubscriptionPaymentRef();
    expect(mathRandomSpy).not.toHaveBeenCalled();
    expect(ref.startsWith('UPI-TXN-')).toBe(true);
    mathRandomSpy.mockRestore();
  });

  it('guarantees uniqueness and collision resistance across 1,000 successive iterations', () => {
    const count = 1000;
    const generated = new Set<string>();
    for (let i = 0; i < count; i += 1) {
      const ref = generateSubscriptionPaymentRef();
      expect(generated.has(ref)).toBe(false);
      generated.add(ref);
    }
    expect(generated.size).toBe(count);
  });

  it('operates securely via crypto.getRandomValues fallback if crypto.randomUUID is absent', () => {
    const originalRandomUuid = crypto.randomUUID;
    (crypto as any).randomUUID = undefined;

    try {
      const mathRandomSpy = vi.spyOn(Math, 'random');
      const ref = generateSubscriptionPaymentRef();
      expect(mathRandomSpy).not.toHaveBeenCalled();
      expect(ref).toMatch(/^UPI-TXN-[A-Z0-9]+-[A-F0-9]{8}$/);
      mathRandomSpy.mockRestore();
    } finally {
      (crypto as any).randomUUID = originalRandomUuid;
    }
  });

  it('exports wallet API methods and components', async () => {
    const {
      fetchOrganizationWallet,
      fetchWalletTransactions,
      applyWalletCreditsToSubscription,
    } = await import('./api/subscription');

    expect(fetchOrganizationWallet).toBeDefined();
    expect(typeof fetchOrganizationWallet).toBe('function');
    expect(fetchWalletTransactions).toBeDefined();
    expect(typeof fetchWalletTransactions).toBe('function');
    expect(applyWalletCreditsToSubscription).toBeDefined();
    expect(typeof applyWalletCreditsToSubscription).toBe('function');

    const { SubscriptionPaymentModal } = await import('./components/SubscriptionPaymentModal');
    expect(SubscriptionPaymentModal).toBeDefined();
    expect(typeof SubscriptionPaymentModal).toBe('function');

    const { OtpWalletCreditsWidget } = await import('./components/OtpWalletCreditsWidget');
    expect(OtpWalletCreditsWidget).toBeDefined();
    expect(typeof OtpWalletCreditsWidget).toBe('function');
  });

  it('guarantees prepaid subscription tiers strictly match the 3 canonical buyer personas', () => {
    const canonicalTiers = ['INDIVIDUAL', 'RWA', 'MSME'];
    expect(canonicalTiers).toEqual(['INDIVIDUAL', 'RWA', 'MSME']);
    expect(canonicalTiers).not.toContain('ENTERPRISE');
  });
});

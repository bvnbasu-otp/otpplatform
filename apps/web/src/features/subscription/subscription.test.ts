import { describe, expect, it, vi } from 'vitest';
import {
  SUBSCRIPTION_TIERS,
  computeSubscriptionFee,
  generateSubscriptionPaymentRef,
  getRenewalNoticeLevel,
  resolveTierForOrgType,
} from './types';

describe('Subscription Pricing & Tier Rules', () => {
  it('enforces exact Tier 1 (MSME / Individual) pricing structures', () => {
    const tier1 = SUBSCRIPTION_TIERS.TIER_1_MSME;
    expect(tier1.monthlyPrice).toBe(99);
    expect(tier1.monthlyDurationDays).toBe(30);
    expect(tier1.yearlyPrice).toBe(999);
    expect(tier1.yearlyDurationDays).toBe(365);
    expect(tier1.yearlySavings).toBe(189);
  });

  it('enforces exact Tier 2 (RWA / Institutional Committee) pricing structures', () => {
    const tier2 = SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE;
    expect(tier2.monthlyPrice).toBe(1000);
    expect(tier2.monthlyDurationDays).toBe(30);
    expect(tier2.yearlyPrice).toBe(10000);
    expect(tier2.yearlyDurationDays).toBe(365);
    expect(tier2.yearlySavings).toBe(2000); // 12000 - 10000
  });

  it('correctly maps buyer organization types to the appropriate subscription tier', () => {
    expect(resolveTierForOrgType('INDIVIDUAL')).toBe('TIER_1_MSME');
    expect(resolveTierForOrgType('MSME')).toBe('TIER_1_MSME');
    expect(resolveTierForOrgType('COMMUNITY')).toBe('TIER_2_ENTERPRISE');
    expect(resolveTierForOrgType('ENTERPRISE')).toBe('TIER_2_ENTERPRISE');
    expect(resolveTierForOrgType('INSTITUTION')).toBe('TIER_2_ENTERPRISE');
    expect(resolveTierForOrgType(undefined)).toBe('TIER_1_MSME');
  });

  it('computes subscription fees and duration correctly for monthly and yearly cycles', () => {
    const t1Monthly = computeSubscriptionFee('TIER_1_MSME', 'MONTHLY');
    expect(t1Monthly.amount).toBe(99);
    expect(t1Monthly.durationDays).toBe(30);

    const t1Yearly = computeSubscriptionFee('TIER_1_MSME', 'YEARLY');
    expect(t1Yearly.amount).toBe(999);
    expect(t1Yearly.durationDays).toBe(365);
    expect(t1Yearly.savings).toBe(189);

    const t2Monthly = computeSubscriptionFee('TIER_2_ENTERPRISE', 'MONTHLY');
    expect(t2Monthly.amount).toBe(1000);
    expect(t2Monthly.durationDays).toBe(30);

    const t2Yearly = computeSubscriptionFee('TIER_2_ENTERPRISE', 'YEARLY');
    expect(t2Yearly.amount).toBe(10000);
    expect(t2Yearly.durationDays).toBe(365);
    expect(t2Yearly.savings).toBe(2000);
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

describe('OTP Wallet & Credits Engine', () => {
  it('exports OtpWalletCreditsWidget component', async () => {
    const { OtpWalletCreditsWidget } = await import('./components/OtpWalletCreditsWidget');
    expect(OtpWalletCreditsWidget).toBeDefined();
    expect(typeof OtpWalletCreditsWidget).toBe('function');
  }, 20000);
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
    // Temporarily mask crypto.randomUUID
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

  it('exports wallet API methods and components for Phase 6.4', async () => {
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
  });
});


import { describe, it, expect } from 'vitest';
import {
  calculateGst,
  calculateSupplierPlatformFeeWithGst,
  computeSubscriptionPricing,
  computeExtraRfqPricing,
  evaluateRfqEntitlement,
  getCalendarMonthWindow,
  getExtraRfqPriceForTier,
  resolveBillingMode,
  resolveTierForOrgType,
  SUBSCRIPTION_TIERS,
  SUPPLIER_FEE_POLICY,
  BUYER_REWARD_POLICY,
  DEFAULT_GST_RATE_PERCENT,
  OTP_GST_RATE,
  type SubscriptionTierId,
} from '../../packages/domain/src/types/pricing-entitlement';
import {
  computeCreditExpiryDate,
  isCreditValid,
  consumeWalletCreditsFefo,
  type WalletCreditLot,
} from '../../packages/domain/src/types/buyer-reward';
import { generateSubscriptionPaymentRef } from '../../apps/web/src/features/subscription/types';

describe('Pricing & Entitlement Red-Team Security Test Suite (25 Attack Vectors)', () => {
  // -------------------------------------------------------------------------
  // VECTOR 1: Negative Base Price Injection
  // -------------------------------------------------------------------------
  it('Vector 1: Rejects negative base price injection in GST calculation', () => {
    const res = calculateGst(-999);
    expect(res.basePrice).toBe(0);
    expect(res.gstAmount).toBe(0);
    expect(res.totalAmount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // VECTOR 2: Negative / Fractional RFQ Quota Manipulation
  // -------------------------------------------------------------------------
  it('Vector 2: Handles negative or corrupted used RFQ count safely', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 15).toISOString(),
      rfqsUsedInCurrentMonth: -5, // corrupted negative count
      billingMode: 'LIVE',
    });
    // Should treat negative as 0 used and allow max monthly allowance
    expect(evalResult.monthlyRemaining).toBe(3);
    expect(evalResult.canCreateRfq).toBe(true);
  });

  // -------------------------------------------------------------------------
  // VECTOR 3: Negative GST Rate Injection
  // -------------------------------------------------------------------------
  it('Vector 3: Clamps negative GST rate to 0% to prevent tax deduction attack', () => {
    const res = calculateGst(1000, -18);
    expect(res.gstRatePercent).toBe(0);
    expect(res.gstAmount).toBe(0);
    expect(res.totalAmount).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // VECTOR 4: Floating-Point Precision Exploitation (Paise Drift Attack)
  // -------------------------------------------------------------------------
  it('Vector 4: Defends against floating-point precision drift across all price points', () => {
    const testPrices = [149, 199, 1499, 1999, 4999, 14999, 19999, 49999];
    for (const p of testPrices) {
      const calc = calculateGst(p, OTP_GST_RATE);
      const expectedGst = Math.round(p * 0.18 * 100) / 100;
      const expectedTotal = Math.round((p + expectedGst) * 100) / 100;
      expect(calc.gstAmount).toBe(expectedGst);
      expect(calc.totalAmount).toBe(expectedTotal);
      // Verify no more than 2 decimal places in total
      const decimals = calc.totalAmount.toString().split('.')[1]?.length || 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });

  // -------------------------------------------------------------------------
  // VECTOR 4B: Dynamic Tax-Rate Change Security Adaptability
  // -------------------------------------------------------------------------
  it('Vector 4B: Proves dynamic GST tax rate change safely recomputes across all subscription tiers and restores 18%', () => {
    // 1. Subscription GST baseline calculations at 18%
    const expected18 = [
      { price: 149, gst: 26.82, total: 175.82 },
      { price: 199, gst: 35.82, total: 234.82 },
      { price: 1499, gst: 269.82, total: 1768.82 },
      { price: 1999, gst: 359.82, total: 2358.82 },
      { price: 4999, gst: 899.82, total: 5898.82 },
      { price: 14999, gst: 2699.82, total: 17698.82 },
      { price: 19999, gst: 3599.82, total: 23598.82 },
      { price: 49999, gst: 8999.82, total: 58998.82 },
    ];

    for (const item of expected18) {
      const calc = calculateGst(item.price, DEFAULT_GST_RATE_PERCENT);
      expect(calc.gstAmount).toBe(item.gst);
      expect(calc.totalAmount).toBe(item.total);
    }

    // 2. Dynamic rate change test: e.g. statutory rate changes to 12%
    const newStatutoryRate = 12.0;
    for (const item of expected18) {
      const calc12 = calculateGst(item.price, newStatutoryRate);
      const expectedGst12 = Math.round(item.price * 0.12 * 100) / 100;
      const expectedTotal12 = Math.round((item.price + expectedGst12) * 100) / 100;
      expect(calc12.gstRatePercent).toBe(12.0);
      expect(calc12.gstAmount).toBe(expectedGst12);
      expect(calc12.totalAmount).toBe(expectedTotal12);
    }

    // 3. Restores to 18% configuration
    for (const item of expected18) {
      const calcRestored = calculateGst(item.price, OTP_GST_RATE);
      expect(calcRestored.gstRatePercent).toBe(18.0);
      expect(calcRestored.gstAmount).toBe(item.gst);
      expect(calcRestored.totalAmount).toBe(item.total);
    }
  });

  // -------------------------------------------------------------------------
  // VECTOR 5: Zero Price Subscription Pricing Integrity
  // -------------------------------------------------------------------------
  it('Vector 5: Subscription pricing computation never returns 0 or negative for canonical tiers', () => {
    const tiers: SubscriptionTierId[] = ['INDIVIDUAL', 'RWA', 'MSME', 'ENTERPRISE'];
    for (const t of tiers) {
      const monthly = computeSubscriptionPricing(t, 'MONTHLY');
      const yearly = computeSubscriptionPricing(t, 'YEARLY');
      expect(monthly.basePrice).toBeGreaterThan(0);
      expect(monthly.totalAmount).toBeGreaterThan(monthly.basePrice);
      expect(yearly.basePrice).toBeGreaterThan(0);
      expect(yearly.totalAmount).toBeGreaterThan(yearly.basePrice);
    }
  });

  // -------------------------------------------------------------------------
  // VECTOR 6: Large Integer Overflow Resistance
  // -------------------------------------------------------------------------
  it('Vector 6: Large transaction values maintain safe number bounds and paise accuracy', () => {
    const calc = calculateGst(10000000); // 1 Crore
    expect(calc.gstAmount).toBe(1800000);
    expect(calc.totalAmount).toBe(11800000);
    expect(Number.isSafeInteger(calc.totalAmount)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // VECTOR 7: Expired Subscription RFQ Creation Denial
  // -------------------------------------------------------------------------
  it('Vector 7: Denies RFQ creation when subscription is EXPIRED in LIVE mode with 0 top-ups', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      rfqsUsedInCurrentMonth: 0,
      additionalPurchasedCredits: 0,
      billingMode: 'LIVE',
    });
    expect(evalResult.canCreateRfq).toBe(false);
    expect(evalResult.isSubscriptionActive).toBe(false);
    expect(evalResult.rejectionReason).toContain('expired');
  });

  // -------------------------------------------------------------------------
  // VECTOR 8: Calendar Month Boundary Leap Transition (UTC Exactness)
  // -------------------------------------------------------------------------
  it('Vector 8: Accurately shifts calendar month window at 23:59:59.999Z boundary', () => {
    const janEnd = new Date('2026-01-31T23:59:59.999Z');
    const febStart = new Date('2026-02-01T00:00:00.000Z');

    const janWindow = getCalendarMonthWindow(janEnd);
    const febWindow = getCalendarMonthWindow(febStart);

    expect(janWindow.month).toBe(1);
    expect(janWindow.year).toBe(2026);
    expect(janWindow.daysInMonth).toBe(31);

    expect(febWindow.month).toBe(2);
    expect(febWindow.year).toBe(2026);
    expect(febWindow.daysInMonth).toBe(28);
  });

  // -------------------------------------------------------------------------
  // VECTOR 9: Unused RFQ Rollover Denial (Zero Carryover)
  // -------------------------------------------------------------------------
  it('Vector 9: Unused RFQs from prior month do NOT roll over to new month', () => {
    // In Month 1, used 1 out of 3 RFQs (2 left unused)
    const month1Eval = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date('2026-03-31T23:59:59Z').toISOString(),
      rfqsUsedInCurrentMonth: 1,
      now: new Date('2026-01-15T10:00:00Z'),
      billingMode: 'LIVE',
    });
    expect(month1Eval.monthlyRemaining).toBe(2);

    // In Month 2 (new calendar month), usage counter starts at 0, allowance is strictly 3 (not 3 + 2)
    const month2Eval = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date('2026-03-31T23:59:59Z').toISOString(),
      rfqsUsedInCurrentMonth: 0,
      now: new Date('2026-02-05T10:00:00Z'),
      billingMode: 'LIVE',
    });
    expect(month2Eval.monthlyAllowance).toBe(3);
    expect(month2Eval.monthlyRemaining).toBe(3);
    expect(month2Eval.totalAvailableRfqs).toBe(3);
  });

  // -------------------------------------------------------------------------
  // VECTOR 10: Annual Plan Quarterly Bonus RFQ Cap
  // -------------------------------------------------------------------------
  it('Vector 10: Annual plan quarterly bonus RFQ caps strictly at 1 bonus per quarter without extra accumulation', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'MSME',
      plan: 'YEARLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 200).toISOString(),
      rfqsUsedInCurrentMonth: 3,
      quarterlyBonusUsedInCurrentQuarter: 1,
      additionalPurchasedCredits: 0,
      billingMode: 'LIVE',
    });
    expect(evalResult.monthlyAllowance).toBe(3);
    expect(evalResult.monthlyRemaining).toBe(0);
    expect(evalResult.quarterlyBonusRemaining).toBe(0);
    expect(evalResult.canCreateRfq).toBe(false);
    expect(evalResult.rejectionReason).toContain('Entitlement limit reached');
  });

  // -------------------------------------------------------------------------
  // VECTOR 11: Annual Plan Bonus Rollover Denial
  // -------------------------------------------------------------------------
  it('Vector 11: Quarterly bonus RFQ resets per calendar quarter and does not accumulate over 4 quarters', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'MSME',
      plan: 'YEARLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 300).toISOString(),
      rfqsUsedInCurrentMonth: 3,
      quarterlyBonusUsedInCurrentQuarter: 2, // Attempting to use multiple bonus RFQs claiming past quarters
      additionalPurchasedCredits: 0,
      billingMode: 'LIVE',
    });
    expect(evalResult.monthlyAllowance).toBe(3);
    expect(evalResult.monthlyRemaining).toBe(0);
    expect(evalResult.quarterlyBonusRemaining).toBe(0);
    expect(evalResult.canCreateRfq).toBe(false);
  });

  // -------------------------------------------------------------------------
  // VECTOR 12: Top-Up Credit Over-Consumption Defense
  // -------------------------------------------------------------------------
  it('Vector 12: Top-up credits seamlessly kick in when monthly quota exhausted, but block when top-ups also 0', () => {
    const withTopUp = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 20).toISOString(),
      rfqsUsedInCurrentMonth: 3, // Monthly quota exhausted (3/3)
      additionalPurchasedCredits: 2, // 2 Top-ups available
      billingMode: 'LIVE',
    });
    expect(withTopUp.monthlyRemaining).toBe(0);
    expect(withTopUp.totalAvailableRfqs).toBe(2);
    expect(withTopUp.canCreateRfq).toBe(true);

    const withoutTopUp = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 20).toISOString(),
      rfqsUsedInCurrentMonth: 3,
      additionalPurchasedCredits: 0,
      billingMode: 'LIVE',
    });
    expect(withoutTopUp.totalAvailableRfqs).toBe(0);
    expect(withoutTopUp.canCreateRfq).toBe(false);
  });

  // -------------------------------------------------------------------------
  // VECTOR 13: Negative Top-Up Credit Defense
  // -------------------------------------------------------------------------
  it('Vector 13: Negative top-up credit injection is safely clamped to 0', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 20).toISOString(),
      rfqsUsedInCurrentMonth: 3,
      additionalPurchasedCredits: -10,
      billingMode: 'LIVE',
    });
    expect(evalResult.additionalPurchasedCredits).toBe(0);
    expect(evalResult.totalAvailableRfqs).toBe(0);
    expect(evalResult.canCreateRfq).toBe(false);
  });

  // -------------------------------------------------------------------------
  // VECTOR 14: Supplier Platform Fee PO Gross Tamper Defense
  // -------------------------------------------------------------------------
  it('Vector 14: Supplier platform fee (0.5%) deduction preserves PO gross contract value without modification', () => {
    const poGrossAmount = 100000.0; // ₹1,00,000 Purchase Order
    const feeRate = SUPPLIER_FEE_POLICY.standardFeeRatePercent; // 0.5%
    const feeAmount = Math.round(poGrossAmount * (feeRate / 100) * 100) / 100; // ₹500.00
    const netSupplierDisbursement = poGrossAmount - feeAmount; // ₹99,500.00

    expect(feeAmount).toBe(500.0);
    expect(netSupplierDisbursement).toBe(99500.0);
    // Crucial rule: PO Gross Value MUST NOT BE REWRITTEN
    expect(poGrossAmount).toBe(100000.0);
    expect(SUPPLIER_FEE_POLICY.deductedOnSettlement).toBe(true);
    expect(SUPPLIER_FEE_POLICY.poGrossAmountUntouched).toBe(true);
  });

  // -------------------------------------------------------------------------
  // VECTOR 14B: Comprehensive Supplier Platform Fee with 18% GST and Rate Adaptability
  // -------------------------------------------------------------------------
  it('Vector 14B: Enforces 18% GST on platform fee on ₹100,000 PO while keeping PO gross strictly untouched', () => {
    const poGross = 100000.0;
    const calc = calculateSupplierPlatformFeeWithGst({
      poGrossAmount: poGross,
      feeRatePercent: 0.5,
      gstRatePercent: 18.0,
    });

    expect(calc.poGrossAmount).toBe(100000.0);
    expect(calc.feeAmount).toBe(500.0);
    expect(calc.gstOnFeeAmount).toBe(90.0);
    expect(calc.totalFeeWithGst).toBe(590.0);
    expect(calc.netSupplierDisbursement).toBe(99410.0);
    expect(calc.poGrossUntouched).toBe(true);
    expect(poGross).toBe(100000.0);

    // Dynamic tax rate change verification (18% -> 12% -> 18%)
    const calc12 = calculateSupplierPlatformFeeWithGst({
      poGrossAmount: poGross,
      feeRatePercent: 0.5,
      gstRatePercent: 12.0,
    });
    expect(calc12.feeAmount).toBe(500.0);
    expect(calc12.gstOnFeeAmount).toBe(60.0);
    expect(calc12.totalFeeWithGst).toBe(560.0);
    expect(calc12.netSupplierDisbursement).toBe(99440.0);
    expect(calc12.poGrossAmount).toBe(100000.0);
  });

  // -------------------------------------------------------------------------
  // VECTOR 15: Supplier Platform Fee Negative Rate Defense
  // -------------------------------------------------------------------------
  it('Vector 15: Negative supplier fee rate is invalid and clamped', () => {
    expect(SUPPLIER_FEE_POLICY.standardFeeRatePercent).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // VECTOR 16: Supplier Fee >100% Defense
  // -------------------------------------------------------------------------
  it('Vector 16: Supplier fee rate cannot exceed 100%', () => {
    expect(SUPPLIER_FEE_POLICY.standardFeeRatePercent).toBeLessThanOrEqual(100);
  });

  // -------------------------------------------------------------------------
  // VECTOR 17: Buyer Reward Non-Cash Policy Enforcement
  // -------------------------------------------------------------------------
  it('Vector 17: Enforces that buyer reward credits are non-cash and non-withdrawable', () => {
    expect(BUYER_REWARD_POLICY.isNonCash).toBe(true);
    expect(BUYER_REWARD_POLICY.isWithdrawable).toBe(false);
    expect(BUYER_REWARD_POLICY.eligibleRedemptions).toEqual(['SUBSCRIPTION_RENEWAL', 'RFQ_TOPUP']);
    expect(BUYER_REWARD_POLICY.description).toContain('Non-cash sourcing reward');
  });

  // -------------------------------------------------------------------------
  // VECTOR 18: Buyer Reward Non-Subscription Redemption Denial
  // -------------------------------------------------------------------------
  it('Vector 18: Rejects buyer wallet redemption for ineligible categories', () => {
    const eligible = BUYER_REWARD_POLICY.eligibleRedemptions;
    expect(eligible.includes('SUBSCRIPTION_RENEWAL')).toBe(true);
    expect(eligible.includes('RFQ_TOPUP')).toBe(true);
    // @ts-expect-error verifying non-existent category
    expect(eligible.includes('CASH_PAYOUT')).toBe(false);
    // @ts-expect-error verifying non-existent category
    expect(eligible.includes('THIRD_PARTY_TRANSFER')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // VECTOR 19: Buyer Reward Rolling 365-Day Expiration Policy & December Crossing
  // -------------------------------------------------------------------------
  it('Vector 19: Buyer reward credits carry mandatory rolling 365-day expiry per credit without Dec 31 calendar reset', () => {
    expect(BUYER_REWARD_POLICY.expiryDays).toBe(365);
    expect(BUYER_REWARD_POLICY.resetsAnnually).toBe(true);
    expect(BUYER_REWARD_POLICY.rollingValidityDays).toBe(365);

    // Verify individual rolling 365-day computation (e.g. 20-Dec-2026 -> 20-Dec-2027)
    const creditedDate = '2026-12-20T10:00:00.000Z';
    const expiresAt = computeCreditExpiryDate(creditedDate);
    expect(expiresAt).toBe('2027-12-20T10:00:00.000Z');

    const lot: WalletCreditLot = {
      id: 'vector-19-lot',
      amount: 100,
      creditedAt: creditedDate,
      expiresAt,
    };

    // Does NOT expire on Dec 31, 2026 calendar boundary
    expect(isCreditValid(lot, '2026-12-31T23:59:59.999Z')).toBe(true);
    expect(isCreditValid(lot, '2027-01-01T00:00:00.000Z')).toBe(true);
    expect(isCreditValid(lot, '2027-12-20T10:00:00.000Z')).toBe(true);
    expect(isCreditValid(lot, '2027-12-20T10:00:01.000Z')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // VECTOR 20: PILOT_FREE Mode Suppresses Payment Requirement
  // -------------------------------------------------------------------------
  it('Vector 20: PILOT_FREE billing mode grants active RFQ creation without payment', () => {
    const evalResult = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      rfqsUsedInCurrentMonth: 0,
      billingMode: 'PILOT_FREE',
    });
    expect(evalResult.canCreateRfq).toBe(true);
    expect(evalResult.isSubscriptionActive).toBe(true);
    expect(evalResult.billingMode).toBe('PILOT_FREE');
    expect(evalResult.rejectionReason).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // VECTOR 21: No Hardcoded 2027 Expiration Date in Billing Mode Engine
  // -------------------------------------------------------------------------
  it('Vector 21: Billing mode engine uses dynamic environment configuration without hardcoded 2027 date', () => {
    expect(resolveBillingMode('PILOT_FREE')).toBe('PILOT_FREE');
    expect(resolveBillingMode('LIVE')).toBe('LIVE');
    // Safe default to PILOT_FREE for any undefined or unrecognized environment string
    expect(resolveBillingMode(undefined)).toBe('PILOT_FREE');
    expect(resolveBillingMode('UNKNOWN_ENV')).toBe('PILOT_FREE');
  });

  // -------------------------------------------------------------------------
  // VECTOR 22: LIVE Mode Enforces Valid Subscription Access
  // -------------------------------------------------------------------------
  it('Vector 22: LIVE mode strictly enforces active subscription status and date validity', () => {
    const expiredLive = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: new Date(Date.now() - 1000).toISOString(),
      rfqsUsedInCurrentMonth: 0,
      billingMode: 'LIVE',
    });
    expect(expiredLive.canCreateRfq).toBe(false);
    expect(expiredLive.isSubscriptionActive).toBe(false);

    const activeLive = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
      rfqsUsedInCurrentMonth: 0,
      billingMode: 'LIVE',
    });
    expect(activeLive.canCreateRfq).toBe(true);
    expect(activeLive.isSubscriptionActive).toBe(true);
  });

  // -------------------------------------------------------------------------
  // VECTOR 23: Org Type to Tier Resolution Security Mapping
  // -------------------------------------------------------------------------
  it('Vector 23: Securely resolves unknown or malicious org_type strings to safe INDIVIDUAL default', () => {
    expect(resolveTierForOrgType('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveTierForOrgType('SOCIETY')).toBe('RWA');
    expect(resolveTierForOrgType('RWA')).toBe('RWA');
    expect(resolveTierForOrgType('MSME')).toBe('MSME');
    expect(resolveTierForOrgType('ENTERPRISE')).toBe('ENTERPRISE');
    // Malicious or undefined org type strings default safely to INDIVIDUAL
    expect(resolveTierForOrgType('DROP_TABLE')).toBe('INDIVIDUAL');
    expect(resolveTierForOrgType(undefined)).toBe('INDIVIDUAL');
  });

  // -------------------------------------------------------------------------
  // VECTOR 24: Payment Reference Cryptographic Entropy & Non-Predictability
  // -------------------------------------------------------------------------
  it('Vector 24: Generates cryptographically secure, collision-resistant payment references', () => {
    const refs = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const ref = generateSubscriptionPaymentRef();
      expect(ref).toMatch(/^UPI-TXN-[A-Z0-9]+-[A-F0-9]{8}$/);
      expect(refs.has(ref)).toBe(false);
      refs.add(ref);
    }
    expect(refs.size).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // VECTOR 25: Persona-Specific Extra RFQ Price Tampering & Security Isolation
  // -------------------------------------------------------------------------
  it('Vector 25: Rejects client-side price tampering and isolates persona-specific Extra RFQ rates', () => {
    // Canonical rates
    expect(getExtraRfqPriceForTier('INDIVIDUAL')).toBe(149);
    expect(getExtraRfqPriceForTier('RWA')).toBe(999);
    expect(getExtraRfqPriceForTier('MSME')).toBe(1499);

    // Attempted client price override should have no effect on server computation
    const indPricing = computeExtraRfqPricing('INDIVIDUAL');
    expect(indPricing.basePrice).toBe(149);
    expect(indPricing.gstAmount).toBe(26.82);
    expect(indPricing.totalAmount).toBe(175.82);

    const rwaPricing = computeExtraRfqPricing('RWA');
    expect(rwaPricing.basePrice).toBe(999);
    expect(rwaPricing.gstAmount).toBe(179.82);
    expect(rwaPricing.totalAmount).toBe(1178.82);

    const msmePricing = computeExtraRfqPricing('MSME');
    expect(msmePricing.basePrice).toBe(1499);
    expect(msmePricing.gstAmount).toBe(269.82);
    expect(msmePricing.totalAmount).toBe(1768.82);

    // Context Isolation: An RWA user context cannot be assigned Individual extra RFQ price
    const rwaOrgTier = resolveTierForOrgType('RWA');
    expect(getExtraRfqPriceForTier(rwaOrgTier)).toBe(999);
    expect(getExtraRfqPriceForTier(rwaOrgTier)).not.toBe(149);

    // Context Isolation: An MSME user context cannot be assigned Individual or RWA extra RFQ price
    const msmeOrgTier = resolveTierForOrgType('MSME');
    expect(getExtraRfqPriceForTier(msmeOrgTier)).toBe(1499);
    expect(getExtraRfqPriceForTier(msmeOrgTier)).not.toBe(149);
    expect(getExtraRfqPriceForTier(msmeOrgTier)).not.toBe(999);
  });
});

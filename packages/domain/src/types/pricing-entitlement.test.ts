import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
  ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
  BUYER_REWARD_POLICY,
  DEFAULT_GST_RATE_PERCENT,
  OTP_GST_RATE,
  DEFAULT_SUPPLIER_PLATFORM_FEE_RATE,
  PILOT_COHORT_COPY,
  PERSONA_EXTRA_RFQ_PRICES,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  SUBSCRIPTION_TIERS,
  SUPPLIER_FEE_POLICY,
  WHY_5_RFQS_EXPLANATION,
  calculateGst,
  calculateSupplierPlatformFeeWithGst,
  computeSubscriptionPricing,
  computeExtraRfqPricing,
  evaluateRfqEntitlement,
  getCalendarMonthWindow,
  getCalendarQuarterWindow,
  getExtraRfqPriceForTier,
  resolveBillingMode,
  resolveTierForOrgType,
} from './pricing-entitlement';

describe('OTP Platform Pricing & Entitlement Domain Engine', () => {
  describe('Subscription Tiers & Price Matrix', () => {
    it('enforces canonical Individual tier pricing: ₹199/mo, ₹1,999/yr, 3 RFQs/mo (1 quarterly bonus on annual, Extra RFQ: ₹149)', () => {
      const tier = SUBSCRIPTION_TIERS.INDIVIDUAL;
      expect(tier.monthlyPrice).toBe(199);
      expect(tier.yearlyPrice).toBe(1999);
      expect(tier.monthlyRfqs).toBe(3);
      expect(tier.quarterlyBonusRfqs).toBe(1);
      expect(tier.yearlySavings).toBe(389);
      expect(tier.additionalRfqPrice).toBe(149);
      expect(getExtraRfqPriceForTier('INDIVIDUAL')).toBe(149);
    });

    it('enforces canonical RWA tier pricing: ₹1,499/mo, ₹14,999/yr, 3 RFQs/mo (1 quarterly bonus on annual, Extra RFQ: ₹999)', () => {
      const tier = SUBSCRIPTION_TIERS.RWA;
      expect(tier.monthlyPrice).toBe(1499);
      expect(tier.yearlyPrice).toBe(14999);
      expect(tier.monthlyRfqs).toBe(3);
      expect(tier.yearlyMonthlyRfqs).toBe(3);
      expect(tier.quarterlyBonusRfqs).toBe(1);
      expect(tier.yearlySavings).toBe(2989);
      expect(tier.additionalRfqPrice).toBe(999);
      expect(tier.popular).toBe(true);
      expect(getExtraRfqPriceForTier('RWA')).toBe(999);
    });

    it('enforces canonical MSME tier pricing: ₹1,999/mo, ₹19,999/yr, 3 RFQs/mo (1 quarterly bonus on annual, Extra RFQ: ₹1,499)', () => {
      const tier = SUBSCRIPTION_TIERS.MSME;
      expect(tier.monthlyPrice).toBe(1999);
      expect(tier.yearlyPrice).toBe(19999);
      expect(tier.monthlyRfqs).toBe(3);
      expect(tier.yearlyMonthlyRfqs).toBe(3);
      expect(tier.quarterlyBonusRfqs).toBe(1);
      expect(tier.yearlySavings).toBe(3989);
      expect(tier.additionalRfqPrice).toBe(1499);
      expect(getExtraRfqPriceForTier('MSME')).toBe(1499);
    });

    it('enforces canonical Enterprise tier pricing: From ₹4,999/mo, From ₹49,999/yr', () => {
      const tier = SUBSCRIPTION_TIERS.ENTERPRISE;
      expect(tier.monthlyPrice).toBe(4999);
      expect(tier.yearlyPrice).toBe(49999);
      expect(tier.monthlyRfqs).toBe(3);
      expect(tier.yearlySavings).toBe(9989);
      expect(tier.additionalRfqPrice).toBe(1499);
    });

    it('maps buyer organization types to the correct canonical tiers', () => {
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
      expect(resolveTierForOrgType('')).toBe('INDIVIDUAL');
    });
  });

  describe('GST Decimal-Safe Precision Arithmetic', () => {
    it('computes exact GST on Individual monthly plan (₹199.00 -> GST ₹35.82, Total ₹234.82)', () => {
      const res = calculateGst(199);
      expect(res.basePrice).toBe(199.0);
      expect(res.gstRatePercent).toBe(18.0);
      expect(res.gstAmount).toBe(35.82);
      expect(res.totalAmount).toBe(234.82);
    });

    it('computes exact GST on Individual Extra RFQ Top-up (₹149.00 -> GST ₹26.82, Total ₹175.82)', () => {
      const res = calculateGst(149);
      expect(res.basePrice).toBe(149.0);
      expect(res.gstAmount).toBe(26.82);
      expect(res.totalAmount).toBe(175.82);

      const computed = computeExtraRfqPricing('INDIVIDUAL');
      expect(computed.basePrice).toBe(149.0);
      expect(computed.gstAmount).toBe(26.82);
      expect(computed.totalAmount).toBe(175.82);
    });

    it('computes exact GST on RWA Extra RFQ Top-up (₹999.00 -> GST ₹179.82, Total ₹1,178.82)', () => {
      const res = calculateGst(999);
      expect(res.basePrice).toBe(999.0);
      expect(res.gstAmount).toBe(179.82);
      expect(res.totalAmount).toBe(1178.82);

      const computed = computeExtraRfqPricing('RWA');
      expect(computed.basePrice).toBe(999.0);
      expect(computed.gstAmount).toBe(179.82);
      expect(computed.totalAmount).toBe(1178.82);
    });

    it('computes exact GST on MSME Extra RFQ Top-up (₹1,499.00 -> GST ₹269.82, Total ₹1,768.82)', () => {
      const res = calculateGst(1499);
      expect(res.basePrice).toBe(1499.0);
      expect(res.gstAmount).toBe(269.82);
      expect(res.totalAmount).toBe(1768.82);

      const computed = computeExtraRfqPricing('MSME');
      expect(computed.basePrice).toBe(1499.0);
      expect(computed.gstAmount).toBe(269.82);
      expect(computed.totalAmount).toBe(1768.82);
    });

    it('computes exact GST on RWA monthly plan (₹1,499.00 -> GST ₹269.82, Total ₹1,768.82)', () => {
      const res = calculateGst(1499);
      expect(res.basePrice).toBe(1499.0);
      expect(res.gstAmount).toBe(269.82);
      expect(res.totalAmount).toBe(1768.82);
    });

    it('computes exact GST on MSME monthly / Individual yearly plan (₹1,999.00 -> GST ₹359.82, Total ₹2,358.82)', () => {
      const res = calculateGst(1999);
      expect(res.basePrice).toBe(1999.0);
      expect(res.gstAmount).toBe(359.82);
      expect(res.totalAmount).toBe(2358.82);
    });

    it('computes exact GST on RWA yearly plan (₹14,999.00 -> GST ₹2,699.82, Total ₹17,698.82)', () => {
      const res = calculateGst(14999);
      expect(res.basePrice).toBe(14999.0);
      expect(res.gstAmount).toBe(2699.82);
      expect(res.totalAmount).toBe(17698.82);
    });

    it('computes exact GST on MSME yearly plan (₹19,999.00 -> GST ₹3,599.82, Total ₹23,598.82)', () => {
      const res = calculateGst(19999);
      expect(res.basePrice).toBe(19999.0);
      expect(res.gstAmount).toBe(3599.82);
      expect(res.totalAmount).toBe(23598.82);
    });

    it('computes exact GST on Enterprise yearly plan (₹49,999.00 -> GST ₹8,999.82, Total ₹58,998.82)', () => {
      const res = calculateGst(49999);
      expect(res.basePrice).toBe(49999.0);
      expect(res.gstAmount).toBe(8999.82);
      expect(res.totalAmount).toBe(58998.82);
    });

    it('verifies OTP_GST_RATE authoritative constant equals 18%', () => {
      expect(OTP_GST_RATE).toBe(18.0);
      expect(DEFAULT_GST_RATE_PERCENT).toBe(18.0);
      expect(OTP_GST_RATE).toBe(DEFAULT_GST_RATE_PERCENT);
    });

    it('supports custom GST tax rate overrides safely', () => {
      const res0 = calculateGst(1000, 0);
      expect(res0.gstAmount).toBe(0);
      expect(res0.totalAmount).toBe(1000);

      const res12 = calculateGst(1000, 12);
      expect(res12.gstAmount).toBe(120);
      expect(res12.totalAmount).toBe(1120);
    });

    it('verifies dynamic GST tax rate change from 18% to 12% and back without code redesign', () => {
      const basePrice = 1999;
      // Default configured rate (18%)
      const res18 = calculateGst(basePrice, OTP_GST_RATE);
      expect(res18.gstRatePercent).toBe(18.0);
      expect(res18.gstAmount).toBe(359.82);
      expect(res18.totalAmount).toBe(2358.82);

      // Dynamically simulated statutory rate change to 12%
      const statutoryRateUpdate = 12.0;
      const resUpdated = calculateGst(basePrice, statutoryRateUpdate);
      expect(resUpdated.gstRatePercent).toBe(12.0);
      expect(resUpdated.gstAmount).toBe(239.88);
      expect(resUpdated.totalAmount).toBe(2238.88);

      // Restores to standard 18%
      const resRestored = calculateGst(basePrice, OTP_GST_RATE);
      expect(resRestored.gstRatePercent).toBe(18.0);
      expect(resRestored.gstAmount).toBe(359.82);
      expect(resRestored.totalAmount).toBe(2358.82);
    });

    it('handles zero and negative amounts safely', () => {
      const resZero = calculateGst(0);
      expect(resZero.basePrice).toBe(0);
      expect(resZero.gstAmount).toBe(0);
      expect(resZero.totalAmount).toBe(0);

      const resNeg = calculateGst(-500);
      expect(resNeg.basePrice).toBe(0);
      expect(resNeg.gstAmount).toBe(0);
      expect(resNeg.totalAmount).toBe(0);
    });
  });

  describe('computeSubscriptionPricing', () => {
    it('computes full pricing breakdown for RWA monthly and yearly cycles', () => {
      const monthly = computeSubscriptionPricing('RWA', 'MONTHLY');
      expect(monthly.basePrice).toBe(1499);
      expect(monthly.gstAmount).toBe(269.82);
      expect(monthly.totalAmount).toBe(1768.82);
      expect(monthly.monthlyRfqQuota).toBe(3);
      expect(monthly.durationDays).toBe(30);

      const yearly = computeSubscriptionPricing('RWA', 'YEARLY');
      expect(yearly.basePrice).toBe(14999);
      expect(yearly.gstAmount).toBe(2699.82);
      expect(yearly.totalAmount).toBe(17698.82);
      expect(yearly.monthlyRfqQuota).toBe(3);
      expect(yearly.durationDays).toBe(365);
      expect(yearly.savings).toBe(2989);
    });
  });

  describe('Calendar Month Entitlement Engine', () => {
    it('correctly calculates calendar month boundaries (start of month 00:00:00 to end 23:59:59)', () => {
      const feb2026 = getCalendarMonthWindow('2026-02-15T10:00:00Z');
      expect(feb2026.year).toBe(2026);
      expect(feb2026.month).toBe(2);
      expect(feb2026.daysInMonth).toBe(28);
      expect(feb2026.startIso).toBe('2026-02-01T00:00:00.000Z');
      expect(feb2026.endIso).toBe('2026-02-28T23:59:59.999Z');
      expect(feb2026.label).toBe('February 2026');

      const sep2026 = getCalendarMonthWindow('2026-09-22T08:00:00Z');
      expect(sep2026.year).toBe(2026);
      expect(sep2026.month).toBe(9);
      expect(sep2026.daysInMonth).toBe(30);
      expect(sep2026.startIso).toBe('2026-09-01T00:00:00.000Z');
      expect(sep2026.endIso).toBe('2026-09-30T23:59:59.999Z');
    });

    it('grants 3 RFQs per calendar month on active monthly subscription', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-31T23:59:59Z',
        rfqsUsedInCurrentMonth: 1,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });

      expect(res.monthlyAllowance).toBe(3);
      expect(res.rfqsUsedInCurrentMonth).toBe(1);
      expect(res.monthlyRemaining).toBe(2);
      expect(res.totalAvailableRfqs).toBe(2);
      expect(res.canCreateRfq).toBe(true);
      expect(res.isBonusApplied).toBe(false);
    });

    it('grants 3 RFQs per calendar month + 1 quarterly bonus on annual RWA subscription', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'RWA',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-08-31T23:59:59Z',
        rfqsUsedInCurrentMonth: 2,
        quarterlyBonusUsedInCurrentQuarter: 0,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });

      expect(res.monthlyAllowance).toBe(3);
      expect(res.rfqsUsedInCurrentMonth).toBe(2);
      expect(res.monthlyRemaining).toBe(1);
      expect(res.quarterlyBonusAllowance).toBe(1);
      expect(res.quarterlyBonusRemaining).toBe(1);
      expect(res.totalAvailableRfqs).toBe(2);
      expect(res.canCreateRfq).toBe(true);
      expect(res.isBonusApplied).toBe(true);
    });

    it('blocks RFQ creation when monthly quota is exhausted (3/3 used) with persona-specific extra RFQ top-up price in rejection reason', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'RWA',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-15T23:59:59Z',
        rfqsUsedInCurrentMonth: 3,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-20T12:00:00Z',
      });

      expect(res.monthlyRemaining).toBe(0);
      expect(res.totalAvailableRfqs).toBe(0);
      expect(res.canCreateRfq).toBe(false);
      expect(res.rejectionReason).toContain('Entitlement limit reached');
      expect(res.rejectionReason).toContain('₹999 + GST');

      const indRes = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-15T23:59:59Z',
        rfqsUsedInCurrentMonth: 3,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-20T12:00:00Z',
      });
      expect(indRes.rejectionReason).toContain('₹149 + GST');

      const msmeRes = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-15T23:59:59Z',
        rfqsUsedInCurrentMonth: 3,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-20T12:00:00Z',
      });
      expect(msmeRes.rejectionReason).toContain('₹1,499 + GST');
    });

    it('allows RFQ creation via additional top-up credits when monthly quota is exhausted', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'INDIVIDUAL',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-10-15T23:59:59Z',
        rfqsUsedInCurrentMonth: 3,
        additionalPurchasedCredits: 2, // 2 top-ups purchased
        billingMode: 'LIVE',
        now: '2026-09-20T12:00:00Z',
      });

      expect(res.monthlyRemaining).toBe(0);
      expect(res.additionalPurchasedCredits).toBe(2);
      expect(res.totalAvailableRfqs).toBe(2);
      expect(res.canCreateRfq).toBe(true);
    });

    it('enforces calendar-month reset with zero rollover of unused quota', () => {
      // In September: 1 RFQ used out of 3 (2 unused)
      const sepRes = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-12-31T23:59:59Z',
        rfqsUsedInCurrentMonth: 1,
        billingMode: 'LIVE',
        now: '2026-09-30T23:00:00Z',
      });
      expect(sepRes.monthlyRemaining).toBe(2);

      // In October: Month resets, rfqsUsed is 0, allowance is strictly 3 (not 3 + 2)
      const octRes = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2026-12-31T23:59:59Z',
        rfqsUsedInCurrentMonth: 0,
        billingMode: 'LIVE',
        now: '2026-10-01T00:01:00Z',
      });
      expect(octRes.monthlyAllowance).toBe(3);
      expect(octRes.monthlyRemaining).toBe(3);
      expect(octRes.totalAvailableRfqs).toBe(3);
    });

    it('blocks RFQ creation when subscription is expired and zero top-up credits exist', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'EXPIRED',
        subscriptionExpiresAt: '2026-08-01T00:00:00Z',
        rfqsUsedInCurrentMonth: 0,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });

      expect(res.isSubscriptionActive).toBe(false);
      expect(res.canCreateRfq).toBe(false);
      expect(res.rejectionReason).toContain('Prepaid subscription plan has expired');
    });

    it('enforces that quarterly bonuses on annual plans are consumed before paid extra RFQ top-up is needed', () => {
      // Annual MSME subscriber with 3 monthly quota and 1 quarterly bonus
      // Step 1: Use 3 monthly quota
      const res3 = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-01T00:00:00Z',
        rfqsUsedInCurrentMonth: 3,
        quarterlyBonusUsedInCurrentQuarter: 0,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });
      // Monthly remaining is 0, but quarterly bonus is 1 remaining, so total available is 1 and can create RFQ
      expect(res3.monthlyRemaining).toBe(0);
      expect(res3.quarterlyBonusRemaining).toBe(1);
      expect(res3.totalAvailableRfqs).toBe(1);
      expect(res3.canCreateRfq).toBe(true);

      // Step 2: Use quarterly bonus (1/1 used)
      const res4 = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'YEARLY',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: '2027-09-01T00:00:00Z',
        rfqsUsedInCurrentMonth: 3,
        quarterlyBonusUsedInCurrentQuarter: 1,
        additionalPurchasedCredits: 0,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });
      expect(res4.monthlyRemaining).toBe(0);
      expect(res4.quarterlyBonusRemaining).toBe(0);
      expect(res4.totalAvailableRfqs).toBe(0);
      expect(res4.canCreateRfq).toBe(false);
      expect(res4.rejectionReason).toContain('₹1,499 + GST');
    });

    it('allows RFQ creation using purchased top-up credits even if subscription has expired', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'MSME',
        plan: 'MONTHLY',
        subscriptionStatus: 'EXPIRED',
        subscriptionExpiresAt: '2026-08-01T00:00:00Z',
        rfqsUsedInCurrentMonth: 0,
        additionalPurchasedCredits: 3,
        billingMode: 'LIVE',
        now: '2026-09-15T12:00:00Z',
      });

      expect(res.isSubscriptionActive).toBe(false);
      expect(res.additionalPurchasedCredits).toBe(3);
      expect(res.totalAvailableRfqs).toBe(3);
      expect(res.canCreateRfq).toBe(true);
    });
  });

  describe('Billing Mode Engine (PILOT_FREE vs LIVE)', () => {
    it('resolves billing mode with fail-safe default', () => {
      expect(resolveBillingMode('PILOT_FREE')).toBe('PILOT_FREE');
      expect(resolveBillingMode('pilot')).toBe('PILOT_FREE');
      expect(resolveBillingMode('LIVE')).toBe('LIVE');
      expect(resolveBillingMode('live')).toBe('LIVE');
      expect(resolveBillingMode(undefined)).toBe('PILOT_FREE');
      expect(resolveBillingMode(null)).toBe('PILOT_FREE');
      expect(resolveBillingMode('UNKNOWN')).toBe('PILOT_FREE');
    });

    it('grants active sourcing entitlement in PILOT_FREE mode without requiring payment verification', () => {
      const res = evaluateRfqEntitlement({
        tierId: 'RWA',
        plan: 'MONTHLY',
        subscriptionStatus: 'EXPIRED',
        subscriptionExpiresAt: '2025-01-01T00:00:00Z',
        rfqsUsedInCurrentMonth: 1,
        billingMode: 'PILOT_FREE',
        now: '2026-09-22T08:00:00Z',
      });

      expect(res.billingMode).toBe('PILOT_FREE');
      expect(res.isSubscriptionActive).toBe(true); // Active due to pilot mode
      expect(res.monthlyRemaining).toBe(2);
      expect(res.canCreateRfq).toBe(true);
    });
  });

  describe('Policy Disclosures & Governance Invariants', () => {
    it('provides clear customer-facing "Why 5 RFQs?" explanation without internal jargon', () => {
      expect(WHY_5_RFQS_EXPLANATION.title).toBe('Why 5 RFQs Per Month?');
      expect(WHY_5_RFQS_EXPLANATION.points.length).toBeGreaterThanOrEqual(4);
      expect(WHY_5_RFQS_EXPLANATION.summary).toContain('high-intent requirements');
    });

    it('enforces 0.5% supplier platform fee policy deducted only upon settlement', () => {
      expect(SUPPLIER_FEE_POLICY.feeRatePercent).toBe(DEFAULT_SUPPLIER_PLATFORM_FEE_RATE);
      expect(SUPPLIER_FEE_POLICY.feeRatePercent).toBe(0.5);
      expect(SUPPLIER_FEE_POLICY.description).toContain('deducted on settlement from final bilateral disbursements');
      expect(SUPPLIER_FEE_POLICY.description).toContain('Purchase Order gross contract value is never altered');
    });

    it('calculates supplier platform fee on ₹100,000 PO: Fee = ₹500, GST on fee (18%) = ₹90, Total deduction = ₹590, PO gross = ₹100,000 untouched', () => {
      const calc = calculateSupplierPlatformFeeWithGst({
        poGrossAmount: 100000,
        feeRatePercent: 0.5,
        gstRatePercent: 18,
      });

      expect(calc.poGrossAmount).toBe(100000.0);
      expect(calc.feeRatePercent).toBe(0.5);
      expect(calc.feeAmount).toBe(500.0);
      expect(calc.gstRatePercent).toBe(18.0);
      expect(calc.gstOnFeeAmount).toBe(90.0);
      expect(calc.totalFeeWithGst).toBe(590.0);
      expect(calc.netSupplierDisbursement).toBe(99410.0);
      expect(calc.poGrossUntouched).toBe(true);

      // Verify mathematical conservation: netSupplierDisbursement + totalFeeWithGst === poGrossAmount
      expect(calc.netSupplierDisbursement + calc.totalFeeWithGst).toBe(100000.0);
    });

    it('supports dynamic GST tax rate changes on supplier platform fee calculations', () => {
      // At 18% GST on 0.5% fee
      const calc18 = calculateSupplierPlatformFeeWithGst({ poGrossAmount: 100000, feeRatePercent: 0.5, gstRatePercent: 18 });
      expect(calc18.feeAmount).toBe(500.0);
      expect(calc18.gstOnFeeAmount).toBe(90.0);
      expect(calc18.totalFeeWithGst).toBe(590.0);

      // At 12% GST on 0.5% fee
      const calc12 = calculateSupplierPlatformFeeWithGst({ poGrossAmount: 100000, feeRatePercent: 0.5, gstRatePercent: 12 });
      expect(calc12.feeAmount).toBe(500.0);
      expect(calc12.gstOnFeeAmount).toBe(60.0);
      expect(calc12.totalFeeWithGst).toBe(560.0);
      expect(calc12.netSupplierDisbursement).toBe(99440.0);
      expect(calc12.poGrossAmount).toBe(100000.0);
    });

    it('enforces non-cash Buyer Reward & Wallet rules without leaking internal percentages', () => {
      expect(BUYER_REWARD_POLICY.publicDescription).not.toContain('0.1%');
      expect(BUYER_REWARD_POLICY.publicDescription).toContain('OTP Wallet Credits');
      expect(BUYER_REWARD_POLICY.walletRules).toContain(
        'Non-Cash Asset: Credits have no cash withdrawal value and cannot be transferred.',
      );
    });

    it('provides friendly pilot cohort copy without exposing internal config variables', () => {
      expect(PILOT_COHORT_COPY.badge).toBe('Platform Pilot Active');
      expect(PILOT_COHORT_COPY.body).not.toMatch(/VITE_|PROCESS\.ENV|SUPABASE|RPC/i);
    });
  });
});

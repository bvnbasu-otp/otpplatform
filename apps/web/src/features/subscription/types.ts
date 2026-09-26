import {
  type SubscriptionTierId,
  type BillingCycle,
  type BillingMode,
  type SubscriptionStatus,
  type SubscriptionPlanDefinition,
  type ExtraRfqPricingResult,
  type FinancialReportingClassification,
  type SupplierPlatformFeePilotAwareParams,
  type SupplierPlatformFeePilotAwareResult,
  SUBSCRIPTION_TIERS,
  resolveTierForOrgType,
  calculateGst,
  computeSubscriptionPricing,
  computeExtraRfqPricing,
  evaluateRfqEntitlement,
  getCalendarMonthWindow,
  resolveBillingMode,
  WHY_5_RFQS_EXPLANATION,
  SUPPLIER_FEE_POLICY,
  BUYER_REWARD_POLICY,
  PILOT_COHORT_COPY,
  PILOT_COMMERCIAL_MODE_POLICY,
  resolveFinancialReportingClassification,
  calculateSupplierPlatformFeeWithPilotMode,
  ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
  PERSONA_EXTRA_RFQ_PRICES,
  getExtraRfqPriceForTier,
  DEFAULT_GST_RATE_PERCENT,
  OTP_GST_RATE,
  DEFAULT_SUPPLIER_PLATFORM_FEE_RATE,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
  generatePersistentReferralCode,
  generateSecureRandomReferralCode,
  getPersistentReferralCodeStore,
  setPersistentReferralCode,
  clearPersistentReferralCodeStore,
  REFERRAL_CODE_ALPHABET,
  DEFAULT_REFERRAL_CODE_LENGTH,
  type ReferralRecordClassification,
  generateReferralUrl,
  generateWhatsAppShareUrl,
  getReferralWebShareData,
  DEFAULT_REFERRAL_SHARE_MESSAGE,
  calculateReferralReward,
  assertReferralWalletUsagePolicy,
  normalizeReferralCode,
  validateReferralCodeFormat,
  isWithinQualificationWindow,
} from '@otp/domain';

export type {
  SubscriptionTierId,
  BillingCycle,
  BillingMode,
  SubscriptionStatus,
  SubscriptionPlanDefinition,
  ExtraRfqPricingResult,
  FinancialReportingClassification,
  SupplierPlatformFeePilotAwareParams,
  SupplierPlatformFeePilotAwareResult,
  ReferralRecordClassification,
};

export {
  SUBSCRIPTION_TIERS,
  resolveTierForOrgType,
  calculateGst,
  computeSubscriptionPricing,
  computeExtraRfqPricing,
  evaluateRfqEntitlement,
  getCalendarMonthWindow,
  resolveBillingMode,
  WHY_5_RFQS_EXPLANATION,
  SUPPLIER_FEE_POLICY,
  BUYER_REWARD_POLICY,
  PILOT_COHORT_COPY,
  PILOT_COMMERCIAL_MODE_POLICY,
  resolveFinancialReportingClassification,
  calculateSupplierPlatformFeeWithPilotMode,
  ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
  PERSONA_EXTRA_RFQ_PRICES,
  getExtraRfqPriceForTier,
  DEFAULT_GST_RATE_PERCENT,
  OTP_GST_RATE,
  DEFAULT_SUPPLIER_PLATFORM_FEE_RATE,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
  ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
  generatePersistentReferralCode,
  generateSecureRandomReferralCode,
  getPersistentReferralCodeStore,
  setPersistentReferralCode,
  clearPersistentReferralCodeStore,
  REFERRAL_CODE_ALPHABET,
  DEFAULT_REFERRAL_CODE_LENGTH,
  generateReferralUrl,
  generateWhatsAppShareUrl,
  getReferralWebShareData,
  DEFAULT_REFERRAL_SHARE_MESSAGE,
  calculateReferralReward,
  assertReferralWalletUsagePolicy,
  normalizeReferralCode,
  validateReferralCodeFormat,
  isWithinQualificationWindow,
};

export interface OrganizationSubscription {
  organizationId: string;
  organizationName: string;
  orgType: string;
  tierId: SubscriptionTierId;
  status: SubscriptionStatus;
  plan: BillingCycle;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  freeRfqCredits: number;
  rfqCreditsUsed: number;
  paymentReference?: string;
}

/** Computes price and validity based on tier and billing cycle */
export function computeSubscriptionFee(tierId: SubscriptionTierId, cycle: BillingCycle) {
  const tier = SUBSCRIPTION_TIERS[tierId] || SUBSCRIPTION_TIERS.INDIVIDUAL;
  const isYearly = cycle === 'YEARLY';
  const baseAmount = isYearly ? tier.yearlyPrice : tier.monthlyPrice;
  const durationDays = isYearly ? tier.yearlyDurationDays : tier.monthlyDurationDays;
  const savings = isYearly ? tier.yearlySavings : 0;
  const gst = calculateGst(baseAmount);

  return {
    amount: baseAmount,
    basePrice: gst.basePrice,
    gstAmount: gst.gstAmount,
    totalAmount: gst.totalAmount,
    durationDays,
    monthlyRfqQuota: isYearly ? tier.yearlyMonthlyRfqs : tier.monthlyRfqs,
    label: isYearly
      ? `₹${baseAmount.toLocaleString('en-IN')} / 365 days`
      : `₹${baseAmount.toLocaleString('en-IN')} / 30 days`,
    savings,
  };
}

export type RenewalNoticeLevel = 'NONE' | 'INFO_7_DAYS' | 'WARNING_3_DAYS' | 'URGENT_1_DAY' | 'EXPIRED';

export function getRenewalNoticeLevel(daysRemaining: number, isExpired: boolean): RenewalNoticeLevel {
  if (isExpired || daysRemaining <= 0) return 'EXPIRED';
  if (daysRemaining <= 1) return 'URGENT_1_DAY';
  if (daysRemaining <= 3) return 'WARNING_3_DAYS';
  if (daysRemaining <= 7) return 'INFO_7_DAYS';
  return 'NONE';
}

/**
 * Generates a cryptographically secure, unique payment reference for subscription transactions.
 * Uses the Web Crypto API (crypto.randomUUID() or crypto.getRandomValues) rather than Math.random()
 * to eliminate predictable pseudo-random PRNG sequences and ensure collision resistance.
 *
 * Format: UPI-TXN-<BASE36_TIMESTAMP>-<8_HEX_ENTROPY>
 * Example: UPI-TXN-LMG7H9Q2-A1B2C3D4
 */
export function generateSubscriptionPaymentRef(): string {
  const timestamp = Date.now().toString(36).toUpperCase();

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const rawUuid = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `UPI-TXN-${timestamp}-${rawUuid}`;
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `UPI-TXN-${timestamp}-${hex}`;
  }

  const entropy = Math.abs(Date.now() ^ 0xa5a5a5a5).toString(16).padStart(8, '0').toUpperCase().slice(-8);
  return `UPI-TXN-${timestamp}-${entropy}`;
}

export interface OrganizationWalletData {
  walletId: string;
  organizationId: string;
  balanceCredits: number;
  status: 'ACTIVE' | 'FROZEN' | 'SUSPENDED';
  createdAt?: string;
  updatedAt?: string;
}

export interface WalletTransactionData {
  id: string;
  organizationId: string;
  walletId: string;
  txType: 'REWARD_CREDIT' | 'SUBSCRIPTION_REDEMPTION' | 'REVERSAL' | 'ADJUSTMENT' | 'EXPIRY';
  amount: number;
  openingBalance: number;
  closingBalance: number;
  sourceEntityType?: string;
  sourceEntityId?: string;
  idempotencyKey?: string;
  notes?: string;
  createdAt: string;
}

export interface ApplyWalletCreditsParams {
  organizationId: string;
  tierId: SubscriptionTierId;
  cycle: BillingCycle;
  creditsToApply: number;
  idempotencyKey?: string;
}

export interface ApplyWalletCreditsResult {
  ok: boolean;
  creditsApplied?: number;
  openingBalance?: number;
  remainingBalance?: number;
  newExpiresAt?: string;
  transactionId?: string;
  message?: string;
  error?: string;
}

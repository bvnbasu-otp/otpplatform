/**
 * OTP Platform — Referral, Incentive & Growth Domain Engine
 * Stage R2-27: Referral, Growth, Product Completeness & Fresh-Start Invariants
 *
 * NON-NEGOTIABLE CORE RULES:
 * 1. 10% Referral Reward Rule: Reward is calculated strictly as 10% of the actual
 *    first successful subscription payment made by the referred buyer account.
 * 2. Persistent Referral Code: Deterministic, persistent referral code per referrer.
 * 3. 30-Day Qualification Window: The referred buyer must complete their first
 *    successful subscription payment within 30 calendar days of attribution.
 * 4. Idempotent & Fraud-Proof:
 *    - Zero self-referral (strict identity/account check).
 *    - Zero duplicate attribution (first attribution wins, one referrer per account).
 *    - Strictly first successful payment only (no recurring or second payment rewards).
 * 5. Referral Wallet Restriction:
 *    - Referral rewards are non-cash incentive credits deposited into the buyer's wallet.
 *    - Strictly restricted to OTP platform subscription purchase, renewal, and RFQ top-ups.
 *    - Zero cash withdrawal, zero GMV / supplier payment mixing (financial segregation).
 */

export const REFERRAL_REWARD_PERCENTAGE = 10.0; // 10%
export const REFERRAL_QUALIFICATION_WINDOW_DAYS = 30; // 30 Calendar Days
export const REFERRAL_CODE_PREFIX = 'OTP';

export type ReferralAttributionStatus =
  | 'ATTRIBUTED'
  | 'QUALIFIED'
  | 'REWARDED'
  | 'EXPIRED'
  | 'DISQUALIFIED';

export type ReferralRewardDisqualificationReason =
  | 'SELF_REFERRAL'
  | 'DUPLICATE_ATTRIBUTION'
  | 'QUALIFICATION_WINDOW_EXPIRED'
  | 'NOT_FIRST_PAYMENT'
  | 'ALREADY_REWARDED'
  | 'INVALID_SUBSCRIPTION_AMOUNT'
  | 'ACCOUNT_SUSPENDED';

export interface ReferralAttribution {
  id: string;
  referrerId: string;
  referrerOrgId?: string | null;
  referredId: string;
  referredOrgId?: string | null;
  referralCode: string;
  attributedAt: string; // ISO String
  qualificationDeadline: string; // ISO String (+30 days)
  status: ReferralAttributionStatus;
  firstPaymentId?: string | null;
  firstPaymentAmount?: number | null;
  rewardAmount?: number | null;
  rewardedAt?: string | null;
  disqualificationReason?: ReferralRewardDisqualificationReason | null;
}

export interface CalculateReferralRewardParams {
  referrerId: string;
  referredId: string;
  attributionDate: string | Date;
  paymentDate: string | Date;
  subscriptionPaidAmount: number;
  isFirstSuccessfulPayment: boolean;
  existingRewardProcessed?: boolean;
  isSameAccountOrIdentity?: boolean;
}

export interface ReferralRewardCalculationResult {
  isEligible: boolean;
  rewardAmount: number;
  rewardPercentage: number;
  subscriptionPaidAmount: number;
  qualificationDaysElapsed: number;
  isWithinWindow: boolean;
  formattedRewardAmount: string;
  status: ReferralAttributionStatus;
  disqualificationReason?: ReferralRewardDisqualificationReason;
  walletRestrictionNotice: string;
}

/**
 * Normalizes user-entered referral codes (uppercase, trimmed, strips hyphens/spaces for consistency).
 */
export function normalizeReferralCode(rawCode: string): string {
  if (!rawCode) return '';
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, '-');
}

/**
 * Validates referral code formatting.
 */
export function validateReferralCodeFormat(code: string): boolean {
  const normalized = normalizeReferralCode(code);
  if (!normalized || normalized.length < 4 || normalized.length > 32) {
    return false;
  }
  // Accepts OTP-XXXX, REF-XXXX, BNI-XXXX, or alphanumeric handles
  return /^[A-Z0-9_-]{4,32}$/.test(normalized);
}

/**
 * Generates a persistent, deterministic referral code for an individual buyer or organization.
 */
export function generatePersistentReferralCode(
  identifier: string,
  prefix: string = REFERRAL_CODE_PREFIX,
): string {
  const cleanId = (identifier || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const shortHash = cleanId.slice(-6) || 'GROWTH';
  const cleanPrefix = (prefix || REFERRAL_CODE_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${cleanPrefix}-${shortHash}`;
}

/**
 * Computes referral reward eligibility and exact amount according to R2-27 rules.
 */
export function calculateReferralReward(
  params: CalculateReferralRewardParams,
): ReferralRewardCalculationResult {
  const walletRestrictionNotice =
    'Referral reward credits are strictly restricted to OTP platform subscription purchases, renewals, and RFQ top-ups. Cash withdrawal and GMV settlement mixing are strictly prohibited.';

  // 1. Zero Self-Referral Invariant
  if (
    !params.referrerId ||
    !params.referredId ||
    params.referrerId === params.referredId ||
    params.isSameAccountOrIdentity
  ) {
    return {
      isEligible: false,
      rewardAmount: 0,
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: params.subscriptionPaidAmount,
      qualificationDaysElapsed: 0,
      isWithinWindow: false,
      formattedRewardAmount: '₹0.00',
      status: 'DISQUALIFIED',
      disqualificationReason: 'SELF_REFERRAL',
      walletRestrictionNotice,
    };
  }

  // 2. Already Rewarded / Idempotency Check
  if (params.existingRewardProcessed) {
    return {
      isEligible: false,
      rewardAmount: 0,
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: params.subscriptionPaidAmount,
      qualificationDaysElapsed: 0,
      isWithinWindow: false,
      formattedRewardAmount: '₹0.00',
      status: 'DISQUALIFIED',
      disqualificationReason: 'ALREADY_REWARDED',
      walletRestrictionNotice,
    };
  }

  // 3. First Successful Payment Only Invariant
  if (!params.isFirstSuccessfulPayment) {
    return {
      isEligible: false,
      rewardAmount: 0,
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: params.subscriptionPaidAmount,
      qualificationDaysElapsed: 0,
      isWithinWindow: false,
      formattedRewardAmount: '₹0.00',
      status: 'DISQUALIFIED',
      disqualificationReason: 'NOT_FIRST_PAYMENT',
      walletRestrictionNotice,
    };
  }

  // 4. Positive Subscription Amount Check
  const paidAmount = Math.max(0, Math.round(Number(params.subscriptionPaidAmount || 0) * 100) / 100);
  if (paidAmount <= 0) {
    return {
      isEligible: false,
      rewardAmount: 0,
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: 0,
      qualificationDaysElapsed: 0,
      isWithinWindow: false,
      formattedRewardAmount: '₹0.00',
      status: 'DISQUALIFIED',
      disqualificationReason: 'INVALID_SUBSCRIPTION_AMOUNT',
      walletRestrictionNotice,
    };
  }

  // 5. 30-Day Qualification Window Check
  const attrTime = new Date(params.attributionDate).getTime();
  const payTime = new Date(params.paymentDate).getTime();
  const diffMs = payTime - attrTime;
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const isWithinWindow = diffMs >= 0 && daysElapsed <= REFERRAL_QUALIFICATION_WINDOW_DAYS;

  if (!isWithinWindow) {
    return {
      isEligible: false,
      rewardAmount: 0,
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: paidAmount,
      qualificationDaysElapsed: daysElapsed,
      isWithinWindow: false,
      formattedRewardAmount: '₹0.00',
      status: 'EXPIRED',
      disqualificationReason: 'QUALIFICATION_WINDOW_EXPIRED',
      walletRestrictionNotice,
    };
  }

  // 6. Calculate 10% Reward to exact 2-decimal paisa precision
  const rawReward = (paidAmount * REFERRAL_REWARD_PERCENTAGE) / 100;
  const rewardAmount = Math.round(rawReward * 100) / 100;

  return {
    isEligible: true,
    rewardAmount,
    rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
    subscriptionPaidAmount: paidAmount,
    qualificationDaysElapsed: daysElapsed,
    isWithinWindow: true,
    formattedRewardAmount: `₹${rewardAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    status: 'QUALIFIED',
    walletRestrictionNotice,
  };
}

export type ReferralWalletAction =
  | 'SUBSCRIPTION_PURCHASE'
  | 'SUBSCRIPTION_RENEWAL'
  | 'RFQ_TOPUP'
  | 'CASH_WITHDRAWAL'
  | 'GMV_PAYMENT'
  | 'SUPPLIER_DISBURSEMENT';

/**
 * Enforces non-negotiable referral wallet usage restrictions.
 */
export function assertReferralWalletUsagePolicy(
  action: ReferralWalletAction,
): { isAllowed: boolean; error?: string } {
  switch (action) {
    case 'SUBSCRIPTION_PURCHASE':
    case 'SUBSCRIPTION_RENEWAL':
    case 'RFQ_TOPUP':
      return { isAllowed: true };
    case 'CASH_WITHDRAWAL':
      return {
        isAllowed: false,
        error: 'POLICY VIOLATION: Referral incentive credits cannot be withdrawn as cash. Credits are non-cash platform entitlements.',
      };
    case 'GMV_PAYMENT':
    case 'SUPPLIER_DISBURSEMENT':
      return {
        isAllowed: false,
        error: 'POLICY VIOLATION: Referral incentive credits cannot be used for procurement GMV settlement or direct supplier payments. Sourcing and subscription ledgers are strictly segregated.',
      };
    default:
      return {
        isAllowed: false,
        error: `POLICY VIOLATION: Unsupported wallet action: ${action}`,
      };
  }
}

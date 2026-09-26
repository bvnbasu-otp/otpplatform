/**
 * OTP Platform — Referral, Incentive & Growth Domain Engine
 * Stage R2-27 / Pre-R2-30: Referral, Growth, WhatsApp Sharing & Controlled Pilot Invariants
 *
 * NON-NEGOTIABLE CORE RULES:
 * 1. 10% Referral Reward Rule: Reward is calculated strictly as 10% of the actual
 *    first successful subscription payment made by the referred buyer account.
 * 2. Persistent Referral Code: Deterministic, persistent referral code per referrer
 *    (does not change across logins, shares, or refreshes).
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
 * 6. User-Driven WhatsApp Sharing:
 *    - WhatsApp links generated via https://api.whatsapp.com/send?text=... with pre-filled message.
 *    - User controls recipient and sending; OTP does not collect recipient phone numbers.
 *    - Universal fallback: Copy Referral Link (+ optional Web Share API).
 * 7. Controlled Pilot Commercial Mode:
 *    - In pilot mode, referral rewards are calculated and simulated without real payment or commercial revenue recognition.
 */

export const REFERRAL_REWARD_PERCENTAGE = 10.0; // 10%
export const REFERRAL_QUALIFICATION_WINDOW_DAYS = 30; // 30 Calendar Days
export const REFERRAL_CODE_PREFIX = 'OTP';

export const DEFAULT_REFERRAL_SHARE_MESSAGE =
  "Hi, I'm using OTP for competitive institutional and business procurement. You can check it out, get verified supplier quotes, and sign up here: {url}";

export type ReferralAttributionStatus =
  | 'ATTRIBUTED'
  | 'QUALIFIED'
  | 'REWARDED'
  | 'EXPIRED'
  | 'DISQUALIFIED';

export type ReferralAttributionMode = 'PILOT_SANDBOX' | 'COMMERCIAL_PRODUCTION';

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
  attributionMode?: ReferralAttributionMode;
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
  isPilotMode?: boolean;
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
  isPilotSimulated: boolean;
  disqualificationReason?: ReferralRewardDisqualificationReason;
  walletRestrictionNotice: string;
  pilotModeNotice?: string;
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
 * Simple, deterministic 32-bit FNV-1a hash function for generating stable referral codes.
 */
function fnv1aHashHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Generates a persistent, deterministic referral code for an individual buyer or organization.
 * Guaranteed to produce the exact same code for the same identifier across all sessions and shares.
 */
export function generatePersistentReferralCode(
  identifier: string,
  prefix: string = REFERRAL_CODE_PREFIX,
): string {
  const cleanId = (identifier || '').trim();
  if (!cleanId) {
    return `${(prefix || REFERRAL_CODE_PREFIX).toUpperCase()}-GROWTH`;
  }

  // If already a valid referral code format with prefix, normalize and return
  const normalized = normalizeReferralCode(cleanId);
  if (/^[A-Z0-9]{3,4}-[A-Z0-9]{4,12}$/.test(normalized)) {
    return normalized;
  }

  const cleanPrefix = (prefix || REFERRAL_CODE_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hashHex = fnv1aHashHex(cleanId);
  const shortHash = hashHex.slice(0, 6);
  return `${cleanPrefix}-${shortHash}`;
}

/**
 * Generates the authoritative public referral URL.
 */
export function generateReferralUrl(
  referralCode: string,
  origin: string = 'https://otp.market',
  side?: 'BUYER' | 'SUPPLIER' | 'buyer' | 'supplier' | 'all' | string,
): string {
  const cleanOrigin = (origin || 'https://otp.market').replace(/\/+$/, '');
  const cleanCode = normalizeReferralCode(referralCode) || 'OTP-GROWTH';
  const queryParams = new URLSearchParams();
  queryParams.set('ref', cleanCode);
  if (side && side.toLowerCase() !== 'all') {
    queryParams.set('side', side.toLowerCase());
  }
  return `${cleanOrigin}/signup?${queryParams.toString()}`;
}

export interface GenerateWhatsAppShareUrlParams {
  referralCode: string;
  origin?: string;
  side?: 'BUYER' | 'SUPPLIER' | 'buyer' | 'supplier' | 'all' | string;
  referralUrl?: string;
  source?: string;
  customMessage?: string;
  targetPhone?: string;
}

/**
 * Generates a WhatsApp user-driven share URL (`https://api.whatsapp.com/send?text=...`).
 * Allows the user to share their referral link with zero automated phone scraping or WAHA dependency.
 */
export function generateWhatsAppShareUrl(params: GenerateWhatsAppShareUrlParams): string {
  const url = params.referralUrl || generateReferralUrl(params.referralCode, params.origin, params.side);
  const template = params.customMessage || DEFAULT_REFERRAL_SHARE_MESSAGE;
  const message = template.includes('{url}') ? template.replace('{url}', url) : `${template}\n\n${url}`;

  const searchParams = new URLSearchParams();
  if (params.targetPhone) {
    const cleanPhone = params.targetPhone.replace(/\D/g, '');
    if (cleanPhone) searchParams.set('phone', cleanPhone);
  }
  searchParams.set('text', message);

  return `https://api.whatsapp.com/send?${searchParams.toString()}`;
}

/**
 * Generates Web Share API compatible payload for native mobile sharing.
 */
export function getReferralWebShareData(params: {
  referralCode: string;
  origin?: string;
  side?: 'BUYER' | 'SUPPLIER' | 'buyer' | 'supplier' | 'all' | string;
  referralUrl?: string;
}): { title: string; text: string; url: string } {
  const url = params.referralUrl || generateReferralUrl(params.referralCode, params.origin, params.side);
  return {
    title: 'OTP — Transparent Procurement Platform',
    text: `Hi, I'm using OTP for competitive procurement. Use my referral code ${params.referralCode} or sign up here:`,
    url,
  };
}

/**
 * Evaluates whether a transaction is within the 30-day qualification window.
 */
export function isWithinQualificationWindow(
  attributionDate: string | Date,
  referenceDate: string | Date = new Date(),
): boolean {
  const attrTime = new Date(attributionDate).getTime();
  const refTime = new Date(referenceDate).getTime();
  if (Number.isNaN(attrTime) || Number.isNaN(refTime)) return false;
  const diffMs = refTime - attrTime;
  const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffMs >= 0 && daysElapsed <= REFERRAL_QUALIFICATION_WINDOW_DAYS;
}

/**
 * Computes referral reward eligibility and exact amount according to R2-27 / Pre-R2-30 rules.
 */
export function calculateReferralReward(
  params: CalculateReferralRewardParams,
): ReferralRewardCalculationResult {
  const isPilot = Boolean(params.isPilotMode);
  const walletRestrictionNotice =
    'Referral reward credits are strictly restricted to OTP platform subscription purchases, renewals, and RFQ top-ups. Cash withdrawal and GMV settlement mixing are strictly prohibited.';
  const pilotModeNotice = isPilot
    ? 'Controlled Pilot Mode: 10% referral rewards are simulated for validation. No real money or commercial revenue is recognized.'
    : undefined;

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
      isPilotSimulated: isPilot,
      disqualificationReason: 'SELF_REFERRAL',
      walletRestrictionNotice,
      pilotModeNotice,
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
      isPilotSimulated: isPilot,
      disqualificationReason: 'ALREADY_REWARDED',
      walletRestrictionNotice,
      pilotModeNotice,
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
      isPilotSimulated: isPilot,
      disqualificationReason: 'NOT_FIRST_PAYMENT',
      walletRestrictionNotice,
      pilotModeNotice,
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
      isPilotSimulated: isPilot,
      disqualificationReason: 'INVALID_SUBSCRIPTION_AMOUNT',
      walletRestrictionNotice,
      pilotModeNotice,
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
      isPilotSimulated: isPilot,
      disqualificationReason: 'QUALIFICATION_WINDOW_EXPIRED',
      walletRestrictionNotice,
      pilotModeNotice,
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
    isPilotSimulated: isPilot,
    walletRestrictionNotice,
    pilotModeNotice,
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

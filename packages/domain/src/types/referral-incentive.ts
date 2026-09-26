/**
 * OTP Platform — Referral, Incentive & Growth Domain Engine
 * Stage R2-27 / Pre-R2-30: Referral, Growth, WhatsApp Sharing & Controlled Pilot Invariants
 *
 * NON-NEGOTIABLE CORE RULES:
 * 1. 10% Referral Reward Rule: Reward is calculated strictly as 10% of the actual
 *    first successful subscription payment made by the referred buyer account.
 * 2. Uniquely/Randomly Generated Persistent Referral Code:
 *    - Referral codes are uniquely and cryptographically randomly generated once (e.g. OTP-XXXXXX),
 *      then persistently stored and reused across logins, shares, URL generation, and dashboard visits.
 *    - Codes are NOT deterministically derived from: user ID, organization ID, tenant ID, email, phone, or identity attributes.
 *    - Collision handling ensures absolute uniqueness.
 *    - Existing valid referral codes are preserved and normalized.
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
 * 7. Controlled Pilot Mode Boundary (Pre-R2-30 Invariant):
 *    - In pilot mode without actual qualifying subscription payment, NO monetary wallet balance,
 *      NO monetary liability, and NO commercial revenue is recognized.
 *    - Pilot executions produce clearly classified REFERRAL_TEST_RESULT records with walletMonetaryCredit: 0
 *      and simulatedRewardAmount reflecting the simulated 10% rule.
 */

export const REFERRAL_REWARD_PERCENTAGE = 10.0; // 10%
export const REFERRAL_QUALIFICATION_WINDOW_DAYS = 30; // 30 Calendar Days
export const REFERRAL_CODE_PREFIX = 'OTP';
export const DEFAULT_REFERRAL_CODE_LENGTH = 6;
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const DEFAULT_REFERRAL_SHARE_MESSAGE =
  "Hi, I'm using OTP for competitive procurement and really impressed with it. You can try it out and get started with my referral code: {code} - {url}";

export type ReferralAttributionStatus =
  | 'ATTRIBUTED'
  | 'QUALIFIED'
  | 'REWARDED'
  | 'EXPIRED'
  | 'DISQUALIFIED';

export type ReferralAttributionMode = 'PILOT_SANDBOX' | 'COMMERCIAL_PRODUCTION';

export type ReferralRecordClassification = 'REFERRAL_TEST_RESULT' | 'COMMERCIAL_REWARD_PAYOUT';

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
  rewardAmount: number; // Monetary wallet credit (0 in pilot simulation or disqualified; actual 10% amount in live commercial mode)
  monetaryCreditAmount: number; // 0 in pilot simulation; actual monetary credit in live commercial mode
  walletMonetaryCredit: number; // 0 in pilot simulation; actual wallet monetary balance in live commercial mode
  simulatedRewardAmount: number; // The simulated 10% calculation in pilot mode; 0 in live commercial mode
  financialLiabilityRecognized: boolean; // false during pilot mode or disqualification; true only for live commercial payouts
  financialReportingScope: ReferralAttributionMode;
  recordClassification: ReferralRecordClassification;
  rewardPercentage: number;
  subscriptionPaidAmount: number;
  qualificationDaysElapsed: number;
  isWithinWindow: boolean;
  formattedRewardAmount: string;
  formattedMonetaryCredit: string;
  formattedSimulatedRewardAmount: string;
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
 * Accepts standard OTP-XXXXXX, BNI-XXXXXX, REF-XXXX, or custom alphanumeric handles.
 */
export function validateReferralCodeFormat(code: string): boolean {
  const normalized = normalizeReferralCode(code);
  if (!normalized || normalized.length < 4 || normalized.length > 32) {
    return false;
  }
  return /^[A-Z0-9_-]{4,32}$/.test(normalized);
}

/**
 * Generates cryptographically secure random bytes (Web Crypto, available in browsers and Node 19+).
 * There is deliberately no Math.random fallback: a guessable referral code is worse than none.
 */
function getSecureRandomBytes(count: number): Uint8Array {
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error('Secure random source (crypto.getRandomValues) is unavailable; refusing to generate a referral code.');
  }
  const bytes = new Uint8Array(count);
  webCrypto.getRandomValues(bytes);
  return bytes;
}

/** Draws `length` unbiased characters from `alphabet` using rejection sampling over CSPRNG bytes. */
function drawSecureCodeBody(alphabet: string, length: number): string {
  const alphabetLen = alphabet.length;
  const limit = 256 - (256 % alphabetLen);
  let body = '';
  while (body.length < length) {
    const bytes = getSecureRandomBytes(length - body.length);
    for (let i = 0; i < bytes.length && body.length < length; i++) {
      const byte = bytes[i]!;
      if (byte < limit) body += alphabet[byte % alphabetLen];
    }
  }
  return body;
}

/**
 * Generates an unpredictable, cryptographically secure random referral code string.
 * Uses an unambiguous alphabet ('23456789ABCDEFGHJKLMNPQRSTUVWXYZ' excluding 0, O, 1, I).
 * Guaranteed to be non-derived from any identity, tenant, email, or phone attribute.
 */
export function generateSecureRandomReferralCode(
  prefix: string = REFERRAL_CODE_PREFIX,
  length: number = DEFAULT_REFERRAL_CODE_LENGTH,
  existingCodes?: Set<string> | string[],
): string {
  const cleanPrefix = (prefix || REFERRAL_CODE_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, '') || REFERRAL_CODE_PREFIX;
  const existingSet =
    existingCodes instanceof Set
      ? existingCodes
      : Array.isArray(existingCodes)
      ? new Set(existingCodes)
      : null;

  const safeLength = Math.min(12, Math.max(4, Math.floor(length) || DEFAULT_REFERRAL_CODE_LENGTH));
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `${cleanPrefix}-${drawSecureCodeBody(REFERRAL_CODE_ALPHABET, safeLength)}`;
    if (!existingSet || !existingSet.has(candidate)) {
      return candidate;
    }
  }

  // Collision space exhausted at this length: widen the body rather than return a known code.
  let widened = `${cleanPrefix}-${drawSecureCodeBody(REFERRAL_CODE_ALPHABET, Math.min(12, safeLength + 2))}`;
  while (existingSet && existingSet.has(widened)) {
    widened = `${cleanPrefix}-${drawSecureCodeBody(REFERRAL_CODE_ALPHABET, 12)}`;
  }
  return widened;
}

/**
 * Global persistent in-memory referral code store.
 * Maps entity/user/org identifier -> persistent random code.
 * Guarantees that once generated, the exact same code is returned across
 * subsequent queries, refreshes, shares, and dashboard visits.
 */
const persistentReferralStore = new Map<string, string>();

export function getPersistentReferralCodeStore(): Map<string, string> {
  return persistentReferralStore;
}

export function setPersistentReferralCode(identifier: string, code: string): void {
  if (identifier && code) {
    persistentReferralStore.set(identifier.trim(), normalizeReferralCode(code));
  }
}

export function clearPersistentReferralCodeStore(): void {
  persistentReferralStore.clear();
}

export interface GeneratePersistentReferralCodeOptions {
  codeStore?: Map<string, string>;
  forceNew?: boolean;
  existingCodes?: Set<string> | string[];
}

/**
 * Generates or retrieves a persistent, randomly generated referral code for a user or organization.
 *
 * Invariants (Workstream 1):
 * 1. Random & Non-Identity-Derived: Generated from cryptographically secure entropy. Zero reliance on
 *    user ID, org ID, tenant ID, email, or phone.
 * 2. Persistent: Stored on initial generation and reused consistently across logins, refreshes,
 *    URL generations, sharing, and dashboard visits.
 * 3. Preserves Existing Valid Codes: If an already-valid referral code format is passed, it is preserved,
 *    normalized, registered, and returned.
 * 4. Collision Resistant: Collision avoidance regenerates against known stores.
 */
export function generatePersistentReferralCode(
  identifierOrExistingCode?: string | null,
  prefix: string = REFERRAL_CODE_PREFIX,
  options?: GeneratePersistentReferralCodeOptions,
): string {
  const input = (identifierOrExistingCode || '').trim();
  const cleanPrefix = (prefix || REFERRAL_CODE_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, '') || REFERRAL_CODE_PREFIX;
  const activeStore = options?.codeStore || persistentReferralStore;

  // If no identifier or code passed, generate a new random code
  if (!input) {
    return generateSecureRandomReferralCode(cleanPrefix, DEFAULT_REFERRAL_CODE_LENGTH, options?.existingCodes);
  }

  // 1. If input is already a valid formatted referral code (e.g. "OTP-7X8Y9Z", "BNI-2K3M4P"), preserve and return it
  const normalized = normalizeReferralCode(input);
  if (/^[A-Z0-9]{2,6}-[A-Z0-9]{4,12}$/.test(normalized)) {
    activeStore.set(input, normalized);
    return normalized;
  }

  // 2. If a code has already been generated and stored for this identifier, return the persistent code
  if (!options?.forceNew && activeStore.has(input)) {
    const existing = activeStore.get(input);
    if (existing) {
      return existing;
    }
  }

  // 3. Build collision set from existing store and options
  const knownCodes = new Set<string>();
  for (const code of activeStore.values()) {
    knownCodes.add(code);
  }
  if (options?.existingCodes) {
    for (const c of options.existingCodes) {
      knownCodes.add(c);
    }
  }

  // 4. Generate fresh cryptographically random code
  const newRandomCode = generateSecureRandomReferralCode(
    cleanPrefix,
    DEFAULT_REFERRAL_CODE_LENGTH,
    knownCodes,
  );

  // 5. Persist mapping so the entity always receives this same code
  activeStore.set(input, newRandomCode);

  return newRandomCode;
}

/**
 * Generates the authoritative public referral URL.
 */
export const DEFAULT_REFERRAL_ORIGIN = 'https://otp.market';
export const FALLBACK_REFERRAL_CODE = 'OTP-GROWTH';

/**
 * Reduces any caller-supplied code to the characters a referral code may contain,
 * so it cannot smuggle template tokens, separators, markup or newlines into links/messages.
 */
export function sanitizeReferralCode(rawCode?: string | null): string {
  const cleaned = normalizeReferralCode(String(rawCode ?? ''))
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return cleaned.length >= 4 ? cleaned : FALLBACK_REFERRAL_CODE;
}

/** Returns the scheme+host+port of an http(s) origin, or the default origin for anything else. */
export function sanitizeReferralOrigin(origin?: string | null): string {
  try {
    const parsed = new URL(String(origin ?? '').trim() || DEFAULT_REFERRAL_ORIGIN);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return DEFAULT_REFERRAL_ORIGIN;
    return parsed.origin;
  } catch {
    return DEFAULT_REFERRAL_ORIGIN;
  }
}

/**
 * Generates the authoritative public referral URL via the URL API (no string concatenation).
 */
export function generateReferralUrl(
  referralCode: string,
  origin: string = DEFAULT_REFERRAL_ORIGIN,
  side?: 'BUYER' | 'SUPPLIER' | 'buyer' | 'supplier' | 'all' | string,
): string {
  const url = new URL('/signup', sanitizeReferralOrigin(origin));
  url.searchParams.set('ref', sanitizeReferralCode(referralCode));
  const cleanSide = (side || '').toLowerCase();
  if (cleanSide === 'buyer' || cleanSide === 'supplier') {
    url.searchParams.set('side', cleanSide);
  }
  return url.toString();
}

/** Accepts a caller-built referral URL only if it is a well-formed http(s) URL. */
function resolveShareUrl(params: {
  referralUrl?: string;
  referralCode: string;
  origin?: string;
  side?: string;
}): string {
  if (params.referralUrl) {
    try {
      const parsed = new URL(params.referralUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
    } catch {
      // fall through to a freshly generated URL
    }
  }
  return generateReferralUrl(params.referralCode, params.origin, params.side);
}

/**
 * Builds the referral share message from a template in a single pass, so a value
 * substituted for one token can never be re-expanded as another token.
 */
export function buildReferralShareMessage(
  referralCode: string,
  referralUrl: string,
  template: string = DEFAULT_REFERRAL_SHARE_MESSAGE,
): string {
  const code = sanitizeReferralCode(referralCode);
  const hasUrlToken = /\{(url|LINK)\}/.test(template);
  const message = template.replace(/\{(code|CODE|url|LINK)\}/g, (_match, token: string) =>
    token === 'code' || token === 'CODE' ? code : referralUrl,
  );
  return hasUrlToken ? message : `${message}\n\n${referralUrl}`;
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
  const url = resolveShareUrl(params);
  const message = buildReferralShareMessage(
    params.referralCode,
    url,
    params.customMessage || DEFAULT_REFERRAL_SHARE_MESSAGE,
  );

  const shareUrl = new URL('https://api.whatsapp.com/send');
  if (params.targetPhone) {
    const cleanPhone = params.targetPhone.replace(/\D/g, '');
    if (cleanPhone) shareUrl.searchParams.set('phone', cleanPhone);
  }
  shareUrl.searchParams.set('text', message);

  return shareUrl.toString();
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
  const url = resolveShareUrl(params);
  return {
    title: 'OTP — Transparent Procurement Platform',
    text: buildReferralShareMessage(params.referralCode, url),
    url,
  };
}

/**
 * Pilot referral credit boundary for display: attribution is recorded, monetary credit is ₹0.
 */
export const REFERRAL_PROGRAM_MODE: ReferralAttributionMode = 'PILOT_SANDBOX';

export function getReferralCreditDisplay(mode: ReferralAttributionMode = REFERRAL_PROGRAM_MODE): {
  mode: ReferralAttributionMode;
  monetaryCreditAmount: number;
  formattedMonetaryCredit: string;
  notice: string;
} {
  if (mode === 'PILOT_SANDBOX') {
    return {
      mode,
      monetaryCreditAmount: 0,
      formattedMonetaryCredit: '₹0.00',
      notice:
        'Controlled pilot: referrals are recorded for attribution, but no monetary or wallet credit is issued during the pilot (₹0).',
    };
  }
  return {
    mode,
    monetaryCreditAmount: 0,
    formattedMonetaryCredit: '₹0.00',
    notice: `Earn ${REFERRAL_REWARD_PERCENTAGE}% of a referred account's first successful subscription payment as non-cash OTP Wallet credit, within ${REFERRAL_QUALIFICATION_WINDOW_DAYS} days of attribution.`,
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
 *
 * Strict Pilot Reward Boundary Enforcement (Workstream 2):
 * - NO MONETARY REFERRAL REWARD may be recognized, earned, credited, or represented as a real
 *   wallet balance during pilot mode (isPilotMode: true).
 * - During pilot simulation, returns clearly classified REFERRAL_TEST_RESULT with:
 *   walletMonetaryCredit: 0, monetaryCreditAmount: 0, rewardAmount: 0,
 *   simulatedRewardAmount: calculated10PercentAmount, financialLiabilityRecognized: false,
 *   financialReportingScope: 'PILOT_SANDBOX'.
 * - In live commercial mode (isPilotMode: false) with real payment:
 *   Returns classified COMMERCIAL_REWARD_PAYOUT with walletMonetaryCredit: calculated10PercentAmount,
 *   monetaryCreditAmount: calculated10PercentAmount, rewardAmount: calculated10PercentAmount,
 *   simulatedRewardAmount: 0, financialLiabilityRecognized: true,
 *   financialReportingScope: 'COMMERCIAL_PRODUCTION'.
 */
export function calculateReferralReward(
  params: CalculateReferralRewardParams,
): ReferralRewardCalculationResult {
  const isPilot = Boolean(params.isPilotMode);
  const scope: ReferralAttributionMode = isPilot ? 'PILOT_SANDBOX' : 'COMMERCIAL_PRODUCTION';
  const classification: ReferralRecordClassification = isPilot ? 'REFERRAL_TEST_RESULT' : 'COMMERCIAL_REWARD_PAYOUT';

  const walletRestrictionNotice =
    'Referral reward credits are strictly restricted to OTP platform subscription purchases, renewals, and RFQ top-ups. Cash withdrawal and GMV settlement mixing are strictly prohibited.';
  const pilotModeNotice = isPilot
    ? 'Controlled Pilot Mode: Sourcing & referral rewards are simulated for validation. Zero monetary wallet credit, zero financial liability, and zero commercial revenue are recognized.'
    : undefined;

  const createDisqualifiedResult = (
    reason: ReferralRewardDisqualificationReason,
    daysElapsed: number = 0,
    status: ReferralAttributionStatus = 'DISQUALIFIED',
  ): ReferralRewardCalculationResult => ({
    isEligible: false,
    rewardAmount: 0,
    monetaryCreditAmount: 0,
    walletMonetaryCredit: 0,
    simulatedRewardAmount: 0,
    financialLiabilityRecognized: false,
    financialReportingScope: scope,
    recordClassification: classification,
    rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
    subscriptionPaidAmount: params.subscriptionPaidAmount || 0,
    qualificationDaysElapsed: daysElapsed,
    isWithinWindow: false,
    formattedRewardAmount: '₹0.00',
    formattedMonetaryCredit: '₹0.00',
    formattedSimulatedRewardAmount: '₹0.00',
    status,
    isPilotSimulated: isPilot,
    disqualificationReason: reason,
    walletRestrictionNotice,
    pilotModeNotice,
  });

  // 1. Zero Self-Referral Invariant (Strict Identity & Tenant Separation)
  if (
    !params.referrerId ||
    !params.referredId ||
    params.referrerId === params.referredId ||
    params.isSameAccountOrIdentity
  ) {
    return createDisqualifiedResult('SELF_REFERRAL', 0, 'DISQUALIFIED');
  }

  // 2. Already Rewarded / Idempotency Check
  if (params.existingRewardProcessed) {
    return createDisqualifiedResult('ALREADY_REWARDED', 0, 'DISQUALIFIED');
  }

  // 3. First Successful Payment Only Invariant
  if (!params.isFirstSuccessfulPayment) {
    return createDisqualifiedResult('NOT_FIRST_PAYMENT', 0, 'DISQUALIFIED');
  }

  // 4. Positive Subscription Amount Check
  const paidAmount = Math.max(0, Math.round(Number(params.subscriptionPaidAmount || 0) * 100) / 100);
  if (paidAmount <= 0) {
    return createDisqualifiedResult('INVALID_SUBSCRIPTION_AMOUNT', 0, 'DISQUALIFIED');
  }

  // 5. 30-Day Qualification Window Check
  const attrTime = new Date(params.attributionDate).getTime();
  const payTime = new Date(params.paymentDate).getTime();
  const diffMs = payTime - attrTime;
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const isWithinWindow = diffMs >= 0 && daysElapsed <= REFERRAL_QUALIFICATION_WINDOW_DAYS;

  if (!isWithinWindow) {
    return createDisqualifiedResult('QUALIFICATION_WINDOW_EXPIRED', daysElapsed, 'EXPIRED');
  }

  // 6. Calculate 10% Reward to exact 2-decimal paisa precision
  const rawReward = (paidAmount * REFERRAL_REWARD_PERCENTAGE) / 100;
  const calculated10PercentAmount = Math.round(rawReward * 100) / 100;

  const formattedCalculatedAmount = `₹${calculated10PercentAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // 7. Pilot Simulation vs Live Commercial Payout Isolation
  if (isPilot) {
    // In pilot mode: Zero monetary wallet balance, zero monetary liability, simulated reward only
    return {
      isEligible: true,
      rewardAmount: 0, // Strict invariant: 0 monetary balance during pilot
      monetaryCreditAmount: 0, // Strict invariant: 0 monetary credit
      walletMonetaryCredit: 0, // Strict invariant: 0 monetary balance
      simulatedRewardAmount: calculated10PercentAmount, // Simulation for validation
      financialLiabilityRecognized: false, // Strict invariant: 0 liability
      financialReportingScope: 'PILOT_SANDBOX',
      recordClassification: 'REFERRAL_TEST_RESULT',
      rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
      subscriptionPaidAmount: paidAmount,
      qualificationDaysElapsed: daysElapsed,
      isWithinWindow: true,
      formattedRewardAmount: '₹0.00',
      formattedMonetaryCredit: '₹0.00',
      formattedSimulatedRewardAmount: formattedCalculatedAmount,
      status: 'QUALIFIED',
      isPilotSimulated: true,
      walletRestrictionNotice,
      pilotModeNotice,
    };
  }

  // Live Commercial Production Payout
  return {
    isEligible: true,
    rewardAmount: calculated10PercentAmount,
    monetaryCreditAmount: calculated10PercentAmount,
    walletMonetaryCredit: calculated10PercentAmount,
    simulatedRewardAmount: 0,
    financialLiabilityRecognized: true,
    financialReportingScope: 'COMMERCIAL_PRODUCTION',
    recordClassification: 'COMMERCIAL_REWARD_PAYOUT',
    rewardPercentage: REFERRAL_REWARD_PERCENTAGE,
    subscriptionPaidAmount: paidAmount,
    qualificationDaysElapsed: daysElapsed,
    isWithinWindow: true,
    formattedRewardAmount: formattedCalculatedAmount,
    formattedMonetaryCredit: formattedCalculatedAmount,
    formattedSimulatedRewardAmount: '₹0.00',
    status: 'QUALIFIED',
    isPilotSimulated: false,
    walletRestrictionNotice,
    pilotModeNotice: undefined,
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

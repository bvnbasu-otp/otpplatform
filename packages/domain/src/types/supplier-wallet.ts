/**
 * Supplier OTP Wallet — referral & first-transaction success rewards only.
 * Supplier cashback was removed; buyer cashback/rewards are unchanged in buyer-reward.ts.
 */

import {
  referralBonusInrForReferredProfile,
  type ReferredProfileKind,
} from './persona-wallet';

export const SUPPLIER_REFERRAL_BONUS_INR = 100;
export const SUPPLIER_SUCCESS_REWARD_INR = 100;

/** Ledger source_entity_type values for wallet_transactions (append-only). */
export const SupplierWalletLedgerEventType = {
  SUPPLIER_REFERRAL_BONUS: 'SUPPLIER_REFERRAL_BONUS',
  SUPPLIER_SUCCESS_REWARD: 'SUPPLIER_SUCCESS_REWARD',
} as const;

export type SupplierWalletLedgerEventType =
  (typeof SupplierWalletLedgerEventType)[keyof typeof SupplierWalletLedgerEventType];

/** Removed product surface — must not appear in APIs, UI, or telemetry. */
export const REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE = 'SUPPLIER_CASHBACK';

export type SupplierReferralDenyReason =
  | 'SELF_REFERRAL'
  | 'DUPLICATE_CREDIT'
  | 'CIRCULAR_REFERRAL'
  | 'REFERRED_NOT_OTP_VERIFIED'
  | 'MISSING_REFERRER'
  | 'REFERRER_TRANSACTION_GATE';

export type SupplierSuccessRewardDenyReason =
  | 'DUPLICATE_REWARD'
  | 'NO_QUALIFYING_SETTLEMENT'
  | 'SETTLEMENT_NOT_COMPLETE'
  | 'CLIENT_AMOUNT_OVERRIDE';

export interface SupplierReferralBonusInput {
  referrerOrgId: string;
  referrerSupplierId?: string | null;
  referredSupplierId: string;
  referredVerificationStatus: string;
  referredLifecycleTier?: string | null;
  referredVerifiedAt?: string | null;
  existingCreditsForPair?: boolean;
  referrerEqualsReferred?: boolean;
  circularReferralDetected?: boolean;
  /** Referred account profile — amount follows golden matrix (server SQL: private.otp_referral_bonus_inr). */
  referredProfileKind?: ReferredProfileKind | string | null;
  /** Supplier referrers need at least one completed OTP transaction before referral wallet credit. */
  referrerHasCompletedOtpTransaction?: boolean;
  /** Ignored — amount is always server-derived. */
  clientRequestedAmount?: number;
}

export interface SupplierReferralBonusDecision {
  eligible: boolean;
  amountInr: number;
  ledgerEventType: typeof SupplierWalletLedgerEventType.SUPPLIER_REFERRAL_BONUS;
  idempotencyKeySeed: string;
  sourceEntityType: 'REFERRED_SUPPLIER';
  denyReason?: SupplierReferralDenyReason;
}

export interface SupplierSuccessRewardInput {
  beneficiaryOrgId: string;
  supplierId: string;
  platformFeeTransactionId?: string | null;
  platformFeeStatus?: string | null;
  priorSuccessRewardCredited?: boolean;
  /** Ignored — amount is always server-derived. */
  clientRequestedAmount?: number;
}

export interface SupplierSuccessRewardDecision {
  eligible: boolean;
  amountInr: number;
  ledgerEventType: typeof SupplierWalletLedgerEventType.SUPPLIER_SUCCESS_REWARD;
  idempotencyKeySeed: string;
  sourceEntityType: 'PLATFORM_FEE_TRANSACTION';
  denyReason?: SupplierSuccessRewardDenyReason;
  /**
   * When settlement completion is not wired in the deployment, document the missing hook here.
   */
  missingCompletionSignal?: string;
}

export function serverSupplierWalletAmountForEvent(
  eventType: SupplierWalletLedgerEventType,
): number {
  switch (eventType) {
    case SupplierWalletLedgerEventType.SUPPLIER_REFERRAL_BONUS:
      return SUPPLIER_REFERRAL_BONUS_INR;
    case SupplierWalletLedgerEventType.SUPPLIER_SUCCESS_REWARD:
      return SUPPLIER_SUCCESS_REWARD_INR;
    default:
      return 0;
  }
}

export function isRemovedSupplierCashbackPath(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toUpperCase();
  return v === REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE || v === 'SUPPLIER_CASHBACK';
}

function isOtpVerifiedSupplier(status: string, tier?: string | null): boolean {
  const s = (status || '').toUpperCase();
  const t = (tier || '').toUpperCase();
  return s === 'VERIFIED' || t === 'OTP_VERIFIED' || t === 'GST_VERIFIED';
}

export function evaluateSupplierReferralBonus(
  input: SupplierReferralBonusInput,
): SupplierReferralBonusDecision {
  const base: SupplierReferralBonusDecision = {
    eligible: false,
    amountInr: 0,
    ledgerEventType: SupplierWalletLedgerEventType.SUPPLIER_REFERRAL_BONUS,
    idempotencyKeySeed: `supplier-referral:${input.referrerOrgId}:${input.referredSupplierId}`,
    sourceEntityType: 'REFERRED_SUPPLIER',
  };

  if (!input.referrerOrgId) {
    return { ...base, denyReason: 'MISSING_REFERRER' };
  }
  if (input.referrerEqualsReferred) {
    return { ...base, denyReason: 'SELF_REFERRAL' };
  }
  if (input.circularReferralDetected) {
    return { ...base, denyReason: 'CIRCULAR_REFERRAL' };
  }
  if (input.existingCreditsForPair) {
    return { ...base, denyReason: 'DUPLICATE_CREDIT' };
  }
  if (!isOtpVerifiedSupplier(input.referredVerificationStatus, input.referredLifecycleTier)) {
    return { ...base, denyReason: 'REFERRED_NOT_OTP_VERIFIED' };
  }

  if (input.referrerHasCompletedOtpTransaction === false) {
    return { ...base, denyReason: 'REFERRER_TRANSACTION_GATE' };
  }

  const amountInr = referralBonusInrForReferredProfile(
    input.referredProfileKind ?? 'SUPPLIER',
  );

  return {
    ...base,
    eligible: true,
    amountInr,
  };
}

/**
 * First completed qualifying OTP transaction = platform fee row SETTLED for this supplier.
 * Does not credit on registration, profile, quote, or invite alone.
 */
export function evaluateSupplierSuccessReward(
  input: SupplierSuccessRewardInput,
): SupplierSuccessRewardDecision {
  const base: SupplierSuccessRewardDecision = {
    eligible: false,
    amountInr: 0,
    ledgerEventType: SupplierWalletLedgerEventType.SUPPLIER_SUCCESS_REWARD,
    idempotencyKeySeed: `supplier-success:${input.supplierId}`,
    sourceEntityType: 'PLATFORM_FEE_TRANSACTION',
  };

  if (input.priorSuccessRewardCredited) {
    return { ...base, denyReason: 'DUPLICATE_REWARD' };
  }

  if (!input.platformFeeTransactionId) {
    return {
      ...base,
      denyReason: 'NO_QUALIFYING_SETTLEMENT',
      missingCompletionSignal:
        'Awaiting first platform_fee_transactions row with status SETTLED for supplier (settlement completion hook).',
    };
  }

  const status = (input.platformFeeStatus || '').toUpperCase();
  if (status !== 'SETTLED') {
    return {
      ...base,
      denyReason: 'SETTLEMENT_NOT_COMPLETE',
      missingCompletionSignal:
        status
          ? `platform_fee_transactions.status is ${status}; required SETTLED.`
          : 'platform_fee_transactions.status missing.',
    };
  }

  return {
    ...base,
    eligible: true,
    amountInr: SUPPLIER_SUCCESS_REWARD_INR,
  };
}

export function assertClientCannotSetSupplierWalletAmount(
  clientAmount: number | null | undefined,
  serverAmount: number,
): { ok: true } | { ok: false; reason: SupplierSuccessRewardDenyReason } {
  if (clientAmount === null || clientAmount === undefined) {
    return { ok: true };
  }
  if (Math.round(Number(clientAmount) * 100) !== Math.round(serverAmount * 100)) {
    return { ok: false, reason: 'CLIENT_AMOUNT_OVERRIDE' };
  }
  return { ok: true };
}

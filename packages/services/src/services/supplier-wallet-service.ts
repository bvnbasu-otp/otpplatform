import {
  evaluateSupplierReferralBonus,
  evaluateSupplierSuccessReward,
  assertClientCannotSetSupplierWalletAmount,
  type SupplierReferralBonusInput,
  type SupplierSuccessRewardInput,
  type SupplierWalletLedgerEventType,
} from '@otp/domain';

export interface SupplierWalletCreditResult {
  ok: boolean;
  replayed?: boolean;
  amountInr?: number;
  denyReason?: string;
  missingCompletionSignal?: string;
  idempotencyKey?: string;
}

/**
 * Application-layer supplier wallet orchestration (server-derived amounts).
 * Production persistence uses credit_supplier_wallet_event_atomic (migration 00220).
 */
export class SupplierWalletService {
  planReferralBonus(input: SupplierReferralBonusInput): SupplierWalletCreditResult {
    const decision = evaluateSupplierReferralBonus(input);
    if (!decision.eligible) {
      return { ok: false, denyReason: decision.denyReason };
    }
    const clientCheck = assertClientCannotSetSupplierWalletAmount(
      input.clientRequestedAmount,
      decision.amountInr,
    );
    if (!clientCheck.ok) {
      return { ok: false, denyReason: clientCheck.reason };
    }
    return {
      ok: true,
      amountInr: decision.amountInr,
      idempotencyKey: decision.idempotencyKeySeed,
    };
  }

  planSuccessReward(input: SupplierSuccessRewardInput): SupplierWalletCreditResult {
    const decision = evaluateSupplierSuccessReward(input);
    if (!decision.eligible) {
      return {
        ok: false,
        denyReason: decision.denyReason,
        missingCompletionSignal: decision.missingCompletionSignal,
      };
    }
    const clientCheck = assertClientCannotSetSupplierWalletAmount(
      input.clientRequestedAmount,
      decision.amountInr,
    );
    if (!clientCheck.ok) {
      return { ok: false, denyReason: clientCheck.reason };
    }
    return {
      ok: true,
      amountInr: decision.amountInr,
      idempotencyKey: decision.idempotencyKeySeed,
    };
  }

  isLedgerEventAllowed(eventType: string): eventType is SupplierWalletLedgerEventType {
    return eventType === 'SUPPLIER_REFERRAL_BONUS' || eventType === 'SUPPLIER_SUCCESS_REWARD';
  }
}

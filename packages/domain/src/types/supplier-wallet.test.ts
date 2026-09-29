import { describe, expect, it } from 'vitest';
import {
  evaluateSupplierReferralBonus,
  evaluateSupplierSuccessReward,
  isRemovedSupplierCashbackPath,
  assertClientCannotSetSupplierWalletAmount,
  SupplierWalletLedgerEventType,
  REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE,
} from './supplier-wallet';

describe('supplier wallet — cashback removed', () => {
  it('flags removed supplier cashback ledger types', () => {
    expect(isRemovedSupplierCashbackPath('supplier_cashback')).toBe(true);
    expect(isRemovedSupplierCashbackPath(REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE)).toBe(true);
    expect(isRemovedSupplierCashbackPath('REWARD_CREDIT')).toBe(false);
  });

  it('does not define supplier cashback in active ledger event types', () => {
    const values = Object.values(SupplierWalletLedgerEventType);
    expect(values).not.toContain('SUPPLIER_CASHBACK');
    expect(values).toContain('SUPPLIER_REFERRAL_BONUS');
    expect(values).toContain('SUPPLIER_SUCCESS_REWARD');
  });
});

describe('supplier referral bonus', () => {
  it('denies self-referral', () => {
    const d = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-1',
      referredVerificationStatus: 'VERIFIED',
      referrerEqualsReferred: true,
    });
    expect(d.eligible).toBe(false);
    expect(d.denyReason).toBe('SELF_REFERRAL');
  });

  it('denies circular referral', () => {
    const d = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'VERIFIED',
      circularReferralDetected: true,
    });
    expect(d.denyReason).toBe('CIRCULAR_REFERRAL');
  });

  it('denies duplicate credit', () => {
    const d = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'VERIFIED',
      existingCreditsForPair: true,
    });
    expect(d.denyReason).toBe('DUPLICATE_CREDIT');
  });

  it('denies supplier referrer without a completed OTP transaction', () => {
    const d = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'VERIFIED',
      referrerHasCompletedOtpTransaction: false,
    });
    expect(d.eligible).toBe(false);
    expect(d.denyReason).toBe('REFERRER_TRANSACTION_GATE');
  });

  it('uses referred profile for referral amount after OTP verification', () => {
    const msme = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'VERIFIED',
      referredProfileKind: 'MSME',
    });
    expect(msme.eligible).toBe(true);
    expect(msme.amountInr).toBe(50);
  });

  it('credits ₹100 for referred supplier profile by default', () => {
    const pending = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'PENDING',
    });
    expect(pending.eligible).toBe(false);

    const ok = evaluateSupplierReferralBonus({
      referrerOrgId: 'org-1',
      referredSupplierId: 'sup-2',
      referredVerificationStatus: 'VERIFIED',
      referredLifecycleTier: 'OTP_VERIFIED',
    });
    expect(ok.eligible).toBe(true);
    expect(ok.amountInr).toBe(100);
  });
});

describe('supplier success reward', () => {
  it('denies duplicate reward', () => {
    const d = evaluateSupplierSuccessReward({
      beneficiaryOrgId: 'org-s',
      supplierId: 'sup-s',
      platformFeeTransactionId: 'fee-1',
      platformFeeStatus: 'SETTLED',
      priorSuccessRewardCredited: true,
    });
    expect(d.denyReason).toBe('DUPLICATE_REWARD');
  });

  it('requires SETTLED platform fee — documents missing signal when absent', () => {
    const d = evaluateSupplierSuccessReward({
      beneficiaryOrgId: 'org-s',
      supplierId: 'sup-s',
    });
    expect(d.eligible).toBe(false);
    expect(d.missingCompletionSignal).toMatch(/platform_fee_transactions/);
  });

  it('ignores client-supplied amount overrides', () => {
    const server = 100;
    expect(assertClientCannotSetSupplierWalletAmount(50, server).ok).toBe(false);
    expect(assertClientCannotSetSupplierWalletAmount(100, server).ok).toBe(true);
  });
});

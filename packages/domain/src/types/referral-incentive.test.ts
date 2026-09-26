import { describe, it, expect } from 'vitest';
import {
  REFERRAL_REWARD_PERCENTAGE,
  REFERRAL_QUALIFICATION_WINDOW_DAYS,
  normalizeReferralCode,
  validateReferralCodeFormat,
  generatePersistentReferralCode,
  calculateReferralReward,
  assertReferralWalletUsagePolicy,
} from './referral-incentive';

describe('Referral & Incentive System Domain Engine (Stage R2-27)', () => {
  describe('Constants & Code Generation', () => {
    it('enforces 10% referral reward percentage and 30-day qualification window', () => {
      expect(REFERRAL_REWARD_PERCENTAGE).toBe(10.0);
      expect(REFERRAL_QUALIFICATION_WINDOW_DAYS).toBe(30);
    });

    it('normalizes referral codes cleanly', () => {
      expect(normalizeReferralCode('  ref-blr-014  ')).toBe('REF-BLR-014');
      expect(normalizeReferralCode('otp 999 123')).toBe('OTP-999-123');
      expect(normalizeReferralCode('')).toBe('');
    });

    it('validates referral code formatting', () => {
      expect(validateReferralCodeFormat('OTP-A1B2C3')).toBe(true);
      expect(validateReferralCodeFormat('REF-12345')).toBe(true);
      expect(validateReferralCodeFormat('BNI-BLR-014')).toBe(true);
      expect(validateReferralCodeFormat('AB')).toBe(false); // too short
      expect(validateReferralCodeFormat('INVALID CODE WITH @#$!*')).toBe(false);
    });

    it('generates persistent deterministic referral code from identifier', () => {
      const code1 = generatePersistentReferralCode('user_abc123456');
      const code2 = generatePersistentReferralCode('user_abc123456');
      expect(code1).toBe(code2);
      expect(code1.startsWith('OTP-')).toBe(true);
      expect(validateReferralCodeFormat(code1)).toBe(true);
    });
  });

  describe('10% Referral Reward Calculation & Qualification Engine', () => {
    const referrerId = 'referrer-user-111';
    const referredId = 'referred-user-222';
    const attributionDate = '2026-09-01T10:00:00Z';

    it('calculates exact 10% reward for first successful subscription payment within 30 days', () => {
      const paymentDate = '2026-09-15T12:00:00Z'; // 14 days later (within 30 days)
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate,
        subscriptionPaidAmount: 1999.0, // ₹1,999 Annual Individual Plan
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(true);
      expect(result.rewardAmount).toBe(199.9);
      expect(result.formattedRewardAmount).toBe('₹199.90');
      expect(result.status).toBe('QUALIFIED');
      expect(result.isWithinWindow).toBe(true);
      expect(result.qualificationDaysElapsed).toBe(14);
    });

    it('calculates exact 10% reward for monthly ₹199 plan', () => {
      const paymentDate = '2026-09-02T10:00:00Z'; // 1 day later
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate,
        subscriptionPaidAmount: 199.0,
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(true);
      expect(result.rewardAmount).toBe(19.9);
      expect(result.formattedRewardAmount).toBe('₹19.90');
    });

    it('calculates exact 10% reward for MSME ₹19,999 annual plan', () => {
      const paymentDate = '2026-09-20T10:00:00Z';
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate,
        subscriptionPaidAmount: 19999.0,
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(true);
      expect(result.rewardAmount).toBe(1999.9);
      expect(result.formattedRewardAmount).toBe('₹1,999.90');
    });

    it('strictly rejects self-referral (referrerId === referredId)', () => {
      const result = calculateReferralReward({
        referrerId: 'user-same-123',
        referredId: 'user-same-123',
        attributionDate,
        paymentDate: '2026-09-05T10:00:00Z',
        subscriptionPaidAmount: 1999.0,
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(false);
      expect(result.rewardAmount).toBe(0);
      expect(result.disqualificationReason).toBe('SELF_REFERRAL');
      expect(result.status).toBe('DISQUALIFIED');
    });

    it('strictly rejects when isSameAccountOrIdentity flag is true', () => {
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate: '2026-09-05T10:00:00Z',
        subscriptionPaidAmount: 1999.0,
        isFirstSuccessfulPayment: true,
        isSameAccountOrIdentity: true,
      });

      expect(result.isEligible).toBe(false);
      expect(result.disqualificationReason).toBe('SELF_REFERRAL');
    });

    it('strictly rejects subsequent or renewal payments (not first payment)', () => {
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate: '2026-09-10T10:00:00Z',
        subscriptionPaidAmount: 1999.0,
        isFirstSuccessfulPayment: false, // Second payment / Renewal
      });

      expect(result.isEligible).toBe(false);
      expect(result.rewardAmount).toBe(0);
      expect(result.disqualificationReason).toBe('NOT_FIRST_PAYMENT');
      expect(result.status).toBe('DISQUALIFIED');
    });

    it('strictly rejects payments made after 30-day qualification window (e.g. 35 days)', () => {
      const paymentDate = '2026-10-06T10:00:00Z'; // 35 days later
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate,
        subscriptionPaidAmount: 1999.0,
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(false);
      expect(result.rewardAmount).toBe(0);
      expect(result.isWithinWindow).toBe(false);
      expect(result.qualificationDaysElapsed).toBe(35);
      expect(result.disqualificationReason).toBe('QUALIFICATION_WINDOW_EXPIRED');
      expect(result.status).toBe('EXPIRED');
    });

    it('strictly rejects already rewarded idempotent calls', () => {
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate: '2026-09-10T10:00:00Z',
        subscriptionPaidAmount: 1999.0,
        isFirstSuccessfulPayment: true,
        existingRewardProcessed: true,
      });

      expect(result.isEligible).toBe(false);
      expect(result.rewardAmount).toBe(0);
      expect(result.disqualificationReason).toBe('ALREADY_REWARDED');
    });

    it('rejects zero or negative subscription payment amount', () => {
      const result = calculateReferralReward({
        referrerId,
        referredId,
        attributionDate,
        paymentDate: '2026-09-05T10:00:00Z',
        subscriptionPaidAmount: 0,
        isFirstSuccessfulPayment: true,
      });

      expect(result.isEligible).toBe(false);
      expect(result.disqualificationReason).toBe('INVALID_SUBSCRIPTION_AMOUNT');
    });
  });

  describe('Referral Reward Wallet Restriction Policy', () => {
    it('allows subscription purchase, subscription renewal, and RFQ top-up', () => {
      expect(assertReferralWalletUsagePolicy('SUBSCRIPTION_PURCHASE').isAllowed).toBe(true);
      expect(assertReferralWalletUsagePolicy('SUBSCRIPTION_RENEWAL').isAllowed).toBe(true);
      expect(assertReferralWalletUsagePolicy('RFQ_TOPUP').isAllowed).toBe(true);
    });

    it('strictly blocks cash withdrawal', () => {
      const result = assertReferralWalletUsagePolicy('CASH_WITHDRAWAL');
      expect(result.isAllowed).toBe(false);
      expect(result.error).toContain('cannot be withdrawn as cash');
    });

    it('strictly blocks procurement GMV payment and direct supplier disbursement', () => {
      const r1 = assertReferralWalletUsagePolicy('GMV_PAYMENT');
      expect(r1.isAllowed).toBe(false);
      expect(r1.error).toContain('cannot be used for procurement GMV settlement');

      const r2 = assertReferralWalletUsagePolicy('SUPPLIER_DISBURSEMENT');
      expect(r2.isAllowed).toBe(false);
      expect(r2.error).toContain('cannot be used for procurement GMV settlement');
    });
  });
});

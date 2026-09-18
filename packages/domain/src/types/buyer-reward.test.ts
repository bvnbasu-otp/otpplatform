import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MONETARY_CLASSES,
  calculateBuyerReward,
  calculateSubscriptionDiscount,
  calculateWalletBalanceAfterRedemption,
  canTransitionRewardAllocation,
  validateCommercialConservation,
  validateCommercialMonetaryClass,
  type BuyerRewardCalculationParams,
} from './buyer-reward';

describe('OTP Phase 6.4: Buyer Sourcing Reward & Commercial Domain Model', () => {
  describe('8 Commercial Monetary Classes Segregation', () => {
    it('defines and validates all 8 commercial monetary classes', () => {
      expect(COMMERCIAL_MONETARY_CLASSES).toHaveLength(8);
      expect(COMMERCIAL_MONETARY_CLASSES).toEqual([
        'PROCUREMENT_VALUE',
        'SUBSCRIPTION',
        'PLATFORM_FEE',
        'WALLET_CREDITS',
        'SOURCING_REWARDS',
        'GST',
        'TDS',
        'SUPPLIER_SETTLEMENT',
      ]);

      for (const cls of COMMERCIAL_MONETARY_CLASSES) {
        expect(validateCommercialMonetaryClass(cls)).toBe(true);
      }

      expect(validateCommercialMonetaryClass('INVALID_CLASS')).toBe(false);
      expect(validateCommercialMonetaryClass('')).toBe(false);
    });
  });

  describe('Buyer Sourcing Reward Calculation Engine', () => {
    it('calculates standard reward for ₹1,00,000 procurement base (0.50% fee * 20% share = 0.10% net = ₹100.00)', () => {
      const params: BuyerRewardCalculationParams = {
        procurementBaseAmount: 100000,
        platformFeeRate: 0.50,
        rewardShareRate: 20.0,
      };

      const result = calculateBuyerReward(params);
      expect(result.procurementBaseAmount).toBe(100000);
      expect(result.platformFeeRate).toBe(0.50);
      expect(result.platformFeeAmount).toBe(500.00);
      expect(result.rewardShareRate).toBe(20.0);
      expect(result.rewardAmount).toBe(100.00);
      expect(result.effectiveRewardRate).toBe(0.10);
    });

    it('calculates configurable fee and reward rates dynamically without hardcoding', () => {
      // 1.0% fee * 30% share on ₹2,50,000 = ₹2,500 fee * 30% = ₹750 reward (0.30% net)
      const res1 = calculateBuyerReward({
        procurementBaseAmount: 250000,
        platformFeeRate: 1.00,
        rewardShareRate: 30.0,
      });
      expect(res1.platformFeeAmount).toBe(2500.00);
      expect(res1.rewardAmount).toBe(750.00);
      expect(res1.effectiveRewardRate).toBe(0.30);

      // 0.25% fee * 10% share on ₹5,00,000 = ₹1,250 fee * 10% = ₹125 reward (0.025% net)
      const res2 = calculateBuyerReward({
        procurementBaseAmount: 500000,
        platformFeeRate: 0.25,
        rewardShareRate: 10.0,
      });
      expect(res2.platformFeeAmount).toBe(1250.00);
      expect(res2.rewardAmount).toBe(125.00);
      expect(res2.effectiveRewardRate).toBe(0.025);
    });

    it('handles exact decimal paise rounding on fractional amounts', () => {
      // Base: ₹12,345.67, Fee: 0.50% => ₹61.73 fee, Reward: 20% => ₹12.35 reward
      const res = calculateBuyerReward({
        procurementBaseAmount: 12345.67,
        platformFeeRate: 0.50,
        rewardShareRate: 20.0,
      });
      expect(res.procurementBaseAmount).toBe(12345.67);
      expect(res.platformFeeAmount).toBe(61.73);
      expect(res.rewardAmount).toBe(12.35);
    });

    it('enforces min and max reward bounds when specified', () => {
      const resMin = calculateBuyerReward({
        procurementBaseAmount: 1000, // standard reward = 1000 * 0.5% * 20% = ₹1.00
        platformFeeRate: 0.50,
        rewardShareRate: 20.0,
        minReward: 5.00,
      });
      expect(resMin.rewardAmount).toBe(5.00);

      const resMax = calculateBuyerReward({
        procurementBaseAmount: 10000000, // standard reward = 10000000 * 0.5% * 20% = ₹10,000.00
        platformFeeRate: 0.50,
        rewardShareRate: 20.0,
        maxReward: 2000.00,
      });
      expect(resMax.rewardAmount).toBe(2000.00);
    });

    it('enforces invariant that reward cannot exceed platform fee amount collected', () => {
      const res = calculateBuyerReward({
        procurementBaseAmount: 10000, // fee = ₹50.00
        platformFeeRate: 0.50,
        rewardShareRate: 20.0,
        minReward: 100.00, // artificially high min reward
      });
      // Reward capped at platform fee amount (₹50.00)
      expect(res.rewardAmount).toBe(50.00);
      expect(res.rewardAmount).toBeLessThanOrEqual(res.platformFeeAmount);
    });

    it('returns zero reward for non-positive or zero base amount', () => {
      expect(
        calculateBuyerReward({
          procurementBaseAmount: 0,
          platformFeeRate: 0.50,
          rewardShareRate: 20.0,
        }).rewardAmount,
      ).toBe(0);

      expect(
        calculateBuyerReward({
          procurementBaseAmount: -5000,
          platformFeeRate: 0.50,
          rewardShareRate: 20.0,
        }).rewardAmount,
      ).toBe(0);
    });

    it('throws error for invalid rates outside 0-100 range', () => {
      expect(() =>
        calculateBuyerReward({
          procurementBaseAmount: 10000,
          platformFeeRate: -0.5,
          rewardShareRate: 20.0,
        }),
      ).toThrow();

      expect(() =>
        calculateBuyerReward({
          procurementBaseAmount: 10000,
          platformFeeRate: 0.50,
          rewardShareRate: 150.0,
        }),
      ).toThrow();
    });
  });

  describe('Wallet Balance Validation & Redemption Logic', () => {
    it('validates successful credit redemption with remaining balance', () => {
      const res = calculateWalletBalanceAfterRedemption(500.00, 200.00);
      expect(res.isValid).toBe(true);
      expect(res.currentBalance).toBe(500.00);
      expect(res.creditsToRedeem).toBe(200.00);
      expect(res.remainingBalance).toBe(300.00);
    });

    it('validates exact full balance redemption with 0 remaining', () => {
      const res = calculateWalletBalanceAfterRedemption(500.00, 500.00);
      expect(res.isValid).toBe(true);
      expect(res.remainingBalance).toBe(0.00);
    });

    it('rejects over-redemption when debit amount exceeds available balance', () => {
      const res = calculateWalletBalanceAfterRedemption(100.00, 250.00);
      expect(res.isValid).toBe(false);
      expect(res.remainingBalance).toBe(100.00);
      expect(res.error).toContain('Insufficient wallet balance');
    });

    it('rejects negative redemption amounts', () => {
      const res = calculateWalletBalanceAfterRedemption(100.00, -50.00);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot be negative');
    });
  });

  describe('Subscription Discount & Wallet Application Logic', () => {
    it('computes partial wallet discount with remaining cash payable', () => {
      // Monthly Tier 1 = ₹99, Wallet has ₹50
      const res = calculateSubscriptionDiscount(99.00, 50.00);
      expect(res.subscriptionAmount).toBe(99.00);
      expect(res.availableWalletCredits).toBe(50.00);
      expect(res.creditsApplied).toBe(50.00);
      expect(res.cashPayable).toBe(49.00);
      expect(res.remainingCredits).toBe(0.00);
      expect(res.isFullyCovered).toBe(false);
    });

    it('computes 100% full wallet coverage when wallet credits exceed subscription price', () => {
      // Monthly Tier 1 = ₹99, Wallet has ₹250
      const res = calculateSubscriptionDiscount(99.00, 250.00);
      expect(res.subscriptionAmount).toBe(99.00);
      expect(res.availableWalletCredits).toBe(250.00);
      expect(res.creditsApplied).toBe(99.00);
      expect(res.cashPayable).toBe(0.00);
      expect(res.remainingCredits).toBe(151.00);
      expect(res.isFullyCovered).toBe(true);
    });

    it('handles yearly subscription with partial wallet credits', () => {
      // Yearly Tier 1 = ₹999, Wallet has ₹450
      const res = calculateSubscriptionDiscount(999.00, 450.00);
      expect(res.subscriptionAmount).toBe(999.00);
      expect(res.creditsApplied).toBe(450.00);
      expect(res.cashPayable).toBe(549.00);
      expect(res.remainingCredits).toBe(0.00);
      expect(res.isFullyCovered).toBe(false);
    });

    it('handles 0 subscription amount gracefully', () => {
      const res = calculateSubscriptionDiscount(0, 100.00);
      expect(res.creditsApplied).toBe(0);
      expect(res.cashPayable).toBe(0);
      expect(res.remainingCredits).toBe(100.00);
      expect(res.isFullyCovered).toBe(true);
    });
  });

  describe('Commercial Conservation & Financial Integrity Invariants', () => {
    it('verifies financial conservation invariant: Adjusted Gross = TDS + Platform Fee + Supplier Net Settlement', () => {
      const result = validateCommercialConservation({
        grossInvoiceAmount: 100000.00,
        debitAdjustments: 2000.00,
        creditAdjustments: 0.00,
        tdsAmount: 980.00, // 1% of 98,000
        platformFeeAmount: 490.00, // 0.5% of 98,000
        supplierNetSettlement: 96530.00, // 98,000 - 980 - 490
        buyerRewardAmount: 98.00, // 20% of 490
      });

      expect(result.adjustedGrossAmount).toBe(98000.00);
      expect(result.totalOutflowObligation).toBe(98000.00);
      expect(result.isConserved).toBe(true);
      expect(result.variance).toBe(0);
      expect(result.buyerRewardAmount).toBe(98.00);
      expect(result.platformFeeNetRetained).toBe(392.00); // 490 - 98
    });

    it('flags variance when financial conservation is violated', () => {
      const result = validateCommercialConservation({
        grossInvoiceAmount: 100000.00,
        tdsAmount: 1000.00,
        platformFeeAmount: 500.00,
        supplierNetSettlement: 99000.00, // Total = 100500 != 100000
      });

      expect(result.isConserved).toBe(false);
      expect(result.variance).toBe(500.00);
    });
  });

  describe('Buyer Reward Allocation State Transitions', () => {
    it('allows valid lifecycle transitions', () => {
      expect(canTransitionRewardAllocation('PENDING', 'CREDITED')).toBe(true);
      expect(canTransitionRewardAllocation('PENDING', 'REVERSED')).toBe(true);
      expect(canTransitionRewardAllocation('CREDITED', 'REVERSED')).toBe(true);
      expect(canTransitionRewardAllocation('CREDITED', 'CREDITED')).toBe(true);
    });

    it('disallows invalid lifecycle transitions', () => {
      expect(canTransitionRewardAllocation('REVERSED', 'CREDITED')).toBe(false);
      expect(canTransitionRewardAllocation('REVERSED', 'PENDING')).toBe(false);
      expect(canTransitionRewardAllocation('CREDITED', 'PENDING')).toBe(false);
    });
  });
});

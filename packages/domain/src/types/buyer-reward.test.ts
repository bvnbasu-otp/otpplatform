import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MONETARY_CLASSES,
  ROLLING_BENEFIT_VALIDITY_DAYS,
  calculateActiveWalletBalance,
  calculateBuyerReward,
  calculateSubscriptionDiscount,
  calculateWalletBalanceAfterRedemption,
  canTransitionRewardAllocation,
  computeCreditExpiryDate,
  consumeWalletCreditsFefo,
  isCreditValid,
  validateCommercialConservation,
  validateCommercialMonetaryClass,
  type BuyerRewardCalculationParams,
  type WalletCreditLot,
} from './buyer-reward';
import { BUYER_REWARD_POLICY } from './pricing-entitlement';

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

  // ===========================================================================
  // ROLLING 365-DAY VALIDITY & FEFO REDEMPTION MATRIX (PHASE 3 CERTIFICATION)
  // ===========================================================================
  describe('Rolling 365-Day Validity & FEFO Credit Redemption Suite', () => {
    // Case 1: Normal Expiry
    it('Case 1: Normal expiry (15-Sep-2026 -> valid through 365-day boundary, expired after)', () => {
      const creditedAt = '2026-09-15T12:00:00.000Z';
      const expiresAt = computeCreditExpiryDate(creditedAt, ROLLING_BENEFIT_VALIDITY_DAYS);
      expect(expiresAt).toBe('2027-09-15T12:00:00.000Z');

      const creditLot: WalletCreditLot = {
        id: 'lot-case-1',
        amount: 150.0,
        creditedAt,
        expiresAt,
      };

      // Valid right before boundary
      expect(isCreditValid(creditLot, '2027-09-15T11:59:59.999Z')).toBe(true);
      // Valid at exact boundary
      expect(isCreditValid(creditLot, '2027-09-15T12:00:00.000Z')).toBe(true);
      // Expired immediately after boundary
      expect(isCreditValid(creditLot, '2027-09-15T12:00:00.001Z')).toBe(false);
      expect(isCreditValid(creditLot, '2027-09-16T00:00:00.000Z')).toBe(false);
    });

    // Case 2: December Crossing
    it('Case 2: December crossing (20-Dec-2026 -> does NOT expire on 31-Dec-2026)', () => {
      const creditedAt = '2026-12-20T10:00:00.000Z';
      const expiresAt = computeCreditExpiryDate(creditedAt);
      expect(expiresAt).toBe('2027-12-20T10:00:00.000Z');

      const creditLot: WalletCreditLot = {
        id: 'lot-dec-crossing',
        amount: 250.0,
        creditedAt,
        expiresAt,
      };

      // CRITICAL INVARIANT: Rolling validity does NOT expire on Dec 31 calendar reset
      expect(isCreditValid(creditLot, '2026-12-31T23:59:59.999Z')).toBe(true);
      expect(isCreditValid(creditLot, '2027-01-01T00:00:00.000Z')).toBe(true);
      expect(isCreditValid(creditLot, '2027-06-15T12:00:00.000Z')).toBe(true);
      expect(isCreditValid(creditLot, '2027-12-20T09:59:59.000Z')).toBe(true);
      expect(isCreditValid(creditLot, '2027-12-20T10:00:01.000Z')).toBe(false);
    });

    // Case 3: January Crossing
    it('Case 3: January crossing (31-Jan-2027 -> valid until its own 365-day expiry in 2028)', () => {
      const creditedAt = '2027-01-31T15:30:00.000Z';
      const expiresAt = computeCreditExpiryDate(creditedAt);
      expect(expiresAt).toBe('2028-01-31T15:30:00.000Z');

      const creditLot: WalletCreditLot = {
        id: 'lot-jan-crossing',
        amount: 500.0,
        creditedAt,
        expiresAt,
      };

      // Valid throughout 2027 and into Jan 2028
      expect(isCreditValid(creditLot, '2027-12-31T23:59:59.999Z')).toBe(true);
      expect(isCreditValid(creditLot, '2028-01-15T10:00:00.000Z')).toBe(true);
      expect(isCreditValid(creditLot, '2028-01-31T15:30:00.000Z')).toBe(true);
      expect(isCreditValid(creditLot, '2028-01-31T15:30:01.000Z')).toBe(false);
    });

    // Case 4: Multiple Credits with Independent Expiry Dates
    it('Case 4: Multiple credits have independent rolling expiry dates and calculate active balance accurately', () => {
      const lots: WalletCreditLot[] = [
        {
          id: 'lot-A',
          amount: 100.0,
          creditedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2027-08-01T00:00:00.000Z',
        },
        {
          id: 'lot-B',
          amount: 150.0,
          creditedAt: '2026-11-15T00:00:00.000Z',
          expiresAt: '2027-11-15T00:00:00.000Z',
        },
        {
          id: 'lot-C',
          amount: 200.0,
          creditedAt: '2027-02-10T00:00:00.000Z',
          expiresAt: '2028-02-10T00:00:00.000Z',
        },
      ];

      // On 2027-05-01: All 3 lots active (100 + 150 + 200 = 450)
      expect(calculateActiveWalletBalance(lots, '2027-05-01T00:00:00.000Z')).toBe(450.0);

      // On 2027-09-01: Lot A expired, Lots B & C active (150 + 200 = 350)
      expect(calculateActiveWalletBalance(lots, '2027-09-01T00:00:00.000Z')).toBe(350.0);

      // On 2027-12-01: Lots A & B expired, only Lot C active (200)
      expect(calculateActiveWalletBalance(lots, '2027-12-01T00:00:00.000Z')).toBe(200.0);

      // On 2028-03-01: All lots expired (0)
      expect(calculateActiveWalletBalance(lots, '2028-03-01T00:00:00.000Z')).toBe(0.0);
    });

    // Case 5: Earliest Expiry (FEFO - First Expiry First Out)
    it('Case 5: Deterministically consumes credits in FEFO (First Expiry First Out) order', () => {
      const lots: WalletCreditLot[] = [
        {
          id: 'lot-late',
          amount: 100.0,
          creditedAt: '2027-01-01T00:00:00.000Z',
          expiresAt: '2028-01-01T00:00:00.000Z', // Expires latest
        },
        {
          id: 'lot-early',
          amount: 80.0,
          creditedAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2027-09-01T00:00:00.000Z', // Expires earliest
        },
        {
          id: 'lot-mid',
          amount: 120.0,
          creditedAt: '2026-11-01T00:00:00.000Z',
          expiresAt: '2027-11-01T00:00:00.000Z', // Expires mid
        },
      ];

      // Redeem ₹150 as of 2027-04-01
      const result = consumeWalletCreditsFefo(lots, 150.0, '2027-04-01T00:00:00.000Z');

      expect(result.requestedAmount).toBe(150.0);
      expect(result.redeemedAmount).toBe(150.0);
      expect(result.unfulfilledAmount).toBe(0);
      expect(result.isFullyCovered).toBe(true);
      expect(result.openingActiveBalance).toBe(300.0); // 80 + 120 + 100
      expect(result.closingActiveBalance).toBe(150.0);

      // Verify FEFO order: lot-early (80), then lot-mid (70), lot-late untouched
      expect(result.consumedLots).toHaveLength(2);
      expect(result.consumedLots[0]!.lotId).toBe('lot-early');
      expect(result.consumedLots[0]!.amountDeducted).toBe(80.0);
      expect(result.consumedLots[0]!.remainingInLot).toBe(0);

      expect(result.consumedLots[1]!.lotId).toBe('lot-mid');
      expect(result.consumedLots[1]!.amountDeducted).toBe(70.0);
      expect(result.consumedLots[1]!.remainingInLot).toBe(50.0);

      // Remaining active lots: lot-mid (50) and lot-late (100)
      expect(result.activeRemainingLots).toHaveLength(2);
      expect(result.activeRemainingLots.find((l) => l.id === 'lot-mid')?.amount).toBe(50.0);
      expect(result.activeRemainingLots.find((l) => l.id === 'lot-late')?.amount).toBe(100.0);
    });

    // Case 6: Expired Credit Rejection
    it('Case 6: Rejects expired credits from redemption and excludes them from available balance', () => {
      const lots: WalletCreditLot[] = [
        {
          id: 'lot-expired-1',
          amount: 300.0,
          creditedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:00:00.000Z', // Expired
        },
        {
          id: 'lot-active-1',
          amount: 75.0,
          creditedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2027-10-01T00:00:00.000Z', // Active
        },
      ];

      // As of 2027-06-01, request ₹100
      const res = consumeWalletCreditsFefo(lots, 100.0, '2027-06-01T00:00:00.000Z');

      expect(res.openingActiveBalance).toBe(75.0);
      expect(res.redeemedAmount).toBe(75.0);
      expect(res.unfulfilledAmount).toBe(25.0);
      expect(res.isFullyCovered).toBe(false);
      expect(res.expiredLotsExcluded).toHaveLength(1);
      expect(res.expiredLotsExcluded[0]!.id).toBe('lot-expired-1');
      expect(res.consumedLots).toHaveLength(1);
      expect(res.consumedLots[0]!.lotId).toBe('lot-active-1');
    });

    // Case 7: Concurrent Redemption Race Immunity
    it('Case 7: Demonstrates concurrency safety and double-spending protection across sequential atomic steps', () => {
      let currentLots: WalletCreditLot[] = [
        {
          id: 'lot-concurrent-1',
          amount: 100.0,
          creditedAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2027-09-01T00:00:00.000Z',
        },
      ];

      // Transaction A requests ₹80
      const txA = consumeWalletCreditsFefo(currentLots, 80.0, '2027-01-01T00:00:00.000Z');
      expect(txA.redeemedAmount).toBe(80.0);
      expect(txA.closingActiveBalance).toBe(20.0);
      currentLots = txA.activeRemainingLots;

      // Transaction B concurrently requests ₹50 (only ₹20 remaining)
      const txB = consumeWalletCreditsFefo(currentLots, 50.0, '2027-01-01T00:00:00.000Z');
      expect(txB.redeemedAmount).toBe(20.0);
      expect(txB.unfulfilledAmount).toBe(30.0);
      expect(txB.closingActiveBalance).toBe(0.0);
      currentLots = txB.activeRemainingLots;

      // Double spending prevented: total redeemed = 80 + 20 = 100 (never exceeds opening 100)
      expect(txA.redeemedAmount + txB.redeemedAmount).toBe(100.0);
      expect(calculateActiveWalletBalance(currentLots, '2027-01-01T00:00:00.000Z')).toBe(0.0);
    });

    // Case 8: Negative / Corrupted Value Protection
    it('Case 8: Protects against negative, NaN, and corrupted credit lots without arithmetic failure', () => {
      const corruptedLots: any[] = [
        { id: 'corrupt-1', amount: -500, creditedAt: '2026-09-01T00:00:00Z' },
        { id: 'corrupt-2', amount: NaN, creditedAt: '2026-09-01T00:00:00Z' },
        { id: 'corrupt-3', amount: 'not-a-number', creditedAt: '2026-09-01T00:00:00Z' },
        { id: 'valid-lot', amount: 50, creditedAt: '2026-09-01T00:00:00Z', expiresAt: '2027-09-01T00:00:00Z' },
        null,
        undefined,
      ];

      const balance = calculateActiveWalletBalance(corruptedLots, '2027-01-01T00:00:00Z');
      expect(balance).toBe(50.0);

      // Attempt negative redemption
      const negRedeem = consumeWalletCreditsFefo(corruptedLots, -100, '2027-01-01T00:00:00Z');
      expect(negRedeem.requestedAmount).toBe(0);
      expect(negRedeem.redeemedAmount).toBe(0);
      expect(negRedeem.closingActiveBalance).toBe(50.0);
    });

    // Case 9: Public Leakage Verification
    it('Case 9: Verifies public disclosure texts do NOT leak internal 0.1% rate or architectural details', () => {
      // 1. BUYER_REWARD_POLICY public text
      expect(BUYER_REWARD_POLICY.publicDescription).not.toContain('0.1%');
      expect(BUYER_REWARD_POLICY.publicDescription).not.toContain('0.10%');
      expect(BUYER_REWARD_POLICY.publicDescription).not.toMatch(/fee.*share|algorithm|formula/i);
      expect(BUYER_REWARD_POLICY.publicDescription).toContain('OTP Wallet Credits');

      // 2. Rules text
      for (const rule of BUYER_REWARD_POLICY.walletRules) {
        expect(rule).not.toContain('0.1%');
        expect(rule).not.toContain('0.10%');
        expect(rule).not.toMatch(/database|sql|rpc|postgres/i);
      }
    });
  });
});


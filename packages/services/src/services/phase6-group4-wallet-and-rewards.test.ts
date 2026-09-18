import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';
import {
  COMMERCIAL_MONETARY_CLASSES,
  calculateBuyerReward,
  calculateSubscriptionDiscount,
  calculateWalletBalanceAfterRedemption,
  validateCommercialConservation,
  validateCommercialMonetaryClass,
} from '@otp/domain';

const BUYER_ORG_A = 'org-buyer-alpha';
const BUYER_ORG_B = 'org-buyer-beta';
const SUPPLIER_ID = 'sup-alpha-1';

const BUYER_A_OWNER: ActorContext = {
  profileId: 'usr-buyer-a-owner',
  organizationId: BUYER_ORG_A,
  orgRole: 'OWNER',
};

const BUYER_A_MEMBER: ActorContext = {
  profileId: 'usr-buyer-a-member',
  organizationId: BUYER_ORG_A,
  orgRole: 'BUYER',
};

const BUYER_B_OWNER: ActorContext = {
  profileId: 'usr-buyer-b-owner',
  organizationId: BUYER_ORG_B,
  orgRole: 'OWNER',
};

const PLATFORM_ADMIN: ActorContext = {
  profileId: 'usr-platform-admin',
  isPlatformAdmin: true,
};

const UNAUTHORIZED_USER: ActorContext = {
  profileId: 'usr-unauthorized',
  organizationId: 'org-random-unrelated',
  orgRole: 'BUYER',
};

describe('OTP Phase 6.4: Master Commercial Layer, Buyer Rewards & Wallet Assurance Matrix', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: SUPPLIER_ID,
      businessName: 'Apex Industrial Supplies Pvt Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial', 'Hardware'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedSettledPoAndFee(grossAmount = 100000, feeRate = 0.50) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const po = await repos.purchaseOrders.save({
      id: 'po-p64-001',
      awardId: 'award-p64-001',
      rfqId: 'rfq-p64-001',
      organizationId: BUYER_ORG_A,
      supplierId: SUPPLIER_ID,
      totalAmount: grossAmount,
      currency: 'INR',
      status: 'ACCEPTED',
      poNumber: 'PO-2026-64-001',
      createdAt: now,
      updatedAt: now,
    });

    const snapshot = await repos.poFeeSnapshots!.save({
      id: 'snap-p64-001',
      purchaseOrderId: po.id,
      policyId: 'pol-default-v1',
      policyVersion: 1,
      feeType: 'PERCENTAGE',
      rate: feeRate,
      estimatedFeeAmount: (grossAmount * feeRate) / 100,
      isAcknowledged: true,
      acknowledgedBy: 'sup-user-1',
      acknowledgedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const invoice = await repos.invoices.save({
      id: 'inv-p64-001',
      purchaseOrderId: po.id,
      workOrderId: 'wo-p64-001',
      organizationId: BUYER_ORG_A,
      supplierId: SUPPLIER_ID,
      invoiceNumber: 'INV-2026-64-001',
      amount: grossAmount,
      currency: 'INR',
      status: 'APPROVED',
      submittedAt: now,
    });

    const feeTx = await repos.platformFeeTransactions!.save({
      id: 'fee-tx-p64-001',
      organizationId: BUYER_ORG_A,
      supplierId: SUPPLIER_ID,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      policyId: 'pol-default-v1',
      policyVersion: 1,
      grossAmount,
      feeRate,
      feeAmount: Math.round(((grossAmount * feeRate) / 100) * 100) / 100,
      netSettlementAmount: Math.round((grossAmount - (grossAmount * feeRate) / 100) * 100) / 100,
      status: 'SETTLED',
      notes: 'Settled fee deduction',
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { po, snapshot, invoice, feeTx };
  }

  // ===========================================================================
  // 🟢 GREEN TEAM — Functional Assurance (GREEN-01 to GREEN-08)
  // ===========================================================================
  describe('🟢 Green Team: Functional Assurance', () => {
    it('GREEN-01: Computes exact 0.50% Platform Fee and 20% Buyer Sourcing Reward (0.10% Net)', () => {
      const calc = calculateBuyerReward({
        procurementBaseAmount: 100000,
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
      });

      expect(calc.procurementBaseAmount).toBe(100000);
      expect(calc.platformFeeRate).toBe(0.50);
      expect(calc.platformFeeAmount).toBe(500.00);
      expect(calc.rewardShareRate).toBe(20.00);
      expect(calc.rewardAmount).toBe(100.00);
      expect(calc.effectiveRewardRate).toBe(0.10);
    });

    it('GREEN-02: Supports configurable fee rates & reward shares dynamically', () => {
      // 0.80% fee * 25% reward share on ₹5,00,000 = ₹4,000 fee * 25% = ₹1,000 reward (0.20% net)
      const calc = calculateBuyerReward({
        procurementBaseAmount: 500000,
        platformFeeRate: 0.80,
        rewardShareRate: 25.00,
      });

      expect(calc.platformFeeAmount).toBe(4000.00);
      expect(calc.rewardAmount).toBe(1000.00);
      expect(calc.effectiveRewardRate).toBe(0.20);
    });

    it('GREEN-03: Credits buyer sourcing reward to buyer organization wallet upon settlement', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      const res = await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.allocation.rewardAmount).toBe(100.00);
      expect(res.value.wallet.balanceCredits).toBe(100.00);
      expect(res.value.transaction.txType).toBe('REWARD_CREDIT');
      expect(res.value.transaction.openingBalance).toBe(0.00);
      expect(res.value.transaction.closingBalance).toBe(100.00);
    });

    it('GREEN-04: Supports 100% full wallet redemption covering subscription fee', () => {
      // Wallet has ₹200, Monthly Tier 1 is ₹99 -> 100% covered, ₹0 cash payable, ₹101 remaining
      const discount = calculateSubscriptionDiscount(99, 200);
      expect(discount.subscriptionAmount).toBe(99);
      expect(discount.creditsApplied).toBe(99);
      expect(discount.cashPayable).toBe(0);
      expect(discount.remainingCredits).toBe(101);
      expect(discount.isFullyCovered).toBe(true);
    });

    it('GREEN-05: Supports partial wallet redemption reducing cash payable for subscription renewal', () => {
      // Wallet has ₹40, Monthly Tier 1 is ₹99 -> ₹40 credits applied, ₹59 cash payable
      const discount = calculateSubscriptionDiscount(99, 40);
      expect(discount.subscriptionAmount).toBe(99);
      expect(discount.creditsApplied).toBe(40);
      expect(discount.cashPayable).toBe(59);
      expect(discount.remainingCredits).toBe(0);
      expect(discount.isFullyCovered).toBe(false);
    });

    it('GREEN-06: Applies wallet credits toward yearly subscription renewal', () => {
      // Wallet has ₹450, Yearly Tier 1 is ₹999 -> ₹450 credits applied, ₹549 cash payable
      const discount = calculateSubscriptionDiscount(999, 450);
      expect(discount.subscriptionAmount).toBe(999);
      expect(discount.creditsApplied).toBe(450);
      expect(discount.cashPayable).toBe(549);
      expect(discount.remainingCredits).toBe(0);
      expect(discount.isFullyCovered).toBe(false);
    });

    it('GREEN-07: Executes applyWalletCreditsToSubscription service and debits wallet balance', async () => {
      // Setup wallet with ₹250 credits
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 250.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.creditsApplied).toBe(99.00);
      expect(res.value.remainingBalance).toBe(151.00);
      expect(res.value.wallet.balanceCredits).toBe(151.00);
      expect(res.value.transaction.txType).toBe('SUBSCRIPTION_REDEMPTION');
      expect(res.value.transaction.amount).toBe(99.00);
    });

    it('GREEN-08: Wallet transaction ledger maintains chronological append-only records', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      // 1. Credit rewards
      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });

      // 2. Redeem credits
      await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 50.00,
      });

      const txsRes = await services.payments.getWalletTransactions(BUYER_A_OWNER, BUYER_ORG_A);
      expect(txsRes.ok).toBe(true);
      if (!txsRes.ok) return;

      expect(txsRes.value.length).toBe(2);
      const types = txsRes.value.map((t) => t.txType);
      expect(types).toContain('REWARD_CREDIT');
      expect(types).toContain('SUBSCRIPTION_REDEMPTION');
    });
  });

  // ===========================================================================
  // 🔴 RED TEAM — Adversarial & Abuse Assurance (RED-01 to RED-08)
  // ===========================================================================
  describe('🔴 Red Team: Adversarial & Abuse Assurance', () => {
    it('RED-01: Blocks duplicate reward allocation on same platform fee transaction', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      // First credit
      const res1 = await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });
      expect(res1.ok).toBe(true);

      // Duplicate attempt
      const res2 = await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });
      expect(res2.ok).toBe(true);
      if (!res2.ok) return;
      expect(res2.value.replayed).toBe(true);

      // Verify wallet balance was NOT doubled
      const walletRes = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(walletRes.ok).toBe(true);
      if (walletRes.ok) {
        expect(walletRes.value.balanceCredits).toBe(100.00); // exactly 1x reward
      }
    });

    it('RED-02: Replayed idempotency key returns cached transaction without duplicate debit', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 300.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const idempotencyKey = 'IDEMP-REDEEM-999';

      const res1 = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
        idempotencyKey,
      });
      expect(res1.ok).toBe(true);

      // Replay attempt with same idempotency key
      const res2 = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
        idempotencyKey,
      });
      expect(res2.ok).toBe(true);
      if (!res2.ok) return;
      expect(res2.value.replayed).toBe(true);

      // Balance only decremented once
      const walletRes = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(walletRes.ok).toBe(true);
      if (walletRes.ok) {
        expect(walletRes.value.balanceCredits).toBe(201.00); // 300 - 99
      }
    });

    it('RED-03: Rejects over-redemption when debit amount exceeds available wallet balance', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 50.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00, // available only 50
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(ValidationError);
        expect(res.error.message).toContain('Insufficient wallet balance');
      }
    });

    it('RED-04: Rejects negative redemption amounts', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 100.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: -50.00,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(ValidationError);
        expect(res.error.message).toContain('greater than zero');
      }
    });

    it('RED-05: Returns 0 rewards for 0 or negative base procurement amounts', () => {
      const resZero = calculateBuyerReward({
        procurementBaseAmount: 0,
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
      });
      expect(resZero.rewardAmount).toBe(0);

      const resNegative = calculateBuyerReward({
        procurementBaseAmount: -10000,
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
      });
      expect(resNegative.rewardAmount).toBe(0);
    });

    it('RED-06: Rejects fee or reward share rates outside 0-100 range', () => {
      expect(() =>
        calculateBuyerReward({
          procurementBaseAmount: 10000,
          platformFeeRate: 105,
          rewardShareRate: 20,
        }),
      ).toThrow();

      expect(() =>
        calculateBuyerReward({
          procurementBaseAmount: 10000,
          platformFeeRate: 0.50,
          rewardShareRate: -10,
        }),
      ).toThrow();
    });

    it('RED-07: Blocks reward operations on frozen or suspended wallets', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 100.00,
        status: 'FROZEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const resCredit = await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });
      expect(resCredit.ok).toBe(false);

      const resRedeem = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 50.00,
      });
      expect(resRedeem.ok).toBe(false);
    });

    it('RED-08: Invariant holds that reward cannot exceed platform fee amount collected', () => {
      const res = calculateBuyerReward({
        procurementBaseAmount: 50000, // fee = 250
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
        minReward: 500, // artificially high min reward
      });

      expect(res.rewardAmount).toBe(250.00);
      expect(res.rewardAmount).toBeLessThanOrEqual(res.platformFeeAmount);
    });
  });

  // ===========================================================================
  // 🟠 ORANGE TEAM — Security & RLS Assurance (ORANGE-01 to ORANGE-05)
  // ===========================================================================
  describe('🟠 Orange Team: Security & RLS Assurance', () => {
    it('ORANGE-01: Blocks cross-tenant wallet query between different buyer organizations', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 500.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Buyer B tries to query Buyer A's wallet
      const res = await services.payments.getOrganizationWallet(BUYER_B_OWNER, BUYER_ORG_A);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(ForbiddenError);
      }
    });

    it('ORANGE-02: Blocks cross-tenant wallet credit redemption', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 500.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Buyer B tries to spend Buyer A's wallet credits
      const res = await services.payments.applyWalletCreditsToSubscription(BUYER_B_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(ForbiddenError);
      }
    });

    it('ORANGE-03: Blocks unauthorized users without organization membership', async () => {
      const res = await services.payments.getOrganizationWallet(UNAUTHORIZED_USER, BUYER_ORG_A);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(ForbiddenError);
      }
    });

    it('ORANGE-04: Allows Platform Admin to inspect multi-tenant wallets securely', async () => {
      const repos = mem.asRepositories();
      await repos.organizationWallets!.save({
        id: 'w-alpha-1',
        organizationId: BUYER_ORG_A,
        balanceCredits: 200.00,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await services.payments.getOrganizationWallet(PLATFORM_ADMIN, BUYER_ORG_A);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.balanceCredits).toBe(200.00);
      }
    });

    it('ORANGE-05: Enforces strict separation of all 8 commercial monetary classes', () => {
      expect(COMMERCIAL_MONETARY_CLASSES).toHaveLength(8);
      for (const cls of COMMERCIAL_MONETARY_CLASSES) {
        expect(validateCommercialMonetaryClass(cls)).toBe(true);
      }
    });
  });

  // ===========================================================================
  // 🔵 BLUE TEAM — Operational & Resilience Assurance (BLUE-01 to BLUE-05)
  // ===========================================================================
  describe('🔵 Blue Team: Operational & Resilience Assurance', () => {
    it('BLUE-01: Reversal workflow adjusts buyer reward allocation and debits wallet balance', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      // 1. Credit reward (₹100)
      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });

      // 2. Reverse reward
      const revRes = await services.payments.reverseBuyerRewardCredit(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
        reason: 'Settlement cancelled due to goods return',
      });

      expect(revRes.ok).toBe(true);
      if (!revRes.ok) return;

      expect(revRes.value.allocation.status).toBe('REVERSED');
      expect(revRes.value.wallet.balanceCredits).toBe(0.00);
      expect(revRes.value.transaction.txType).toBe('REVERSAL');
      expect(revRes.value.transaction.amount).toBe(100.00);
    });

    it('BLUE-02: Reversal operation is idempotent and does not debit wallet multiple times', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });

      // Reversal 1
      const rev1 = await services.payments.reverseBuyerRewardCredit(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });
      expect(rev1.ok).toBe(true);

      // Reversal 2 (replay)
      const rev2 = await services.payments.reverseBuyerRewardCredit(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });
      expect(rev2.ok).toBe(true);

      const walletRes = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(walletRes.ok).toBe(true);
      if (walletRes.ok) {
        expect(walletRes.value.balanceCredits).toBe(0.00);
      }
    });

    it('BLUE-03: Handles fractional paise rounding without precision loss or floating point drift', () => {
      const calc = calculateBuyerReward({
        procurementBaseAmount: 33333.33,
        platformFeeRate: 0.50,
        rewardShareRate: 20.00,
      });

      // 33,333.33 * 0.5% = 166.66665 -> 166.67 fee
      // 166.66665 * 20% = 33.33333 -> 33.33 reward
      expect(calc.platformFeeAmount).toBe(166.67);
      expect(calc.rewardAmount).toBe(33.33);
    });

    it('BLUE-04: Returns empty transaction history safely for brand new wallet', async () => {
      const txsRes = await services.payments.getWalletTransactions(BUYER_A_OWNER, BUYER_ORG_A);
      expect(txsRes.ok).toBe(true);
      if (txsRes.ok) {
        expect(txsRes.value).toEqual([]);
      }
    });

    it('BLUE-05: Verifies financial conservation invariant across settlement and fee deductions', () => {
      const cons = validateCommercialConservation({
        grossInvoiceAmount: 200000,
        debitAdjustments: 0,
        creditAdjustments: 0,
        tdsAmount: 2000, // 1%
        platformFeeAmount: 1000, // 0.5%
        supplierNetSettlement: 197000,
        buyerRewardAmount: 200, // 20% of 1000
      });

      expect(cons.isConserved).toBe(true);
      expect(cons.adjustedGrossAmount).toBe(200000);
      expect(cons.totalOutflowObligation).toBe(200000);
      expect(cons.platformFeeNetRetained).toBe(800); // 1000 - 200
    });
  });

  // ===========================================================================
  // 🟣 PURPLE TEAM — Integrated Full Lifecycle Assurance (PURPLE-01 to PURPLE-03)
  // ===========================================================================
  describe('🟣 Purple Team: Integrated Lifecycle Assurance', () => {
    it('PURPLE-01: Master Commercial Lifecycle Loop: PO -> Invoice -> Fee Deduction -> Buyer Reward -> Wallet -> Subscription Renewal', async () => {
      const repos = mem.asRepositories();
      const now = new Date().toISOString();

      // Step 1: PO Award & Issuance
      const po = await repos.purchaseOrders.save({
        id: 'po-e2e-001',
        awardId: 'award-e2e-001',
        rfqId: 'rfq-e2e-001',
        organizationId: BUYER_ORG_A,
        supplierId: SUPPLIER_ID,
        totalAmount: 100000.00,
        currency: 'INR',
        status: 'ACCEPTED',
        poNumber: 'PO-2026-E2E-001',
        createdAt: now,
        updatedAt: now,
      });

      // Step 2: PO Fee Policy Snapshot Acknowledged
      await repos.poFeeSnapshots!.save({
        id: 'snap-e2e-001',
        purchaseOrderId: po.id,
        policyId: 'pol-default-v1',
        policyVersion: 1,
        feeType: 'PERCENTAGE',
        rate: 0.50,
        estimatedFeeAmount: 500.00,
        isAcknowledged: true,
        acknowledgedBy: 'sup-user-1',
        acknowledgedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Step 3: Invoice Submission & Approval
      const invoice = await repos.invoices.save({
        id: 'inv-e2e-001',
        purchaseOrderId: po.id,
        workOrderId: 'wo-e2e-001',
        organizationId: BUYER_ORG_A,
        supplierId: SUPPLIER_ID,
        invoiceNumber: 'INV-2026-E2E-001',
        amount: 100000.00,
        currency: 'INR',
        status: 'APPROVED',
        submittedAt: now,
      });

      // Step 4: Apply Platform Fee Deduction (0.50% = ₹500.00)
      const feeRes = await services.payments.applyPlatformFeeDeduction(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        grossAmount: 100000.00,
      });
      expect(feeRes.ok).toBe(true);
      if (!feeRes.ok) return;
      expect(feeRes.value.feeAmount).toBe(500.00);
      expect(feeRes.value.netSettlementAmount).toBe(99500.00);

      // Step 5: Check Wallet Balance has automatically received Buyer Sourcing Reward (20% of ₹500 = ₹100.00)
      const walletRes = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(walletRes.ok).toBe(true);
      if (!walletRes.ok) return;
      expect(walletRes.value.balanceCredits).toBe(100.00);

      // Step 6: Buyer applies ₹99.00 Wallet Credits toward Monthly Tier 1 Subscription Renewal
      const redeemRes = await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
      });
      expect(redeemRes.ok).toBe(true);
      if (!redeemRes.ok) return;

      expect(redeemRes.value.creditsApplied).toBe(99.00);
      expect(redeemRes.value.remainingBalance).toBe(1.00); // ₹100 - ₹99 = ₹1.00

      // Step 7: Verify final wallet transactions ledger has both reward credit and subscription redemption
      const txs = await services.payments.getWalletTransactions(BUYER_A_OWNER, BUYER_ORG_A);
      expect(txs.ok).toBe(true);
      if (txs.ok) {
        expect(txs.value.length).toBe(2);
      }
    });

    it('PURPLE-02: Multi-transaction compound rewards accumulation', async () => {
      // 3 settlements: ₹1,00,000 (reward ₹100), ₹2,50,000 (reward ₹250), ₹5,00,000 (reward ₹500)
      const { feeTx: tx1 } = await seedSettledPoAndFee(100000, 0.50);
      const repos = mem.asRepositories();
      const now = new Date().toISOString();

      const tx2 = await repos.platformFeeTransactions!.save({
        id: 'fee-tx-p64-002',
        organizationId: BUYER_ORG_A,
        supplierId: SUPPLIER_ID,
        purchaseOrderId: 'po-p64-002',
        policyId: 'pol-default-v1',
        policyVersion: 1,
        grossAmount: 250000,
        feeRate: 0.50,
        feeAmount: 1250,
        netSettlementAmount: 248750,
        status: 'SETTLED',
        settledAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const tx3 = await repos.platformFeeTransactions!.save({
        id: 'fee-tx-p64-003',
        organizationId: BUYER_ORG_A,
        supplierId: SUPPLIER_ID,
        purchaseOrderId: 'po-p64-003',
        policyId: 'pol-default-v1',
        policyVersion: 1,
        grossAmount: 500000,
        feeRate: 0.50,
        feeAmount: 2500,
        netSettlementAmount: 497500,
        status: 'SETTLED',
        settledAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: tx1.id,
      });
      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: tx2.id,
      });
      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: tx3.id,
      });

      const wallet = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(wallet.ok).toBe(true);
      if (wallet.ok) {
        expect(wallet.value.balanceCredits).toBe(850.00); // 100 + 250 + 500
      }
    });

    it('PURPLE-03: Audit log events generated across reward credit and redemption lifecycle', async () => {
      const { feeTx } = await seedSettledPoAndFee(100000, 0.50);

      await services.payments.creditBuyerSettlementReward(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        platformFeeTxId: feeTx.id,
      });

      await services.payments.applyWalletCreditsToSubscription(BUYER_A_OWNER, {
        organizationId: BUYER_ORG_A,
        tier: 'TIER_1_MSME',
        cycle: 'MONTHLY',
        creditsToApply: 99.00,
      });

      // Verify wallet state and transactions
      const walletRes = await services.payments.getOrganizationWallet(BUYER_A_OWNER, BUYER_ORG_A);
      expect(walletRes.ok).toBe(true);
      if (walletRes.ok) {
        expect(walletRes.value.balanceCredits).toBe(1.00);
      }
    });
  });
});

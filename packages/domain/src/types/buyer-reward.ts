/**
 * OTP Phase 6.4: Commercial Policy, Buyer Sourcing Rewards & Wallet Domain Model
 *
 * Implements the financial commercial chain:
 *   Supplier Platform Fee -> Buyer Sourcing Reward -> Buyer Wallet -> Future Buyer Subscription
 *
 * Invariants & Policies:
 * - Configurable Supplier Platform Fee (e.g. 0.50%).
 * - Configurable Buyer Reward Share:
 *     Buyer Reward = Applicable Base * Supplier Fee % * Buyer Reward % of Fee.
 *     Target baseline: 0.50% fee * 20% reward share = 0.10% net reward. (Not hard-coded).
 * - Strict segregation of 8 commercial monetary classes:
 *     1. PROCUREMENT_VALUE
 *     2. SUBSCRIPTION
 *     3. PLATFORM_FEE
 *     4. WALLET_CREDITS
 *     5. SOURCING_REWARDS
 *     6. GST
 *     7. TDS
 *     8. SUPPLIER_SETTLEMENT
 * - Financial Conservation Invariant:
 *     Adjusted Gross = TDS + Platform Fee + Supplier Net Settlement.
 *     Total Outflow Obligation is conserved.
 */

export type CommercialMonetaryClass =
  | 'PROCUREMENT_VALUE'
  | 'SUBSCRIPTION'
  | 'PLATFORM_FEE'
  | 'WALLET_CREDITS'
  | 'SOURCING_REWARDS'
  | 'GST'
  | 'TDS'
  | 'SUPPLIER_SETTLEMENT';

export const COMMERCIAL_MONETARY_CLASSES: readonly CommercialMonetaryClass[] = [
  'PROCUREMENT_VALUE',
  'SUBSCRIPTION',
  'PLATFORM_FEE',
  'WALLET_CREDITS',
  'SOURCING_REWARDS',
  'GST',
  'TDS',
  'SUPPLIER_SETTLEMENT',
] as const;

export type WalletStatus = 'ACTIVE' | 'FROZEN' | 'SUSPENDED';

export type WalletTransactionType =
  | 'REWARD_CREDIT'
  | 'SUBSCRIPTION_REDEMPTION'
  | 'REVERSAL'
  | 'ADJUSTMENT'
  | 'EXPIRY';

export type BuyerRewardAllocationStatus = 'PENDING' | 'CREDITED' | 'REVERSED';

export interface BuyerRewardPolicy {
  id: string;
  policyVersion: number;
  feeRate: number; // e.g. 0.50 for 0.50%
  rewardShareRate: number; // e.g. 20 for 20% of fee
  minRewardAmount?: number | null;
  maxRewardAmount?: number | null;
  effectiveFrom: string; // ISO timestamp
  effectiveTo?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DEPRECATED';
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationWallet {
  id: string;
  organizationId: string;
  balanceCredits: number;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  organizationId: string;
  walletId: string;
  txType: WalletTransactionType;
  amount: number;
  openingBalance: number;
  closingBalance: number;
  sourceEntityType: string;
  sourceEntityId?: string | null;
  idempotencyKey?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface BuyerRewardAllocation {
  id: string;
  organizationId: string;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  platformFeeTxId: string;
  settlementId?: string | null;
  procurementBaseAmount: number;
  feeRate: number;
  feeAmount: number;
  rewardShareRate: number;
  rewardAmount: number;
  status: BuyerRewardAllocationStatus;
  creditedAt?: string | null;
  reversedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerRewardCalculationParams {
  procurementBaseAmount: number;
  platformFeeRate: number; // e.g. 0.50 for 0.5%
  rewardShareRate: number; // e.g. 20.0 for 20% of fee
  minReward?: number;
  maxReward?: number;
}

export interface BuyerRewardCalculationResult {
  procurementBaseAmount: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  rewardShareRate: number;
  rewardAmount: number;
  effectiveRewardRate: number; // net % of procurementBaseAmount
}

export interface WalletBalanceValidationResult {
  currentBalance: number;
  creditsToRedeem: number;
  remainingBalance: number;
  isValid: boolean;
  error?: string;
}

export interface SubscriptionWalletDiscountResult {
  subscriptionAmount: number;
  availableWalletCredits: number;
  creditsApplied: number;
  cashPayable: number;
  remainingCredits: number;
  isFullyCovered: boolean;
}

export interface CommercialConservationValidationParams {
  grossInvoiceAmount: number;
  debitAdjustments?: number;
  creditAdjustments?: number;
  tdsAmount?: number;
  platformFeeAmount?: number;
  supplierNetSettlement?: number;
  buyerRewardAmount?: number;
  subscriptionAmount?: number;
  walletCreditsRedeemed?: number;
}

export interface CommercialConservationValidationResult {
  adjustedGrossAmount: number;
  tdsAmount: number;
  platformFeeAmount: number;
  supplierNetSettlement: number;
  totalOutflowObligation: number;
  buyerRewardAmount: number;
  platformFeeNetRetained: number; // platformFeeAmount - buyerRewardAmount
  isConserved: boolean;
  variance: number;
}

/**
 * Calculates deterministic buyer sourcing reward with exact 2-decimal paise rounding.
 * Formula:
 *   Platform Fee Amount = round(Procurement Base * Fee Rate / 100)
 *   Buyer Reward Amount = round(Procurement Base * (Fee Rate / 100) * (Reward Share Rate / 100))
 * Invariant: rewardAmount >= 0, rewardAmount <= platformFeeAmount.
 */
export function calculateBuyerReward(
  params: BuyerRewardCalculationParams,
): BuyerRewardCalculationResult {
  const base = Math.round(Number(params.procurementBaseAmount || 0) * 100) / 100;
  const feeRate = Number(params.platformFeeRate ?? 0);
  const rewardShareRate = Number(params.rewardShareRate ?? 0);

  if (feeRate < 0 || feeRate > 100) {
    throw new Error(`Invalid platform fee rate: ${feeRate}. Must be between 0 and 100.`);
  }

  if (rewardShareRate < 0 || rewardShareRate > 100) {
    throw new Error(`Invalid buyer reward share rate: ${rewardShareRate}. Must be between 0 and 100.`);
  }

  if (base <= 0 || feeRate === 0 || rewardShareRate === 0) {
    return {
      procurementBaseAmount: Math.max(0, base),
      platformFeeRate: feeRate,
      platformFeeAmount: 0,
      rewardShareRate: rewardShareRate,
      rewardAmount: 0,
      effectiveRewardRate: 0,
    };
  }

  // Exact paise computation for fee
  const rawFee = (base * feeRate) / 100;
  const platformFeeAmount = Math.round(rawFee * 100) / 100;

  // Reward computation = base * (feeRate / 100) * (rewardShareRate / 100)
  let rawReward = (base * feeRate * rewardShareRate) / 10000;

  if (params.minReward !== undefined && rawReward < params.minReward) {
    rawReward = params.minReward;
  }
  if (params.maxReward !== undefined && rawReward > params.maxReward) {
    rawReward = params.maxReward;
  }

  let rewardAmount = Math.round(rawReward * 100) / 100;

  // Invariant: Buyer reward cannot exceed the platform fee amount collected
  if (rewardAmount > platformFeeAmount) {
    rewardAmount = platformFeeAmount;
  }

  // Effective reward rate as net % of base
  const effectiveRewardRate =
    base > 0 ? Math.round(((rewardAmount / base) * 100) * 10000) / 10000 : 0;

  return {
    procurementBaseAmount: base,
    platformFeeRate: feeRate,
    platformFeeAmount,
    rewardShareRate,
    rewardAmount: Math.max(0, rewardAmount),
    effectiveRewardRate,
  };
}

/**
 * Validates wallet balance and calculates remaining balance after a debit/redemption.
 * Invariant: remaining balance cannot be negative.
 */
export function calculateWalletBalanceAfterRedemption(
  currentBalance: number,
  creditsToRedeem: number,
): WalletBalanceValidationResult {
  const current = Math.round(Number(currentBalance || 0) * 100) / 100;
  const toRedeem = Math.round(Number(creditsToRedeem || 0) * 100) / 100;

  if (toRedeem < 0) {
    return {
      currentBalance: current,
      creditsToRedeem: toRedeem,
      remainingBalance: current,
      isValid: false,
      error: 'Credits to redeem cannot be negative',
    };
  }

  if (current < toRedeem) {
    return {
      currentBalance: current,
      creditsToRedeem: toRedeem,
      remainingBalance: current,
      isValid: false,
      error: `Insufficient wallet balance: available ₹${current.toFixed(2)}, requested ₹${toRedeem.toFixed(2)}`,
    };
  }

  const remaining = Math.round((current - toRedeem) * 100) / 100;

  return {
    currentBalance: current,
    creditsToRedeem: toRedeem,
    remainingBalance: Math.max(0, remaining),
    isValid: true,
  };
}

/**
 * Computes the application of wallet credits toward a subscription fee.
 * Partial or full redemption support.
 */
export function calculateSubscriptionDiscount(
  subscriptionAmount: number,
  availableWalletCredits: number,
): SubscriptionWalletDiscountResult {
  const subAmt = Math.round(Number(subscriptionAmount || 0) * 100) / 100;
  const avail = Math.max(0, Math.round(Number(availableWalletCredits || 0) * 100) / 100);

  if (subAmt <= 0) {
    return {
      subscriptionAmount: 0,
      availableWalletCredits: avail,
      creditsApplied: 0,
      cashPayable: 0,
      remainingCredits: avail,
      isFullyCovered: true,
    };
  }

  const creditsApplied = Math.min(subAmt, avail);
  const cashPayable = Math.round((subAmt - creditsApplied) * 100) / 100;
  const remainingCredits = Math.round((avail - creditsApplied) * 100) / 100;
  const isFullyCovered = cashPayable === 0;

  return {
    subscriptionAmount: subAmt,
    availableWalletCredits: avail,
    creditsApplied,
    cashPayable,
    remainingCredits: Math.max(0, remainingCredits),
    isFullyCovered,
  };
}

/**
 * Validates whether a given string is a valid CommercialMonetaryClass.
 */
export function validateCommercialMonetaryClass(
  monetaryClass: string,
): monetaryClass is CommercialMonetaryClass {
  return COMMERCIAL_MONETARY_CLASSES.includes(monetaryClass as CommercialMonetaryClass);
}

/**
 * Validates the complete commercial conservation invariant across settlement,
 * platform fee deductions, and buyer sourcing rewards.
 */
export function validateCommercialConservation(
  params: CommercialConservationValidationParams,
): CommercialConservationValidationResult {
  const gross = Math.round(Number(params.grossInvoiceAmount || 0) * 100) / 100;
  const debits = Math.round(Number(params.debitAdjustments || 0) * 100) / 100;
  const credits = Math.round(Number(params.creditAdjustments || 0) * 100) / 100;
  const tds = Math.round(Number(params.tdsAmount || 0) * 100) / 100;
  const fee = Math.round(Number(params.platformFeeAmount || 0) * 100) / 100;
  const reward = Math.round(Number(params.buyerRewardAmount || 0) * 100) / 100;

  const adjustedGross = Math.round((gross - debits + credits) * 100) / 100;
  const netSettlement =
    params.supplierNetSettlement !== undefined
      ? Math.round(Number(params.supplierNetSettlement) * 100) / 100
      : Math.max(0, Math.round((adjustedGross - tds - fee) * 100) / 100);

  const totalOutflowObligation = Math.round((tds + fee + netSettlement) * 100) / 100;
  const variance = Math.round(Math.abs(totalOutflowObligation - adjustedGross) * 100) / 100;
  const isConserved = variance < 0.001;

  const platformFeeNetRetained = Math.round((fee - reward) * 100) / 100;

  return {
    adjustedGrossAmount: adjustedGross,
    tdsAmount: tds,
    platformFeeAmount: fee,
    supplierNetSettlement: netSettlement,
    totalOutflowObligation,
    buyerRewardAmount: reward,
    platformFeeNetRetained,
    isConserved,
    variance,
  };
}

/**
 * Validates state transition for BuyerRewardAllocation.
 */
export function canTransitionRewardAllocation(
  current: BuyerRewardAllocationStatus,
  next: BuyerRewardAllocationStatus,
): boolean {
  if (current === next) return true;

  const allowedTransitions: Record<BuyerRewardAllocationStatus, BuyerRewardAllocationStatus[]> = {
    PENDING: ['CREDITED', 'REVERSED'],
    CREDITED: ['REVERSED'],
    REVERSED: [],
  };

  return allowedTransitions[current]?.includes(next) ?? false;
}

// =============================================================================
// ROLLING 365-DAY VALIDITY & DETERMINISTIC FEFO REDEMPTION ENGINE
// =============================================================================

export const ROLLING_BENEFIT_VALIDITY_DAYS = 365;

export interface WalletCreditLot {
  id: string;
  organizationId?: string;
  amount: number; // Remaining unconsumed credits in this lot
  initialAmount?: number;
  creditedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp (creditedAt + 365 days)
  status?: 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'REVERSED';
  purchaseOrderId?: string | null;
  settlementId?: string | null;
}

export interface FefoConsumptionItem {
  lotId: string;
  amountDeducted: number;
  lotExpiresAt: string;
  remainingInLot: number;
}

export interface FefoRedemptionResult {
  requestedAmount: number;
  redeemedAmount: number;
  unfulfilledAmount: number;
  openingActiveBalance: number;
  closingActiveBalance: number;
  isFullyCovered: boolean;
  consumedLots: FefoConsumptionItem[];
  activeRemainingLots: WalletCreditLot[];
  expiredLotsExcluded: WalletCreditLot[];
}

/**
 * Computes exact 365-day rolling expiry ISO timestamp from a credit date.
 * Each credit receives independent rolling validity (NOT calendar-year expiry, NOT Dec 31 reset).
 */
export function computeCreditExpiryDate(
  creditedAtInput: Date | string = new Date(),
  validityDays: number = ROLLING_BENEFIT_VALIDITY_DAYS,
): string {
  const date = typeof creditedAtInput === 'string' ? new Date(creditedAtInput) : creditedAtInput;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid creditedAt timestamp: ${creditedAtInput}`);
  }
  const expiry = new Date(date.getTime() + validityDays * 24 * 60 * 60 * 1000);
  return expiry.toISOString();
}

/**
 * Evaluates whether an individual credit lot is active and unexpired as of a given reference timestamp.
 * A credit is valid if asOf <= expiresAt and status is not 'REVERSED' or 'CONSUMED'.
 */
export function isCreditValid(
  credit: {
    creditedAt?: Date | string;
    expiresAt?: Date | string;
    status?: string;
    amount?: number | unknown;
  },
  asOfInput: Date | string = new Date(),
): boolean {
  if (!credit || typeof credit !== 'object') return false;
  if (credit.status === 'REVERSED' || credit.status === 'CONSUMED') return false;
  
  if (credit.amount !== undefined) {
    const rawAmt = Number(credit.amount);
    if (Number.isNaN(rawAmt) || !Number.isFinite(rawAmt) || rawAmt <= 0) return false;
  }

  const asOf = typeof asOfInput === 'string' ? new Date(asOfInput) : asOfInput;
  if (Number.isNaN(asOf.getTime())) return false;

  let expiryDate: Date;
  if (credit.expiresAt) {
    expiryDate = typeof credit.expiresAt === 'string' ? new Date(credit.expiresAt) : credit.expiresAt;
  } else if (credit.creditedAt) {
    const creditedDate = typeof credit.creditedAt === 'string' ? new Date(credit.creditedAt) : credit.creditedAt;
    expiryDate = new Date(creditedDate.getTime() + ROLLING_BENEFIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  } else {
    return false;
  }

  if (Number.isNaN(expiryDate.getTime())) return false;

  // Credit is valid up to and including the exact millisecond of expiresAt
  return asOf.getTime() <= expiryDate.getTime();
}

/**
 * Calculates the active unexpired wallet balance across multiple credit lots.
 * Ignores expired, reversed, or non-positive lots.
 */
export function calculateActiveWalletBalance(
  credits: WalletCreditLot[] = [],
  asOfInput: Date | string = new Date(),
): number {
  if (!Array.isArray(credits) || credits.length === 0) return 0;
  const asOf = typeof asOfInput === 'string' ? new Date(asOfInput) : asOfInput;

  let total = 0;
  for (const lot of credits) {
    if (lot && typeof lot === 'object' && isCreditValid(lot, asOf)) {
      const rawNum = Number(lot.amount);
      if (!Number.isNaN(rawNum) && Number.isFinite(rawNum) && rawNum > 0) {
        const amt = Math.max(0, Math.round(rawNum * 100) / 100);
        total += amt;
      }
    }
  }

  return Math.round(total * 100) / 100;
}

/**
 * Deterministic FEFO (First Expiry First Out) consumption of rolling wallet credits.
 * - Filters out expired, reversed, or corrupted credit lots.
 * - Sorts active lots by earliest expiresAt ASC (First Expiry First Out).
 * - Deducts requested amount across lots deterministically.
 * - Returns precise breakdown of consumed lots and updated remaining lots with zero negative balances.
 */
export function consumeWalletCreditsFefo(
  credits: WalletCreditLot[] = [],
  amountToRedeem: number,
  asOfInput: Date | string = new Date(),
): FefoRedemptionResult {
  const asOf = typeof asOfInput === 'string' ? new Date(asOfInput) : asOfInput;
  const rawRequested = Number(amountToRedeem || 0);
  const requested = Number.isNaN(rawRequested) || !Number.isFinite(rawRequested) || rawRequested <= 0
    ? 0
    : Math.max(0, Math.round(rawRequested * 100) / 100);

  const activeLots: WalletCreditLot[] = [];
  const expiredLots: WalletCreditLot[] = [];

  if (Array.isArray(credits)) {
    for (const item of credits) {
      if (!item || typeof item !== 'object') continue;
      const rawAmount = Number(item.amount);
      if (Number.isNaN(rawAmount) || !Number.isFinite(rawAmount) || rawAmount <= 0) continue;

      const cleanAmount = Math.max(0, Math.round(rawAmount * 100) / 100);
      if (cleanAmount <= 0) continue;

      const creditedAt = item.creditedAt || new Date().toISOString();
      const expiresAt = item.expiresAt || computeCreditExpiryDate(creditedAt);

      const lot: WalletCreditLot = {
        ...item,
        amount: cleanAmount,
        creditedAt,
        expiresAt,
      };

      if (isCreditValid(lot, asOf)) {
        activeLots.push(lot);
      } else {
        expiredLots.push(lot);
      }
    }
  }

  // Calculate opening active balance
  const openingActiveBalance = activeLots.reduce((acc, l) => acc + l.amount, 0);
  const roundedOpeningBalance = Math.round(openingActiveBalance * 100) / 100;

  if (requested === 0) {
    return {
      requestedAmount: 0,
      redeemedAmount: 0,
      unfulfilledAmount: 0,
      openingActiveBalance: roundedOpeningBalance,
      closingActiveBalance: roundedOpeningBalance,
      isFullyCovered: true,
      consumedLots: [],
      activeRemainingLots: activeLots,
      expiredLotsExcluded: expiredLots,
    };
  }

  // Sort active lots by earliest expiry first (FEFO)
  // Tie-break by creditedAt ASC, then by id ASC for deterministic order
  activeLots.sort((a, b) => {
    const diff = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    if (diff !== 0) return diff;
    const credDiff = new Date(a.creditedAt).getTime() - new Date(b.creditedAt).getTime();
    if (credDiff !== 0) return credDiff;
    return (a.id || '').localeCompare(b.id || '');
  });

  let remainingNeeded = requested;
  const consumedLots: FefoConsumptionItem[] = [];
  const activeRemainingLots: WalletCreditLot[] = [];

  for (const lot of activeLots) {
    if (remainingNeeded <= 0) {
      activeRemainingLots.push({ ...lot });
      continue;
    }

    const availableInLot = lot.amount;
    const deduction = Math.min(availableInLot, remainingNeeded);
    const roundedDeduction = Math.round(deduction * 100) / 100;
    const remainingInLot = Math.max(0, Math.round((availableInLot - roundedDeduction) * 100) / 100);

    consumedLots.push({
      lotId: lot.id,
      amountDeducted: roundedDeduction,
      lotExpiresAt: lot.expiresAt,
      remainingInLot,
    });

    remainingNeeded = Math.max(0, Math.round((remainingNeeded - roundedDeduction) * 100) / 100);

    if (remainingInLot > 0) {
      activeRemainingLots.push({
        ...lot,
        amount: remainingInLot,
      });
    }
  }

  const redeemedAmount = Math.round((requested - remainingNeeded) * 100) / 100;
  const closingActiveBalance = activeRemainingLots.reduce((acc, l) => acc + l.amount, 0);
  const roundedClosingBalance = Math.round(closingActiveBalance * 100) / 100;

  return {
    requestedAmount: requested,
    redeemedAmount,
    unfulfilledAmount: remainingNeeded,
    openingActiveBalance: roundedOpeningBalance,
    closingActiveBalance: roundedClosingBalance,
    isFullyCovered: remainingNeeded === 0,
    consumedLots,
    activeRemainingLots,
    expiredLotsExcluded: expiredLots,
  };
}


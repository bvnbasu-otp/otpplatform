import { SUBSCRIPTION_TIERS, type SubscriptionTierId } from '@otp/domain';
import type { BillingCycle } from '@/features/subscription';

/** Buyer personas shown on the public pricing page (no Enterprise). */
export const PUBLIC_PRICING_TIER_IDS: SubscriptionTierId[] = ['INDIVIDUAL', 'RWA', 'MSME'];

/** Reviewed domain constants for public disclosure when checkout RPC is unavailable to the visitor. */
export function disclosureSubscriptionAmount(tier: SubscriptionTierId, cycle: BillingCycle): number {
  const plan = SUBSCRIPTION_TIERS[tier];
  return cycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice;
}

export function disclosureAdditionalRfqAmount(tier: SubscriptionTierId): number {
  return SUBSCRIPTION_TIERS[tier].additionalRfqPrice;
}

export function disclosureYearlySavings(tier: SubscriptionTierId): number {
  const plan = SUBSCRIPTION_TIERS[tier];
  return Math.max(0, plan.monthlyPrice * 12 - plan.yearlyPrice);
}

export type PricingAmountSource = 'rpc' | 'disclosure';

export function resolvePublicPriceAmount(
  tier: SubscriptionTierId,
  cycle: BillingCycle,
  rpcAmount: number | null | undefined,
): { amount: number; source: PricingAmountSource } {
  if (rpcAmount != null && Number.isFinite(rpcAmount) && rpcAmount > 0) {
    return { amount: rpcAmount, source: 'rpc' };
  }
  return { amount: disclosureSubscriptionAmount(tier, cycle), source: 'disclosure' };
}

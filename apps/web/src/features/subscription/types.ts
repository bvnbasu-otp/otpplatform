export type SubscriptionTierId = 'TIER_1_MSME' | 'TIER_2_ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'GRACE';

export interface SubscriptionPlanDefinition {
  tierId: SubscriptionTierId;
  name: string;
  tagline: string;
  targetOrgTypes: string[];
  targetAudience: string;
  monthlyPrice: number;
  monthlyDurationDays: number;
  yearlyPrice: number;
  yearlyDurationDays: number;
  yearlySavings: number;
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionPlanDefinition> = {
  TIER_1_MSME: {
    tierId: 'TIER_1_MSME',
    name: 'Tier 1 — Individual & MSME',
    tagline: 'For Property Owners, MSMEs & Small Business Buyers',
    targetOrgTypes: ['INDIVIDUAL', 'MSME'],
    targetAudience: 'Individuals, Proprietary Firms & MSMEs',
    monthlyPrice: 99,
    monthlyDurationDays: 30,
    yearlyPrice: 999,
    yearlyDurationDays: 365,
    yearlySavings: 189,
    features: [
      'Unlimited requirement creation & fast-track express intake',
      'Anonymous identity-protected supplier quoting & comparison',
      'Automated Indian GST tax slab calculations (0%, 5%, 12%, 18%, 28%)',
      'Access to 104+ verified PAN-India & direct suppliers',
      'Real-time WhatsApp & Email instant status alerts',
      'Tamper-proof append-only procurement audit trail',
    ],
  },
  TIER_2_ENTERPRISE: {
    tierId: 'TIER_2_ENTERPRISE',
    name: 'Tier 2 — RWA & Institutions',
    tagline: 'For Housing Societies, Enterprises & Institutional Committees',
    targetOrgTypes: ['COMMUNITY', 'ENTERPRISE', 'INSTITUTION'],
    targetAudience: 'RWAs, Apartment Societies, Colleges, Trusts & Enterprises',
    monthlyPrice: 1000,
    monthlyDurationDays: 30,
    yearlyPrice: 10000,
    yearlyDurationDays: 365,
    yearlySavings: 2000,
    popular: true,
    features: [
      'Everything in Tier 1 for your entire procurement organization',
      'Multi-member Committee Voting Room (Secretary, Treasurer, President)',
      'Weighted voting power & configurable quorum rules (>= 2)',
      'Custom technical & commercial scoring rubrics',
      'Formal Purchase Order (PO) generation & multi-stage sign-offs',
      'Complete statutory audit trail export & executive compliance reports',
    ],
  },
};

export interface OrganizationSubscription {
  organizationId: string;
  organizationName: string;
  orgType: string;
  tierId: SubscriptionTierId;
  status: SubscriptionStatus;
  plan: BillingCycle;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  freeRfqCredits: number;
  rfqCreditsUsed: number;
  paymentReference?: string;
}

/** Resolves which subscription tier applies to a given org_type */
export function resolveTierForOrgType(orgType?: string): SubscriptionTierId {
  if (!orgType) return 'TIER_1_MSME';
  const normalized = orgType.toUpperCase();
  if (['COMMUNITY', 'ENTERPRISE', 'INSTITUTION', 'TRUST', 'RWA', 'GOVERNMENT'].includes(normalized)) {
    return 'TIER_2_ENTERPRISE';
  }
  return 'TIER_1_MSME';
}

/** Computes price and validity based on tier and billing cycle */
export function computeSubscriptionFee(tierId: SubscriptionTierId, cycle: BillingCycle) {
  const tier = SUBSCRIPTION_TIERS[tierId];
  if (cycle === 'YEARLY') {
    return {
      amount: tier.yearlyPrice,
      durationDays: tier.yearlyDurationDays,
      label: `₹${tier.yearlyPrice.toLocaleString('en-IN')} / 365 days`,
      savings: tier.yearlySavings,
    };
  }
  return {
    amount: tier.monthlyPrice,
    durationDays: tier.monthlyDurationDays,
    label: `₹${tier.monthlyPrice.toLocaleString('en-IN')} / 30 days`,
    savings: 0,
  };
}

export type RenewalNoticeLevel = 'NONE' | 'INFO_7_DAYS' | 'WARNING_3_DAYS' | 'URGENT_1_DAY' | 'EXPIRED';

export function getRenewalNoticeLevel(daysRemaining: number, isExpired: boolean): RenewalNoticeLevel {
  if (isExpired || daysRemaining <= 0) return 'EXPIRED';
  if (daysRemaining <= 1) return 'URGENT_1_DAY';
  if (daysRemaining <= 3) return 'WARNING_3_DAYS';
  if (daysRemaining <= 7) return 'INFO_7_DAYS';
  return 'NONE';
}

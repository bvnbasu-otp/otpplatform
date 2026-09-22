/**
 * OTP Platform — Pricing, RFQ Entitlement, Supplier Fee, Buyer Reward & Billing Mode Domain Model
 *
 * Implements:
 *   1. Four Standardized Subscription Tiers (Individual, RWA, MSME, Enterprise)
 *   2. Programmatic GST Calculation with Decimal-Safe Arithmetic (Default 18%)
 *   3. Calendar-Month RFQ Entitlement Engine (1st to last day of month, no rollover, 6th bonus RFQ for annual)
 *   4. "Why 5 RFQs?" Procurement Discipline Rationale
 *   5. Supplier Platform Fee (0.5% deduction on settlement without altering PO gross value)
 *   6. Buyer Sourcing Reward & Non-Cash Wallet Invariants (Annual Reset, Non-Withdrawable)
 *   7. Dynamic Fail-Safe Billing Mode Engine (PILOT_FREE vs LIVE)
 */

export type SubscriptionTierId =
  | 'INDIVIDUAL'
  | 'RWA'
  | 'MSME'
  | 'ENTERPRISE'
  | 'TIER_1_MSME' // Backward compatibility alias for INDIVIDUAL / MSME
  | 'TIER_2_ENTERPRISE'; // Backward compatibility alias for RWA / ENTERPRISE

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type BillingMode = 'PILOT_FREE' | 'LIVE';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'GRACE';

export interface SubscriptionPlanDefinition {
  tierId: SubscriptionTierId;
  name: string;
  tagline: string;
  targetOrgTypes: string[];
  targetAudience: string;
  monthlyPrice: number;
  monthlyDurationDays: number;
  monthlyRfqs: number; // Standard monthly RFQ entitlement
  yearlyPrice: number;
  yearlyDurationDays: number;
  yearlyMonthlyRfqs: number; // 6 RFQs/mo (5 standard + 1 bonus)
  yearlySavings: number;
  additionalRfqPrice: number; // ₹149 per additional RFQ top-up
  features: string[];
  popular?: boolean;
}

export const ADDITIONAL_RFQ_TOPUP_BASE_PRICE = 149;
export const DEFAULT_GST_RATE_PERCENT = 18.0;
export const OTP_GST_RATE = DEFAULT_GST_RATE_PERCENT; // Authoritative OTP Platform Tax Configuration (18% GST)
export const DEFAULT_SUPPLIER_PLATFORM_FEE_RATE = 0.5; // 0.50%
export const STANDARD_MONTHLY_RFQ_ALLOWANCE = 5;
export const ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE = 6; // 5 + 1 bonus

export interface SupplierPlatformFeeCalculationParams {
  poGrossAmount: number;
  feeRatePercent?: number; // Defaults to DEFAULT_SUPPLIER_PLATFORM_FEE_RATE (0.50%)
  gstRatePercent?: number; // Defaults to DEFAULT_GST_RATE_PERCENT (18.0%)
}

export interface SupplierPlatformFeeCalculationResult {
  poGrossAmount: number;
  feeRatePercent: number;
  feeAmount: number;
  gstRatePercent: number;
  gstOnFeeAmount: number;
  totalFeeWithGst: number;
  netSupplierDisbursement: number;
  poGrossUntouched: boolean;
  formattedPoGross: string;
  formattedFee: string;
  formattedGstOnFee: string;
  formattedTotalFeeWithGst: string;
  formattedNetDisbursement: string;
}

/**
 * Computes OTP's supplier platform fee (0.5%) and the applicable platform GST on the fee (18% GST).
 * Critical Boundary Invariant:
 * 1. Supplier platform fee = 0.5% of PO gross value
 * 2. OTP tax authority = 18% GST on the fee itself (e.g. ₹100,000 PO -> ₹500 fee + ₹90 GST on fee = ₹590 total platform deduction)
 * 3. PO gross contract value remains exactly untouched (₹100,000) and is never rewritten or discounted.
 */
export function calculateSupplierPlatformFeeWithGst(
  params: SupplierPlatformFeeCalculationParams,
): SupplierPlatformFeeCalculationResult {
  const gross = Math.max(0, Math.round(Number(params.poGrossAmount || 0) * 100) / 100);
  const feeRate = Math.max(0, Number(params.feeRatePercent ?? DEFAULT_SUPPLIER_PLATFORM_FEE_RATE));
  const gstRate = Math.max(0, Number(params.gstRatePercent ?? DEFAULT_GST_RATE_PERCENT));

  const rawFee = (gross * feeRate) / 100;
  const feeAmount = Math.round(rawFee * 100) / 100;

  const rawGstOnFee = (feeAmount * gstRate) / 100;
  const gstOnFeeAmount = Math.round(rawGstOnFee * 100) / 100;

  const totalFeeWithGst = Math.round((feeAmount + gstOnFeeAmount) * 100) / 100;
  const netSupplierDisbursement = Math.max(0, Math.round((gross - totalFeeWithGst) * 100) / 100);

  return {
    poGrossAmount: gross,
    feeRatePercent: feeRate,
    feeAmount,
    gstRatePercent: gstRate,
    gstOnFeeAmount,
    totalFeeWithGst,
    netSupplierDisbursement,
    poGrossUntouched: true,
    formattedPoGross: `₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedFee: `₹${feeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedGstOnFee: `₹${gstOnFeeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedTotalFeeWithGst: `₹${totalFeeWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedNetDisbursement: `₹${netSupplierDisbursement.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}

/**
 * 4 Canonical Subscription Tiers
 */
export const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionPlanDefinition> = {
  INDIVIDUAL: {
    tierId: 'INDIVIDUAL',
    name: 'Individual & Sole Proprietor',
    tagline: 'For independent property owners, solo buyers & facility managers',
    targetOrgTypes: ['INDIVIDUAL'],
    targetAudience: 'Independent buyers, property owners & sole proprietors',
    monthlyPrice: 99,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 189, // (99 * 12) - 999 = 1188 - 999 = 189
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    features: [
      '5 High-intent RFQs included per calendar month (6 RFQs/mo on annual plan)',
      'Protected supplier quoting & fair comparison matrix',
      'Automated GST tax invoice & PO generation upon award',
      'Direct supplier interaction & bilateral settlement',
      'Instant notifications for quote updates & clarifications',
      'Immutable statutory procurement audit trail',
    ],
  },
  RWA: {
    tierId: 'RWA',
    name: 'RWA & Society',
    tagline: 'For housing societies, apartment committees & residential welfare',
    targetOrgTypes: ['COMMUNITY', 'RWA', 'SOCIETY'],
    targetAudience: 'RWAs, Apartment Societies, Resident Welfare Associations',
    monthlyPrice: 499,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 4999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 989, // (499 * 12) - 4999 = 5988 - 4999 = 989
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    popular: true,
    features: [
      '5 High-intent RFQs included per calendar month (6 RFQs/mo on annual plan)',
      'Multi-member Committee Voting Room with quorum tracking',
      'Conflict-of-interest declarations & recorded voter justifications',
      'Weighted scoring rubrics (Price, Delivery TAT, Warranty, Quality)',
      'Digital Purchase Order issuance & milestone fulfillment tracking',
      'Exportable statutory audit logs for AGM compliance & society audits',
    ],
  },
  MSME: {
    tierId: 'MSME',
    name: 'MSME & Commercial Business',
    tagline: 'For small & medium enterprises, workshops, plants & commercial teams',
    targetOrgTypes: ['MSME'],
    targetAudience: 'MSMEs, Manufacturing Units, Commercial Contractors & Service Firms',
    monthlyPrice: 999,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 9999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 1989, // (999 * 12) - 9999 = 11988 - 9999 = 1989
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    features: [
      '5 High-intent RFQs included per calendar month (6 RFQs/mo on annual plan)',
      'Multi-department procurement workflow & role-based approval controls',
      'Vendor discovery across regional supplier networks with verified GSTINs',
      'Technical specification comparison & anonymous clarification Q&A',
      'Formal PO execution with advance payment allocations & TDS tracking',
      'ERP-ready manifests & complete commercial audit trail',
    ],
  },
  ENTERPRISE: {
    tierId: 'ENTERPRISE',
    name: 'Enterprise & Institutional',
    tagline: 'For multi-location institutions, healthcare trusts, colleges & developer groups',
    targetOrgTypes: ['ENTERPRISE', 'INSTITUTION', 'TRUST', 'GOVERNMENT'],
    targetAudience: 'Enterprises, Educational Trusts, Healthcare Groups & Large Buyers',
    monthlyPrice: 4999,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 49999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 9989, // (4999 * 12) - 49999 = 59988 - 49999 = 9989
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    features: [
      'Custom RFQ allowances tailored to multi-unit procurement volume',
      'Configurable multi-tier financial threshold approval matrices',
      'Custom role segregation (Approver, Voter, Auditor, Observer)',
      'Multi-organization subsidiary management & consolidated reporting',
      'Priority support, custom onboarding & governance advisory',
      'Comprehensive statutory compliance exports & audit certification',
    ],
  },
  // Backward compatibility alias for TIER_1_MSME -> INDIVIDUAL
  TIER_1_MSME: {
    tierId: 'TIER_1_MSME',
    name: 'Individual & MSME (Legacy Alias)',
    tagline: 'For Property Owners, MSMEs & Small Business Buyers',
    targetOrgTypes: ['INDIVIDUAL', 'MSME'],
    targetAudience: 'Individuals, Proprietary Firms & MSMEs',
    monthlyPrice: 99,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 189,
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    features: [
      '5 High-intent RFQs included per calendar month',
      'Protected supplier quoting & fair comparison matrix',
      'Automated GST tax invoice & PO generation upon award',
      'Direct supplier interaction & bilateral settlement',
      'Tamper-proof append-only procurement audit trail',
    ],
  },
  // Backward compatibility alias for TIER_2_ENTERPRISE -> RWA
  TIER_2_ENTERPRISE: {
    tierId: 'TIER_2_ENTERPRISE',
    name: 'RWA & Institutions (Legacy Alias)',
    tagline: 'For Housing Societies, Enterprises & Institutional Committees',
    targetOrgTypes: ['COMMUNITY', 'ENTERPRISE', 'INSTITUTION'],
    targetAudience: 'RWAs, Apartment Societies, Colleges, Trusts & Enterprises',
    monthlyPrice: 499,
    monthlyDurationDays: 30,
    monthlyRfqs: STANDARD_MONTHLY_RFQ_ALLOWANCE,
    yearlyPrice: 4999,
    yearlyDurationDays: 365,
    yearlyMonthlyRfqs: ANNUAL_BONUS_MONTHLY_RFQ_ALLOWANCE,
    yearlySavings: 989,
    additionalRfqPrice: ADDITIONAL_RFQ_TOPUP_BASE_PRICE,
    popular: true,
    features: [
      '5 High-intent RFQs included per calendar month',
      'Multi-member Committee Voting Room with quorum tracking',
      'Weighted scoring rubrics & decision justifications',
      'Formal Purchase Order (PO) generation & multi-stage sign-offs',
      'Complete statutory audit trail export & executive compliance reports',
    ],
  },
};

/**
 * Resolves which subscription tier applies to a given buyer org_type
 */
export function resolveTierForOrgType(orgType?: string): SubscriptionTierId {
  if (!orgType) return 'INDIVIDUAL';
  const normalized = orgType.toUpperCase().trim();
  if (['COMMUNITY', 'RWA', 'SOCIETY'].includes(normalized)) {
    return 'RWA';
  }
  if (['MSME'].includes(normalized)) {
    return 'MSME';
  }
  if (['ENTERPRISE', 'INSTITUTION', 'TRUST', 'GOVERNMENT', 'CORPORATION'].includes(normalized)) {
    return 'ENTERPRISE';
  }
  return 'INDIVIDUAL';
}

/**
 * GST Calculation Interface & Engine
 */
export interface GstCalculationResult {
  basePrice: number;
  gstRatePercent: number;
  gstAmount: number;
  totalAmount: number;
  formattedBase: string;
  formattedGst: string;
  formattedTotal: string;
}

/**
 * Computes exact decimal-safe GST arithmetic with paise rounding.
 * Invariant: totalAmount = basePrice + gstAmount
 */
export function calculateGst(
  basePrice: number,
  gstRatePercent: number = DEFAULT_GST_RATE_PERCENT,
): GstCalculationResult {
  const base = Math.max(0, Math.round(Number(basePrice || 0) * 100) / 100);
  const rate = Math.max(0, Number(gstRatePercent || 0));

  // Exact paise computation
  const rawGst = (base * rate) / 100;
  const gstAmount = Math.round(rawGst * 100) / 100;
  const totalAmount = Math.round((base + gstAmount) * 100) / 100;

  return {
    basePrice: base,
    gstRatePercent: rate,
    gstAmount,
    totalAmount,
    formattedBase: `₹${base.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedGst: `₹${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formattedTotal: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}

/**
 * Computes base price, GST breakdown, total payable and duration for a given tier and cycle.
 */
export function computeSubscriptionPricing(
  tierId: SubscriptionTierId,
  cycle: BillingCycle,
  gstRatePercent: number = DEFAULT_GST_RATE_PERCENT,
) {
  const tier = SUBSCRIPTION_TIERS[tierId] || SUBSCRIPTION_TIERS.INDIVIDUAL;
  const isYearly = cycle === 'YEARLY';
  const basePrice = isYearly ? tier.yearlyPrice : tier.monthlyPrice;
  const durationDays = isYearly ? tier.yearlyDurationDays : tier.monthlyDurationDays;
  const monthlyRfqQuota = isYearly ? tier.yearlyMonthlyRfqs : tier.monthlyRfqs;
  const savings = isYearly ? tier.yearlySavings : 0;

  const gst = calculateGst(basePrice, gstRatePercent);

  return {
    tierId: tier.tierId,
    tierName: tier.name,
    cycle,
    basePrice: gst.basePrice,
    gstRatePercent: gst.gstRatePercent,
    gstAmount: gst.gstAmount,
    totalAmount: gst.totalAmount,
    durationDays,
    monthlyRfqQuota,
    savings,
    formattedBase: gst.formattedBase,
    formattedGst: gst.formattedGst,
    formattedTotal: gst.formattedTotal,
    label: `${gst.formattedTotal} / ${isYearly ? 'year' : 'month'} (incl. ${gst.gstRatePercent}% GST)`,
  };
}

/**
 * Calendar Month Window Helper
 */
export interface CalendarMonthWindow {
  year: number;
  month: number; // 1-12
  startIso: string;
  endIso: string;
  daysInMonth: number;
  label: string;
}

/**
 * Resolves the calendar month window (1st day 00:00:00 to last day 23:59:59)
 */
export function getCalendarMonthWindow(dateInput: Date | string = new Date()): CalendarMonthWindow {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-indexed

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  // Last day of current month: Day 0 of next month
  const lastDayNumber = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month - 1, lastDayNumber, 23, 59, 59, 999));

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return {
    year,
    month,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    daysInMonth: lastDayNumber,
    label: `${monthNames[month - 1]} ${year}`,
  };
}

/**
 * RFQ Entitlement Evaluation Parameters & Result
 */
export interface RfqEntitlementEvaluationParams {
  tierId: SubscriptionTierId;
  plan?: BillingCycle;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  rfqsUsedInCurrentMonth: number;
  additionalPurchasedCredits?: number;
  billingMode?: BillingMode;
  now?: Date | string;
}

export interface RfqEntitlementEvaluationResult {
  monthlyAllowance: number; // 5 (monthly) or 6 (yearly with annual bonus)
  rfqsUsedInCurrentMonth: number;
  monthlyRemaining: number;
  additionalPurchasedCredits: number;
  totalAvailableRfqs: number;
  canCreateRfq: boolean;
  isSubscriptionActive: boolean;
  isBonusApplied: boolean;
  billingMode: BillingMode;
  calendarMonth: CalendarMonthWindow;
  rejectionReason?: string;
}

/**
 * Evaluates whether a buyer can publish an RFQ based on calendar-month entitlement and top-up credits.
 * Invariants:
 * - Monthly allowance resets at calendar month boundary (1st of month).
 * - Unused monthly allowance does not roll over.
 * - Annual subscribers receive 6 RFQs/month (5 standard + 1 bonus).
 * - Additional purchased credits (top-ups) never expire at month boundaries.
 * - In PILOT_FREE mode, active entitlement is granted without requiring money collection.
 */
export function evaluateRfqEntitlement(
  params: RfqEntitlementEvaluationParams,
): RfqEntitlementEvaluationResult {
  const now = params.now ? (typeof params.now === 'string' ? new Date(params.now) : params.now) : new Date();
  const calendarMonth = getCalendarMonthWindow(now);
  const mode = resolveBillingMode(params.billingMode);
  const plan = params.plan || 'MONTHLY';
  const isYearly = plan === 'YEARLY';
  const tier = SUBSCRIPTION_TIERS[params.tierId] || SUBSCRIPTION_TIERS.INDIVIDUAL;

  const isBonusApplied = isYearly;
  const monthlyAllowance = isYearly ? tier.yearlyMonthlyRfqs : tier.monthlyRfqs;

  const usedThisMonth = Math.max(0, Math.floor(Number(params.rfqsUsedInCurrentMonth || 0)));
  const monthlyRemaining = Math.max(0, monthlyAllowance - usedThisMonth);
  const additionalCredits = Math.max(0, Math.floor(Number(params.additionalPurchasedCredits || 0)));

  // Check subscription active status
  const expiresAt = params.subscriptionExpiresAt ? new Date(params.subscriptionExpiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < now.getTime() : false;
  const isStatusActive = (params.subscriptionStatus || 'ACTIVE') === 'ACTIVE';
  
  // In PILOT_FREE mode, subscription is always considered active for pilot cohort
  const isSubscriptionActive = mode === 'PILOT_FREE' || (!isExpired && isStatusActive);

  let totalAvailableRfqs = 0;
  let canCreateRfq = false;
  let rejectionReason: string | undefined;

  if (isSubscriptionActive) {
    totalAvailableRfqs = monthlyRemaining + additionalCredits;
    canCreateRfq = totalAvailableRfqs > 0;
    if (!canCreateRfq) {
      rejectionReason = `Monthly entitlement limit reached (${usedThisMonth}/${monthlyAllowance} RFQs used in ${calendarMonth.label}). Recharge an additional RFQ top-up (₹149 + GST) or wait for calendar month reset.`;
    }
  } else {
    // If subscription is expired, can only use purchased additional credits
    totalAvailableRfqs = additionalCredits;
    canCreateRfq = additionalCredits > 0;
    if (!canCreateRfq) {
      rejectionReason = 'Prepaid subscription plan has expired. Please renew your plan or purchase an additional RFQ credit to continue.';
    }
  }

  return {
    monthlyAllowance,
    rfqsUsedInCurrentMonth: usedThisMonth,
    monthlyRemaining,
    additionalPurchasedCredits: additionalCredits,
    totalAvailableRfqs,
    canCreateRfq,
    isSubscriptionActive,
    isBonusApplied,
    billingMode: mode,
    calendarMonth,
    rejectionReason,
  };
}

/**
 * Resolves the operational Billing Mode with a fail-safe default
 */
export function resolveBillingMode(envMode?: string | null): BillingMode {
  if (!envMode) return 'PILOT_FREE';
  const normalized = envMode.toUpperCase().trim();
  if (normalized === 'LIVE') return 'LIVE';
  if (normalized === 'PILOT_FREE' || normalized === 'PILOT') return 'PILOT_FREE';
  return 'PILOT_FREE'; // Safe default
}

/**
 * "Why 5 RFQs?" Customer-Facing Procurement Philosophy Copy
 */
export const WHY_5_RFQS_EXPLANATION = {
  title: 'Why 5 RFQs Per Month?',
  headline: 'Deliberate Procurement Drives Better Supplier Quotes',
  summary:
    'Quality commercial procurement starts with deliberate, high-intent requirements. 5 structured RFQs per month ensure serious buyer enquiry, high supplier response rates (>90%), and deep competitive comparison without marketplace spam.',
  points: [
    {
      title: 'High Supplier Engagement (>90%)',
      description: 'Verified contractors and distributors prioritize RFQs from serious buyers over low-intent window shoppers.',
    },
    {
      title: 'Deeper Competitive Comparisons',
      description: '3–5 scored, identity-protected proposals per enquiry provide comprehensive price, delivery speed, and warranty benchmarking.',
    },
    {
      title: 'Zero Lead Waste & Zero Spam',
      description: 'Eliminates noisy broadcast spam, ensuring regional suppliers submit sharp, competitive bids within 30 minutes.',
    },
    {
      title: 'Instant Additional Top-Ups (₹149 + GST)',
      description: 'Need more? Uncapped ₹149 (+ GST) top-up credits are available anytime for surge or emergency procurement.',
    },
  ],
};

/**
 * Supplier Platform Fee Constants & Disclosures
 */
export const SUPPLIER_FEE_POLICY = {
  feeRatePercent: DEFAULT_SUPPLIER_PLATFORM_FEE_RATE,
  standardFeeRatePercent: DEFAULT_SUPPLIER_PLATFORM_FEE_RATE,
  deductedOnSettlement: true,
  poGrossAmountUntouched: true,
  title: '0.5% Platform Fulfillment Fee on Settlement',
  description:
    'Suppliers join, discover RFQs, and submit sealed quotes 100% free with zero upfront charges or lead fees. A standard 0.5% platform fee is deducted on settlement from final bilateral disbursements upon confirmed Purchase Order awards. The Purchase Order gross contract value is never altered.',
};

/**
 * Buyer Sourcing Reward & Wallet Constants
 */
export const BUYER_REWARD_POLICY = {
  title: 'Buyer Sourcing Reward & Wallet Credits',
  description:
    'Non-cash sourcing reward credited upon successful procurement settlement toward future subscription renewals and RFQ top-ups.',
  publicDescription:
    'Complete verified procurement transactions on OTP to earn non-cash OTP Wallet Credits. Wallet credits apply directly toward future OTP subscription renewals and additional RFQ top-ups with rolling 365-day validity.',
  isNonCash: true,
  isWithdrawable: false,
  resetsAnnually: true, // 365-day validity per credit lot
  rollingValidityDays: 365,
  expiryDays: 365,
  eligibleRedemptions: ['SUBSCRIPTION_RENEWAL', 'RFQ_TOPUP'] as const,
  walletRules: [
    'Non-Cash Asset: Credits have no cash withdrawal value and cannot be transferred.',
    'Platform Use Only: Redeemable exclusively toward OTP subscription plans and RFQ top-ups.',
    'Rolling 365-Day Validity: Each individual credit remains active for 365 days from its own credit date with standard rolling expiry.',
  ],
};

/**
 * Pilot Disclosure Copy
 */
export const PILOT_COHORT_COPY = {
  badge: 'Platform Pilot Active',
  headline: 'Complimentary Access for Initial Cohort',
  body:
    'During our platform pilot, subscription fees are waived for onboarded buyers. Enjoy full access to competitive sourcing, identity-protected comparisons, and committee voting with standard monthly RFQ allowances.',
};

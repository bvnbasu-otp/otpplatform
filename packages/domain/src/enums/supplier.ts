/**
 * Internal supplier source metadata.
 * NEVER exposed during identity-protected evaluation or to buyers pre-reveal.
 * NEVER used in match_score or evaluation_score calculations.
 */
export const SupplierSource = {
  OTP_REGISTERED: 'OTP_REGISTERED',
  ONDC: 'ONDC',
  LOCAL_DISCOVERY: 'LOCAL_DISCOVERY',
  INVITED: 'INVITED',
  IMPORTED: 'IMPORTED',
  // Backward-compatible aliases:
  DIRECT: 'DIRECT',
  BNI: 'BNI',
  ASSOCIATION: 'ASSOCIATION',
  REFERRAL: 'REFERRAL',
  LOCAL_REGISTRY: 'LOCAL_REGISTRY',
  OTHER: 'OTHER',
} as const;

export type SupplierSource =
  (typeof SupplierSource)[keyof typeof SupplierSource];

export const SupplierStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type SupplierStatus =
  (typeof SupplierStatus)[keyof typeof SupplierStatus];

/**
 * Canonical 2-Stage Supplier Lifecycle States:
 * Stage 1: Quote Participant (identity-protected competitive quoting)
 * Stage 2: Awarded -> Onboarding & Truthful Verification -> Verified OTP Supplier
 */
export const SupplierLifecycleState = {
  QUOTE_PARTICIPANT: 'QUOTE_PARTICIPANT',
  ONBOARDING_REQUIRED: 'ONBOARDING_REQUIRED',
  ONBOARDING_IN_PROGRESS: 'ONBOARDING_IN_PROGRESS',
  VERIFICATION_PENDING: 'VERIFICATION_PENDING',
  VERIFIED: 'VERIFIED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  REQUIRES_REVERIFICATION: 'REQUIRES_REVERIFICATION',
  SUSPENDED: 'SUSPENDED',
} as const;

export type SupplierLifecycleState =
  (typeof SupplierLifecycleState)[keyof typeof SupplierLifecycleState];

/**
 * Truthful Verification Statuses:
 * Zero-tolerance for false/faked verification badges.
 */
export const TruthfulVerificationStatus = {
  NOT_PROVIDED: 'NOT_PROVIDED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  REQUIRES_REVERIFICATION: 'REQUIRES_REVERIFICATION',
  // Backward-compatible aliases:
  PLATFORM_VERIFIED: 'PLATFORM_VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
} as const;

export type TruthfulVerificationStatus =
  (typeof TruthfulVerificationStatus)[keyof typeof TruthfulVerificationStatus];

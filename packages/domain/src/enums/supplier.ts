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
  // Keep backward-compatible aliases if needed:
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


/**
 * Normalized supplier discovery provenance — not interchangeable with OTP lifecycle tiers.
 * Google = DISCOVERY only. ONDC = NETWORK. OTP = verified supplier registry.
 */
export const SupplierDiscoverySourceKind = {
  OTP_SUPPLIER: 'OTP_SUPPLIER',
  ONDC_SELLER: 'ONDC_SELLER',
  GOOGLE_DISCOVERY: 'GOOGLE_DISCOVERY',
} as const;

export type SupplierDiscoverySourceKind =
  (typeof SupplierDiscoverySourceKind)[keyof typeof SupplierDiscoverySourceKind];

/** Buyer-facing labels (no protocol jargon). */
export const SUPPLIER_DISCOVERY_BUYER_LABELS: Record<SupplierDiscoverySourceKind, string> = {
  OTP_SUPPLIER: 'OTP Verified',
  ONDC_SELLER: 'Network suppliers',
  GOOGLE_DISCOVERY: 'Local businesses',
};

export const OndcIntegrationState = {
  ONDC_INTEGRATION_CONFIGURED: 'ONDC_INTEGRATION_CONFIGURED',
  PREPROD: 'PREPROD',
  PRODUCTION: 'PRODUCTION',
  UNAVAILABLE: 'UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_RESULTS: 'NO_RESULTS',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
} as const;

export type OndcIntegrationState =
  (typeof OndcIntegrationState)[keyof typeof OndcIntegrationState];

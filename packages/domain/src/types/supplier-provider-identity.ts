/**
 * Provider-neutral Supplier Network identity (SNE).
 * Provider-specific keys map to OTP suppliers.id only after registration/reconciliation — never on name alone.
 */

export const SupplierNetworkProviderKind = {
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  ONDC: 'ONDC',
} as const;

export type SupplierNetworkProviderKind =
  (typeof SupplierNetworkProviderKind)[keyof typeof SupplierNetworkProviderKind];

/** ONDC live Beckn integration is out of scope; contract + guards only. */
export const ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS =
  'PROVIDER CONTRACT READY / LIVE INTEGRATION NOT CERTIFIED' as const;

export type ContactabilityClassification = 'CONTACTABLE' | 'NO_CONTACT_CHANNEL';

export interface NormalizedProviderSupplierCandidate {
  provider: SupplierNetworkProviderKind;
  providerSupplierId: string;
  providerParticipantId?: string;
  providerCatalogueId?: string;
  correlationId?: string;
  displayName: string;
  phone?: string;
  /** Set only when reconciled to OTP registry */
  otpSupplierId?: string;
}

export interface SupplierProviderIdentityRow {
  id: string;
  supplierId: string;
  provider: SupplierNetworkProviderKind;
  providerSupplierId: string;
  providerParticipantId?: string | null;
  providerCatalogueId?: string | null;
  correlationId?: string | null;
  discoveredAt: string;
  lastRefreshAt: string;
}

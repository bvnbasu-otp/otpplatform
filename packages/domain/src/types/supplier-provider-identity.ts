/**
 * Provider-neutral Supplier Network identity (SNE).
 * Provider-specific keys map to OTP suppliers.id only after registration/reconciliation — never on name alone.
 * Google fields stay on the Google path. ONDC fields stay on the ONDC path.
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

/** Explicit channel kinds. ONDC network discovery uses NETWORK, not a fabricated phone. */
export const ProviderReachabilityKind = {
  PHONE: 'PHONE',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  NETWORK: 'NETWORK',
  OTHER_PROVIDER_CHANNEL: 'OTHER_PROVIDER_CHANNEL',
} as const;

export type ProviderReachabilityKind =
  (typeof ProviderReachabilityKind)[keyof typeof ProviderReachabilityKind];

export interface ProviderReachabilityChannel {
  kind: ProviderReachabilityKind;
  /** Present only when the provider reported a real channel value. */
  value?: string;
}

/** Explicit contactability. Not a boolean, and not the Google phone gate. */
export const ProviderContactabilityStatus = {
  REACHABLE: 'REACHABLE',
  NOT_REACHABLE: 'NOT_REACHABLE',
} as const;

export type ProviderContactabilityStatus =
  (typeof ProviderContactabilityStatus)[keyof typeof ProviderContactabilityStatus];

/**
 * Provider operational status. LIVE is a real network proof status.
 * This foundation does not assign LIVE.
 */
export const SupplierNetworkProviderOperationalStatus = {
  CONFIGURED: 'CONFIGURED',
  LIVE: 'LIVE',
  REACHABLE: 'REACHABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  CREDENTIAL_GATED: 'CREDENTIAL_GATED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  ERROR: 'ERROR',
} as const;

export type SupplierNetworkProviderOperationalStatus =
  (typeof SupplierNetworkProviderOperationalStatus)[keyof typeof SupplierNetworkProviderOperationalStatus];

export interface ProviderNeutralCoordinates {
  lat: number;
  lng: number;
}

/**
 * Provider-neutral location. Callers must not copy a buyer PIN into this object.
 * locality is optional provider-reported text. Absence stays absent.
 */
export interface ProviderNeutralLocation {
  formattedAddress?: string;
  locality?: string;
  pinCode?: string;
  city?: string;
  state?: string;
  country?: string;
  coordinates?: ProviderNeutralCoordinates;
}

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
  location?: ProviderNeutralLocation;
  category?: string;
  reachability?: readonly ProviderReachabilityChannel[];
  contactability?: ProviderContactabilityStatus;
  providerStatus?: SupplierNetworkProviderOperationalStatus;
  provenance?: string;
  discoveredAt?: string;
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

/** Identity is provider + provider-specific id. Name, address, and phone are not keys. */
export function providerIdentityKey(provider: string, providerSupplierId: string): string {
  return `${provider}\u001f${providerSupplierId}`;
}

/**
 * In-memory discovery observation store.
 * Identity is provider + provider_supplier_id. Timestamp is not an identity.
 * Buyer PIN is stored from the discovery request and is never replaced by the seller PIN.
 * This store does not insert OTP suppliers and does not record live success.
 * supplier_provider_identities cannot hold a row without supplier_id and p_live_success;
 * callers that need durable storage use the 00230 observation tables instead.
 */
import { SupplierNetworkProviderKind } from '../types/supplier-provider-identity';
import { buildOndcDiscoveryCorrelation, type OndcDiscoveryCorrelationRecord } from './ondc-discovery-scope';
import { acceptBuyerRequestedPin } from './ondc-geography';
import { classifyOndcNetworkReachability, type OndcNormalizedCandidate } from './ondc-provider-foundation';
import {
  OndcRuntimeEnvironment,
  ondcProvenanceAllowed,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from './ondc-environment';

const FABRICATED_DISPLAY_NAMES = new Set(['ondc verified supplier']);

export interface OndcDiscoveryRetainMeta {
  source: OndcObservationSourceName;
  environment: OndcRuntimeEnvironmentName;
  productionActivated?: boolean;
}

export interface OndcRetainedDiscovery {
  provider: typeof SupplierNetworkProviderKind.ONDC;
  providerSupplierId: string;
  participantId: string;
  displayName: string;
  correlationId: string;
  messageId: string | null;
  requestedPin: string | null;
  requestedCategory: string | null;
  discoveredAt: string;
  bppUri: string | null;
  source: OndcObservationSourceName;
  environment: OndcRuntimeEnvironmentName;
  sellerPin: string | null;
  sellerLocality: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  sellerCountry: string | null;
  reportedPhone: string | null;
  reportedEmail: string | null;
  catalogueId: string | null;
  locationId: string | null;
  domain: string | null;
  cityCode: string | null;
  liveSuccess: false;
  otpSupplierId: null;
  placeId: null;
  rating: null;
  registered: false;
  gstVerified: false;
  otpVerified: false;
  businessStatus: null;
  invitationCreated: false;
  quoteCreated: false;
  awardCreated: false;
  purchaseOrderCreated: false;
  paymentCreated: false;
  correlation: OndcDiscoveryCorrelationRecord;
}

export interface OndcDiscoveryStore {
  identities: Map<string, OndcRetainedDiscovery>;
  suppliers: unknown[];
  invitations: unknown[];
  quotes: unknown[];
  awards: unknown[];
  purchaseOrders: unknown[];
  payments: unknown[];
}

export type OndcDiscoveryRetainResult =
  | { ok: true; identityKey: string; replay: boolean; created: boolean; retained: OndcRetainedDiscovery }
  | { ok: false; reason: string };

const CLIENT_INJECTION_KEYS = [
  'otpSupplierId',
  'supplierId',
  'supplier_id',
  'liveSuccess',
  'live_success',
  'p_live_success',
  'rating',
  'placeId',
  'place_id',
  'gstVerified',
  'otpVerified',
  'invitationId',
  'quoteId',
  'awardId',
  'purchaseOrderId',
  'paymentId',
  'businessStatus',
  'ondcDomain',
  'ondcCategory',
  'taxonomy',
  'supportStatus',
  'lifecycleCapability',
] as const;

export function createOndcDiscoveryStore(): OndcDiscoveryStore {
  return {
    identities: new Map(),
    suppliers: [],
    invitations: [],
    quotes: [],
    awards: [],
    purchaseOrders: [],
    payments: [],
  };
}

export function ondcDiscoveryIdentityKey(providerSupplierId: string): string {
  return `${SupplierNetworkProviderKind.ONDC}\u001f${providerSupplierId}`;
}

export function ondcDiscoveryProcurementCounts(store: OndcDiscoveryStore): {
  suppliersInserted: number;
  invitations: number;
  quotes: number;
  awards: number;
  purchaseOrders: number;
  payments: number;
} {
  return {
    suppliersInserted: store.suppliers.length,
    invitations: store.invitations.length,
    quotes: store.quotes.length,
    awards: store.awards.length,
    purchaseOrders: store.purchaseOrders.length,
    payments: store.payments.length,
  };
}

/** Discovery does not create an RFQ invitation. */
export function ondcDiscoveryRfqCapability(): { canReceiveRfq: false; invitationCreated: false } {
  return { canReceiveRfq: false, invitationCreated: false };
}

export function rejectOndcProviderMutation(
  retained: Pick<OndcRetainedDiscovery, 'provider'>,
  nextProvider: string,
): { ok: true } | { ok: false; reason: 'provider_immutable' } {
  if (nextProvider !== retained.provider) return { ok: false, reason: 'provider_immutable' };
  return { ok: true };
}

export function retainOndcDiscoveryFromUntrusted(
  store: OndcDiscoveryStore,
  untrusted: Readonly<Record<string, unknown>>,
  candidate: OndcNormalizedCandidate,
  meta: OndcDiscoveryRetainMeta,
): OndcDiscoveryRetainResult {
  const rejected = CLIENT_INJECTION_KEYS.filter((key) => untrusted[key] !== undefined && untrusted[key] !== null);
  if (rejected.length > 0) return { ok: false, reason: 'client_injection_rejected' };
  if (untrusted.provider !== undefined && untrusted.provider !== SupplierNetworkProviderKind.ONDC) {
    return { ok: false, reason: 'provider_immutable' };
  }
  return retainOndcDiscoveryObservation(store, candidate, meta);
}

export function retainOndcDiscoveryObservation(
  store: OndcDiscoveryStore,
  candidate: OndcNormalizedCandidate,
  meta: OndcDiscoveryRetainMeta,
): OndcDiscoveryRetainResult {
  if (candidate.provider !== SupplierNetworkProviderKind.ONDC) return { ok: false, reason: 'provider_not_ondc' };
  if (candidate.otpSupplierId) return { ok: false, reason: 'supplier_link_rejected' };
  if (!candidate.providerSupplierId?.trim() || !candidate.providerParticipantId?.trim()) {
    return { ok: false, reason: 'rejected_identity' };
  }
  if (FABRICATED_DISPLAY_NAMES.has(candidate.displayName.trim().toLowerCase())) {
    return { ok: false, reason: 'fabricated_display_name' };
  }
  if (!ondcProvenanceAllowed(meta.source, meta.environment)) return { ok: false, reason: 'rejected_provenance' };
  if (meta.environment === OndcRuntimeEnvironment.PRODUCTION && meta.productionActivated !== true) {
    return { ok: false, reason: 'ondc_production_disabled' };
  }
  if (!acceptBuyerRequestedPin(candidate.requestedPin).ok) {
    return { ok: false, reason: 'invalid_buyer_pin' };
  }
  const discoveredAtMs = Date.parse(candidate.discoveredAt);
  if (!Number.isFinite(discoveredAtMs)) return { ok: false, reason: 'missing_discovery_timestamp' };

  const identityKey = ondcDiscoveryIdentityKey(candidate.providerSupplierId);
  const existing = store.identities.get(identityKey);
  const incoming = observationFromCandidate(candidate, meta);
  if (!existing) {
    store.identities.set(identityKey, incoming);
    return { ok: true, identityKey, replay: false, created: true, retained: incoming };
  }
  if (existing.provider !== SupplierNetworkProviderKind.ONDC) {
    return { ok: false, reason: 'provider_immutable' };
  }

  const existingMs = Date.parse(existing.discoveredAt);
  const sameCorrelation = existing.correlationId === incoming.correlationId;
  const newer = discoveredAtMs > existingMs;
  if (!newer && !(sameCorrelation && discoveredAtMs === existingMs)) {
    return { ok: true, identityKey, replay: sameCorrelation, created: false, retained: existing };
  }

  const retained: OndcRetainedDiscovery = {
    ...incoming,
    requestedPin: existing.requestedPin ?? incoming.requestedPin,
    provider: existing.provider,
    providerSupplierId: existing.providerSupplierId,
  };
  retained.correlation = buildOndcDiscoveryCorrelation({
    candidate,
    environment: meta.environment,
    source: meta.source,
    buyerRequestedPin: retained.requestedPin,
    sellerPin: retained.sellerPin,
    sellerLocality: retained.sellerLocality,
    sellerCity: retained.sellerCity,
    sellerState: retained.sellerState,
  });
  store.identities.set(identityKey, retained);
  return { ok: true, identityKey, replay: sameCorrelation, created: false, retained };
}

export function toOndcDiscoveryBuyerView(retained: OndcRetainedDiscovery): {
  provider: 'ONDC';
  displayName: string;
  requestedCategory: string | null;
  stage: 'DISCOVERED';
} {
  return {
    provider: 'ONDC',
    displayName: retained.displayName,
    requestedCategory: retained.requestedCategory,
    stage: 'DISCOVERED',
  };
}

function observationFromCandidate(
  candidate: OndcNormalizedCandidate,
  meta: OndcDiscoveryRetainMeta,
): OndcRetainedDiscovery {
  const sellerPin = blank(candidate.location?.pinCode);
  const requestedPin = blank(candidate.requestedPin);
  return {
    provider: SupplierNetworkProviderKind.ONDC,
    providerSupplierId: candidate.providerSupplierId,
    participantId: candidate.providerParticipantId,
    displayName: candidate.displayName,
    correlationId: candidate.correlationId,
    messageId: blank(candidate.ondc.context.messageId),
    requestedPin,
    requestedCategory: blank(candidate.requestedCategory),
    discoveredAt: candidate.discoveredAt,
    bppUri: usableObservationEndpoint(candidate, meta),
    source: meta.source,
    environment: meta.environment,
    sellerPin,
    sellerLocality: blank(candidate.location?.locality),
    sellerCity: blank(candidate.location?.city),
    sellerState: blank(candidate.location?.state),
    sellerCountry: blank(candidate.location?.country),
    reportedPhone: blank(candidate.ondc.reportedPhone),
    reportedEmail: blank(candidate.ondc.reportedEmail),
    catalogueId: blank(candidate.ondc.catalogueId),
    locationId: blank(candidate.ondc.locationId),
    domain: blank(candidate.ondc.domain),
    cityCode: blank(candidate.ondc.cityCode),
    liveSuccess: false,
    otpSupplierId: null,
    placeId: null,
    rating: null,
    registered: false,
    gstVerified: false,
    otpVerified: false,
    businessStatus: null,
    invitationCreated: false,
    quoteCreated: false,
    awardCreated: false,
    purchaseOrderCreated: false,
    paymentCreated: false,
    correlation: buildOndcDiscoveryCorrelation({
      candidate,
      environment: meta.environment,
      source: meta.source,
      buyerRequestedPin: requestedPin,
      sellerPin,
      sellerLocality: blank(candidate.location?.locality),
      sellerCity: blank(candidate.location?.city),
      sellerState: blank(candidate.location?.state),
    }),
  };
}

function usableObservationEndpoint(
  candidate: OndcNormalizedCandidate,
  meta: OndcDiscoveryRetainMeta,
): string | null {
  return classifyOndcNetworkReachability({
    endpoint: candidate.ondc.endpoint,
    environment: meta.environment,
    source: meta.source,
  }).usableEndpoint;
}

function blank(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

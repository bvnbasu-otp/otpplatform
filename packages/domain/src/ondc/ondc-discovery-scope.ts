/**
 * ONDC-04 discovery record: geography, category mapping, reachability, and trust.
 * Discovery is not a quote, award, purchase order, or payment.
 * Reachability is not OTP registration, OTP verification, or GST verification.
 */
import {
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  providerIdentityKey,
} from '../types/supplier-provider-identity';
import {
  mapOndcDiscoveryCategory,
  type OndcDiscoveryCategoryMapping,
  type OndcDiscoverySupportStatus,
} from './ondc-category-mapping';
import {
  classifyOndcBuyerSellerGeography,
  type OndcGeographyMatch,
} from './ondc-geography';
import type { OndcObservationSource, OndcRuntimeEnvironment } from './ondc-environment';
import {
  classifyOndcNetworkReachability,
  encodeOndcProviderSupplierId,
  type OndcNetworkReachabilityState,
  type OndcNormalizedCandidate,
} from './ondc-provider-foundation';

export const ONDC_DISCOVERY_TRUST = {
  stage: 'DISCOVERED',
  otpRegistered: false,
  otpVerified: false,
  gstVerified: false,
  quotation: false,
  reachabilityIsTrust: false,
} as const;

export interface OndcDiscoveryCorrelationRecord {
  correlationId: string;
  messageId: string | null;
  transactionId: string | null;
  buyerRequestedPin: string | null;
  sellerPin: string | null;
  geographyMatch: OndcGeographyMatch;
  otpCategory: string | null;
  ondcDomain: string | null;
  supportStatus: OndcDiscoverySupportStatus;
  lifecycleCapability: 'DISCOVERY_ONLY';
  requirementMode: string | null;
  provider: typeof SupplierNetworkProviderKind.ONDC;
  participantId: string;
  discoveryId: string;
  endpointPresent: boolean;
  endpointHost: string | null;
  environment: OndcRuntimeEnvironment;
  /** Syntactic http(s) addressability. Not DNS, TCP, TLS, HTTP, or ONDC liveness. */
  networkAddressable: boolean;
  reachabilityState: OndcNetworkReachabilityState;
  source: OndcObservationSource;
  observedAt: string;
  stage: 'DISCOVERED';
  otpRegistered: false;
  otpVerified: false;
  gstVerified: false;
  quotation: false;
  reachabilityIsTrust: false;
}

/** A Google Place ID is never an ONDC provider supplier id. */
export function googlePlaceIdAsOndcProviderSupplierId(_placeId?: string | null): null {
  return null;
}

export function ondcIdentitySeparatesPlaceId(input: {
  participantId: string;
  sellerId: string;
  locationId?: string | null;
  googlePlaceId: string;
}): string | null {
  const placeId = input.googlePlaceId.trim();
  if (!placeId) return encodeOndcProviderSupplierId(input);
  if (
    input.participantId.trim() === placeId ||
    input.sellerId.trim() === placeId ||
    (input.locationId ?? '').trim() === placeId
  ) {
    return null;
  }
  const encoded = encodeOndcProviderSupplierId(input);
  if (!encoded || encoded.includes(placeId)) return null;
  return encoded;
}

export function ondcProviderIdentitiesStaySeparate(
  left: { participantId: string; sellerId: string; locationId?: string | null },
  right: { participantId: string; sellerId: string; locationId?: string | null },
): boolean {
  const a = encodeOndcProviderSupplierId(left);
  const b = encodeOndcProviderSupplierId(right);
  if (!a || !b) return false;
  return providerIdentityKey(SupplierNetworkProviderKind.ONDC, a) !== providerIdentityKey(SupplierNetworkProviderKind.ONDC, b);
}

export function ondcDiscoveryTrustClaims(): typeof ONDC_DISCOVERY_TRUST {
  return ONDC_DISCOVERY_TRUST;
}

export function buildOndcDiscoveryCorrelation(input: {
  candidate: OndcNormalizedCandidate;
  environment: OndcRuntimeEnvironment;
  source: OndcObservationSource;
  buyerRequestedPin: string | null;
  sellerPin: string | null;
  sellerLocality: string | null;
  sellerCity: string | null;
  sellerState: string | null;
}): OndcDiscoveryCorrelationRecord {
  const geography = classifyOndcBuyerSellerGeography({
    buyerRequestedPin: input.buyerRequestedPin,
    sellerPin: input.sellerPin,
    sellerLocality: input.sellerLocality,
    sellerCity: input.sellerCity,
    sellerState: input.sellerState,
  });
  const mapping = mappingForCandidate(input.candidate);
  const explicitUnavailable =
    input.candidate.providerStatus === SupplierNetworkProviderOperationalStatus.UNAVAILABLE &&
    Boolean(input.candidate.ondc.endpoint);
  const reachability = classifyOndcNetworkReachability({
    endpoint: input.candidate.ondc.endpoint,
    unavailable: explicitUnavailable,
    environment: input.environment,
    source: input.source,
    phone: input.candidate.ondc.reportedPhone,
    canReceiveRfq: false,
    provider: input.candidate.provider,
    supplierExists: false,
  });
  const trust = ondcDiscoveryTrustClaims();

  return {
    correlationId: input.candidate.correlationId,
    messageId: input.candidate.ondc.context.messageId ?? null,
    transactionId: input.candidate.ondc.context.transactionId,
    buyerRequestedPin: geography.geography.buyerRequestedPin,
    sellerPin: geography.geography.sellerPin,
    geographyMatch: geography.geography.match,
    otpCategory: mapping.otpCategory,
    ondcDomain: mapping.ondcDomain,
    supportStatus: mapping.supportStatus,
    lifecycleCapability: mapping.lifecycleCapability,
    requirementMode: input.candidate.categoryClassification.requirementMode,
    provider: SupplierNetworkProviderKind.ONDC,
    participantId: input.candidate.providerParticipantId,
    discoveryId: input.candidate.providerSupplierId,
    endpointPresent: reachability.endpointPresent,
    endpointHost: reachability.endpointHost,
    environment: input.environment,
    networkAddressable: reachability.networkAddressable,
    reachabilityState: reachability.state,
    source: input.source,
    observedAt: input.candidate.discoveredAt,
    stage: trust.stage,
    otpRegistered: trust.otpRegistered,
    otpVerified: trust.otpVerified,
    gstVerified: trust.gstVerified,
    quotation: trust.quotation,
    reachabilityIsTrust: trust.reachabilityIsTrust,
  };
}

function mappingForCandidate(candidate: OndcNormalizedCandidate): OndcDiscoveryCategoryMapping {
  if (candidate.categoryMapping) return candidate.categoryMapping;
  return mapOndcDiscoveryCategory({
    otpCategory: candidate.requestedCategory,
    subcategoryCode: candidate.categoryClassification.requestedSubcategoryCode,
    requirementMode: candidate.categoryClassification.requirementMode,
    ondcDomain: candidate.ondc.domain,
    title: candidate.category,
    taxonomy: candidate.ondc.providerSubcategory,
  });
}

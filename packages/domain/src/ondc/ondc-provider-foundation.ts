/**
 * ONDC discovery foundation for the Supplier Network Engine.
 * Protocol scope is /search then /on_search only.
 * Discovery is not invitation, registration, verification, award, or payment.
 * Integration status stays CREDENTIAL_GATED until a real network proof exists.
 * This module does not call the network and does not invent sellers.
 *
 * Canonical candidate translation lives here and in the services /on_search
 * normalizer. Callback identity for persistence uses that normalizer.
 *
 * Geography: the buyer requested PIN is the authority for the discovery
 * request. The seller-reported PIN is preserved separately and may differ.
 * A PIN difference is not a normalization failure and is not rewritten.
 */
import { mapExplicitSubcategoryToOndcDomain } from './ondc-taxonomy-boundary';
import {
  ProviderContactabilityStatus,
  ProviderReachabilityKind,
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  providerIdentityKey,
  type NormalizedProviderSupplierCandidate,
  type ProviderNeutralCoordinates,
  type ProviderNeutralLocation,
  type ProviderReachabilityChannel,
} from '../types/supplier-provider-identity';

export const ONDC_FOUNDATION_PROTOCOL_ACTIONS = ['search', 'on_search'] as const;

export const ONDC_CANDIDATE_PROVENANCE = 'ONDC_ON_SEARCH' as const;

/** Visible non-live status. No code path in this foundation returns LIVE. */
export const ONDC_FOUNDATION_INTEGRATION_STATUS =
  SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED;

export type OndcFoundationIntegrationStatus = typeof ONDC_FOUNDATION_INTEGRATION_STATUS;

/**
 * Unit separator. Forbidden inside identity tokens so the encoding splits
 * unambiguously. This is not a suppliers.id and not a new ad-hoc format:
 * participant, seller, and location are also stored as separate fields.
 */
const IDENTITY_SEPARATOR = '\u001f';

const REJECTED_IDENTITY_VALUES = new Set([
  'unknown',
  'unknown-bpp',
  'fake',
  'synthetic',
  'placeholder',
  'example',
  'null',
  'undefined',
  'n/a',
  'na',
  'test',
  'test-seller',
]);

/** Display names the non-canonical receiver invents. Never emitted here. */
const FABRICATED_DISPLAY_NAMES = new Set(['ondc verified supplier']);

/** Domains this foundation may treat as allow-list mappings. Not a heuristic list. */
const ALLOW_LISTED_ONDC_DOMAINS = new Set(['ONDC:RET12', 'ONDC:RET14']);

const INDIAN_PIN = /^[1-9]\d{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OndcCategorySupport = {
  MAPPED: 'MAPPED',
  UNMAPPED: 'UNMAPPED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
} as const;

export type OndcCategorySupport = (typeof OndcCategorySupport)[keyof typeof OndcCategorySupport];

export type OndcSellerPinRelation =
  | 'matches_requested_pin'
  | 'differs_from_requested_pin'
  | 'seller_pin_unreported'
  | 'seller_pin_invalid'
  | 'requested_pin_invalid'
  | 'requested_pin_unreported';

export interface OndcDiscoveryRequestScope {
  requestedPin?: string | null;
  requestedCategory?: string | null;
  requestedSubcategoryCode?: string | null;
  requirementMode?: string | null;
}

export interface OndcOnSearchRecord {
  participantId?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  locationId?: string | null;
  catalogueId?: string | null;
  itemIds?: readonly string[] | null;
  domain?: string | null;
  cityCode?: string | null;
  country?: string | null;
  endpoint?: string | null;
  formattedAddress?: string | null;
  sellerLocality?: string | null;
  sellerPin?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  sellerCountry?: string | null;
  coordinates?: { lat?: number | null; lng?: number | null } | null;
  phone?: string | null;
  email?: string | null;
  /** Provider-reported category label. Not an ONDC domain and not an OTP subcategory code. */
  category?: string | null;
  /** Provider-reported subcategory or category id. Not an OTP subcategory code. */
  providerSubcategory?: string | null;
  correlationId?: string | null;
  messageId?: string | null;
  contextTimestamp?: string | null;
  observedAt?: string | null;
  unavailable?: boolean | null;
  requestedPin?: string | null;
  requestedCategory?: string | null;
  requestedSubcategoryCode?: string | null;
  requirementMode?: string | null;
}

export interface OndcProtocolContext {
  action: 'on_search';
  transactionId: string;
  messageId?: string;
  domain?: string;
  city?: string;
  country?: string;
}

export interface OndcProtocolIdentity {
  participantId: string;
  sellerId: string;
  locationId?: string;
  catalogueId?: string;
  itemIds: readonly string[];
  domain?: string;
  providerSubcategory?: string;
  cityCode?: string;
  country?: string;
  /** Omitted when the provider reported no seller geography. Never filled from the buyer PIN. */
  sellerLocation?: ProviderNeutralLocation;
  endpoint?: string;
  reportedPhone?: string;
  reportedEmail?: string;
  context: OndcProtocolContext;
}

/**
 * OTP request classification, kept apart from provider-reported domain text.
 * allowListedDomain is set only by mapExplicitSubcategoryToOndcDomain.
 */
export interface OndcCategoryClassification {
  requestedCategory: string | null;
  requestedSubcategoryCode: string | null;
  requirementMode: string | null;
  allowListedDomain: string | null;
  providerDomain: string | null;
  providerCategory: string | null;
  providerSubcategory: string | null;
  support: OndcCategorySupport;
}

export interface OndcNormalizedCandidate extends NormalizedProviderSupplierCandidate {
  provider: typeof SupplierNetworkProviderKind.ONDC;
  providerSupplierId: string;
  providerParticipantId: string;
  displayName: string;
  provenance: typeof ONDC_CANDIDATE_PROVENANCE;
  discoveredAt: string;
  correlationId: string;
  /** Buyer discovery PIN. Never copied from the seller PIN. Null when the request omitted it. */
  requestedPin: string | null;
  requestedCategory: string | null;
  categoryClassification: OndcCategoryClassification;
  providerStatus: SupplierNetworkProviderOperationalStatus;
  contactability: (typeof ProviderContactabilityStatus)[keyof typeof ProviderContactabilityStatus];
  reachability: readonly ProviderReachabilityChannel[];
  integrationStatus: OndcFoundationIntegrationStatus;
  liveIntegrationCertified: false;
  discoveryOnly: true;
  registered: false;
  gstVerified: false;
  otpVerified: false;
  awarded: false;
  purchaseOrderIssued: false;
  paymentCreated: false;
  ondc: OndcProtocolIdentity;
}

export type OndcNormalizeResult =
  | { ok: true; candidate: OndcNormalizedCandidate }
  | { ok: false; reason: string };

export interface OndcGeographyDecision {
  requestedPin: string | null;
  sellerPin: string | null;
  sellerLocality: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  sellerCountry: string | null;
  sellerCoordinates: ProviderNeutralCoordinates | null;
  sellerPinRelation: OndcSellerPinRelation;
  /**
   * The normalized candidate is kept. This object does not mean normalization
   * failed, and it does not rewrite either PIN.
   */
  normalization: 'RETAINED';
}

export interface OndcRfqDiscoveryScope extends OndcDiscoveryRequestScope {
  rfqId: string;
  requestedPin: string;
  requestedCategory: string;
}

export interface OndcRfqParticipantRecord {
  identityKey: string;
  registered: false;
  gstVerified: false;
  otpVerified: false;
  awarded: false;
  purchaseOrderIssued: false;
  paymentCreated: false;
}

export interface OndcRfqInvitationRecord {
  rfqId: string;
  identityKey: string;
  state: 'AUTHORITY_RECORDED';
  dispatch: 'NOT_ATTEMPTED';
}

export interface OndcRfqAuthorityState {
  participants: readonly OndcRfqParticipantRecord[];
  invitations: readonly OndcRfqInvitationRecord[];
}

export interface OndcRfqAdmission {
  entered: boolean;
  reason: string;
  identityKey: string | null;
  integrationStatus: OndcFoundationIntegrationStatus;
  liveIntegrationCertified: false;
  stage: 'DISCOVERED';
  registered: false;
  gstVerified: false;
  otpVerified: false;
  awarded: false;
  purchaseOrderIssued: false;
  paymentCreated: false;
  invitationState: 'NONE' | 'AUTHORITY_RECORDED';
  dispatch: 'NOT_ATTEMPTED';
  databaseParticipantCreated: false;
  databaseInvitationCreated: false;
  authorityPath: 'SNE_RFQ_AUTHORITY';
}

export interface OndcBuyerSafeDiscoveryView {
  provenanceLabel: 'Network suppliers';
  category: string | null;
  stage: 'DISCOVERED';
}

export function ondcIntegrationStatus(): OndcFoundationIntegrationStatus {
  return ONDC_FOUNDATION_INTEGRATION_STATUS;
}

/**
 * Search domain follows the existing OTP allow-list only.
 * Unlisted services and material categories stay unmapped. Grocery (RET10) is not a default.
 * Title heuristics and the SRV11 fallback are not used.
 */
export function resolveOndcFoundationDiscoveryDomain(input: {
  subcategoryCode?: string | null;
  requirementMode?: string | null;
}): string | null {
  const subcategoryCode = cleanText(input.subcategoryCode);
  if (!subcategoryCode) return null;
  return mapExplicitSubcategoryToOndcDomain(subcategoryCode, input.requirementMode);
}

export function classifyOndcDiscoveryCategory(input: {
  requestedCategory?: string | null;
  requestedSubcategoryCode?: string | null;
  requirementMode?: string | null;
  providerDomain?: string | null;
  providerCategory?: string | null;
  providerSubcategory?: string | null;
}): OndcCategoryClassification {
  const requestedCategory = cleanText(input.requestedCategory);
  const requestedSubcategoryCode = cleanText(input.requestedSubcategoryCode);
  const requirementMode = cleanText(input.requirementMode);
  const providerDomain = cleanText(input.providerDomain);
  const providerCategory = cleanText(input.providerCategory);
  const providerSubcategory = cleanText(input.providerSubcategory);
  const allowListedDomain = requestedSubcategoryCode
    ? mapExplicitSubcategoryToOndcDomain(requestedSubcategoryCode, requirementMode)
    : null;

  const providerDomainUnsupported = providerDomain !== null && !ALLOW_LISTED_ONDC_DOMAINS.has(providerDomain);
  const projectCctvExcluded =
    requestedSubcategoryCode === 'cctv_surveillance' && requirementMode === 'PROJECT_CONTRACT';

  let support: OndcCategorySupport;
  if (providerDomainUnsupported || projectCctvExcluded) {
    support = OndcCategorySupport.NOT_SUPPORTED;
  } else if (!allowListedDomain) {
    support = OndcCategorySupport.UNMAPPED;
  } else if (providerDomain && providerDomain !== allowListedDomain) {
    support = OndcCategorySupport.NOT_SUPPORTED;
  } else {
    support = OndcCategorySupport.MAPPED;
  }

  return {
    requestedCategory,
    requestedSubcategoryCode,
    requirementMode,
    allowListedDomain,
    providerDomain,
    providerCategory,
    providerSubcategory,
    support,
  };
}

/**
 * Deterministic encoding of participant + seller + location.
 * Those three values are also stored separately on the candidate.
 * A token that contains the unit separator is rejected so the encoding
 * stays reversible and collision-resistant. The result is provider-scoped
 * only when paired with SupplierNetworkProviderKind.ONDC. It is not suppliers.id.
 */
export function encodeOndcProviderSupplierId(input: {
  participantId?: string | null;
  sellerId?: string | null;
  locationId?: string | null;
}): string | null {
  const participantId = acceptIdentityToken(input.participantId);
  const sellerId = acceptIdentityToken(input.sellerId);
  if (!participantId || !sellerId) return null;
  const locationId = acceptIdentityToken(input.locationId) ?? '';
  return `${participantId}${IDENTITY_SEPARATOR}${sellerId}${IDENTITY_SEPARATOR}${locationId}`;
}

/** Inverse of encodeOndcProviderSupplierId. Empty locationId means no location id. */
export function decodeOndcProviderSupplierId(value: string): {
  participantId: string;
  sellerId: string;
  locationId: string;
} | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parts = value.split(IDENTITY_SEPARATOR);
  if (parts.length !== 3) return null;
  const [participantId, sellerId, locationId] = parts;
  if (!participantId || !sellerId) return null;
  if (REJECTED_IDENTITY_VALUES.has(participantId.toLowerCase())) return null;
  if (REJECTED_IDENTITY_VALUES.has(sellerId.toLowerCase())) return null;
  return { participantId, sellerId, locationId: locationId ?? '' };
}

export function normalizeOndcOnSearchRecord(
  record: OndcOnSearchRecord,
  scope?: OndcDiscoveryRequestScope,
): OndcNormalizeResult {
  const participantId = acceptIdentityToken(record.participantId);
  const sellerId = acceptIdentityToken(record.sellerId);
  if (!participantId) return { ok: false, reason: identityFailureReason(record.participantId, 'participant') };
  if (!sellerId) return { ok: false, reason: identityFailureReason(record.sellerId, 'seller') };

  const displayName = cleanText(record.sellerName);
  if (!displayName) return { ok: false, reason: 'missing_display_name' };
  if (FABRICATED_DISPLAY_NAMES.has(displayName.toLowerCase())) {
    return { ok: false, reason: 'fabricated_display_name' };
  }
  if (sellerId.toLowerCase() === displayName.toLowerCase()) {
    return { ok: false, reason: 'business_name_identity' };
  }
  if (participantId.toLowerCase() === displayName.toLowerCase()) {
    return { ok: false, reason: 'business_name_identity' };
  }

  const correlationId = cleanText(record.correlationId);
  if (!correlationId) return { ok: false, reason: 'missing_correlation_id' };

  const discoveredAt = cleanText(record.contextTimestamp) ?? cleanText(record.observedAt);
  if (!discoveredAt) return { ok: false, reason: 'missing_discovery_timestamp' };

  const locationId = acceptIdentityToken(record.locationId) ?? undefined;
  if (cleanText(record.locationId) && !locationId) {
    return { ok: false, reason: 'rejected_location_id' };
  }

  const providerSupplierId = encodeOndcProviderSupplierId({
    participantId,
    sellerId,
    locationId,
  });
  if (!providerSupplierId) return { ok: false, reason: 'rejected_identity' };

  const coordinates = acceptCoordinates(record.coordinates);
  const sellerLocation = compactLocation({
    formattedAddress: cleanText(record.formattedAddress) ?? undefined,
    locality: cleanText(record.sellerLocality) ?? undefined,
    pinCode: cleanText(record.sellerPin) ?? undefined,
    city: cleanText(record.sellerCity) ?? undefined,
    state: cleanText(record.sellerState) ?? undefined,
    country: cleanText(record.sellerCountry) ?? undefined,
    coordinates,
  });

  const requestedPin = cleanText(scope?.requestedPin !== undefined ? scope.requestedPin : record.requestedPin);
  const requestedCategory = cleanText(
    scope?.requestedCategory !== undefined ? scope.requestedCategory : record.requestedCategory,
  );
  const requestedSubcategoryCode = cleanText(
    scope?.requestedSubcategoryCode !== undefined
      ? scope.requestedSubcategoryCode
      : record.requestedSubcategoryCode,
  );
  const requirementMode = cleanText(
    scope?.requirementMode !== undefined ? scope.requirementMode : record.requirementMode,
  );

  const endpoint = networkEndpoint(record.endpoint) ?? undefined;
  const reportedPhone = usablePhone(record.phone) ?? undefined;
  const reportedEmail = usableEmail(record.email) ?? undefined;
  const reachability = record.unavailable
    ? []
    : deriveReportedReachability({ endpoint, phone: reportedPhone, email: reportedEmail });
  const providerStatus = record.unavailable
    ? SupplierNetworkProviderOperationalStatus.UNAVAILABLE
    : endpoint
      ? SupplierNetworkProviderOperationalStatus.REACHABLE
      : SupplierNetworkProviderOperationalStatus.UNAVAILABLE;

  const itemIds = uniqueClean(record.itemIds);
  const category = cleanText(record.category) ?? undefined;
  const providerSubcategory = cleanText(record.providerSubcategory) ?? undefined;
  const domain = cleanText(record.domain) ?? undefined;
  const cityCode = cleanText(record.cityCode) ?? undefined;
  const country = cleanText(record.country) ?? undefined;
  const catalogueId = cleanText(record.catalogueId) ?? undefined;
  const messageId = cleanText(record.messageId) ?? undefined;
  const categoryClassification = classifyOndcDiscoveryCategory({
    requestedCategory,
    requestedSubcategoryCode,
    requirementMode,
    providerDomain: domain,
    providerCategory: category,
    providerSubcategory,
  });

  const candidate: OndcNormalizedCandidate = {
    provider: SupplierNetworkProviderKind.ONDC,
    providerSupplierId,
    providerParticipantId: participantId,
    providerCatalogueId: catalogueId,
    correlationId,
    displayName,
    phone: reachability.find((channel) => channel.kind === ProviderReachabilityKind.PHONE)?.value,
    location: sellerLocation,
    category,
    requestedPin,
    requestedCategory,
    categoryClassification,
    reachability,
    contactability:
      reachability.length > 0
        ? ProviderContactabilityStatus.REACHABLE
        : ProviderContactabilityStatus.NOT_REACHABLE,
    providerStatus,
    provenance: ONDC_CANDIDATE_PROVENANCE,
    discoveredAt,
    integrationStatus: ONDC_FOUNDATION_INTEGRATION_STATUS,
    liveIntegrationCertified: false,
    discoveryOnly: true,
    registered: false,
    gstVerified: false,
    otpVerified: false,
    awarded: false,
    purchaseOrderIssued: false,
    paymentCreated: false,
    ondc: {
      participantId,
      sellerId,
      locationId,
      catalogueId,
      itemIds,
      domain,
      providerSubcategory,
      cityCode,
      country,
      sellerLocation,
      endpoint,
      reportedPhone,
      reportedEmail,
      context: {
        action: 'on_search',
        transactionId: correlationId,
        messageId,
        domain,
        city: cityCode,
        country,
      },
    },
  };

  return { ok: true, candidate };
}

export function deriveReportedReachability(input: {
  endpoint?: string | null;
  phone?: string | null;
  email?: string | null;
}): ProviderReachabilityChannel[] {
  const channels: ProviderReachabilityChannel[] = [];
  const endpoint = networkEndpoint(input.endpoint);
  if (endpoint) channels.push({ kind: ProviderReachabilityKind.NETWORK, value: endpoint });
  const phone = usablePhone(input.phone);
  if (phone) channels.push({ kind: ProviderReachabilityKind.PHONE, value: phone });
  const email = usableEmail(input.email);
  if (email) channels.push({ kind: ProviderReachabilityKind.EMAIL, value: email });
  return channels;
}

/**
 * Records the buyer PIN and the seller-reported geography without dropping
 * the candidate and without copying one PIN onto the other.
 * State, city, and locality are preserved as reported. They are not a whitelist.
 */
export function evaluateOndcDiscoveryGeography(input: {
  requestedPin?: string | null;
  sellerPin?: string | null;
  sellerLocality?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  sellerCountry?: string | null;
  sellerCoordinates?: ProviderNeutralCoordinates | null;
}): OndcGeographyDecision {
  const requestedPin = cleanText(input.requestedPin);
  const sellerPin = cleanText(input.sellerPin);
  const decisionBase = {
    requestedPin,
    sellerPin,
    sellerLocality: cleanText(input.sellerLocality),
    sellerCity: cleanText(input.sellerCity),
    sellerState: cleanText(input.sellerState),
    sellerCountry: cleanText(input.sellerCountry),
    sellerCoordinates: input.sellerCoordinates ?? null,
    normalization: 'RETAINED' as const,
  };

  if (!requestedPin) {
    return { ...decisionBase, sellerPinRelation: 'requested_pin_unreported' };
  }
  if (!INDIAN_PIN.test(requestedPin)) {
    return { ...decisionBase, sellerPinRelation: 'requested_pin_invalid' };
  }
  if (!sellerPin) {
    return { ...decisionBase, sellerPinRelation: 'seller_pin_unreported' };
  }
  if (!INDIAN_PIN.test(sellerPin)) {
    return { ...decisionBase, sellerPinRelation: 'seller_pin_invalid' };
  }
  if (sellerPin !== requestedPin) {
    return { ...decisionBase, sellerPinRelation: 'differs_from_requested_pin' };
  }
  return { ...decisionBase, sellerPinRelation: 'matches_requested_pin' };
}

export function dedupeProviderNeutralCandidates<T extends Pick<
  NormalizedProviderSupplierCandidate,
  'provider' | 'providerSupplierId'
>>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = providerIdentityKey(row.provider, row.providerSupplierId);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

export function emptyOndcRfqAuthorityState(): OndcRfqAuthorityState {
  return { participants: [], invitations: [] };
}

/**
 * Optional in-memory discovery gate. It does not write a database, create an
 * RFQ invitation, dispatch a message, or call discover_and_invite_for_rfq.
 * Seller PIN mismatch is not a refusal: both PINs stay on the candidate.
 * Category admission uses the allow-list, not equality of catalog labels.
 */
export function admitOndcCandidateToRfqAuthority(
  candidate: OndcNormalizedCandidate,
  scope: OndcRfqDiscoveryScope,
  state: OndcRfqAuthorityState = emptyOndcRfqAuthorityState(),
): { admission: OndcRfqAdmission; state: OndcRfqAuthorityState } {
  const identityKey = providerIdentityKey(candidate.provider, candidate.providerSupplierId);
  const refused = (reason: string, invitationState: OndcRfqAdmission['invitationState'] = 'NONE') => ({
    admission: admissionShell({
      entered: false,
      reason,
      identityKey,
      invitationState,
    }),
    state,
  });

  if (candidate.provider !== SupplierNetworkProviderKind.ONDC) return refused('provider_not_ondc');
  if (candidate.liveIntegrationCertified !== false) return refused('live_status_rejected');
  if (candidate.integrationStatus !== ONDC_FOUNDATION_INTEGRATION_STATUS) {
    return refused('live_status_rejected');
  }
  if (
    candidate.registered !== false ||
    candidate.gstVerified !== false ||
    candidate.otpVerified !== false ||
    candidate.awarded !== false ||
    candidate.purchaseOrderIssued !== false ||
    candidate.paymentCreated !== false ||
    candidate.discoveryOnly !== true
  ) {
    return refused('verification_claim_rejected');
  }
  if (candidate.otpSupplierId) return refused('supplier_activation_rejected');
  if (candidate.providerStatus === SupplierNetworkProviderOperationalStatus.LIVE) {
    return refused('live_status_rejected');
  }
  if (candidate.providerStatus === SupplierNetworkProviderOperationalStatus.UNAVAILABLE) {
    return refused('provider_unavailable');
  }
  if (candidate.providerStatus !== SupplierNetworkProviderOperationalStatus.REACHABLE) {
    return refused('provider_not_reachable');
  }

  const networkChannel = candidate.reachability?.find(
    (channel) => channel.kind === ProviderReachabilityKind.NETWORK && Boolean(channel.value),
  );
  if (!networkChannel || candidate.contactability !== ProviderContactabilityStatus.REACHABLE) {
    return refused('not_network_reachable');
  }

  const classification = classifyOndcDiscoveryCategory({
    requestedCategory: scope.requestedCategory,
    requestedSubcategoryCode: scope.requestedSubcategoryCode,
    requirementMode: scope.requirementMode,
    providerDomain: candidate.ondc?.domain,
    providerCategory: candidate.category,
    providerSubcategory: candidate.ondc?.providerSubcategory,
  });
  if (classification.support === OndcCategorySupport.NOT_SUPPORTED) {
    return refused('category_not_supported');
  }
  if (classification.support !== OndcCategorySupport.MAPPED) {
    return refused('category_unmapped');
  }

  const existingParticipant = state.participants.find((row) => row.identityKey === identityKey);
  const existingInvitation = state.invitations.find(
    (row) => row.identityKey === identityKey && row.rfqId === scope.rfqId,
  );
  if (existingInvitation) {
    return refused('duplicate_ondc_identity', 'AUTHORITY_RECORDED');
  }

  const participants = existingParticipant
    ? state.participants
    : [
        ...state.participants,
        {
          identityKey,
          registered: false as const,
          gstVerified: false as const,
          otpVerified: false as const,
          awarded: false as const,
          purchaseOrderIssued: false as const,
          paymentCreated: false as const,
        },
      ];
  const invitations = [
    ...state.invitations,
    {
      rfqId: scope.rfqId,
      identityKey,
      state: 'AUTHORITY_RECORDED' as const,
      dispatch: 'NOT_ATTEMPTED' as const,
    },
  ];

  return {
    admission: admissionShell({
      entered: true,
      reason: 'admitted',
      identityKey,
      invitationState: 'AUTHORITY_RECORDED',
    }),
    state: { participants, invitations },
  };
}

export function rejectClientOndcOverrides<T>(
  candidate: T,
  overrides: Readonly<Record<string, unknown>>,
): { candidate: T; rejected: string[] } {
  return { candidate, rejected: Object.keys(overrides) };
}

export function attemptClientRfqMutation(
  state: OndcRfqAuthorityState,
  _claim: Readonly<Record<string, unknown>>,
): { ok: false; reason: 'client_mutation_rejected'; state: OndcRfqAuthorityState } {
  return { ok: false, reason: 'client_mutation_rejected', state };
}

export function toOndcBuyerSafeView(candidate: OndcNormalizedCandidate): OndcBuyerSafeDiscoveryView {
  return {
    provenanceLabel: 'Network suppliers',
    category: candidate.category ?? null,
    stage: 'DISCOVERED',
  };
}

function admissionShell(input: {
  entered: boolean;
  reason: string;
  identityKey: string | null;
  invitationState: OndcRfqAdmission['invitationState'];
}): OndcRfqAdmission {
  return {
    entered: input.entered,
    reason: input.reason,
    identityKey: input.identityKey,
    integrationStatus: ONDC_FOUNDATION_INTEGRATION_STATUS,
    liveIntegrationCertified: false,
    stage: 'DISCOVERED',
    registered: false,
    gstVerified: false,
    otpVerified: false,
    awarded: false,
    purchaseOrderIssued: false,
    paymentCreated: false,
    invitationState: input.invitationState,
    dispatch: 'NOT_ATTEMPTED',
    databaseParticipantCreated: false,
    databaseInvitationCreated: false,
    authorityPath: 'SNE_RFQ_AUTHORITY',
  };
}

function identityFailureReason(value: string | null | undefined, role: 'participant' | 'seller'): string {
  if (!cleanText(value)) return role === 'participant' ? 'missing_participant_id' : 'missing_seller_id';
  return 'rejected_identity';
}

function acceptIdentityToken(value?: string | null): string | null {
  const trimmed = cleanText(value);
  if (!trimmed) return null;
  if (trimmed.includes(IDENTITY_SEPARATOR)) return null;
  if (REJECTED_IDENTITY_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function acceptCoordinates(
  value?: { lat?: number | null; lng?: number | null } | null,
): ProviderNeutralCoordinates | undefined {
  if (!value) return undefined;
  const { lat, lng } = value;
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function compactLocation(location: ProviderNeutralLocation): ProviderNeutralLocation | undefined {
  const compact: ProviderNeutralLocation = {};
  if (location.formattedAddress) compact.formattedAddress = location.formattedAddress;
  if (location.locality) compact.locality = location.locality;
  if (location.pinCode) compact.pinCode = location.pinCode;
  if (location.city) compact.city = location.city;
  if (location.state) compact.state = location.state;
  if (location.country) compact.country = location.country;
  if (location.coordinates) compact.coordinates = location.coordinates;
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function networkEndpoint(value?: string | null): string | null {
  const trimmed = cleanText(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function usablePhone(value?: string | null): string | null {
  const trimmed = cleanText(value);
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return trimmed;
}

function usableEmail(value?: string | null): string | null {
  const trimmed = cleanText(value);
  if (!trimmed || !EMAIL.test(trimmed)) return null;
  return trimmed;
}

function uniqueClean(values?: readonly string[] | null): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = cleanText(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function cleanText(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

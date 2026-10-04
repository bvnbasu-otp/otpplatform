/**
 * ONDC-05 sourcing addressability bridge.
 * Answers whether one ONDC participant can be considered addressable for one OTP sourcing request.
 *
 * NETWORK_ADDRESSABLE is a syntactically usable http(s) endpoint from ONDC-04.
 * It is not a live probe, a response, an RFQ acceptance, a quote, OTP registration, or GST verification.
 * Admission is stricter than addressability. The result is an in-memory decision and eligible set.
 *
 * This module does not send an RFQ, create an invitation, quote, award, purchase order,
 * payment, or cashback, and it does not call the network. Production admission stays disabled.
 * ONDC_ENABLED is ignored. Credential slots are not crossed.
 *
 * Buyer requested PIN is the only geography authority. A client PIN is not.
 * An invalid buyer PIN rejects. A missing buyer PIN rejects.
 * Seller PIN is stored separately and is never copied over the buyer PIN.
 * EXACT_PIN, OUT_OF_AREA, SAME_LOCALITY, PROVIDER_AREA, and UNKNOWN are the ONDC-04
 * relationship labels. They are recorded on the decision and do not by themselves reject admission.
 * UNKNOWN is never rewritten to EXACT_PIN. There is no approved radius.
 *
 * Category admission uses mapOndcDiscoveryCategory only. Title text and a client domain do not map.
 * The allow-list lifecycle is DISCOVERY_ONLY. Discovery is not a quote.
 */
import {
  SupplierNetworkProviderKind,
  providerIdentityKey,
} from '../types/supplier-provider-identity';
import {
  mapOndcDiscoveryCategory,
  OndcDiscoverySupportStatus,
  OndcLifecycleCapability,
  type OndcDiscoverySupportStatus as OndcDiscoverySupportStatusName,
} from './ondc-category-mapping';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  parseOndcRuntimeEnvironment,
  resolveOndcEnvironmentGate,
  type OndcEnvironmentConfigInput,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from './ondc-environment';
import {
  classifyOndcBuyerSellerGeography,
  type OndcGeographyClassification,
  type OndcGeographyMatch as OndcGeographyMatchName,
} from './ondc-geography';
import {
  OndcNetworkReachabilityState,
  classifyOndcNetworkReachability,
  decodeOndcProviderSupplierId,
  type OndcNetworkReachabilityState as OndcNetworkReachabilityStateName,
} from './ondc-provider-foundation';

export const OndcSourcingAdmissionReason = {
  ADMISSIBLE: 'ADMISSIBLE',
  UNSUPPORTED_PROVIDER: 'UNSUPPORTED_PROVIDER',
  MISSING_PROVIDER_IDENTITY: 'MISSING_PROVIDER_IDENTITY',
  ENDPOINT_MISSING: 'ENDPOINT_MISSING',
  ENDPOINT_INVALID: 'ENDPOINT_INVALID',
  NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
  UNSUPPORTED_CATEGORY: 'UNSUPPORTED_CATEGORY',
  MISSING_DOMAIN: 'MISSING_DOMAIN',
  UNSUPPORTED_LIFECYCLE: 'UNSUPPORTED_LIFECYCLE',
  GEOGRAPHY_NOT_APPLICABLE: 'GEOGRAPHY_NOT_APPLICABLE',
  GEOGRAPHY_UNKNOWN: 'GEOGRAPHY_UNKNOWN',
  OUT_OF_AREA: 'OUT_OF_AREA',
  SAME_LOCALITY: 'SAME_LOCALITY',
  PROVIDER_AREA: 'PROVIDER_AREA',
  CREDENTIAL_GATED: 'CREDENTIAL_GATED',
  ENVIRONMENT_DISABLED: 'ENVIRONMENT_DISABLED',
  PRODUCTION_DISABLED: 'PRODUCTION_DISABLED',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
  INVALID_BUYER_PIN: 'invalid_buyer_pin',
  FABRICATED_DISPLAY_NAME: 'fabricated_display_name',
  BUSINESS_NAME_IDENTITY: 'business_name_identity',
} as const;

export type OndcSourcingAdmissionReason =
  (typeof OndcSourcingAdmissionReason)[keyof typeof OndcSourcingAdmissionReason];

/**
 * Relationship labels are recorded on the decision. They do not admit or reject.
 * Geography rejects admission only for an invalid or missing buyer PIN.
 * There is no approved radius.
 */
export const ONDC_SOURCING_GEOGRAPHY_ADMISSION = {
  rejectsOn: ['invalid_buyer_pin', 'missing_buyer_pin'] as const,
  outOfAreaMeans: 'seller_pin_differs',
  radiusKm: null,
} as const;

const FABRICATED_DISPLAY_NAMES = new Set(['ondc verified supplier']);

export interface OndcSourcingClientOverlay {
  otpSupplierId?: unknown;
  participantId?: unknown;
  providerSupplierId?: unknown;
  ondcDomain?: unknown;
  ondcCategory?: unknown;
  buyerPin?: unknown;
  taxonomy?: unknown;
  title?: unknown;
  lifecycleCapability?: unknown;
  dropdownCity?: string | null;
  dropdownState?: string | null;
  dropdownTown?: string | null;
}

export interface OndcSourcingRequest {
  buyerRequestedPin?: string | null;
  subcategoryCode?: string | null;
  otpCategory?: string | null;
  requirementMode?: string | null;
  requestedLocality?: string | null;
  correlationId?: string | null;
  observedAt?: string | null;
  client?: OndcSourcingClientOverlay | null;
}

export interface OndcSourcingParticipant {
  provider?: string | null;
  providerSupplierId?: string | null;
  providerParticipantId?: string | null;
  endpoint?: unknown;
  sellerPin?: string | null;
  sellerLocality?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  phone?: string | null;
  email?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  otpSupplierId?: string | null;
  canReceiveRfq?: boolean | null;
  supplierExists?: boolean | null;
  unavailable?: boolean | null;
}

export interface OndcSourcingAddressabilityInput {
  participants: readonly OndcSourcingParticipant[];
  request: OndcSourcingRequest;
  environment: OndcEnvironmentConfigInput;
  /** Legacy switch. It does not enable production or a real network client. */
  ondcEnabled?: string | null;
}

export interface OndcSourcingProcurementCounters {
  invitations: 0;
  quotes: 0;
  awards: 0;
  purchaseOrders: 0;
  payments: 0;
  cashback: 0;
}

export interface OndcSourcingAddressabilityDecision {
  provider: string;
  providerSupplierId: string | null;
  category: string | null;
  domain: 'ONDC:RET12' | 'ONDC:RET14' | null;
  supportStatus: OndcDiscoverySupportStatusName | null;
  lifecycleCapability: typeof OndcLifecycleCapability.DISCOVERY_ONLY | null;
  requirementMode: string | null;
  buyerRequestedPin: string | null;
  sellerGeography: OndcGeographyClassification | null;
  addressability: OndcNetworkReachabilityStateName | null;
  networkAddressable: boolean;
  admissible: boolean;
  reason: string;
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName | null;
  credentialSlot: 'NONE' | 'PRE_PROD';
  timestamp: string | null;
  correlationId: string | null;
  stage: 'DISCOVERED';
  otpRegistered: false;
  otpVerified: false;
  gstVerified: false;
  quotation: false;
  canReceiveRfq: false;
  invitationCreated: false;
  quoteCreated: false;
  awardCreated: false;
  purchaseOrderCreated: false;
  paymentCreated: false;
  cashbackCreated: false;
  networkCallAttempted: false;
  verifiedSupplierLabel: null;
}

export interface OndcSourcingAdmissionBuyerView {
  provider: string;
  category: string | null;
  domain: 'ONDC:RET12' | 'ONDC:RET14' | null;
  geographyMatch: OndcGeographyMatchName | null;
  networkAddressable: boolean;
  admissible: boolean;
  reason: string;
  environment: OndcRuntimeEnvironmentName;
  stage: 'DISCOVERED';
  otpVerified: false;
  gstVerified: false;
}

export interface OndcSourcingAddressabilityBatch {
  decisions: readonly OndcSourcingAddressabilityDecision[];
  eligible: readonly OndcSourcingAddressabilityDecision[];
  procurement: OndcSourcingProcurementCounters;
  networkCallAttempted: false;
}

export interface ProviderSourcingAdmissionInput extends OndcSourcingAddressabilityInput {
  provider: string;
}

const PROVIDER_SOURCING_ADMISSION: Partial<
  Record<string, (input: OndcSourcingAddressabilityInput) => OndcSourcingAddressabilityBatch>
> = {
  [SupplierNetworkProviderKind.ONDC]: evaluateOndcSourcingAddressabilitySet,
};

export function ondcSourcingProcurementCounters(): OndcSourcingProcurementCounters {
  return {
    invitations: 0,
    quotes: 0,
    awards: 0,
    purchaseOrders: 0,
    payments: 0,
    cashback: 0,
  };
}

export function evaluateProviderSourcingAdmission(
  input: ProviderSourcingAdmissionInput,
): OndcSourcingAddressabilityBatch {
  const evaluate = PROVIDER_SOURCING_ADMISSION[input.provider];
  if (!evaluate) return unsupportedProviderBatch(input);
  return evaluate(input);
}

export function evaluateOndcSourcingAddressability(
  participant: OndcSourcingParticipant,
  request: OndcSourcingRequest,
  environment: OndcEnvironmentConfigInput,
  ondcEnabled?: string | null,
): OndcSourcingAddressabilityDecision {
  const batch = evaluateOndcSourcingAddressabilitySet({
    participants: [participant],
    request,
    environment,
    ondcEnabled,
  });
  const decision = batch.decisions[0];
  if (!decision) {
    return decisionShell({
      provider: SupplierNetworkProviderKind.ONDC,
      providerSupplierId: null,
      reason: OndcSourcingAdmissionReason.MISSING_PROVIDER_IDENTITY,
      environment: OndcRuntimeEnvironment.LOCAL,
      observationSource: OndcObservationSource.MOCK,
      credentialSlot: 'NONE',
      timestamp: null,
      correlationId: null,
      category: null,
      domain: null,
      supportStatus: null,
      lifecycleCapability: null,
      requirementMode: null,
      buyerRequestedPin: null,
      sellerGeography: null,
      addressability: null,
      networkAddressable: false,
    });
  }
  return decision;
}

export function evaluateOndcSourcingAddressabilitySet(
  input: OndcSourcingAddressabilityInput,
): OndcSourcingAddressabilityBatch {
  const environment = assessEnvironment(input.environment, input.ondcEnabled);
  const request = assessRequest(input.request);
  const participants = input.participants.length > 0 ? input.participants : [undefined];
  const decisions = participants.map((participant) =>
    decideParticipant(participant, request, environment),
  );
  return {
    decisions,
    eligible: eligibleDecisions(decisions),
    procurement: ondcSourcingProcurementCounters(),
    networkCallAttempted: false,
  };
}

export function toOndcSourcingAdmissionBuyerView(
  decision: OndcSourcingAddressabilityDecision,
): OndcSourcingAdmissionBuyerView {
  return {
    provider: decision.provider,
    category: decision.category,
    domain: decision.domain,
    geographyMatch: decision.sellerGeography?.match ?? null,
    networkAddressable: decision.networkAddressable,
    admissible: decision.admissible,
    reason: decision.reason,
    environment: decision.environment,
    stage: 'DISCOVERED',
    otpVerified: false,
    gstVerified: false,
  };
}

interface EnvironmentAssessment {
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName | null;
  credentialSlot: 'NONE' | 'PRE_PROD';
  refusal: string | null;
}

interface RequestAssessment {
  submittedBuyerPin: string | null;
  buyerPinInvalid: boolean;
  subcategoryCode: string | null;
  otpCategory: string | null;
  requirementMode: string | null;
  requestedLocality: string | null;
  correlationId: string | null;
  timestamp: string | null;
  client: OndcSourcingClientOverlay | null;
  mapping: ReturnType<typeof mapOndcDiscoveryCategory>;
}

function assessEnvironment(
  config: OndcEnvironmentConfigInput,
  ondcEnabled?: string | null,
): EnvironmentAssessment {
  void ondcEnabled;
  const parsed = parseOndcRuntimeEnvironment(config.environmentRaw);
  if (!parsed.recognized) {
    return {
      environment: parsed.environment,
      observationSource: null,
      credentialSlot: 'NONE',
      refusal: OndcSourcingAdmissionReason.ENVIRONMENT_DISABLED,
    };
  }
  if (parsed.environment === OndcRuntimeEnvironment.PRODUCTION) {
    return {
      environment: OndcRuntimeEnvironment.PRODUCTION,
      observationSource: null,
      credentialSlot: 'NONE',
      refusal: OndcSourcingAdmissionReason.PRODUCTION_DISABLED,
    };
  }
  if (
    parsed.environment === OndcRuntimeEnvironment.LOCAL ||
    parsed.environment === OndcRuntimeEnvironment.CI
  ) {
    return {
      environment: parsed.environment,
      observationSource: OndcObservationSource.MOCK,
      credentialSlot: 'NONE',
      refusal: null,
    };
  }

  const gate = resolveOndcEnvironmentGate(config);
  if (config.providerEnabled?.trim() === 'false' || config.networkEnabled?.trim() === 'false') {
    return {
      environment: OndcRuntimeEnvironment.PRE_PROD,
      observationSource: null,
      credentialSlot: 'NONE',
      refusal: OndcSourcingAdmissionReason.ENVIRONMENT_DISABLED,
    };
  }
  if (
    gate.realClientAllowed !== true ||
    gate.credentialSlot !== 'PRE_PROD' ||
    gate.observationSource !== OndcObservationSource.REAL_NETWORK
  ) {
    return {
      environment: OndcRuntimeEnvironment.PRE_PROD,
      observationSource: null,
      credentialSlot: 'NONE',
      refusal: OndcSourcingAdmissionReason.CREDENTIAL_GATED,
    };
  }
  return {
    environment: OndcRuntimeEnvironment.PRE_PROD,
    observationSource: OndcObservationSource.REAL_NETWORK,
    credentialSlot: 'PRE_PROD',
    refusal: null,
  };
}

function assessRequest(request: OndcSourcingRequest): RequestAssessment {
  const client = request.client ?? null;
  void client?.buyerPin;
  void client?.lifecycleCapability;
  void client?.ondcCategory;
  const subcategoryCode = clean(request.subcategoryCode);
  const mapping = mapOndcDiscoveryCategory({
    otpCategory: request.otpCategory,
    subcategoryCode,
    requirementMode: request.requirementMode,
    ondcDomain: typeof client?.ondcDomain === 'string' ? client.ondcDomain : null,
    title: typeof client?.title === 'string' ? client.title : null,
    taxonomy: client?.taxonomy,
  });
  const pinGate = classifyOndcBuyerSellerGeography({
    buyerRequestedPin: request.buyerRequestedPin,
  });
  return {
    submittedBuyerPin: clean(request.buyerRequestedPin),
    buyerPinInvalid: !pinGate.ok,
    subcategoryCode,
    otpCategory: clean(request.otpCategory),
    requirementMode: clean(request.requirementMode),
    requestedLocality: clean(request.requestedLocality),
    correlationId: clean(request.correlationId),
    timestamp: validTimestamp(request.observedAt),
    client,
    mapping,
  };
}

function decideParticipant(
  participant: OndcSourcingParticipant | undefined,
  request: RequestAssessment,
  environment: EnvironmentAssessment,
): OndcSourcingAddressabilityDecision {
  const sellerGeography = classifyOndcBuyerSellerGeography({
    buyerRequestedPin: request.submittedBuyerPin,
    sellerPin: participant?.sellerPin,
    sellerLocality: participant?.sellerLocality,
    sellerCity: participant?.sellerCity,
    sellerState: participant?.sellerState,
    requestedLocality: request.requestedLocality,
    dropdownCity: request.client?.dropdownCity,
    dropdownState: request.client?.dropdownState,
    dropdownTown: request.client?.dropdownTown,
  });
  const geography = sellerGeography.geography;
  const reachability = classifyOndcNetworkReachability({
    endpoint: participant?.endpoint,
    unavailable: participant?.unavailable,
    environment: environment.environment,
    source: environment.observationSource,
    phone: participant?.phone,
    canReceiveRfq: participant?.canReceiveRfq,
    provider: participant?.provider,
    supplierExists: participant?.supplierExists,
  });
  const identity = identifyParticipant(participant, request.client);
  const ondcParticipant = identity.reason !== OndcSourcingAdmissionReason.UNSUPPORTED_PROVIDER;
  const categoryReason = ondcParticipant ? categoryRefusal(request) : null;
  const geographyReason = ondcParticipant ? geographyRefusal(sellerGeography) : null;
  const reason =
    environment.refusal ??
    envelopeRefusal(request) ??
    (request.buyerPinInvalid ? OndcSourcingAdmissionReason.INVALID_BUYER_PIN : null) ??
    identity.reason ??
    categoryReason ??
    (ondcParticipant ? endpointRefusal(reachability.state) : null) ??
    geographyReason ??
    OndcSourcingAdmissionReason.ADMISSIBLE;

  return decisionShell({
    provider: identity.provider,
    providerSupplierId: identity.providerSupplierId,
    reason,
    environment: environment.environment,
    observationSource: environment.observationSource,
    credentialSlot: environment.credentialSlot,
    timestamp: request.timestamp,
    correlationId: request.correlationId,
    category: ondcParticipant ? request.mapping.otpCategory : null,
    domain: ondcParticipant ? request.mapping.ondcDomain : null,
    supportStatus: ondcParticipant ? request.mapping.supportStatus : null,
    lifecycleCapability: ondcParticipant ? request.mapping.lifecycleCapability : null,
    requirementMode: request.requirementMode,
    buyerRequestedPin: ondcParticipant ? geography.buyerRequestedPin : null,
    sellerGeography: ondcParticipant ? geography : null,
    addressability: ondcParticipant ? reachability.state : null,
    networkAddressable: ondcParticipant ? reachability.networkAddressable : false,
  });
}

function identifyParticipant(
  participant: OndcSourcingParticipant | undefined,
  client: OndcSourcingClientOverlay | null,
): { provider: string; providerSupplierId: string | null; reason: string | null } {
  if (!participant) {
    return {
      provider: SupplierNetworkProviderKind.ONDC,
      providerSupplierId: null,
      reason: OndcSourcingAdmissionReason.MISSING_PROVIDER_IDENTITY,
    };
  }
  const provider = clean(participant.provider) ?? '';
  if (provider !== SupplierNetworkProviderKind.ONDC) {
    return {
      provider: provider || 'UNKNOWN',
      providerSupplierId: null,
      reason: OndcSourcingAdmissionReason.UNSUPPORTED_PROVIDER,
    };
  }
  if (present(client?.otpSupplierId) || present(client?.participantId) || present(client?.providerSupplierId)) {
    return {
      provider,
      providerSupplierId: clean(participant.providerSupplierId),
      reason: OndcSourcingAdmissionReason.IDENTITY_CONFLICT,
    };
  }
  if (clean(participant.otpSupplierId)) {
    return {
      provider,
      providerSupplierId: clean(participant.providerSupplierId),
      reason: OndcSourcingAdmissionReason.IDENTITY_CONFLICT,
    };
  }
  const providerSupplierId = clean(participant.providerSupplierId);
  if (!providerSupplierId) {
    return { provider, providerSupplierId: null, reason: OndcSourcingAdmissionReason.MISSING_PROVIDER_IDENTITY };
  }
  const displayName = clean(participant.displayName);
  const phone = clean(participant.phone);
  const email = clean(participant.email);
  const address = clean(participant.formattedAddress);
  if (
    equalsLoose(providerSupplierId, displayName) ||
    equalsLoose(providerSupplierId, phone) ||
    equalsLoose(providerSupplierId, email) ||
    equalsLoose(providerSupplierId, address)
  ) {
    return { provider, providerSupplierId, reason: OndcSourcingAdmissionReason.IDENTITY_CONFLICT };
  }
  const decoded = decodeOndcProviderSupplierId(providerSupplierId);
  if (!decoded) {
    return { provider, providerSupplierId, reason: OndcSourcingAdmissionReason.INVALID_CANDIDATE };
  }
  const claimedParticipant = clean(participant.providerParticipantId);
  if (claimedParticipant && claimedParticipant !== decoded.participantId) {
    return { provider, providerSupplierId, reason: OndcSourcingAdmissionReason.IDENTITY_CONFLICT };
  }
  if (
    displayName &&
    (equalsLoose(displayName, decoded.participantId) || equalsLoose(displayName, decoded.sellerId))
  ) {
    return { provider, providerSupplierId, reason: OndcSourcingAdmissionReason.BUSINESS_NAME_IDENTITY };
  }
  if (displayName && FABRICATED_DISPLAY_NAMES.has(displayName.toLowerCase())) {
    return { provider, providerSupplierId, reason: OndcSourcingAdmissionReason.FABRICATED_DISPLAY_NAME };
  }
  return { provider, providerSupplierId, reason: null };
}

function categoryRefusal(request: RequestAssessment): string | null {
  if (!request.subcategoryCode) return OndcSourcingAdmissionReason.MISSING_DOMAIN;
  const lifecycle: string = request.mapping.lifecycleCapability;
  if (lifecycle !== OndcLifecycleCapability.DISCOVERY_ONLY) {
    return OndcSourcingAdmissionReason.UNSUPPORTED_LIFECYCLE;
  }
  if (request.mapping.supportStatus !== OndcDiscoverySupportStatus.SUPPORTED || request.mapping.ondcDomain == null) {
    return OndcSourcingAdmissionReason.UNSUPPORTED_CATEGORY;
  }
  return null;
}

function endpointRefusal(state: OndcNetworkReachabilityStateName): string | null {
  if (state === OndcNetworkReachabilityState.NETWORK_ADDRESSABLE) return null;
  if (state === OndcNetworkReachabilityState.ENDPOINT_MISSING) return OndcSourcingAdmissionReason.ENDPOINT_MISSING;
  if (state === OndcNetworkReachabilityState.ENDPOINT_INVALID) return OndcSourcingAdmissionReason.ENDPOINT_INVALID;
  if (state === OndcNetworkReachabilityState.NETWORK_UNREACHABLE) {
    return OndcSourcingAdmissionReason.NETWORK_UNREACHABLE;
  }
  return OndcSourcingAdmissionReason.INVALID_CANDIDATE;
}

/**
 * Buyer PIN validity is the only geography admission gate.
 * EXACT_PIN, OUT_OF_AREA, SAME_LOCALITY, PROVIDER_AREA, and UNKNOWN stay on sellerGeography.
 */
function geographyRefusal(result: ReturnType<typeof classifyOndcBuyerSellerGeography>): string | null {
  if (!result.ok || result.geography.buyerPinStatus === 'REJECTED') {
    return OndcSourcingAdmissionReason.INVALID_BUYER_PIN;
  }
  if (result.geography.buyerPinStatus === 'MISSING') {
    return OndcSourcingAdmissionReason.GEOGRAPHY_NOT_APPLICABLE;
  }
  return null;
}

function envelopeRefusal(request: RequestAssessment): string | null {
  if (!request.correlationId || !request.timestamp) return OndcSourcingAdmissionReason.INVALID_CANDIDATE;
  return null;
}

function eligibleDecisions(
  decisions: readonly OndcSourcingAddressabilityDecision[],
): OndcSourcingAddressabilityDecision[] {
  const seen = new Set<string>();
  const eligible: OndcSourcingAddressabilityDecision[] = [];
  for (const decision of decisions) {
    if (!decision.admissible || !decision.providerSupplierId) continue;
    const key = providerIdentityKey(decision.provider, decision.providerSupplierId);
    if (seen.has(key)) continue;
    seen.add(key);
    eligible.push(decision);
  }
  return eligible;
}

function unsupportedProviderBatch(input: ProviderSourcingAdmissionInput): OndcSourcingAddressabilityBatch {
  const environment = assessEnvironment(input.environment, input.ondcEnabled);
  const rows = input.participants.length > 0 ? input.participants : [undefined];
  const decisions = rows.map((participant) =>
    decisionShell({
      provider: clean(participant?.provider) ?? input.provider,
      providerSupplierId: null,
      reason: environment.refusal ?? OndcSourcingAdmissionReason.UNSUPPORTED_PROVIDER,
      environment: environment.environment,
      observationSource: environment.environment === OndcRuntimeEnvironment.PRODUCTION
        ? null
        : environment.observationSource,
      credentialSlot: 'NONE',
      timestamp: validTimestamp(input.request.observedAt),
      correlationId: clean(input.request.correlationId),
      category: null,
      domain: null,
      supportStatus: null,
      lifecycleCapability: null,
      requirementMode: clean(input.request.requirementMode),
      buyerRequestedPin: null,
      sellerGeography: null,
      addressability: null,
      networkAddressable: false,
    }),
  );
  return {
    decisions,
    eligible: [],
    procurement: ondcSourcingProcurementCounters(),
    networkCallAttempted: false,
  };
}

function decisionShell(input: {
  provider: string;
  providerSupplierId: string | null;
  reason: string;
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName | null;
  credentialSlot: 'NONE' | 'PRE_PROD';
  timestamp: string | null;
  correlationId: string | null;
  category: string | null;
  domain: 'ONDC:RET12' | 'ONDC:RET14' | null;
  supportStatus: OndcDiscoverySupportStatusName | null;
  lifecycleCapability: typeof OndcLifecycleCapability.DISCOVERY_ONLY | null;
  requirementMode: string | null;
  buyerRequestedPin: string | null;
  sellerGeography: OndcGeographyClassification | null;
  addressability: OndcNetworkReachabilityStateName | null;
  networkAddressable: boolean;
}): OndcSourcingAddressabilityDecision {
  const admissible = input.reason === OndcSourcingAdmissionReason.ADMISSIBLE;
  return {
    provider: input.provider,
    providerSupplierId: input.providerSupplierId,
    category: input.category,
    domain: input.domain,
    supportStatus: input.supportStatus,
    lifecycleCapability: input.lifecycleCapability,
    requirementMode: input.requirementMode,
    buyerRequestedPin: input.buyerRequestedPin,
    sellerGeography: input.sellerGeography,
    addressability: input.addressability,
    networkAddressable: input.networkAddressable,
    admissible,
    reason: input.reason,
    environment: input.environment,
    observationSource: input.observationSource,
    credentialSlot: input.credentialSlot,
    timestamp: input.timestamp,
    correlationId: input.correlationId,
    stage: 'DISCOVERED',
    otpRegistered: false,
    otpVerified: false,
    gstVerified: false,
    quotation: false,
    canReceiveRfq: false,
    invitationCreated: false,
    quoteCreated: false,
    awardCreated: false,
    purchaseOrderCreated: false,
    paymentCreated: false,
    cashbackCreated: false,
    networkCallAttempted: false,
    verifiedSupplierLabel: null,
  };
}

function validTimestamp(value?: string | null): string | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return trimmed;
}

function present(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function equalsLoose(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function clean(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * ONDC-06 discovery dispatch decisions.
 * /search and /on_search only. Discovery is not invitation, quote, award, or payment.
 * NETWORK_ADDRESSABLE stays syntactic. A gateway acknowledgement is not a verified callback.
 * This module does not read credentials, does not sign, and does not call the network.
 */
import { mapOndcDiscoveryCategory } from './ondc-category-mapping';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  type OndcEnvironmentDecision,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from './ondc-environment';
import { acceptBuyerRequestedPin } from './ondc-geography';
import { classifyOndcNetworkReachability } from './ondc-provider-foundation';

export const ONDC_DISPATCH_PROTOCOL_ACTIONS = ['search', 'on_search'] as const;

export const ONDC_SEARCH_CORE_VERSION = '1.2.0';
export const ONDC_SEARCH_TTL = 'PT30S';

const PRODUCTION_ONDC_HOSTS = new Set(['prod.gateway.ondc.org', 'prod.registry.ondc.org']);
const STD_CITY = /^std:\d+$/;

const CLIENT_OVERRIDE_KEYS = [
  'providerSupplierId',
  'provider_supplier_id',
  'participantId',
  'participant_id',
  'ondcDomain',
  'ondcCategory',
  'category',
  'endpoint',
  'bppUri',
  'bpp_uri',
  'environment',
  'gatewayUrl',
  'callbackUrl',
  'callback_url',
  'city',
  'cityCode',
  'city_code',
  'hostedCallbackAttested',
  'signingPrivateKey',
] as const;

export const OndcDispatchFailureClass = {
  DNS_NETWORK: 'DNS_NETWORK',
  TIMEOUT: 'TIMEOUT',
  HTTP: 'HTTP',
  PROTOCOL_REJECTION: 'PROTOCOL_REJECTION',
  AUTH_FAILURE: 'AUTH_FAILURE',
  SCHEMA: 'SCHEMA',
  CALLBACK_TIMEOUT: 'CALLBACK_TIMEOUT',
  CALLBACK_VERIFICATION_FAILURE: 'CALLBACK_VERIFICATION_FAILURE',
  DUPLICATE: 'DUPLICATE',
  UNSUPPORTED_DOMAIN: 'UNSUPPORTED_DOMAIN',
  CREDENTIAL_MISSING: 'CREDENTIAL_MISSING',
  PRODUCTION_REFUSED: 'PRODUCTION_REFUSED',
  ENVIRONMENT_SEPARATION: 'ENVIRONMENT_SEPARATION',
  CLIENT_OVERRIDE: 'CLIENT_OVERRIDE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  NOT_ADDRESSABLE: 'NOT_ADDRESSABLE',
  PERSISTENCE: 'PERSISTENCE',
} as const;

export type OndcDispatchFailureClass =
  (typeof OndcDispatchFailureClass)[keyof typeof OndcDispatchFailureClass];

export const OndcDispatchStatus = {
  REFUSED: 'REFUSED',
  MOCK_ACK: 'MOCK_ACK',
  PENDING_CALLBACK: 'PENDING_CALLBACK',
  CALLBACK_VERIFIED: 'CALLBACK_VERIFIED',
  FAILED: 'FAILED',
  CALLBACK_TIMED_OUT: 'CALLBACK_TIMED_OUT',
} as const;

export type OndcDispatchStatus = (typeof OndcDispatchStatus)[keyof typeof OndcDispatchStatus];

export type OndcDispatchPersistence = 'NOT_STORED' | 'STORED_MOCK' | 'STORED_REAL' | 'REJECTED';

export interface OndcDiscoveryDispatchRequest {
  otpTransactionId: string;
  subcategoryCode?: string | null;
  requirementMode?: string | null;
  buyerRequestedPin?: string | null;
  cityCode?: string | null;
  itemName?: string | null;
  initiatorId?: string | null;
  client?: Record<string, unknown> | null;
}

export interface OndcCanonicalSearchPayload {
  context: {
    domain: 'ONDC:RET12' | 'ONDC:RET14';
    country: 'IND';
    city: string;
    action: 'search';
    core_version: typeof ONDC_SEARCH_CORE_VERSION;
    bap_id: string;
    bap_uri: string;
    transaction_id: string;
    message_id: string;
    timestamp: string;
    ttl: typeof ONDC_SEARCH_TTL;
  };
  message: {
    intent: {
      item?: { descriptor: { name: string } };
      category?: { descriptor: { name: string } };
      fulfillment: {
        end: { location: { address: { area_code: string } } };
      };
    };
  };
}

export interface OndcDispatchAdmission {
  admitted: boolean;
  realDispatch: boolean;
  observationSource: OndcObservationSourceName | null;
  failure: OndcDispatchFailureClass | null;
  reason: string | null;
  userMessage: string;
  domain: 'ONDC:RET12' | 'ONDC:RET14' | null;
  buyerRequestedPin: string | null;
  city: string | null;
  gatewayAddressable: boolean;
  callbackAddressable: boolean;
}

export interface OndcDispatchRecord {
  correlationId: string;
  idempotencyKey: string;
  otpTransactionId: string;
  transactionId: string;
  messageId: string;
  operation: 'search';
  provider: 'ONDC';
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName;
  buyerRequestedPin: string;
  domain: 'ONDC:RET12' | 'ONDC:RET14';
  city: string;
  categoryLabel: string | null;
  subcategoryCode: string | null;
  requirementMode: string | null;
  initiatedAt: string;
  initiatorId: string;
  expectedBapId: string;
  status: OndcDispatchStatus;
  transactionIssued: boolean;
  gatewayAcknowledged: boolean;
  realNetworkVerified: boolean;
  failure: OndcDispatchFailureClass | null;
  reason: string | null;
  callbackDigest: string | null;
  canonicalObservedAt: string | null;
  boundParticipantId: string | null;
  persistence: OndcDispatchPersistence;
}

export interface OndcDispatchLedger {
  byIdempotencyKey: Map<string, OndcDispatchRecord>;
  byTransactionId: Map<string, OndcDispatchRecord>;
  byCorrelationId: Map<string, OndcDispatchRecord>;
  seenReplayKeys: Set<string>;
  /** transaction + message + callback subscriber → accepted body digest */
  digestByCallback: Map<string, string>;
  observedAtByCallback: Map<string, string>;
}

export interface OndcDispatchAudit {
  initiatorId: string;
  otpTransactionId: string;
  operation: 'search' | 'on_search';
  transactionId: string;
  messageId: string;
  provider: 'ONDC';
  environment: OndcRuntimeEnvironmentName;
  timestamp: string;
  result: OndcDispatchStatus;
  failureReason: string | null;
}

export type OndcCallbackCorrelationDecision =
  | {
      ok: true;
      replay: boolean;
      stale: boolean;
      apply: boolean;
      transactionId: string;
      messageId: string;
      replayKey: string;
      participantId: string | null;
      observedAt: string;
    }
  | { ok: false; failure: OndcDispatchFailureClass; reason: string };

export function isProductionOndcHost(value: string): boolean {
  try {
    return PRODUCTION_ONDC_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Syntactic gate for a live exercise callback. This does not prove the route is deployed.
 * Fixture, loopback, and private hosts are refused. The path must be the OTP on_search receiver.
 */
export function isLiveOndcCallbackUrl(value?: string | null): boolean {
  if (!value?.trim()) return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (isProductionOndcHost(url.toString())) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isNonPublicCallbackHost(host)) return false;
  const path = url.pathname.replace(/\/+$/, '');
  return path.endsWith('/ondc-on-search');
}

export function toOndcDispatchUserMessage(failure: OndcDispatchFailureClass | null): string {
  if (failure === OndcDispatchFailureClass.UNSUPPORTED_DOMAIN) {
    return 'This category is not available on ONDC.';
  }
  return 'ONDC discovery could not be completed.';
}

export function toOndcDispatchBuyerView(record: OndcDispatchRecord): {
  provider: 'ONDC';
  domain: 'ONDC:RET12' | 'ONDC:RET14';
  stage: 'PENDING' | 'DISCOVERED';
  status: string;
  verifiedSupplier: null;
} {
  const discovered = record.status === OndcDispatchStatus.CALLBACK_VERIFIED;
  return {
    provider: 'ONDC',
    domain: record.domain,
    stage: discovered ? 'DISCOVERED' : 'PENDING',
    status: discovered ? 'Discovered' : 'Pending',
    verifiedSupplier: null,
  };
}

export function toOndcDispatchAudit(record: OndcDispatchRecord, operation: 'search' | 'on_search' = 'search'): OndcDispatchAudit {
  return {
    initiatorId: record.initiatorId,
    otpTransactionId: record.otpTransactionId,
    operation,
    transactionId: record.transactionId,
    messageId: record.messageId,
    provider: 'ONDC',
    environment: record.environment,
    timestamp: record.initiatedAt,
    result: record.status,
    failureReason: record.reason,
  };
}

export function createOndcDispatchLedger(): OndcDispatchLedger {
  return {
    byIdempotencyKey: new Map(),
    byTransactionId: new Map(),
    byCorrelationId: new Map(),
    seenReplayKeys: new Set(),
    digestByCallback: new Map(),
    observedAtByCallback: new Map(),
  };
}

export function ondcCallbackStateKey(transactionId: string, messageId: string, callbackIdentity: string): string {
  return `${transactionId}\u001f${messageId}\u001f${callbackIdentity}`;
}

export function ondcDispatchIdempotencyKey(input: {
  otpTransactionId: string;
  buyerRequestedPin: string;
  domain: string;
}): string {
  return `${input.otpTransactionId}\u001fsearch\u001f${input.buyerRequestedPin}\u001f${input.domain}`;
}

export function ondcCallbackReplayKey(input: {
  transactionId: string;
  messageId: string;
  timestamp: string;
  operation: 'on_search';
  callbackIdentity: string;
}): string {
  return [
    input.transactionId,
    input.messageId,
    input.timestamp,
    input.operation,
    input.callbackIdentity,
  ].join('\u001f');
}

export function admitOndcDiscoveryDispatch(input: {
  request: OndcDiscoveryDispatchRequest;
  decision: Omit<OndcEnvironmentDecision, 'client'>;
  gatewayUrl?: string | null;
  callbackUrl?: string | null;
}): OndcDispatchAdmission {
  const denied = (
    failure: OndcDispatchFailureClass,
    reason: string,
    extra?: Partial<OndcDispatchAdmission>,
  ): OndcDispatchAdmission => ({
    admitted: false,
    realDispatch: false,
    observationSource: null,
    failure,
    reason,
    userMessage: toOndcDispatchUserMessage(failure),
    domain: extra?.domain ?? null,
    buyerRequestedPin: extra?.buyerRequestedPin ?? null,
    city: extra?.city ?? null,
    gatewayAddressable: extra?.gatewayAddressable ?? false,
    callbackAddressable: extra?.callbackAddressable ?? false,
  });

  if (isAnonymousInitiator(input.request.initiatorId)) {
    return denied(OndcDispatchFailureClass.UNAUTHENTICATED, 'anonymous_initiator');
  }
  const override = clientOverrideKey(input.request.client);
  if (override) return denied(OndcDispatchFailureClass.CLIENT_OVERRIDE, `client_supplied_${override}`);

  if (
    input.decision.environment === OndcRuntimeEnvironment.PRODUCTION ||
    input.decision.credentialSlot === 'PRODUCTION' ||
    input.decision.productionActivationSatisfied
  ) {
    return denied(OndcDispatchFailureClass.PRODUCTION_REFUSED, 'production_dispatch_refused');
  }
  if (input.gatewayUrl && isProductionOndcHost(input.gatewayUrl)) {
    return denied(OndcDispatchFailureClass.PRODUCTION_REFUSED, 'production_gateway_refused');
  }
  if (input.callbackUrl && isProductionOndcHost(input.callbackUrl)) {
    return denied(OndcDispatchFailureClass.PRODUCTION_REFUSED, 'production_callback_refused');
  }

  const mapping = mapOndcDiscoveryCategory({
    otpCategory: null,
    subcategoryCode: input.request.subcategoryCode,
    requirementMode: input.request.requirementMode,
    ondcDomain: readClientString(input.request.client, 'ondcDomain'),
    ondcCategory: readClientString(input.request.client, 'ondcCategory'),
    title: input.request.itemName,
    taxonomy: input.request.client,
  });
  if (mapping.supportStatus !== 'SUPPORTED' || (mapping.ondcDomain !== 'ONDC:RET12' && mapping.ondcDomain !== 'ONDC:RET14')) {
    return denied(OndcDispatchFailureClass.UNSUPPORTED_DOMAIN, 'not_supported');
  }
  if (mapping.lifecycleCapability !== 'DISCOVERY_ONLY') {
    return denied(OndcDispatchFailureClass.UNSUPPORTED_DOMAIN, 'lifecycle_not_discovery');
  }

  const pin = acceptBuyerRequestedPin(input.request.buyerRequestedPin);
  if (!pin.ok) return denied(OndcDispatchFailureClass.SCHEMA, 'invalid_buyer_pin', { domain: mapping.ondcDomain });
  if (!pin.buyerRequestedPin) {
    return denied(OndcDispatchFailureClass.SCHEMA, 'missing_buyer_pin', { domain: mapping.ondcDomain });
  }

  const city = input.request.cityCode?.trim() ?? '';
  if (!city) {
    return denied(OndcDispatchFailureClass.SCHEMA, 'city_unresolved', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
    });
  }
  if (!STD_CITY.test(city)) {
    return denied(OndcDispatchFailureClass.SCHEMA, 'invalid_city', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
    });
  }

  if (!input.decision.recognizedEnvironment) {
    return denied(OndcDispatchFailureClass.CREDENTIAL_MISSING, 'invalid_environment', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
      city,
    });
  }

  const mockEnvironment =
    input.decision.environment === OndcRuntimeEnvironment.LOCAL ||
    input.decision.environment === OndcRuntimeEnvironment.CI;
  if (mockEnvironment) {
    return {
      admitted: true,
      realDispatch: false,
      observationSource: OndcObservationSource.MOCK,
      failure: null,
      reason: null,
      userMessage: 'ONDC discovery is running with mock evidence.',
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
      city,
      gatewayAddressable: false,
      callbackAddressable: false,
    };
  }

  if (input.decision.environment !== OndcRuntimeEnvironment.PRE_PROD || !input.decision.realClientAllowed) {
    return denied(OndcDispatchFailureClass.CREDENTIAL_MISSING, 'preprod_credentials_missing', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
      city,
    });
  }
  if (input.decision.credentialSlot !== 'PRE_PROD' || input.decision.observationSource !== OndcObservationSource.REAL_NETWORK) {
    return denied(OndcDispatchFailureClass.ENVIRONMENT_SEPARATION, 'preprod_slot_not_isolated', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
      city,
    });
  }

  const gateway = classifyOndcNetworkReachability({
    endpoint: input.gatewayUrl,
    environment: OndcRuntimeEnvironment.PRE_PROD,
    source: OndcObservationSource.REAL_NETWORK,
  });
  const callback = classifyOndcNetworkReachability({
    endpoint: input.callbackUrl,
    environment: OndcRuntimeEnvironment.PRE_PROD,
    source: OndcObservationSource.REAL_NETWORK,
  });
  const gatewayHttps = isHttps(input.gatewayUrl);
  const callbackHttps = isHttps(input.callbackUrl);
  if (!gateway.networkAddressable || !gatewayHttps || !callback.networkAddressable || !callbackHttps) {
    return denied(OndcDispatchFailureClass.NOT_ADDRESSABLE, 'gateway_or_callback_not_addressable', {
      domain: mapping.ondcDomain,
      buyerRequestedPin: pin.buyerRequestedPin,
      city,
      gatewayAddressable: gateway.networkAddressable && gatewayHttps,
      callbackAddressable: callback.networkAddressable && callbackHttps,
    });
  }

  return {
    admitted: true,
    realDispatch: true,
    observationSource: OndcObservationSource.REAL_NETWORK,
    failure: null,
    reason: null,
    userMessage: 'ONDC discovery was sent to pre-production.',
    domain: mapping.ondcDomain,
    buyerRequestedPin: pin.buyerRequestedPin,
    city,
    gatewayAddressable: true,
    callbackAddressable: true,
  };
}

export function buildOndcCanonicalSearch(input: {
  domain: 'ONDC:RET12' | 'ONDC:RET14';
  subscriberId: string;
  callbackUrl: string;
  transactionId: string;
  messageId: string;
  timestamp: string;
  city: string;
  buyerRequestedPin: string;
  itemName?: string | null;
  categoryLabel?: string | null;
}): OndcCanonicalSearchPayload {
  const intent: OndcCanonicalSearchPayload['message']['intent'] = {
    fulfillment: {
      end: { location: { address: { area_code: input.buyerRequestedPin } } },
    },
  };
  const itemName = clean(input.itemName);
  const categoryLabel = clean(input.categoryLabel);
  if (itemName) intent.item = { descriptor: { name: itemName } };
  if (categoryLabel) intent.category = { descriptor: { name: categoryLabel } };
  return {
    context: {
      domain: input.domain,
      country: 'IND',
      city: input.city,
      action: 'search',
      core_version: ONDC_SEARCH_CORE_VERSION,
      bap_id: input.subscriberId,
      bap_uri: input.callbackUrl,
      transaction_id: input.transactionId,
      message_id: input.messageId,
      timestamp: input.timestamp,
      ttl: ONDC_SEARCH_TTL,
    },
    message: { intent },
  };
}

export function validateOndcSearchPayload(payload: unknown): { ok: true } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload_not_object' };
  const context = (payload as { context?: unknown }).context;
  const message = (payload as { message?: unknown }).message;
  if (!context || typeof context !== 'object') return { ok: false, reason: 'missing_context' };
  if (!message || typeof message !== 'object') return { ok: false, reason: 'missing_message' };
  const row = context as Record<string, unknown>;
  if (row.action !== 'search') return { ok: false, reason: 'action_not_search' };
  if (row.domain !== 'ONDC:RET12' && row.domain !== 'ONDC:RET14') return { ok: false, reason: 'domain_not_allow_listed' };
  if (row.country !== 'IND') return { ok: false, reason: 'country_not_ind' };
  if (typeof row.city !== 'string' || !STD_CITY.test(row.city)) return { ok: false, reason: 'invalid_city' };
  if (row.core_version !== ONDC_SEARCH_CORE_VERSION) return { ok: false, reason: 'core_version_mismatch' };
  if (row.ttl !== ONDC_SEARCH_TTL) return { ok: false, reason: 'ttl_mismatch' };
  if (!token(row.bap_id) || !token(row.bap_uri) || !token(row.transaction_id) || !token(row.message_id)) {
    return { ok: false, reason: 'missing_identity' };
  }
  if (typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const intent = (message as { intent?: unknown }).intent;
  if (!intent || typeof intent !== 'object') return { ok: false, reason: 'missing_intent' };
  const area = (
    intent as {
      fulfillment?: { end?: { location?: { address?: { area_code?: unknown } } } };
    }
  ).fulfillment?.end?.location?.address?.area_code;
  const pin = acceptBuyerRequestedPin(typeof area === 'string' ? area : null);
  if (!pin.ok || !pin.buyerRequestedPin) return { ok: false, reason: 'missing_buyer_pin' };
  return { ok: true };
}

export function classifyOndcTransportFailure(input: {
  errorCode?: string | null;
  statusCode?: number | null;
}): { failure: OndcDispatchFailureClass; retryable: boolean; reason: string } {
  if (input.errorCode === 'PRODUCTION_REFUSED') {
    return { failure: OndcDispatchFailureClass.PRODUCTION_REFUSED, retryable: false, reason: 'production_dispatch_refused' };
  }
  if (input.errorCode === 'TIMEOUT') {
    return { failure: OndcDispatchFailureClass.TIMEOUT, retryable: true, reason: 'timeout' };
  }
  if (input.errorCode === 'NETWORK_ERROR') {
    return { failure: OndcDispatchFailureClass.DNS_NETWORK, retryable: true, reason: 'dns_or_network' };
  }
  if (input.errorCode === 'HTTP_STATUS') {
    const status = input.statusCode ?? 0;
    if (status === 401 || status === 403) {
      return { failure: OndcDispatchFailureClass.AUTH_FAILURE, retryable: false, reason: `http_${status}` };
    }
    if (status >= 500 && status <= 599) {
      return { failure: OndcDispatchFailureClass.HTTP, retryable: true, reason: `http_${status}` };
    }
    return { failure: OndcDispatchFailureClass.HTTP, retryable: false, reason: `http_${status || 'status'}` };
  }
  return { failure: OndcDispatchFailureClass.PROTOCOL_REJECTION, retryable: false, reason: 'protocol_rejection' };
}

export function rememberOndcDispatch(ledger: OndcDispatchLedger, record: OndcDispatchRecord): OndcDispatchRecord {
  ledger.byIdempotencyKey.set(record.idempotencyKey, record);
  ledger.byTransactionId.set(record.transactionId, record);
  ledger.byCorrelationId.set(record.correlationId, record);
  return record;
}

export function findIssuedOndcDispatch(ledger: OndcDispatchLedger, transactionId: string): OndcDispatchRecord | null {
  return ledger.byTransactionId.get(transactionId) ?? null;
}

export function noteOndcDispatchCallbackTimeout(ledger: OndcDispatchLedger, correlationId: string): OndcDispatchRecord | null {
  const record = ledger.byCorrelationId.get(correlationId) ?? null;
  if (!record || record.status !== OndcDispatchStatus.PENDING_CALLBACK) return record;
  record.status = OndcDispatchStatus.CALLBACK_TIMED_OUT;
  record.failure = OndcDispatchFailureClass.CALLBACK_TIMEOUT;
  record.reason = 'callback_timeout';
  record.realNetworkVerified = false;
  record.persistence = 'NOT_STORED';
  return record;
}

export function evaluateOndcDispatchCallback(input: {
  record: OndcDispatchRecord | null;
  payload: unknown;
  signerSubscriberId: string;
  bodyDigest: string;
  processingEnvironment: OndcRuntimeEnvironmentName;
  processingSource: OndcObservationSourceName;
  seenReplayKeys: readonly string[];
}): OndcCallbackCorrelationDecision {
  const rejected = (failure: OndcDispatchFailureClass, reason: string): OndcCallbackCorrelationDecision => ({
    ok: false,
    failure,
    reason,
  });
  if (!input.record || !input.record.transactionIssued) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'unknown_transaction');
  }
  if (
    input.processingEnvironment !== input.record.environment ||
    input.processingSource !== input.record.observationSource
  ) {
    return rejected(OndcDispatchFailureClass.ENVIRONMENT_SEPARATION, 'environment_mismatch');
  }
  if (input.processingSource === OndcObservationSource.MOCK && input.processingEnvironment !== OndcRuntimeEnvironment.LOCAL && input.processingEnvironment !== OndcRuntimeEnvironment.CI) {
    return rejected(OndcDispatchFailureClass.ENVIRONMENT_SEPARATION, 'mock_not_real');
  }
  if (input.processingSource === OndcObservationSource.REAL_NETWORK && input.record.observationSource !== OndcObservationSource.REAL_NETWORK) {
    return rejected(OndcDispatchFailureClass.ENVIRONMENT_SEPARATION, 'mock_not_real');
  }

  const parsed = parseOnSearch(input.payload);
  if (!parsed) return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'malformed_callback');
  if (parsed.action !== 'on_search') {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'wrong_operation');
  }
  if (parsed.transactionId !== input.record.transactionId) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'unknown_transaction');
  }
  if (parsed.messageId !== input.record.messageId) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'unknown_message');
  }
  if (parsed.domain && parsed.domain !== input.record.domain) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'wrong_context');
  }
  if (parsed.bapId && parsed.bapId !== input.record.expectedBapId) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'wrong_context');
  }
  if (!parsed.bppId || parsed.bppId !== input.signerSubscriberId) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'wrong_subscriber');
  }
  if (input.record.boundParticipantId && input.record.boundParticipantId !== parsed.bppId) {
    return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'wrong_provider');
  }
  if (!parsed.timestamp) return rejected(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'missing_callback_timestamp');

  const replayKey = ondcCallbackReplayKey({
    transactionId: parsed.transactionId,
    messageId: parsed.messageId,
    timestamp: parsed.timestamp,
    operation: 'on_search',
    callbackIdentity: input.signerSubscriberId,
  });
  if (input.record.callbackDigest && input.record.callbackDigest !== input.bodyDigest) {
    return rejected(OndcDispatchFailureClass.DUPLICATE, 'duplicate_message');
  }
  const replay = input.seenReplayKeys.includes(replayKey) || input.record.callbackDigest === input.bodyDigest;
  if (replay) {
    return {
      ok: true,
      replay: true,
      stale: false,
      apply: false,
      transactionId: parsed.transactionId,
      messageId: parsed.messageId,
      replayKey,
      participantId: parsed.bppId,
      observedAt: parsed.timestamp,
    };
  }
  const observedMs = Date.parse(parsed.timestamp);
  const canonicalMs = input.record.canonicalObservedAt ? Date.parse(input.record.canonicalObservedAt) : Number.NaN;
  const stale = Number.isFinite(canonicalMs) && Number.isFinite(observedMs) && observedMs < canonicalMs;
  return {
    ok: true,
    replay: false,
    stale,
    apply: !stale,
    transactionId: parsed.transactionId,
    messageId: parsed.messageId,
    replayKey,
    participantId: parsed.bppId,
    observedAt: parsed.timestamp,
  };
}

export function commitOndcDispatchCallback(
  ledger: OndcDispatchLedger,
  record: OndcDispatchRecord,
  decision: Extract<OndcCallbackCorrelationDecision, { ok: true }>,
  bodyDigest: string,
  persisted: OndcDispatchPersistence,
): OndcDispatchRecord {
  ledger.seenReplayKeys.add(decision.replayKey);
  if (decision.apply) {
    record.callbackDigest = bodyDigest;
    record.canonicalObservedAt = decision.observedAt;
    record.boundParticipantId = decision.participantId;
    record.status = OndcDispatchStatus.CALLBACK_VERIFIED;
    record.failure = null;
    record.reason = null;
    record.realNetworkVerified = record.observationSource === OndcObservationSource.REAL_NETWORK;
    record.persistence = persisted;
  } else if (decision.stale) {
    record.reason = 'stale_callback';
  }
  return record;
}

function parseOnSearch(payload: unknown): {
  action: string;
  transactionId: string;
  messageId: string;
  timestamp: string | null;
  domain: string | null;
  bapId: string | null;
  bppId: string | null;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const context = (payload as { context?: unknown }).context;
  const message = (payload as { message?: unknown }).message;
  if (!context || typeof context !== 'object' || !message || typeof message !== 'object') return null;
  const row = context as Record<string, unknown>;
  const action = typeof row.action === 'string' ? row.action : '';
  const transactionId = typeof row.transaction_id === 'string' ? row.transaction_id.trim() : '';
  const messageId = typeof row.message_id === 'string' ? row.message_id.trim() : '';
  if (!action || !transactionId || !messageId) return null;
  const timestamp = typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)) ? row.timestamp : null;
  return {
    action,
    transactionId,
    messageId,
    timestamp,
    domain: typeof row.domain === 'string' ? row.domain : null,
    bapId: typeof row.bap_id === 'string' ? row.bap_id : null,
    bppId: typeof row.bpp_id === 'string' ? row.bpp_id.trim() : null,
  };
}

function clientOverrideKey(client?: Record<string, unknown> | null): string | null {
  if (!client) return null;
  for (const key of CLIENT_OVERRIDE_KEYS) {
    if (client[key] !== undefined && client[key] !== null && client[key] !== '') return key;
  }
  return null;
}

function readClientString(client: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = client?.[key];
  return typeof value === 'string' ? value : null;
}

function isAnonymousInitiator(value?: string | null): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 || trimmed.toLowerCase() === 'anonymous';
}

function isNonPublicCallbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (host === 'otp.test' || host.endsWith('.otp.test')) return true;
  if (host === 'example.com' || host.endsWith('.example.com')) return true;
  if (host === 'example.net' || host.endsWith('.example.net')) return true;
  if (host === 'example.org' || host.endsWith('.example.org')) return true;
  if (host === 'example.test' || host.endsWith('.example.test')) return true;
  if (host.endsWith('.invalid')) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

function isHttps(value?: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function clean(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function token(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return trimmed;
}

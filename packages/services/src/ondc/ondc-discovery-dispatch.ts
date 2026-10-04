/**
 * ONDC-06 server dispatch. LOCAL and CI return a labelled MOCK acknowledgement and do not call the network.
 * PRE_PROD signs and posts /search only after admission. PRODUCTION never dispatches.
 * A gateway ACK stays pending until an authenticated /on_search. Select, init, confirm, and status are not called.
 */
import { randomUUID } from 'node:crypto';
import {
  OndcDispatchFailureClass,
  OndcDispatchStatus,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  admitOndcDiscoveryDispatch,
  buildOndcCanonicalSearch,
  classifyOndcTransportFailure,
  createOndcDispatchLedger,
  findIssuedOndcDispatch,
  isLiveOndcCallbackUrl,
  noteOndcDispatchCallbackTimeout,
  ondcDispatchIdempotencyKey,
  rememberOndcDispatch,
  toOndcDispatchAudit,
  toOndcDispatchBuyerView,
  resolveOndcEnvironmentGate,
  toOndcDispatchUserMessage,
  toPublicOndcEnvironmentDecision,
  validateOndcSearchPayload,
  type OndcCanonicalSearchPayload,
  type OndcDiscoveryDispatchRequest,
  type OndcDispatchAudit,
  type OndcDispatchLedger,
  type OndcDispatchPersistence,
  type OndcDispatchFailureClass as OndcDispatchFailureClassName,
  type OndcDispatchRecord,
  type OndcDispatchStatus as OndcDispatchStatusName,
  type OndcEnvironmentConfigInput,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
  type OndcDiscoveryStore,
} from '@otp/domain';
import { OndcGatewayClient } from './client/ondc-gateway-client';
import { acceptOndcDispatchOnSearch, type OndcDispatchCallbackResult } from './ondc-callback-ingress';
import { readOndcEnvironmentConfig } from './ondc-environment-config';
import { lookupOndcSigningPublicKey } from './ondc-registry-lookup';
import { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import {
  ondcDispatchStoreReason,
  type OndcDiscoveryDispatchStore,
} from './ondc-discovery-dispatch-store';

const MOCK_SUBSCRIBER_ID = 'mock.otp.test';
const MOCK_CALLBACK_URL = 'https://mock.otp.test/ondc-callback';

export interface OndcDiscoveryDispatchResult {
  ok: boolean;
  mockAcknowledged: boolean;
  gatewayAcknowledged: boolean;
  realNetworkVerified: boolean;
  mock: boolean;
  observationSource: OndcObservationSourceName | null;
  status: OndcDispatchStatusName;
  correlationId: string;
  transactionId: string;
  messageId: string;
  failure: OndcDispatchFailureClassName | null;
  reason: string | null;
  userMessage: string;
  persistence: OndcDispatchPersistence;
  callbackStatus: 'NOT_SENT' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'TIMED_OUT';
  audit: OndcDispatchAudit | null;
  buyerView: ReturnType<typeof toOndcDispatchBuyerView> | null;
  preparedRequest: OndcCanonicalSearchPayload | null;
}

export async function executeOndcDiscoveryDispatch(input: {
  request: OndcDiscoveryDispatchRequest;
  categoryLabel?: string | null;
  environmentConfig?: OndcEnvironmentConfigInput;
  ledger?: OndcDispatchLedger;
  now?: () => Date;
  ids?: { correlationId: string; messageId: string };
  /** Ignored. ONDC_ENABLED must not enable production. */
  ondcEnabled?: string | null;
  /** 00231 authority. Required for PRE_PROD. A write failure is not a successful dispatch. */
  dispatchStore?: OndcDiscoveryDispatchStore;
}): Promise<OndcDiscoveryDispatchResult> {
  void input.ondcEnabled;
  const ledger = input.ledger ?? createOndcDispatchLedger();
  const decision = input.environmentConfig
    ? resolveOndcEnvironmentGate(input.environmentConfig)
    : resolveOndcEnvironmentGate(readOndcEnvironmentConfig(typeof process !== 'undefined' ? process.env : undefined));
  const admission = admitOndcDiscoveryDispatch({
    request: input.request,
    decision: toPublicOndcEnvironmentDecision(decision),
    gatewayUrl: decision.client?.gatewayUrl ?? null,
    callbackUrl: decision.client?.callbackUrl ?? null,
  });
  if (!admission.admitted || !admission.domain || !admission.buyerRequestedPin || !admission.city || !admission.observationSource) {
    return refused(input.request, admission.failure ?? OndcDispatchFailureClass.SCHEMA, admission.reason ?? 'not_admitted', admission.userMessage);
  }

  const idempotencyKey = ondcDispatchIdempotencyKey({
    otpTransactionId: input.request.otpTransactionId.trim(),
    buyerRequestedPin: admission.buyerRequestedPin,
    domain: admission.domain,
  });
  const store = input.dispatchStore;
  if (admission.realDispatch && !store) {
    return persistenceFailed(input.request, 'dispatch_not_durable');
  }
  let existing: OndcDispatchRecord | null = null;
  if (store) {
    try {
      existing = await store.findByIdempotencyKey(idempotencyKey);
    } catch (error) {
      return persistenceFailed(input.request, ondcDispatchStoreReason(error));
    }
  } else {
    existing = ledger.byIdempotencyKey.get(idempotencyKey) ?? null;
  }
  if (existing?.transactionIssued) return resultFromRecord(existing);

  if (admission.realDispatch && !decision.client) {
    return refused(input.request, OndcDispatchFailureClass.CREDENTIAL_MISSING, 'preprod_credentials_missing', toOndcDispatchUserMessage(OndcDispatchFailureClass.CREDENTIAL_MISSING));
  }

  const now = input.now?.() ?? new Date();
  let transactionId = existing?.transactionId ?? input.request.otpTransactionId.trim();
  let messageId = existing?.messageId ?? input.ids?.messageId ?? `msg-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  let correlationId = existing?.correlationId ?? input.ids?.correlationId ?? randomUUID();
  const subscriberId = admission.realDispatch ? decision.client?.subscriberId ?? '' : MOCK_SUBSCRIBER_ID;
  const callbackUrl = admission.realDispatch ? decision.client?.callbackUrl ?? '' : MOCK_CALLBACK_URL;
  const buildPrepared = (ids: { transactionId: string; messageId: string }) => buildOndcCanonicalSearch({
    domain: admission.domain,
    subscriberId,
    callbackUrl,
    transactionId: ids.transactionId,
    messageId: ids.messageId,
    timestamp: now.toISOString(),
    city: admission.city,
    buyerRequestedPin: admission.buyerRequestedPin,
    itemName: input.request.itemName,
    categoryLabel: input.categoryLabel,
  });
  let prepared = buildPrepared({ transactionId, messageId });
  const schema = validateOndcSearchPayload(prepared);
  if (!schema.ok) {
    return refused(input.request, OndcDispatchFailureClass.SCHEMA, schema.reason, toOndcDispatchUserMessage(OndcDispatchFailureClass.SCHEMA));
  }

  if (store && !existing) {
    try {
      existing = await store.insert({
        idempotencyKey,
        transactionId,
        messageId,
        correlationId,
        otpTransactionId: input.request.otpTransactionId.trim(),
        buyerRequestedPin: admission.buyerRequestedPin,
        domain: admission.domain,
        city: admission.city,
        environment: decision.environment,
        observationSource: admission.observationSource,
        expectedBapId: subscriberId,
        categoryLabel: input.categoryLabel ?? null,
        subcategoryCode: input.request.subcategoryCode ?? null,
        requirementMode: input.request.requirementMode ?? null,
      });
    } catch (error) {
      return persistenceFailed(input.request, ondcDispatchStoreReason(error));
    }
    transactionId = existing.transactionId;
    messageId = existing.messageId;
    correlationId = existing.correlationId;
    prepared = buildPrepared({ transactionId, messageId });
    if (existing.transactionIssued) return resultFromRecord(existing);
  }

  const record = blankRecord({
    correlationId,
    idempotencyKey,
    request: input.request,
    transactionId,
    messageId,
    environment: decision.environment,
    observationSource: admission.observationSource,
    buyerRequestedPin: admission.buyerRequestedPin,
    domain: admission.domain,
    city: admission.city,
    categoryLabel: input.categoryLabel ?? null,
    initiatedAt: existing?.initiatedAt ?? now.toISOString(),
    expectedBapId: subscriberId,
  });

  if (!admission.realDispatch) {
    record.status = OndcDispatchStatus.MOCK_ACK;
    record.transactionIssued = true;
    record.gatewayAcknowledged = false;
    record.realNetworkVerified = false;
    record.persistence = 'NOT_STORED';
    if (store) {
      try {
        await store.advance({ transactionId, messageId, status: 'CALLBACK_PENDING' });
      } catch (error) {
        return persistenceFailed(input.request, ondcDispatchStoreReason(error));
      }
    }
    rememberOndcDispatch(ledger, record);
    return resultFromRecord(record, prepared);
  }

  const material = decision.client;
  if (!material) {
    return refused(input.request, OndcDispatchFailureClass.CREDENTIAL_MISSING, 'preprod_credentials_missing', toOndcDispatchUserMessage(OndcDispatchFailureClass.CREDENTIAL_MISSING));
  }
  if (store) {
    try {
      await store.advance({ transactionId, messageId, status: 'DISPATCHING' });
    } catch (error) {
      return persistenceFailed(input.request, ondcDispatchStoreReason(error));
    }
  }
  const client = new OndcGatewayClient({
    environment: 'PRE_PRODUCTION',
    subscriberId: material.subscriberId,
    uniqueKeyId: material.uniqueKeyId,
    bapUri: material.callbackUrl,
    signingPrivateKeyPem: material.signingPrivateKey,
    gatewayUrl: material.gatewayUrl,
    timeoutMs: decision.timeoutMs,
  });
  let transport = await client.sendPreparedSearch(prepared);
  let attempt = 0;
  while (attempt < decision.maxRetries) {
    const classified = classifyOndcTransportFailure(transport);
    if (transport.ok || !classified.retryable) break;
    attempt += 1;
    transport = await client.sendPreparedSearch(prepared);
  }
  record.transactionIssued = true;
  if (!transport.ok) {
    const classified = classifyOndcTransportFailure(transport);
    record.status = OndcDispatchStatus.FAILED;
    record.failure = classified.failure;
    record.reason = classified.reason;
    record.gatewayAcknowledged = false;
    record.realNetworkVerified = false;
    if (store) {
      try {
        await store.advance({
          transactionId,
          messageId,
          status: 'FAILED',
          failureReason: classified.reason,
        });
      } catch (error) {
        return persistenceFailed(input.request, ondcDispatchStoreReason(error));
      }
    }
    rememberOndcDispatch(ledger, record);
    return resultFromRecord(record, prepared);
  }
  record.status = OndcDispatchStatus.PENDING_CALLBACK;
  record.gatewayAcknowledged = true;
  record.realNetworkVerified = false;
  record.failure = null;
  record.reason = null;
  record.persistence = 'NOT_STORED';
  if (store) {
    try {
      await store.advance({ transactionId, messageId, status: 'CALLBACK_PENDING' });
    } catch (error) {
      return persistenceFailed(input.request, ondcDispatchStoreReason(error), {
        transactionId,
        messageId,
        correlationId,
      });
    }
  }
  rememberOndcDispatch(ledger, record);
  return resultFromRecord(record, prepared);
}

export async function runControlledOndcPreprodExercise(input: {
  exercise: boolean;
  actorId: string | null;
  request: Omit<OndcDiscoveryDispatchRequest, 'initiatorId'>;
  environmentConfig?: OndcEnvironmentConfigInput;
  ledger?: OndcDispatchLedger;
  now?: () => Date;
  ids?: { correlationId: string; messageId: string };
  categoryLabel?: string | null;
  allowMock?: boolean;
  dispatchStore?: OndcDiscoveryDispatchStore;
  /** Server-only. A buyer payload cannot set this. True still requires a public OTP callback URL. */
  hostedCallbackAttested?: boolean;
}): Promise<OndcDiscoveryDispatchResult> {
  if (input.exercise !== true) {
    return refused(input.request, OndcDispatchFailureClass.UNAUTHENTICATED, 'exercise_not_enabled', toOndcDispatchUserMessage(OndcDispatchFailureClass.UNAUTHENTICATED));
  }
  const decision = input.environmentConfig
    ? resolveOndcEnvironmentGate(input.environmentConfig)
    : resolveOndcEnvironmentGate(readOndcEnvironmentConfig(typeof process !== 'undefined' ? process.env : undefined));
  if (decision.environment === OndcRuntimeEnvironment.PRODUCTION || decision.credentialSlot === 'PRODUCTION') {
    return refused(input.request, OndcDispatchFailureClass.PRODUCTION_REFUSED, 'production_dispatch_refused', toOndcDispatchUserMessage(OndcDispatchFailureClass.PRODUCTION_REFUSED));
  }
  if (decision.environment !== OndcRuntimeEnvironment.PRE_PROD && input.allowMock !== true) {
    return refused(input.request, OndcDispatchFailureClass.CREDENTIAL_MISSING, 'exercise_not_preprod', toOndcDispatchUserMessage(OndcDispatchFailureClass.CREDENTIAL_MISSING));
  }
  if (decision.environment === OndcRuntimeEnvironment.PRE_PROD) {
    const preview = admitOndcDiscoveryDispatch({
      request: { ...input.request, initiatorId: input.actorId },
      decision: toPublicOndcEnvironmentDecision(decision),
      gatewayUrl: decision.client?.gatewayUrl ?? null,
      callbackUrl: decision.client?.callbackUrl ?? null,
    });
    if (preview.admitted && preview.realDispatch) {
      const hosted = input.hostedCallbackAttested === true && isLiveOndcCallbackUrl(decision.client?.callbackUrl);
      if (!hosted) {
        return refused(
          input.request,
          OndcDispatchFailureClass.NOT_ADDRESSABLE,
          'callback_not_hosted',
          toOndcDispatchUserMessage(OndcDispatchFailureClass.NOT_ADDRESSABLE),
        );
      }
    }
  }
  return executeOndcDiscoveryDispatch({
    request: { ...input.request, initiatorId: input.actorId },
    categoryLabel: input.categoryLabel,
    environmentConfig: input.environmentConfig,
    ledger: input.ledger,
    now: input.now,
    ids: input.ids,
    dispatchStore: input.dispatchStore,
  });
}

export async function acceptIssuedOndcOnSearch(input: {
  ledger: OndcDispatchLedger;
  authHeader: string | null | undefined;
  body: string | object;
  processingEnvironment: OndcRuntimeEnvironmentName;
  processingSource: OndcObservationSourceName;
  store?: OndcDiscoveryStore;
  dispatchStore?: OndcDiscoveryDispatchStore;
  resolvePublicKey?: (keyId: string, hint: { country: string; city: string; domain: string }) => Promise<string | null>;
  registry?: {
    registryUrl: string;
    subscriberId: string;
    uniqueKeyId: string;
    signingPrivateKey: string;
    timeoutMs: number;
    fetchImpl?: typeof fetch;
  };
}): Promise<OndcDispatchCallbackResult> {
  const receiver = new OndcBapReceiver();
  const resolvePublicKey =
    input.resolvePublicKey ??
    (input.registry
      ? async (keyId: string, hint: { country: string; city: string; domain: string }) => {
          const parts = keyId.split('|');
          if (parts.length !== 3) return null;
          return lookupOndcSigningPublicKey({
            registryUrl: input.registry!.registryUrl,
            subscriberId: input.registry!.subscriberId,
            uniqueKeyId: input.registry!.uniqueKeyId,
            signingPrivateKey: input.registry!.signingPrivateKey,
            targetSubscriberId: parts[0] ?? '',
            targetUniqueKeyId: parts[1] ?? '',
            country: hint.country,
            city: hint.city,
            domain: hint.domain,
            timeoutMs: input.registry!.timeoutMs,
            fetchImpl: input.registry!.fetchImpl,
          });
        }
      : async () => null);
  return acceptOndcDispatchOnSearch({
    ledger: input.ledger,
    authHeader: input.authHeader,
    body: input.body,
    receiver,
    resolvePublicKey,
    processingEnvironment: input.processingEnvironment,
    processingSource: input.processingSource,
    store: input.store,
    dispatchStore: input.dispatchStore,
  });
}

export async function timeoutDurableOndcDispatch(
  store: OndcDiscoveryDispatchStore,
  correlationId: string,
): Promise<OndcDiscoveryDispatchResult | null> {
  let found: OndcDispatchRecord | null;
  try {
    found = await store.findByCorrelationId(correlationId);
  } catch (error) {
    return persistenceFailed({ otpTransactionId: '' }, ondcDispatchStoreReason(error));
  }
  if (!found) return null;
  if (found.status !== OndcDispatchStatus.PENDING_CALLBACK && found.status !== OndcDispatchStatus.MOCK_ACK) {
    return resultFromRecord(found);
  }
  try {
    const advanced = await store.advance({
      transactionId: found.transactionId,
      messageId: found.messageId,
      status: 'TIMED_OUT',
      failureReason: 'callback_timeout',
    });
    return resultFromRecord(advanced);
  } catch (error) {
    return persistenceFailed(
      { otpTransactionId: found.otpTransactionId },
      ondcDispatchStoreReason(error),
    );
  }
}

export function timeoutOndcDispatchCallback(ledger: OndcDispatchLedger, correlationId: string): OndcDiscoveryDispatchResult | null {
  const record = noteOndcDispatchCallbackTimeout(ledger, correlationId);
  return record ? resultFromRecord(record) : null;
}

export function issuedOndcDispatch(ledger: OndcDispatchLedger, transactionId: string): OndcDispatchRecord | null {
  return findIssuedOndcDispatch(ledger, transactionId);
}

function blankRecord(input: {
  correlationId: string;
  idempotencyKey: string;
  request: OndcDiscoveryDispatchRequest;
  transactionId: string;
  messageId: string;
  environment: OndcDispatchRecord['environment'];
  observationSource: OndcObservationSourceName;
  buyerRequestedPin: string;
  domain: 'ONDC:RET12' | 'ONDC:RET14';
  city: string;
  categoryLabel: string | null;
  initiatedAt: string;
  expectedBapId: string;
}): OndcDispatchRecord {
  return {
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    otpTransactionId: input.request.otpTransactionId.trim(),
    transactionId: input.transactionId,
    messageId: input.messageId,
    operation: 'search',
    provider: 'ONDC',
    environment: input.environment,
    observationSource: input.observationSource,
    buyerRequestedPin: input.buyerRequestedPin,
    domain: input.domain,
    city: input.city,
    categoryLabel: input.categoryLabel,
    subcategoryCode: input.request.subcategoryCode?.trim() || null,
    requirementMode: input.request.requirementMode?.trim() || null,
    initiatedAt: input.initiatedAt,
    initiatorId: input.request.initiatorId?.trim() ?? '',
    expectedBapId: input.expectedBapId,
    status: OndcDispatchStatus.REFUSED,
    transactionIssued: false,
    gatewayAcknowledged: false,
    realNetworkVerified: false,
    failure: null,
    reason: null,
    callbackDigest: null,
    canonicalObservedAt: null,
    boundParticipantId: null,
    persistence: 'NOT_STORED',
  };
}

function resultFromRecord(record: OndcDispatchRecord, preparedRequest: OndcCanonicalSearchPayload | null = null): OndcDiscoveryDispatchResult {
  const callbackStatus =
    record.status === OndcDispatchStatus.CALLBACK_VERIFIED
      ? 'VERIFIED'
      : record.status === OndcDispatchStatus.CALLBACK_TIMED_OUT
        ? 'TIMED_OUT'
        : record.status === OndcDispatchStatus.PENDING_CALLBACK
          ? 'PENDING'
          : 'NOT_SENT';
  return {
    ok: record.gatewayAcknowledged,
    mockAcknowledged: record.status === OndcDispatchStatus.MOCK_ACK,
    gatewayAcknowledged: record.gatewayAcknowledged,
    realNetworkVerified: record.realNetworkVerified,
    mock: record.observationSource === OndcObservationSource.MOCK,
    observationSource: record.observationSource,
    status: record.status,
    correlationId: record.correlationId,
    transactionId: record.transactionId,
    messageId: record.messageId,
    failure: record.failure,
    reason: record.reason,
    userMessage: record.failure ? toOndcDispatchUserMessage(record.failure) : record.status === OndcDispatchStatus.MOCK_ACK
      ? 'ONDC discovery is running with mock evidence.'
      : record.status === OndcDispatchStatus.PENDING_CALLBACK
        ? 'ONDC discovery is waiting for a callback.'
        : record.status === OndcDispatchStatus.CALLBACK_VERIFIED
          ? 'ONDC discovery received a callback.'
          : 'ONDC discovery could not be completed.',
    persistence: record.persistence,
    callbackStatus,
    audit: toOndcDispatchAudit(record),
    buyerView: toOndcDispatchBuyerView(record),
    preparedRequest,
  };
}

function persistenceFailed(
  request: { otpTransactionId?: string | null },
  reason: string,
  identity?: { transactionId: string; messageId: string; correlationId: string },
): OndcDiscoveryDispatchResult {
  return {
    ok: false,
    mockAcknowledged: false,
    gatewayAcknowledged: false,
    realNetworkVerified: false,
    mock: false,
    observationSource: null,
    status: OndcDispatchStatus.FAILED,
    correlationId: identity?.correlationId ?? '',
    transactionId: identity?.transactionId ?? request.otpTransactionId?.trim() ?? '',
    messageId: identity?.messageId ?? '',
    failure: OndcDispatchFailureClass.PERSISTENCE,
    reason,
    userMessage: toOndcDispatchUserMessage(OndcDispatchFailureClass.PERSISTENCE),
    persistence: 'REJECTED',
    callbackStatus: 'NOT_SENT',
    audit: null,
    buyerView: null,
    preparedRequest: null,
  };
}

function refused(
  request: { otpTransactionId?: string | null; initiatorId?: string | null },
  failure: OndcDispatchFailureClassName,
  reason: string,
  userMessage: string,
): OndcDiscoveryDispatchResult {
  return {
    ok: false,
    mockAcknowledged: false,
    gatewayAcknowledged: false,
    realNetworkVerified: false,
    mock: false,
    observationSource: null,
    status: OndcDispatchStatus.REFUSED,
    correlationId: '',
    transactionId: request.otpTransactionId?.trim() ?? '',
    messageId: '',
    failure,
    reason,
    userMessage,
    persistence: 'NOT_STORED',
    callbackStatus: 'NOT_SENT',
    audit: null,
    buyerView: null,
    preparedRequest: null,
  };
}

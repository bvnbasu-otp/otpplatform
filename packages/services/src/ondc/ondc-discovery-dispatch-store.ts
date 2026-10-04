/**
 * Durable ONDC /search lifecycle (migration 00231).
 * The in-memory ledger is not the authority when this store is supplied.
 * Writes go through service_role RPCs. This module does not read credentials.
 */
import {
  OndcDispatchFailureClass,
  OndcDispatchStatus,
  OndcObservationSource,
  type OndcDispatchPersistence,
  type OndcDispatchRecord,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from '@otp/domain';

export interface OndcDispatchRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface OndcDiscoveryDispatchInsert {
  idempotencyKey: string;
  transactionId: string;
  messageId: string;
  correlationId: string;
  otpTransactionId: string;
  buyerRequestedPin: string;
  domain: 'ONDC:RET12' | 'ONDC:RET14';
  city: string;
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName;
  expectedBapId: string;
  categoryLabel?: string | null;
  subcategoryCode?: string | null;
  requirementMode?: string | null;
}

export interface OndcDiscoveryCallbackCandidate {
  provider_supplier_id: string;
  provider_participant_id: string;
  display_name: string;
  correlation_id?: string | null;
  requested_category?: string | null;
  seller_pin?: string | null;
  seller_locality?: string | null;
  seller_city?: string | null;
  seller_state?: string | null;
  seller_country?: string | null;
  reported_phone?: string | null;
  reported_email?: string | null;
  catalogue_id?: string | null;
  location_id?: string | null;
  city_code?: string | null;
  bpp_uri?: string | null;
}

export interface OndcDiscoveryCallbackAccept {
  transactionId: string;
  messageId: string;
  callbackSubscriber: string;
  bodyDigest: string;
  observedAt: string;
  domain: string | null;
  bapId: string | null;
  environment: OndcRuntimeEnvironmentName;
  observationSource: OndcObservationSourceName;
  candidates: readonly OndcDiscoveryCallbackCandidate[];
}

export interface OndcDiscoveryCallbackAcceptResult {
  ok: boolean;
  replay: boolean;
  stale: boolean;
  reason: string | null;
  persistence: OndcDispatchPersistence;
  realNetworkVerified: boolean;
  identityCount: number;
}

export interface OndcDiscoveryDispatchStore {
  findByIdempotencyKey(idempotencyKey: string): Promise<OndcDispatchRecord | null>;
  findByTransactionId(transactionId: string): Promise<OndcDispatchRecord | null>;
  findByCorrelationId(correlationId: string): Promise<OndcDispatchRecord | null>;
  insert(input: OndcDiscoveryDispatchInsert): Promise<OndcDispatchRecord>;
  advance(input: {
    transactionId: string;
    messageId: string;
    status: 'DISPATCHING' | 'CALLBACK_PENDING' | 'FAILED' | 'TIMED_OUT';
    failureReason?: string | null;
  }): Promise<OndcDispatchRecord>;
  acceptCallback(input: OndcDiscoveryCallbackAccept): Promise<OndcDiscoveryCallbackAcceptResult>;
}

const STORE_REASONS = [
  'unknown_transaction',
  'unknown_message',
  'duplicate_message',
  'wrong_provider',
  'wrong_context',
  'environment_mismatch',
  'mock_not_real',
  'observation_not_retained',
  'rejected_identity',
  'rejected_provenance',
  'rejected_environment',
  'ondc_production_disabled',
  'unsupported_domain',
  'invalid_city',
  'invalid_buyer_pin',
  'idempotency_conflict',
  'transaction_id_reused',
  'dispatch_not_durable',
  'callback_not_pending',
  'canonical_observed_at_regression',
  'buyer_pin_immutable',
  'malformed_callback',
  'fabricated_display_name',
] as const;

export function ondcDispatchStoreReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  for (const reason of STORE_REASONS) {
    if (message.includes(reason)) return reason;
  }
  return 'dispatch_not_durable';
}

export function createRpcOndcDiscoveryDispatchStore(client: OndcDispatchRpcClient): OndcDiscoveryDispatchStore {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(ondcDispatchStoreReason(error.message));
    return data;
  }

  return {
    async findByIdempotencyKey(idempotencyKey) {
      const data = await call('find_ondc_discovery_dispatch', {
        p_idempotency_key: idempotencyKey,
        p_transaction_id: null,
        p_correlation_id: null,
      });
      return data == null ? null : mapDispatchRow(data);
    },
    async findByTransactionId(transactionId) {
      const data = await call('find_ondc_discovery_dispatch', {
        p_idempotency_key: null,
        p_transaction_id: transactionId,
        p_correlation_id: null,
      });
      return data == null ? null : mapDispatchRow(data);
    },
    async findByCorrelationId(correlationId) {
      const data = await call('find_ondc_discovery_dispatch', {
        p_idempotency_key: null,
        p_transaction_id: null,
        p_correlation_id: correlationId,
      });
      return data == null ? null : mapDispatchRow(data);
    },
    async insert(input) {
      const data = await call('insert_ondc_discovery_dispatch', {
        p_idempotency_key: input.idempotencyKey,
        p_transaction_id: input.transactionId,
        p_message_id: input.messageId,
        p_correlation_id: input.correlationId,
        p_otp_transaction_id: input.otpTransactionId,
        p_buyer_requested_pin: input.buyerRequestedPin,
        p_domain: input.domain,
        p_city: input.city,
        p_environment: input.environment,
        p_observation_source: input.observationSource,
        p_expected_bap_id: input.expectedBapId,
        p_category_label: input.categoryLabel ?? null,
        p_subcategory_code: input.subcategoryCode ?? null,
        p_requirement_mode: input.requirementMode ?? null,
      });
      if (data == null) throw new Error('dispatch_not_durable');
      return mapDispatchRow(data);
    },
    async advance(input) {
      const data = await call('advance_ondc_discovery_dispatch', {
        p_transaction_id: input.transactionId,
        p_message_id: input.messageId,
        p_status: input.status,
        p_failure_reason: input.failureReason ?? null,
      });
      if (data == null) throw new Error('dispatch_not_durable');
      return mapDispatchRow(data);
    },
    async acceptCallback(input) {
      const data = await call('accept_ondc_discovery_on_search', {
        p_transaction_id: input.transactionId,
        p_message_id: input.messageId,
        p_callback_subscriber: input.callbackSubscriber,
        p_body_digest: input.bodyDigest,
        p_observed_at: input.observedAt,
        p_domain: input.domain,
        p_bap_id: input.bapId,
        p_environment: input.environment,
        p_observation_source: input.observationSource,
        p_candidates: input.candidates,
      });
      return mapAcceptResult(data);
    },
  };
}

function mapAcceptResult(data: unknown): OndcDiscoveryCallbackAcceptResult {
  const row = asRecord(data);
  if (!row) throw new Error('dispatch_not_durable');
  const persistence = row.persistence;
  const stored: OndcDispatchPersistence =
    persistence === 'STORED_REAL' || persistence === 'STORED_MOCK' || persistence === 'REJECTED' || persistence === 'NOT_STORED'
      ? persistence
      : 'REJECTED';
  return {
    ok: row.ok === true,
    replay: row.replay === true,
    stale: row.stale === true,
    reason: typeof row.reason === 'string' ? row.reason : null,
    persistence: stored,
    realNetworkVerified: row.real_network_verified === true,
    identityCount: typeof row.identity_count === 'number' ? row.identity_count : 0,
  };
}

export function mapDispatchRow(data: unknown): OndcDispatchRecord {
  const row = asRecord(data);
  if (!row) throw new Error('dispatch_not_durable');
  const environment = text(row.environment);
  const source = text(row.observation_source);
  const domain = text(row.domain);
  const status = text(row.status);
  if (environment !== 'LOCAL' && environment !== 'CI' && environment !== 'PRE_PROD') {
    throw new Error('rejected_environment');
  }
  if (source !== OndcObservationSource.MOCK && source !== OndcObservationSource.REAL_NETWORK) {
    throw new Error('rejected_provenance');
  }
  if (domain !== 'ONDC:RET12' && domain !== 'ONDC:RET14') throw new Error('unsupported_domain');
  const issued = status !== 'CREATED' && status !== 'DISPATCHING';
  const domainStatus =
    status === 'CALLBACK_PENDING' && source === OndcObservationSource.MOCK
      ? OndcDispatchStatus.MOCK_ACK
      : status === 'CALLBACK_PENDING'
        ? OndcDispatchStatus.PENDING_CALLBACK
        : status === 'TIMED_OUT'
          ? OndcDispatchStatus.CALLBACK_TIMED_OUT
          : status === 'OBSERVED' || status === 'CALLBACK_VERIFIED'
            ? OndcDispatchStatus.CALLBACK_VERIFIED
            : status === 'FAILED'
              ? OndcDispatchStatus.FAILED
              : OndcDispatchStatus.REFUSED;
  const persistence: OndcDispatchPersistence =
    status === 'OBSERVED'
      ? source === OndcObservationSource.REAL_NETWORK
        ? 'STORED_REAL'
        : 'STORED_MOCK'
      : 'NOT_STORED';
  return {
    correlationId: text(row.correlation_id),
    idempotencyKey: text(row.idempotency_key),
    otpTransactionId: text(row.otp_transaction_id),
    transactionId: text(row.transaction_id),
    messageId: text(row.message_id),
    operation: 'search',
    provider: 'ONDC',
    environment,
    observationSource: source,
    buyerRequestedPin: text(row.buyer_requested_pin),
    domain,
    city: text(row.city),
    categoryLabel: optionalText(row.category_label),
    subcategoryCode: optionalText(row.subcategory_code),
    requirementMode: optionalText(row.requirement_mode),
    initiatedAt: text(row.initiated_at),
    initiatorId: '',
    expectedBapId: text(row.expected_bap_id),
    status: domainStatus,
    transactionIssued: issued && domainStatus !== OndcDispatchStatus.REFUSED,
    gatewayAcknowledged:
      source === OndcObservationSource.REAL_NETWORK &&
      (status === 'CALLBACK_PENDING' || status === 'TIMED_OUT' || status === 'CALLBACK_VERIFIED' || status === 'OBSERVED'),
    realNetworkVerified: row.real_network_verified === true,
    failure:
      status === 'TIMED_OUT'
        ? OndcDispatchFailureClass.CALLBACK_TIMEOUT
        : status === 'FAILED'
          ? OndcDispatchFailureClass.PROTOCOL_REJECTION
          : null,
    reason: optionalText(row.failure_reason),
    callbackDigest: optionalText(row.callback_digest),
    canonicalObservedAt: optionalText(row.canonical_observed_at),
    boundParticipantId: optionalText(row.bound_participant_id),
    persistence,
  };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    try {
      return asRecord(JSON.parse(data));
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('dispatch_not_durable');
  return value;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

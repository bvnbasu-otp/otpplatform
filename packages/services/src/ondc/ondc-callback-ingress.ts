/**
 * Hardened /on_search ingress. Signature failure stops persistence.
 * Identity comes from the canonical normalizer, not receiver display defaults.
 */
import {
  admitOndcOnSearchCallback,
  commitOndcDispatchCallback,
  evaluateOndcDispatchCallback,
  OndcDispatchFailureClass,
  OndcObservationSource,
  ondcDiscoveryIdentityKey,
  type OndcCallbackRejectReason,
  type OndcDiscoveryRequestScope,
  type OndcDiscoveryRetainMeta,
  type OndcDiscoveryStore,
  type OndcDispatchFailureClass as OndcDispatchFailureClassName,
  type OndcDispatchLedger,
  type OndcDispatchPersistence,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from '@otp/domain';
import { createBodyDigest, verifyOndcAuthHeader } from './crypto/ondc-auth-crypto';
import type { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import { persistNormalizedOndcOnSearch } from './ondc-discovery-persistence';
import {
  ondcDispatchStoreReason,
  type OndcDiscoveryCallbackCandidate,
  type OndcDiscoveryDispatchStore,
} from './ondc-discovery-dispatch-store';
import { normalizeBecknOnSearchCatalog } from './ondc-on-search-normalizer';
import type { OndcAck, OndcCatalog, OndcPayload } from './types/ondc-beckn';

export interface OndcCallbackIngressResult {
  ok: boolean;
  reason?: OndcCallbackRejectReason | 'verification_failed';
  replay: boolean;
  identityCount: number;
  suppliersInserted: number;
  invitations: number;
  quotes: number;
  awards: number;
  purchaseOrders: number;
  payments: number;
}

export async function ingestOndcOnSearchCallback(input: {
  receiver: OndcBapReceiver;
  authHeader: string | null | undefined;
  body: string | object;
  payload: OndcPayload<{ catalog?: OndcCatalog }>;
  knownTransactionIds: readonly string[];
  seenMessageKeys: Set<string>;
  observedAt: string;
  scope?: OndcDiscoveryRequestScope;
  meta: OndcDiscoveryRetainMeta;
  store?: OndcDiscoveryStore;
}): Promise<OndcCallbackIngressResult> {
  const empty = {
    replay: false,
    identityCount: input.store?.identities.size ?? 0,
    suppliersInserted: 0,
    invitations: 0,
    quotes: 0,
    awards: 0,
    purchaseOrders: 0,
    payments: 0,
  };
  const verification = await input.receiver.verifyWebhook(input.authHeader, input.body);
  if (!verification.valid) {
    return {
      ok: false,
      reason: mapVerificationError(verification.error),
      ...empty,
    };
  }

  const admission = admitOndcOnSearchCallback({
    authorizationHeader: input.authHeader,
    publicKeyConfigured: true,
    signatureValid: true,
    payload: input.payload,
    knownTransactionIds: input.knownTransactionIds,
    seenMessageKeys: [...input.seenMessageKeys],
  });
  if (!admission.ok) {
    return { ok: false, reason: admission.reason, ...empty };
  }

  const persisted = persistNormalizedOndcOnSearch({
    payload: input.payload,
    observedAt: input.observedAt,
    scope: input.scope,
    meta: input.meta,
    store: input.store,
  });
  input.seenMessageKeys.add(admission.messageKey);
  return {
    ok: true,
    replay: admission.replay,
    identityCount: persisted.identityCount,
    suppliersInserted: persisted.suppliersInserted,
    invitations: persisted.invitations,
    quotes: persisted.quotes,
    awards: persisted.awards,
    purchaseOrders: persisted.purchaseOrders,
    payments: persisted.payments,
  };
}

function mapVerificationError(error?: string): OndcCallbackRejectReason {
  if (!error) return 'invalid_signature';
  if (error.toLowerCase().includes('missing authorization')) return 'missing_signature';
  if (error.toLowerCase().includes('public key is not configured') || error.toLowerCase().includes('public key not found')) {
    return 'public_key_not_configured';
  }
  return 'invalid_signature';
}

export interface OndcDispatchCallbackResult {
  ok: boolean;
  replay: boolean;
  stale: boolean;
  failure: OndcDispatchFailureClassName | null;
  reason: string | null;
  protocol: OndcAck;
  persistence: OndcDispatchPersistence;
  identityCount: number;
  realNetworkVerified: boolean;
  invitations: number;
  quotes: number;
  awards: number;
  purchaseOrders: number;
  payments: number;
}

/**
 * Fail-closed /on_search for an issued dispatch.
 * Signature, environment, and correlation are required before normalize or persist.
 * An exact duplicate is acknowledged and does not create a second observation.
 */
export async function acceptOndcDispatchOnSearch(input: {
  ledger: OndcDispatchLedger;
  authHeader: string | null | undefined;
  body: string | object;
  receiver: OndcBapReceiver;
  resolvePublicKey: (keyId: string, hint: { country: string; city: string; domain: string }) => Promise<string | null>;
  processingEnvironment: OndcRuntimeEnvironmentName;
  processingSource: OndcObservationSourceName;
  store?: OndcDiscoveryStore;
  /** 00231 authority. Signature is verified before this store is read. */
  dispatchStore?: OndcDiscoveryDispatchStore;
}): Promise<OndcDispatchCallbackResult> {
  const store = input.store;
  const emptyCounts = {
    identityCount: store?.identities.size ?? 0,
    invitations: 0,
    quotes: 0,
    awards: 0,
    purchaseOrders: 0,
    payments: 0,
  };
  const nack = (
    failure: OndcDispatchFailureClassName,
    reason: string,
  ): OndcDispatchCallbackResult => ({
    ok: false,
    replay: false,
    stale: false,
    failure,
    reason,
    protocol: input.receiver.createNack('PROTOCOL_ERROR', 'ONDC callback was rejected'),
    persistence: 'REJECTED',
    realNetworkVerified: false,
    ...emptyCounts,
  });

  if (!input.authHeader?.trim()) {
    return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'missing_signature');
  }
  const keyParts = parseSignatureKeyId(input.authHeader);
  if (!keyParts) return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'malformed_signature');

  let payload: unknown;
  try {
    payload = typeof input.body === 'string' ? JSON.parse(input.body) : input.body;
  } catch {
    return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'malformed_callback');
  }
  const hint = callbackLookupHint(payload);
  if (!hint) return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'malformed_callback');

  let publicKey: string | null = null;
  try {
    publicKey = await input.resolvePublicKey(keyParts.keyId, hint);
  } catch {
    publicKey = null;
  }
  if (!publicKey) return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'public_key_not_configured');

  const verification = verifyOndcAuthHeader({
    authHeader: input.authHeader,
    body: input.body,
    publicKeyPem: publicKey,
  });
  if (!verification.valid) {
    return nack(OndcDispatchFailureClass.AUTH_FAILURE, mapVerificationError(verification.error));
  }

  const transactionId = hint.transactionId;
  const bodyDigest = createBodyDigest(input.body);
  let record = input.dispatchStore ? null : input.ledger.byTransactionId.get(transactionId) ?? null;
  if (input.dispatchStore) {
    try {
      record = await input.dispatchStore.findByTransactionId(transactionId);
    } catch (error) {
      return nack(OndcDispatchFailureClass.PERSISTENCE, ondcDispatchStoreReason(error));
    }
  }
  const decision = evaluateOndcDispatchCallback({
    record,
    payload,
    signerSubscriberId: keyParts.subscriberId,
    bodyDigest,
    processingEnvironment: input.processingEnvironment,
    processingSource: input.processingSource,
    seenReplayKeys: input.dispatchStore ? [] : [...input.ledger.seenReplayKeys],
  });
  if (!decision.ok || !record) {
    return nack(
      decision.ok ? OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE : decision.failure,
      decision.ok ? 'unknown_transaction' : decision.reason,
    );
  }

  if (!decision.apply) {
    if (!input.dispatchStore) {
      commitOndcDispatchCallback(input.ledger, record, decision, bodyDigest, record.persistence);
    }
    return {
      ok: true,
      replay: decision.replay,
      stale: decision.stale,
      failure: null,
      reason: decision.stale ? 'stale_callback' : decision.replay ? 'replay' : null,
      protocol: input.receiver.createAck(),
      persistence: record.persistence,
      realNetworkVerified: false,
      identityCount: store?.identities.size ?? 0,
      invitations: 0,
      quotes: 0,
      awards: 0,
      purchaseOrders: 0,
      payments: 0,
    };
  }

  if (input.dispatchStore) {
    const catalog = payload as OndcPayload<{ catalog?: OndcCatalog }>;
    const candidates = normalizeBecknOnSearchCatalog(catalog, decision.observedAt, {
      requestedPin: record.buyerRequestedPin,
      requestedCategory: record.categoryLabel,
      requestedSubcategoryCode: record.subcategoryCode,
      requirementMode: record.requirementMode,
    }).filter((candidate) => candidate.providerSupplierId.trim().length > 0);
    if (candidates.length === 0) {
      return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'observation_not_retained');
    }
    const context = catalog.context as { domain?: string; bap_id?: string } | undefined;
    let accepted;
    try {
      accepted = await input.dispatchStore.acceptCallback({
        transactionId: decision.transactionId,
        messageId: decision.messageId,
        callbackSubscriber: keyParts.subscriberId,
        bodyDigest,
        observedAt: decision.observedAt,
        domain: typeof context?.domain === 'string' ? context.domain : record.domain,
        bapId: typeof context?.bap_id === 'string' ? context.bap_id : record.expectedBapId,
        environment: input.processingEnvironment,
        observationSource: input.processingSource,
        candidates: candidates.map(durableCandidate),
      });
    } catch (error) {
      return nack(OndcDispatchFailureClass.PERSISTENCE, ondcDispatchStoreReason(error));
    }
    if (!accepted.ok) {
      return nack(failureForStoreReason(accepted.reason), accepted.reason ?? 'observation_not_retained');
    }
    return {
      ok: true,
      replay: accepted.replay,
      stale: accepted.stale,
      failure: null,
      reason: accepted.replay ? 'replay' : null,
      protocol: input.receiver.createAck(),
      persistence: accepted.persistence,
      realNetworkVerified: accepted.realNetworkVerified,
      identityCount: accepted.identityCount,
      invitations: 0,
      quotes: 0,
      awards: 0,
      purchaseOrders: 0,
      payments: 0,
    };
  }

  const persisted = persistNormalizedOndcOnSearch({
    payload: payload as OndcPayload<{ catalog?: OndcCatalog }>,
    observedAt: decision.observedAt,
    scope: {
      requestedPin: record.buyerRequestedPin,
      requestedCategory: record.categoryLabel,
      requestedSubcategoryCode: record.subcategoryCode,
      requirementMode: record.requirementMode,
    },
    meta: {
      source: record.observationSource,
      environment: record.environment,
      productionActivated: false,
    },
    store,
  });
  const storedAny = persisted.candidates.some((candidate) =>
    persisted.store.identities.has(ondcDiscoveryIdentityKey(candidate.providerSupplierId)),
  );
  if (!storedAny) {
    return nack(OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE, 'observation_not_retained');
  }
  const stored: OndcDispatchPersistence =
    record.observationSource === OndcObservationSource.REAL_NETWORK ? 'STORED_REAL' : 'STORED_MOCK';
  commitOndcDispatchCallback(input.ledger, record, decision, createBodyDigest(input.body), stored);
  if (record.observationSource !== OndcObservationSource.REAL_NETWORK) record.realNetworkVerified = false;
  return {
    ok: true,
    replay: false,
    stale: false,
    failure: null,
    reason: null,
    protocol: input.receiver.createAck(),
    persistence: stored,
    realNetworkVerified: record.realNetworkVerified,
    identityCount: persisted.identityCount,
    invitations: persisted.invitations,
    quotes: persisted.quotes,
    awards: persisted.awards,
    purchaseOrders: persisted.purchaseOrders,
    payments: persisted.payments,
  };
}

function durableCandidate(candidate: {
  providerSupplierId: string;
  providerParticipantId: string;
  displayName: string;
  correlationId: string;
  requestedCategory: string | null;
  location?: { pinCode?: string; locality?: string; city?: string; state?: string; country?: string };
  ondc: {
    reportedPhone?: string | null;
    reportedEmail?: string | null;
    catalogueId?: string | null;
    locationId?: string | null;
    cityCode?: string | null;
    endpoint?: string | null;
  };
}): OndcDiscoveryCallbackCandidate {
  const endpoint = candidate.ondc.endpoint?.trim();
  return {
    provider_supplier_id: candidate.providerSupplierId,
    provider_participant_id: candidate.providerParticipantId,
    display_name: candidate.displayName,
    correlation_id: candidate.correlationId,
    requested_category: candidate.requestedCategory,
    seller_pin: candidate.location?.pinCode ?? null,
    seller_locality: candidate.location?.locality ?? null,
    seller_city: candidate.location?.city ?? null,
    seller_state: candidate.location?.state ?? null,
    seller_country: candidate.location?.country ?? null,
    reported_phone: candidate.ondc.reportedPhone ?? null,
    reported_email: candidate.ondc.reportedEmail ?? null,
    catalogue_id: candidate.ondc.catalogueId ?? null,
    location_id: candidate.ondc.locationId ?? null,
    city_code: candidate.ondc.cityCode ?? null,
    bpp_uri: endpoint && endpoint.startsWith('https://') ? endpoint : null,
  };
}

function failureForStoreReason(reason: string | null): OndcDispatchFailureClassName {
  if (reason === 'duplicate_message') return OndcDispatchFailureClass.DUPLICATE;
  if (reason === 'environment_mismatch' || reason === 'mock_not_real') return OndcDispatchFailureClass.ENVIRONMENT_SEPARATION;
  if (reason === 'dispatch_not_durable') return OndcDispatchFailureClass.PERSISTENCE;
  return OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE;
}

function parseSignatureKeyId(authHeader: string): { keyId: string; subscriberId: string; uniqueKeyId: string } | null {
  const match = authHeader.match(/keyId="([^"]+)"/);
  const keyId = match?.[1] ?? '';
  const parts = keyId.split('|');
  if (parts.length !== 3 || parts[2] !== 'ed25519' || !parts[0] || !parts[1]) return null;
  return { keyId, subscriberId: parts[0], uniqueKeyId: parts[1] };
}

function callbackLookupHint(payload: unknown): { country: string; city: string; domain: string; transactionId: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const context = (payload as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;
  const row = context as Record<string, unknown>;
  const country = typeof row.country === 'string' ? row.country.trim() : '';
  const city = typeof row.city === 'string' ? row.city.trim() : '';
  const domain = typeof row.domain === 'string' ? row.domain.trim() : '';
  const transactionId = typeof row.transaction_id === 'string' ? row.transaction_id.trim() : '';
  if (!country || !city || !domain || !transactionId) return null;
  return { country, city, domain, transactionId };
}

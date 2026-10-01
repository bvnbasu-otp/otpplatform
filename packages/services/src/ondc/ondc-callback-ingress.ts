/**
 * Hardened /on_search ingress. Signature failure stops persistence.
 * Identity comes from the canonical normalizer, not receiver display defaults.
 */
import {
  admitOndcOnSearchCallback,
  type OndcCallbackRejectReason,
  type OndcDiscoveryRequestScope,
  type OndcDiscoveryRetainMeta,
  type OndcDiscoveryStore,
} from '@otp/domain';
import type { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import { persistNormalizedOndcOnSearch } from './ondc-discovery-persistence';
import type { OndcCatalog, OndcPayload } from './types/ondc-beckn';

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

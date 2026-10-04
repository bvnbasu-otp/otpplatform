/**
 * Server-side /on_search receiver.
 * Signature and correlation run before any observation is retained.
 * An empty ledger rejects the callback. This module does not invent a dispatch row.
 */
import {
  OndcDispatchFailureClass,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  type OndcDiscoveryStore,
  type OndcDispatchLedger,
  type OndcObservationSource as OndcObservationSourceName,
  type OndcRuntimeEnvironment as OndcRuntimeEnvironmentName,
} from '@otp/domain';
import { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import { acceptIssuedOndcOnSearch, type OndcDispatchCallbackResult } from './ondc-discovery-dispatch';
import type { OndcDiscoveryDispatchStore } from './ondc-discovery-dispatch-store';
import type { OndcAck } from './types/ondc-beckn';

export interface OndcOnSearchHttpResult {
  status: number;
  body: OndcAck;
  result: OndcDispatchCallbackResult;
}

export async function handleOndcOnSearchRequest(input: {
  method: string;
  url: string;
  rawBody: string;
  authorization: string | null;
  ledger: OndcDispatchLedger;
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
}): Promise<OndcOnSearchHttpResult> {
  const receiver = new OndcBapReceiver();
  const empty = {
    identityCount: input.store?.identities.size ?? 0,
    invitations: 0,
    quotes: 0,
    awards: 0,
    purchaseOrders: 0,
    payments: 0,
  };
  const closed = (
    status: number,
    reason: string,
    failure: (typeof OndcDispatchFailureClass)[keyof typeof OndcDispatchFailureClass] = OndcDispatchFailureClass.CALLBACK_VERIFICATION_FAILURE,
  ): OndcOnSearchHttpResult => ({
    status,
    body: receiver.createNack('PROTOCOL_ERROR', 'ONDC callback was rejected'),
    result: {
      ok: false,
      replay: false,
      stale: false,
      failure,
      reason,
      protocol: receiver.createNack('PROTOCOL_ERROR', 'ONDC callback was rejected'),
      persistence: 'REJECTED',
      realNetworkVerified: false,
      ...empty,
    },
  });

  if (input.method.toUpperCase() !== 'POST') return closed(405, 'method_not_allowed');
  if (!isOnSearchPath(input.url)) return closed(404, 'wrong_operation');
  if (!callbackEnvironmentAllowed(input.processingEnvironment, input.processingSource)) {
    return closed(200, 'environment_rejected', OndcDispatchFailureClass.PRODUCTION_REFUSED);
  }
  if (!input.rawBody.trim()) return closed(400, 'malformed_callback');

  const registry = input.processingEnvironment === OndcRuntimeEnvironment.PRE_PROD ? input.registry : undefined;
  const result = await acceptIssuedOndcOnSearch({
    ledger: input.ledger,
    authHeader: input.authorization,
    body: input.rawBody,
    receiver,
    ...(input.resolvePublicKey ? { resolvePublicKey: input.resolvePublicKey } : {}),
    processingEnvironment: input.processingEnvironment,
    processingSource: input.processingSource,
    store: input.store,
    dispatchStore: input.dispatchStore,
    registry,
  });
  return {
    status: 200,
    body: result.protocol,
    result,
  };
}

function callbackEnvironmentAllowed(
  environment: OndcRuntimeEnvironmentName,
  source: OndcObservationSourceName,
): boolean {
  if (environment === OndcRuntimeEnvironment.PRODUCTION) return false;
  if (environment === OndcRuntimeEnvironment.PRE_PROD) return source === OndcObservationSource.REAL_NETWORK;
  if (environment === OndcRuntimeEnvironment.LOCAL || environment === OndcRuntimeEnvironment.CI) {
    return source === OndcObservationSource.MOCK;
  }
  return false;
}

function isOnSearchPath(value: string): boolean {
  try {
    const path = new URL(value, 'https://ondc-callback.local').pathname.replace(/\/+$/, '');
    return path.endsWith('/on_search');
  } catch {
    return false;
  }
}

/**
 * Public /on_search ingress.
 * verify_jwt is off because a BPP cannot present a Supabase session.
 * ONDC signature is the auth. Correlation is the 00231 dispatch row, read
 * with the service role after the signature verifies. An empty in-memory
 * ledger is not the authority. Do not log Authorization or signing material.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  createOndcDispatchLedger,
  isProductionOndcHost,
  resolveOndcEnvironmentGate,
} from '@otp/domain';
import { handleOndcOnSearchRequest } from '../../../packages/services/src/ondc/ondc-on-search-endpoint.ts';
import { readOndcEnvironmentConfig } from '../../../packages/services/src/ondc/ondc-environment-config.ts';
import { createRpcOndcDiscoveryDispatchStore } from '../../../packages/services/src/ondc/ondc-discovery-dispatch-store.ts';
import type { OndcAck } from '../../../packages/services/src/ondc/types/ondc-beckn.ts';

const CONFIG_NAMES = [
  'ONDC_ENVIRONMENT',
  'ONDC_PROVIDER_ENABLED',
  'ONDC_NETWORK_ENABLED',
  'ONDC_REQUEST_TIMEOUT_MS',
  'ONDC_REQUEST_MAX_RETRIES',
  'ONDC_PRODUCTION_ENABLED',
  'ONDC_PREPROD_GATEWAY_URL',
  'ONDC_PREPROD_SUBSCRIBER_ID',
  'ONDC_PREPROD_UNIQUE_KEY_ID',
  'ONDC_PREPROD_SIGNING_PRIVATE_KEY',
  'ONDC_PREPROD_REGISTRY_URL',
  'ONDC_PREPROD_CALLBACK_URL',
  'ONDC_PRODUCTION_GATEWAY_URL',
  'ONDC_PRODUCTION_SUBSCRIBER_ID',
  'ONDC_PRODUCTION_UNIQUE_KEY_ID',
  'ONDC_PRODUCTION_SIGNING_PRIVATE_KEY',
  'ONDC_PRODUCTION_REGISTRY_URL',
  'ONDC_PRODUCTION_CALLBACK_URL',
] as const;

function json(status: number, body: OndcAck): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nack(): OndcAck {
  return {
    message: { ack: { status: 'NACK' } },
    error: { code: 'PROTOCOL_ERROR', message: 'ONDC callback was rejected' },
  };
}

function serviceDispatchStore() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return createRpcOndcDiscoveryDispatchStore({
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
  });
}

function readNamedEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const name of CONFIG_NAMES) out[name] = Deno.env.get(name) ?? undefined;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    const env = readNamedEnv();
    const decision = resolveOndcEnvironmentGate(readOndcEnvironmentConfig(env));
    const preprod = decision.environment === OndcRuntimeEnvironment.PRE_PROD && decision.realClientAllowed && decision.client
      ? decision.client
      : null;
    if (!preprod || isProductionOndcHost(preprod.registryUrl) || isProductionOndcHost(preprod.gatewayUrl) || isProductionOndcHost(preprod.callbackUrl)) {
      const status = req.method === 'POST' ? 200 : 405;
      return json(status, nack());
    }
    const dispatchStore = serviceDispatchStore();
    if (!dispatchStore) return json(req.method === 'POST' ? 200 : 405, nack());
    const rawBody = await req.text();
    const handled = await handleOndcOnSearchRequest({
      method: req.method,
      url: req.url,
      rawBody,
      authorization: req.headers.get('Authorization'),
      ledger: createOndcDispatchLedger(),
      dispatchStore,
      processingEnvironment: OndcRuntimeEnvironment.PRE_PROD,
      processingSource: OndcObservationSource.REAL_NETWORK,
      registry: {
        registryUrl: preprod.registryUrl,
        subscriberId: preprod.subscriberId,
        uniqueKeyId: preprod.uniqueKeyId,
        signingPrivateKey: preprod.signingPrivateKey,
        timeoutMs: decision.timeoutMs,
      },
    });
    return json(handled.status, handled.body);
  } catch {
    return json(200, nack());
  }
});

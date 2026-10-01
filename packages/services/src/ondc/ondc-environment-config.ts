/**
 * Maps process env names into the domain gate.
 * Reads only slot-specific names. Does not print values.
 */
import {
  resolveOndcEnvironmentGate,
  type OndcEnvironmentConfigInput,
  type OndcEnvironmentDecision,
} from '@otp/domain';

export function readOndcEnvironmentConfig(env: NodeJS.ProcessEnv | undefined): OndcEnvironmentConfigInput {
  const source = env ?? {};
  return {
    environmentRaw: source.ONDC_ENVIRONMENT,
    providerEnabled: source.ONDC_PROVIDER_ENABLED,
    networkEnabled: source.ONDC_NETWORK_ENABLED,
    timeoutMs: source.ONDC_REQUEST_TIMEOUT_MS,
    maxRetries: source.ONDC_REQUEST_MAX_RETRIES,
    productionEnabled: source.ONDC_PRODUCTION_ENABLED,
    preprod: {
      gatewayUrl: source.ONDC_PREPROD_GATEWAY_URL,
      subscriberId: source.ONDC_PREPROD_SUBSCRIBER_ID,
      uniqueKeyId: source.ONDC_PREPROD_UNIQUE_KEY_ID,
      signingPrivateKey: source.ONDC_PREPROD_SIGNING_PRIVATE_KEY,
      registryUrl: source.ONDC_PREPROD_REGISTRY_URL,
      callbackUrl: source.ONDC_PREPROD_CALLBACK_URL,
    },
    production: {
      gatewayUrl: source.ONDC_PRODUCTION_GATEWAY_URL,
      subscriberId: source.ONDC_PRODUCTION_SUBSCRIBER_ID,
      uniqueKeyId: source.ONDC_PRODUCTION_UNIQUE_KEY_ID,
      signingPrivateKey: source.ONDC_PRODUCTION_SIGNING_PRIVATE_KEY,
      registryUrl: source.ONDC_PRODUCTION_REGISTRY_URL,
      callbackUrl: source.ONDC_PRODUCTION_CALLBACK_URL,
    },
  };
}

export function resolveOndcEnvironmentFromEnv(env: NodeJS.ProcessEnv | undefined): OndcEnvironmentDecision {
  return resolveOndcEnvironmentGate(readOndcEnvironmentConfig(env));
}

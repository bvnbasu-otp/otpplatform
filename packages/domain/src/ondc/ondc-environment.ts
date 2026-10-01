/**
 * Server-side ONDC runtime gate.
 * Config names only. This module does not read process.env and does not log values.
 * LOCAL and CI never open a network client.
 * PRE_PROD opens a client only when the pre-production slot is complete.
 * PRODUCTION stays fail-closed unless ONDC_PRODUCTION_ENABLED is exactly "true"
 * and the production slot is complete. That recognition does not fall back to
 * the pre-production slot, and the factory must still leave the adapter non-live.
 * ONDC_ENABLED is not an input to this gate.
 */

export const OndcRuntimeEnvironment = {
  LOCAL: 'LOCAL',
  CI: 'CI',
  PRE_PROD: 'PRE_PROD',
  PRODUCTION: 'PRODUCTION',
} as const;

export type OndcRuntimeEnvironment =
  (typeof OndcRuntimeEnvironment)[keyof typeof OndcRuntimeEnvironment];

export const OndcObservationSource = {
  LOCAL_FIXTURE: 'LOCAL_FIXTURE',
  MOCK: 'MOCK',
  REAL_NETWORK: 'REAL_NETWORK',
} as const;

export type OndcObservationSource =
  (typeof OndcObservationSource)[keyof typeof OndcObservationSource];

export const ONDC_GATEWAY_CLIENT_ACTIONS = ['search', 'select', 'init', 'confirm', 'status'] as const;

/** Actions this phase executes on the persistence path. Client methods above stay ungated side-effect free until an explicit pre-prod search. */
export const ONDC_03_EXECUTED_PROTOCOL_ACTIONS = ['search', 'on_search'] as const;

export const ONDC_PREPROD_REQUIRED_CONFIG_NAMES = [
  'ONDC_PREPROD_GATEWAY_URL',
  'ONDC_PREPROD_SUBSCRIBER_ID',
  'ONDC_PREPROD_UNIQUE_KEY_ID',
  'ONDC_PREPROD_SIGNING_PRIVATE_KEY',
  'ONDC_PREPROD_REGISTRY_URL',
  'ONDC_PREPROD_CALLBACK_URL',
] as const;

export const ONDC_PRODUCTION_REQUIRED_CONFIG_NAMES = [
  'ONDC_PRODUCTION_ENABLED',
  'ONDC_PRODUCTION_GATEWAY_URL',
  'ONDC_PRODUCTION_SUBSCRIBER_ID',
  'ONDC_PRODUCTION_UNIQUE_KEY_ID',
  'ONDC_PRODUCTION_SIGNING_PRIVATE_KEY',
  'ONDC_PRODUCTION_REGISTRY_URL',
  'ONDC_PRODUCTION_CALLBACK_URL',
] as const;

export const ONDC_RUNTIME_CONFIG_NAMES = [
  'ONDC_ENVIRONMENT',
  'ONDC_PROVIDER_ENABLED',
  'ONDC_NETWORK_ENABLED',
  'ONDC_REQUEST_TIMEOUT_MS',
  'ONDC_REQUEST_MAX_RETRIES',
] as const;

/** Legacy single-slot names. They must not satisfy pre-prod or production. */
export const ONDC_LEGACY_SHARED_SLOT_NAMES = [
  'ONDC_ENABLED',
  'ONDC_SUBSCRIBER_ID',
  'ONDC_UNIQUE_KEY_ID',
  'ONDC_BAP_URI',
  'ONDC_SIGNING_PRIVATE_KEY_PEM',
  'ONDC_GATEWAY_URL',
] as const;

export interface OndcSlotConfigInput {
  gatewayUrl?: string | null;
  subscriberId?: string | null;
  uniqueKeyId?: string | null;
  signingPrivateKey?: string | null;
  registryUrl?: string | null;
  callbackUrl?: string | null;
}

export interface OndcEnvironmentConfigInput {
  environmentRaw?: string | null;
  providerEnabled?: string | null;
  networkEnabled?: string | null;
  timeoutMs?: string | null;
  maxRetries?: string | null;
  productionEnabled?: string | null;
  preprod: OndcSlotConfigInput;
  production: OndcSlotConfigInput;
}

export interface OndcClientMaterial {
  subscriberId: string;
  uniqueKeyId: string;
  signingPrivateKey: string;
  gatewayUrl: string;
  registryUrl: string;
  callbackUrl: string;
}

export interface OndcEnvironmentDecision {
  environment: OndcRuntimeEnvironment;
  recognizedEnvironment: boolean;
  providerEnabled: boolean;
  networkEnabled: boolean;
  realClientAllowed: boolean;
  /** True only when PRODUCTION was explicitly activated and its own slot is complete. */
  productionActivationSatisfied: boolean;
  credentialSlot: 'NONE' | 'PRE_PROD' | 'PRODUCTION';
  observationSource: OndcObservationSource | null;
  missingConfigNames: readonly string[];
  error: string | null;
  timeoutMs: number;
  maxRetries: number;
  client?: OndcClientMaterial;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 0;

export function parseOndcRuntimeEnvironment(raw?: string | null): {
  environment: OndcRuntimeEnvironment;
  recognized: boolean;
} {
  if (raw == null || raw.trim() === '') {
    return { environment: OndcRuntimeEnvironment.LOCAL, recognized: true };
  }
  const normalized = raw.trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'LOCAL' || normalized === 'MOCK') {
    return { environment: OndcRuntimeEnvironment.LOCAL, recognized: true };
  }
  if (normalized === 'CI') return { environment: OndcRuntimeEnvironment.CI, recognized: true };
  if (
    normalized === 'PRE_PROD' ||
    normalized === 'PREPROD' ||
    normalized === 'PRE_PRODUCTION' ||
    normalized === 'SANDBOX' ||
    normalized === 'STAGING'
  ) {
    return { environment: OndcRuntimeEnvironment.PRE_PROD, recognized: true };
  }
  if (normalized === 'PRODUCTION' || normalized === 'PROD') {
    return { environment: OndcRuntimeEnvironment.PRODUCTION, recognized: true };
  }
  return { environment: OndcRuntimeEnvironment.LOCAL, recognized: false };
}

export function ondcProvenanceAllowed(
  source: OndcObservationSource,
  environment: OndcRuntimeEnvironment,
): boolean {
  if (source === OndcObservationSource.REAL_NETWORK) {
    return environment === OndcRuntimeEnvironment.PRE_PROD || environment === OndcRuntimeEnvironment.PRODUCTION;
  }
  return environment === OndcRuntimeEnvironment.LOCAL || environment === OndcRuntimeEnvironment.CI;
}

export function toPublicOndcEnvironmentDecision(
  decision: OndcEnvironmentDecision,
): Omit<OndcEnvironmentDecision, 'client'> {
  return {
    environment: decision.environment,
    recognizedEnvironment: decision.recognizedEnvironment,
    providerEnabled: decision.providerEnabled,
    networkEnabled: decision.networkEnabled,
    realClientAllowed: decision.realClientAllowed,
    productionActivationSatisfied: decision.productionActivationSatisfied,
    credentialSlot: decision.credentialSlot,
    observationSource: decision.observationSource,
    missingConfigNames: decision.missingConfigNames,
    error: decision.error,
    timeoutMs: decision.timeoutMs,
    maxRetries: decision.maxRetries,
  };
}

export function resolveOndcEnvironmentGate(input: OndcEnvironmentConfigInput): OndcEnvironmentDecision {
  const parsed = parseOndcRuntimeEnvironment(input.environmentRaw);
  const providerFlag = flagState(input.providerEnabled);
  const networkFlag = flagState(input.networkEnabled);
  const missing = new Set<string>();
  if (!parsed.recognized) missing.add('ONDC_ENVIRONMENT');
  if (providerFlag === 'invalid') missing.add('ONDC_PROVIDER_ENABLED');
  if (networkFlag === 'invalid') missing.add('ONDC_NETWORK_ENABLED');

  const timeout = parseBoundedInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 120_000);
  const retries = parseBoundedInt(input.maxRetries, DEFAULT_MAX_RETRIES, 0, 5);
  if (timeout.invalid) missing.add('ONDC_REQUEST_TIMEOUT_MS');
  if (retries.invalid) missing.add('ONDC_REQUEST_MAX_RETRIES');

  const explicitlyDisabled = providerFlag === 'false' || networkFlag === 'false';
  const base = {
    environment: parsed.environment,
    recognizedEnvironment: parsed.recognized,
    timeoutMs: timeout.value,
    maxRetries: retries.value,
    productionActivationSatisfied: false,
  };

  if (!parsed.recognized || providerFlag === 'invalid' || networkFlag === 'invalid') {
    return denied({
      ...base,
      missingConfigNames: [...missing],
      error: 'ONDC environment configuration is invalid',
    });
  }

  if (parsed.environment === OndcRuntimeEnvironment.LOCAL || parsed.environment === OndcRuntimeEnvironment.CI) {
    return {
      ...base,
      providerEnabled: false,
      networkEnabled: false,
      realClientAllowed: false,
      credentialSlot: 'NONE',
      observationSource: OndcObservationSource.MOCK,
      missingConfigNames: [],
      error: null,
    };
  }

  if (parsed.environment === OndcRuntimeEnvironment.PRE_PROD) {
    const slot = readSlot(input.preprod, {
      gatewayUrl: 'ONDC_PREPROD_GATEWAY_URL',
      subscriberId: 'ONDC_PREPROD_SUBSCRIBER_ID',
      uniqueKeyId: 'ONDC_PREPROD_UNIQUE_KEY_ID',
      signingPrivateKey: 'ONDC_PREPROD_SIGNING_PRIVATE_KEY',
      registryUrl: 'ONDC_PREPROD_REGISTRY_URL',
      callbackUrl: 'ONDC_PREPROD_CALLBACK_URL',
    });
    for (const name of slot.missing) missing.add(name);
    if (timeout.invalid || retries.invalid || explicitlyDisabled || slot.material == null) {
      if (explicitlyDisabled && providerFlag === 'false') missing.add('ONDC_PROVIDER_ENABLED');
      if (explicitlyDisabled && networkFlag === 'false') missing.add('ONDC_NETWORK_ENABLED');
      return denied({
        ...base,
        missingConfigNames: [...missing],
        error: `ONDC pre-production configuration is incomplete. Missing: ${[...missing].join(', ')}`,
      });
    }
    return {
      ...base,
      providerEnabled: true,
      networkEnabled: true,
      realClientAllowed: true,
      credentialSlot: 'PRE_PROD',
      observationSource: OndcObservationSource.REAL_NETWORK,
      missingConfigNames: [],
      error: null,
      client: slot.material,
    };
  }

  const activated = flagState(input.productionEnabled) === 'true';
  const productionSlot = readSlot(input.production, {
    gatewayUrl: 'ONDC_PRODUCTION_GATEWAY_URL',
    subscriberId: 'ONDC_PRODUCTION_SUBSCRIBER_ID',
    uniqueKeyId: 'ONDC_PRODUCTION_UNIQUE_KEY_ID',
    signingPrivateKey: 'ONDC_PRODUCTION_SIGNING_PRIVATE_KEY',
    registryUrl: 'ONDC_PRODUCTION_REGISTRY_URL',
    callbackUrl: 'ONDC_PRODUCTION_CALLBACK_URL',
  });
  if (!activated) missing.add('ONDC_PRODUCTION_ENABLED');
  for (const name of productionSlot.missing) missing.add(name);
  const productionReady = activated && productionSlot.material != null && !explicitlyDisabled && !timeout.invalid && !retries.invalid;
  if (explicitlyDisabled && providerFlag === 'false') missing.add('ONDC_PROVIDER_ENABLED');
  if (explicitlyDisabled && networkFlag === 'false') missing.add('ONDC_NETWORK_ENABLED');

  if (!productionReady) {
    return denied({
      ...base,
      environment: OndcRuntimeEnvironment.PRODUCTION,
      missingConfigNames: [...missing],
      error: activated
        ? `ONDC production configuration is incomplete. Missing: ${[...missing].join(', ')}`
        : 'ONDC production is disabled. ONDC_PRODUCTION_ENABLED is not true',
    });
  }

  return {
    ...base,
    environment: OndcRuntimeEnvironment.PRODUCTION,
    providerEnabled: true,
    networkEnabled: true,
    realClientAllowed: true,
    productionActivationSatisfied: true,
    credentialSlot: 'PRODUCTION',
    observationSource: OndcObservationSource.REAL_NETWORK,
    missingConfigNames: [],
    error: null,
    client: productionSlot.material ?? undefined,
  };
}

function denied(input: {
  environment: OndcRuntimeEnvironment;
  recognizedEnvironment: boolean;
  timeoutMs: number;
  maxRetries: number;
  missingConfigNames: readonly string[];
  error: string;
}): OndcEnvironmentDecision {
  return {
    ...input,
    providerEnabled: false,
    networkEnabled: false,
    realClientAllowed: false,
    productionActivationSatisfied: false,
    credentialSlot: 'NONE',
    observationSource: null,
    client: undefined,
  };
}

function readSlot(
  slot: OndcSlotConfigInput,
  names: Record<keyof OndcSlotConfigInput, string>,
): { material: OndcClientMaterial | null; missing: string[] } {
  const missing: string[] = [];
  const gatewayUrl = requireUrl(slot.gatewayUrl, names.gatewayUrl, missing);
  const registryUrl = requireUrl(slot.registryUrl, names.registryUrl, missing);
  const callbackUrl = requireUrl(slot.callbackUrl, names.callbackUrl, missing);
  const subscriberId = requireText(slot.subscriberId, names.subscriberId, missing);
  const uniqueKeyId = requireText(slot.uniqueKeyId, names.uniqueKeyId, missing);
  const signingPrivateKey = requireText(slot.signingPrivateKey, names.signingPrivateKey, missing);
  if (!gatewayUrl || !registryUrl || !callbackUrl || !subscriberId || !uniqueKeyId || !signingPrivateKey) {
    return { material: null, missing };
  }
  return {
    missing,
    material: { gatewayUrl, registryUrl, callbackUrl, subscriberId, uniqueKeyId, signingPrivateKey },
  };
}

function requireText(value: string | null | undefined, name: string, missing: string[]): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    missing.push(name);
    return null;
  }
  return trimmed;
}

function requireUrl(value: string | null | undefined, name: string, missing: string[]): string | null {
  const trimmed = requireText(value, name, missing);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      missing.push(name);
      return null;
    }
    return url.toString();
  } catch {
    missing.push(name);
    return null;
  }
}

function flagState(value: string | null | undefined): 'unset' | 'true' | 'false' | 'invalid' {
  if (value == null || value.trim() === '') return 'unset';
  if (value.trim() === 'true') return 'true';
  if (value.trim() === 'false') return 'false';
  return 'invalid';
}

function parseBoundedInt(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): { value: number; invalid: boolean } {
  if (raw == null || raw.trim() === '') return { value: fallback, invalid: false };
  if (!/^\d+$/.test(raw.trim())) return { value: fallback, invalid: true };
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) return { value: fallback, invalid: true };
  return { value, invalid: false };
}

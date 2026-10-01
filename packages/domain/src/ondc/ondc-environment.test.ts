import { describe, expect, it } from 'vitest';
import {
  ONDC_03_EXECUTED_PROTOCOL_ACTIONS,
  ONDC_GATEWAY_CLIENT_ACTIONS,
  ONDC_LEGACY_SHARED_SLOT_NAMES,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  ondcProvenanceAllowed,
  resolveOndcEnvironmentGate,
  toPublicOndcEnvironmentDecision,
  type OndcEnvironmentConfigInput,
} from './ondc-environment';

const PREPROD_SENTINEL = 'preprod-slot.example.test';
const PRODUCTION_SENTINEL = 'production-slot.example.test';

function slot(prefix: string, subscriberId: string) {
  return {
    gatewayUrl: `https://${prefix}.example.test/gateway`,
    subscriberId,
    uniqueKeyId: `${prefix}-key`,
    signingPrivateKey: `${prefix}-signing-material`,
    registryUrl: `https://${prefix}.example.test/registry`,
    callbackUrl: `https://${prefix}.example.test/callback`,
  };
}

function input(overrides: Partial<OndcEnvironmentConfigInput> = {}): OndcEnvironmentConfigInput {
  return {
    environmentRaw: overrides.environmentRaw,
    providerEnabled: overrides.providerEnabled,
    networkEnabled: overrides.networkEnabled,
    timeoutMs: overrides.timeoutMs,
    maxRetries: overrides.maxRetries,
    productionEnabled: overrides.productionEnabled,
    preprod: overrides.preprod ?? {},
    production: overrides.production ?? {},
  };
}

describe('ONDC environment gate', () => {
  it('keeps local and CI on mocks with no real client', () => {
    for (const environmentRaw of [undefined, 'LOCAL', 'CI', 'MOCK']) {
      const decision = resolveOndcEnvironmentGate(input({ environmentRaw, networkEnabled: 'true', providerEnabled: 'true' }));
      expect(decision.realClientAllowed).toBe(false);
      expect(decision.networkEnabled).toBe(false);
      expect(decision.credentialSlot).toBe('NONE');
      expect(decision.client).toBeUndefined();
      expect(decision.observationSource).toBe(OndcObservationSource.MOCK);
    }
    expect(resolveOndcEnvironmentGate(input({ environmentRaw: 'CI' })).environment).toBe(OndcRuntimeEnvironment.CI);
  });

  it('allows a pre-prod client only when the pre-prod slot is complete', () => {
    const missing = resolveOndcEnvironmentGate(input({ environmentRaw: 'PRE_PROD', production: slot('production', PRODUCTION_SENTINEL) }));
    expect(missing.realClientAllowed).toBe(false);
    expect(missing.client).toBeUndefined();
    expect(missing.missingConfigNames).toEqual(expect.arrayContaining(['ONDC_PREPROD_SUBSCRIBER_ID', 'ONDC_PREPROD_GATEWAY_URL']));
    expect(missing.error).toContain('pre-production');
    expect(missing.credentialSlot).toBe('NONE');

    const ready = resolveOndcEnvironmentGate(
      input({
        environmentRaw: 'SANDBOX',
        preprod: slot('preprod', PREPROD_SENTINEL),
        production: slot('production', PRODUCTION_SENTINEL),
      }),
    );
    expect(ready.environment).toBe(OndcRuntimeEnvironment.PRE_PROD);
    expect(ready.realClientAllowed).toBe(true);
    expect(ready.credentialSlot).toBe('PRE_PROD');
    expect(ready.client?.subscriberId).toBe(PREPROD_SENTINEL);
    expect(ready.client?.subscriberId).not.toBe(PRODUCTION_SENTINEL);
    expect(ready.client?.gatewayUrl).toContain('preprod.example.test');
    expect(ready.client?.gatewayUrl).not.toContain('production.example.test');
    expect(ready.observationSource).toBe(OndcObservationSource.REAL_NETWORK);
    expect(toPublicOndcEnvironmentDecision(ready)).not.toHaveProperty('client');
  });

  it('does not let a shared legacy slot or ONDC_ENABLED open pre-prod', () => {
    const decision = resolveOndcEnvironmentGate(input({ environmentRaw: 'PREPROD' }));
    expect(decision.realClientAllowed).toBe(false);
    expect(ONDC_LEGACY_SHARED_SLOT_NAMES).toContain('ONDC_ENABLED');
    expect(decision.missingConfigNames.join(' ')).not.toContain('ONDC_SUBSCRIBER_ID');
  });

  it('fails production closed unless explicit activation and the production slot are both present', () => {
    const disabled = resolveOndcEnvironmentGate(
      input({
        environmentRaw: 'PRODUCTION',
        preprod: slot('preprod', PREPROD_SENTINEL),
        production: slot('production', PRODUCTION_SENTINEL),
      }),
    );
    expect(disabled.realClientAllowed).toBe(false);
    expect(disabled.productionActivationSatisfied).toBe(false);
    expect(disabled.client).toBeUndefined();
    expect(disabled.error).toContain('disabled');
    expect(disabled.missingConfigNames).toContain('ONDC_PRODUCTION_ENABLED');

    const activated = resolveOndcEnvironmentGate(
      input({
        environmentRaw: 'PROD',
        productionEnabled: 'true',
        preprod: slot('preprod', PREPROD_SENTINEL),
        production: slot('production', PRODUCTION_SENTINEL),
      }),
    );
    expect(activated.productionActivationSatisfied).toBe(true);
    expect(activated.credentialSlot).toBe('PRODUCTION');
    expect(activated.client?.subscriberId).toBe(PRODUCTION_SENTINEL);
    expect(activated.client?.subscriberId).not.toBe(PREPROD_SENTINEL);
    expect(activated.client?.signingPrivateKey).toBe('production-signing-material');
    expect(activated.client?.signingPrivateKey).not.toBe('preprod-signing-material');
  });

  it('rejects mock provenance labeled as a real network', () => {
    expect(ondcProvenanceAllowed(OndcObservationSource.MOCK, OndcRuntimeEnvironment.LOCAL)).toBe(true);
    expect(ondcProvenanceAllowed(OndcObservationSource.LOCAL_FIXTURE, OndcRuntimeEnvironment.CI)).toBe(true);
    expect(ondcProvenanceAllowed(OndcObservationSource.MOCK, OndcRuntimeEnvironment.PRE_PROD)).toBe(false);
    expect(ondcProvenanceAllowed(OndcObservationSource.REAL_NETWORK, OndcRuntimeEnvironment.LOCAL)).toBe(false);
    expect(ondcProvenanceAllowed(OndcObservationSource.REAL_NETWORK, OndcRuntimeEnvironment.PRE_PROD)).toBe(true);
    expect(ONDC_03_EXECUTED_PROTOCOL_ACTIONS).toEqual(['search', 'on_search']);
    expect(ONDC_GATEWAY_CLIENT_ACTIONS).toEqual(['search', 'select', 'init', 'confirm', 'status']);
  });
});

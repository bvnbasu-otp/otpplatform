import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  createOndcDispatchLedger,
  isProductionOndcHost,
  resolveOndcEnvironmentGate,
} from './ondc-on-search-domain.ts';

describe('ondc-on-search edge entry', () => {
  it('exposes the callback symbols without the domain barrel', () => {
    const source = readFileSync(new URL('./ondc-on-search-domain.ts', import.meta.url), 'utf8');
    const edge = readFileSync(new URL('../../../../supabase/functions/ondc-on-search/index.ts', import.meta.url), 'utf8');
    const map = readFileSync(new URL('../../../../supabase/functions/ondc-on-search/deno.json', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*\/index\.ts['"]/);
    expect(edge).not.toContain('packages/domain/src/index.ts');
    expect(edge).not.toContain('prod.gateway.ondc.org');
    expect(edge).not.toContain('prod.registry.ondc.org');
    expect(map).toContain('edge/ondc-on-search-domain.ts');
    expect(createOndcDispatchLedger().byTransactionId.size).toBe(0);
    expect(isProductionOndcHost('https://prod.registry.ondc.org/v2.0/lookup')).toBe(true);
    expect(OndcRuntimeEnvironment.PRE_PROD).toBe('PRE_PROD');
    expect(OndcObservationSource.MOCK).toBe('MOCK');
    expect(resolveOndcEnvironmentGate({
      environmentRaw: 'PRODUCTION',
      productionEnabled: 'true',
      preprod: {},
      production: {},
    }).realClientAllowed).toBe(false);
  });
});
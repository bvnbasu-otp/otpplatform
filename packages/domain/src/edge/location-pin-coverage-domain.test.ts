import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SupplierNetwork,
  TruthfulProviderStatus,
  GisExecutionMode,
  getUtcDayKey,
  getUtcMonthKey,
  buildGooglePlacesTextQuery,
  generateCrockfordAlias,
  CapabilityEvidenceTier,
  SupplierTruthfulVerificationStage,
} from './location-pin-coverage-domain';

describe('location-pin-coverage-domain edge entry', () => {
  it('re-exports symbols required by the location-pin-coverage Edge bundle', () => {
    expect(SupplierNetwork.GOOGLE_PLACES).toBe('GOOGLE_PLACES');
    expect(TruthfulProviderStatus.LIVE_ACTIVE).toBe('LIVE_ACTIVE');
    expect(GisExecutionMode.OFFLINE_PROVIDER_NEUTRAL).toBe('OFFLINE_PROVIDER_NEUTRAL');
    expect(getUtcDayKey(new Date('2026-09-26T18:30:00.000Z'))).toBe('2026-09-26');
    expect(getUtcMonthKey(new Date('2026-09-26T18:30:00.000Z'))).toBe('2026-09');
    expect(buildGooglePlacesTextQuery('electrical suppliers', 'Bengaluru', '560048')).toContain('560048');
    expect(generateCrockfordAlias('seed', 4)).toHaveLength(4);
    expect(CapabilityEvidenceTier.PLATFORM_VERIFIED).toBe('PLATFORM_VERIFIED');
    expect(SupplierTruthfulVerificationStage.DISCOVERED_IN_AREA).toBe('DISCOVERED_IN_AREA');
  });

  it('preserves explicit .ts extensions for Deno runtime bundling without barrel imports', () => {
    const source = readFileSync(new URL('./location-pin-coverage-domain.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*\/index(?:\.ts)?['"]/);
    expect(source).toMatch(/from '\.\.\/enums\/supplier-network\.ts'/);
    expect(source).toMatch(/from '\.\.\/enums\/provider-execution\.ts'/);
    expect(source).toMatch(/from '\.\.\/gis\/location-intelligence-port\.ts'/);
    expect(source).toMatch(/from '\.\.\/gis\/google-places-quota-window\.ts'/);
    expect(source).toMatch(/from '\.\.\/gis\/google-places-category-search-terms\.ts'/);
    expect(source).toMatch(/from '\.\.\/types\/supplier-network-engine\.ts'/);
    expect(source).toMatch(/from '\.\.\/types\/supplier-network-refresh\.ts'/);
  });
});


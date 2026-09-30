import { describe, expect, it } from 'vitest';
import {
  SupplierNetwork,
  TruthfulProviderStatus,
  GisExecutionMode,
  getUtcDayKey,
  getUtcMonthKey,
  buildGooglePlacesTextQuery,
  generateCrockfordAlias,
  SupplierTruthfulVerificationStage,
} from './location-pin-coverage-domain.ts';

describe('location-pin-coverage-domain edge entry', () => {
  it('re-exports symbols required by the location-pin-coverage Edge bundle', () => {
    expect(SupplierNetwork.GOOGLE_PLACES).toBe('GOOGLE_PLACES');
    expect(TruthfulProviderStatus.LIVE_ACTIVE).toBe('LIVE_ACTIVE');
    expect(GisExecutionMode.OFFLINE_PROVIDER_NEUTRAL).toBe('OFFLINE_PROVIDER_NEUTRAL');
    expect(getUtcDayKey(new Date('2026-09-26T18:30:00.000Z'))).toBe('2026-09-26');
    expect(getUtcMonthKey(new Date('2026-09-26T18:30:00.000Z'))).toBe('2026-09');
    expect(buildGooglePlacesTextQuery('electrical suppliers', 'Bengaluru', '560048')).toContain('560048');
    expect(generateCrockfordAlias('seed', 4)).toHaveLength(4);
    expect(SupplierTruthfulVerificationStage.DISCOVERED_IN_AREA).toBe('DISCOVERED_IN_AREA');
  });
});

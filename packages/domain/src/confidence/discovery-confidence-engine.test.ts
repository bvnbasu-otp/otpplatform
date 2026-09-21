import { describe, expect, it } from 'vitest';
import {
  DynamicDiscoveryConfidenceEngine,
} from './discovery-confidence-engine';
import {
  DiscoveryVerificationLevel,
  type NormalizedSupplierCandidate,
  SupplierNetwork,
  TruthfulProviderStatus,
} from '../index';

describe('DynamicDiscoveryConfidenceEngine', () => {
  it('calculates comprehensive 6-factor score for fully verified local candidate', () => {
    const assessment = DynamicDiscoveryConfidenceEngine.calculateConfidence({
      category: 'FASTENERS',
      matchedCategories: ['FASTENERS', 'HARDWARE'],
      capacityOk: true,
      capacityHeadroomRatio: 0.35,
      distanceKm: 12,
      calculationMethod: 'HAVERSINE_COORDINATES',
      isLocal: true,
      verificationLevel: DiscoveryVerificationLevel.PLATFORM_VERIFIED,
      discoveredNetworkCount: 3,
      hasStructuredSpecsMatch: true,
      responseDurationMs: 150,
    });

    expect(assessment.overallConfidenceScore).toBeGreaterThanOrEqual(90);
    expect(assessment.factors.capabilityScore).toBe(25);
    expect(assessment.factors.capacityScore).toBe(15);
    expect(assessment.factors.geographicScore).toBe(25);
    expect(assessment.factors.verificationScore).toBe(20);
    expect(assessment.factors.consensusScore).toBe(10);
    expect(assessment.factors.freshnessScore).toBe(5);
    expect(assessment.isMultiNetworkVerified).toBe(true);
    expect(assessment.recommendedForInvitation).toBe(true);
  });

  it('calculates baseline score for unverified distant candidate with neutral defaults', () => {
    const assessment = DynamicDiscoveryConfidenceEngine.calculateConfidence({
      category: 'ELECTRONICS',
      matchedCategories: ['GENERAL_PARTS'],
      capacityOk: undefined,
      calculationMethod: 'UNDECLARED_NEUTRAL',
      isLocal: false,
      verificationLevel: DiscoveryVerificationLevel.UNVERIFIED,
      discoveredNetworkCount: 1,
    });

    expect(assessment.overallConfidenceScore).toBeLessThan(70);
    expect(assessment.factors.capabilityScore).toBe(12);
    expect(assessment.factors.capacityScore).toBe(7);
    expect(assessment.factors.geographicScore).toBe(10);
    expect(assessment.factors.verificationScore).toBe(4);
    expect(assessment.factors.consensusScore).toBe(3);
  });

  it('evaluates candidate directly from NormalizedSupplierCandidate', () => {
    const candidate: NormalizedSupplierCandidate = {
      candidateId: 'cand-test-01',
      anonymousLabel: 'Supplier 7X9K',
      matchScore: 88,
      confidenceScore: 0,
      matchReasons: ['category_match', 'location_match'],
      capabilityMatch: {
        isMatch: true,
        matchedCategories: ['VALVES'],
        capacityOk: true,
        capacityHeadroomRatio: 0.25,
      },
      locationMatch: {
        isLocal: true,
        serviceAreaMatch: true,
        distanceKm: 8,
        calculationMethod: 'POSTAL_PIN_EXACT',
      },
      provenance: {
        primaryNetwork: SupplierNetwork.LOCAL_REGISTRY,
        discoveredNetworks: [SupplierNetwork.LOCAL_REGISTRY, SupplierNetwork.DIRECT],
        discoveredAt: new Date().toISOString(),
        verified: true,
        truthfulStatus: TruthfulProviderStatus.LIVE_ACTIVE,
      },
      flags: {
        canReceiveRfq: true,
        canSubmitQuote: true,
        isVerifiedActive: true,
      },
    };

    const assessment = DynamicDiscoveryConfidenceEngine.assessCandidate(candidate, 'VALVES');
    expect(assessment.overallConfidenceScore).toBeGreaterThanOrEqual(80);
    expect(assessment.isMultiNetworkVerified).toBe(true);
  });
});

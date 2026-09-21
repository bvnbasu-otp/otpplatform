import {
  DiscoveryVerificationLevel,
  type DiscoveryConfidenceAssessment,
  type ConfidenceFactorBreakdown,
  type NormalizedSupplierCandidate,
} from '../types/supplier-network-engine';

export interface ConfidenceCalculationParams {
  category: string;
  matchedCategories?: string[];
  capacityOk?: boolean;
  capacityHeadroomRatio?: number;
  distanceKm?: number;
  calculationMethod?: string;
  isLocal?: boolean;
  verificationLevel?: DiscoveryVerificationLevel;
  discoveredNetworkCount?: number;
  matchReasons?: string[];
  hasStructuredSpecsMatch?: boolean;
  responseDurationMs?: number;
}

/**
 * Dynamic Discovery Confidence Engine.
 * Computes evidence-based confidence score (0-100) along 6 weighted dimensions:
 * 1. Capability match depth (0-25)
 * 2. Capacity headroom evidence (0-15)
 * 3. Geographic distance precision (0-25)
 * 4. Verification credential level (0-20)
 * 5. Multi-provider consensus agreement (0-10)
 * 6. Freshness & response completeness (0-5)
 *
 * STRICT FIREWALL INVARIANT:
 * Discovery confidence is purely for candidate discovery reliability.
 * It NEVER affects procurement evaluation scores, committee voting, or award decisions.
 */
export class DynamicDiscoveryConfidenceEngine {
  /**
   * Assess confidence for a candidate given discovery params.
   */
  public static calculateConfidence(
    params: ConfidenceCalculationParams,
  ): DiscoveryConfidenceAssessment {
    const explanations: string[] = [];

    // 1. Capability Match Depth (0-25)
    let capabilityScore = 0;
    const matchedCategories = params.matchedCategories ?? [];
    const targetCatLower = params.category.trim().toLowerCase();
    const hasExactCategoryMatch = matchedCategories.some(
      (c) => c.trim().toLowerCase() === targetCatLower,
    );

    if (hasExactCategoryMatch) {
      capabilityScore += 20;
      explanations.push('Exact category taxonomy match (+20)');
    } else if (matchedCategories.length > 0) {
      capabilityScore += 12;
      explanations.push('Related/broader category match (+12)');
    } else {
      capabilityScore += 5;
      explanations.push('Partial keyword match (+5)');
    }

    if (params.hasStructuredSpecsMatch) {
      capabilityScore += 5;
      explanations.push('Structured specification alignment (+5)');
    }
    capabilityScore = Math.min(25, capabilityScore);

    // 2. Capacity Headroom Evidence (0-15)
    let capacityScore = 0;
    if (params.capacityOk === true) {
      capacityScore += 10;
      explanations.push('Declared operational capacity verified (+10)');
      if (
        params.capacityHeadroomRatio !== undefined &&
        params.capacityHeadroomRatio >= 0.2
      ) {
        capacityScore += 5;
        explanations.push('Sufficient headroom ratio >= 20% (+5)');
      }
    } else if (params.capacityOk === false) {
      capacityScore = 2;
      explanations.push('Constrained capacity headroom (+2)');
    } else {
      // Neutral undeclared
      capacityScore = 7;
      explanations.push('Standard undeclared capacity (+7)');
    }
    capacityScore = Math.min(15, capacityScore);

    // 3. Geographic Distance Precision (0-25)
    let geographicScore = 0;
    const method = params.calculationMethod;
    if (method === 'HAVERSINE_COORDINATES') {
      geographicScore = 25;
      explanations.push('Precise GPS coordinate calculation (+25)');
    } else if (method === 'POSTAL_PIN_EXACT') {
      geographicScore = 20;
      explanations.push('Exact postal PIN code match (+20)');
    } else if (method === 'CITY_MATCH') {
      geographicScore = 15;
      explanations.push('Commercial city match (+15)');
    } else if (method === 'UNDECLARED_NEUTRAL') {
      geographicScore = 10;
      explanations.push('Neutral geographic scope (+10)');
    } else {
      geographicScore = 5;
      explanations.push('Fallback regional estimate (+5)');
    }

    // 4. Verification Credential Level (0-20)
    let verificationScore = 0;
    const vLevel = params.verificationLevel ?? DiscoveryVerificationLevel.UNVERIFIED;
    switch (vLevel) {
      case DiscoveryVerificationLevel.PLATFORM_VERIFIED:
        verificationScore = 20;
        explanations.push('Direct platform credential verification (+20)');
        break;
      case DiscoveryVerificationLevel.NETWORK_VERIFIED:
        verificationScore = 16;
        explanations.push('Network registry verified badge (+16)');
        break;
      case DiscoveryVerificationLevel.CHAMBER_ATTESTED:
        verificationScore = 12;
        explanations.push('Industry chamber / association attestation (+12)');
        break;
      case DiscoveryVerificationLevel.SELF_ATTESTED:
        verificationScore = 8;
        explanations.push('Self-attested vendor registration (+8)');
        break;
      case DiscoveryVerificationLevel.UNVERIFIED:
      default:
        verificationScore = 4;
        explanations.push('Unverified external candidate (+4)');
        break;
    }

    // 5. Multi-Provider Consensus Agreement (0-10)
    let consensusScore = 0;
    const netCount = params.discoveredNetworkCount ?? 1;
    if (netCount >= 3) {
      consensusScore = 10;
      explanations.push('High multi-network consensus agreement (3+ networks) (+10)');
    } else if (netCount === 2) {
      consensusScore = 7;
      explanations.push('Dual-network cross-validation consensus (+7)');
    } else {
      consensusScore = 3;
      explanations.push('Single network discovery provenance (+3)');
    }

    // 6. Freshness & Response Completeness (0-5)
    let freshnessScore = 5;
    if (params.responseDurationMs !== undefined && params.responseDurationMs > 3000) {
      freshnessScore = 3;
      explanations.push('Degraded response latency (+3)');
    } else {
      explanations.push('Real-time query response (+5)');
    }

    const totalScore = Math.min(
      100,
      capabilityScore +
        capacityScore +
        geographicScore +
        verificationScore +
        consensusScore +
        freshnessScore,
    );

    const breakdown: ConfidenceFactorBreakdown = {
      capabilityScore,
      capacityScore,
      geographicScore,
      verificationScore,
      consensusScore,
      freshnessScore,
      factorExplanations: explanations,
    };

    return {
      overallConfidenceScore: totalScore,
      factors: breakdown,
      verificationLevel: vLevel,
      consensusProviderCount: netCount,
      isMultiNetworkVerified: netCount > 1,
      recommendedForInvitation: totalScore >= 60,
    };
  }

  /**
   * Compute confidence assessment directly from a normalized supplier candidate.
   */
  public static assessCandidate(
    candidate: NormalizedSupplierCandidate,
    targetCategory: string,
  ): DiscoveryConfidenceAssessment {
    let vLevel: DiscoveryVerificationLevel = DiscoveryVerificationLevel.UNVERIFIED;
    if (candidate.provenance.verified) {
      if (candidate.provenance.primaryNetwork === 'LOCAL_REGISTRY') {
        vLevel = DiscoveryVerificationLevel.PLATFORM_VERIFIED;
      } else {
        vLevel = DiscoveryVerificationLevel.NETWORK_VERIFIED;
      }
    } else if (candidate.provenance.primaryNetwork === 'ASSOCIATION' || candidate.provenance.primaryNetwork === 'BNI') {
      vLevel = DiscoveryVerificationLevel.CHAMBER_ATTESTED;
    } else {
      vLevel = DiscoveryVerificationLevel.SELF_ATTESTED;
    }

    return DynamicDiscoveryConfidenceEngine.calculateConfidence({
      category: targetCategory,
      matchedCategories: candidate.capabilityMatch.matchedCategories,
      capacityOk: candidate.capabilityMatch.capacityOk,
      capacityHeadroomRatio: candidate.capabilityMatch.capacityHeadroomRatio,
      distanceKm: candidate.locationMatch.distanceKm,
      calculationMethod: candidate.locationMatch.calculationMethod,
      isLocal: candidate.locationMatch.isLocal,
      verificationLevel: vLevel,
      discoveredNetworkCount: candidate.provenance.discoveredNetworks?.length ?? 1,
      matchReasons: candidate.matchReasons,
    });
  }
}

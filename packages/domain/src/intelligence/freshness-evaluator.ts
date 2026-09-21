import {
  CandidateFreshnessStatus,
  type CandidateFreshnessAssessment,
} from '../types/supplier-network-engine';

export const STALENESS_THRESHOLD_DAYS = 180;
const MAX_CLOCK_SKEW_MS = 300 * 1000; // 5 minutes tolerance

/**
 * Freshness & Staleness Intelligence Evaluator (Phase SN.3).
 *
 * Implements:
 * 1. Deterministic 180-Day Staleness Threshold:
 *    - Profile verified <= 180 days ago: PROFILE_FRESH (penalty = 0)
 *    - Profile verified > 180 days ago: PROFILE_STALE (penalty = 10, reason code STALENESS_DECAY)
 * 2. Clock Anomaly Detection:
 *    - Future verification timestamps (> 300s skew) are detected and flagged as CLOCK_ANOMALY.
 * 3. Immutable Firewall Invariant:
 *    - Staleness strictly affects candidate discovery confidence score.
 *    - NEVER deletes or disables suppliers, NEVER mutates award authority.
 */
export class FreshnessIntelligenceEvaluator {
  /**
   * Evaluates candidate profile freshness against the deterministic 180-day window.
   */
  public static evaluateFreshness(
    lastVerifiedAt?: string | number | Date | null,
    nowDate: Date = new Date(),
  ): CandidateFreshnessAssessment {
    if (!lastVerifiedAt) {
      return {
        status: CandidateFreshnessStatus.FRESHNESS_UNKNOWN,
        ageInDays: 0,
        isStale: false,
        stalenessDecayApplied: false,
        confidencePenalty: 0,
        explanation: 'No verification timestamp available (freshness unmeasured)',
      };
    }

    const verifiedDate = new Date(lastVerifiedAt);
    if (isNaN(verifiedDate.getTime())) {
      return {
        status: CandidateFreshnessStatus.FRESHNESS_UNKNOWN,
        ageInDays: 0,
        isStale: false,
        stalenessDecayApplied: false,
        confidencePenalty: 0,
        explanation: 'Malformed verification timestamp format',
      };
    }

    const nowMs = nowDate.getTime();
    const verifiedMs = verifiedDate.getTime();
    const diffMs = nowMs - verifiedMs;

    // 1. Clock Anomaly Detection (Future Timestamp)
    if (diffMs < -MAX_CLOCK_SKEW_MS) {
      return {
        status: CandidateFreshnessStatus.PROFILE_STALE,
        ageInDays: 0,
        lastVerifiedAt: verifiedDate.toISOString(),
        isStale: true,
        stalenessDecayApplied: true,
        confidencePenalty: 5,
        decayReasonCode: 'CLOCK_ANOMALY',
        explanation: 'Future verification timestamp detected (clock drift anomaly)',
      };
    }

    const ageInDays = Math.max(0, Math.floor(diffMs / (86400 * 1000)));

    // 2. Profile Fresh (<= 180 Days)
    if (ageInDays <= STALENESS_THRESHOLD_DAYS) {
      return {
        status: CandidateFreshnessStatus.PROFILE_FRESH,
        ageInDays,
        lastVerifiedAt: verifiedDate.toISOString(),
        isStale: false,
        stalenessDecayApplied: false,
        confidencePenalty: 0,
        decayReasonCode: 'NONE',
        explanation: `Candidate profile verified ${ageInDays} days ago (within 180-day freshness window)`,
      };
    }

    // 3. Profile Stale (> 180 Days)
    return {
      status: CandidateFreshnessStatus.PROFILE_STALE,
      ageInDays,
      lastVerifiedAt: verifiedDate.toISOString(),
      isStale: true,
      stalenessDecayApplied: true,
      confidencePenalty: 10,
      decayReasonCode: 'STALENESS_DECAY',
      explanation: `Candidate profile is stale (${ageInDays} days old > 180-day threshold). Staleness decay applied (-10).`,
    };
  }
}

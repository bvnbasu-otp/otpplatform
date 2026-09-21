import type {
  PerformanceTier,
  ScorecardDimensions,
  ScorecardDimensionWeights,
  ScorecardRatingMetrics,
  SupplierPerformanceScorecard,
} from '../types/vendor-intelligence';
import { DEFAULT_SCORECARD_WEIGHTS } from '../types/vendor-intelligence';
import type { CandidatePerformanceSummary } from '../types/supplier-network-engine';

export interface PerformanceEvaluationInput {
  scorecard?: SupplierPerformanceScorecard | null;
  dimensions?: Partial<ScorecardDimensions> | null;
  metrics?: Partial<ScorecardRatingMetrics> | null;
  completedOrdersCount?: number | null;
}

/**
 * Supplier Performance Intelligence Evaluator (Phase SN.3).
 *
 * Implements:
 * 1. Multi-dimensional performance evaluation matching Migration 00183:
 *    - Quality Weight: 35%
 *    - Delivery & On-Time Performance: 30%
 *    - SLA & Dispute Adherence: 20%
 *    - Commercial & Price Consistency: 15%
 * 2. Strict Cold-Start Baseline:
 *    - Vendors with 0 completed orders or missing scorecard are assigned INSUFFICIENT_HISTORY
 *      with a neutral baseline confidence contribution (not penalized as failing or 0-score).
 * 3. Immutable Firewall Invariant:
 *    - Performance intelligence strictly contributes to discovery confidence evidence.
 *    - ZERO award authority, ZERO quote score authority, ZERO PO creation authority.
 */
export class SupplierPerformanceIntelligenceEvaluator {
  public static readonly WEIGHTS: ScorecardDimensionWeights = DEFAULT_SCORECARD_WEIGHTS;

  /**
   * Evaluates performance intelligence and computes candidate summary.
   */
  public static evaluatePerformance(input: PerformanceEvaluationInput): CandidatePerformanceSummary {
    const sc = input.scorecard;
    const completedOrders =
      input.completedOrdersCount ??
      sc?.metrics.totalOrdersCompleted ??
      input.metrics?.totalOrdersCompleted ??
      0;

    // 1. Cold Start Check (No transactional history)
    if (!sc && completedOrders === 0 && !input.dimensions) {
      return {
        hasHistoricalPerformance: false,
        completedOrdersCount: 0,
        status: 'INSUFFICIENT_HISTORY',
        confidenceBoost: 5, // Neutral baseline contribution
        explanation: 'Neutral baseline: Insufficient historical transactions on platform (cold start)',
      };
    }

    // 2. Extract and clamp dimensional scores [0, 100]
    const quality = Math.max(
      0,
      Math.min(100, sc?.dimensions.qualityScore ?? input.dimensions?.qualityScore ?? 50),
    );
    const delivery = Math.max(
      0,
      Math.min(100, sc?.dimensions.deliveryScore ?? input.dimensions?.deliveryScore ?? 50),
    );
    const slaDispute = Math.max(
      0,
      Math.min(100, sc?.dimensions.slaDisputeScore ?? input.dimensions?.slaDisputeScore ?? 50),
    );
    const commercial = Math.max(
      0,
      Math.min(100, sc?.dimensions.commercialScore ?? input.dimensions?.commercialScore ?? 50),
    );

    // 3. Compute Composite Score with 35/30/20/15 weights
    const compositeRaw =
      quality * this.WEIGHTS.qualityWeight +
      delivery * this.WEIGHTS.deliveryWeight +
      slaDispute * this.WEIGHTS.slaDisputeWeight +
      commercial * this.WEIGHTS.commercialWeight;

    const compositeScore = Math.max(0, Math.min(100, Number(compositeRaw.toFixed(2))));

    // 4. Derive Performance Tier
    let tier: PerformanceTier = sc?.performanceTier ?? 'SILVER';
    if (!sc?.performanceTier) {
      if (compositeScore >= 90) tier = 'PLATINUM';
      else if (compositeScore >= 80) tier = 'GOLD';
      else if (compositeScore >= 65) tier = 'SILVER';
      else if (compositeScore >= 50) tier = 'BRONZE';
      else tier = 'PROBATIONARY';
    }

    // 5. Compute Discovery Confidence Boost (0 to 15 bonus)
    // Cold start gets 5; measured gets 0-15 based on composite score
    const confidenceBoost = Math.max(0, Math.min(15, Math.round((compositeScore / 100) * 15)));

    return {
      hasHistoricalPerformance: true,
      performanceTier: tier,
      compositeScore,
      qualityScore: quality,
      deliveryScore: delivery,
      slaDisputeScore: slaDispute,
      commercialScore: commercial,
      completedOrdersCount: completedOrders,
      status: 'MEASURED',
      confidenceBoost,
      explanation: `Historical performance tier ${tier} (composite ${compositeScore}/100 based on ${completedOrders} orders)`,
    };
  }
}

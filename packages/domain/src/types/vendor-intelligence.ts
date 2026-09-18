/**
 * OTP Phase 6.6: Vendor Master Intelligence (VMI) & Performance Scorecard Domain Model
 *
 * Implements multi-dimensional supplier performance scoring, auditable dimensional weights,
 * coarse/banded privacy masking during pre-reveal quoting/evaluation stages, and automated
 * scorecard recalculation from transactional execution metrics.
 *
 * Dimensional Weights (100% total):
 *   1. Quality Score (35%) — Step 15 closeout rating & 5-point milestone inspection pass rate
 *   2. Delivery & On-Time Performance (30%) — Work order & milestone delivery SLA adherence
 *   3. SLA & Dispute Adherence (20%) — Dispute frequency, severity & resolution cycle adherence
 *   4. Commercial / Price Consistency (15%) — Quote variance, change order frequency & price stability
 */

export interface ScorecardDimensions {
  qualityScore: number; // 0 - 100
  deliveryScore: number; // 0 - 100
  slaDisputeScore: number; // 0 - 100
  commercialScore: number; // 0 - 100
}

export interface ScorecardDimensionWeights {
  qualityWeight: number; // default: 0.35
  deliveryWeight: number; // default: 0.30
  slaDisputeWeight: number; // default: 0.20
  commercialWeight: number; // default: 0.15
}

export const DEFAULT_SCORECARD_WEIGHTS: Readonly<ScorecardDimensionWeights> = Object.freeze({
  qualityWeight: 0.35,
  deliveryWeight: 0.30,
  slaDisputeWeight: 0.20,
  commercialWeight: 0.15,
});

export type PerformanceTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'PROBATIONARY';

export interface ScorecardRatingMetrics {
  totalOrdersCompleted: number;
  averageCloseoutRating: number; // 1.0 - 5.0 (from Step 15)
  milestoneInspectionPassRate: number; // 0 - 100%
  reworkFrequencyPercent: number; // 0 - 100%
  onTimeDeliveryPercent: number; // 0 - 100%
  totalDisputesCount: number;
  criticalDisputesCount: number;
  disputeResolutionAdherencePercent: number; // 0 - 100%
  quoteVariancePercent: number; // 0 - 100%
  changeOrderFrequencyPercent: number; // 0 - 100%
}

export interface SupplierPerformanceScorecard {
  id: string;
  supplierId: string;
  organizationId?: string | null;
  overallScore: number; // 0 - 100
  performanceTier: PerformanceTier;
  dimensions: ScorecardDimensions;
  weights: ScorecardDimensionWeights;
  metrics: ScorecardRatingMetrics;
  isIdentityMasked: boolean;
  version: number;
  lastCalculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnonymizedPerformanceBadge {
  supplierAlias: string; // e.g. "Supplier A7K3"
  coarseScoreBand: 'EXEMPLARY' | 'COMMENDED' | 'STANDARD' | 'EMERGING' | 'UNDER_OBSERVATION';
  tier: PerformanceTier;
  completedJobsCountRange: string; // e.g. "25+ Orders", "10-24 Orders", "<10 Orders"
  qualityRatingBand: string; // e.g. "4.5 - 5.0 ★", "4.0 - 4.4 ★"
  onTimeDeliveryBand: string; // e.g. ">95%", "85-95%", "<85%"
  verifiedSinceYear?: number;
}

/**
 * Calculates dimensional scores based on raw execution metrics.
 */
export function computeScorecardDimensions(metrics: ScorecardRatingMetrics): ScorecardDimensions {
  // 1. Quality Score (0-100)
  // Baseline from closeout rating (5-star scaled to 0-100: star/5 * 60) + milestone pass rate (40%)
  // Penalized by rework frequency.
  const starScore = Math.max(0, Math.min(5, metrics.averageCloseoutRating)) * 20; // 0 - 100
  const passRateScore = Math.max(0, Math.min(100, metrics.milestoneInspectionPassRate));
  const reworkPenalty = Math.max(0, Math.min(100, metrics.reworkFrequencyPercent)) * 0.5;
  const rawQuality = starScore * 0.6 + passRateScore * 0.4 - reworkPenalty;
  const qualityScore = Number(Math.max(0, Math.min(100, rawQuality)).toFixed(2));

  // 2. Delivery & On-Time Performance (0-100)
  const rawDelivery = Math.max(0, Math.min(100, metrics.onTimeDeliveryPercent));
  const deliveryScore = Number(rawDelivery.toFixed(2));

  // 3. SLA & Dispute Adherence (0-100)
  // Base adherence score (100) penalized by dispute counts and SLA resolution adherence
  const disputePenalty = Math.min(50, metrics.totalDisputesCount * 5 + metrics.criticalDisputesCount * 15);
  const resolutionComponent = Math.max(0, Math.min(100, metrics.disputeResolutionAdherencePercent));
  const rawSla = resolutionComponent * 0.7 + (100 - disputePenalty) * 0.3;
  const slaDisputeScore = Number(Math.max(0, Math.min(100, rawSla)).toFixed(2));

  // 4. Commercial / Price Consistency (0-100)
  // 100 penalized by quote variance and excessive change order frequency
  const variancePenalty = Math.max(0, Math.min(50, metrics.quoteVariancePercent * 1.5));
  const changeOrderPenalty = Math.max(0, Math.min(50, metrics.changeOrderFrequencyPercent * 1.2));
  const rawCommercial = 100 - (variancePenalty + changeOrderPenalty);
  const commercialScore = Number(Math.max(0, Math.min(100, rawCommercial)).toFixed(2));

  return {
    qualityScore,
    deliveryScore,
    slaDisputeScore,
    commercialScore,
  };
}

/**
 * Validates that dimension weights sum to exactly 1.0 (with floating-point tolerance).
 */
export function validateDimensionWeights(weights: ScorecardDimensionWeights): boolean {
  const sum =
    weights.qualityWeight +
    weights.deliveryWeight +
    weights.slaDisputeWeight +
    weights.commercialWeight;
  return Math.abs(sum - 1.0) < 0.001;
}

/**
 * Computes composite overall score from dimensions and weights.
 */
export function computeCompositeScore(
  dimensions: ScorecardDimensions,
  weights: ScorecardDimensionWeights = DEFAULT_SCORECARD_WEIGHTS
): { overallScore: number; tier: PerformanceTier } {
  if (!validateDimensionWeights(weights)) {
    throw new Error('Scorecard dimension weights must sum to 1.0 (100%)');
  }

  const rawOverall =
    dimensions.qualityScore * weights.qualityWeight +
    dimensions.deliveryScore * weights.deliveryWeight +
    dimensions.slaDisputeScore * weights.slaDisputeWeight +
    dimensions.commercialScore * weights.commercialWeight;

  const overallScore = Number(Math.max(0, Math.min(100, rawOverall)).toFixed(2));
  const tier = resolvePerformanceTier(overallScore);

  return { overallScore, tier };
}

/**
 * Resolves performance tier from composite overall score.
 */
export function resolvePerformanceTier(score: number): PerformanceTier {
  if (score >= 90) return 'PLATINUM';
  if (score >= 80) return 'GOLD';
  if (score >= 70) return 'SILVER';
  if (score >= 60) return 'BRONZE';
  return 'PROBATIONARY';
}

/**
 * Produces privacy-preserving coarse/banded scorecard badge for pre-award quoting/evaluation.
 * Ensures zero vendor PII / unmasking occurs before Step 12 winner reveal.
 */
export function generateAnonymizedPerformanceBadge(
  supplierAlias: string,
  scorecard: SupplierPerformanceScorecard,
  registrationYear?: number
): AnonymizedPerformanceBadge {
  const score = scorecard.overallScore;

  let coarseScoreBand: AnonymizedPerformanceBadge['coarseScoreBand'] = 'UNDER_OBSERVATION';
  if (score >= 90) coarseScoreBand = 'EXEMPLARY';
  else if (score >= 80) coarseScoreBand = 'COMMENDED';
  else if (score >= 70) coarseScoreBand = 'STANDARD';
  else if (score >= 60) coarseScoreBand = 'EMERGING';

  let completedJobsCountRange = '<5 Orders';
  const total = scorecard.metrics.totalOrdersCompleted;
  if (total >= 50) completedJobsCountRange = '50+ Orders';
  else if (total >= 25) completedJobsCountRange = '25-49 Orders';
  else if (total >= 10) completedJobsCountRange = '10-24 Orders';
  else if (total >= 5) completedJobsCountRange = '5-9 Orders';

  let qualityRatingBand = '<3.5 ★';
  const rating = scorecard.metrics.averageCloseoutRating;
  if (rating >= 4.8) qualityRatingBand = '4.8 - 5.0 ★';
  else if (rating >= 4.5) qualityRatingBand = '4.5 - 4.7 ★';
  else if (rating >= 4.0) qualityRatingBand = '4.0 - 4.4 ★';
  else if (rating >= 3.5) qualityRatingBand = '3.5 - 3.9 ★';

  let onTimeDeliveryBand = '<75%';
  const onTime = scorecard.metrics.onTimeDeliveryPercent;
  if (onTime >= 95) onTimeDeliveryBand = '95%+ On-Time';
  else if (onTime >= 85) onTimeDeliveryBand = '85-94% On-Time';
  else if (onTime >= 75) onTimeDeliveryBand = '75-84% On-Time';

  return {
    supplierAlias,
    coarseScoreBand,
    tier: scorecard.performanceTier,
    completedJobsCountRange,
    qualityRatingBand,
    onTimeDeliveryBand,
    verifiedSinceYear: registrationYear,
  };
}

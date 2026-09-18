import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORECARD_WEIGHTS,
  computeCompositeScore,
  computeScorecardDimensions,
  generateAnonymizedPerformanceBadge,
  resolvePerformanceTier,
  validateDimensionWeights,
  type ScorecardRatingMetrics,
  type SupplierPerformanceScorecard,
} from './vendor-intelligence';

describe('OTP Phase 6.6: Vendor Master Intelligence (VMI) Domain Engine', () => {
  const sampleMetrics: ScorecardRatingMetrics = {
    totalOrdersCompleted: 28,
    averageCloseoutRating: 4.8,
    milestoneInspectionPassRate: 96.5,
    reworkFrequencyPercent: 3.5,
    onTimeDeliveryPercent: 94.0,
    totalDisputesCount: 1,
    criticalDisputesCount: 0,
    disputeResolutionAdherencePercent: 98.0,
    quoteVariancePercent: 4.0,
    changeOrderFrequencyPercent: 5.0,
  };

  describe('Dimension Scoring Calculations', () => {
    it('computes quality, delivery, sla, and commercial dimensions correctly', () => {
      const dimensions = computeScorecardDimensions(sampleMetrics);
      expect(dimensions.qualityScore).toBeGreaterThanOrEqual(0);
      expect(dimensions.qualityScore).toBeLessThanOrEqual(100);
      expect(dimensions.deliveryScore).toBe(94.0);
      expect(dimensions.slaDisputeScore).toBeGreaterThan(90);
      expect(dimensions.commercialScore).toBeGreaterThan(85);
    });

    it('penalizes rework frequency and critical disputes appropriately', () => {
      const poorMetrics: ScorecardRatingMetrics = {
        totalOrdersCompleted: 10,
        averageCloseoutRating: 2.5,
        milestoneInspectionPassRate: 60.0,
        reworkFrequencyPercent: 40.0,
        onTimeDeliveryPercent: 55.0,
        totalDisputesCount: 5,
        criticalDisputesCount: 2,
        disputeResolutionAdherencePercent: 50.0,
        quoteVariancePercent: 25.0,
        changeOrderFrequencyPercent: 30.0,
      };

      const dimensions = computeScorecardDimensions(poorMetrics);
      expect(dimensions.qualityScore).toBeLessThan(40);
      expect(dimensions.deliveryScore).toBe(55.0);
      expect(dimensions.slaDisputeScore).toBeLessThanOrEqual(50);
      expect(dimensions.commercialScore).toBeLessThan(35);
    });
  });

  describe('Weight Validation and Composite Scoring', () => {
    it('validates default dimension weights (35/30/20/15) summing to 100%', () => {
      expect(validateDimensionWeights(DEFAULT_SCORECARD_WEIGHTS)).toBe(true);
      expect(
        validateDimensionWeights({
          qualityWeight: 0.40,
          deliveryWeight: 0.30,
          slaDisputeWeight: 0.20,
          commercialWeight: 0.10,
        })
      ).toBe(true);
      expect(
        validateDimensionWeights({
          qualityWeight: 0.50,
          deliveryWeight: 0.50,
          slaDisputeWeight: 0.10,
          commercialWeight: 0.10,
        })
      ).toBe(false);
    });

    it('computes overall composite score and resolves performance tier', () => {
      const dimensions = computeScorecardDimensions(sampleMetrics);
      const result = computeCompositeScore(dimensions, DEFAULT_SCORECARD_WEIGHTS);

      expect(result.overallScore).toBeGreaterThanOrEqual(90);
      expect(result.tier).toBe('PLATINUM');
    });

    it('resolves correct tiers across score boundaries', () => {
      expect(resolvePerformanceTier(95)).toBe('PLATINUM');
      expect(resolvePerformanceTier(90)).toBe('PLATINUM');
      expect(resolvePerformanceTier(89.9)).toBe('GOLD');
      expect(resolvePerformanceTier(80)).toBe('GOLD');
      expect(resolvePerformanceTier(75)).toBe('SILVER');
      expect(resolvePerformanceTier(65)).toBe('BRONZE');
      expect(resolvePerformanceTier(50)).toBe('PROBATIONARY');
    });
  });

  describe('Privacy-Preserving Anonymized Performance Badge', () => {
    it('generates coarse badge preserving identity protection for pre-reveal evaluation', () => {
      const dimensions = computeScorecardDimensions(sampleMetrics);
      const { overallScore, tier } = computeCompositeScore(dimensions);

      const scorecard: SupplierPerformanceScorecard = {
        id: 'sc-001',
        supplierId: 'sup-real-uuid-secret',
        overallScore,
        performanceTier: tier,
        dimensions,
        weights: DEFAULT_SCORECARD_WEIGHTS,
        metrics: sampleMetrics,
        isIdentityMasked: true,
        version: 1,
        lastCalculatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const badge = generateAnonymizedPerformanceBadge('Supplier A7K3', scorecard, 2024);

      expect(badge.supplierAlias).toBe('Supplier A7K3');
      expect(badge.coarseScoreBand).toBe('EXEMPLARY');
      expect(badge.tier).toBe('PLATINUM');
      expect(badge.completedJobsCountRange).toBe('25-49 Orders');
      expect(badge.qualityRatingBand).toBe('4.8 - 5.0 ★');
      expect(badge.onTimeDeliveryBand).toBe('85-94% On-Time');
      expect(badge.verifiedSinceYear).toBe(2024);
    });
  });
});

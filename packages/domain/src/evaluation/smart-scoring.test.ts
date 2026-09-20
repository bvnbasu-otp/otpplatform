import { describe, expect, it } from 'vitest';
import {
  computeSmartScores,
  computeExplainableSmartScores,
  type RawQuoteMetrics,
  type ScoringWeights,
} from './smart-scoring';

describe('Multi-Factor Supplier Smart Scoring Engine', () => {
  const quotes: RawQuoteMetrics[] = [
    {
      quoteId: 'q-1',
      totalCost: 400000, // L1 Lowest
      deliveryDays: 15,
      warrantyMonths: 24,
      ratingAvg: 4.5,
      onTimePercent: 90,
      isGstVerified: true,
      anonymousLabel: 'Supplier #01',
    },
    {
      quoteId: 'q-2',
      totalCost: 450000,
      deliveryDays: 10, // Fastest
      warrantyMonths: 36, // Max warranty
      ratingAvg: 4.8,
      onTimePercent: 95,
      isGstVerified: true,
      anonymousLabel: 'Supplier #02',
    },
    {
      quoteId: 'q-3',
      totalCost: 500000,
      deliveryDays: 20,
      warrantyMonths: 12,
      ratingAvg: 4.0,
      onTimePercent: 80,
      isGstVerified: false,
      anonymousLabel: 'Supplier #03',
    },
  ];

  const weights: ScoringWeights = {
    commercial: 50,
    speed: 20,
    warranty: 15,
    quality: 15,
  };

  it('awards 100 commercial score to the lowest L1 price quote', () => {
    const scores = computeSmartScores(quotes, weights);
    const q1 = scores.find((s) => s.quoteId === 'q-1')!;

    expect(q1.commercialScore).toBe(100);
    expect(q1.gstBonus).toBe(5);
  });

  it('awards 100 speed score to the fastest turnaround quote', () => {
    const scores = computeSmartScores(quotes, weights);
    const q2 = scores.find((s) => s.quoteId === 'q-2')!;

    expect(q2.speedScore).toBe(100);
    expect(q2.warrantyScore).toBe(100);
  });

  it('calculates composite scores deterministically', () => {
    const scores = computeSmartScores(quotes, weights);
    expect(scores.length).toBe(3);
    for (const score of scores) {
      expect(score.compositeScore).toBeGreaterThan(0);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
    }
  });

  describe('computeExplainableSmartScores (Decomposed Transparency)', () => {
    it('produces itemized transparent score breakdowns per pseudonymized supplier', () => {
      const explainable = computeExplainableSmartScores(quotes, weights);
      expect(explainable.length).toBe(3);

      const q1 = explainable.find((q) => q.quoteId === 'q-1')!;
      expect(q1.anonymousLabel).toBe('Supplier #01');
      expect(q1.breakdown.length).toBe(4);

      // Price breakdown
      const priceRow = q1.breakdown.find((b) => b.criterionCode === 'price')!;
      expect(priceRow.normalizedScore).toBe(100);
      expect(priceRow.weightPercent).toBe(50);
      expect(priceRow.weightedContribution).toBe(50);
      expect(priceRow.isBestInClass).toBe(true);

      expect(q1.formulaSummary).toContain('Score =');
      expect(q1.bestInClassBadges).toContain('Lowest Landed Price (L1)');
      expect(q1.bestInClassBadges).toContain('GST Verified (+5 pts)');
    });

    it('identifies best-in-class badges across multiple candidate dimensions', () => {
      const explainable = computeExplainableSmartScores(quotes, weights);
      const q2 = explainable.find((q) => q.quoteId === 'q-2')!;

      expect(q2.bestInClassBadges).toContain('Fastest TAT');
      expect(q2.bestInClassBadges).toContain('Longest Warranty');
      expect(q2.bestInClassBadges).toContain('Top Verified Rating');
    });

    it('works with criterion-code record weights mapping seamlessly', () => {
      const codeWeights = {
        price: 40,
        delivery_time: 30,
        warranty: 15,
        supplier_rating: 15,
      };

      const explainable = computeExplainableSmartScores(quotes, codeWeights);
      expect(explainable.length).toBe(3);
      expect(explainable[0]?.breakdown[0]?.weightPercent).toBe(40);
    });
  });
});

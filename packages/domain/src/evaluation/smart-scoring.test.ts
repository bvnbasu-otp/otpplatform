import { describe, expect, it } from 'vitest';
import { computeSmartScores, type RawQuoteMetrics, type ScoringWeights } from './smart-scoring';

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
    },
    {
      quoteId: 'q-2',
      totalCost: 450000,
      deliveryDays: 10, // Fastest
      warrantyMonths: 36, // Max warranty
      ratingAvg: 4.8,
      onTimePercent: 95,
      isGstVerified: true,
    },
    {
      quoteId: 'q-3',
      totalCost: 500000,
      deliveryDays: 20,
      warrantyMonths: 12,
      ratingAvg: 4.0,
      onTimePercent: 80,
      isGstVerified: false,
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
});

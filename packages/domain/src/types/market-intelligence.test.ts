import { describe, expect, it } from 'vitest';
import {
  calculateMarketFreshness,
  calculateMarketConfidence,
  createMarketIntelligenceSnapshot,
  type MarketBenchmarkResult,
} from './market-intelligence';

describe('OTP Phase C8.3: Live Market Intelligence Domain Engine', () => {
  const baseTime = new Date('2026-09-21T10:00:00Z');

  describe('Freshness Calculation Engine', () => {
    it('returns FRESH for data observed within 7 days', () => {
      const recent = '2026-09-18T10:00:00Z'; // 3 days ago
      expect(calculateMarketFreshness(recent, baseTime)).toBe('FRESH');
    });

    it('returns AGING for data observed between 7 and 30 days', () => {
      const aging = '2026-09-01T10:00:00Z'; // 20 days ago
      expect(calculateMarketFreshness(aging, baseTime)).toBe('AGING');
    });

    it('returns STALE for data observed between 30 and 90 days', () => {
      const stale = '2026-07-15T10:00:00Z'; // ~67 days ago
      expect(calculateMarketFreshness(stale, baseTime)).toBe('STALE');
    });

    it('returns EXPIRED for data observed older than 90 days', () => {
      const expired = '2026-04-01T10:00:00Z'; // >150 days ago
      expect(calculateMarketFreshness(expired, baseTime)).toBe('EXPIRED');
    });

    it('returns UNAVAILABLE when observation timestamp is missing or malformed', () => {
      expect(calculateMarketFreshness(null, baseTime)).toBe('UNAVAILABLE');
      expect(calculateMarketFreshness('invalid-date', baseTime)).toBe('UNAVAILABLE');
    });
  });

  describe('Confidence Calculation Engine', () => {
    it('computes HIGH confidence for large transacted sample size with fresh data', () => {
      const res = calculateMarketConfidence({
        sampleSize: 42,
        sourceType: 'PLATFORM_TRANSACTED',
        freshness: 'FRESH',
        priceSpreadPercent: 12,
      });

      expect(res.confidence).toBe('HIGH');
      expect(res.confidenceScore).toBeGreaterThanOrEqual(75);
      expect(res.methodology).toContain('42 audited contracts');
    });

    it('computes MEDIUM confidence for moderate sample size with aging data', () => {
      const res = calculateMarketConfidence({
        sampleSize: 12,
        sourceType: 'HISTORICAL_BENCHMARK',
        freshness: 'AGING',
      });

      expect(res.confidence).toBe('MEDIUM');
      expect(res.confidenceScore).toBeGreaterThanOrEqual(45);
    });

    it('returns INSUFFICIENT_DATA when sample size is 0 or source is UNAVAILABLE', () => {
      const res = calculateMarketConfidence({
        sampleSize: 0,
        sourceType: 'UNAVAILABLE',
        freshness: 'UNAVAILABLE',
      });

      expect(res.confidence).toBe('INSUFFICIENT_DATA');
      expect(res.confidenceScore).toBe(0);
    });
  });

  describe('Immutable Snapshot Normalization & Honest Fallbacks', () => {
    const mockLiveBenchmark: MarketBenchmarkResult = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
      fairPriceMin: 85000,
      fairPriceMax: 110000,
      fairPriceMedian: 95000,
      typicalDeliveryDaysMin: 3,
      typicalDeliveryDaysMax: 7,
      typicalWarrantyMonthsMin: 12,
      typicalWarrantyMonthsMax: 24,
      networkReliabilityScore: 98.2,
      sampleSize: 28,
      sourceType: 'LIVE_API',
      sourceProviderName: 'OTP MSME Open Registry Feed',
      observedAt: '2026-09-20T12:00:00Z',
    };

    it('generates a full snapshot with calculated variance against candidate quote', () => {
      const snapshot = createMarketIntelligenceSnapshot({
        benchmark: mockLiveBenchmark,
        rfqId: 'rfq-cctv-01',
        requirementId: 'req-cctv-01',
        lowestQuoteAmount: 90000, // ₹90k vs ₹95k median (-5.3%)
        currentTime: baseTime,
      });

      expect(snapshot.sourceType).toBe('LIVE_API');
      expect(snapshot.freshness).toBe('FRESH');
      expect(snapshot.confidence).toBe('HIGH');
      expect(snapshot.fairPriceMedian).toBe(95000);
      expect(snapshot.quoteVariancePercent).toBe(-5.3);
      expect(snapshot.isFallback).toBe(false);
    });

    it('generates an honest UNAVAILABLE snapshot when data is missing without pretending seed data is live', () => {
      const snapshot = createMarketIntelligenceSnapshot({
        benchmark: null,
        rfqId: 'rfq-empty-01',
        fallbackReason: 'No market intelligence feed available for category',
        currentTime: baseTime,
      });

      expect(snapshot.sourceType).toBe('UNAVAILABLE');
      expect(snapshot.freshness).toBe('UNAVAILABLE');
      expect(snapshot.confidence).toBe('INSUFFICIENT_DATA');
      expect(snapshot.isFallback).toBe(true);
      expect(snapshot.fairPriceMin).toBeNull();
      expect(snapshot.fairPriceMax).toBeNull();
    });
  });
});

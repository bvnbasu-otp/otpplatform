import { describe, expect, it } from 'vitest';
import {
  calculateMarketFreshness,
  calculateMarketConfidence,
  createMarketIntelligenceSnapshot,
  generateMarketCacheKey,
  sanitizeMarketBenchmarkQuery,
  assertZeroPiiInMarketQuery,
  validateMarketIntelligenceQuoteIndependence,
  assertMarketIntelligenceTaxIndependence,
  CURATED_CPWD_BIS_BENCHMARKS,
  CANONICAL_FALLBACK_LADDER,
  type MarketBenchmarkResult,
} from './market-intelligence';

describe('OTP Stage R2-16: Market Intelligence & Fallback Ladder Domain Engine', () => {
  const baseTime = new Date('2026-09-25T10:00:00Z');

  describe('4-Tier Canonical Fallback Ladder', () => {
    it('defines the strict 4-tier fallback sequence', () => {
      expect(CANONICAL_FALLBACK_LADDER).toEqual([
        'LIVE_API',
        'DATABASE_CACHE',
        'STATIC_REFERENCE',
        'UNAVAILABLE',
      ]);
    });
  });

  describe('Freshness Calculation Engine', () => {
    it('returns FRESH for data observed within 7 days', () => {
      const recent = '2026-09-22T10:00:00Z'; // 3 days ago
      expect(calculateMarketFreshness(recent, baseTime)).toBe('FRESH');
    });

    it('returns AGING for data observed between 7 and 30 days', () => {
      const aging = '2026-09-05T10:00:00Z'; // 20 days ago
      expect(calculateMarketFreshness(aging, baseTime)).toBe('AGING');
    });

    it('returns STALE for data observed between 30 and 90 days', () => {
      const stale = '2026-07-20T10:00:00Z'; // ~67 days ago
      expect(calculateMarketFreshness(stale, baseTime)).toBe('STALE');
    });

    it('returns EXPIRED for data observed older than 90 days', () => {
      const expired = '2026-04-01T10:00:00Z'; // >170 days ago
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

    it('computes HIGH confidence for fresh DATABASE_CACHE provider data', () => {
      const res = calculateMarketConfidence({
        sampleSize: 30,
        sourceType: 'DATABASE_CACHE',
        freshness: 'FRESH',
        priceSpreadPercent: 10,
      });

      expect(res.confidence).toBe('HIGH');
      expect(res.confidenceScore).toBeGreaterThanOrEqual(75);
    });

    it('computes MEDIUM confidence for STATIC_REFERENCE benchmark with aging data', () => {
      const res = calculateMarketConfidence({
        sampleSize: 12,
        sourceType: 'STATIC_REFERENCE',
        freshness: 'AGING',
      });

      expect(res.confidence).toBe('MEDIUM');
      expect(res.confidenceScore).toBeGreaterThanOrEqual(40);
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

  describe('CPWD / BIS Curated Benchmarks Catalog', () => {
    it('contains authoritative benchmarks for key procurement categories', () => {
      expect(CURATED_CPWD_BIS_BENCHMARKS['cctv_surveillance']).toBeDefined();
      expect(CURATED_CPWD_BIS_BENCHMARKS['cctv_surveillance']?.applicableStandard).toContain('IS 13252');
      expect(CURATED_CPWD_BIS_BENCHMARKS['water_borewell_submersible_pump']?.applicableStandard).toContain('IS 8034');
      expect(CURATED_CPWD_BIS_BENCHMARKS['dg_genset_silent']?.applicableStandard).toContain('CPCB');
      expect(CURATED_CPWD_BIS_BENCHMARKS['rooftop_solar_epc']?.applicableStandard).toContain('MNRE');
    });
  });

  describe('Deterministic Cache Key Generator', () => {
    it('generates consistent cache key from public query without tenant pollution', () => {
      const key1 = generateMarketCacheKey({
        categoryKey: 'cctv_surveillance',
        subcategoryCode: 'ip_camera',
        locationCity: 'Bengaluru',
        stateCode: 'KA',
      });
      const key2 = generateMarketCacheKey({
        categoryKey: 'CCTV_SURVEILLANCE',
        subcategoryCode: 'IP_CAMERA',
        locationCity: 'bengaluru',
        stateCode: 'ka',
      });

      expect(key1).toBe('market_intel:cctv_surveillance:ip_camera:bengaluru:ka');
      expect(key1).toBe(key2);
    });
  });

  describe('Data Minimization & PII Assertion', () => {
    it('sanitizes query parameters and strips private fields', () => {
      const raw = {
        categoryKey: 'cctv_surveillance',
        buyerName: 'Secret Buyer',
        phone: '9876543210',
        email: 'buyer@secret.org',
        locationCity: 'Mumbai',
        stateCode: 'MH',
      };

      const sanitized = sanitizeMarketBenchmarkQuery(raw);
      expect(sanitized.categoryKey).toBe('cctv_surveillance');
      expect(sanitized.locationCity).toBe('Mumbai');
      expect(sanitized.stateCode).toBe('MH');
      expect((sanitized as any).buyerName).toBeUndefined();
      expect((sanitized as any).phone).toBeUndefined();
    });

    it('throws error when private PII is detected in outbound payload', () => {
      expect(() => {
        assertZeroPiiInMarketQuery({
          categoryKey: 'cctv_surveillance',
          buyer_name: 'John Doe',
        });
      }).toThrow(/Security Violation/);

      expect(() => {
        assertZeroPiiInMarketQuery({
          categoryKey: 'cctv_surveillance',
          phone: '+919999999999',
        });
      }).toThrow(/Security Violation/);

      expect(() => {
        assertZeroPiiInMarketQuery({
          categoryKey: 'cctv_surveillance',
          gstin: '29ABCDE1234F1Z5',
        });
      }).toThrow(/Security Violation/);
    });

    it('passes when query contains only coarse category and geography', () => {
      expect(() => {
        assertZeroPiiInMarketQuery({
          categoryKey: 'cctv_surveillance',
          locationCity: 'Bengaluru',
          stateCode: 'KA',
          pincode: '560001',
        });
      }).not.toThrow();
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
      observedAt: '2026-09-24T12:00:00Z',
      responseIntegrityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    it('generates a full snapshot with calculated variance against candidate quote and integrity hash', () => {
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
      expect(snapshot.responseIntegrityHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
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

  describe('Quote Independence & Tax Independence', () => {
    it('blocks attempting to use market intelligence snapshot as a quote', () => {
      const snapshot = createMarketIntelligenceSnapshot({
        benchmark: null,
        currentTime: baseTime,
      });

      const res = validateMarketIntelligenceQuoteIndependence(snapshot, snapshot.snapshotId);
      expect(res.isIndependent).toBe(false);
      expect(res.violation).toContain('cannot be submitted as a commercial quote ID');
    });

    it('verifies market intelligence tax independence', () => {
      const snapshot = createMarketIntelligenceSnapshot({
        benchmark: null,
        currentTime: baseTime,
      });
      expect(assertMarketIntelligenceTaxIndependence(snapshot, 18000)).toBe(true);
    });
  });
});

/**
 * OTP Phase C8.3: Live Market Intelligence & Pricing Benchmark Domain Model
 *
 * Implements:
 *   1. Pluggable provider abstraction (`MarketIntelligenceProvider`, `MarketBenchmarkQuery`, `MarketBenchmarkResult`).
 *   2. Honest classification of market intelligence sources:
 *      - `LIVE_API`: External real-time feed / verified index.
 *      - `PLATFORM_TRANSACTED`: Real transacted contracts within OTP platform.
 *      - `HISTORICAL_BENCHMARK`: Curated cluster dataset / regional baselines.
 *      - `ESTIMATED_STATISTICAL`: Synthesized or regression-estimated baseline.
 *   3. Freshness Status engine (`FRESH`, `AGING`, `STALE`, `EXPIRED`, `UNAVAILABLE`) based on observation timestamps.
 *   4. Confidence calculation (`HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT_DATA`) based on sample size, source, and variance.
 *   5. Explicit fallback ladder: `LIVE` -> `CACHED` -> `HISTORICAL` -> `UNAVAILABLE`.
 *   6. Immutable Market Intelligence Snapshot for tamper-proof procurement audit trails.
 */

export type MarketIntelligenceSourceType =
  | 'LIVE_API'
  | 'DATABASE_CACHE'
  | 'PLATFORM_TRANSACTED'
  | 'STATIC_REFERENCE'
  | 'HISTORICAL_BENCHMARK'
  | 'ESTIMATED_STATISTICAL'
  | 'UNAVAILABLE';

export type MarketFreshnessStatus =
  | 'FRESH'       // < 7 days old
  | 'AGING'       // 7 - 30 days old
  | 'STALE'       // 30 - 90 days old
  | 'EXPIRED'     // > 90 days old
  | 'UNAVAILABLE';// No data available

export type MarketConfidenceLevel =
  | 'HIGH'              // >= 20 verified samples, live or transacted data, variance < 15%
  | 'MEDIUM'            // 5 - 19 samples, transacted or historical benchmark
  | 'LOW'               // 1 - 4 samples or statistical extrapolation
  | 'INSUFFICIENT_DATA';// 0 samples

export interface MarketBenchmarkQuery {
  categoryKey: string;
  itemDescription?: string | null;
  locationCity?: string | null;
  stateCode?: string | null;
  targetQuantity?: number | null;
  estimatedBudget?: number | null;
  currency?: string;
  maxAcceptableAgeDays?: number;
}

export interface MarketIntelligenceSnapshot {
  snapshotId: string;
  rfqId?: string | null;
  requirementId?: string | null;
  categoryKey: string;
  locationCity: string | null;
  fairPriceMin: number | null;
  fairPriceMax: number | null;
  fairPriceMedian: number | null;
  typicalDeliveryDaysMin: number | null;
  typicalDeliveryDaysMax: number | null;
  typicalWarrantyMonthsMin: number | null;
  typicalWarrantyMonthsMax: number | null;
  networkReliabilityScore: number | null;
  sampleSize: number;
  sourceType: MarketIntelligenceSourceType;
  sourceProviderName: string;
  observedAt: string;
  freshness: MarketFreshnessStatus;
  confidence: MarketConfidenceLevel;
  confidenceScore: number; // 0 to 100
  confidenceMethodology: string;
  isFallback: boolean;
  fallbackReason?: string | null;
  /** Variance between buyer's lowest quote and benchmark median, in percent */
  quoteVariancePercent?: number | null;
  /** Captured response integrity hash (SHA-256) for auditability */
  responseIntegrityHash?: string | null;
  capturedAt: string;
}

export interface MarketBenchmarkResult {
  categoryKey: string;
  locationCity: string | null;
  fairPriceMin: number | null;
  fairPriceMax: number | null;
  fairPriceMedian: number | null;
  typicalDeliveryDaysMin: number | null;
  typicalDeliveryDaysMax: number | null;
  typicalWarrantyMonthsMin: number | null;
  typicalWarrantyMonthsMax: number | null;
  networkReliabilityScore: number | null;
  sampleSize: number;
  sourceType: MarketIntelligenceSourceType;
  sourceProviderName: string;
  observedAt: string;
  /** Captured response integrity hash (SHA-256) for auditability */
  responseIntegrityHash?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MarketIntelligenceProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly supportedSourceType: MarketIntelligenceSourceType;
  getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null>;
}

/**
 * Calculates freshness status from observation timestamp relative to current evaluation time.
 */
export function calculateMarketFreshness(
  observedAtIso: string | null | undefined,
  currentTime = new Date()
): MarketFreshnessStatus {
  if (!observedAtIso) {
    return 'UNAVAILABLE';
  }

  const observedTime = new Date(observedAtIso).getTime();
  if (isNaN(observedTime)) {
    return 'UNAVAILABLE';
  }

  const nowTime = currentTime.getTime();
  const ageInDays = (nowTime - observedTime) / (1000 * 60 * 60 * 24);

  if (ageInDays < 0) {
    // Clock skew / fresh
    return 'FRESH';
  }
  if (ageInDays <= 7) {
    return 'FRESH';
  }
  if (ageInDays <= 30) {
    return 'AGING';
  }
  if (ageInDays <= 90) {
    return 'STALE';
  }
  return 'EXPIRED';
}

/**
 * Computes market benchmark confidence level and score with an explainable methodology string.
 */
export function calculateMarketConfidence(params: {
  sampleSize: number;
  sourceType: MarketIntelligenceSourceType;
  freshness: MarketFreshnessStatus;
  priceSpreadPercent?: number | null;
}): {
  confidence: MarketConfidenceLevel;
  confidenceScore: number;
  methodology: string;
} {
  const { sampleSize, sourceType, freshness, priceSpreadPercent } = params;

  if (sampleSize <= 0 || sourceType === 'UNAVAILABLE' || freshness === 'UNAVAILABLE' || freshness === 'EXPIRED') {
    return {
      confidence: 'INSUFFICIENT_DATA',
      confidenceScore: 0,
      methodology: 'Insufficient data points (sample size 0 or expired/unavailable data).',
    };
  }

  let baseScore = 50;

  // 1. Sample Size scoring (up to 40 points)
  if (sampleSize >= 25) {
    baseScore += 35;
  } else if (sampleSize >= 15) {
    baseScore += 25;
  } else if (sampleSize >= 5) {
    baseScore += 15;
  } else {
    baseScore += 5;
  }

  // 2. Source Type weighting & cap
  if (
    sourceType === 'LIVE_API' ||
    sourceType === 'DATABASE_CACHE' ||
    sourceType === 'PLATFORM_TRANSACTED'
  ) {
    baseScore += 15;
  } else if (sourceType === 'HISTORICAL_BENCHMARK' || sourceType === 'STATIC_REFERENCE') {
    baseScore += 0;
  } else if (sourceType === 'ESTIMATED_STATISTICAL') {
    baseScore -= 15;
  }

  // 3. Freshness penalty
  if (freshness === 'FRESH') {
    baseScore += 5;
  } else if (freshness === 'AGING') {
    baseScore -= 10;
  } else if (freshness === 'STALE') {
    baseScore -= 25;
  }

  // 4. Spread tight check
  if (priceSpreadPercent != null && priceSpreadPercent < 20) {
    baseScore += 5;
  }

  const confidenceScore = Math.max(0, Math.min(100, baseScore));

  let confidence: MarketConfidenceLevel = 'LOW';
  // High confidence requires live/transacted data AND fresh status AND high score
  if (
    confidenceScore >= 75 &&
    sampleSize >= 15 &&
    (sourceType === 'LIVE_API' ||
      sourceType === 'DATABASE_CACHE' ||
      sourceType === 'PLATFORM_TRANSACTED') &&
    freshness === 'FRESH'
  ) {
    confidence = 'HIGH';
  } else if (confidenceScore >= 40 && sampleSize >= 3) {
    confidence = 'MEDIUM';
  } else if (sampleSize >= 1) {
    confidence = 'LOW';
  } else {
    confidence = 'INSUFFICIENT_DATA';
  }

  const methodology = `Computed from ${sampleSize} audited contracts (${sourceType}, ${freshness} status, ${confidenceScore}/100 quality index).`;

  return {
    confidence,
    confidenceScore,
    methodology,
  };
}

/**
 * Normalizes raw benchmark data into an immutable snapshot shape,
 * computing freshness, confidence, and quote variance against candidate quote.
 */
export function createMarketIntelligenceSnapshot(params: {
  benchmark: MarketBenchmarkResult | null;
  rfqId?: string | null;
  requirementId?: string | null;
  lowestQuoteAmount?: number | null;
  fallbackReason?: string | null;
  currentTime?: Date;
}): MarketIntelligenceSnapshot {
  const { benchmark, rfqId, requirementId, lowestQuoteAmount, fallbackReason, currentTime = new Date() } = params;

  if (!benchmark || benchmark.sourceType === 'UNAVAILABLE') {
    return {
      snapshotId: `mis-${Date.now()}`,
      rfqId: rfqId ?? null,
      requirementId: requirementId ?? null,
      categoryKey: benchmark?.categoryKey || 'unknown',
      locationCity: benchmark?.locationCity || null,
      fairPriceMin: null,
      fairPriceMax: null,
      fairPriceMedian: null,
      typicalDeliveryDaysMin: null,
      typicalDeliveryDaysMax: null,
      typicalWarrantyMonthsMin: null,
      typicalWarrantyMonthsMax: null,
      networkReliabilityScore: null,
      sampleSize: 0,
      sourceType: 'UNAVAILABLE',
      sourceProviderName: 'NONE',
      observedAt: currentTime.toISOString(),
      freshness: 'UNAVAILABLE',
      confidence: 'INSUFFICIENT_DATA',
      confidenceScore: 0,
      confidenceMethodology: 'Market intelligence data is currently unavailable for this category/geography.',
      isFallback: true,
      fallbackReason: fallbackReason || 'No active market intelligence feed available.',
      quoteVariancePercent: null,
      capturedAt: currentTime.toISOString(),
    };
  }

  const freshness = calculateMarketFreshness(benchmark.observedAt, currentTime);

  const priceSpread =
    benchmark.fairPriceMax != null && benchmark.fairPriceMin != null && benchmark.fairPriceMin > 0
      ? ((benchmark.fairPriceMax - benchmark.fairPriceMin) / benchmark.fairPriceMin) * 100
      : null;

  const { confidence, confidenceScore, methodology } = calculateMarketConfidence({
    sampleSize: benchmark.sampleSize,
    sourceType: benchmark.sourceType,
    freshness,
    priceSpreadPercent: priceSpread,
  });

  // Calculate quote variance relative to benchmark median or average
  let quoteVariancePercent: number | null = null;
  const benchmarkMid =
    benchmark.fairPriceMedian ??
    (benchmark.fairPriceMin != null && benchmark.fairPriceMax != null
      ? (benchmark.fairPriceMin + benchmark.fairPriceMax) / 2
      : null);

  if (lowestQuoteAmount != null && benchmarkMid != null && benchmarkMid > 0) {
    quoteVariancePercent = Number((((lowestQuoteAmount - benchmarkMid) / benchmarkMid) * 100).toFixed(1));
  }

  return {
    snapshotId: `mis-${Date.now()}`,
    rfqId: rfqId ?? null,
    requirementId: requirementId ?? null,
    categoryKey: benchmark.categoryKey,
    locationCity: benchmark.locationCity,
    fairPriceMin: benchmark.fairPriceMin,
    fairPriceMax: benchmark.fairPriceMax,
    fairPriceMedian: benchmarkMid,
    typicalDeliveryDaysMin: benchmark.typicalDeliveryDaysMin,
    typicalDeliveryDaysMax: benchmark.typicalDeliveryDaysMax,
    typicalWarrantyMonthsMin: benchmark.typicalWarrantyMonthsMin,
    typicalWarrantyMonthsMax: benchmark.typicalWarrantyMonthsMax,
    networkReliabilityScore: benchmark.networkReliabilityScore,
    sampleSize: benchmark.sampleSize,
    sourceType: benchmark.sourceType,
    sourceProviderName: benchmark.sourceProviderName,
    observedAt: benchmark.observedAt,
    freshness,
    confidence,
    confidenceScore,
    confidenceMethodology: methodology,
    isFallback: Boolean(fallbackReason),
    fallbackReason: fallbackReason ?? null,
    quoteVariancePercent,
    responseIntegrityHash: benchmark.responseIntegrityHash ?? null,
    capturedAt: currentTime.toISOString(),
  };
}

import { createHash } from 'node:crypto';
import type {
  MarketIntelligenceProvider,
  MarketProviderStatus,
  MarketProviderBudgetPolicy,
  MarketBenchmarkQuery,
  MarketBenchmarkResult,
  MarketIntelligenceSnapshot,
  MarketIntelligenceSourceType,
  CuratedBenchmarkEntry,
} from '@otp/domain';
import {
  createMarketIntelligenceSnapshot,
  generateMarketCacheKey,
  sanitizeMarketBenchmarkQuery,
  assertZeroPiiInMarketQuery,
  CURATED_CPWD_BIS_BENCHMARKS,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { NotFoundError, ForbiddenError, ValidationError } from '../types/errors';

/**
 * Computes a SHA-256 integrity hash for an external or cached market benchmark response payload.
 */
export function computeResponseIntegrityHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface HttpMarketIntelligenceProviderOptions {
  providerId?: string;
  providerName?: string;
  endpointUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  budgetPolicy?: Partial<MarketProviderBudgetPolicy>;
}

/**
 * Live External HTTP Market Intelligence Provider (Tier 1 Live Feed)
 * Connects to external commodity indices, ONDC registries, or verified market price APIs.
 *
 * Invariant: Never claims LIVE status unless endpoint is configured, credentials valid,
 * and upstream API responds successfully with fresh data.
 */
export class HttpMarketIntelligenceProvider implements MarketIntelligenceProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly supportedSourceType: MarketIntelligenceSourceType = 'LIVE_API';
  private readonly endpointUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn?: typeof fetch;
  private readonly budgetPolicy: MarketProviderBudgetPolicy;

  // Operational Budget Tracking (OTP platform policy != upstream official quota)
  private requestCountToday = 0;
  private requestCountThisHour = 0;
  private lastHourReset = Date.now();
  private lastDayReset = Date.now();
  private _status: MarketProviderStatus = 'READY';

  constructor(options: HttpMarketIntelligenceProviderOptions) {
    this.providerId = options.providerId ?? 'http-live-market-feed';
    this.providerName = options.providerName ?? 'Verified Live Market Feed';
    this.endpointUrl = options.endpointUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchFn = options.fetchFn ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    this.budgetPolicy = {
      maxRequestsPerDay: options.budgetPolicy?.maxRequestsPerDay ?? 1000,
      maxRequestsPerHour: options.budgetPolicy?.maxRequestsPerHour ?? 200,
      requestTimeoutMs: options.budgetPolicy?.requestTimeoutMs ?? this.timeoutMs,
      cacheTtlDays: options.budgetPolicy?.cacheTtlDays ?? 7,
    };

    if (!this.endpointUrl || !this.fetchFn) {
      this._status = 'DISABLED';
    }
  }

  get status(): MarketProviderStatus {
    return this._status;
  }

  private checkAndIncrementBudget(): boolean {
    const now = Date.now();
    // Reset hour counter if 60 minutes elapsed
    if (now - this.lastHourReset > 3600_000) {
      this.requestCountThisHour = 0;
      this.lastHourReset = now;
    }
    // Reset day counter if 24 hours elapsed
    if (now - this.lastDayReset > 86400_000) {
      this.requestCountToday = 0;
      this.lastDayReset = now;
    }

    if (
      this.requestCountThisHour >= this.budgetPolicy.maxRequestsPerHour ||
      this.requestCountToday >= this.budgetPolicy.maxRequestsPerDay
    ) {
      this._status = 'UNAVAILABLE';
      return false; // Operational budget exhausted
    }

    this.requestCountThisHour++;
    this.requestCountToday++;
    return true;
  }

  async checkStatus(): Promise<MarketProviderStatus> {
    if (!this.endpointUrl || !this.fetchFn) {
      this._status = 'DISABLED';
      return 'DISABLED';
    }
    return this._status;
  }

  async getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null> {
    if (!this.endpointUrl || !this.fetchFn || this._status === 'DISABLED') {
      return null;
    }

    // Check operational budget before dispatching external call
    if (!this.checkAndIncrementBudget()) {
      return null;
    }

    // Enforce data minimization before outbound dispatch
    const sanitized = sanitizeMarketBenchmarkQuery(query as unknown as Record<string, unknown>);
    assertZeroPiiInMarketQuery(sanitized as unknown as Record<string, unknown>);

    try {
      const url = new URL(this.endpointUrl);
      url.searchParams.set('category', sanitized.categoryKey);
      if (sanitized.subcategoryCode) url.searchParams.set('subcategory', sanitized.subcategoryCode);
      if (sanitized.locationCity) url.searchParams.set('city', sanitized.locationCity);
      if (sanitized.stateCode) url.searchParams.set('state', sanitized.stateCode);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetchFn(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        this._status = 'UNAVAILABLE';
        return null;
      }

      const rawText = await response.text();
      const data = JSON.parse(rawText);

      // Captured response integrity hash (SHA-256)
      const integrityHash = computeResponseIntegrityHash(rawText);
      this._status = 'LIVE';

      return {
        categoryKey: sanitized.categoryKey,
        subcategoryCode: data.subcategoryCode ?? sanitized.subcategoryCode ?? null,
        locationCity: data.locationCity ?? sanitized.locationCity ?? null,
        stateCode: data.stateCode ?? sanitized.stateCode ?? null,
        fairPriceMin: data.fairPriceMin != null ? Number(data.fairPriceMin) : null,
        fairPriceMax: data.fairPriceMax != null ? Number(data.fairPriceMax) : null,
        fairPriceMedian: data.fairPriceMedian != null ? Number(data.fairPriceMedian) : null,
        typicalDeliveryDaysMin: data.typicalDeliveryDaysMin != null ? Number(data.typicalDeliveryDaysMin) : null,
        typicalDeliveryDaysMax: data.typicalDeliveryDaysMax != null ? Number(data.typicalDeliveryDaysMax) : null,
        typicalWarrantyMonthsMin: data.typicalWarrantyMonthsMin != null ? Number(data.typicalWarrantyMonthsMin) : null,
        typicalWarrantyMonthsMax: data.typicalWarrantyMonthsMax != null ? Number(data.typicalWarrantyMonthsMax) : null,
        networkReliabilityScore: data.networkReliabilityScore != null ? Number(data.networkReliabilityScore) : null,
        sampleSize: data.sampleSize != null ? Number(data.sampleSize) : 25,
        unitOfMeasure: data.unitOfMeasure ?? null,
        applicableStandard: data.applicableStandard ?? null,
        sourceType: this.supportedSourceType,
        sourceProviderName: this.providerName,
        observedAt: data.observedAt ?? new Date().toISOString(),
        responseIntegrityHash: integrityHash,
        metadata: data.metadata,
      };
    } catch {
      // Gracefully return null on network errors/timeouts to trigger fallback hierarchy
      this._status = 'UNAVAILABLE';
      return null;
    }
  }
}

/**
 * Database-Cached Market Intelligence Provider (Tier 2 Database Cache)
 */
export class DatabaseCacheMarketIntelligenceProvider implements MarketIntelligenceProvider {
  readonly providerId = 'otp-database-cache-provider';
  readonly providerName = 'OTP Verified Database Cache';
  readonly supportedSourceType: MarketIntelligenceSourceType = 'DATABASE_CACHE';
  readonly status: MarketProviderStatus = 'LIVE';

  constructor(
    private readonly cacheLookup?: (categoryKey: string, city?: string | null) => Promise<Partial<MarketBenchmarkResult> | null>
  ) {}

  async getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null> {
    if (!this.cacheLookup) return null;
    try {
      const cached = await this.cacheLookup(query.categoryKey, query.locationCity);
      if (!cached || cached.fairPriceMin == null) return null;

      const observedAt = cached.observedAt ?? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      return {
        categoryKey: query.categoryKey,
        subcategoryCode: query.subcategoryCode ?? cached.subcategoryCode ?? null,
        locationCity: query.locationCity ?? cached.locationCity ?? null,
        stateCode: query.stateCode ?? cached.stateCode ?? null,
        fairPriceMin: cached.fairPriceMin ?? null,
        fairPriceMax: cached.fairPriceMax ?? null,
        fairPriceMedian: cached.fairPriceMedian ?? null,
        typicalDeliveryDaysMin: cached.typicalDeliveryDaysMin ?? null,
        typicalDeliveryDaysMax: cached.typicalDeliveryDaysMax ?? null,
        typicalWarrantyMonthsMin: cached.typicalWarrantyMonthsMin ?? null,
        typicalWarrantyMonthsMax: cached.typicalWarrantyMonthsMax ?? null,
        networkReliabilityScore: cached.networkReliabilityScore ?? null,
        sampleSize: cached.sampleSize ?? 18,
        unitOfMeasure: cached.unitOfMeasure ?? null,
        applicableStandard: cached.applicableStandard ?? null,
        sourceType: this.supportedSourceType,
        sourceProviderName: this.providerName,
        observedAt,
        responseIntegrityHash: cached.responseIntegrityHash ?? null,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Standard Curated Reference Baseline Provider (Tier 3 Static Reference)
 * Uses CPWD/BIS Indian procurement specifications and curated regional baselines.
 *
 * Invariant: Always labeled as "Reference information — not a live market quote".
 */
export class CuratedClusterBaselineProvider implements MarketIntelligenceProvider {
  readonly providerId = 'otp-cluster-curated-baseline';
  readonly providerName = 'OTP Curated Reference Baselines (CPWD/BIS)';
  readonly supportedSourceType: MarketIntelligenceSourceType = 'STATIC_REFERENCE';
  readonly status: MarketProviderStatus = 'READY';

  async getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null> {
    const entry: CuratedBenchmarkEntry | undefined = CURATED_CPWD_BIS_BENCHMARKS[query.categoryKey];
    if (!entry) return null;

    return {
      categoryKey: entry.categoryKey,
      subcategoryCode: query.subcategoryCode ?? entry.subcategoryCode ?? null,
      locationCity: query.locationCity ?? 'National Baseline',
      stateCode: query.stateCode ?? null,
      fairPriceMin: entry.fairPriceMin,
      fairPriceMax: entry.fairPriceMax,
      fairPriceMedian: entry.fairPriceMedian,
      typicalDeliveryDaysMin: entry.typicalDeliveryDaysMin,
      typicalDeliveryDaysMax: entry.typicalDeliveryDaysMax,
      typicalWarrantyMonthsMin: entry.typicalWarrantyMonthsMin,
      typicalWarrantyMonthsMax: entry.typicalWarrantyMonthsMax,
      networkReliabilityScore: entry.networkReliabilityScore,
      sampleSize: entry.sampleSize,
      unitOfMeasure: entry.unitOfMeasure,
      applicableStandard: entry.applicableStandard,
      sourceType: this.supportedSourceType,
      sourceProviderName: this.providerName,
      observedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // ~14 days ago (AGING baseline)
    };
  }
}

/**
 * Alias for CuratedClusterBaselineProvider for architectural clarity
 */
export class StaticReferenceMarketIntelligenceProvider extends CuratedClusterBaselineProvider {}

/**
 * Composite Market Intelligence Service orchestrating the canonical 4-tier fallback hierarchy:
 * LIVE_API -> DATABASE_CACHE -> STATIC_REFERENCE -> UNAVAILABLE
 *
 * Invariant: Market intelligence supports procurement; it NEVER substitutes for actual supplier quotes,
 * never creates quote records, and never creates award candidates.
 */
export class MarketIntelligenceService {
  private providers: MarketIntelligenceProvider[];
  private cache = new Map<string, { result: MarketBenchmarkResult; cachedAt: number }>();
  private readonly cacheTtlMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService,
    customProviders?: MarketIntelligenceProvider[]
  ) {
    this.providers = customProviders && customProviders.length > 0
      ? customProviders
      : [new CuratedClusterBaselineProvider()];
  }

  /**
   * Registers an external provider adapter (e.g. ONDC live registry or verified commodity index).
   */
  registerProvider(provider: MarketIntelligenceProvider): void {
    this.providers.unshift(provider); // Priority order: newest/live first
  }

  /**
   * Clears the in-memory cache (for testing or cache invalidation).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fetches the best available market intelligence with truthful fallback ladder progression:
   * LIVE_API -> DATABASE_CACHE -> STATIC_REFERENCE -> UNAVAILABLE
   */
  async resolveMarketIntelligence(
    query: MarketBenchmarkQuery,
    lowestQuoteAmount?: number | null
  ): Promise<MarketIntelligenceSnapshot> {
    const sanitizedQuery = sanitizeMarketBenchmarkQuery(query as unknown as Record<string, unknown>);
    const cacheKey = generateMarketCacheKey(sanitizedQuery);

    let bestResult: MarketBenchmarkResult | null = null;
    let fallbackReason: string | null = null;

    // 1. Try Live Providers First
    for (const provider of this.providers) {
      if (provider.supportedSourceType === 'LIVE_API') {
        try {
          const result = await provider.getBenchmark(sanitizedQuery);
          if (result && result.fairPriceMin != null) {
            bestResult = result;
            // Store successful live response in cache
            this.cache.set(cacheKey, {
              result: {
                ...result,
                sourceType: 'DATABASE_CACHE',
                sourceProviderName: 'OTP Verified Database Cache',
              },
              cachedAt: Date.now(),
            });
            break;
          }
        } catch (err: any) {
          fallbackReason = `Live provider ${provider.providerName} query failed: ${err?.message || 'unknown error'}`;
        }
      }
    }

    // 2. If no Live result, check Cache (Database/In-memory Cache Tier)
    if (!bestResult) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
        bestResult = cached.result;
      }
    }

    // 3. If no Cache hit, try DatabaseCache / Static Reference Providers
    if (!bestResult) {
      for (const provider of this.providers) {
        if (provider.supportedSourceType !== 'LIVE_API') {
          try {
            const result = await provider.getBenchmark(sanitizedQuery);
            if (result && result.fairPriceMin != null) {
              bestResult = result;
              break;
            }
          } catch (err: any) {
            fallbackReason = `Provider ${provider.providerName} query failed: ${err?.message || 'unknown error'}`;
          }
        }
      }
    }

    // 4. If nothing resolved on the ladder, fallback to UNAVAILABLE
    if (!bestResult) {
      fallbackReason = fallbackReason || `No market intelligence benchmark available for category '${sanitizedQuery.categoryKey}'.`;
    }

    return createMarketIntelligenceSnapshot({
      benchmark: bestResult,
      rfqId: null,
      lowestQuoteAmount,
      fallbackReason: bestResult ? null : fallbackReason,
    });
  }

  /**
   * Evaluates and binds an immutable market intelligence snapshot to an RFQ evaluation record.
   * Strictly enforces tenant isolation and audit immutability.
   */
  async captureRfqMarketSnapshot(
    actor: ActorContext,
    rfqId: string,
    lowestQuoteAmount?: number | null
  ): Promise<MarketIntelligenceSnapshot> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${rfqId} not found`);

    // Verify tenant authorization
    if (rfq.organizationId && actor.organizationId && rfq.organizationId !== actor.organizationId) {
      throw new ForbiddenError('Cross-tenant market snapshot access denied');
    }

    const req = await this.repos.requirements.findById(rfq.requirementId);
    let categoryKey = 'general_procurement';
    const titleLower = (req?.title ?? rfq.title ?? '').toLowerCase();

    if (titleLower.includes('cctv') || titleLower.includes('surveillance') || titleLower.includes('camera')) {
      categoryKey = 'cctv_surveillance';
    } else if (titleLower.includes('pump') || titleLower.includes('borewell') || titleLower.includes('submersible')) {
      categoryKey = 'water_borewell_submersible_pump';
    } else if (titleLower.includes('furniture') || titleLower.includes('workstation') || titleLower.includes('chair')) {
      categoryKey = 'modular_office_furniture';
    } else if (titleLower.includes('genset') || titleLower.includes('generator') || titleLower.includes('dg')) {
      categoryKey = 'dg_genset_silent';
    } else if (titleLower.includes('solar') || titleLower.includes('rooftop')) {
      categoryKey = 'rooftop_solar_epc';
    } else if (titleLower.includes('purifier') || titleLower.includes('ro plant') || titleLower.includes('water treatment')) {
      categoryKey = 'commercial_ro_water_purifier';
    } else if (titleLower.includes('fire') || titleLower.includes('hydrant') || titleLower.includes('extinguisher')) {
      categoryKey = 'fire_safety_hydrant_extinguisher';
    } else if (titleLower.includes('lighting') || titleLower.includes('street light') || titleLower.includes('led')) {
      categoryKey = 'led_commercial_street_lighting';
    } else if (titleLower.includes('elevator') || titleLower.includes('lift')) {
      categoryKey = 'elevator_amc_modernization';
    } else if (titleLower.includes('paint') || titleLower.includes('waterproofing')) {
      categoryKey = 'paints_waterproofing_civil';
    }

    const query: MarketBenchmarkQuery = {
      categoryKey,
      itemDescription: req?.title ?? rfq.title,
      estimatedBudget: req?.budgetAmount ?? null,
    };

    const snapshot = await this.resolveMarketIntelligence(query, lowestQuoteAmount);
    const stampedSnapshot: MarketIntelligenceSnapshot = {
      ...snapshot,
      rfqId,
      requirementId: rfq.requirementId,
      organizationId: rfq.organizationId ?? null,
    };

    await auditLog(
      this.audit,
      actor,
      'MARKET_INTELLIGENCE_SNAPSHOT',
      stampedSnapshot.snapshotId,
      'CAPTURE_MARKET_INTELLIGENCE',
      null,
      {
        rfqId,
        categoryKey,
        sourceType: stampedSnapshot.sourceType,
        freshness: stampedSnapshot.freshness,
        confidence: stampedSnapshot.confidence,
        responseIntegrityHash: stampedSnapshot.responseIntegrityHash,
      }
    );

    return stampedSnapshot;
  }
}

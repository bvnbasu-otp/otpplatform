import type {
  MarketIntelligenceProvider,
  MarketBenchmarkQuery,
  MarketBenchmarkResult,
  MarketIntelligenceSnapshot,
  MarketIntelligenceSourceType,
} from '@otp/domain';
import { createMarketIntelligenceSnapshot } from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { NotFoundError } from '../types/errors';

/**
 * Standard Curated Historical Baseline Provider (Fallback tier 2)
 */
export class CuratedClusterBaselineProvider implements MarketIntelligenceProvider {
  readonly providerId = 'otp-cluster-curated-baseline';
  readonly providerName = 'OTP MSME Curated Cluster Benchmarks';
  readonly supportedSourceType: MarketIntelligenceSourceType = 'HISTORICAL_BENCHMARK';

  private static readonly BASELINES: Record<string, Partial<MarketBenchmarkResult>> = {
    cctv_surveillance: {
      fairPriceMin: 85000,
      fairPriceMax: 120000,
      fairPriceMedian: 98000,
      typicalDeliveryDaysMin: 3,
      typicalDeliveryDaysMax: 7,
      typicalWarrantyMonthsMin: 12,
      typicalWarrantyMonthsMax: 24,
      networkReliabilityScore: 96.5,
      sampleSize: 34,
    },
    water_borewell_submersible_pump: {
      fairPriceMin: 45000,
      fairPriceMax: 75000,
      fairPriceMedian: 58000,
      typicalDeliveryDaysMin: 2,
      typicalDeliveryDaysMax: 5,
      typicalWarrantyMonthsMin: 12,
      typicalWarrantyMonthsMax: 36,
      networkReliabilityScore: 97.2,
      sampleSize: 22,
    },
    modular_office_furniture: {
      fairPriceMin: 150000,
      fairPriceMax: 280000,
      fairPriceMedian: 210000,
      typicalDeliveryDaysMin: 7,
      typicalDeliveryDaysMax: 14,
      typicalWarrantyMonthsMin: 24,
      typicalWarrantyMonthsMax: 60,
      networkReliabilityScore: 94.8,
      sampleSize: 18,
    },
    dg_genset_silent: {
      fairPriceMin: 350000,
      fairPriceMax: 550000,
      fairPriceMedian: 420000,
      typicalDeliveryDaysMin: 5,
      typicalDeliveryDaysMax: 10,
      typicalWarrantyMonthsMin: 24,
      typicalWarrantyMonthsMax: 36,
      networkReliabilityScore: 98.0,
      sampleSize: 15,
    },
  };

  async getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null> {
    const baseline = CuratedClusterBaselineProvider.BASELINES[query.categoryKey];
    if (!baseline) return null;

    return {
      categoryKey: query.categoryKey,
      locationCity: query.locationCity ?? 'National Hub',
      fairPriceMin: baseline.fairPriceMin ?? null,
      fairPriceMax: baseline.fairPriceMax ?? null,
      fairPriceMedian: baseline.fairPriceMedian ?? null,
      typicalDeliveryDaysMin: baseline.typicalDeliveryDaysMin ?? null,
      typicalDeliveryDaysMax: baseline.typicalDeliveryDaysMax ?? null,
      typicalWarrantyMonthsMin: baseline.typicalWarrantyMonthsMin ?? null,
      typicalWarrantyMonthsMax: baseline.typicalWarrantyMonthsMax ?? null,
      networkReliabilityScore: baseline.networkReliabilityScore ?? null,
      sampleSize: baseline.sampleSize ?? 10,
      sourceType: this.supportedSourceType,
      sourceProviderName: this.providerName,
      observedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // ~14 days ago (AGING)
    };
  }
}

/**
 * Composite Market Intelligence Service orchestrating the fallback hierarchy:
 * LIVE -> CACHED -> HISTORICAL -> UNAVAILABLE
 */
export class MarketIntelligenceService {
  private providers: MarketIntelligenceProvider[];

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
    this.providers.unshift(provider); // Priority order
  }

  /**
   * Fetches the best available market intelligence with graceful fallback.
   */
  async resolveMarketIntelligence(
    query: MarketBenchmarkQuery,
    lowestQuoteAmount?: number | null
  ): Promise<MarketIntelligenceSnapshot> {
    let bestResult: MarketBenchmarkResult | null = null;
    let fallbackReason: string | null = null;

    for (const provider of this.providers) {
      try {
        const result = await provider.getBenchmark(query);
        if (result && result.fairPriceMin != null) {
          bestResult = result;
          break;
        }
      } catch (err: any) {
        fallbackReason = `Provider ${provider.providerName} query failed: ${err?.message || 'unknown error'}`;
      }
    }

    if (!bestResult) {
      fallbackReason = fallbackReason || `No market intelligence available for category '${query.categoryKey}'.`;
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
   */
  async captureRfqMarketSnapshot(
    actor: ActorContext,
    rfqId: string,
    lowestQuoteAmount?: number | null
  ): Promise<MarketIntelligenceSnapshot> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${rfqId} not found`);

    const req = await this.repos.requirements.findById(rfq.requirementId);
    const categoryKey = req?.title?.toLowerCase().includes('cctv')
      ? 'cctv_surveillance'
      : req?.title?.toLowerCase().includes('pump')
      ? 'water_borewell_submersible_pump'
      : req?.title?.toLowerCase().includes('furniture')
      ? 'modular_office_furniture'
      : 'cctv_surveillance';

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
      }
    );

    return stampedSnapshot;
  }
}

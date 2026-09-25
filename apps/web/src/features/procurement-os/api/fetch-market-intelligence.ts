import { supabase } from '@/lib/supabase';
import type { MarketIntelligenceSummary } from '@otp/domain';
import { CURATED_CPWD_BIS_BENCHMARKS } from '@otp/domain';
import { getPilotByRfqId } from '@/lib/pilots';

interface BaselineRow {
  category_key: string;
  location_city: string | null;
  historical_price_min: number | null;
  historical_price_max: number | null;
  typical_delivery_days_min: number | null;
  typical_delivery_days_max: number | null;
  typical_warranty_months_min: number | null;
  typical_warranty_months_max: number | null;
  supplier_performance_avg: number | null;
  sample_size: number;
}

interface SnapshotShape {
  matchedKey?: string;
  matchedScope?: MarketIntelligenceSummary['matchedScope'];
  matchedCity?: string | null;
  historicalPriceMin?: number | null;
  historicalPriceMax?: number | null;
  typicalDeliveryDaysMin?: number | null;
  typicalDeliveryDaysMax?: number | null;
  typicalWarrantyMonthsMin?: number | null;
  typicalWarrantyMonthsMax?: number | null;
  supplierPerformanceAvg?: number | null;
  sampleSize?: number | null;
  notes?: string | null;
  capturedAt?: string | null;
  responseIntegrityHash?: string | null;
}

interface MarketSnapshotRow {
  id: string;
  category_key: string;
  location_city: string | null;
  fair_price_min: number | null;
  fair_price_max: number | null;
  fair_price_median: number | null;
  typical_delivery_days_min: number | null;
  typical_delivery_days_max: number | null;
  typical_warranty_months_min: number | null;
  typical_warranty_months_max: number | null;
  network_reliability_score: number | null;
  sample_size: number;
  source_type: string;
  source_provider_name: string;
  observed_at: string;
  freshness_status: string;
  confidence_level: string;
  confidence_score: number;
  confidence_methodology: string;
  is_fallback: boolean;
  fallback_reason: string | null;
  created_at: string;
}

function mapBaseline(row: BaselineRow): MarketIntelligenceSummary {
  return {
    categoryKey: row.category_key,
    locationCity: row.location_city,
    historicalPriceMin: row.historical_price_min != null ? Number(row.historical_price_min) : null,
    historicalPriceMax: row.historical_price_max != null ? Number(row.historical_price_max) : null,
    typicalDeliveryDaysMin: row.typical_delivery_days_min,
    typicalDeliveryDaysMax: row.typical_delivery_days_max,
    typicalWarrantyMonthsMin: row.typical_warranty_months_min,
    typicalWarrantyMonthsMax: row.typical_warranty_months_max,
    supplierPerformanceAvg:
      row.supplier_performance_avg != null ? Number(row.supplier_performance_avg) : null,
    sampleSize: row.sample_size,
    sourceType: 'STATIC_REFERENCE',
    sourceProviderName: 'OTP Curated Reference Baselines (CPWD/BIS)',
    freshnessStatus: 'AGING',
    confidenceLevel: 'MEDIUM',
    confidenceScore: 65,
    confidenceMethodology: `Audited CPWD/BIS reference baseline from ${row.sample_size} records.`,
  };
}

function mapSnapshot(snapshot: SnapshotShape): MarketIntelligenceSummary | null {
  const key = snapshot.matchedKey;
  if (!key) return null;
  return {
    categoryKey: key,
    locationCity: snapshot.matchedCity ?? null,
    historicalPriceMin: snapshot.historicalPriceMin ?? null,
    historicalPriceMax: snapshot.historicalPriceMax ?? null,
    typicalDeliveryDaysMin: snapshot.typicalDeliveryDaysMin ?? null,
    typicalDeliveryDaysMax: snapshot.typicalDeliveryDaysMax ?? null,
    typicalWarrantyMonthsMin: snapshot.typicalWarrantyMonthsMin ?? null,
    typicalWarrantyMonthsMax: snapshot.typicalWarrantyMonthsMax ?? null,
    supplierPerformanceAvg: snapshot.supplierPerformanceAvg ?? null,
    sampleSize: snapshot.sampleSize ?? 0,
    matchedKey: key,
    matchedScope: snapshot.matchedScope,
    matchedCity: snapshot.matchedCity ?? null,
    notes: snapshot.notes ?? null,
    capturedAt: snapshot.capturedAt ?? null,
    sourceType: 'PLATFORM_TRANSACTED',
    sourceProviderName: 'OTP Transacted Requirement Snapshot',
    freshnessStatus: 'FRESH',
    confidenceLevel: 'HIGH',
    confidenceScore: 85,
    confidenceMethodology: 'Captured from verified requirement evaluation transaction.',
    responseIntegrityHash: snapshot.responseIntegrityHash ?? null,
  };
}

function mapMarketSnapshotRow(row: MarketSnapshotRow): MarketIntelligenceSummary {
  return {
    categoryKey: row.category_key,
    locationCity: row.location_city,
    historicalPriceMin: row.fair_price_min != null ? Number(row.fair_price_min) : null,
    historicalPriceMax: row.fair_price_max != null ? Number(row.fair_price_max) : null,
    typicalDeliveryDaysMin: row.typical_delivery_days_min,
    typicalDeliveryDaysMax: row.typical_delivery_days_max,
    typicalWarrantyMonthsMin: row.typical_warranty_months_min,
    typicalWarrantyMonthsMax: row.typical_warranty_months_max,
    supplierPerformanceAvg:
      row.network_reliability_score != null ? Number(row.network_reliability_score) : null,
    sampleSize: row.sample_size,
    sourceType: (row.source_type as any) || 'DATABASE_CACHE',
    sourceProviderName: row.source_provider_name,
    freshnessStatus: (row.freshness_status as any) || 'FRESH',
    confidenceLevel: (row.confidence_level as any) || 'HIGH',
    confidenceScore: row.confidence_score,
    confidenceMethodology: row.confidence_methodology,
    isFallback: row.is_fallback,
    fallbackReason: row.fallback_reason,
    observedAt: row.observed_at,
    capturedAt: row.created_at,
  };
}

export async function fetchMarketIntelligence(
  rfqId: string,
  categoryKey?: string,
): Promise<
  { ok: true; intelligence: MarketIntelligenceSummary } | { ok: false; error: string }
> {
  let intelligence: MarketIntelligenceSummary | null = null;

  // 1. Check for immutable stamped market intelligence snapshot on RFQ
  try {
    const { data: stampedRow } = await supabase
      .from('market_intelligence_snapshots')
      .select('*')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stampedRow) {
      intelligence = mapMarketSnapshotRow(stampedRow as MarketSnapshotRow);
    }
  } catch {
    // Graceful fallback to requirement snapshot
  }

  const { data: rfqRow } = await supabase
    .from('rfqs')
    .select('id, requirement_id, title')
    .eq('id', rfqId)
    .maybeSingle();

  let reqTitle = rfqRow?.title || '';
  let reqCity = '';

  if (!intelligence && rfqRow?.requirement_id) {
    const { data: requirementRow } = await supabase
      .from('requirements')
      .select('title, description, budget_amount, location, market_intel_snapshot')
      .eq('id', rfqRow.requirement_id)
      .maybeSingle();

    if (requirementRow) {
      reqTitle = requirementRow.title || reqTitle;
      reqCity = (requirementRow.location as { city?: string })?.city || '';

      const snapshot = requirementRow.market_intel_snapshot as SnapshotShape | null;
      if (snapshot && snapshot.historicalPriceMin != null) {
        intelligence = mapSnapshot(snapshot);
      }
    }
  }

  // 2. If no snapshot, search baselines by keyword or pilot
  if (!intelligence) {
    const pilot = getPilotByRfqId(rfqId);
    let key = categoryKey ?? pilot?.marketIntelCategory;

    if (!key) {
      const lower = reqTitle.toLowerCase();
      if (lower.includes('cctv') || lower.includes('camera') || lower.includes('surveillance') || lower.includes('security')) {
        key = 'cctv_surveillance';
      } else if (lower.includes('pump') || lower.includes('borewell') || lower.includes('submersible') || lower.includes('motor')) {
        key = 'water_borewell_submersible_pump';
      } else if (lower.includes('sofa') || lower.includes('furniture') || lower.includes('chair') || lower.includes('workstation')) {
        key = 'modular_office_furniture';
      } else if (lower.includes('genset') || lower.includes('generator') || lower.includes('dg')) {
        key = 'dg_genset_silent';
      } else if (lower.includes('solar') || lower.includes('rooftop')) {
        key = 'rooftop_solar_epc';
      } else if (lower.includes('purifier') || lower.includes('ro plant') || lower.includes('water treatment')) {
        key = 'commercial_ro_water_purifier';
      } else if (lower.includes('fire') || lower.includes('hydrant') || lower.includes('extinguisher')) {
        key = 'fire_safety_hydrant_extinguisher';
      } else if (lower.includes('lighting') || lower.includes('street light') || lower.includes('led')) {
        key = 'led_commercial_street_lighting';
      } else if (lower.includes('elevator') || lower.includes('lift')) {
        key = 'elevator_amc_modernization';
      } else if (lower.includes('paint') || lower.includes('waterproofing')) {
        key = 'paints_waterproofing_civil';
      } else {
        key = 'general_procurement';
      }
    }

    // Try database baseline table
    try {
      const { data: baseline } = await supabase
        .from('market_intelligence_baselines')
        .select(
          'category_key, location_city, historical_price_min, historical_price_max, typical_delivery_days_min, typical_delivery_days_max, typical_warranty_months_min, typical_warranty_months_max, supplier_performance_avg, sample_size',
        )
        .eq('category_key', key)
        .order('location_city', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (baseline) {
        intelligence = mapBaseline(baseline as BaselineRow);
        intelligence.matchedKey = key;
        intelligence.matchedScope = 'category';
      }
    } catch {
      // Graceful fallback to static reference catalog
    }

    // Curated CPWD / BIS reference catalog fallback
    if (!intelligence) {
      const curated = CURATED_CPWD_BIS_BENCHMARKS[key];
      if (curated) {
        intelligence = {
          categoryKey: curated.categoryKey,
          locationCity: reqCity || 'National Baseline',
          historicalPriceMin: curated.fairPriceMin,
          historicalPriceMax: curated.fairPriceMax,
          typicalDeliveryDaysMin: curated.typicalDeliveryDaysMin,
          typicalDeliveryDaysMax: curated.typicalDeliveryDaysMax,
          typicalWarrantyMonthsMin: curated.typicalWarrantyMonthsMin,
          typicalWarrantyMonthsMax: curated.typicalWarrantyMonthsMax,
          supplierPerformanceAvg: curated.networkReliabilityScore,
          sampleSize: curated.sampleSize,
          matchedKey: curated.categoryKey,
          matchedScope: 'category',
          sourceType: 'STATIC_REFERENCE',
          sourceProviderName: 'OTP Curated Reference Baselines (CPWD/BIS)',
          freshnessStatus: 'AGING',
          confidenceLevel: 'MEDIUM',
          confidenceScore: 65,
          confidenceMethodology: `Curated Indian Standard (${curated.applicableStandard}) from ${curated.sampleSize} benchmark records.`,
          isFallback: true,
          fallbackReason: 'Direct live API unconfigured; using curated CPWD/BIS reference benchmark.',
        };
      } else {
        // Honest UNAVAILABLE fallback — never fabricate random numbers
        intelligence = {
          categoryKey: key,
          locationCity: reqCity || null,
          historicalPriceMin: null,
          historicalPriceMax: null,
          typicalDeliveryDaysMin: null,
          typicalDeliveryDaysMax: null,
          typicalWarrantyMonthsMin: null,
          typicalWarrantyMonthsMax: null,
          supplierPerformanceAvg: null,
          sampleSize: 0,
          matchedKey: key,
          matchedScope: 'category',
          sourceType: 'UNAVAILABLE',
          sourceProviderName: 'NONE',
          freshnessStatus: 'UNAVAILABLE',
          confidenceLevel: 'INSUFFICIENT_DATA',
          confidenceScore: 0,
          confidenceMethodology: 'Market intelligence data is currently unavailable for this category/geography.',
          isFallback: true,
          fallbackReason: 'No live provider or reference baseline exists for this category code.',
        };
      }
    }
  }

  if (!intelligence) {
    return {
      ok: false,
      error: 'Unable to derive market intelligence benchmarks for this category',
    };
  }

  // Calculate live quote range from active quotes (non-destructive context)
  try {
    const { data: quoteRows } = await supabase
      .from('quotes')
      .select('id')
      .eq('rfq_id', rfqId)
      .in('status', ['SUBMITTED', 'FINAL', 'SELECTED']);

    const quoteIds = (quoteRows ?? []).map((q) => q.id);
    if (quoteIds.length > 0) {
      const { data: versions } = await supabase
        .from('quote_versions')
        .select('snapshot')
        .in('quote_id', quoteIds);

      const totals = (versions ?? [])
        .map((v) => (v.snapshot as { totalCost?: number })?.totalCost)
        .filter((t): t is number => t != null)
        .map(Number);

      if (totals.length > 0) {
        intelligence.currentQuoteRangeMin = Math.min(...totals);
        intelligence.currentQuoteRangeMax = Math.max(...totals);
      }
    }
  } catch {
    // Non-blocking quote spread calculation
  }

  return { ok: true, intelligence };
}

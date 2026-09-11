import type { MarketIntelligenceSummary } from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * Buyer-facing market intelligence at intake time.
 *
 * The lookup ladder lives in Postgres — see `public.lookup_market_intelligence`
 * in migration 00048. The wizard calls it with whatever taxonomy codes and
 * city the draft has so far. Anything missing is passed as null, and null
 * comes back honestly when no baseline matches. The wizard never fabricates a
 * band from thin air.
 */

export interface IntakeIntelligenceParams {
  subcategoryCode?: string | null;
  categoryCode?: string | null;
  city?: string | null;
}

export type FetchIntakeIntelligenceResult =
  | { ok: true; intelligence: MarketIntelligenceSummary | null }
  | { ok: false; error: string };

interface LookupRow {
  matchedKey?: string;
  matchedScope?: MarketIntelligenceSummary['matchedScope'];
  matchedCity?: string | null;
  categoryKey?: string;
  locationCity?: string | null;
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
}

export async function fetchIntakeIntelligence(
  params: IntakeIntelligenceParams,
): Promise<FetchIntakeIntelligenceResult> {
  const { data, error } = await supabase.rpc('lookup_market_intelligence', {
    p_subcategory_code: params.subcategoryCode ?? null,
    p_category_code: params.categoryCode ?? null,
    p_city: params.city ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: true, intelligence: null };
  }

  const row = data as LookupRow;
  const matchedKey = row.matchedKey ?? row.categoryKey;
  if (!matchedKey) {
    return { ok: true, intelligence: null };
  }

  return {
    ok: true,
    intelligence: {
      categoryKey: matchedKey,
      locationCity: row.matchedCity ?? row.locationCity ?? null,
      historicalPriceMin: row.historicalPriceMin ?? null,
      historicalPriceMax: row.historicalPriceMax ?? null,
      typicalDeliveryDaysMin: row.typicalDeliveryDaysMin ?? null,
      typicalDeliveryDaysMax: row.typicalDeliveryDaysMax ?? null,
      typicalWarrantyMonthsMin: row.typicalWarrantyMonthsMin ?? null,
      typicalWarrantyMonthsMax: row.typicalWarrantyMonthsMax ?? null,
      supplierPerformanceAvg: row.supplierPerformanceAvg ?? null,
      sampleSize: row.sampleSize ?? 0,
      matchedKey,
      matchedScope: row.matchedScope,
      matchedCity: row.matchedCity ?? null,
      notes: row.notes ?? null,
      capturedAt: row.capturedAt ?? null,
    },
  };
}

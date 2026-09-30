import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { runAuthoritativeLocationPinCoverage } from '../../../../packages/services/src/discovery/location-pin-coverage-orchestrator.ts';
import { SupabaseLocationPinCoverageStore } from './supabase-store.ts';

const FRESHNESS_DAYS = 30;
const DAILY_LIMIT = 1500;

export type CoverageRequest = {
  state?: string;
  city?: string;
  pincode?: string;
  category?: string;
  forceRefresh?: boolean;
  executeDiscovery?: boolean;
};

export async function runEdgeAuthoritativeLocationPinCoverage(
  client: SupabaseClient,
  body: CoverageRequest,
): Promise<Record<string, unknown>> {
  const apiKey =
    Deno.env.get('GOOGLE_PLACES_API_KEY')?.trim() || Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim() || '';
  const store = new SupabaseLocationPinCoverageStore(client, FRESHNESS_DAYS, DAILY_LIMIT);

  const result = await runAuthoritativeLocationPinCoverage(
    {
      state: body.state,
      city: body.city,
      pincode: body.pincode ?? '',
      category: body.category,
      forceRefresh: body.forceRefresh,
      executeDiscovery: body.executeDiscovery,
    },
    {
      store,
      freshnessWindowDays: FRESHNESS_DAYS,
      dailyLimit: DAILY_LIMIT,
      googleApiKey: apiKey || undefined,
      serverFetchFn: apiKey
        ? async (url: string, init?: RequestInit) => {
            const res = await fetch(url, init);
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            return { ...data, __httpStatus: res.status };
          }
        : undefined,
      allowLegacyMockDiscovery: false,
    },
  );

  return result as Record<string, unknown>;
}

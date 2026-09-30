/**
 * Narrow @otp/domain entry for the location-pin-coverage Supabase Edge bundle.
 * Re-exports only symbols imported by that function's dependency graph, with explicit .ts paths for Deno.
 */

export { SupplierNetwork } from '../enums/supplier-network.ts';
export { TruthfulProviderStatus } from '../enums/provider-execution.ts';

export {
  GisExecutionMode,
  type LocationIntelligencePort,
  type LocationDescriptor,
  type ServiceAreaDescriptor,
  type DistanceCalculationResult,
  type CoverageValidationResult,
  type ExternalGisProviderConfig,
} from '../gis/location-intelligence-port.ts';

export { getUtcDayKey, getUtcMonthKey } from '../gis/google-places-quota-window.ts';

export {
  buildGooglePlacesCategorySearchTerms,
  buildGooglePlacesTextQuery,
} from '../gis/google-places-category-search-terms.ts';

export { generateCrockfordAlias, CapabilityEvidenceTier } from '../types/supplier-network-engine.ts';

export {
  SupplierTruthfulVerificationStage,
  type DiscoveryScopeDescriptor,
  type ScopeCoverageReport,
  type ScopeFreshnessStatus,
} from '../types/supplier-network-refresh.ts';

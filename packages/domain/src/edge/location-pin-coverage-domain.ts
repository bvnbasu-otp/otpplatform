/**
 * Narrow @otp/domain entry for the location-pin-coverage Supabase Edge bundle.
 * Re-exports only symbols imported by that function's dependency graph, with explicit .ts paths for Deno.
 */

export { SupplierNetwork } from '../enums/supplier-network';
export { TruthfulProviderStatus } from '../enums/provider-execution';

export {
  GisExecutionMode,
  type LocationIntelligencePort,
  type LocationDescriptor,
  type ServiceAreaDescriptor,
  type DistanceCalculationResult,
  type CoverageValidationResult,
  type ExternalGisProviderConfig,
} from '../gis/location-intelligence-port';

export { getUtcDayKey, getUtcMonthKey } from '../gis/google-places-quota-window';

export {
  buildGooglePlacesCategorySearchTerms,
  buildGooglePlacesTextQuery,
} from '../gis/google-places-category-search-terms';

export { generateCrockfordAlias, CapabilityEvidenceTier } from '../types/supplier-network-engine';

export {
  SupplierTruthfulVerificationStage,
  type DiscoveryScopeDescriptor,
  type ScopeCoverageReport,
  type ScopeFreshnessStatus,
} from '../types/supplier-network-refresh';

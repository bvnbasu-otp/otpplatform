/**
 * Location & GIS domain models for provider-neutral spatial intelligence.
 * Does NOT require or depend on Google Maps API, external keys, or cloud geospatial services.
 */

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationDescriptor {
  city?: string | null;
  pinCode?: string | null;
  state?: string | null;
  country?: string | null;
  coordinates?: LocationCoordinates | null;
}

export interface ServiceAreaDescriptor extends LocationDescriptor {
  radiusKm?: number | null;
  isPrimary?: boolean;
}

export type DistanceCalculationMethod =
  | 'HAVERSINE_COORDINATES'
  | 'POSTAL_PIN_EXACT'
  | 'CITY_MATCH'
  | 'UNDECLARED_NEUTRAL'
  | 'FALLBACK_DEFAULT';

export interface DistanceCalculationResult {
  /** Distance in kilometers (if computable), undefined if neutral/undeclared */
  distanceKm?: number;
  /** True if within local commercial operational radius (typically <= 50km or same city/PIN) */
  isLocal: boolean;
  /** Estimated transit duration in days for procurement logistics */
  estimatedTransitDays?: number;
  /** Method utilized to calculate spatial distance */
  calculationMethod: DistanceCalculationMethod;
  /** Spatial confidence score 0-100 */
  confidenceScore: number;
}

export interface CoverageValidationResult {
  isCovered: boolean;
  reason: string;
  matchedOn: 'COORDINATES_RADIUS' | 'PINCODE' | 'CITY' | 'UNDECLARED_DEFAULT';
}

/**
 * Provider-neutral GIS Seam.
 * Enables interchangeable location intelligence adapters (Null, Haversine, Offline PostGIS, etc.)
 * without leaking Google or external provider credentials into core domain logic.
 */
export interface LocationIntelligencePort {
  /**
   * Calculate distance and locality between candidate supplier and delivery destination.
   */
  calculateDistance(
    origin: LocationDescriptor,
    destination: LocationDescriptor,
  ): Promise<DistanceCalculationResult>;

  /**
   * Validate whether a supplier service area covers the requirement delivery target.
   */
  validateCoverage(
    serviceArea: ServiceAreaDescriptor,
    target: LocationDescriptor,
  ): Promise<CoverageValidationResult>;
}

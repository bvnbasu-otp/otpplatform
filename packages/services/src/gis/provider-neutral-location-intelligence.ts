import type {
  LocationIntelligencePort,
  LocationDescriptor,
  ServiceAreaDescriptor,
  DistanceCalculationResult,
  CoverageValidationResult,
} from '@otp/domain';

/**
 * Standard Haversine distance formula between two GPS coordinates in kilometers.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Clean, provider-neutral Location Intelligence Implementation.
 * Operates entirely offline without external cloud API dependencies (no Google credentials, etc.).
 * Uses Haversine geometry when coordinates are available, exact PIN matching, or city normalization.
 */
export class ProviderNeutralLocationIntelligence implements LocationIntelligencePort {
  constructor(
    private readonly options: {
      defaultLocalThresholdKm?: number;
    } = {},
  ) {}

  async calculateDistance(
    origin: LocationDescriptor,
    destination: LocationDescriptor,
  ): Promise<DistanceCalculationResult> {
    const localThreshold = this.options.defaultLocalThresholdKm ?? 50;

    // 1. Precise Coordinate-Based Calculation via Haversine
    if (origin.coordinates && destination.coordinates) {
      const distanceKm = calculateHaversineDistanceKm(
        origin.coordinates.lat,
        origin.coordinates.lng,
        destination.coordinates.lat,
        destination.coordinates.lng,
      );
      const isLocal = distanceKm <= localThreshold;
      const estimatedTransitDays = distanceKm <= 50 ? 1 : distanceKm <= 300 ? 2 : 4;

      return {
        distanceKm,
        isLocal,
        estimatedTransitDays,
        calculationMethod: 'HAVERSINE_COORDINATES',
        confidenceScore: 95,
      };
    }

    // 2. Postal PIN Code Exact Match
    if (
      origin.pinCode &&
      destination.pinCode &&
      origin.pinCode.trim() === destination.pinCode.trim()
    ) {
      return {
        distanceKm: 5,
        isLocal: true,
        estimatedTransitDays: 1,
        calculationMethod: 'POSTAL_PIN_EXACT',
        confidenceScore: 90,
      };
    }

    // 3. City Name Match
    if (
      origin.city &&
      destination.city &&
      origin.city.trim().toLowerCase() === destination.city.trim().toLowerCase()
    ) {
      return {
        distanceKm: 15,
        isLocal: true,
        estimatedTransitDays: 1,
        calculationMethod: 'CITY_MATCH',
        confidenceScore: 80,
      };
    }

    // 4. Undeclared / Default Fallback
    const hasOrigin = Boolean(origin.city || origin.pinCode || origin.coordinates);
    const hasDestination = Boolean(destination.city || destination.pinCode || destination.coordinates);

    if (!hasOrigin || !hasDestination) {
      return {
        distanceKm: undefined,
        isLocal: true, // Neutral non-exclusionary default
        estimatedTransitDays: 3,
        calculationMethod: 'UNDECLARED_NEUTRAL',
        confidenceScore: 50,
      };
    }

    return {
      distanceKm: undefined,
      isLocal: false,
      estimatedTransitDays: 3,
      calculationMethod: 'FALLBACK_DEFAULT',
      confidenceScore: 60,
    };
  }

  async validateCoverage(
    serviceArea: ServiceAreaDescriptor,
    target: LocationDescriptor,
  ): Promise<CoverageValidationResult> {
    // 1. Coordinates with radius
    if (serviceArea.coordinates && target.coordinates) {
      const dist = calculateHaversineDistanceKm(
        serviceArea.coordinates.lat,
        serviceArea.coordinates.lng,
        target.coordinates.lat,
        target.coordinates.lng,
      );
      const maxRadius = serviceArea.radiusKm ?? 50;
      if (dist <= maxRadius) {
        return {
          isCovered: true,
          reason: `Within service radius (${dist} km <= ${maxRadius} km)`,
          matchedOn: 'COORDINATES_RADIUS',
        };
      }
      return {
        isCovered: false,
        reason: `Exceeds service radius (${dist} km > ${maxRadius} km)`,
        matchedOn: 'COORDINATES_RADIUS',
      };
    }

    // 2. Exact PIN Match
    if (
      serviceArea.pinCode &&
      target.pinCode &&
      serviceArea.pinCode.trim() === target.pinCode.trim()
    ) {
      return {
        isCovered: true,
        reason: `Service area PIN ${serviceArea.pinCode} matches delivery PIN`,
        matchedOn: 'PINCODE',
      };
    }

    // 3. City Match
    if (
      serviceArea.city &&
      target.city &&
      serviceArea.city.trim().toLowerCase() === target.city.trim().toLowerCase()
    ) {
      return {
        isCovered: true,
        reason: `Service area city "${serviceArea.city}" matches delivery city`,
        matchedOn: 'CITY',
      };
    }

    // 4. Undeclared Coverage (Neutral acceptance)
    const hasCoverageDeclared = Boolean(
      serviceArea.city || serviceArea.pinCode || serviceArea.coordinates,
    );
    if (!hasCoverageDeclared) {
      return {
        isCovered: true,
        reason: 'Undeclared service area — neutral acceptance',
        matchedOn: 'UNDECLARED_DEFAULT',
      };
    }

    return {
      isCovered: false,
      reason: 'No overlapping geography between supplier service area and target destination',
      matchedOn: 'CITY',
    };
  }
}

/**
 * Fallback Null Location Intelligence Port for zero-GIS environments.
 */
export class NullLocationIntelligence implements LocationIntelligencePort {
  async calculateDistance(
    _origin: LocationDescriptor,
    _destination: LocationDescriptor,
  ): Promise<DistanceCalculationResult> {
    return {
      distanceKm: undefined,
      isLocal: true,
      estimatedTransitDays: 3,
      calculationMethod: 'FALLBACK_DEFAULT',
      confidenceScore: 50,
    };
  }

  async validateCoverage(
    _serviceArea: ServiceAreaDescriptor,
    _target: LocationDescriptor,
  ): Promise<CoverageValidationResult> {
    return {
      isCovered: true,
      reason: 'Null GIS seam default coverage',
      matchedOn: 'UNDECLARED_DEFAULT',
    };
  }
}

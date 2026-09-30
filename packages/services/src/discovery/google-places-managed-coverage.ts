import {
  buildGooglePlacesCategorySearchTerms,
  buildGooglePlacesTextQuery,
  type DiscoveryScopeDescriptor,
} from '@otp/domain';
import type { QuotaRequestPriority } from '../gis/google-gis-safety-quota';
import {
  GooglePlacesDiscoveryAdapter,
  type GooglePlacesDiscoveryCriteria,
  type GooglePlacesRawCandidate,
} from '../gis/google-places-discovery-adapter';

export interface PinGeocodeResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

export interface ManagedGoogleDiscoveryOptions {
  forceRefresh?: boolean;
  priority?: QuotaRequestPriority;
  maxQueries?: number;
  apiKey?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
}

export interface ManagedGoogleDiscoveryResult {
  rawCandidates: GooglePlacesRawCandidate[];
  externalCallsUsed: number;
  quotaExhausted: boolean;
  authFailure: boolean;
  errorCode?: 'QUOTA_EXHAUSTED' | 'AUTH_FAILURE' | 'PROVIDER_ERROR';
  explanation: string;
}

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

export async function geocodeIndianPinCode(
  pinCode: string,
  options: { apiKey?: string; fetchFn?: (url: string) => Promise<unknown> },
): Promise<PinGeocodeResult | null> {
  const pin = pinCode.trim();
  if (!/^\d{6}$/.test(pin)) return null;
  const key = options.apiKey?.trim();
  if (!key || !options.fetchFn) return null;

  const url = `${GEOCODE_ENDPOINT}?components=postal_code:${encodeURIComponent(pin)}|country:IN&key=${encodeURIComponent(key)}`;
  try {
    const json = (await options.fetchFn(url)) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }>;
    };
    if (json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
      return null;
    }
    const loc = json.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return null;
    }
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: json.results?.[0]?.formatted_address,
    };
  } catch {
    return null;
  }
}

/**
 * Managed coverage path: live Google Text Search only (no static/simulated tiers), bounded queries, Place ID dedup.
 */
export async function runManagedGooglePlacesDiscovery(
  scope: DiscoveryScopeDescriptor,
  adapter: GooglePlacesDiscoveryAdapter,
  options: ManagedGoogleDiscoveryOptions = {},
): Promise<ManagedGoogleDiscoveryResult> {
  const apiKey =
    options.apiKey ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    undefined;
  const fetchFn = options.fetchFn;
  const city = scope.city.trim() || 'Bengaluru';
  const pinCode = scope.pincode.trim();
  const searchTerms = buildGooglePlacesCategorySearchTerms(scope.category, options.maxQueries ?? 3);

  if (!apiKey || !fetchFn) {
    return {
      rawCandidates: [],
      externalCallsUsed: 0,
      quotaExhausted: false,
      authFailure: !apiKey,
      errorCode: !apiKey ? 'AUTH_FAILURE' : 'PROVIDER_ERROR',
      explanation: 'Google Places credentials or server fetch handler unavailable.',
    };
  }

  const geocoded = await geocodeIndianPinCode(pinCode, { apiKey, fetchFn });
  let externalCallsUsed = geocoded ? 1 : 0;

  const seenPlaceIds = new Set<string>();
  const aggregated: GooglePlacesRawCandidate[] = [];

  for (const term of searchTerms) {
    const criteria: GooglePlacesDiscoveryCriteria = {
      category: scope.category,
      location: {
        city,
        pinCode,
        state: scope.state,
        country: 'IN',
        coordinates: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : undefined,
      },
      radiusKm: 25,
      priority: options.priority ?? 'BUYER_DEMAND',
    };

    const result = await adapter.discoverManagedCoverage(criteria, {
      searchQuery: buildGooglePlacesTextQuery(term, city, pinCode),
      geocodedCenter: geocoded ?? undefined,
      fetchFn,
      apiKey,
      forceRefresh: options.forceRefresh,
    });

    externalCallsUsed += result.externalCallsUsed;

    if (result.errorCode === 'QUOTA_EXHAUSTED') {
      return {
        rawCandidates: aggregated,
        externalCallsUsed,
        quotaExhausted: true,
        authFailure: false,
        errorCode: 'QUOTA_EXHAUSTED',
        explanation: result.explanation,
      };
    }
    if (result.errorCode === 'AUTH_FAILURE') {
      return {
        rawCandidates: aggregated,
        externalCallsUsed,
        quotaExhausted: false,
        authFailure: true,
        errorCode: 'AUTH_FAILURE',
        explanation: result.explanation,
      };
    }

    for (const raw of result.rawResults) {
      if (!raw.placeId || seenPlaceIds.has(raw.placeId)) continue;
      seenPlaceIds.add(raw.placeId);
      aggregated.push(raw);
    }
  }

  return {
    rawCandidates: aggregated,
    externalCallsUsed,
    quotaExhausted: false,
    authFailure: false,
    explanation:
      aggregated.length > 0
        ? `Managed Google discovery returned ${aggregated.length} unique Place IDs for ${pinCode}.`
        : `Managed Google discovery completed with zero Place matches for ${pinCode} (not cached as fresh coverage).`,
  };
}

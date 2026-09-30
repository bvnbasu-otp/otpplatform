import {
  buildGooglePlacesCategorySearchTerms,
  buildGooglePlacesTextQuery,
  type DiscoveryScopeDescriptor,
} from '@otp/domain';
import type { QuotaRequestPriority } from '../gis/google-gis-safety-quota.ts';
import {
  GooglePlacesDiscoveryAdapter,
  type GooglePlacesDiscoveryCriteria,
  type GooglePlacesRawCandidate,
} from '../gis/google-places-discovery-adapter.ts';

export interface PinGeocodeResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

export type GeocodeFailureKind =
  | 'REQUEST_DENIED'
  | 'ZERO_RESULTS'
  | 'INVALID_REQUEST'
  | 'OVER_QUERY_LIMIT'
  | 'UNKNOWN_ERROR'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'MALFORMED_RESPONSE';

export type PinGeocodeOutcome =
  | { ok: true; result: PinGeocodeResult }
  | { ok: false; failureKind: GeocodeFailureKind; explanation: string };

export interface ManagedGoogleDiscoveryOptions {
  forceRefresh?: boolean;
  priority?: QuotaRequestPriority;
  maxQueries?: number;
  apiKey?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
  /** Set only by runAuthoritativeLocationPinCoverage — blocks direct production callers. */
  orchestratorAuthorized?: boolean;
  /** Re-check Postgres/in-memory generation lock before each billable HTTP. */
  assertLockHeld?: () => Promise<boolean>;
  /** When set, each Text Search reserves 1 unit before the HTTP call (authoritative budget). */
  reserveCallFn?: () => Promise<boolean>;
}

export interface ManagedGoogleDiscoveryResult {
  rawCandidates: GooglePlacesRawCandidate[];
  externalCallsUsed: number;
  quotaExhausted: boolean;
  authFailure: boolean;
  errorCode?: 'QUOTA_EXHAUSTED' | 'AUTH_FAILURE' | 'PROVIDER_ERROR' | 'GEOCODE_FAILED';
  explanation: string;
}

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

function gap01SafeGeocodeErrorReason(message?: string): string | undefined {
  if (!message || typeof message !== 'string') return undefined;
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 120) return undefined;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('key=') ||
    lower.includes('authorization') ||
    lower.includes('maps.googleapis.com') ||
    lower.includes('http://') ||
    lower.includes('https://')
  ) {
    return undefined;
  }
  return trimmed;
}

function gap01LogGeocodeDiagnostics(json: {
    __httpStatus?: number;
    status?: string;
    error_message?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  },
): void {
  const httpStatus = typeof json.__httpStatus === 'number' ? json.__httpStatus : 0;
  console.log(`GAP01_GEOCODE_HTTP_STATUS httpStatus=${httpStatus}`);
  const googleStatus = json.status ?? 'UNKNOWN_ERROR';
  const resultCount = Array.isArray(json.results) ? json.results.length : 0;
  console.log(`GAP01_GEOCODE_GOOGLE_STATUS googleStatus=${googleStatus}`);
  console.log(`GAP01_GEOCODE_RESULT_COUNT count=${resultCount}`);
  const loc = json.results?.[0]?.geometry?.location;
  const coordsPresent =
    googleStatus === 'OK' &&
    loc !== undefined &&
    typeof loc.lat === 'number' &&
    typeof loc.lng === 'number';
  console.log(`GAP01_GEOCODE_COORDINATES_PRESENT value=${coordsPresent}`);
  if (googleStatus !== 'OK') {
    console.log(`GAP01_GEOCODE_ERROR_CLASS=${googleStatus}`);
    const safeReason = gap01SafeGeocodeErrorReason(json.error_message);
    if (safeReason) {
      console.log(`GAP01_GEOCODE_ERROR_REASON=${safeReason}`);
    }
  }
}

function gap01PlacesFetchWrapper(
  fetchFn: (url: string, init?: RequestInit) => Promise<unknown>,
): (url: string, init?: RequestInit) => Promise<unknown> {
  return async (url: string, init?: RequestInit) => {
    const isPlacesNew = url.includes('places.googleapis.com');
    if (isPlacesNew) {
      console.log('GAP01_PLACES_START api=places_api_new');
    }
    const json = (await fetchFn(url, init)) as Record<string, unknown>;
    if (!isPlacesNew) {
      return json;
    }
    const httpStatus = typeof json.__httpStatus === 'number' ? json.__httpStatus : 0;
    console.log(`GAP01_PLACES_HTTP_STATUS httpStatus=${httpStatus}`);
    const places = json.places;
    const resultCount = Array.isArray(places) ? places.length : 0;
    console.log(`GAP01_PLACES_RESULT_COUNT count=${resultCount}`);
    const placesError = json.error as { status?: string; message?: string } | undefined;
    if (placesError?.status) {
      console.log(`GAP01_PLACES_ERROR_CLASS=${placesError.status}`);
      const safeReason = gap01SafeGeocodeErrorReason(placesError.message);
      if (safeReason) {
        console.log(`GAP01_PLACES_ERROR_REASON=${safeReason}`);
      }
    } else if (typeof httpStatus === 'number' && (httpStatus < 200 || httpStatus >= 300)) {
      console.log('GAP01_PLACES_ERROR_CLASS=HTTP_ERROR');
    }
    return json;
  };
}

function geocodeFailureExplanation(kind: GeocodeFailureKind, pin: string): string {
  switch (kind) {
    case 'REQUEST_DENIED':
      return 'Geocoding API denied the request (auth, billing, or API restriction).';
    case 'ZERO_RESULTS':
      return `Geocoding API returned no location for Indian PIN ${pin}.`;
    case 'INVALID_REQUEST':
      return 'Geocoding API rejected the PIN geocode request (invalid request).';
    case 'OVER_QUERY_LIMIT':
      return 'Geocoding API quota exceeded for PIN lookup.';
    case 'HTTP_ERROR':
      return 'Geocoding API HTTP response indicated failure.';
    case 'NETWORK_ERROR':
      return 'Geocoding API PIN lookup failed (network error).';
    case 'MALFORMED_RESPONSE':
      return 'Geocoding API returned an unusable PIN geocode payload.';
    default:
      return 'Geocoding API PIN lookup failed (unknown error).';
  }
}

export async function geocodeIndianPinCode(
  pinCode: string,
  options: { apiKey?: string; fetchFn?: (url: string, init?: RequestInit) => Promise<unknown> },
): Promise<PinGeocodeOutcome> {
  const pin = pinCode.trim();
  if (!/^\d{6}$/.test(pin)) {
    return {
      ok: false,
      failureKind: 'INVALID_REQUEST',
      explanation: geocodeFailureExplanation('INVALID_REQUEST', pin),
    };
  }
  const key = options.apiKey?.trim();
  if (!key || !options.fetchFn) {
    return {
      ok: false,
      failureKind: 'REQUEST_DENIED',
      explanation: 'Geocoding credentials or server fetch handler unavailable.',
    };
  }

  const url = `${GEOCODE_ENDPOINT}?components=postal_code:${encodeURIComponent(pin)}|country:IN&key=${encodeURIComponent(key)}`;
  try {
    console.log(`GAP01_GEOCODE_START pin=${pin}`);
    const json = (await options.fetchFn(url)) as {
      __httpStatus?: number;
      status?: string;
      error_message?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }>;
    };
    gap01LogGeocodeDiagnostics(json);

    if (typeof json.__httpStatus === 'number' && (json.__httpStatus < 200 || json.__httpStatus >= 300)) {
      return {
        ok: false,
        failureKind: 'HTTP_ERROR',
        explanation: geocodeFailureExplanation('HTTP_ERROR', pin),
      };
    }

    const status = json.status ?? 'UNKNOWN_ERROR';
    if (status === 'OK') {
      const loc = json.results?.[0]?.geometry?.location;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
        return {
          ok: false,
          failureKind: 'MALFORMED_RESPONSE',
          explanation: geocodeFailureExplanation('MALFORMED_RESPONSE', pin),
        };
      }
      return {
        ok: true,
        result: {
          lat: loc.lat,
          lng: loc.lng,
          formattedAddress: json.results?.[0]?.formatted_address,
        },
      };
    }

    const failureKind: GeocodeFailureKind =
      status === 'REQUEST_DENIED'
        ? 'REQUEST_DENIED'
        : status === 'ZERO_RESULTS'
          ? 'ZERO_RESULTS'
          : status === 'INVALID_REQUEST'
            ? 'INVALID_REQUEST'
            : status === 'OVER_QUERY_LIMIT'
              ? 'OVER_QUERY_LIMIT'
              : 'UNKNOWN_ERROR';

    return {
      ok: false,
      failureKind,
      explanation: geocodeFailureExplanation(failureKind, pin),
    };
  } catch {
    return {
      ok: false,
      failureKind: 'NETWORK_ERROR',
      explanation: geocodeFailureExplanation('NETWORK_ERROR', pin),
    };
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
  if (!options.orchestratorAuthorized) {
    return {
      rawCandidates: [],
      externalCallsUsed: 0,
      quotaExhausted: false,
      authFailure: false,
      errorCode: 'PROVIDER_ERROR',
      explanation:
        'Managed Google discovery is orchestrator-only; direct runManagedGooglePlacesDiscovery calls are blocked in production.',
    };
  }

  const apiKey = options.apiKey;
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

  if (options.assertLockHeld && !(await options.assertLockHeld())) {
    return {
      rawCandidates: [],
      externalCallsUsed: 0,
      quotaExhausted: false,
      authFailure: false,
      errorCode: 'PROVIDER_ERROR',
      explanation: 'Generation lock lost before geocode; aborted.',
    };
  }

  const instrumentedFetchFn = gap01PlacesFetchWrapper(fetchFn);
  const geocodeOutcome = await geocodeIndianPinCode(pinCode, { apiKey, fetchFn: instrumentedFetchFn });
  const geocodeAttempted = Boolean(apiKey && fetchFn);
  let externalCallsUsed = geocodeAttempted ? 1 : 0;

  if (!geocodeOutcome.ok) {
    const authFailure = geocodeOutcome.failureKind === 'REQUEST_DENIED';
    return {
      rawCandidates: [],
      externalCallsUsed,
      quotaExhausted: geocodeOutcome.failureKind === 'OVER_QUERY_LIMIT',
      authFailure,
      errorCode: authFailure ? 'AUTH_FAILURE' : 'GEOCODE_FAILED',
      explanation: `${geocodeOutcome.explanation} Geographic scoped Places discovery was not performed.`,
    };
  }
  const geocoded = geocodeOutcome.result;

  const seenPlaceIds = new Set<string>();
  const aggregated: GooglePlacesRawCandidate[] = [];

  for (const term of searchTerms) {
    if (options.assertLockHeld && !(await options.assertLockHeld())) {
      return {
        rawCandidates: aggregated,
        externalCallsUsed,
        quotaExhausted: false,
        authFailure: false,
        errorCode: 'PROVIDER_ERROR',
        explanation: 'Generation lock lost before Text Search; aborted.',
      };
    }
    if (options.reserveCallFn) {
      const allowed = await options.reserveCallFn();
      if (!allowed) {
        return {
          rawCandidates: aggregated,
          externalCallsUsed,
          quotaExhausted: true,
          authFailure: false,
          errorCode: 'QUOTA_EXHAUSTED',
          explanation: 'Google daily quota exhausted before Text Search.',
        };
      }
    }

    const criteria: GooglePlacesDiscoveryCriteria = {
      category: scope.category,
      location: {
        city,
        pinCode,
        state: scope.state,
        country: 'IN',
        coordinates: { lat: geocoded.lat, lng: geocoded.lng },
      },
      radiusKm: 25,
      priority: options.priority ?? 'BUYER_DEMAND',
    };

    const result = await adapter.discoverManagedCoverage(criteria, {
      searchQuery: buildGooglePlacesTextQuery(term, city, pinCode),
      geocodedCenter: geocoded,
      fetchFn: instrumentedFetchFn,
      apiKey,
      forceRefresh: options.forceRefresh,
      orchestratorAuthorized: true,
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

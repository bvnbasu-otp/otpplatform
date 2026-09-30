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
    const json = (await options.fetchFn(url)) as {
      __httpStatus?: number;
      status?: string;
      error_message?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }>;
    };

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

  const geocodeOutcome = await geocodeIndianPinCode(pinCode, { apiKey, fetchFn });
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
      fetchFn,
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

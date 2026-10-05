export type DiscoveryNetwork = 'GOOGLE_PLACES' | 'OTP_REGISTERED';

export type DiscoverySourceOutcome =
  | 'GOOGLE_PLACES_DISCOVERY'
  | 'OTP_REGISTERED_SUPPLIER_DISCOVERY'
  | 'BOTH'
  | 'ZERO_RESULTS'
  | 'COVERAGE_NOT_FRESH'
  | 'INVALID_REQUIREMENT'
  | 'QUOTA_FAILURE'
  | 'SERVICE_FAILURE'
  | 'UNSUPPORTED_CATEGORY';

export interface CoverageResponseShape {
  ok?: boolean;
  error?: string | null;
  message?: string | null;
  knownSuppliersCount?: number | null;
}

/**
 * Classifies a location-pin-coverage response.
 * A Google zero is not a service failure and is not an OTP supplier list.
 */
export function classifyCoverageResponse(input: CoverageResponseShape): DiscoverySourceOutcome {
  const error = `${input.error ?? ''} ${input.message ?? ''}`;
  if (/unsupported category|category is not supported|category not supported/i.test(error)) {
    return 'UNSUPPORTED_CATEGORY';
  }
  if (/quota|resource_exhausted|over_query_limit/i.test(error)) return 'QUOTA_FAILURE';
  if (/VALIDATION|pincode must be 6 digits|invalid requirement/i.test(error)) return 'INVALID_REQUIREMENT';
  if (/PROVIDER_UNAVAILABLE|PROVIDER_ERROR|GEOCODE_FAILED|not configured/i.test(error)) {
    return 'SERVICE_FAILURE';
  }
  const count = input.knownSuppliersCount ?? 0;
  if (/zero suppliers/i.test(input.message ?? '') && count === 0) return 'ZERO_RESULTS';
  if (input.ok === false && !input.error && count === 0 && /zero/i.test(input.message ?? '')) {
    return 'ZERO_RESULTS';
  }
  if (count > 0 || input.ok === true) return 'GOOGLE_PLACES_DISCOVERY';
  if (input.ok === false) return 'SERVICE_FAILURE';
  return 'COVERAGE_NOT_FRESH';
}

export function discoveryRequirementIssues(input: {
  pincode: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  category: string | null | undefined;
}): string | null {
  const pin = (input.pincode ?? '').trim();
  if (!/^\d{6}$/.test(pin)) return 'Discovery needs the requirement delivery PIN. This is not a zero-supplier result.';
  if (!(input.city ?? '').trim() || !(input.state ?? '').trim()) {
    return 'Discovery needs the requirement city and state. This is not a zero-supplier result.';
  }
  if (!(input.category ?? '').trim()) {
    return 'Discovery needs a requirement category. This is not a zero-supplier result.';
  }
  return null;
}

export function sourceSummary(counts: { google: number; otp: number }): {
  google: number;
  otp: number;
  outcome: 'GOOGLE_PLACES_DISCOVERY' | 'OTP_REGISTERED_SUPPLIER_DISCOVERY' | 'BOTH' | 'ZERO_RESULTS';
  label: string;
} {
  const google = counts.google;
  const otp = counts.otp;
  if (google > 0 && otp > 0) {
    return {
      google,
      otp,
      outcome: 'BOTH',
      label: `Google Places: ${google} discovered. OTP registered suppliers: ${otp}. These are different sources.`,
    };
  }
  if (google > 0) {
    return {
      google,
      otp,
      outcome: 'GOOGLE_PLACES_DISCOVERY',
      label: `Google Places: ${google} discovered.`,
    };
  }
  if (otp > 0) {
    return {
      google,
      otp,
      outcome: 'OTP_REGISTERED_SUPPLIER_DISCOVERY',
      label: `OTP registered suppliers: ${otp}. This search is not a Google Places discovery.`,
    };
  }
  return {
    google: 0,
    otp: 0,
    outcome: 'ZERO_RESULTS',
    label: 'Google Places: 0 discovered. No OTP suppliers were substituted.',
  };
}

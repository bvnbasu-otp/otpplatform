export type PinGeographyAlignmentStatus = 'MATCH' | 'MISMATCH' | 'UNRESOLVED';

export interface PinGeographyAlignmentInput {
  pincode: string;
  selectedState?: string;
  selectedCity?: string;
  geocodeComponents?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
}

export interface PinGeographyAlignmentResult {
  status: PinGeographyAlignmentStatus;
  resolvedState?: string;
  resolvedCity?: string;
  explanation: string;
}

function normalizeGeoLabel(value: string | undefined | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bstate\b/g, '')
    .trim();
}

function labelsAlign(selected: string, resolved: string): boolean {
  const a = normalizeGeoLabel(selected);
  const b = normalizeGeoLabel(resolved);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function extractStateCityFromGeocodeComponents(
  components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>,
): { state?: string; city?: string } {
  if (!components?.length) return {};
  let state: string | undefined;
  let city: string | undefined;
  for (const c of components) {
    const types = c.types ?? [];
    if (!state && types.includes('administrative_area_level_1')) {
      state = c.long_name ?? c.short_name;
    }
    if (!city && (types.includes('locality') || types.includes('postal_town'))) {
      city = c.long_name ?? c.short_name;
    }
    if (!city && types.includes('administrative_area_level_2')) {
      city = c.long_name ?? c.short_name;
    }
  }
  return { state, city };
}

export function assessPinGeographyAlignment(input: PinGeographyAlignmentInput): PinGeographyAlignmentResult {
  const selectedState = input.selectedState?.trim() ?? '';
  const selectedCity = input.selectedCity?.trim() ?? '';
  const { state: resolvedState, city: resolvedCity } = extractStateCityFromGeocodeComponents(
    input.geocodeComponents,
  );

  if (!selectedState && !selectedCity) {
    return {
      status: 'MATCH',
      resolvedState,
      resolvedCity,
      explanation: 'PIN geocoded; no conflicting state/city inputs were provided.',
    };
  }

  if (selectedState && !resolvedState) {
    return {
      status: 'UNRESOLVED',
      resolvedState,
      resolvedCity,
      explanation: 'PIN geocoded but state could not be resolved for comparison.',
    };
  }
  if (selectedCity && !resolvedCity) {
    return {
      status: 'UNRESOLVED',
      resolvedState,
      resolvedCity,
      explanation: 'PIN geocoded but city could not be resolved for comparison.',
    };
  }

  const stateOk = !selectedState || (resolvedState ? labelsAlign(selectedState, resolvedState) : false);
  const cityOk = !selectedCity || (resolvedCity ? labelsAlign(selectedCity, resolvedCity) : false);

  if (!stateOk || !cityOk) {
    return {
      status: 'MISMATCH',
      resolvedState,
      resolvedCity,
      explanation: 'Selected state/city conflict with PIN geocode resolution.',
    };
  }

  return {
    status: 'MATCH',
    resolvedState,
    resolvedCity,
    explanation: 'PIN geocode aligns with selected state and city.',
  };
}

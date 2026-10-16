export type PinGeographyAlignmentStatus = 'MATCH' | 'MISMATCH' | 'UNRESOLVED';

export interface PinGeographyAlignmentInput {
  pincode: string;
  selectedState?: string;
  selectedCity?: string;
  geocodeComponents?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
}

export interface ExtractedPinGeography {
  state?: string;
  city?: string;
  district?: string;
  locality?: string;
  sublocality?: string;
  allCityCandidates: string[];
}

export interface PinGeographyAlignmentResult {
  status: PinGeographyAlignmentStatus;
  resolvedState?: string;
  resolvedCity?: string;
  allCityCandidates?: string[];
  explanation: string;
}

const INDIAN_CITY_SYNONYMS: Record<string, string[]> = {
  bangalore: ['bengaluru'],
  bengaluru: ['bangalore'],
  calcutta: ['kolkata'],
  kolkata: ['calcutta'],
  bombay: ['mumbai'],
  mumbai: ['bombay'],
  madras: ['chennai'],
  chennai: ['madras'],
  orissa: ['odisha'],
  odisha: ['orissa'],
  pondicherry: ['puducherry'],
  puducherry: ['pondicherry'],
  cochin: ['kochi'],
  kochi: ['cochin'],
  trivandrum: ['thiruvananthapuram'],
  thiruvananthapuram: ['trivandrum'],
  baroda: ['vadodara'],
  vadodara: ['baroda'],
  mysore: ['mysuru'],
  mysuru: ['mysore'],
  mangalore: ['mangaluru'],
  mangaluru: ['mangalore'],
  belgaum: ['belagavi'],
  belagavi: ['belgaum'],
  hubli: ['hubballi'],
  hubballi: ['hubli'],
  gulbarga: ['kalaburagi'],
  kalaburagi: ['gulbarga'],
  // Erode & Bhavani regional cluster (PIN 638xxx postal delivery division)
  erode: ['bhavani', 'gobichettipalayam', 'perundurai', 'anthiyur', 'bhavani erode'],
  bhavani: ['erode', 'bhavani erode', 'suriyampalayam', 'urachikottai', 'kalingarayanpalayam'],
  'bhavani erode': ['erode', 'bhavani'],
  // Coimbatore & surrounding
  coimbatore: ['pollachi'],
  pollachi: ['coimbatore'],
  // Delhi NCR
  delhi: ['new delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad'],
  newdelhi: ['delhi', 'noida', 'gurugram', 'gurgaon'],
  gurgaon: ['gurugram'],
  gurugram: ['gurgaon'],
  // Hyderabad
  hyderabad: ['secunderabad'],
  secunderabad: ['hyderabad'],
  // Pune
  pune: ['pimprichinchwad', 'pimpri', 'chinchwad'],
};

function normalizeGeoLabel(value: string | undefined | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(state|district|dist|city|urban|rural|taluk|taluka|tehsil|division)\b/g, '')
    .trim();
}

export function labelsAlign(selected: string, resolved: string): boolean {
  const a = normalizeGeoLabel(selected);
  const b = normalizeGeoLabel(resolved);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  // Check synonym map
  const synsA = INDIAN_CITY_SYNONYMS[a];
  if (synsA && synsA.some((s) => s === b || s.includes(b) || b.includes(s))) return true;

  const synsB = INDIAN_CITY_SYNONYMS[b];
  if (synsB && synsB.some((s) => s === a || s.includes(a) || a.includes(s))) return true;

  return false;
}

export function extractStateCityFromGeocodeComponents(
  components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>,
  pincode?: string,
): ExtractedPinGeography {
  if (!components?.length && !pincode) {
    return { allCityCandidates: [] };
  }

  let state: string | undefined;
  let district: string | undefined;
  let locality: string | undefined;
  let sublocality: string | undefined;
  const candidateSet = new Set<string>();

  for (const c of components ?? []) {
    const types = c.types ?? [];
    const name = c.long_name?.trim() || c.short_name?.trim();
    if (!name) continue;

    if (!state && types.includes('administrative_area_level_1')) {
      state = name;
    }

    if (types.includes('administrative_area_level_2')) {
      if (!district) district = name;
      candidateSet.add(name);
    }

    if (types.includes('locality') || types.includes('postal_town')) {
      if (!locality) locality = name;
      candidateSet.add(name);
    }

    if (
      types.includes('sublocality') ||
      types.includes('sublocality_level_1') ||
      types.includes('sublocality_level_2')
    ) {
      if (!sublocality) sublocality = name;
      candidateSet.add(name);
    }

    if (types.includes('administrative_area_level_3')) {
      candidateSet.add(name);
    }
  }

  const allCityCandidates = Array.from(candidateSet);
  const city = locality || district || sublocality || allCityCandidates[0];

  return {
    state,
    city,
    district,
    locality,
    sublocality,
    allCityCandidates,
  };
}

export function assessPinGeographyAlignment(input: PinGeographyAlignmentInput): PinGeographyAlignmentResult {
  const selectedState = input.selectedState?.trim() ?? '';
  const selectedCity = input.selectedCity?.trim() ?? '';
  const {
    state: resolvedState,
    city: resolvedCity,
    allCityCandidates,
  } = extractStateCityFromGeocodeComponents(input.geocodeComponents);

  if (!selectedState && !selectedCity) {
    return {
      status: 'MATCH',
      resolvedState,
      resolvedCity,
      allCityCandidates,
      explanation: 'PIN geocoded; no conflicting state/city inputs were provided.',
    };
  }

  if (selectedState && !resolvedState) {
    return {
      status: 'UNRESOLVED',
      resolvedState,
      resolvedCity,
      allCityCandidates,
      explanation: 'PIN geocoded but state could not be resolved for comparison.',
    };
  }
  if (selectedCity && !resolvedCity && allCityCandidates.length === 0) {
    return {
      status: 'UNRESOLVED',
      resolvedState,
      resolvedCity,
      allCityCandidates,
      explanation: 'PIN geocoded but city could not be resolved for comparison.',
    };
  }

  const stateOk = !selectedState || (resolvedState ? labelsAlign(selectedState, resolvedState) : false);

  const cityOk =
    !selectedCity ||
    (allCityCandidates.length > 0
      ? allCityCandidates.some((candidate) => labelsAlign(selectedCity, candidate))
      : resolvedCity
        ? labelsAlign(selectedCity, resolvedCity)
        : false);

  if (!stateOk || !cityOk) {
    return {
      status: 'MISMATCH',
      resolvedState,
      resolvedCity,
      allCityCandidates,
      explanation: 'Selected state/city conflict with PIN geocode resolution.',
    };
  }

  return {
    status: 'MATCH',
    resolvedState,
    resolvedCity,
    allCityCandidates,
    explanation: 'PIN geocode aligns with selected state and city.',
  };
}


/**
 * Deterministic OTP category → bounded Google Text Search terms (no LLM, no second taxonomy).
 */

const CATEGORY_QUERY_MAP: Record<string, readonly string[]> = {
  // 15 Canonical Database Categories
  'electrical & power': [
    'electrical suppliers',
    'industrial switchgear transformer dealer',
    'power equipment store',
  ],
  'construction & infrastructure': [
    'building material suppliers',
    'civil construction contractors',
    'cement steel hardware suppliers',
  ],
  'agriculture & commodities': [
    'agricultural suppliers',
    'agro commodities wholesale dealers',
    'fertilizer seed suppliers',
  ],
  'chemicals & process materials': [
    'industrial chemical suppliers',
    'process raw materials chemical dealers',
    'laboratory chemical store',
  ],
  'general / other': ['commercial wholesale suppliers', 'industrial store'],
  'general_other': ['commercial wholesale suppliers', 'industrial store'],
  'industrial supplies & hardware': [
    'industrial hardware tools suppliers',
    'fasteners bearings tools dealers',
    'industrial equipment store',
  ],
  'it, electronics & digital': [
    'it networking equipment suppliers',
    'electronic component distributors',
    'computer hardware suppliers',
  ],
  'logistics & transportation': [
    'transportation logistics services',
    'freight forwarding cargo movers',
    'commercial fleet transport',
  ],
  'machinery & engineering': [
    'industrial machinery suppliers',
    'engineering tools equipment dealers',
    'workshop machinery store',
  ],
  'packaging & printing': [
    'packaging material corrugated box suppliers',
    'commercial printing packaging dealers',
    'industrial packaging store',
  ],
  'professional & skilled services': [
    'professional engineering consultancy',
    'skilled industrial technical services',
    'commercial maintenance services',
  ],
  'property & facility management': [
    'facility management services',
    'commercial building maintenance',
    'property housekeeping security services',
  ],
  'safety & security': [
    'cctv fire safety equipment suppliers',
    'industrial safety security systems dealers',
    'ppe safety gear store',
  ],
  'textile & apparel': [
    'textile fabric wholesale suppliers',
    'industrial uniform apparel manufacturers',
    'garment fabric store',
  ],
  'water & environmental solutions': [
    'water treatment plant equipment suppliers',
    'ro water filtration dealers',
    'environmental pollution control suppliers',
  ],

  // Legacy / Subcategory Aliases
  'electrical & automation': [
    'electrical suppliers',
    'industrial automation suppliers',
    'switchgear electrical store',
  ],
  'construction & civil works': ['building material suppliers', 'civil construction contractors'],
  'plumbing & water systems': ['plumbing suppliers', 'water pump plumbing store'],
  'painting & waterproofing': ['paint dealers', 'waterproofing contractors'],
  'security & surveillance': ['cctv security system dealers', 'security equipment suppliers'],
  'elevator & lift maintenance': ['elevator maintenance service', 'lift spare parts suppliers'],
  'hvac & air conditioning': ['hvac contractors', 'air conditioning dealers'],
  'food, catering & hospitality': ['commercial kitchen equipment suppliers', 'catering supplies'],
  'office furniture & fixtures': ['office furniture suppliers', 'modular furniture store'],
  'solar power & inverters': ['solar panel dealers', 'inverter battery suppliers'],
};

const DEFAULT_MAX_QUERIES_PER_SCOPE = 3;

export function normalizeCategoryKey(category: string): string {
  return category.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Returns up to `maxQueries` distinct search term stems for a buyer/admin category label.
 */
export function buildGooglePlacesCategorySearchTerms(
  category: string,
  maxQueries: number = DEFAULT_MAX_QUERIES_PER_SCOPE,
): string[] {
  const key = normalizeCategoryKey(category);
  const mapped = CATEGORY_QUERY_MAP[key];
  if (mapped && mapped.length > 0) {
    return [...mapped].slice(0, Math.max(1, maxQueries));
  }

  const slug = key.replace(/[^a-z0-9\s&]/g, '').trim();
  const primary = slug.length > 0 ? `${slug} suppliers` : 'commercial suppliers';
  const secondary = slug.length > 0 ? `${slug} dealers` : 'industrial suppliers';
  const terms = [primary];
  if (maxQueries > 1 && secondary !== primary) {
    terms.push(secondary);
  }
  return terms.slice(0, Math.max(1, maxQueries));
}

export function buildGooglePlacesTextQuery(
  searchTerm: string,
  city: string,
  pinCode: string,
): string {
  return `${searchTerm} in ${city} ${pinCode}`;
}

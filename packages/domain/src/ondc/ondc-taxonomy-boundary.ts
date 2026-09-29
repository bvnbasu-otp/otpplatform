/**
 * OTP taxonomy → ONDC domain allow-list (Layer 5 only).
 * When subcategory is explicit, title heuristics must not emit B2B10 / SRV11 / SRV13.
 */

export interface OndcTaxonomyContext {
  subcategoryCode?: string | null;
  requirementMode?: string | null;
}

const TEXTILE_SUBCATEGORY_CODES = new Set([
  'cotton_yarn',
  'synthetic_yarn',
  'fabric_woven',
  'fabric_knitted',
  'garments',
  'dyeing_processing',
  'knitting_job_work',
  'embroidery_printing',
  'textile_machinery',
  'textile_accessories',
]);

/**
 * Returns a Beckn domain only when subcategory + mode are on the OTP allow-list.
 * Unmatched explicit subcategories and Describe/Other return null (no ONDC domain).
 */
export function mapExplicitSubcategoryToOndcDomain(
  subcategoryCode: string,
  requirementMode?: string | null,
): string | null {
  if (
    subcategoryCode === 'custom_requirement' ||
    subcategoryCode === 'general_products' ||
    subcategoryCode === 'general_services' ||
    subcategoryCode === 'miscellaneous_supply' ||
    subcategoryCode === 'other_professional'
  ) {
    return null;
  }

  if (TEXTILE_SUBCATEGORY_CODES.has(subcategoryCode)) {
    return 'ONDC:RET12';
  }

  if (subcategoryCode === 'cctv_surveillance') {
    if (requirementMode === 'PROJECT_CONTRACT') return null;
    return 'ONDC:RET14';
  }

  // Explicit classified requirements outside the allow-list: no domain (no SRV11/B2B10/SRV13 fallback).
  return null;
}

export function shouldUseCategoryTitleHeuristicsForOndc(
  taxonomyContext?: OndcTaxonomyContext,
): boolean {
  return !taxonomyContext?.subcategoryCode;
}

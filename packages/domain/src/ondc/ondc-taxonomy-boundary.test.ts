import { describe, expect, it } from 'vitest';
import { mapExplicitSubcategoryToOndcDomain } from './ondc-taxonomy-boundary';

describe('ONDC taxonomy boundary (TAXONOMY-03 D-13/D-15)', () => {
  it('returns null for Describe/Other and domestic RO leaves', () => {
    expect(mapExplicitSubcategoryToOndcDomain('custom_requirement')).toBeNull();
    expect(mapExplicitSubcategoryToOndcDomain('domestic_ro_purifier', 'PRODUCT_MATERIAL')).toBeNull();
    expect(mapExplicitSubcategoryToOndcDomain('water_treatment_plant', 'PROJECT_CONTRACT')).toBeNull();
  });

  it('allow-lists textile and CCTV product lanes only', () => {
    expect(mapExplicitSubcategoryToOndcDomain('cotton_yarn', 'PRODUCT_MATERIAL')).toBe('ONDC:RET12');
    expect(mapExplicitSubcategoryToOndcDomain('cctv_surveillance', 'PRODUCT_MATERIAL')).toBe('ONDC:RET14');
    expect(mapExplicitSubcategoryToOndcDomain('cctv_surveillance', 'PROJECT_CONTRACT')).toBeNull();
  });

  it('does not emit B2B10/SRV11/SRV13 for classified paint or gym AMC subcategories', () => {
    expect(mapExplicitSubcategoryToOndcDomain('paints_coatings', 'PRODUCT_MATERIAL')).toBeNull();
    expect(mapExplicitSubcategoryToOndcDomain('gym_fitness_amc', 'AMC')).toBeNull();
    expect(mapExplicitSubcategoryToOndcDomain('home_interior_exterior_painting', 'PROJECT_CONTRACT')).toBeNull();
  });
});

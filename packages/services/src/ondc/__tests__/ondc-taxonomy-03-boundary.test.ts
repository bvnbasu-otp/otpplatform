import { describe, expect, it } from 'vitest';
import {
  mapCategoryToOndcDomain,
  resolveOndcSearchDomain,
} from '../ondc-network-service';

describe('resolveOndcSearchDomain with explicit OTP taxonomy (TAXONOMY-03)', () => {
  it('still uses title heuristics only when subcategory is absent', () => {
    expect(mapCategoryToOndcDomain('Construction Ready Mix Concrete RMC')).toBe('ONDC:B2B10');
    expect(resolveOndcSearchDomain('Construction Ready Mix Concrete RMC')).toBe('ONDC:B2B10');
  });

  it('does not emit B2B10/SRV11/SRV13 when subcategory is explicit', () => {
    expect(
      resolveOndcSearchDomain('Construction Ready Mix Concrete RMC', undefined, {
        subcategoryCode: 'paints_coatings',
        requirementMode: 'PRODUCT_MATERIAL',
      }),
    ).toBeNull();
    expect(
      resolveOndcSearchDomain('Domestic RO Water Purifiers', undefined, {
        subcategoryCode: 'domestic_ro_purifier',
        requirementMode: 'PRODUCT_MATERIAL',
      }),
    ).toBeNull();
    expect(
      resolveOndcSearchDomain('Clubhouse Gym Equipment AMC', undefined, {
        subcategoryCode: 'gym_fitness_amc',
        requirementMode: 'AMC',
      }),
    ).toBeNull();
  });

  it('honors pilot override regardless of taxonomy context', () => {
    expect(
      resolveOndcSearchDomain('anything', 'ONDC:RET14', {
        subcategoryCode: 'custom_requirement',
      }),
    ).toBe('ONDC:RET14');
  });
});

import { describe, expect, it } from 'vitest';
import {
  mapCategoryToOndcDomain,
  resolveOndcSearchDomain,
} from '../ondc-network-service';

describe('resolveOndcSearchDomain with explicit OTP taxonomy (TAXONOMY-03)', () => {
  it('does not let the title heuristic choose a domain when subcategory is absent (LOCAL/CI/MOCK)', () => {
    expect(mapCategoryToOndcDomain('Construction Ready Mix Concrete RMC')).toBe('ONDC:B2B10');
    expect(resolveOndcSearchDomain('Construction Ready Mix Concrete RMC')).toBeNull();
    expect(resolveOndcSearchDomain('camera shirt textile')).toBeNull();
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

  it('does not let an injected domain override the allow-list (LOCAL/CI/MOCK)', () => {
    expect(
      resolveOndcSearchDomain('anything', 'ONDC:RET14', {
        subcategoryCode: 'custom_requirement',
      }),
    ).toBeNull();
    expect(resolveOndcSearchDomain('cotton yarn', 'ONDC:RET12')).toBeNull();
    expect(
      resolveOndcSearchDomain('cotton yarn', 'ONDC:SRV11', {
        subcategoryCode: 'cotton_yarn',
        requirementMode: 'PRODUCT_MATERIAL',
      }),
    ).toBe('ONDC:RET12');
  });
});

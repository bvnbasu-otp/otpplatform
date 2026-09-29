import { describe, expect, it } from 'vitest';
import { RequirementMode } from '../enums/requirement-mode';
import type { TaxonomySnapshot } from './types';
import { resolveDescribeOtherTaxonomyIds } from './intake-other-taxonomy';

describe('Describe / Other taxonomy wiring (TAXONOMY-03 D-11)', () => {
  const taxonomy: TaxonomySnapshot = {
    categories: [
      { id: 'cat-other', code: 'general_other', name: 'Describe your requirement', sortOrder: 99 },
    ],
    subcategories: [
      {
        id: 'sub-custom',
        categoryId: 'cat-other',
        categoryCode: 'general_other',
        code: 'custom_requirement',
        name: 'Custom requirement',
        matchKeywords: [],
        requiredAttributeCodes: [],
        defaultRequirementMode: RequirementMode.OTHER,
        sortOrder: 1,
      },
    ],
    capabilities: [],
    attributes: [],
    criteria: [],
    cities: [],
  };

  it('resolves real UUIDs for general_other.custom_requirement', () => {
    const resolved = resolveDescribeOtherTaxonomyIds(taxonomy);
    expect(resolved).toEqual({
      categoryId: 'cat-other',
      subcategoryId: 'sub-custom',
      defaultMode: RequirementMode.OTHER,
    });
  });
});

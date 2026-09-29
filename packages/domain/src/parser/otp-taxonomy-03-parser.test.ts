import { describe, expect, it } from 'vitest';
import { RequirementMode } from '../enums/requirement-mode';
import { RuleBasedRequirementParser } from './rule-based-requirement-parser';
import type { TaxonomySnapshot } from '../taxonomy/types';

const waterTaxonomy: TaxonomySnapshot = {
  categories: [
    {
      id: 'cat-water',
      code: 'water_environmental',
      name: 'Water & Environmental Solutions',
      sortOrder: 1,
    },
  ],
  subcategories: [
    {
      id: 'sub-wtp',
      categoryId: 'cat-water',
      categoryCode: 'water_environmental',
      code: 'water_treatment_plant',
      name: 'Commercial WTP',
      matchKeywords: ['ro plant', 'water treatment', 'wtp'],
      requiredAttributeCodes: [],
      defaultRequirementMode: RequirementMode.PROJECT_CONTRACT,
      sortOrder: 1,
    },
    {
      id: 'sub-domestic',
      categoryId: 'cat-water',
      categoryCode: 'water_environmental',
      code: 'domestic_ro_purifier',
      name: 'Domestic RO',
      matchKeywords: ['domestic ro', 'home ro', 'kitchen ro', '10l ro', 'water purifier'],
      requiredAttributeCodes: [],
      defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
      sortOrder: 2,
    },
  ],
  capabilities: [],
  attributes: [],
  criteria: [],
  cities: [],
};

describe('TAXONOMY-03 parser disambiguation', () => {
  const parser = new RuleBasedRequirementParser();

  it('routes domestic 10L home RO away from commercial water_treatment_plant', async () => {
    const parsed = await parser.parse({
      text: 'Need 10L home kitchen RO water purifier for apartment.',
      taxonomy: waterTaxonomy,
    });
    expect(parsed.subcategoryCode).toBe('domestic_ro_purifier');
  });
});

import { describe, expect, it } from 'vitest';
import { RequirementMode } from '../enums/requirement-mode';
import { mapLegacyTemplateProcurementMode } from './legacy-template-mode';

describe('legacy template procurement mode mapping (TAXONOMY-03 D-08)', () => {
  it('maps BUY to PRODUCT_MATERIAL for new template apply flows', () => {
    expect(mapLegacyTemplateProcurementMode('BUY')).toBe(RequirementMode.PRODUCT_MATERIAL);
  });

  it('maps REPAIR and RATE_CONTRACT to canonical modes', () => {
    expect(mapLegacyTemplateProcurementMode('REPAIR')).toBe(RequirementMode.REPAIR_MAINTENANCE);
    expect(mapLegacyTemplateProcurementMode('RATE_CONTRACT')).toBe(RequirementMode.AMC);
    expect(mapLegacyTemplateProcurementMode('SERVICE')).toBe(RequirementMode.SERVICE);
  });
});

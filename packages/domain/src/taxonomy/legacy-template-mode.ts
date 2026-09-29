import { RequirementMode } from '../enums/requirement-mode';

/** Legacy template picker values — not stored on new requirements. */
export type LegacyTemplateProcurementMode = 'BUY' | 'SERVICE' | 'REPAIR' | 'RATE_CONTRACT';

/**
 * Maps UI template modes to canonical RequirementMode at apply-time only.
 * Historical rows that stored legacy strings are not rewritten.
 */
export function mapLegacyTemplateProcurementMode(
  mode: LegacyTemplateProcurementMode,
): RequirementMode {
  switch (mode) {
    case 'BUY':
      return RequirementMode.PRODUCT_MATERIAL;
    case 'REPAIR':
      return RequirementMode.REPAIR_MAINTENANCE;
    case 'RATE_CONTRACT':
      return RequirementMode.AMC;
    case 'SERVICE':
      return RequirementMode.SERVICE;
  }
}

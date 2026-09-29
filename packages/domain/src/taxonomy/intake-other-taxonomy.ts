import type { TaxonomySnapshot } from './types';
import { RequirementMode } from '../enums/requirement-mode';

export const DESCRIBE_CATEGORY_CODE = 'general_other';
export const DESCRIBE_SUBCATEGORY_CODE = 'custom_requirement';

export interface DescribeOtherTaxonomyIds {
  categoryId: string;
  subcategoryId: string;
  defaultMode: RequirementMode;
}

/** Resolves DB-backed UUIDs for the Describe / Other intake path. */
export function resolveDescribeOtherTaxonomyIds(
  taxonomy: TaxonomySnapshot,
): DescribeOtherTaxonomyIds | null {
  const category = taxonomy.categories.find((c) => c.code === DESCRIBE_CATEGORY_CODE);
  const subcategory = taxonomy.subcategories.find((s) => s.code === DESCRIBE_SUBCATEGORY_CODE);
  if (!category || !subcategory) return null;
  return {
    categoryId: category.id,
    subcategoryId: subcategory.id,
    defaultMode: (subcategory.defaultRequirementMode as RequirementMode) ?? RequirementMode.OTHER,
  };
}

export function isDescribeOtherSelection(
  taxonomy: TaxonomySnapshot,
  categoryId: string,
  subcategoryId: string,
): boolean {
  const resolved = resolveDescribeOtherTaxonomyIds(taxonomy);
  if (!resolved) return false;
  return (
    categoryId === resolved.categoryId && subcategoryId === resolved.subcategoryId
  );
}

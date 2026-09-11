/**
 * The taxonomy as the application sees it.
 *
 * These are plain projections of requirement_categories, requirement_subcategories,
 * capabilities, category_attribute_definitions and evaluation_criteria. Nothing
 * here is hard-coded knowledge about motors or yarn: adding a vertical is rows in
 * those tables, and both the intake form and the parser pick it up from the same
 * snapshot.
 */
import type { RequirementMode } from '../enums/requirement-mode';

export const AttributeDataType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  ENUM: 'ENUM',
  MULTI_ENUM: 'MULTI_ENUM',
  DATE: 'DATE',
} as const;

export type AttributeDataType =
  (typeof AttributeDataType)[keyof typeof AttributeDataType];

export const CriterionDirection = {
  LOWER_IS_BETTER: 'LOWER_IS_BETTER',
  HIGHER_IS_BETTER: 'HIGHER_IS_BETTER',
} as const;

export type CriterionDirection =
  (typeof CriterionDirection)[keyof typeof CriterionDirection];

export interface CategoryDef {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
}

export interface SubcategoryDef {
  id: string;
  categoryId: string;
  categoryCode: string;
  code: string;
  name: string;
  description?: string | null;
  /** Lower-cased phrases the parser scores free text against. */
  matchKeywords: string[];
  /**
   * Attribute codes a supplier cannot quote without, whether they are defined
   * on this subcategory or shared by its category. These become the "I need N
   * more details" step when the buyer's text did not mention them.
   */
  requiredAttributeCodes: string[];
  defaultRequirementMode: RequirementMode | null;
  sortOrder: number;
}

export interface CapabilityDef {
  id: string;
  code: string;
  name: string;
  /** Set when suppliers declare a numeric ceiling for this capability. */
  capacityUnit: string | null;
  /** The attribute whose value the ceiling is compared against. */
  capacityAttributeCode: string | null;
}

export interface AttributeValidation {
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
}

export interface AttributeDef {
  id: string;
  /** Set when the attribute is shared by every subcategory of a category. */
  categoryCode: string | null;
  /** Set when the attribute belongs to one subcategory only. */
  subcategoryCode: string | null;
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  options: string[];
  validation: AttributeValidation;
  /** Regexes whose first capture group holds the value, used by the parser. */
  matchPatterns: string[];
  helpText: string | null;
  placeholder: string | null;
  sortOrder: number;
}

export interface EvaluationCriterionDef {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  direction: CriterionDirection;
  /** Where the number comes from: a quote field or a supplier record field. */
  valueSource: string;
  sortOrder: number;
}

/**
 * Everything the intake wizard and the parser need, loaded once per session.
 * `cities` is supplied by the caller (from declared supplier service areas), so
 * geography stays data rather than a list baked into the parser.
 */
export interface TaxonomySnapshot {
  categories: CategoryDef[];
  subcategories: SubcategoryDef[];
  capabilities: CapabilityDef[];
  attributes: AttributeDef[];
  criteria: EvaluationCriterionDef[];
  cities?: string[];
}

export const EMPTY_TAXONOMY: TaxonomySnapshot = {
  categories: [],
  subcategories: [],
  capabilities: [],
  attributes: [],
  criteria: [],
  cities: [],
};

export function findSubcategory(
  taxonomy: TaxonomySnapshot,
  code: string | null | undefined,
): SubcategoryDef | null {
  if (!code) return null;
  return taxonomy.subcategories.find((s) => s.code === code) ?? null;
}

export function findCategory(
  taxonomy: TaxonomySnapshot,
  code: string | null | undefined,
): CategoryDef | null {
  if (!code) return null;
  return taxonomy.categories.find((c) => c.code === code) ?? null;
}

/**
 * The attribute schema for a subcategory: its own attributes plus the ones its
 * category shares with every sibling. Mirrors public.subcategory_attribute_schema.
 */
export function attributeSchemaFor(
  taxonomy: TaxonomySnapshot,
  subcategoryCode: string | null | undefined,
): AttributeDef[] {
  const subcategory = findSubcategory(taxonomy, subcategoryCode);
  if (!subcategory) return [];

  const required = new Set(subcategory.requiredAttributeCodes ?? []);

  return taxonomy.attributes
    .filter(
      (a) =>
        a.subcategoryCode === subcategory.code ||
        (a.subcategoryCode === null && a.categoryCode === subcategory.categoryCode),
    )
    .map((a) =>
      required.has(a.code) && !a.isRequired ? { ...a, isRequired: true } : a,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

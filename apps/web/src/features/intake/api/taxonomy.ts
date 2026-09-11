import type {
  AttributeDataType,
  AttributeDef,
  AttributeValidation,
  CapabilityDef,
  CategoryDef,
  CriterionDirection,
  EvaluationCriterionDef,
  RequirementMode,
  SubcategoryDef,
  TaxonomySnapshot,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * The taxonomy the wizard and the parser both run on.
 *
 * Everything here is a projection of read-only reference tables, so it is
 * fetched once per session rather than per step. If this returns empty, the
 * wizard has no categories to offer and no keywords to classify against —
 * which is a seeding problem, not something to paper over with defaults.
 */

export type FetchTaxonomyResult =
  | { ok: true; taxonomy: TaxonomySnapshot }
  | { ok: false; error: string };

interface CategoryRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface SubcategoryRow {
  id: string;
  category_id: string;
  code: string;
  name: string;
  description: string | null;
  match_keywords: string[] | null;
  required_attribute_codes: string[] | null;
  default_requirement_mode: RequirementMode | null;
  sort_order: number;
}

interface CapabilityRow {
  id: string;
  code: string;
  name: string;
  capacity_unit: string | null;
  capacity_attribute_code: string | null;
}

interface AttributeRow {
  id: string;
  category_id: string | null;
  subcategory_id: string | null;
  code: string;
  label: string;
  data_type: AttributeDataType;
  unit: string | null;
  is_required: boolean;
  options: unknown;
  validation: unknown;
  match_patterns: string[] | null;
  help_text: string | null;
  placeholder: string | null;
  sort_order: number;
}

interface CriterionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  direction: CriterionDirection;
  value_source: string;
  sort_order: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asValidation(value: unknown): AttributeValidation {
  return value && typeof value === 'object' ? (value as AttributeValidation) : {};
}

export async function fetchTaxonomy(): Promise<FetchTaxonomyResult> {
  const [categories, subcategories, capabilities, attributes, criteria, cities] =
    await Promise.all([
      supabase
        .from('requirement_categories')
        .select('id, code, name, description, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('requirement_subcategories')
        .select(
          'id, category_id, code, name, description, match_keywords, required_attribute_codes, default_requirement_mode, sort_order',
        )
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('capabilities')
        .select('id, code, name, capacity_unit, capacity_attribute_code')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('category_attribute_definitions')
        .select(
          'id, category_id, subcategory_id, code, label, data_type, unit, is_required, options, validation, match_patterns, help_text, placeholder, sort_order',
        )
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('evaluation_criteria')
        .select('id, code, name, description, direction, value_source, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      // Service areas themselves are supplier-private; this aggregate is not.
      supabase.rpc('served_cities'),
    ]);

  const failure = [categories, subcategories, capabilities, attributes, criteria].find(
    (r) => r.error,
  );
  if (failure?.error) return { ok: false, error: failure.error.message };

  const categoryRows = (categories.data ?? []) as CategoryRow[];
  const subcategoryRows = (subcategories.data ?? []) as SubcategoryRow[];
  const capabilityRows = (capabilities.data ?? []) as CapabilityRow[];
  const attributeRows = (attributes.data ?? []) as AttributeRow[];
  const criterionRows = (criteria.data ?? []) as CriterionRow[];

  const categoryCodeById = new Map(categoryRows.map((c) => [c.id, c.code]));
  const subcategoryCodeById = new Map(subcategoryRows.map((s) => [s.id, s.code]));

  const mappedCategories: CategoryDef[] = categoryRows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description,
    sortOrder: c.sort_order,
  }));

  const mappedSubcategories: SubcategoryDef[] = subcategoryRows.map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    categoryCode: categoryCodeById.get(s.category_id) ?? '',
    code: s.code,
    name: s.name,
    description: s.description,
    matchKeywords: s.match_keywords ?? [],
    requiredAttributeCodes: s.required_attribute_codes ?? [],
    defaultRequirementMode: s.default_requirement_mode,
    sortOrder: s.sort_order,
  }));

  const mappedCapabilities: CapabilityDef[] = capabilityRows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    capacityUnit: c.capacity_unit,
    capacityAttributeCode: c.capacity_attribute_code,
  }));

  const mappedAttributes: AttributeDef[] = attributeRows.map((a) => ({
    id: a.id,
    categoryCode: a.category_id ? (categoryCodeById.get(a.category_id) ?? null) : null,
    subcategoryCode: a.subcategory_id
      ? (subcategoryCodeById.get(a.subcategory_id) ?? null)
      : null,
    code: a.code,
    label: a.label,
    dataType: a.data_type,
    unit: a.unit,
    isRequired: a.is_required,
    options: asStringArray(a.options),
    validation: asValidation(a.validation),
    matchPatterns: a.match_patterns ?? [],
    helpText: a.help_text,
    placeholder: a.placeholder,
    sortOrder: a.sort_order,
  }));

  const mappedCriteria: EvaluationCriterionDef[] = criterionRows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description,
    direction: c.direction,
    valueSource: c.value_source,
    sortOrder: c.sort_order,
  }));

  // Cities come from where suppliers actually say they work, with standard
  // industrial clusters as reliable fallback so the parser recognises delivery
  // destinations everywhere.
  const cityNames = ((cities.data ?? []) as { city: string | null }[])
    .map((r) => r.city)
    .filter((c): c is string => Boolean(c));

  const standardCities = [
    'Bengaluru',
    'Coimbatore',
    'Tiruppur',
    'Chennai',
    'Salem',
    'Erode',
    'Bhavani',
    'Hyderabad',
    'Mumbai',
    'Delhi',
    'Pune',
    'Ahmedabad',
    'Kolkata',
    'Kochi',
    'Jaipur',
    'Lucknow',
    'Surat',
    'Indore',
    'Nagpur',
    'Vadodara',
    'Visakhapatnam',
    'Mysuru',
    'Madurai',
    'Hosur',
  ];

  const mergedCities = Array.from(new Set([...cityNames, ...standardCities]));

  return {
    ok: true,
    taxonomy: {
      categories: mappedCategories,
      subcategories: mappedSubcategories,
      capabilities: mappedCapabilities,
      attributes: mappedAttributes,
      criteria: mappedCriteria,
      cities: mergedCities,
    },
  };
}

export type FetchSuggestedWeightsResult =
  | { ok: true; weights: Record<string, number> }
  | { ok: false; error: string };

/**
 * The category's opinion about what matters, offered as a starting point. The
 * buyer owns the final set; an empty result simply means no suggestion exists
 * for this subcategory.
 */
export async function fetchSuggestedWeights(
  subcategoryId: string,
): Promise<FetchSuggestedWeightsResult> {
  const { data, error } = await supabase
    .from('subcategory_evaluation_suggestions')
    .select('weight, evaluation_criteria!inner(code)')
    .eq('subcategory_id', subcategoryId);

  if (error) return { ok: false, error: error.message };

  const weights: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as {
    weight: number;
    evaluation_criteria: { code: string };
  }[]) {
    weights[row.evaluation_criteria.code] = Number(row.weight);
  }

  return { ok: true, weights };
}

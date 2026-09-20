import type { EvaluationCriterionDef } from '../taxonomy/types';
import { normalizeEvaluationWeights } from './normalize-weights';

/**
 * Standard strategy presets for procurement evaluations.
 * Allows buyers to 1-tap configure evaluation criteria weights matching their business goals.
 */
export const EvaluationPreset = {
  BALANCED: 'BALANCED',
  PRICE_DOMINANT: 'PRICE_DOMINANT',
  QUALITY_AND_SLA: 'QUALITY_AND_SLA',
  RAPID_FULFILLMENT: 'RAPID_FULFILLMENT',
  CATEGORY_DEFAULT: 'CATEGORY_DEFAULT',
  CUSTOM: 'CUSTOM',
} as const;

export type EvaluationPresetKey = (typeof EvaluationPreset)[keyof typeof EvaluationPreset];

export interface EvaluationPresetOption {
  key: EvaluationPresetKey;
  label: string;
  description: string;
  icon: string;
}

export const EVALUATION_PRESET_OPTIONS: EvaluationPresetOption[] = [
  {
    key: EvaluationPreset.BALANCED,
    label: '⚖️ Balanced Sourcing',
    description: 'Equalized focus across commercial value, delivery turnaround, and quality warranty.',
    icon: '⚖️',
  },
  {
    key: EvaluationPreset.PRICE_DOMINANT,
    label: '💰 Lowest Cost Focus',
    description: 'Prioritizes lowest landed price (60–70% weight) with essential baseline SLAs.',
    icon: '💰',
  },
  {
    key: EvaluationPreset.QUALITY_AND_SLA,
    label: '🏆 Quality & SLA Focus',
    description: 'Prioritizes technical compliance, warranty coverage, certifications, and track record.',
    icon: '🏆',
  },
  {
    key: EvaluationPreset.RAPID_FULFILLMENT,
    label: '⚡ Rapid Turnaround (TAT)',
    description: 'Prioritizes fastest delivery timeline and urgent supplier response time.',
    icon: '⚡',
  },
  {
    key: EvaluationPreset.CATEGORY_DEFAULT,
    label: '🎯 Category Recommended',
    description: 'Tailored specifically for this product/service category based on industry benchmarks.',
    icon: '🎯',
  },
];

/**
 * Essential criteria are presented by default in progressive disclosure.
 * Advanced criteria are revealed on demand to avoid cognitive overload on mobile.
 */
export const ESSENTIAL_CRITERIA_CODES = new Set(['price', 'delivery_time', 'warranty']);

export function isEssentialCriterion(code: string): boolean {
  return ESSENTIAL_CRITERIA_CODES.has(code.toLowerCase());
}

export interface CategoryEvaluationProfile {
  categoryCode: string;
  categoryName: string;
  description: string;
  suggestedWeights: Record<string, number>;
  recommendedCriteriaCodes: string[];
  essentialCriteriaCodes: string[];
  advancedCriteriaCodes: string[];
  rationale: string;
}

/**
 * Authoritative category evaluation profiles mapping procurement verticals
 * to deterministic, 100%-normalized scoring criteria.
 */
const CATEGORY_PROFILES: Record<string, CategoryEvaluationProfile> = {
  ELECTRICAL: {
    categoryCode: 'ELECTRICAL',
    categoryName: 'Electrical & Power Systems',
    description: 'Transformers, switchgears, cabling, motors, and electrical sub-assemblies.',
    suggestedWeights: {
      price: 40,
      delivery_time: 20,
      warranty: 20,
      technical_fit: 10,
      certification: 10,
    },
    recommendedCriteriaCodes: ['price', 'delivery_time', 'warranty', 'technical_fit', 'certification'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['technical_fit', 'certification', 'supplier_rating'],
    rationale: 'Electrical procurement balances landed cost with strict technical compliance, BIS/ISO certifications, and extended warranty support.',
  },
  CIVIL: {
    categoryCode: 'CIVIL',
    categoryName: 'Civil, Construction & Infrastructure',
    description: 'Cement, steel, aggregates, structural works, and facility renovation.',
    suggestedWeights: {
      price: 35,
      technical_fit: 25,
      delivery_time: 15,
      warranty: 15,
      experience: 10,
    },
    recommendedCriteriaCodes: ['price', 'technical_fit', 'delivery_time', 'warranty', 'experience'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['technical_fit', 'experience', 'supplier_rating'],
    rationale: 'Civil and construction contracts emphasize material specifications, structural safety standards, and proven past execution experience.',
  },
  SERVICES: {
    categoryCode: 'SERVICES',
    categoryName: 'Facility Management & Maintenance Services',
    description: 'AMC, HVAC maintenance, housekeeping, security, and facility repairs.',
    suggestedWeights: {
      price: 30,
      response_time: 25,
      supplier_rating: 20,
      warranty: 15,
      on_time_record: 10,
    },
    recommendedCriteriaCodes: ['price', 'response_time', 'supplier_rating', 'warranty', 'on_time_record'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['response_time', 'supplier_rating', 'on_time_record', 'experience'],
    rationale: 'Service contracts prioritize rapid response SLAs, verified technician reputation, and consistent on-time delivery.',
  },
  LOGISTICS: {
    categoryCode: 'LOGISTICS',
    categoryName: 'Logistics, Freight & Fleet Hire',
    description: 'Full truck load (FTL), partial load (PTL), container transport, and crane hire.',
    suggestedWeights: {
      price: 40,
      delivery_time: 30,
      on_time_record: 20,
      supplier_rating: 10,
    },
    recommendedCriteriaCodes: ['price', 'delivery_time', 'on_time_record', 'supplier_rating'],
    essentialCriteriaCodes: ['price', 'delivery_time'],
    advancedCriteriaCodes: ['on_time_record', 'supplier_rating', 'response_time'],
    rationale: 'Logistics fulfillment requires guaranteed delivery timelines and strong past on-time track records.',
  },
  IT_SOFTWARE: {
    categoryCode: 'IT_SOFTWARE',
    categoryName: 'IT Hardware, Software & Professional Services',
    description: 'Networking gear, server infrastructure, software licenses, and IT support.',
    suggestedWeights: {
      technical_fit: 35,
      price: 25,
      experience: 20,
      supplier_rating: 10,
      response_time: 10,
    },
    recommendedCriteriaCodes: ['technical_fit', 'price', 'experience', 'supplier_rating', 'response_time'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['technical_fit', 'experience', 'response_time', 'certification'],
    rationale: 'IT and technology procurement requires exact architectural compatibility, enterprise experience, and rapid escalation response.',
  },
  MANUFACTURING: {
    categoryCode: 'MANUFACTURING',
    categoryName: 'Manufacturing, Fabrication & Job Work',
    description: 'CNC machining, sheet metal fabrication, casting, forging, and custom assembly.',
    suggestedWeights: {
      price: 35,
      technical_fit: 25,
      delivery_time: 20,
      supplier_rating: 10,
      certification: 10,
    },
    recommendedCriteriaCodes: ['price', 'technical_fit', 'delivery_time', 'supplier_rating', 'certification'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['technical_fit', 'certification', 'supplier_rating'],
    rationale: 'Custom job work depends on dimensional precision, QA inspection standards, and reliable fabrication lead times.',
  },
  RAW_MATERIALS: {
    categoryCode: 'RAW_MATERIALS',
    categoryName: 'Raw Materials & Bulk Commodities',
    description: 'Polymers, chemicals, metals, packaging film, and industrial bulk supplies.',
    suggestedWeights: {
      price: 50,
      delivery_time: 20,
      certification: 15,
      supplier_rating: 15,
    },
    recommendedCriteriaCodes: ['price', 'delivery_time', 'certification', 'supplier_rating'],
    essentialCriteriaCodes: ['price', 'delivery_time'],
    advancedCriteriaCodes: ['certification', 'supplier_rating', 'payment_terms'],
    rationale: 'Commodity sourcing is price-sensitive but mandates mill test certificates and purity compliance.',
  },
  DEFAULT_GENERAL: {
    categoryCode: 'GENERAL',
    categoryName: 'General Goods & Supplies',
    description: 'Standard enterprise supplies, tools, consumables, and commercial equipment.',
    suggestedWeights: {
      price: 45,
      delivery_time: 25,
      warranty: 15,
      supplier_rating: 15,
    },
    recommendedCriteriaCodes: ['price', 'delivery_time', 'warranty', 'supplier_rating'],
    essentialCriteriaCodes: ['price', 'delivery_time', 'warranty'],
    advancedCriteriaCodes: ['supplier_rating', 'payment_terms', 'technical_fit'],
    rationale: 'General supplies balance competitive landed cost with verified supplier reliability and delivery speed.',
  },
};

/**
 * Resolves the most accurate CategoryEvaluationProfile based on category code, subcategory code, or requirement mode.
 */
export function getCategoryEvaluationProfile(
  categoryCodeOrMode?: string | null,
  subcategoryCode?: string | null,
): CategoryEvaluationProfile {
  const query = (categoryCodeOrMode || subcategoryCode || '').toUpperCase().trim();

  if (query.includes('ELEC') || query.includes('POWER') || query.includes('MOTOR') || query.includes('WIRE')) {
    return CATEGORY_PROFILES.ELECTRICAL!;
  }
  if (query.includes('CIVIL') || query.includes('BUILD') || query.includes('CONSTRUCT') || query.includes('CEMENT') || query.includes('STEEL')) {
    return CATEGORY_PROFILES.CIVIL!;
  }
  if (query.includes('SERVICE') || query.includes('AMC') || query.includes('MAINT') || query.includes('REPAIR') || query.includes('FACILITY')) {
    return CATEGORY_PROFILES.SERVICES!;
  }
  if (query.includes('LOGIST') || query.includes('FREIGHT') || query.includes('TRANSPORT') || query.includes('TRUCK') || query.includes('RENTAL')) {
    return CATEGORY_PROFILES.LOGISTICS!;
  }
  if (query.includes('IT_') || query.includes('SOFTWARE') || query.includes('TECH') || query.includes('HARDWARE') || query.includes('PROFESSIONAL')) {
    return CATEGORY_PROFILES.IT_SOFTWARE!;
  }
  if (query.includes('MANUF') || query.includes('JOB') || query.includes('FABRICAT') || query.includes('MACHIN')) {
    return CATEGORY_PROFILES.MANUFACTURING!;
  }
  if (query.includes('COMMODITY') || query.includes('RAW') || query.includes('MATERIAL') || query.includes('BULK') || query.includes('CHEMICAL')) {
    return CATEGORY_PROFILES.RAW_MATERIALS!;
  }

  return CATEGORY_PROFILES.DEFAULT_GENERAL!;
}

/**
 * Returns suggested weights for a category, guaranteed normalized to 100%.
 */
export function getSuggestedWeightsForCategory(
  categoryCodeOrMode?: string | null,
  subcategoryCode?: string | null,
): Record<string, number> {
  const profile = getCategoryEvaluationProfile(categoryCodeOrMode, subcategoryCode);
  return normalizeEvaluationWeights(profile.suggestedWeights).weights;
}

/**
 * Applies a strategy preset to an existing criteria set or category profile.
 */
export function applyEvaluationPreset(
  preset: EvaluationPresetKey,
  categoryProfile?: CategoryEvaluationProfile | null,
  currentCriteriaCodes?: string[],
): Record<string, number> {
  const profile = categoryProfile || CATEGORY_PROFILES.DEFAULT_GENERAL!;

  switch (preset) {
    case EvaluationPreset.PRICE_DOMINANT:
      return normalizeEvaluationWeights({
        price: 65,
        delivery_time: 20,
        warranty: 15,
      }).weights;

    case EvaluationPreset.RAPID_FULFILLMENT:
      return normalizeEvaluationWeights({
        delivery_time: 50,
        price: 30,
        supplier_rating: 20,
      }).weights;

    case EvaluationPreset.QUALITY_AND_SLA: {
      const isService = profile.categoryCode === 'SERVICES';
      if (isService) {
        return normalizeEvaluationWeights({
          response_time: 30,
          supplier_rating: 25,
          warranty: 25,
          price: 20,
        }).weights;
      }
      return normalizeEvaluationWeights({
        technical_fit: 35,
        warranty: 25,
        certification: 20,
        price: 20,
      }).weights;
    }

    case EvaluationPreset.CATEGORY_DEFAULT:
      return normalizeEvaluationWeights(profile.suggestedWeights).weights;

    case EvaluationPreset.BALANCED:
    default:
      return normalizeEvaluationWeights({
        price: 40,
        delivery_time: 25,
        warranty: 20,
        supplier_rating: 15,
      }).weights;
  }
}

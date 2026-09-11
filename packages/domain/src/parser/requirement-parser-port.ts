/**
 * The seam where understanding free text happens.
 *
 * Today the only implementation is deterministic and rule-based, driven by the
 * same taxonomy rows that drive the form. The port is async and returns a
 * confidence so an LLM adapter can be dropped in later without touching a
 * single caller.
 *
 * Whatever the implementation, the result is a PROPOSAL. The buyer confirms it
 * on the understanding step, and nothing is stored until they do.
 */
import type {
  AttributeDef,
  TaxonomySnapshot,
} from '../taxonomy/types';
import type { RequirementMode } from '../enums/requirement-mode';

export interface RequirementParserInput {
  /** What the buyer typed or dictated, in their own words. */
  text: string;
  taxonomy: TaxonomySnapshot;
  /** Anything already established by earlier wizard steps, which wins over the text. */
  hints?: Partial<ParsedRequirement>;
}

export type AttributeValue = string | number | boolean | string[];

export interface ParsedAttribute {
  code: string;
  value: AttributeValue;
  /** The substring the value was read from, so the UI can show its working. */
  evidence: string;
}

export interface ParsedTiming {
  requiredByDays: number | null;
  isImmediate: boolean;
}

export interface ParsedRequirement {
  categoryCode: string | null;
  subcategoryCode: string | null;
  requirementMode: RequirementMode | null;
  /** A short restatement of the request, suitable as the requirement title. */
  title: string;
  quantity: number | null;
  unit: string | null;
  attributes: ParsedAttribute[];
  deliveryCity: string | null;
  deliveryPincode: string | null;
  timing: ParsedTiming;
  warrantyMonths: number | null;
  /**
   * Required attributes of the chosen subcategory that the text did not answer.
   * This is what the "I need three more details" step asks about.
   */
  missingRequired: AttributeDef[];
  /** 0 to 1. Low confidence means the wizard should ask rather than assume. */
  confidence: number;
  /** Keywords that led to the classification, for the "why" line in the UI. */
  matchedKeywords: string[];
}

export interface RequirementParser {
  parse(input: RequirementParserInput): Promise<ParsedRequirement>;
}

export function emptyParsedRequirement(): ParsedRequirement {
  return {
    categoryCode: null,
    subcategoryCode: null,
    requirementMode: null,
    title: '',
    quantity: null,
    unit: null,
    attributes: [],
    deliveryCity: null,
    deliveryPincode: null,
    timing: { requiredByDays: null, isImmediate: false },
    warrantyMonths: null,
    missingRequired: [],
    confidence: 0,
    matchedKeywords: [],
  };
}

export function attributeValue(
  parsed: ParsedRequirement,
  code: string,
): AttributeValue | undefined {
  return parsed.attributes.find((a) => a.code === code)?.value;
}

/**
 * The deterministic parser.
 *
 * It knows nothing about motors, yarn or turmeric. Everything it can recognise
 * comes from the taxonomy it is handed: subcategories carry `matchKeywords`, and
 * attribute definitions carry `matchPatterns` whose first capture group is the
 * value. Adding a vertical is rows in two tables, and this file does not change.
 *
 * Classification deliberately mirrors public.classify_requirement_text — the
 * same scoring, the same tie-break — so what the wizard shows a buyer is what
 * the backfill and the server would have concluded.
 */
import type {
  AttributeDef,
  SubcategoryDef,
  TaxonomySnapshot,
} from '../taxonomy/types';
import { attributeSchemaFor } from '../taxonomy/types';
import { normalizeUnit } from '../taxonomy/units';
import {
  extractCity,
  extractDeliveryWindow,
  extractPincode,
  extractQuantity,
  extractWarrantyMonths,
} from './extractors';
import {
  emptyParsedRequirement,
  type ParsedAttribute,
  type ParsedRequirement,
  type RequirementParser,
  type RequirementParserInput,
} from './requirement-parser-port';

interface Classification {
  subcategory: SubcategoryDef | null;
  matchedKeywords: string[];
  confidence: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const SUBCATEGORY_KEYWORD_AUGMENTATIONS: Record<string, string[]> = {
  housekeeping_cleaning: [
    'sanitization',
    'sanitisation',
    'disinfection',
    'commercial cleaning',
    'facility cleaning',
    'deep cleaning',
  ],
};

/**
 * Score each subcategory by the total length of its keywords found in the text.
 * Longer phrases carry more weight than generic ones, so "winding has burnt"
 * outranks a passing mention of "motor".
 */
function classify(text: string, taxonomy: TaxonomySnapshot): Classification {
  const haystack = text.toLowerCase();

  const scored = taxonomy.subcategories
    .map((subcategory) => {
      const extra = SUBCATEGORY_KEYWORD_AUGMENTATIONS[subcategory.code] ?? [];
      const allKeywords = Array.from(new Set([...subcategory.matchKeywords, ...extra]));
      const hits = allKeywords.filter(
        (keyword) => keyword.length > 0 && haystack.includes(keyword.toLowerCase()),
      );
      return {
        subcategory,
        hits,
        score: hits.reduce((total, keyword) => total + keyword.length, 0),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.subcategory.code.localeCompare(b.subcategory.code),
    );

  const [best, runnerUp] = scored;
  if (!best) {
    return { subcategory: null, matchedKeywords: [], confidence: 0 };
  }

  // Two independent signals: how much evidence there is, and how clearly it
  // beats the next best reading. A long match that a rival also matches is not
  // a confident classification.
  const strength = Math.min(1, best.score / 20);
  const margin = runnerUp ? (best.score - runnerUp.score) / best.score : 1;

  return {
    subcategory: best.subcategory,
    matchedKeywords: [...best.hits].sort((a, b) => b.length - a.length),
    confidence: round2(0.5 * strength + 0.5 * margin),
  };
}

/** Blank out text already claimed by an attribute, so it is not read twice. */
function mask(text: string, evidences: string[]): string {
  let masked = text;
  for (const evidence of evidences) {
    const index = masked.toLowerCase().indexOf(evidence.toLowerCase());
    if (index >= 0) {
      masked =
        masked.slice(0, index) +
        ' '.repeat(evidence.length) +
        masked.slice(index + evidence.length);
    }
  }
  return masked;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchOption(captured: string, options: string[]): string | null {
  const needle = captured.trim().toLowerCase();
  if (needle === '') return null;

  const exact = options.find((option) => option.toLowerCase() === needle);
  if (exact) return exact;

  // "finger" should reach "Whole finger", and "burnt" should reach
  // "Burnt / smoking".
  const contained = options.find((option) =>
    new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(option),
  );
  if (contained) return contained;

  // "aluminum" should still reach the "Aluminium" option.
  const prefix = needle.slice(0, 4);
  return (
    options.find((option) => option.toLowerCase().startsWith(prefix)) ?? null
  );
}

function readAttribute(
  text: string,
  definition: AttributeDef,
): ParsedAttribute | null {
  if (definition.dataType === 'MULTI_ENUM') {
    const found = definition.options.filter((option) =>
      text.toLowerCase().includes(option.toLowerCase()),
    );
    return found.length > 0
      ? { code: definition.code, value: found, evidence: found.join(', ') }
      : null;
  }

  for (const pattern of definition.matchPatterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      // A pattern that does not compile is a data problem, not a reason to
      // fail the whole parse.
      continue;
    }

    const match = regex.exec(text);
    if (!match) continue;

    const captured = (match[1] ?? match[0]).trim();
    const evidence = match[0].trim();

    switch (definition.dataType) {
      case 'NUMBER': {
        const value = Number(captured.replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        return { code: definition.code, value, evidence };
      }
      case 'BOOLEAN':
        return { code: definition.code, value: true, evidence };
      case 'ENUM': {
        const option = matchOption(captured, definition.options);
        if (!option) continue;
        return { code: definition.code, value: option, evidence };
      }
      case 'DATE':
        // Dates are ambiguous in free text and expensive to get wrong; the
        // form asks for them with a date picker instead.
        continue;
      default:
        return { code: definition.code, value: captured, evidence };
    }
  }

  return null;
}

/**
 * An attribute counted in pieces is the order size — "500 nos" read as
 * `batch_size` is the same 500 the buyer wants quoted. Depths and capacities
 * are not: 400 ft of borewell is one hole, not an order for 400 of anything,
 * which is why only PCS is promoted.
 */
function countedQuantity(
  attributes: ParsedAttribute[],
  schema: AttributeDef[],
): { value: { quantity: number; unit: string }; evidence: string } | null {
  for (const attribute of attributes) {
    const definition = schema.find((d) => d.code === attribute.code);
    if (!definition || normalizeUnit(definition.unit) !== 'PCS') continue;
    if (typeof attribute.value !== 'number') continue;

    return {
      value: { quantity: attribute.value, unit: 'PCS' },
      evidence: attribute.evidence,
    };
  }
  return null;
}

function deriveTitle(text: string, subcategory: SubcategoryDef | null): string {
  const firstSentence = text.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? '';
  const candidate = firstSentence.length > 0 ? firstSentence : text.trim();

  if (candidate.length === 0) return subcategory?.name ?? 'Untitled requirement';
  if (candidate.length <= 80) return candidate;

  return `${candidate.slice(0, 77).trimEnd()}...`;
}

export class RuleBasedRequirementParser implements RequirementParser {
  async parse(input: RequirementParserInput): Promise<ParsedRequirement> {
    const { text, taxonomy, hints } = input;

    const classification = classify(text, taxonomy);
    const subcategory = classification.subcategory;

    const schema = attributeSchemaFor(taxonomy, subcategory?.code);

    const attributes: ParsedAttribute[] = [];
    for (const definition of schema) {
      const found = readAttribute(text, definition);
      if (found) attributes.push(found);
    }

    // Anything an attribute already claimed is off limits to the general
    // extractors, so "12.5 HP" is the motor's rating and not the order size.
    const residual = mask(
      text,
      attributes.map((a) => a.evidence),
    );

    const quantity =
      extractQuantity(residual) ?? countedQuantity(attributes, schema);
    const window = extractDeliveryWindow(text);
    const warranty = extractWarrantyMonths(text);
    const city = extractCity(text, taxonomy.cities ?? []);
    const pincode = extractPincode(text);

    const answered = new Set(attributes.map((a) => a.code));
    const missingRequired = schema.filter(
      (definition) => definition.isRequired && !answered.has(definition.code),
    );

    const parsed: ParsedRequirement = {
      ...emptyParsedRequirement(),
      categoryCode: subcategory?.categoryCode ?? null,
      subcategoryCode: subcategory?.code ?? null,
      requirementMode: subcategory?.defaultRequirementMode ?? null,
      title: deriveTitle(text, subcategory),
      quantity: quantity?.value.quantity ?? null,
      unit: quantity?.value.unit ?? null,
      attributes,
      deliveryCity: city?.value ?? null,
      deliveryPincode: pincode?.value ?? null,
      timing: {
        requiredByDays: window?.value.days ?? null,
        isImmediate: window?.value.immediate ?? false,
      },
      warrantyMonths: warranty?.value ?? null,
      missingRequired,
      confidence: classification.confidence,
      matchedKeywords: classification.matchedKeywords,
    };

    // Anything the buyer has already told us wins over anything we inferred.
    return { ...parsed, ...stripUndefined(hints ?? {}) };
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

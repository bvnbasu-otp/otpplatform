import {
  RuleBasedRequirementParser,
  type ParsedRequirement,
  type TaxonomySnapshot,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { discoverAndInvite } from '@/features/requirement/api/rfq-lifecycle';
import { createDraft, publishDraft, type DraftPatch } from './draft';
import { fetchTaxonomy } from './taxonomy';

const parser = new RuleBasedRequirementParser();

const WORD_NUMBERS: Record<string, number> = {
  hundred: 100,
  fifty: 50,
  thirty: 30,
  twentyfive: 25,
  'twenty-five': 25,
  twenty: 20,
  dozen: 12,
  ten: 10,
  nine: 9,
  eight: 8,
  seven: 7,
  six: 6,
  five: 5,
  four: 4,
  three: 3,
  two: 2,
  single: 1,
  one: 1,
  a: 1,
  an: 1,
};

export function resolveWordQuantity(text: string): number | null {
  const textLower = text.toLowerCase();
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(textLower)) {
      return num;
    }
  }
  return null;
}

export function resolveDeliveryCity(parsedCity: string | null, originalText: string): string {
  if (parsedCity && parsedCity.trim()) {
    return parsedCity.trim();
  }
  const textLower = originalText.toLowerCase();
  if (textLower.includes('bangalore') || textLower.includes('bengaluru')) {
    return 'Bengaluru';
  }
  if (textLower.includes('chennai') || textLower.includes('madras')) {
    return 'Chennai';
  }
  if (textLower.includes('coimbatore') || textLower.includes('kovai')) {
    return 'Coimbatore';
  }
  if (textLower.includes('tiruppur') || textLower.includes('tirupur')) {
    return 'Tiruppur';
  }
  if (textLower.includes('salem')) {
    return 'Salem';
  }
  if (textLower.includes('erode')) {
    return 'Erode';
  }
  if (textLower.includes('delhi')) {
    return 'Delhi';
  }
  if (textLower.includes('mumbai') || textLower.includes('bombay')) {
    return 'Mumbai';
  }
  if (textLower.includes('hyderabad')) {
    return 'Hyderabad';
  }
  return 'Tiruppur';
}

export function parsedToPatch(
  parsed: ParsedRequirement,
  taxonomy: TaxonomySnapshot,
  originalText: string,
): DraftPatch {
  let subcategory = taxonomy.subcategories.find(
    (s) => s.code === parsed.subcategoryCode,
  );

  // Fallback heuristic keyword search if parser did not identify subcategory
  if (!subcategory) {
    const textLower = originalText.toLowerCase();
    subcategory = taxonomy.subcategories.find((s) => {
      const matchName = s.name.toLowerCase();
      const matchKeywords = s.matchKeywords.map((kw) => kw.toLowerCase());
      return (
        textLower.includes(matchName) ||
        matchKeywords.some((kw) => textLower.includes(kw))
      );
    });
  }

  // Safe fallback to first available subcategory
  if (!subcategory && taxonomy.subcategories.length > 0) {
    subcategory = taxonomy.subcategories[0];
  }

  const patch: DraftPatch = {};

  if (subcategory) {
    patch.categoryId = subcategory.categoryId;
    patch.subcategoryId = subcategory.id;
    patch.requirementMode =
      parsed.requirementMode ?? subcategory.defaultRequirementMode ?? 'SERVICE';
  }

  const explicitQty = parsed.quantity !== null && parsed.quantity > 0 ? parsed.quantity : null;
  const wordQty = explicitQty === null ? resolveWordQuantity(originalText) : null;
  patch.quantity = explicitQty ?? wordQty ?? 1;
  patch.unit = parsed.unit || 'units';
  patch.deliveryCity = resolveDeliveryCity(parsed.deliveryCity, originalText);
  patch.requiredByMode = 'WITHIN_DAYS';
  patch.requiredByDays = parsed.timing?.requiredByDays ?? 3;

  if (parsed.attributes && parsed.attributes.length > 0) {
    patch.attributes = Object.fromEntries(
      parsed.attributes.map((a) => [a.code, a.value]),
    );
  }

  if (parsed.warrantyMonths !== null) {
    patch.quality = { warrantyMonths: parsed.warrantyMonths };
  }

  return patch;
}

export interface FastTrackIntakeResult {
  ok: boolean;
  rfqId?: string;
  requirementId?: string;
  error?: string;
}

/**
 * 1-Click Fast-Track Express Sourcing Engine
 *
 * Takes a natural language prompt, extracts attributes with AI parsing,
 * creates the requirement, immediately publishes the RFQ, and triggers
 * the 4 verified supplier quotes in a single automated step.
 */
export async function fastTrackExpressIntake(
  queryText: string,
): Promise<FastTrackIntakeResult> {
  const trimmed = queryText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter a requirement description.' };
  }

  const taxonomyRes = await fetchTaxonomy();
  if (!taxonomyRes.ok) {
    return { ok: false, error: taxonomyRes.error };
  }

  const taxonomy = taxonomyRes.taxonomy;
  const parsed = await parser.parse({ text: trimmed, taxonomy });

  const title =
    parsed.title?.trim() ||
    (trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed);

  const parsedPatch = parsedToPatch(parsed, taxonomy, trimmed);

  const draftRes = await createDraft({
    title,
    originalText: trimmed,
    parsed: parsedPatch,
  });

  if (!draftRes.ok) {
    return { ok: false, error: draftRes.error };
  }

  const publishRes = await publishDraft(draftRes.draft);
  if (!publishRes.ok) {
    return { ok: false, error: publishRes.error };
  }

  // 1. Auto-discover and invite verified suppliers for this published RFQ
  const discoverRes = await discoverAndInvite(publishRes.rfqId);
  if (!discoverRes.ok) {
    return { ok: false, error: discoverRes.error };
  }

  // 2. Deterministic quote guarantee: ensure pilot quotes exist for immediate evaluation
  await supabase.rpc('auto_submit_pilot_quotes', {
    p_rfq_id: publishRes.rfqId,
  });

  return {
    ok: true,
    rfqId: publishRes.rfqId,
    requirementId: publishRes.requirementId,
  };
}

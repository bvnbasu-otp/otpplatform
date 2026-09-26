import {
  IDENTITY_PROTECTED_RFQ_DESCRIPTION,
  IDENTITY_PROTECTED_RFQ_LABEL,
} from '@/lib/brand';
import { scrubClarificationPii } from '@/features/clarification/utils/pii-scrubber';

/**
 * One wording for identity protection, wherever a supplier meets it.
 *
 * The label and explanation are the platform's (brand.ts); this module only
 * fixes which of them the supplier surfaces use, so the RFQ page, the inbox,
 * the home card and the WhatsApp quick-quote page cannot drift apart.
 */
export const IDENTITY_SHIELD_LABEL = IDENTITY_PROTECTED_RFQ_LABEL;
export const IDENTITY_SHIELD_EXPLANATION = IDENTITY_PROTECTED_RFQ_DESCRIPTION;

/**
 * What a supplier is told about the buyer before award, always.
 *
 * Matches the label rfqs_supplier_masked uses, but is applied regardless of
 * what the server sent: a buyer is released to a supplier through
 * rfq_buyer_revealed after award, never through an RFQ view.
 */
export const PROTECTED_BUYER_LABEL = 'Identity protected';

/** Free text written by the buyer, with contact details removed before display. */
export function scrubBuyerFreeText(text: string): string;
export function scrubBuyerFreeText(text: string | null): string | null;
export function scrubBuyerFreeText(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return scrubClarificationPii(text).scrubbedText;
}

/** Scrubs contact details out of every string inside a spec / commercial block. */
export function scrubBuyerFreeTextDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubBuyerFreeText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => scrubBuyerFreeTextDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubBuyerFreeTextDeep(child);
    }
    return out as T;
  }
  return value;
}

import type { IdentityProtectedQuote } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { mapIdentityProtectedQuoteRow } from '../mappers/identity-protected-quote-mapper';
import type { IdentityProtectedQuoteRow } from '../types/identity-protected-quote-row';

export type FetchIdentityProtectedQuotesResult =
  | { ok: true; quotes: IdentityProtectedQuote[] }
  | { ok: false; error: string };

// Legacy alias
export type FetchBlindQuotesResult = FetchIdentityProtectedQuotesResult;

/**
 * Fetches identity-protected quotes via quotes_identity_protected view (RLS-enforced).
 * No business logic — maps to domain IdentityProtectedQuote and validates payload safety.
 */
export async function fetchIdentityProtectedQuotes(rfqId: string): Promise<FetchIdentityProtectedQuotesResult> {
  const { data, error } = await supabase
    .from('quotes_identity_protected')
    .select('*')
    .eq('rfq_id', rfqId);

  if (error) {
    return { ok: false, error: error.message };
  }

  try {
    const quotes = (data as IdentityProtectedQuoteRow[]).map(mapIdentityProtectedQuoteRow);
    quotes.sort((a, b) => a.totalCost - b.totalCost);
    return { ok: true, quotes };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to map identity-protected quotes';
    return { ok: false, error: message };
  }
}

// Legacy alias
export const fetchBlindQuotes = fetchIdentityProtectedQuotes;

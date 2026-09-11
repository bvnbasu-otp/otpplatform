import { supabase } from '@/lib/supabase';

/**
 * What a supplier is allowed to know once a round is decided.
 *
 * Both shapes come from views that filter by the caller, so there is nothing to
 * check here: a losing supplier asking for the buyer gets an empty result rather
 * than a forbidden one, and a rival's alias or amount is not a field that exists.
 */

export type QuoteOutcome = 'WON' | 'NOT_SELECTED' | 'WITHDRAWN' | 'NO_QUOTE';

// Legacy alias
export type BidOutcome = QuoteOutcome;

export interface MyQuoteOutcome {
  rfqId: string;
  publicRef: string | null;
  title: string;
  myAlias: string;
  outcome: QuoteOutcome;
  /** True only when this supplier won and the buyer has been released to them. */
  buyerReleased: boolean;
  decidedAt: string | null;
}

// Legacy alias
export type MyBidOutcome = MyQuoteOutcome;

export interface RevealedBuyer {
  rfqId: string;
  publicRef: string | null;
  organization: string;
  buyerType: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  taxRegistration: string | null;
  city: string | null;
  address: Record<string, unknown> | null;
  awardedByName: string | null;
  awardedByEmail: string | null;
  awardedAt: string | null;
  revealedAt: string | null;
}

// One string literal each, not a concatenation: supabase-js parses the column
// list in the type system, and a joined string widens to `string` and takes the
// row type down with it.
const OUTCOME_COLUMNS =
  'rfq_id, public_ref, title, my_alias, outcome, buyer_released, decided_at';

const BUYER_COLUMNS =
  'rfq_id, public_ref, buyer_organization, buyer_type, contact_person, contact_phone, contact_email, tax_registration, city, address, awarded_by_name, awarded_by_email, awarded_at, revealed_at';

export type OutcomeResult =
  | { ok: true; outcome: MyQuoteOutcome | null }
  | { ok: false; error: string };

export async function fetchMyQuoteOutcome(rfqId: string): Promise<OutcomeResult> {
  const { data, error } = await supabase
    .from('my_quote_outcome')
    .select(OUTCOME_COLUMNS)
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  // No row means the round is not decided yet, which is not an error.
  if (!data) return { ok: true, outcome: null };

  return {
    ok: true,
    outcome: {
      rfqId: data.rfq_id as string,
      publicRef: (data.public_ref as string | null) ?? null,
      title: data.title as string,
      myAlias: data.my_alias as string,
      outcome: data.outcome as QuoteOutcome,
      buyerReleased: Boolean(data.buyer_released),
      decidedAt: (data.decided_at as string | null) ?? null,
    },
  };
}

// Legacy alias
export const fetchMyBidOutcome = fetchMyQuoteOutcome;

export type RevealedBuyerResult =
  | { ok: true; buyer: RevealedBuyer | null }
  | { ok: false; error: string };

export async function fetchRevealedBuyer(rfqId: string): Promise<RevealedBuyerResult> {
  const { data, error } = await supabase
    .from('rfq_buyer_revealed')
    .select(BUYER_COLUMNS)
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, buyer: null };

  return {
    ok: true,
    buyer: {
      rfqId: data.rfq_id as string,
      publicRef: (data.public_ref as string | null) ?? null,
      organization: data.buyer_organization as string,
      buyerType: (data.buyer_type as string | null) ?? null,
      contactPerson: (data.contact_person as string | null) ?? null,
      contactPhone: (data.contact_phone as string | null) ?? null,
      contactEmail: (data.contact_email as string | null) ?? null,
      taxRegistration: (data.tax_registration as string | null) ?? null,
      city: (data.city as string | null) ?? null,
      address: (data.address as Record<string, unknown> | null) ?? null,
      awardedByName: (data.awarded_by_name as string | null) ?? null,
      awardedByEmail: (data.awarded_by_email as string | null) ?? null,
      awardedAt: (data.awarded_at as string | null) ?? null,
      revealedAt: (data.revealed_at as string | null) ?? null,
    },
  };
}

/** A postal address as one line, skipping the parts an organization left blank. */
export function formatAddress(address: Record<string, unknown> | null): string | null {
  if (!address) return null;

  const parts = ['line1', 'line2', 'city', 'state', 'postalCode']
    .map((key) => address[key])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  return parts.length > 0 ? parts.join(', ') : null;
}

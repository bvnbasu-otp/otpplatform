import { supabase } from '@/lib/supabase';

/**
 * The quoting journey that starts in a text message.
 *
 * Everything here is called without a signed-in user, because the supplier has
 * no account — the whole point of the link is that they did not need one. The
 * token is the credential, and the database is what enforces what it can do:
 * one supplier, one enquiry, expiring in hours.
 *
 * So there is nothing to guard in this file. It cannot decide anything, and it
 * deliberately does not try to; every call re-checks state server-side.
 */

/** Fields a supplier may be shown about the enquiry. Mirrors the SQL allow-list. */
export interface QuickQuoteRfq {
  publicRef: string;
  alias?: string;
  title?: string;
  category?: string;
  subcategory?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  requiredByDays?: number;
  requiredByDate?: string;
  quoteDeadline?: string;
  minQuotes?: number;
  buyerDisplay?: string;
  isDemo?: boolean;
}

export interface QuickQuoteSnapshot {
  basePrice?: number;
  gstAmount?: number;
  transportCost?: number;
  totalCost?: number;
  deliveryDays?: number;
  warrantyMonths?: number;
  currency?: string;
  quotedVia?: string;
  priceUnit?: string;
}

export interface QuickQuoteContext {
  rfq: QuickQuoteRfq;
  expiresAt: string;
  quote: {
    status: string;
    version: number;
    submitted: boolean;
    snapshot: QuickQuoteSnapshot;
  } | null;
}

export type QuickQuoteFailure =
  | 'INVALID'
  | 'INVALID_SESSION'
  | 'RFQ_CLOSED'
  | 'DEADLINE_PASSED'
  | 'NOT_INVITED'
  | 'INVALID_AMOUNT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

export type QuickQuoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: QuickQuoteFailure };

export interface QuickQuoteSession {
  sessionToken: string;
  reference: string | null;
  expiresAt: string;
}

/**
 * Exchanges the one-time link token for a session.
 *
 * Single-use is enforced in the database, so opening the link twice — or having
 * it forwarded to someone else — fails on the second attempt rather than here.
 */
export async function redeemQuickQuoteLink(
  token: string,
): Promise<QuickQuoteResult<QuickQuoteSession>> {
  const { data, error } = await supabase.rpc('redeem_supplier_magic_link', {
    p_token: token,
  });

  if (error) return { ok: false, reason: 'UNAVAILABLE' };

  const payload = data as Record<string, unknown> | null;

  if (payload?.outcome === 'OK') {
    return {
      ok: true,
      value: {
        sessionToken: String(payload.sessionToken),
        reference: (payload.publicRef as string) ?? null,
        expiresAt: String(payload.expiresAt),
      },
    };
  }

  return { ok: false, reason: asFailure(payload?.outcome) };
}

export async function fetchQuickQuoteContext(
  sessionToken: string,
): Promise<QuickQuoteResult<QuickQuoteContext>> {
  const { data, error } = await supabase.rpc('messaging_quote_context', {
    p_session_token: sessionToken,
  });

  if (error) return { ok: false, reason: 'UNAVAILABLE' };

  const payload = data as Record<string, unknown> | null;

  if (payload?.outcome === 'OK') {
    return {
      ok: true,
      value: {
        rfq: payload.rfq as QuickQuoteRfq,
        expiresAt: String(payload.expiresAt),
        quote: (payload.quote as QuickQuoteContext['quote']) ?? null,
      },
    };
  }

  return { ok: false, reason: asFailure(payload?.outcome) };
}

export interface QuickQuoteInput {
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  notes?: string;
}

export interface QuickQuoteSubmission {
  reference: string | null;
  alias: string | null;
  version: number;
  status: string;
}

export async function submitQuickQuote(
  sessionToken: string,
  input: QuickQuoteInput,
): Promise<QuickQuoteResult<QuickQuoteSubmission>> {
  const { data, error } = await supabase.rpc('submit_messaging_quote', {
    p_session_token: sessionToken,
    p_quote: {
      basePrice: input.basePrice,
      gstAmount: input.gstAmount,
      transportCost: input.transportCost,
      deliveryDays: input.deliveryDays,
      warrantyMonths: input.warrantyMonths,
      currency: 'INR',
      notes: input.notes ?? null,
    },
  });

  if (error) return { ok: false, reason: 'UNAVAILABLE' };

  const payload = data as Record<string, unknown> | null;

  if (payload?.outcome === 'OK') {
    return {
      ok: true,
      value: {
        reference: (payload.reference as string) ?? null,
        alias: (payload.alias as string) ?? null,
        version: Number(payload.version ?? 1),
        status: String(payload.status),
      },
    };
  }

  return { ok: false, reason: asFailure(payload?.outcome) };
}

function asFailure(outcome: unknown): QuickQuoteFailure {
  const known: QuickQuoteFailure[] = [
    'INVALID', 'INVALID_SESSION', 'RFQ_CLOSED', 'DEADLINE_PASSED',
    'NOT_INVITED', 'INVALID_AMOUNT', 'RATE_LIMITED',
  ];
  return known.includes(outcome as QuickQuoteFailure)
    ? (outcome as QuickQuoteFailure)
    : 'UNAVAILABLE';
}

/**
 * What to tell the supplier when something goes wrong.
 *
 * A used, expired and never-existed link all say the same thing, because the
 * database deliberately cannot tell them apart — and because for the person
 * holding the link the useful information is identical: this one is finished,
 * here is how to get another.
 */
export function describeQuickQuoteFailure(reason: QuickQuoteFailure): {
  title: string;
  detail: string;
} {
  switch (reason) {
    case 'INVALID':
    case 'INVALID_SESSION':
      return {
        title: 'This link has already been used, or has expired',
        detail:
          'Links open once and last two days. Reply to our message with your price '
          + 'and we will send you a fresh one.',
      };
    case 'RFQ_CLOSED':
      return {
        title: 'This enquiry has closed',
        detail:
          'The buyer is no longer taking quotes. We will message you when the next '
          + 'job matches what you do.',
      };
    case 'DEADLINE_PASSED':
      return {
        title: 'The deadline for this enquiry has passed',
        detail: 'Your price could not be recorded. We will message you about the next one.',
      };
    case 'NOT_INVITED':
      return {
        title: 'This enquiry is not open to you',
        detail: 'Check the reference in the message we sent you.',
      };
    case 'INVALID_AMOUNT':
      return {
        title: 'That price does not look right',
        detail: 'Enter the amount in rupees, without symbols.',
      };
    case 'RATE_LIMITED':
      return {
        title: 'Too many attempts',
        detail: 'Please wait a minute and try again.',
      };
    case 'UNAVAILABLE':
      return {
        title: 'Something went wrong at our end',
        detail: 'Your price is safe. Please try again in a moment.',
      };
  }
}

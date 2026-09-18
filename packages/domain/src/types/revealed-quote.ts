import type { IdentityProtectedQuote } from './blind-quote';

/**
 * Post-reveal quote with supplier identity (quotes_revealed view).
 * Non-winning quotes have identity attributes masked to null/anonymous.
 */
export interface RevealedQuote extends IdentityProtectedQuote {
  supplierId: string | null;
  businessName: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  gstin?: string | null;
  gstStatus?: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown> | null;
  source: string | null;
}

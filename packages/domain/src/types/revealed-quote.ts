import type { IdentityProtectedQuote } from './blind-quote';

/**
 * Post-reveal quote with supplier identity (quotes_revealed view).
 */
export interface RevealedQuote extends IdentityProtectedQuote {
  supplierId: string;
  businessName: string;
  legalName?: string | null;
  tradeName?: string | null;
  gstin?: string | null;
  gstStatus?: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown> | null;
  source: string;
}

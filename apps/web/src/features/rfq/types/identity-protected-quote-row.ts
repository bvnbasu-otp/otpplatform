import type { QuoteStatus } from '@otp/domain';

/** PostgREST row from quotes_identity_protected view — presentation layer only. */
export interface IdentityProtectedQuoteRow {
  quote_id: string | null;
  anonymous_label: string | null;
  rfq_id: string | null;
  status: QuoteStatus | null;
  version: number | null;
  evaluation_score: number | null;
  submitted_at: string | null;
  base_price: number | null;
  gst_amount: number | null;
  transport_cost: number | null;
  total_cost: number | null;
  delivery_days: number | null;
  warranty_months: number | null;
  payment_terms_days?: number | null;
  /** Rounded to the half star so an exact rating cannot fingerprint a supplier. */
  rating_band?: number | null;
  /** Rounded to the nearest 5%. */
  on_time_band?: number | null;
  experience_band?: string | null;
  verification_status?: string | null;
  is_gst_verified?: boolean | null;
}

/** Backward-compatible type alias */
export type QuotesBlindRow = IdentityProtectedQuoteRow;

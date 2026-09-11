import type { IdentityProtectedQuote } from '@otp/domain';
import type { QuoteStatus } from '@otp/domain';
import type { Database } from '../generated/supabase';

export type QuotesBlindRow = Database['public']['Views']['quotes_blind']['Row'];

export function mapIdentityProtectedQuoteRow(row: QuotesBlindRow): IdentityProtectedQuote {
  if (!row.quote_id) {
    throw new Error('quotes_blind row missing quote_id');
  }

  return {
    quoteId: row.quote_id,
    anonymousLabel: row.anonymous_label ?? 'Unknown',
    version: row.version ?? 1,
    status: (row.status ?? 'SUBMITTED') as QuoteStatus,
    basePrice: Number(row.base_price ?? 0),
    gstAmount: Number(row.gst_amount ?? 0),
    transportCost: Number(row.transport_cost ?? 0),
    totalCost: Number(row.total_cost ?? 0),
    deliveryDays: row.delivery_days ?? 0,
    warrantyMonths: row.warranty_months ?? 0,
    evaluationScore: row.evaluation_score ?? null,
    supplierRatingAvg: null,
    pastPerformanceScore: null,
    submittedAt: row.submitted_at ?? null,
  };
}

// Legacy alias
export const mapBlindQuoteRow = mapIdentityProtectedQuoteRow;

export function identityProtectedQuoteToRecord(quote: IdentityProtectedQuote): Record<string, unknown> {
  return {
    quoteId: quote.quoteId,
    anonymousLabel: quote.anonymousLabel,
    version: quote.version,
    status: quote.status,
    basePrice: quote.basePrice,
    gstAmount: quote.gstAmount,
    transportCost: quote.transportCost,
    totalCost: quote.totalCost,
    deliveryDays: quote.deliveryDays,
    warrantyMonths: quote.warrantyMonths,
    evaluationScore: quote.evaluationScore,
    supplierRatingAvg: quote.supplierRatingAvg,
    pastPerformanceScore: quote.pastPerformanceScore,
    submittedAt: quote.submittedAt,
  };
}

// Legacy alias
export const blindQuoteToRecord = identityProtectedQuoteToRecord;

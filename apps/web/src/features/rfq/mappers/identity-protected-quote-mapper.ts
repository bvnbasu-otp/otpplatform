import {
  assertIdentityProtectedPayloadSafe,
  type IdentityProtectedQuote,
  type QuoteStatus,
} from '@otp/domain';
import type { IdentityProtectedQuoteRow, QuotesBlindRow } from '../types/identity-protected-quote-row';

export function mapIdentityProtectedQuoteRow(row: IdentityProtectedQuoteRow): IdentityProtectedQuote {
  if (!row.quote_id) {
    throw new Error('Invalid identity-protected quote row: missing quote_id');
  }

  const quote: IdentityProtectedQuote = {
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
    // The view hands these over already banded, which is the only form in which
    // they are safe to show while the RFQ is identity-protected.
    supplierRatingAvg: row.rating_band ?? null,
    pastPerformanceScore: row.on_time_band ?? null,
    experienceBand: row.experience_band ?? null,
    verificationStatus: row.verification_status ?? null,
    isGstVerified: Boolean(row.is_gst_verified),
    paymentTermsDays: row.payment_terms_days ?? null,
    submittedAt: row.submitted_at ?? null,
  };

  assertIdentityProtectedPayloadSafe(quote as unknown as Record<string, unknown>);
  return quote;
}

// Legacy alias
export const mapBlindQuoteRow = mapIdentityProtectedQuoteRow;

export function identityProtectedQuoteToDisplayRecord(quote: IdentityProtectedQuote): Record<string, unknown> {
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
    paymentTermsDays: quote.paymentTermsDays,
    evaluationScore: quote.evaluationScore,
    supplierRatingAvg: quote.supplierRatingAvg,
    pastPerformanceScore: quote.pastPerformanceScore,
    experienceBand: quote.experienceBand,
    verificationStatus: quote.verificationStatus,
    isGstVerified: quote.isGstVerified,
    submittedAt: quote.submittedAt,
  };
}

// Legacy alias
export const blindQuoteToDisplayRecord = identityProtectedQuoteToDisplayRecord;

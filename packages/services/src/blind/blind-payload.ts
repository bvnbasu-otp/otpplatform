import type { IdentityProtectedQuote } from '@otp/domain';

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

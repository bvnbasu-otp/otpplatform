import { describe, expect, it } from 'vitest';
import {
  assertIdentityProtectedPayloadSafe,
  type IdentityProtectedQuote,
} from './blind-quote';

describe('IdentityProtectedQuote comparable ranking metadata', () => {
  it('carries server-derived level, rank, eligible count, and GST structure without identity', () => {
    const quote: IdentityProtectedQuote = {
      quoteId: 'quote-1',
      anonymousLabel: 'Supplier A',
      version: 1,
      status: 'SUBMITTED',
      basePrice: 100,
      gstAmount: 18,
      transportCost: 2,
      totalCost: 120,
      deliveryDays: 3,
      warrantyMonths: 12,
      evaluationScore: 90,
      supplierRatingAvg: null,
      pastPerformanceScore: null,
      submittedAt: '2026-10-16T00:00:00Z',
      comparableRank: 1,
      comparisonLevel: 'L3',
      eligibleQuoteCount: 3,
      taxStructure: 'IGST',
    };

    expect(() => assertIdentityProtectedPayloadSafe(quote as unknown as Record<string, unknown>)).not.toThrow();
    expect(quote).toMatchObject({
      comparableRank: 1,
      comparisonLevel: 'L3',
      eligibleQuoteCount: 3,
      taxStructure: 'IGST',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { assertIdentityProtectedPayloadSafe } from '@otp/domain';
import {
  mapIdentityProtectedQuoteRow,
  identityProtectedQuoteToDisplayRecord,
} from './identity-protected-quote-mapper';

describe('mapIdentityProtectedQuoteRow', () => {
  it('maps view row to IdentityProtectedQuote and passes identity protection safety check', () => {
    const quote = mapIdentityProtectedQuoteRow({
      quote_id: 'q-1',
      anonymous_label: 'Supplier A',
      rfq_id: 'rfq-1',
      status: 'SUBMITTED',
      version: 1,
      evaluation_score: 88,
      submitted_at: '2026-01-01T00:00:00Z',
      base_price: 7800,
      gst_amount: 0,
      transport_cost: 0,
      total_cost: 7800,
      delivery_days: 4,
      warranty_months: 6,
    });

    expect(quote.anonymousLabel).toBe('Supplier A');
    expect(quote.totalCost).toBe(7800);
    assertIdentityProtectedPayloadSafe(identityProtectedQuoteToDisplayRecord(quote));
  });

  it('carries the banded reliability signals without anything identifying', () => {
    const quote = mapIdentityProtectedQuoteRow({
      quote_id: 'q-2',
      anonymous_label: 'Supplier K7P4',
      rfq_id: 'rfq-1',
      status: 'FINAL',
      version: 2,
      evaluation_score: 91.5,
      submitted_at: '2026-01-02T00:00:00Z',
      base_price: 9000,
      gst_amount: 1620,
      transport_cost: 400,
      total_cost: 11020,
      delivery_days: 3,
      warranty_months: 12,
      payment_terms_days: 30,
      rating_band: 4.5,
      on_time_band: 90,
      experience_band: '20-49',
      verification_status: 'DOCUMENT_VERIFIED',
    });

    expect(quote.supplierRatingAvg).toBe(4.5);
    expect(quote.pastPerformanceScore).toBe(90);
    expect(quote.experienceBand).toBe('20-49');
    assertIdentityProtectedPayloadSafe(identityProtectedQuoteToDisplayRecord(quote));
  });

  it('reports no rating rather than a zero when the view has none', () => {
    const quote = mapIdentityProtectedQuoteRow({
      quote_id: 'q-3',
      anonymous_label: 'Supplier A3F9',
      rfq_id: 'rfq-1',
      status: 'SUBMITTED',
      version: 1,
      evaluation_score: null,
      submitted_at: null,
      base_price: 100,
      gst_amount: 0,
      transport_cost: 0,
      total_cost: 100,
      delivery_days: 1,
      warranty_months: 0,
    });

    expect(quote.supplierRatingAvg).toBeNull();
    expect(quote.pastPerformanceScore).toBeNull();
  });

  it('rejects rows with forbidden fields if present on mapped object', () => {
    const quote = mapIdentityProtectedQuoteRow({
      quote_id: 'q-1',
      anonymous_label: 'Supplier B',
      rfq_id: 'rfq-1',
      status: 'SUBMITTED',
      version: 1,
      evaluation_score: null,
      submitted_at: null,
      base_price: 8500,
      gst_amount: 0,
      transport_cost: 0,
      total_cost: 8500,
      delivery_days: 2,
      warranty_months: 12,
    });

    expect(() =>
      assertIdentityProtectedPayloadSafe({
        ...identityProtectedQuoteToDisplayRecord(quote),
        supplier_id: 'leak',
      }),
    ).toThrow();
  });
});

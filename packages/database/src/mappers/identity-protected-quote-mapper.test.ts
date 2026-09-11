import { describe, expect, it } from 'vitest';
import { mapBlindQuoteRow } from './blind-quote-mapper';
import { assertIdentityProtectedPayloadSafe } from '@otp/domain';

describe('identity-protected-quote-mapper', () => {
  it('maps quotes_identity_protected row to domain IdentityProtectedQuote', () => {
    const quote = mapBlindQuoteRow({
      quote_id: 'q-1',
      anonymous_label: 'Supplier A',
      rfq_id: 'rfq-1',
      status: 'SUBMITTED',
      version: 1,
      evaluation_score: 88.5,
      submitted_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      base_price: 8500,
      gst_amount: 0,
      transport_cost: 0,
      total_cost: 8500,
      delivery_days: 2,
      warranty_months: 12,
      experience_band: null,
      on_time_band: null,
      payment_terms_days: null,
      rating_band: null,
      verification_status: null,
    });

    expect(quote.quoteId).toBe('q-1');
    expect(quote.anonymousLabel).toBe('Supplier A');
    expect(quote.totalCost).toBe(8500);
    assertIdentityProtectedPayloadSafe(quote as unknown as Record<string, unknown>);
  });
});

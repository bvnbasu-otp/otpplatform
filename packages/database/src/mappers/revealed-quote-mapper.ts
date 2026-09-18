import type { RevealedQuote } from '@otp/domain';
import type { QuoteStatus } from '@otp/domain';
import type { Database } from '../generated/supabase';

export type QuotesRevealedRow =
  Database['public']['Views']['quotes_revealed']['Row'];

export function mapRevealedQuoteRow(row: QuotesRevealedRow): RevealedQuote {
  if (!row.quote_id) {
    throw new Error('quotes_revealed row missing quote_id');
  }

  const address =
    row.address && typeof row.address === 'object' && !Array.isArray(row.address)
      ? (row.address as Record<string, unknown>)
      : null;

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
    supplierRatingAvg: row.supplier_rating != null ? Number(row.supplier_rating) : null,
    pastPerformanceScore: null,
    submittedAt: row.submitted_at ?? null,
    supplierId: row.supplier_id ?? null,
    businessName: row.business_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    address,
    source: row.source ?? null,
  };
}

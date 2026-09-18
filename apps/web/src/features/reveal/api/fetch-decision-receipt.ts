import { supabase } from '@/lib/supabase';
import { buildDecisionReceipt, type DecisionReceipt, type ReceiptSupplier } from '../types/decision-receipt';

interface RevealedRow {
  quote_id: string;
  anonymous_label: string;
  supplier_id: string | null;
  business_name: string | null;
  total_cost: number | null;
  evaluation_score: number | null;
  supplier_rating: number | null;
}

interface PriorOrderRow {
  supplier_id: string;
}

/**
 * Counts purchase orders this organisation already placed with each supplier on
 * other RFQs. RLS scopes the query to the caller's organisation, so a match
 * means a genuine prior relationship rather than platform-wide activity.
 */
async function fetchPriorOrderCounts(
  rfqId: string,
  supplierIds: string[],
): Promise<Record<string, number>> {
  const validIds = supplierIds.filter(Boolean);
  if (validIds.length === 0) return {};

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('supplier_id')
    .in('supplier_id', validIds)
    .neq('rfq_id', rfqId);

  if (error || !data) return {};

  return (data as PriorOrderRow[]).reduce<Record<string, number>>((counts, row) => {
    counts[row.supplier_id] = (counts[row.supplier_id] ?? 0) + 1;
    return counts;
  }, {});
}

export async function fetchDecisionReceipt(
  rfqId: string,
  winningQuoteId: string,
): Promise<{ ok: true; receipt: DecisionReceipt | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('quotes_revealed')
    .select(
      'quote_id, anonymous_label, supplier_id, business_name, total_cost, evaluation_score, supplier_rating',
    )
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as RevealedRow[];
  const priorOrders = await fetchPriorOrderCounts(
    rfqId,
    rows.map((r) => r.supplier_id).filter((id): id is string => Boolean(id)),
  );

  const suppliers: ReceiptSupplier[] = rows.map((row) => ({
    quoteId: row.quote_id,
    anonymousLabel: row.anonymous_label,
    supplierId: row.supplier_id ?? null,
    businessName: row.business_name ?? null,
    totalCost: Number(row.total_cost ?? 0),
    evaluationScore: row.evaluation_score === null ? null : Number(row.evaluation_score),
    rating: row.supplier_rating === null ? null : Number(row.supplier_rating),
    priorOrders: row.supplier_id ? (priorOrders[row.supplier_id] ?? 0) : 0,
  }));

  return { ok: true, receipt: buildDecisionReceipt(suppliers, winningQuoteId) };
}

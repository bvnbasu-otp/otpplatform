import { supabase } from '@/lib/supabase';
import type { IdentityProtectedQuoteForVote, RfqGovernanceStatus } from '../types/governance';

interface IdentityProtectedQuoteRow {
  quote_id: string;
  anonymous_label: string;
  total_cost: number | null;
  evaluation_score: number | null;
  delivery_days: number | null;
}

function mapIdentityProtectedQuote(row: IdentityProtectedQuoteRow): IdentityProtectedQuoteForVote {
  return {
    quoteId: row.quote_id,
    anonymousLabel: row.anonymous_label,
    totalCost: Number(row.total_cost ?? 0),
    evaluationScore: row.evaluation_score != null ? Number(row.evaluation_score) : null,
    deliveryDays: row.delivery_days,
  };
}

export async function fetchRfqGovernanceStatus(rfqId: string): Promise<
  { ok: true; status: RfqGovernanceStatus } | { ok: false; error: string }
> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('id, status, requirement_id')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr || !rfq) return { ok: false, error: rfqErr?.message ?? 'RFQ not found' };

  const { data: req } = await supabase
    .from('requirements')
    .select('status')
    .eq('id', rfq.requirement_id)
    .maybeSingle();

  return {
    ok: true,
    status: {
      rfqId,
      rfqStatus: rfq.status,
      requirementStatus: req?.status ?? 'UNKNOWN',
      isEvaluating: rfq.status === 'EVALUATING',
    },
  };
}

export async function closeQuotingForEvaluation(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase.rpc('close_clarification_for_evaluation', {
    p_rfq_id: rfqId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchIdentityProtectedQuotesForVote(rfqId: string): Promise<
  { ok: true; quotes: IdentityProtectedQuoteForVote[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('quotes_identity_protected')
    .select('quote_id, anonymous_label, total_cost, evaluation_score, delivery_days')
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };

  const quotes = (data as IdentityProtectedQuoteRow[]).map(mapIdentityProtectedQuote);
  quotes.sort((a, b) => (b.evaluationScore ?? 0) - (a.evaluationScore ?? 0));
  return { ok: true, quotes };
}

// Backward-compatible alias
export const fetchBlindQuotesForVote = fetchIdentityProtectedQuotesForVote;

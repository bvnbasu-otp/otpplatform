import type { EvaluationCriterionDef } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { parseBreakdown, type QuoteEvaluation } from '../types/quote-evaluation';

/**
 * Reads scores through quote_evaluations_blind, which carries the anonymous
 * label and nothing that could name the supplier behind it.
 */

export type FetchQuoteEvaluationsResult =
  | { ok: true; evaluations: QuoteEvaluation[] }
  | { ok: false; error: string };

interface EvaluationRow {
  evaluation_id: string;
  quote_id: string;
  anonymous_label: string | null;
  version_evaluated: number | null;
  evaluation_score: number | null;
  breakdown: unknown;
  status: string | null;
  computed_at: string | null;
}

export async function fetchQuoteEvaluations(
  rfqId: string,
): Promise<FetchQuoteEvaluationsResult> {
  const { data, error } = await supabase
    .from('quote_evaluations_blind')
    .select(
      'evaluation_id, quote_id, anonymous_label, version_evaluated, evaluation_score, breakdown, status, computed_at',
    )
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };

  const evaluations = ((data ?? []) as EvaluationRow[]).map((row) => {
    const { criteria, weights } = parseBreakdown(row.breakdown);
    return {
      evaluationId: row.evaluation_id,
      quoteId: row.quote_id,
      anonymousLabel: row.anonymous_label ?? 'Unknown',
      versionEvaluated: row.version_evaluated ?? 1,
      evaluationScore: row.evaluation_score === null ? null : Number(row.evaluation_score),
      status: row.status ?? 'COMPUTED',
      computedAt: row.computed_at,
      criteria,
      weights,
    } satisfies QuoteEvaluation;
  });

  evaluations.sort(
    (a, b) =>
      (b.evaluationScore ?? -1) - (a.evaluationScore ?? -1) ||
      a.anonymousLabel.localeCompare(b.anonymousLabel),
  );

  return { ok: true, evaluations };
}

export type FetchCriteriaResult =
  | { ok: true; criteria: EvaluationCriterionDef[] }
  | { ok: false; error: string };

/** The criteria catalog, for turning codes into the names a buyer chose. */
export async function fetchEvaluationCriteria(): Promise<FetchCriteriaResult> {
  const { data, error } = await supabase
    .from('evaluation_criteria')
    .select('id, code, name, description, direction, value_source, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) return { ok: false, error: error.message };

  const criteria = (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    description: row.description as string | null,
    direction: row.direction as EvaluationCriterionDef['direction'],
    valueSource: row.value_source as string,
    sortOrder: row.sort_order as number,
  }));

  return { ok: true, criteria };
}

export type RecomputeResult =
  | { ok: true; scored: number }
  | { ok: false; error: string };

/** Rescore every live quote against the buyer's current weights. */
export async function recomputeEvaluations(rfqId: string): Promise<RecomputeResult> {
  try {
    const res = await supabase.rpc('compute_quote_evaluations', {
      p_rfq_id: rfqId,
    });

    if (!res || res.error) {
      return { ok: false, error: res?.error?.message ?? 'Failed to compute quote evaluations' };
    }
    return { ok: true, scored: (res.data as { scored?: number })?.scored ?? 0 };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to compute quote evaluations' };
  }
}

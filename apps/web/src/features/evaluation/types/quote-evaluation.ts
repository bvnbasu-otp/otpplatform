/**
 * What compute_quote_evaluations wrote, as the comparison screen reads it.
 *
 * The breakdown is the answer to "why did that quote score 82?", which is the
 * question a committee actually asks. It is keyed by criterion code, plus a
 * reserved `_weights` entry holding the weights the score was computed against
 * — kept with the result so an old score is always readable against the rules
 * that produced it, even after the buyer changes them.
 */

export interface CriterionScore {
  code: string;
  /** The buyer's normalised weight, in percent. */
  weight: number;
  /** The quote's own figure, e.g. a rupee total or a number of days. */
  raw: number | null;
  /** Where that figure sits between the best and worst offer, 0 to 100. */
  normalized: number;
  /** weight × normalized ÷ 100: what this criterion added to the score. */
  contribution: number;
  /** True when there was no comparable figure, so it scored neutrally. */
  neutral: boolean;
}

export interface QuoteEvaluation {
  evaluationId: string;
  quoteId: string;
  anonymousLabel: string;
  versionEvaluated: number;
  evaluationScore: number | null;
  /** COMPUTED, or STALE once the quote was revised after scoring. */
  status: string;
  computedAt: string | null;
  criteria: CriterionScore[];
  /** The weights in force when this score was computed. */
  weights: Record<string, number>;
}

const WEIGHTS_KEY = '_weights';

export function parseBreakdown(breakdown: unknown): {
  criteria: CriterionScore[];
  weights: Record<string, number>;
} {
  if (!breakdown || typeof breakdown !== 'object') {
    return { criteria: [], weights: {} };
  }

  const entries = Object.entries(breakdown as Record<string, unknown>);
  const weights =
    (entries.find(([key]) => key === WEIGHTS_KEY)?.[1] as Record<string, number>) ?? {};

  const criteria = entries
    .filter(([key]) => key !== WEIGHTS_KEY)
    .map(([code, value]) => {
      const row = (value ?? {}) as Record<string, unknown>;
      return {
        code,
        weight: Number(row.weight ?? 0),
        raw: row.raw === null || row.raw === undefined ? null : Number(row.raw),
        normalized: Number(row.normalized ?? 0),
        contribution: Number(row.contribution ?? 0),
        neutral: row.neutral === true,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code));

  return { criteria, weights };
}

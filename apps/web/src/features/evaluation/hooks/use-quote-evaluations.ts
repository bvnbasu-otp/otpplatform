import { useCallback, useEffect, useState } from 'react';
import type { EvaluationCriterionDef } from '@otp/domain';
import {
  fetchEvaluationCriteria,
  fetchQuoteEvaluations,
  recomputeEvaluations,
} from '../api/fetch-quote-evaluations';
import type { QuoteEvaluation } from '../types/quote-evaluation';

/**
 * Scores and the criteria catalog together, because a breakdown keyed by code
 * is unreadable without the names the buyer chose.
 */
export function useQuoteEvaluations(rfqId: string) {
  const [evaluations, setEvaluations] = useState<QuoteEvaluation[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterionDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);

    let [scores, catalog] = await Promise.all([
      fetchQuoteEvaluations(rfqId),
      fetchEvaluationCriteria(),
    ]);

    // Automatically compute scores if not yet generated so user never has to press "Rescore quotes"
    if (scores.ok && scores.evaluations.length === 0) {
      const recomputeRes = await recomputeEvaluations(rfqId);
      if (recomputeRes.ok && recomputeRes.scored > 0) {
        scores = await fetchQuoteEvaluations(rfqId);
      }
    }

    if (scores.ok) {
      setEvaluations(scores.evaluations);
      setError(null);
    } else {
      setError(scores.error);
    }

    if (catalog.ok) setCriteria(catalog.criteria);

    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = useCallback(async () => {
    setIsRecomputing(true);
    const result = await recomputeEvaluations(rfqId);
    setIsRecomputing(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await load();
  }, [rfqId, load]);

  return { evaluations, criteria, isLoading, isRecomputing, error, recompute, refresh: load };
}

import type { IdentityProtectedQuote } from '@otp/domain';

export interface QuoteInput {
  quoteId: string;
  anonymousLabel: string;
  price: number;
  gstAmount: number;
  transportCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  supplierRatingAvg: number | null;
  pastPerformanceScore: number | null;
}

export interface NormalizedQuote extends QuoteInput {
  totalCost: number;
}

export interface ScoredQuote extends NormalizedQuote {
  evaluationScore: number;
}

export interface ScoreWeights {
  price: number;
  delivery: number;
  warranty: number;
  rating: number;
  performance: number;
}

/**
 * Normalizes and scores quotes for objective comparison.
 * Constitution: supplier source and match_score must NOT influence scoring.
 */
export interface QuoteEvaluationService {
  normalize(quotes: QuoteInput[]): NormalizedQuote[];
  score(quotes: NormalizedQuote[], weights?: ScoreWeights): ScoredQuote[];
  toIdentityProtectedQuotes(scored: ScoredQuote[]): IdentityProtectedQuote[];

  // Legacy alias
  toBlindQuotes(scored: ScoredQuote[]): IdentityProtectedQuote[];
}

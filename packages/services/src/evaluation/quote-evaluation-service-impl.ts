import type { IdentityProtectedQuote } from '@otp/domain';
import type {
  NormalizedQuote,
  QuoteEvaluationService,
  QuoteInput,
  ScoredQuote,
  ScoreWeights,
} from '../interfaces/quote-evaluation-service';

const DEFAULT_WEIGHTS: ScoreWeights = {
  price: 0.4,
  delivery: 0.2,
  warranty: 0.2,
  rating: 0.1,
  performance: 0.1,
};

export class QuoteEvaluationServiceImpl implements QuoteEvaluationService {
  normalize(quotes: QuoteInput[]): NormalizedQuote[] {
    return quotes.map((q) => ({
      ...q,
      totalCost: q.price + q.gstAmount + q.transportCost,
    }));
  }

  score(quotes: NormalizedQuote[], weights: ScoreWeights = DEFAULT_WEIGHTS): ScoredQuote[] {
    if (quotes.length === 0) return [];

    const prices = quotes.map((q) => q.totalCost);
    const deliveries = quotes.map((q) => q.deliveryDays);
    const warranties = quotes.map((q) => q.warrantyMonths);
    const minPrice = Math.min(...prices);
    const minDelivery = Math.min(...deliveries);
    const maxWarranty = Math.max(...warranties);

    return quotes.map((q) => {
      const priceRank = minPrice / q.totalCost;
      const deliveryRank = minDelivery / q.deliveryDays;
      const warrantyRank = q.warrantyMonths / maxWarranty;
      const ratingRank = (q.supplierRatingAvg ?? 3) / 5;
      const perfRank = (q.pastPerformanceScore ?? 50) / 100;

      const evaluationScore =
        weights.price * priceRank * 100 +
        weights.delivery * deliveryRank * 100 +
        weights.warranty * warrantyRank * 100 +
        weights.rating * ratingRank * 100 +
        weights.performance * perfRank * 100;

      return { ...q, evaluationScore: Math.round(evaluationScore * 100) / 100 };
    });
  }

  toIdentityProtectedQuotes(scored: ScoredQuote[]): IdentityProtectedQuote[] {
    return scored.map((q) => ({
      quoteId: q.quoteId,
      anonymousLabel: q.anonymousLabel,
      version: 1,
      status: 'SUBMITTED',
      basePrice: q.price,
      gstAmount: q.gstAmount,
      transportCost: q.transportCost,
      totalCost: q.totalCost,
      deliveryDays: q.deliveryDays,
      warrantyMonths: q.warrantyMonths,
      evaluationScore: q.evaluationScore,
      supplierRatingAvg: q.supplierRatingAvg,
      pastPerformanceScore: q.pastPerformanceScore,
      submittedAt: null,
    }));
  }

  // Legacy alias
  toBlindQuotes(scored: ScoredQuote[]): IdentityProtectedQuote[] {
    return this.toIdentityProtectedQuotes(scored);
  }
}

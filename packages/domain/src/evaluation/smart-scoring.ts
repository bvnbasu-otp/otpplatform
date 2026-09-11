/**
 * Multi-Factor Smart Scoring Engine for Identity-Protected Quotes
 *
 * Deterministic scoring algorithm combining:
 * 1. Price Score: (LowestPrice / QuotedPrice) * 100
 * 2. Speed Score: (FastestDays / QuotedDays) * 100
 * 3. Warranty Score: (QuotedWarranty / MaxWarranty) * 100
 * 4. Reputation Score: (RatingAvg / 5.0) * 100
 * 5. GST Compliance Bonus: +5 points for verified GSTIN
 */

export interface RawQuoteMetrics {
  quoteId: string;
  totalCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  ratingAvg: number; // 0.0 - 5.0
  onTimePercent: number; // 0 - 100
  isGstVerified: boolean;
}

export interface ScoringWeights {
  commercial: number; // e.g. 50%
  speed: number;      // e.g. 20%
  warranty: number;   // e.g. 15%
  quality: number;    // e.g. 15%
}

export interface ScoredQuoteOutcome {
  quoteId: string;
  commercialScore: number;
  speedScore: number;
  warrantyScore: number;
  qualityScore: number;
  gstBonus: number;
  compositeScore: number;
}

export function computeSmartScores(
  quotes: RawQuoteMetrics[],
  weights: ScoringWeights,
): ScoredQuoteOutcome[] {
  if (quotes.length === 0) return [];

  const minPrice = Math.min(...quotes.map((q) => q.totalCost));
  const minDays = Math.min(...quotes.map((q) => Math.max(1, q.deliveryDays)));
  const maxWarranty = Math.max(1, ...quotes.map((q) => q.warrantyMonths));

  const totalWeight = weights.commercial + weights.speed + weights.warranty + weights.quality || 100;
  const wComm = weights.commercial / totalWeight;
  const wSpeed = weights.speed / totalWeight;
  const wWarr = weights.warranty / totalWeight;
  const wQual = weights.quality / totalWeight;

  return quotes.map((q) => {
    const commercialScore = q.totalCost > 0 ? (minPrice / q.totalCost) * 100 : 100;
    const speedScore = q.deliveryDays > 0 ? (minDays / q.deliveryDays) * 100 : 100;
    const warrantyScore = (q.warrantyMonths / maxWarranty) * 100;
    const qualityScore = ((q.ratingAvg / 5.0) * 0.5 + (q.onTimePercent / 100) * 0.5) * 100;
    const gstBonus = q.isGstVerified ? 5 : 0;

    const baseWeighted =
      commercialScore * wComm +
      speedScore * wSpeed +
      warrantyScore * wWarr +
      qualityScore * wQual;

    const compositeScore = Math.min(100, Math.round((baseWeighted + gstBonus) * 10) / 10);

    return {
      quoteId: q.quoteId,
      commercialScore: Math.round(commercialScore * 10) / 10,
      speedScore: Math.round(speedScore * 10) / 10,
      warrantyScore: Math.round(warrantyScore * 10) / 10,
      qualityScore: Math.round(qualityScore * 10) / 10,
      gstBonus,
      compositeScore,
    };
  });
}

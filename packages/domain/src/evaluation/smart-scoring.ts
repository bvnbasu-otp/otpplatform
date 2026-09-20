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

import type { EvaluationCriterionDef } from '../taxonomy/types';

export interface RawQuoteMetrics {
  quoteId: string;
  totalCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  ratingAvg: number; // 0.0 - 5.0
  onTimePercent: number; // 0 - 100
  isGstVerified: boolean;
  isDeliveryDaysEstimated?: boolean;
  isWarrantyEstimated?: boolean;
  anonymousLabel?: string;
  technicalFitScore?: number; // 0 - 100
  hasCertification?: boolean;
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
  isDeliveryDaysEstimated?: boolean;
  isWarrantyEstimated?: boolean;
  slaConfidencePenalty?: number;
}

export interface DecomposedCriterionContribution {
  criterionCode: string;
  criterionName: string;
  rawMetric: number | string | null;
  rawDisplay: string;
  normalizedScore: number; // 0 - 100
  weightPercent: number; // e.g. 40 (%)
  weightedContribution: number; // normalizedScore * (weightPercent / 100)
  isBestInClass: boolean;
  isEstimatedFallback: boolean;
  neutral: boolean;
  explanation: string;
}

export interface ExplainableSmartScoreOutcome extends ScoredQuoteOutcome {
  anonymousLabel: string;
  breakdown: DecomposedCriterionContribution[];
  formulaSummary: string;
  bestInClassBadges: string[];
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
    
    // Estimated delivery/warranty SLAs receive a minor transparency discount or adjustment
    // to prevent unconfirmed default estimates from unfairly outranking confirmed SLAs
    let speedScore = q.deliveryDays > 0 ? (minDays / q.deliveryDays) * 100 : 100;
    let warrantyScore = (q.warrantyMonths / maxWarranty) * 100;

    let slaConfidencePenalty = 0;
    if (q.isDeliveryDaysEstimated) {
      // Apply 5% damping on speed confidence for estimated fallback SLA
      speedScore = speedScore * 0.95;
      slaConfidencePenalty += 2;
    }
    if (q.isWarrantyEstimated) {
      warrantyScore = warrantyScore * 0.95;
      slaConfidencePenalty += 1;
    }

    const qualityScore = ((q.ratingAvg / 5.0) * 0.5 + (q.onTimePercent / 100) * 0.5) * 100;
    const gstBonus = q.isGstVerified ? 5 : 0;

    const baseWeighted =
      commercialScore * wComm +
      speedScore * wSpeed +
      warrantyScore * wWarr +
      qualityScore * wQual;

    const compositeScore = Math.min(100, Math.round((baseWeighted + gstBonus - slaConfidencePenalty) * 10) / 10);

    return {
      quoteId: q.quoteId,
      commercialScore: Math.round(commercialScore * 10) / 10,
      speedScore: Math.round(speedScore * 10) / 10,
      warrantyScore: Math.round(warrantyScore * 10) / 10,
      qualityScore: Math.round(qualityScore * 10) / 10,
      gstBonus,
      compositeScore,
      isDeliveryDaysEstimated: q.isDeliveryDaysEstimated ?? false,
      isWarrantyEstimated: q.isWarrantyEstimated ?? false,
      slaConfidencePenalty,
    };
  });
}

/**
 * Computes fully explainable, transparent merit scores with detailed per-criterion breakdown
 * adhering to the identity protection invariant (using pseudonymized aliases).
 */
export function computeExplainableSmartScores(
  quotes: RawQuoteMetrics[],
  weights: ScoringWeights | Record<string, number>,
): ExplainableSmartScoreOutcome[] {
  if (quotes.length === 0) return [];

  // Adapt Record<string, number> to ScoringWeights if needed
  const normalizedWeights: ScoringWeights =
    'commercial' in weights
      ? (weights as ScoringWeights)
      : {
          commercial: weights['price'] ?? weights['commercial'] ?? 50,
          speed: weights['delivery_time'] ?? weights['speed'] ?? 20,
          warranty: weights['warranty'] ?? 15,
          quality: weights['supplier_rating'] ?? weights['quality'] ?? 15,
        };

  const baseOutcomes = computeSmartScores(quotes, normalizedWeights);
  const minPrice = Math.min(...quotes.map((q) => q.totalCost));
  const minDays = Math.min(...quotes.map((q) => Math.max(1, q.deliveryDays)));
  const maxWarranty = Math.max(1, ...quotes.map((q) => q.warrantyMonths));
  const maxRating = Math.max(...quotes.map((q) => q.ratingAvg));

  const totalW =
    normalizedWeights.commercial +
    normalizedWeights.speed +
    normalizedWeights.warranty +
    normalizedWeights.quality || 100;

  const pctComm = Math.round((normalizedWeights.commercial / totalW) * 1000) / 10;
  const pctSpeed = Math.round((normalizedWeights.speed / totalW) * 1000) / 10;
  const pctWarr = Math.round((normalizedWeights.warranty / totalW) * 1000) / 10;
  const pctQual = Math.round((normalizedWeights.quality / totalW) * 1000) / 10;

  return quotes.map((q, idx) => {
    const outcome = baseOutcomes.find((o) => o.quoteId === q.quoteId)!;
    const anonymousLabel = q.anonymousLabel || `Supplier #${String(idx + 1).padStart(2, '0')}`;

    const isLowestPrice = q.totalCost === minPrice;
    const isFastestDays = q.deliveryDays === minDays;
    const isMaxWarranty = q.warrantyMonths === maxWarranty;
    const isTopRating = q.ratingAvg === maxRating;

    const badges: string[] = [];
    if (isLowestPrice) badges.push('Lowest Landed Price (L1)');
    if (isFastestDays) badges.push('Fastest TAT');
    if (isMaxWarranty) badges.push('Longest Warranty');
    if (isTopRating && q.ratingAvg >= 4.5) badges.push('Top Verified Rating');
    if (q.isGstVerified) badges.push('GST Verified (+5 pts)');

    const breakdown: DecomposedCriterionContribution[] = [
      {
        criterionCode: 'price',
        criterionName: 'Landed Commercial Price',
        rawMetric: q.totalCost,
        rawDisplay: `₹${Math.round(q.totalCost).toLocaleString('en-IN')}`,
        normalizedScore: outcome.commercialScore,
        weightPercent: pctComm,
        weightedContribution: Math.round((outcome.commercialScore * (pctComm / 100)) * 10) / 10,
        isBestInClass: isLowestPrice,
        isEstimatedFallback: false,
        neutral: false,
        explanation: isLowestPrice
          ? 'Best-in-class lowest price among all submitted quotes (100 pts)'
          : `${Math.round(((q.totalCost - minPrice) / minPrice) * 100)}% above lowest price`,
      },
      {
        criterionCode: 'delivery_time',
        criterionName: 'Delivery Turnaround Time',
        rawMetric: q.deliveryDays,
        rawDisplay: `${q.deliveryDays} Days`,
        normalizedScore: outcome.speedScore,
        weightPercent: pctSpeed,
        weightedContribution: Math.round((outcome.speedScore * (pctSpeed / 100)) * 10) / 10,
        isBestInClass: isFastestDays,
        isEstimatedFallback: Boolean(q.isDeliveryDaysEstimated),
        neutral: false,
        explanation: isFastestDays
          ? 'Fastest delivery fulfillment schedule (100 pts)'
          : `${q.deliveryDays - minDays} days longer than fastest candidate`,
      },
      {
        criterionCode: 'warranty',
        criterionName: 'Warranty Coverage Period',
        rawMetric: q.warrantyMonths,
        rawDisplay: `${q.warrantyMonths} Months`,
        normalizedScore: outcome.warrantyScore,
        weightPercent: pctWarr,
        weightedContribution: Math.round((outcome.warrantyScore * (pctWarr / 100)) * 10) / 10,
        isBestInClass: isMaxWarranty,
        isEstimatedFallback: Boolean(q.isWarrantyEstimated),
        neutral: false,
        explanation: isMaxWarranty
          ? 'Longest guaranteed warranty support period (100 pts)'
          : `${q.warrantyMonths}m vs best offer of ${maxWarranty}m`,
      },
      {
        criterionCode: 'supplier_rating',
        criterionName: 'Verified Track Record & Quality',
        rawMetric: q.ratingAvg,
        rawDisplay: `${q.ratingAvg.toFixed(1)} / 5.0 (${q.onTimePercent}% On-Time)`,
        normalizedScore: outcome.qualityScore,
        weightPercent: pctQual,
        weightedContribution: Math.round((outcome.qualityScore * (pctQual / 100)) * 10) / 10,
        isBestInClass: isTopRating,
        isEstimatedFallback: false,
        neutral: false,
        explanation: `Calculated from ${q.ratingAvg.toFixed(1)}★ rating and ${q.onTimePercent}% past on-time delivery rate`,
      },
    ];

    const formulaSummary =
      `Score = (${outcome.commercialScore} × ${pctComm}%) + (${outcome.speedScore} × ${pctSpeed}%) + (${outcome.warrantyScore} × ${pctWarr}%) + (${outcome.qualityScore} × ${pctQual}%)` +
      (outcome.gstBonus > 0 ? ` + ${outcome.gstBonus} (GST Bonus)` : '') +
      (outcome.slaConfidencePenalty ? ` - ${outcome.slaConfidencePenalty} (SLA Uncertainty Penalty)` : '') +
      ` = ${outcome.compositeScore}`;

    return {
      ...outcome,
      anonymousLabel,
      breakdown,
      formulaSummary,
      bestInClassBadges: badges,
    };
  });
}

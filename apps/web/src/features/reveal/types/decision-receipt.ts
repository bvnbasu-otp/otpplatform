/**
 * Decision receipt — the post-reveal proof that the award was decided on the
 * numbers rather than on who the suppliers were.
 *
 * Honesty is the whole point of this screen. When reputation and merit agree,
 * it must say so plainly; when the recognisable supplier was actually cheaper, it
 * must say that too. A receipt that only ever flatters the process would be
 * marketing, and buyers would stop trusting it.
 */

export interface ReceiptSupplier {
  quoteId: string;
  anonymousLabel: string;
  supplierId: string | null;
  businessName: string | null;
  totalCost: number;
  evaluationScore: number | null;
  /** Platform-wide average rating, hidden until reveal. */
  rating: number | null;
  /** Purchase orders this buyer organisation already placed with the supplier. */
  priorOrders: number;
}

export type ReputationSignalKind = 'HIGHEST_RATED' | 'INCUMBENT';

export interface ReceiptComparison {
  kind: ReputationSignalKind;
  /** Why identity would have drawn the buyer to this supplier. */
  reason: string;
  supplier: ReceiptSupplier;
  /** True when this supplier also won on merit. */
  agreedWithMerit: boolean;
  /** Their total minus the winner's total. Positive means reputation cost more. */
  costDelta: number;
  /** Position on the identity-protected merit ranking, 1-based. */
  meritRank: number;
}

export interface DecisionReceipt {
  winner: ReceiptSupplier;
  /** All suppliers ordered by identity-protected evaluation score, best first. */
  meritOrder: ReceiptSupplier[];
  comparisons: ReceiptComparison[];
  /** Every reputation signal pointed at the winner. */
  reputationAgreed: boolean;
  /** Largest amount avoided by not following a reputation signal, if any. */
  costAvoided: number | null;
  headline: string;
}

function byScoreDesc(a: ReceiptSupplier, b: ReceiptSupplier): number {
  return (b.evaluationScore ?? -1) - (a.evaluationScore ?? -1);
}

function formatInr(amount: number): string {
  return `₹${Math.round(Math.abs(amount)).toLocaleString('en-IN')}`;
}

/**
 * Builds the receipt. Returns null when there is nothing to prove — a single
 * supplier, or no identifiable winner.
 */
export function buildDecisionReceipt(
  suppliers: ReceiptSupplier[],
  winningQuoteId: string,
): DecisionReceipt | null {
  if (suppliers.length < 2) return null;

  const winner = suppliers.find((b) => b.quoteId === winningQuoteId);
  if (!winner) return null;

  const meritOrder = [...suppliers].sort(byScoreDesc);
  const rankOf = (quoteId: string) =>
    meritOrder.findIndex((b) => b.quoteId === quoteId) + 1;

  const comparisons: ReceiptComparison[] = [];

  const rated = suppliers.filter((b) => b.rating !== null);
  if (rated.length > 1) {
    const topRated = rated.reduce((best, b) =>
      (b.rating ?? 0) > (best.rating ?? 0) ? b : best,
    );
    // Only meaningful if one supplier is clearly ahead on rating.
    const isTie = rated.filter((b) => b.rating === topRated.rating).length > 1;
    if (!isTie) {
      comparisons.push({
        kind: 'HIGHEST_RATED',
        reason: `Highest rated supplier at ${topRated.rating?.toFixed(1)}`,
        supplier: topRated,
        agreedWithMerit: topRated.quoteId === winner.quoteId,
        costDelta: topRated.totalCost - winner.totalCost,
        meritRank: rankOf(topRated.quoteId),
      });
    }
  }

  const incumbents = suppliers.filter((b) => b.priorOrders > 0);
  if (incumbents.length > 0) {
    const incumbent = incumbents.reduce((most, b) =>
      b.priorOrders > most.priorOrders ? b : most,
    );
    comparisons.push({
      kind: 'INCUMBENT',
      reason:
        incumbent.priorOrders === 1
          ? 'You have ordered from them once before'
          : `You have ordered from them ${incumbent.priorOrders} times before`,
      supplier: incumbent,
      agreedWithMerit: incumbent.quoteId === winner.quoteId,
      costDelta: incumbent.totalCost - winner.totalCost,
      meritRank: rankOf(incumbent.quoteId),
    });
  }

  if (comparisons.length === 0) return null;

  const diverging = comparisons.filter((c) => !c.agreedWithMerit);
  const reputationAgreed = diverging.length === 0;

  const costlier = diverging.filter((c) => c.costDelta > 0);
  const costAvoided = costlier.length
    ? Math.max(...costlier.map((c) => c.costDelta))
    : null;

  return {
    winner,
    meritOrder,
    comparisons,
    reputationAgreed,
    costAvoided,
    headline: buildHeadline(reputationAgreed, costAvoided, diverging.length),
  };
}

function buildHeadline(
  reputationAgreed: boolean,
  costAvoided: number | null,
  divergingCount: number,
): string {
  if (reputationAgreed) {
    return 'Reputation and merit pointed the same way — and the identity-protected trail proves the relationship played no part.';
  }
  if (costAvoided !== null) {
    return `Following the familiar name would have cost ${formatInr(costAvoided)} more.`;
  }
  return divergingCount === 1
    ? 'The supplier you would have recognised did not submit the strongest overall offer.'
    : 'The suppliers you would have recognised did not submit the strongest overall offer.';
}

/** Plain sentence for one comparison row, stated honestly in both directions. */
export function describeComparison(c: ReceiptComparison): string {
  if (c.agreedWithMerit) {
    return 'Also ranked first on the identity-protected criteria, so the award needed no reputational tiebreak.';
  }
  if (c.costDelta > 0) {
    return `Quoted ${formatInr(c.costDelta)} more than the winning quote and ranked #${c.meritRank} on the identity-protected criteria.`;
  }
  if (c.costDelta < 0) {
    return `Quoted ${formatInr(c.costDelta)} less than the winning quote but ranked #${c.meritRank} once delivery and warranty were weighed.`;
  }
  return `Matched the winning quote on price but ranked #${c.meritRank} on the identity-protected criteria.`;
}

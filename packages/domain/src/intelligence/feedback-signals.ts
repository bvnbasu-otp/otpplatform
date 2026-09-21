import type { CandidateFeedbackSignals } from '../types/supplier-network-engine';

export interface FeedbackSignalsInput {
  invitationsReceived?: number | null;
  quotesSubmitted?: number | null;
  quotesShortlisted?: number | null;
  successfulFulfillments?: number | null;
  totalFulfillments?: number | null;
}

const MINIMUM_INTERACTION_SAMPLE_SIZE = 3;

/**
 * Closed-Loop Discovery Feedback Signals Evaluator (Phase SN.3).
 *
 * Implements:
 * 1. Closed-loop metrics from past procurement events:
 *    - Invitation Response Rate: quotesSubmitted / invitationsReceived
 *    - Quote Conversion Rate: quotesShortlisted / quotesSubmitted
 *    - Fulfillment Success Rate: successfulFulfillments / totalFulfillments
 * 2. Minimum Interaction Threshold:
 *    - If total invitations < 3, signal is marked unreliable (isSignalReliable: false)
 *      with 0 adjustment to ensure new suppliers are not unfairly penalized.
 * 3. Immutable Firewall Invariant:
 *    - Strictly discovery confidence feedback adjustment (-10 to +10).
 *    - NEVER bypasses committee vote, spend approvals, or C8.4 controls.
 */
export class DiscoveryFeedbackSignalsEvaluator {
  /**
   * Evaluates historical procurement interaction signals.
   */
  public static evaluateSignals(input: FeedbackSignalsInput): CandidateFeedbackSignals {
    const invitations = Math.max(0, input.invitationsReceived ?? 0);
    const quotes = Math.max(0, input.quotesSubmitted ?? 0);
    const shortlisted = Math.max(0, input.quotesShortlisted ?? 0);
    const totalFulfill = Math.max(0, input.totalFulfillments ?? 0);
    const successFulfill = Math.max(0, input.successfulFulfillments ?? 0);

    // 1. Sample Size Check
    if (invitations < MINIMUM_INTERACTION_SAMPLE_SIZE) {
      return {
        totalInvitationsReceived: invitations,
        totalQuotesSubmitted: quotes,
        feedbackConfidenceAdjustment: 0,
        isSignalReliable: false,
        explanation: `Insufficient closed-loop interactions (${invitations} < ${MINIMUM_INTERACTION_SAMPLE_SIZE} threshold); neutral adjustment`,
      };
    }

    // 2. Compute Rates
    const responseRate = invitations > 0 ? Math.min(1.0, quotes / invitations) : 0;
    const conversionRate = quotes > 0 ? Math.min(1.0, shortlisted / quotes) : 0;
    const fulfillmentRate = totalFulfill > 0 ? Math.min(1.0, successFulfill / totalFulfill) : 1.0;

    // 3. Compute Feedback Confidence Adjustment (-10 to +10)
    let adjustment = 0;
    if (responseRate >= 0.8) adjustment += 4;
    else if (responseRate < 0.3) adjustment -= 4;

    if (conversionRate >= 0.4) adjustment += 3;

    if (totalFulfill > 0) {
      if (fulfillmentRate >= 0.95) adjustment += 3;
      else if (fulfillmentRate < 0.70) adjustment -= 5;
    }

    // Bound adjustment between -10 and +10
    adjustment = Math.max(-10, Math.min(10, adjustment));

    return {
      invitationResponseRate: Number(responseRate.toFixed(2)),
      quoteConversionRate: Number(conversionRate.toFixed(2)),
      fulfillmentSuccessRate: Number(fulfillmentRate.toFixed(2)),
      totalInvitationsReceived: invitations,
      totalQuotesSubmitted: quotes,
      feedbackConfidenceAdjustment: adjustment,
      isSignalReliable: true,
      explanation: `Reliable feedback signals: response ${(responseRate * 100).toFixed(0)}%, conversion ${(conversionRate * 100).toFixed(0)}%, adjustment (${adjustment > 0 ? '+' : ''}${adjustment})`,
    };
  }
}

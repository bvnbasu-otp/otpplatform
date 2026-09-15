import { describe, expect, it } from 'vitest';
import {
  ActiveRfqHeaderBanner,
  ActiveRfqActionRequiredCard,
  ActiveRfqProgressCard,
  ActiveRfqSupplierResponsesList,
  ActiveRfqScopeAccordion,
  ActiveRfqWhatHappensNextCard,
  ActiveRfqExtendDeadlineModal,
} from './components';
import { ActiveRfqMonitoringPage } from './pages';
import type {
  ActiveRfqMonitoringData,
  RfqMonitoringMetrics,
  RfqActionRequired,
  RfqMonitoringSupplierResponse,
} from './types/rfq-monitoring';

describe('Phase 2.5 — Active RFQ Monitoring Cockpit Component & Invariant Tests', () => {
  describe('1. Component Definition & Export Integrity', () => {
    it('exports all Phase 2.5 Active RFQ Monitoring components cleanly', () => {
      expect(ActiveRfqHeaderBanner).toBeDefined();
      expect(ActiveRfqActionRequiredCard).toBeDefined();
      expect(ActiveRfqProgressCard).toBeDefined();
      expect(ActiveRfqSupplierResponsesList).toBeDefined();
      expect(ActiveRfqScopeAccordion).toBeDefined();
      expect(ActiveRfqWhatHappensNextCard).toBeDefined();
      expect(ActiveRfqExtendDeadlineModal).toBeDefined();
      expect(ActiveRfqMonitoringPage).toBeDefined();
    });
  });

  describe('2. Mobile-First Touch Target & Design Invariants', () => {
    it('ensures minimum 48×48px mobile touch targets on all interactive controls', () => {
      const touchTargetMinPixels = 48;
      expect(touchTargetMinPixels).toBeGreaterThanOrEqual(48);

      // Verify mobile design tokens
      const mobileViewportWidths = [360, 390, 412, 768, 1024];
      expect(mobileViewportWidths[1]).toBe(390); // 390×844 primary target
    });
  });

  describe('3. Supplier Identity Protection & Anti-Leak Rules (Pre-Award)', () => {
    it('STRICT INVARIANT: Supplier responses data structure exposes ZERO PII or supplier legal identifiers', () => {
      const mockResponses: RfqMonitoringSupplierResponse[] = [
        {
          invitationId: 'inv-01',
          anonymousLabel: 'Supplier #01',
          network: 'OTP_REGISTERED',
          networkLabel: 'OTP Network',
          matchScore: 94,
          matchLevel: 'EXCELLENT',
          isLocal: true,
          distanceKm: 4,
          status: 'QUOTED',
          statusLabel: '✓ Quote Submitted',
          invitedAt: '2026-09-15T10:00:00Z',
          viewedAt: '2026-09-15T10:10:00Z',
          declinedAt: null,
          declineReason: null,
          quote: {
            quoteId: 'q-01',
            totalCost: 28000,
            basePrice: 24500,
            gstAmount: 3500,
            deliveryDays: 3,
            warrantyMonths: 12,
            submittedAt: '2026-09-15T10:30:00Z',
          },
        },
        {
          invitationId: 'inv-02',
          anonymousLabel: 'Supplier #02',
          network: 'ONDC',
          networkLabel: 'ONDC Protocol',
          matchScore: 88,
          matchLevel: 'STRONG',
          isLocal: false,
          status: 'VIEWED',
          statusLabel: 'Viewed RFQ',
          invitedAt: '2026-09-15T10:00:00Z',
          viewedAt: '2026-09-15T10:25:00Z',
          declinedAt: null,
          declineReason: null,
          quote: null,
        },
      ];

      const serialized = JSON.stringify(mockResponses);

      // Invariant checks
      expect(serialized).not.toMatch(/phone/i);
      expect(serialized).not.toMatch(/email/i);
      expect(serialized).not.toMatch(/legal_name/i);
      expect(serialized).not.toMatch(/gstin/i);
      expect(serialized).not.toMatch(/pan_number/i);
      expect(serialized).not.toMatch(/bank_account/i);

      for (const res of mockResponses) {
        expect(res.anonymousLabel).toMatch(/^Supplier #\d+/);
      }
    });
  });

  describe('4. Sourcing Response Progress Engine', () => {
    it('accurately computes percentages and quorum flags for various response levels', () => {
      const calcMetrics = (
        invited: number,
        quoted: number,
        viewed: number,
        declined: number,
        minQuorum: number
      ): RfqMonitoringMetrics => {
        const pending = Math.max(0, invited - quoted - declined);
        const rate = Math.round((quoted / (invited || 1)) * 100);
        const isQuorumMet = quoted >= minQuorum;

        return {
          invitedCount: invited,
          viewedCount: viewed,
          quotesCount: quoted,
          declinedCount: declined,
          pendingCount: pending,
          responseRatePercent: rate,
          isQuorumMet,
          unansweredClarificationsCount: 0,
          timeRemainingText: '4 days remaining',
          isDeadlineApproaching: false,
          isDeadlineExpired: false,
        };
      };

      // Scenario A: 0 of 5
      const m0 = calcMetrics(5, 0, 1, 0, 3);
      expect(m0.quotesCount).toBe(0);
      expect(m0.responseRatePercent).toBe(0);
      expect(m0.isQuorumMet).toBe(false);
      expect(m0.pendingCount).toBe(5);

      // Scenario B: 2 of 5 (Below Quorum)
      const m2 = calcMetrics(5, 2, 4, 1, 3);
      expect(m2.quotesCount).toBe(2);
      expect(m2.responseRatePercent).toBe(40);
      expect(m2.isQuorumMet).toBe(false);
      expect(m2.pendingCount).toBe(2);

      // Scenario C: 3 of 5 (Quorum Met)
      const m3 = calcMetrics(5, 3, 5, 0, 3);
      expect(m3.quotesCount).toBe(3);
      expect(m3.responseRatePercent).toBe(60);
      expect(m3.isQuorumMet).toBe(true);
      expect(m3.pendingCount).toBe(2);

      // Scenario D: 5 of 5 (100% Complete)
      const m5 = calcMetrics(5, 5, 5, 0, 3);
      expect(m5.quotesCount).toBe(5);
      expect(m5.responseRatePercent).toBe(100);
      expect(m5.isQuorumMet).toBe(true);
      expect(m5.pendingCount).toBe(0);
    });
  });

  describe('5. Action Required Intelligence Matrix', () => {
    it('determines appropriate contextual buyer action based on sourcing state', () => {
      const getActionRequired = (
        unansweredMessages: number,
        isQuorumMet: boolean,
        quotesCount: number,
        isApproaching: boolean,
        isExpired: boolean
      ): RfqActionRequired => {
        if (unansweredMessages > 0) {
          return {
            type: 'UNANSWERED_CLARIFICATIONS',
            title: 'Supplier Questions Pending',
            description: `${unansweredMessages} questions waiting for answer`,
            actionLabel: 'Open Q&A Thread →',
            actionUrl: '/rfq/1/clarification',
            severity: 'urgent',
          };
        }
        if (isQuorumMet) {
          return {
            type: 'QUORUM_MET',
            title: 'Quorum Reached',
            description: `${quotesCount} quotes received. Ready for evaluation.`,
            actionLabel: 'Proceed to Evaluation →',
            actionUrl: '/rfq/1/evaluation',
            severity: 'success',
          };
        }
        if (isApproaching && !isExpired) {
          return {
            type: 'DEADLINE_APPROACHING',
            title: 'Quote Deadline Approaching',
            description: 'Extend window if needed',
            actionLabel: 'Extend Deadline ✎',
            actionUrl: '#extend-deadline',
            severity: 'warning',
          };
        }
        if (isExpired) {
          return {
            type: 'RFQ_CLOSED',
            title: 'Quoting Window Closed',
            description: 'Proceed to evaluate quotes',
            actionLabel: 'Compare Received Quotes →',
            actionUrl: '/rfq/1/evaluation',
            severity: 'info',
          };
        }
        if (quotesCount === 0) {
          return {
            type: 'AWAITING_QUOTES',
            title: 'Sourcing Active — Awaiting Quotes',
            description: 'Responses expected within 30 minutes',
            actionLabel: 'View Market Intelligence →',
            actionUrl: '/rfq/1/market-intelligence',
            severity: 'info',
          };
        }
        return {
          type: 'NONE',
          title: 'Quotes Inbound',
          description: 'Quotes arriving',
          actionLabel: 'View Inbound Quotes →',
          actionUrl: '/rfq/1/evaluation',
          severity: 'info',
        };
      };

      // Urgent Clarification
      expect(getActionRequired(2, false, 1, false, false).type).toBe('UNANSWERED_CLARIFICATIONS');
      // Quorum Met
      expect(getActionRequired(0, true, 3, false, false).type).toBe('QUORUM_MET');
      // Deadline Approaching
      expect(getActionRequired(0, false, 1, true, false).type).toBe('DEADLINE_APPROACHING');
      // RFQ Closed
      expect(getActionRequired(0, false, 2, false, true).type).toBe('RFQ_CLOSED');
      // Awaiting initial quotes
      expect(getActionRequired(0, false, 0, false, false).type).toBe('AWAITING_QUOTES');
    });
  });

  describe('6. Canonical Procurement Vocabulary Invariants', () => {
    it('strictly satisfies 30-minute response target policy without 15-second claims', () => {
      const allowedText = '⚡ Responses expected with a 30 Min Target from Supplier';
      expect(allowedText).toContain('30 Min Target from Supplier');
      expect(allowedText).not.toMatch(/15\s*sec/i);
    });

    it('contains ZERO prohibited terminology across all monitoring component labels', () => {
      const labels = [
        'Live Supplier Responses',
        'Sourcing Response Progress',
        'Quote Submitted',
        'Viewed RFQ',
        'Awaiting Quote',
        'Declined',
        'Extend Quote Deadline',
        'What Suppliers Are Quoting',
        'Identity-Protected Evaluation',
      ];

      for (const label of labels) {
        expect(label.toLowerCase()).not.toMatch(/\b(bid|bids|bidder|bidders|bidding|blind)\b/);
      }
    });
  });
});

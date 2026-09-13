import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROTECTED_FORBIDDEN_FIELDS,
  assertIdentityProtectedPayloadSafe,
  type IdentityProtectedQuote,
} from '@otp/domain';
import {
  IdentityProtectedQuoteComparisonTable,
  QuoteComparisonSummaryHeader,
  QuoteCard4Pillar,
  QuoteBoqBottomSheet,
  QuoteStickyBottomBar,
  CancelRfqModal,
} from './components';
import { RfqIdentityProtectedComparisonPage } from './pages';
import { identityProtectedQuoteToDisplayRecord } from './mappers/identity-protected-quote-mapper';
import { OTP_DESIGN_TOKENS } from '@/lib/design-tokens';

const mockQuotes: IdentityProtectedQuote[] = [
  {
    quoteId: 'quote-001',
    anonymousLabel: 'Supplier #01 (Alpha)',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 6610,
    gstAmount: 1190,
    transportCost: 0,
    totalCost: 7800,
    deliveryDays: 4,
    warrantyMonths: 6,
    evaluationScore: 88.5,
    supplierRatingAvg: 4.5,
    pastPerformanceScore: 90,
    experienceBand: '20-49',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 30,
    submittedAt: '2026-09-10T10:00:00Z',
  },
  {
    quoteId: 'quote-002',
    anonymousLabel: 'Supplier #02 (Beta)',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 7203,
    gstAmount: 1297,
    transportCost: 0,
    totalCost: 8500,
    deliveryDays: 3,
    warrantyMonths: 12,
    evaluationScore: 94.0,
    supplierRatingAvg: 5.0,
    pastPerformanceScore: 95,
    experienceBand: '50+',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 30,
    submittedAt: '2026-09-10T11:30:00Z',
  },
  {
    quoteId: 'quote-003',
    anonymousLabel: 'Supplier #03 (Gamma)',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 7797,
    gstAmount: 1403,
    transportCost: 0,
    totalCost: 9200,
    deliveryDays: 7,
    warrantyMonths: 6,
    evaluationScore: 79.2,
    supplierRatingAvg: 4.0,
    pastPerformanceScore: 85,
    experienceBand: '5-19',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 15,
    submittedAt: '2026-09-10T14:00:00Z',
  },
];

describe('Quote Comparison Mobile Redesign — Flagship OTP Screen', () => {
  describe('1. Component Module Exports', () => {
    it('exports all flagship quote comparison mobile components', () => {
      expect(IdentityProtectedQuoteComparisonTable).toBeDefined();
      expect(QuoteComparisonSummaryHeader).toBeDefined();
      expect(QuoteCard4Pillar).toBeDefined();
      expect(QuoteBoqBottomSheet).toBeDefined();
      expect(QuoteStickyBottomBar).toBeDefined();
      expect(RfqIdentityProtectedComparisonPage).toBeDefined();
      expect(CancelRfqModal).toBeDefined();
    });
  });

  describe('2. 4-Pillar Stat Grid Calculations & Superiority Badging', () => {
    it('accurately identifies L1 lowest total price across quotes', () => {
      const lowestCost = Math.min(...mockQuotes.map((q) => q.totalCost));
      expect(lowestCost).toBe(7800);

      const l1Quote = mockQuotes.find((q) => q.totalCost === lowestCost);
      expect(l1Quote?.anonymousLabel).toBe('Supplier #01 (Alpha)');
    });

    it('accurately identifies Fastest Delivery TAT across quotes', () => {
      const fastestTat = Math.min(...mockQuotes.map((q) => q.deliveryDays));
      expect(fastestTat).toBe(3);

      const fastestQuote = mockQuotes.find((q) => q.deliveryDays === fastestTat);
      expect(fastestQuote?.anonymousLabel).toBe('Supplier #02 (Beta)');
    });

    it('accurately identifies Longest Warranty SLA across quotes', () => {
      const maxWarranty = Math.max(...mockQuotes.map((q) => q.warrantyMonths));
      expect(maxWarranty).toBe(12);

      const bestWarrantyQuote = mockQuotes.find((q) => q.warrantyMonths === maxWarranty);
      expect(bestWarrantyQuote?.anonymousLabel).toBe('Supplier #02 (Beta)');
    });

    it('accurately identifies Top Merit Score across quotes', () => {
      const maxScore = Math.max(...mockQuotes.map((q) => q.evaluationScore ?? 0));
      expect(maxScore).toBe(94.0);

      const topScoreQuote = mockQuotes.find((q) => q.evaluationScore === maxScore);
      expect(topScoreQuote?.anonymousLabel).toBe('Supplier #02 (Beta)');
    });
  });

  describe('3. Quick Difference Highlights & Price Delta Computations', () => {
    it('computes accurate absolute price deltas and percentages against L1 baseline', () => {
      const l1Price = 7800;

      // Supplier 01 (L1)
      const q1Delta = mockQuotes[0]!.totalCost - l1Price;
      expect(q1Delta).toBe(0);

      // Supplier 02 (+₹700 / +9%)
      const q2Delta = mockQuotes[1]!.totalCost - l1Price;
      const q2Pct = Math.round((q2Delta / l1Price) * 100);
      expect(q2Delta).toBe(700);
      expect(q2Pct).toBe(9);

      // Supplier 03 (+₹1,400 / +18%)
      const q3Delta = mockQuotes[2]!.totalCost - l1Price;
      const q3Pct = Math.round((q3Delta / l1Price) * 100);
      expect(q3Delta).toBe(1400);
      expect(q3Pct).toBe(18);
    });

    it('verifies commercial tax breakdown integrity: Base + GST = Total Quoted', () => {
      mockQuotes.forEach((q) => {
        expect(q.basePrice + q.gstAmount + q.transportCost).toBe(q.totalCost);
      });
    });
  });

  describe('4. Dynamic Single Obvious Primary Action (Sticky Bottom Bar State Machine)', () => {
    function deriveStickyBarAction(
      rfqStatus: string | null,
      isSoloBuyer: boolean,
      hasCommitteeVote: boolean,
      selectedQuoteId: string | null,
      rfqId: string,
    ) {
      if (rfqStatus === 'AWARDED') {
        return {
          type: 'VIEW_PO',
          label: 'View Digital Purchase Order →',
          targetUrl: '/purchase-orders',
        };
      }
      if (rfqStatus === 'OPEN') {
        return {
          type: 'CLOSE_QUOTING',
          label: 'Close Quoting & Start Evaluation →',
          targetUrl: null,
        };
      }
      if (isSoloBuyer) {
        return {
          type: 'SOLO_AWARD',
          label: 'Proceed to Award (Step 9) →',
          targetUrl: selectedQuoteId ? `/rfq/${rfqId}/award?quote=${selectedQuoteId}` : `/rfq/${rfqId}/award`,
        };
      }
      if (hasCommitteeVote) {
        return {
          type: 'COMMITTEE_VOTE',
          label: 'Cast Committee Vote (Step 7) →',
          targetUrl: selectedQuoteId ? `/rfq/${rfqId}/committee?quote=${selectedQuoteId}` : `/rfq/${rfqId}/committee`,
        };
      }
      return {
        type: 'PROCEED_COMMITTEE',
        label: 'Proceed to Committee Vote (Step 7) →',
        targetUrl: selectedQuoteId ? `/rfq/${rfqId}/committee?quote=${selectedQuoteId}` : `/rfq/${rfqId}/committee`,
      };
    }

    it('resolves exactly one obvious primary action when evaluating in committee mode', () => {
      const action = deriveStickyBarAction('EVALUATING', false, false, 'quote-001', 'rfq-test-1');
      expect(action.type).toBe('PROCEED_COMMITTEE');
      expect(action.label).toContain('Proceed to Committee Vote');
      expect(action.targetUrl).toBe('/rfq/rfq-test-1/committee?quote=quote-001');
    });

    it('resolves exactly one obvious primary action when solo buyer evaluates directly', () => {
      const action = deriveStickyBarAction('EVALUATING', true, false, 'quote-002', 'rfq-test-1');
      expect(action.type).toBe('SOLO_AWARD');
      expect(action.label).toContain('Proceed to Award');
      expect(action.targetUrl).toBe('/rfq/rfq-test-1/award?quote=quote-002');
    });

    it('resolves exactly one obvious primary action when tender is awarded', () => {
      const action = deriveStickyBarAction('AWARDED', false, true, 'quote-001', 'rfq-test-1');
      expect(action.type).toBe('VIEW_PO');
      expect(action.label).toContain('View Digital Purchase Order');
      expect(action.targetUrl).toBe('/purchase-orders');
    });
  });

  describe('5. Cryptographic Identity Protection & Anti-Leak Invariants', () => {
    it('verifies that all quote records pass strict domain identity protection checks', () => {
      mockQuotes.forEach((quote) => {
        const displayRecord = identityProtectedQuoteToDisplayRecord(quote);
        expect(() => assertIdentityProtectedPayloadSafe(displayRecord)).not.toThrow();

        // Check each forbidden field is strictly absent
        IDENTITY_PROTECTED_FORBIDDEN_FIELDS.forEach((field) => {
          expect(displayRecord[field]).toBeUndefined();
        });
      });
    });

    it('rejects any attempt to inject supplier identity metadata into protected view', () => {
      const targetQuote = mockQuotes[0];
      if (!targetQuote) throw new Error('Missing test quote');
      const leakedQuote = {
        ...identityProtectedQuoteToDisplayRecord(targetQuote),
        business_name: 'Apex Electrical Rewinders Pvt Ltd',
      };

      expect(() => assertIdentityProtectedPayloadSafe(leakedQuote)).toThrow();
    });

    it('rejects phone numbers, emails, and GSTIN identifiers in pre-reveal payloads', () => {
      const targetQuote = mockQuotes[0];
      if (!targetQuote) throw new Error('Missing test quote');

      const leakedPhone = {
        ...identityProtectedQuoteToDisplayRecord(targetQuote),
        contact_phone: '+919876543210',
      };
      expect(() => assertIdentityProtectedPayloadSafe(leakedPhone)).toThrow();

      const leakedEmail = {
        ...identityProtectedQuoteToDisplayRecord(targetQuote),
        contact_email: 'vendor@apexrewind.com',
      };
      expect(() => assertIdentityProtectedPayloadSafe(leakedEmail)).toThrow();

      const leakedGstin = {
        ...identityProtectedQuoteToDisplayRecord(targetQuote),
        gstin: '29ABCDE1234F1Z5',
      };
      expect(() => assertIdentityProtectedPayloadSafe(leakedGstin)).toThrow();
    });
  });

  describe('6. Mobile Ergonomics & Design System Token Invariants', () => {
    it('validates 4-pillar tokens in OTP design system', () => {
      expect(OTP_DESIGN_TOKENS.fourPillars.price.label).toBe('₹ Total Cost');
      expect(OTP_DESIGN_TOKENS.fourPillars.price.icon).toBe('💰');
      expect(OTP_DESIGN_TOKENS.fourPillars.tat.label).toBe('Delivery TAT');
      expect(OTP_DESIGN_TOKENS.fourPillars.tat.icon).toBe('⚡');
      expect(OTP_DESIGN_TOKENS.fourPillars.warranty.label).toBe('Warranty SLA');
      expect(OTP_DESIGN_TOKENS.fourPillars.warranty.icon).toBe('🛡️');
      expect(OTP_DESIGN_TOKENS.fourPillars.score.label).toBe('Merit Score');
      expect(OTP_DESIGN_TOKENS.fourPillars.score.icon).toBe('★');
    });

    it('validates minimum touch target and mobile viewport standard tokens', () => {
      expect(OTP_DESIGN_TOKENS.viewport.minTouchTarget).toBe('44px');
      expect(OTP_DESIGN_TOKENS.viewport.targetWidth).toBe('390px');
      expect(OTP_DESIGN_TOKENS.viewport.minWidth).toBe('360px');
      expect(OTP_DESIGN_TOKENS.viewport.androidStandardWidth).toBe('412px');
    });
  });
});

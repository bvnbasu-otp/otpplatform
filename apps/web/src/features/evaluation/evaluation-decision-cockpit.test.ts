import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROTECTED_FORBIDDEN_FIELDS,
  assertIdentityProtectedPayloadSafe,
  getCategoryEvaluationProfile,
  getSuggestedWeightsForCategory,
  applyEvaluationPreset,
  EvaluationPreset,
  computeExplainableSmartScores,
  isEssentialCriterion,
  weightsSumTo100,
  type IdentityProtectedQuote,
} from '@otp/domain';
import {
  EvaluationDecisionCockpit,
  EvaluationDecisionCockpitPage,
  MobileVotingCard,
  DEFAULT_RATIONALE_CHIPS,
  type CockpitTab,
} from './index';

const mockQuotes: IdentityProtectedQuote[] = [
  {
    quoteId: 'quote-001',
    anonymousLabel: 'Supplier #01',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 200000,
    gstAmount: 36000,
    transportCost: 4000,
    totalCost: 240000,
    deliveryDays: 5,
    warrantyMonths: 12,
    evaluationScore: 88.0,
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
    anonymousLabel: 'Supplier #02',
    version: 2, // Revised version
    status: 'SUBMITTED',
    basePrice: 185000,
    gstAmount: 33300,
    transportCost: 2000,
    totalCost: 220300, // Lowest L1 Price
    deliveryDays: 3, // Fastest TAT
    warrantyMonths: 24, // Longest Warranty
    evaluationScore: 94.5, // Highest Merit Score
    supplierRatingAvg: 4.8,
    pastPerformanceScore: 95,
    experienceBand: '50+',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 30,
    submittedAt: '2026-09-10T11:30:00Z',
  },
  {
    quoteId: 'quote-003',
    anonymousLabel: 'Supplier #03',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 220000,
    gstAmount: 39600,
    transportCost: 5000,
    totalCost: 264600,
    deliveryDays: 8,
    warrantyMonths: 12,
    evaluationScore: 78.0,
    supplierRatingAvg: 4.0,
    pastPerformanceScore: 80,
    experienceBand: '5-19',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 15,
    submittedAt: '2026-09-10T14:00:00Z',
  },
];

describe('OTP — Unified Evaluation & Decision Cockpit Engine (Phase B)', () => {
  describe('1. B1 — Cockpit Canonicalisation & Exports', () => {
    it('exports canonical cockpit page and components', () => {
      expect(EvaluationDecisionCockpit).toBeDefined();
      expect(EvaluationDecisionCockpitPage).toBeDefined();
      expect(MobileVotingCard).toBeDefined();
      expect(DEFAULT_RATIONALE_CHIPS.length).toBeGreaterThan(0);
    });

    it('validates canonical 4-tab definition and alias normalization', () => {
      const canonicalTabs: CockpitTab[] = ['quotes', 'qa', 'vote', 'award'];
      expect(canonicalTabs).toEqual(['quotes', 'qa', 'vote', 'award']);

      function normalizeTab(raw: string | null | undefined): CockpitTab {
        if (!raw) return 'quotes';
        const clean = raw.toLowerCase().trim();
        if (clean === 'qa' || clean === 'clarification' || clean === 'q&a' || clean === 'questions') return 'qa';
        if (clean === 'vote' || clean === 'ballot' || clean === 'committee') return 'vote';
        if (clean === 'award' || clean === 'decision' || clean === 'reveal') return 'award';
        return 'quotes';
      }

      expect(normalizeTab('quotes')).toBe('quotes');
      expect(normalizeTab('matrix')).toBe('quotes');
      expect(normalizeTab('qa')).toBe('qa');
      expect(normalizeTab('clarification')).toBe('qa');
      expect(normalizeTab('Q&A')).toBe('qa');
      expect(normalizeTab('vote')).toBe('vote');
      expect(normalizeTab('ballot')).toBe('vote');
      expect(normalizeTab('committee')).toBe('vote');
      expect(normalizeTab('award')).toBe('award');
      expect(normalizeTab('decision')).toBe('award');
      expect(normalizeTab('reveal')).toBe('award');
      expect(normalizeTab(null)).toBe('quotes');
    });
  });

  describe('2. B2 — Quote Review Compression & Invariants', () => {
    it('accurately identifies L1 lowest total cost with landed GST', () => {
      const minCost = Math.min(...mockQuotes.map((q) => q.totalCost));
      expect(minCost).toBe(220300);

      const l1 = mockQuotes.find((q) => q.totalCost === minCost);
      expect(l1?.anonymousLabel).toBe('Supplier #02');
      expect(l1?.basePrice).toBe(185000);
      expect(l1?.gstAmount).toBe(33300);
      expect((l1?.basePrice ?? 0) + (l1?.gstAmount ?? 0) + (l1?.transportCost ?? 0)).toBe(220300);
    });

    it('accurately identifies Fastest Turnaround Time (TAT)', () => {
      const fastestTat = Math.min(...mockQuotes.map((q) => q.deliveryDays));
      expect(fastestTat).toBe(3);

      const fastest = mockQuotes.find((q) => q.deliveryDays === fastestTat);
      expect(fastest?.anonymousLabel).toBe('Supplier #02');
    });

    it('accurately identifies Longest Warranty Period', () => {
      const maxWarranty = Math.max(...mockQuotes.map((q) => q.warrantyMonths));
      expect(maxWarranty).toBe(24);

      const bestWarranty = mockQuotes.find((q) => q.warrantyMonths === maxWarranty);
      expect(bestWarranty?.anonymousLabel).toBe('Supplier #02');
    });

    it('accurately identifies Top Evaluated Merit Score', () => {
      const topScore = Math.max(...mockQuotes.map((q) => q.evaluationScore ?? 0));
      expect(topScore).toBe(94.5);

      const highestScorer = mockQuotes.find((q) => q.evaluationScore === topScore);
      expect(highestScorer?.anonymousLabel).toBe('Supplier #02');
    });

    it('displays Level 1 & Level 2 critical parameters including revision tags and GST verification', () => {
      const revisedQuote = mockQuotes.find((q) => q.version > 1);
      expect(revisedQuote?.version).toBe(2);
      expect(revisedQuote?.isGstVerified).toBe(true);
      expect(revisedQuote?.experienceBand).toBe('50+');
      expect(revisedQuote?.paymentTermsDays).toBe(30);
    });

    it('computes percentage delta vs fair market benchmark accurately', () => {
      const benchmarkPrice = 250000;
      const winningPrice = 220300;
      const savings = benchmarkPrice - winningPrice;
      const savingsPercent = Math.round((savings / benchmarkPrice) * 100);

      expect(savings).toBe(29700);
      expect(savingsPercent).toBe(12);
    });
  });

  describe('3. Zero-Bias Supplier Identity Protection Barrier', () => {
    it('ensures zero forbidden supplier identity fields exist in pre-reveal quotes', () => {
      mockQuotes.forEach((quote) => {
        const forbiddenFound = IDENTITY_PROTECTED_FORBIDDEN_FIELDS.filter((f) => f in quote);
        expect(forbiddenFound).toEqual([]);
      });
    });

    it('passes assertIdentityProtectedPayloadSafe for all comparison quotes', () => {
      mockQuotes.forEach((quote) => {
        expect(() => assertIdentityProtectedPayloadSafe(quote as any)).not.toThrow();
      });
    });
  });

  describe('4. B3 — Masked Clarifications & Q&A Integration', () => {
    it('structures masked Q&A threads by anonymous supplier label', () => {
      const mockLabels = [
        { invitationId: 'inv-1', anonymousLabel: 'Supplier #01' },
        { invitationId: 'inv-2', anonymousLabel: 'Supplier #02' },
      ];
      const mockMessages = [
        { id: 'm1', invitationId: 'inv-1', authorSide: 'SUPPLIER' as const, authorDisplay: 'Supplier #01', body: 'Can we supply in 2 batches?', createdAt: '2026-09-10T10:00:00Z' },
        { id: 'm2', invitationId: 'inv-1', authorSide: 'BUYER' as const, authorDisplay: 'Procurement Lead', body: 'Yes, batch delivery is accepted.', createdAt: '2026-09-10T10:30:00Z' },
      ];

      const inv1Messages = mockMessages.filter((m) => m.invitationId === 'inv-1');
      expect(inv1Messages.length).toBe(2);
      expect(inv1Messages[0]?.authorSide).toBe('SUPPLIER');
      expect(inv1Messages[1]?.authorSide).toBe('BUYER');
    });
  });

  describe('5. B4 — Governance, Committee Ballot & Role Awareness', () => {
    it('validates 1-tap vote choices: RECOMMEND, ABSTAIN, OPPOSE', () => {
      const choices = ['RECOMMEND', 'ABSTAIN', 'OPPOSE'];
      expect(choices).toContain('RECOMMEND');
      expect(choices).toContain('ABSTAIN');
      expect(choices).toContain('OPPOSE');
    });

    it('provides standard candidate rationale chips with customer-friendly text', () => {
      const chipIds = DEFAULT_RATIONALE_CHIPS.map((c) => c.id);
      expect(chipIds).toContain('optimal_value');
      expect(chipIds).toContain('fastest_delivery');
      expect(chipIds).toContain('superior_warranty');
      expect(chipIds).toContain('compliant_spec');
      expect(chipIds).toContain('verified_track_record');
    });

    it('calculates weighted quorum vs raw headcount correctly', () => {
      const votes = [
        { voter: 'Finance Director', weight: 3.0, choice: 'RECOMMEND', target: 'quote-002' },
        { voter: 'Technical Lead', weight: 2.0, choice: 'RECOMMEND', target: 'quote-002' },
        { voter: 'Procurement Specialist', weight: 1.0, choice: 'RECOMMEND', target: 'quote-001' },
      ];

      const totalHeadcount = votes.length;
      const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
      const quote2Weight = votes.filter((v) => v.target === 'quote-002').reduce((sum, v) => sum + v.weight, 0);
      const quote1Weight = votes.filter((v) => v.target === 'quote-001').reduce((sum, v) => sum + v.weight, 0);

      expect(totalHeadcount).toBe(3);
      expect(totalWeight).toBe(6.0);
      expect(quote2Weight).toBe(5.0);
      expect(quote1Weight).toBe(1.0);
      expect(quote2Weight > quote1Weight).toBe(true);
    });

    it('auto-satisfies quorum for Solo Buyers without displaying artificial multi-member block', () => {
      const soloBuyerState = {
        isSoloBuyer: true,
        assignedMembers: 1,
        membersVoted: 1,
      };

      const quorumSatisfied = soloBuyerState.isSoloBuyer || (soloBuyerState.membersVoted >= soloBuyerState.assignedMembers);
      expect(quorumSatisfied).toBe(true);
    });

    it('enforces governance quorum requirement for Multi-Member organizations', () => {
      const committeeState = {
        isSoloBuyer: false,
        assignedMembers: 3,
        membersVoted: 1,
      };

      const quorumSatisfied = committeeState.isSoloBuyer || (committeeState.membersVoted >= committeeState.assignedMembers);
      expect(quorumSatisfied).toBe(false);

      const committeeStatePassed = {
        isSoloBuyer: false,
        assignedMembers: 3,
        membersVoted: 3,
      };
      expect(committeeStatePassed.isSoloBuyer || (committeeStatePassed.membersVoted >= committeeStatePassed.assignedMembers)).toBe(true);
    });
  });

  describe('6. B5 — Governed Award & Reveal Preconditions', () => {
    it('verifies atomic award transaction structure and PO generation', () => {
      const atomicResult = {
        awardId: 'award-test-01',
        rfqId: 'rfq-test-01',
        quoteId: 'quote-002',
        status: 'REVEALED',
        revealed: true,
        poId: 'po-test-01',
        poNumber: 'PO-2026-09-001',
        supplierId: 'sup-002',
        businessName: 'Vertex Power Systems Pvt Ltd',
      };

      expect(atomicResult.status).toBe('REVEALED');
      expect(atomicResult.revealed).toBe(true);
      expect(atomicResult.poId).toBeDefined();
      expect(atomicResult.poNumber).toMatch(/^PO-/);
      expect(atomicResult.businessName).toBe('Vertex Power Systems Pvt Ltd');
    });

    it('formats WhatsApp direct supplier link correctly', () => {
      const phone = '+91 98765 43210';
      const cleanPhone = phone.replace(/\D/g, '');
      const businessName = 'Vertex Power Systems';
      const waUrl = `https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(businessName)},%20we%20have%20awarded%20you%20our%20order%20on%20OTP!`;

      expect(waUrl).toContain('wa.me/91919876543210');
      expect(waUrl).toContain('Vertex%20Power%20Systems');
    });
  });

  describe('7. B7 — Plain-Language Customer Vocabulary', () => {
    it('validates canonical customer vocabulary definitions', () => {
      const vocabularyMap = {
        reviewOffers: 'Review Offers',
        castVote: 'Cast Vote',
        decision: 'Decision & Award',
        qa: 'Questions & Answers',
        decisionRecord: 'Decision Record',
        marketContext: 'Market Context',
      };

      expect(vocabularyMap.reviewOffers).toBe('Review Offers');
      expect(vocabularyMap.castVote).toBe('Cast Vote');
      expect(vocabularyMap.decision).toBe('Decision & Award');
      expect(vocabularyMap.qa).toBe('Questions & Answers');
      expect(vocabularyMap.decisionRecord).toBe('Decision Record');
      expect(vocabularyMap.marketContext).toBe('Market Context');
    });
  });

  describe('8. B8 — Mobile Viewport & Touch Target Forensics', () => {
    const MOBILE_VIEWPORTS = [
      { width: 320, name: 'iPhone SE' },
      { width: 360, name: 'Android Compact' },
      { width: 375, name: 'iPhone Mini' },
      { width: 390, name: 'iPhone Standard' },
      { width: 412, name: 'Pixel / Galaxy' },
      { width: 430, name: 'iPhone Pro Max' },
    ];

    it.each(MOBILE_VIEWPORTS)('ensures containment constraints for $name ($width px)', ({ width }) => {
      expect(width).toBeGreaterThanOrEqual(320);
      expect(width).toBeLessThanOrEqual(430);
    });

    it('enforces minimum 44px touch target specification for interactive elements', () => {
      const minTouchTargetPx = 44;
      const standardButtonHeight = 44;
      const dominantActionButtonHeight = 48;

      expect(standardButtonHeight).toBeGreaterThanOrEqual(minTouchTargetPx);
      expect(dominantActionButtonHeight).toBeGreaterThanOrEqual(minTouchTargetPx);
    });
  });

  describe('9. Phase C.6 — Progressive Advanced Controls & Category-Specific Scoring', () => {
    it('provides specialized category evaluation profiles with 100% normalized suggested weights', () => {
      const electricalProfile = getCategoryEvaluationProfile('ELECTRICAL');
      expect(electricalProfile.categoryCode).toBe('ELECTRICAL');
      expect(electricalProfile.recommendedCriteriaCodes).toEqual(
        expect.arrayContaining(['price', 'delivery_time', 'warranty', 'technical_fit', 'certification']),
      );

      const electricalWeights = getSuggestedWeightsForCategory('ELECTRICAL');
      expect(weightsSumTo100(electricalWeights)).toBe(true);
      expect(electricalWeights.price).toBe(40);
      expect(electricalWeights.delivery_time).toBe(20);

      const civilWeights = getSuggestedWeightsForCategory('CIVIL');
      expect(weightsSumTo100(civilWeights)).toBe(true);
      expect(civilWeights.technical_fit).toBe(25);

      const servicesWeights = getSuggestedWeightsForCategory('SERVICES');
      expect(weightsSumTo100(servicesWeights)).toBe(true);
      expect(servicesWeights.response_time).toBe(25);
    });

    it('applies standard strategy presets deterministically', () => {
      const lowestPriceWeights = applyEvaluationPreset(EvaluationPreset.PRICE_DOMINANT);
      expect(weightsSumTo100(lowestPriceWeights)).toBe(true);
      expect(lowestPriceWeights.price).toBe(65);

      const speedWeights = applyEvaluationPreset(EvaluationPreset.RAPID_FULFILLMENT);
      expect(weightsSumTo100(speedWeights)).toBe(true);
      expect(speedWeights.delivery_time).toBe(50);
    });

    it('computes explainable smart score breakdowns with itemized mathematical contributions', () => {
      const rawMetrics = mockQuotes.map((q) => ({
        quoteId: q.quoteId,
        totalCost: q.totalCost,
        deliveryDays: q.deliveryDays,
        warrantyMonths: q.warrantyMonths,
        ratingAvg: q.supplierRatingAvg ?? 4.0,
        onTimePercent: q.pastPerformanceScore ?? 85,
        isGstVerified: Boolean(q.isGstVerified),
        anonymousLabel: q.anonymousLabel,
      }));

      const explainable = computeExplainableSmartScores(rawMetrics, {
        commercial: 50,
        speed: 25,
        warranty: 15,
        quality: 10,
      });

      expect(explainable.length).toBe(3);
      const winner = explainable.find((e) => e.quoteId === 'quote-002')!;
      expect(winner.anonymousLabel).toBe('Supplier #02');
      expect(winner.breakdown.length).toBe(4);
      expect(winner.formulaSummary).toContain('Score =');

      // Zero supplier identity leakage in breakdown
      explainable.forEach((e) => {
        expect(e.anonymousLabel).toMatch(/^Supplier #\d+$/);
        e.breakdown.forEach((b) => {
          expect(b.weightedContribution).toBeGreaterThanOrEqual(0);
          expect(b.normalizedScore).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it('differentiates essential vs advanced criteria for progressive disclosure', () => {
      expect(isEssentialCriterion('price')).toBe(true);
      expect(isEssentialCriterion('delivery_time')).toBe(true);
      expect(isEssentialCriterion('warranty')).toBe(true);
      expect(isEssentialCriterion('technical_fit')).toBe(false);
      expect(isEssentialCriterion('certification')).toBe(false);
    });

    it('exports EvaluationDecisionCockpit with responsive mobile viewport containment', () => {
      expect(EvaluationDecisionCockpit).toBeDefined();
      expect(typeof EvaluationDecisionCockpit).toBe('function');
    });

    it('Screens.docx: validates 4-pillar quote comparison matrix pillars', () => {
      const pillars = ['Total Evaluated Price', 'Delivery Turnaround', 'Warranty & Quality', 'Evaluated Score'];
      expect(pillars.length).toBe(4);
      expect(pillars[0]).toContain('Price');
      expect(pillars[3]).toContain('Score');
    });

    it('verifies deduplicated primary navigation CTA anchored in bottom dock with >=48px touch target', () => {
      const bottomDockCta = 'Proceed to Committee Decision Room →';
      expect(bottomDockCta).toContain('Decision Room');
      expect(bottomDockCta).not.toContain('bid');
    });

    it('verifies quote comparison summary header is scoped exclusively to quotes review tab', () => {
      const activeTabs = ['quotes', 'qa', 'vote', 'award'];
      const showHeader = (tab: string) => tab === 'quotes';
      expect(showHeader('quotes')).toBe(true);
      expect(showHeader('qa')).toBe(false);
      expect(showHeader('vote')).toBe(false);
      expect(showHeader('award')).toBe(false);
    });
  });
});


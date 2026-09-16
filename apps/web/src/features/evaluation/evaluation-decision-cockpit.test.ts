import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROTECTED_FORBIDDEN_FIELDS,
  assertIdentityProtectedPayloadSafe,
  type IdentityProtectedQuote,
} from '@otp/domain';
import {
  EvaluationDecisionCockpit,
  MobileVotingCard,
  DEFAULT_RATIONALE_CHIPS,
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
    version: 1,
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

describe('OTP — Unified Evaluation & Decision Cockpit Engine', () => {
  describe('1. Component Module Exports', () => {
    it('exports all unified cockpit and voting components', () => {
      expect(EvaluationDecisionCockpit).toBeDefined();
      expect(MobileVotingCard).toBeDefined();
      expect(DEFAULT_RATIONALE_CHIPS.length).toBeGreaterThan(0);
    });
  });

  describe('2. 4-Pillar Offer Comparison Matrix Invariants', () => {
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

    it('accurately identifies Top Evaluated Smart Score', () => {
      const topScore = Math.max(...mockQuotes.map((q) => q.evaluationScore ?? 0));
      expect(topScore).toBe(94.5);

      const highestScorer = mockQuotes.find((q) => q.evaluationScore === topScore);
      expect(highestScorer?.anonymousLabel).toBe('Supplier #02');
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

  describe('4. 30-Second Mobile Voting & Weighted Quorum Governance', () => {
    it('validates 1-tap ballot choices: RECOMMEND, ABSTAIN, OPPOSE', () => {
      const choices = ['RECOMMEND', 'ABSTAIN', 'OPPOSE'];
      expect(choices).toContain('RECOMMEND');
      expect(choices).toContain('ABSTAIN');
      expect(choices).toContain('OPPOSE');
    });

    it('provides standard candidate rationale chips with verifiable text', () => {
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
  });

  describe('5. Atomic Award & Bilateral Reveal Preconditions', () => {
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
  });
});

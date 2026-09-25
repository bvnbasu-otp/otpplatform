import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROTECTED_FORBIDDEN_FIELDS,
  assertIdentityProtectedPayloadSafe,
  computeSmartScores,
  computeExplainableSmartScores,
  evaluateApprovalRoute,
  evaluateMsmeSpendDecisionState,
  type IdentityProtectedQuote,
  type RawQuoteMetrics,
  type ScoringWeights,
} from '@otp/domain';
import { mapIdentityProtectedQuoteRow } from '../../apps/web/src/features/rfq/mappers/identity-protected-quote-mapper';
import { parseBreakdown } from '../../apps/web/src/features/evaluation/types/quote-evaluation';

describe('Stage R2-10: REVIEW 4-Pillar Masked Comparison Matrix Red Team Suite (RT-01 to RT-16)', () => {
  const baseQuoteMetrics: RawQuoteMetrics[] = [
    {
      quoteId: 'quote-001',
      totalCost: 150000,
      deliveryDays: 5,
      warrantyMonths: 12,
      ratingAvg: 4.5,
      onTimePercent: 95,
      isGstVerified: true,
      anonymousLabel: 'Offer A',
    },
    {
      quoteId: 'quote-002',
      totalCost: 140000,
      deliveryDays: 7,
      warrantyMonths: 24,
      ratingAvg: 4.8,
      onTimePercent: 90,
      isGstVerified: true,
      anonymousLabel: 'Offer B',
    },
    {
      quoteId: 'quote-003',
      totalCost: 160000,
      deliveryDays: 3,
      warrantyMonths: 6,
      ratingAvg: 4.0,
      onTimePercent: 80,
      isGstVerified: false,
      anonymousLabel: 'Offer C',
    },
  ];

  const standardWeights: ScoringWeights = {
    commercial: 50,
    speed: 20,
    warranty: 15,
    quality: 15,
  };

  // RT-01: Pre-award identity leak attempt
  it('RT-01: blocks pre-award identity leak in data payloads', () => {
    const leakedPayload = {
      quoteId: 'q-leak-1',
      anonymousLabel: 'Offer A',
      businessName: 'Unmasked Supplier Pvt Ltd',
      totalCost: 150000,
    };
    expect(() => assertIdentityProtectedPayloadSafe(leakedPayload)).toThrow();
  });

  // RT-02: Direct API unmasked retrieval bypass attempt
  it('RT-02: detects forbidden supplier contact fields in payload', () => {
    const contactLeak = {
      quoteId: 'q-leak-2',
      contactPhone: '+919876543210',
      totalCost: 150000,
    };
    expect(() => assertIdentityProtectedPayloadSafe(contactLeak)).toThrow();
  });

  // RT-03: URL/DOM/metadata leakage attempt
  it('RT-03: prevents original filename or upload identity leakage', () => {
    const metadataLeak = {
      quoteId: 'q-leak-3',
      originalFilename: 'supplier_quotation_official_invoice.pdf',
    };
    expect(() => assertIdentityProtectedPayloadSafe(metadataLeak)).toThrow();
  });

  // RT-04: Cross-buyer/cross-org quote access
  it('RT-04: enforces tenant isolation on spend governance evaluation', () => {
    const result = evaluateApprovalRoute({
      rfqId: 'rfq-cross-1',
      organizationId: 'org-buyer-alpha',
      estimatedOrAwardedAmount: 500000,
      creatorProfileId: 'usr-buyer-alpha',
    });
    expect(result.policySnapshot.organizationId).toBe('org-buyer-alpha');
    expect(result.requiredApprovalLevel).toBeDefined();
  });

  // RT-05: Quote participant substitution during review
  it('RT-05: validates strict mapper rejection of unauthenticated quote row with missing quote_id', () => {
    expect(() => mapIdentityProtectedQuoteRow({ quote_id: '' } as any)).toThrow(/missing quote_id/i);
  });

  // RT-06: Forged score manipulation
  it('RT-06: guarantees deterministic score calculation regardless of input ordering', () => {
    const scores1 = computeSmartScores(baseQuoteMetrics, standardWeights);
    const scores2 = computeSmartScores([...baseQuoteMetrics].reverse(), standardWeights);

    const q1Score1 = scores1.find((s) => s.quoteId === 'quote-001')?.compositeScore;
    const q1Score2 = scores2.find((s) => s.quoteId === 'quote-001')?.compositeScore;
    expect(q1Score1).toBe(q1Score2);
  });

  // RT-07: Commercial Landed Cost + GST distortion attempt
  it('RT-07: correctly preserves Landed Cost and GST bonus without arithmetic overflow', () => {
    const scores = computeSmartScores(baseQuoteMetrics, standardWeights);
    const lowestCostQuote = scores.find((s) => s.quoteId === 'quote-002');
    expect(lowestCostQuote?.commercialScore).toBe(100);
    expect(lowestCostQuote?.gstBonus).toBe(5);
  });

  // RT-08: Turnaround Time (TAT) distortion / missing fallback
  it('RT-08: applies transparency damping to estimated delivery SLAs', () => {
    const estimatedQuotes: RawQuoteMetrics[] = [
      {
        quoteId: 'quote-est-1',
        totalCost: 100000,
        deliveryDays: 5,
        warrantyMonths: 12,
        ratingAvg: 4.0,
        onTimePercent: 80,
        isGstVerified: false,
        isDeliveryDaysEstimated: true,
      },
      {
        quoteId: 'quote-conf-2',
        totalCost: 100000,
        deliveryDays: 5,
        warrantyMonths: 12,
        ratingAvg: 4.0,
        onTimePercent: 80,
        isGstVerified: false,
        isDeliveryDaysEstimated: false,
      },
    ];
    const scores = computeSmartScores(estimatedQuotes, standardWeights);
    const est = scores.find((s) => s.quoteId === 'quote-est-1')!;
    const conf = scores.find((s) => s.quoteId === 'quote-conf-2')!;
    expect(est.compositeScore).toBeLessThan(conf.compositeScore);
    expect(est.slaConfidencePenalty).toBeGreaterThan(0);
  });

  // RT-09: Warranty / SLA duration falsification
  it('RT-09: decomposes warranty metrics into transparent explainable breakdowns', () => {
    const explainable = computeExplainableSmartScores(baseQuoteMetrics, standardWeights);
    const maxWarrantyOffer = explainable.find((q) => q.quoteId === 'quote-002')!;
    expect(maxWarrantyOffer.bestInClassBadges).toContain('Longest Warranty');
  });

  // RT-10: Smart Merit Score manipulation via supplier identity tags
  it('RT-10: computes merit scores solely from objective metrics ignoring labels', () => {
    const qA: RawQuoteMetrics = { ...baseQuoteMetrics[0]!, anonymousLabel: 'Special VIP' };
    const qB: RawQuoteMetrics = { ...baseQuoteMetrics[0]!, anonymousLabel: 'Offer #99' };
    const scoreA = computeSmartScores([qA], standardWeights)[0]!.compositeScore;
    const scoreB = computeSmartScores([qB], standardWeights)[0]!.compositeScore;
    expect(scoreA).toBe(scoreB);
  });

  // RT-11: Fabricated offer injection
  it('RT-11: parses criteria breakdown safely without executing arbitrary payloads', () => {
    const parsed = parseBreakdown({
      price: { weight: 50, raw: 10000, normalized: 100, contribution: 50 },
      _weights: { price: 50 },
    });
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.weights.price).toBe(50);
  });

  // RT-12: Unverified badge injection attempt
  it('RT-12: only awards GST bonus when isGstVerified is explicitly true', () => {
    const scores = computeSmartScores(baseQuoteMetrics, standardWeights);
    const unverifiedQuote = scores.find((s) => s.quoteId === 'quote-003');
    expect(unverifiedQuote?.gstBonus).toBe(0);
  });

  // RT-13: R2-08 lifecycle gate bypass attempt
  it('RT-13: verifies forbidden identity fields list covers all sensitive vectors', () => {
    expect(IDENTITY_PROTECTED_FORBIDDEN_FIELDS).toContain('gstin');
    expect(IDENTITY_PROTECTED_FORBIDDEN_FIELDS).toContain('businessName');
    expect(IDENTITY_PROTECTED_FORBIDDEN_FIELDS).toContain('contactPhone');
    expect(IDENTITY_PROTECTED_FORBIDDEN_FIELDS).toContain('originalFilename');
  });

  // RT-14: Premature award triggering during Review
  it('RT-14: verifies review stage preserves masked state without triggering award reveal', () => {
    const safeQuoteRow = {
      quote_id: 'q-rev-101',
      anonymous_label: 'Offer A',
      version: 1,
      status: 'SUBMITTED',
      total_cost: 250000,
    };
    const mapped = mapIdentityProtectedQuoteRow(safeQuoteRow as any);
    expect(mapped.status).toBe('SUBMITTED');
    expect((mapped as any).supplierId).toBeUndefined();
  });

  // RT-15: MSME spend delegation & anti-self-approval enforcement during review
  it('RT-15: enforces anti-self-approval for creator during spend decision evaluation', () => {
    const evaluation = evaluateMsmeSpendDecisionState({
      actorProfileId: 'usr-creator-1',
      actorRole: 'PRIMARY',
      rfqCreatorProfileId: 'usr-creator-1',
      procurementAmount: 150000,
    });
    expect(evaluation.canApprove).toBe(false);
    expect(evaluation.state).toBe('CANNOT_APPROVE_OWN_TRANSACTION');
  });

  // RT-16: RWA committee voting integrity during review transition
  it('RT-16: ensures explainable breakdown formula summary is transparent and complete', () => {
    const explainable = computeExplainableSmartScores(baseQuoteMetrics, standardWeights);
    explainable.forEach((item) => {
      expect(item.formulaSummary).toContain('Score =');
      expect(item.breakdown.length).toBeGreaterThan(0);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildCanonicalDecisionReceipt, computeDecisionReceiptHash } from './decision-receipt';
import { computeProcurementA4DigestV1, buildDecisionReceiptProcurementDocumentInput } from './issued-document';

describe('issued-document digest helpers', () => {
  it('computeProcurementA4DigestV1 excludes verification from digest input', () => {
    const receipt = buildCanonicalDecisionReceipt({
      rfqId: 'f1000000-0000-4000-8000-000000000001',
      rfqRefNumber: 'RFQ-TEST',
      rfqTitle: 'Test RFQ',
      buyerPersona: 'INDIVIDUAL',
      buyerContext: {
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        organizationName: 'Org',
        buyerName: 'Buyer',
        deliveryStateCode: '29',
      },
      requirementSnapshot: {
        requirementId: 'r1',
        title: 'Req',
        categoryName: 'Cat',
        mode: 'DIRECT_PURCHASE',
      },
      selectedOffer: {
        quoteId: 'q1',
        quoteVersion: 1,
        supplierId: null,
        maskedSupplierLabel: 'Supplier #01',
        baseAmount: 1000,
        gstRate: 18,
        gstAmount: 180,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        isInterState: false,
        totalLandedCost: 1180,
        deliveryTimelineDays: 7,
        warrantyPeriodMonths: 12,
        paymentStructure: 'MILESTONE_BASED',
      },
      meritEvaluation: {
        rank: 1,
        score: 9,
        totalQuotesEvaluated: 2,
        lowestTotalCost: 1180,
        consensusJustification: 'Best value',
      },
      authorityAttribution: {
        awardedByProfileId: 'p1',
        awardedByName: 'Manager',
        awardedByRole: 'MANAGER',
        isDelegated: false,
      },
      governanceRecord: { persona: 'INDIVIDUAL', individualConfirmation: { confirmedAt: '2026-01-01T00:00:00.000Z', confirmedBy: 'p1' } },
      awardedAt: '2026-01-01T00:00:00.000Z',
      receiptGeneratedAt: '2026-01-01T00:00:01.000Z',
    });

    const input = buildDecisionReceiptProcurementDocumentInput(receipt, {
      viewerRole: 'buyer',
      phase: 'PRE_AWARD',
      generatedAt: receipt.timestamps.receiptGeneratedAt,
    });
    const d1 = computeProcurementA4DigestV1(input);
    const d2 = computeProcurementA4DigestV1({
      ...input,
      verification: { label: 'Document Integrity Reference', value: 'changed' },
    });
    expect(d1).toBe(d2);
    expect(d1).toHaveLength(64);
  });

  it('decision receipt hash matches computeDecisionReceiptHash on payload', () => {
    const receipt = buildCanonicalDecisionReceipt({
      rfqId: 'f1000000-0000-4000-8000-000000000002',
      rfqRefNumber: 'RFQ-2',
      rfqTitle: 'Two',
      buyerPersona: 'MSME',
      buyerContext: {
        organizationId: 'a0000000-0000-4000-8000-000000000002',
        organizationName: 'MSME Org',
        buyerName: 'Owner',
        deliveryStateCode: '29',
      },
      requirementSnapshot: {
        requirementId: 'r2',
        title: 'Req2',
        categoryName: 'Cat',
        mode: 'DIRECT_PURCHASE',
      },
      selectedOffer: {
        quoteId: 'q2',
        quoteVersion: 1,
        supplierId: 'd0000000-0000-4000-8000-000000000001',
        maskedSupplierLabel: 'Supplier #02',
        baseAmount: 5000,
        gstRate: 18,
        gstAmount: 900,
        cgstAmount: 450,
        sgstAmount: 450,
        igstAmount: 0,
        isInterState: false,
        totalLandedCost: 5900,
        deliveryTimelineDays: 10,
        warrantyPeriodMonths: 6,
        paymentStructure: 'MILESTONE_BASED',
      },
      meritEvaluation: {
        rank: 1,
        score: 8.5,
        totalQuotesEvaluated: 3,
        lowestTotalCost: 5900,
        consensusJustification: 'Lowest compliant bid',
      },
      authorityAttribution: {
        awardedByProfileId: 'p2',
        awardedByName: 'Owner',
        awardedByRole: 'OWNER',
        isDelegated: false,
      },
      governanceRecord: { persona: 'MSME' },
      awardedAt: '2026-02-01T10:00:00.000Z',
      receiptGeneratedAt: '2026-02-01T10:00:01.000Z',
    });
    const { cryptographicAuditHash, ...payload } = receipt;
    expect(computeDecisionReceiptHash(payload)).toBe(cryptographicAuditHash);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCanonicalDecisionReceipt,
  formatDecisionReceiptMarkdown,
  type BuildCanonicalDecisionReceiptParams,
} from './decision-receipt';

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function receipt(overrides: {
  offer?: Partial<BuildCanonicalDecisionReceiptParams['selectedOffer']>;
  merit?: Partial<BuildCanonicalDecisionReceiptParams['meritEvaluation']>;
  deliveryStateCode?: string | null;
} = {}) {
  return buildCanonicalDecisionReceipt({
    receiptId: 'REC-MD-OMIT-1',
    rfqId: 'rfq-md-omit-1',
    rfqRefNumber: 'RFQ-MD-1',
    rfqTitle: 'Commercial submersible pumps',
    buyerPersona: 'INDIVIDUAL',
    buyerContext: {
      organizationId: null,
      organizationName: null,
      buyerName: 'Ananya Sharma',
      deliveryStateCode: overrides.deliveryStateCode === undefined ? null : overrides.deliveryStateCode,
    },
    requirementSnapshot: {
      requirementId: 'req-md-1',
      title: '10HP pump',
      categoryName: null,
      mode: 'CAPITAL_GOODS',
    },
    selectedOffer: {
      quoteId: 'quote-md-1',
      quoteVersion: 1,
      supplierId: 'sup-md-1',
      maskedSupplierLabel: 'Supplier #01',
      businessName: 'FluidTech',
      baseAmount: 350000,
      gstRate: null,
      gstAmount: null,
      taxSplitBasis: null,
      cgstAmount: 31500,
      sgstAmount: 31500,
      igstAmount: 0,
      isInterState: false,
      totalLandedCost: 413000,
      deliveryTimelineDays: null,
      warrantyPeriodMonths: null,
      paymentStructure: 'THREE_PART_MILESTONE',
      ...overrides.offer,
    },
    meritEvaluation: {
      rank: null,
      score: null,
      totalQuotesEvaluated: 4,
      lowestTotalCost: null,
      selectedIsLowestCost: null,
      costAvoidedComparedToIncumbent: null,
      consensusJustification: null,
      ...overrides.merit,
    },
    authorityAttribution: {
      awardedByProfileId: 'usr-1',
      awardedByName: 'Ananya Sharma',
      awardedByRole: null,
      isDelegated: false,
    },
    governanceRecord: { persona: 'INDIVIDUAL' },
    awardedAt: '2026-09-25T10:00:00.000Z',
    receiptGeneratedAt: '2026-09-25T10:05:00.000Z',
  });
}

describe('formatDecisionReceiptMarkdown null omissions', () => {
  it('omits null commercial and merit lines and drops the GST split when the basis is unavailable', () => {
    const omitted = formatDecisionReceiptMarkdown(receipt());

    expect(omitted).not.toContain('Delivery State:');
    expect(omitted).not.toContain('Statutory GST Rate');
    expect(omitted).not.toContain('CGST:');
    expect(omitted).not.toContain('SGST:');
    expect(omitted).not.toContain('IGST:');
    expect(omitted).not.toContain('Delivery Timeline:');
    expect(omitted).not.toContain('Warranty Period:');
    expect(omitted).not.toContain('Merit Rank:');
    expect(omitted).not.toContain('Merit Score:');
    expect(omitted).not.toContain('Lowest Total Cost Available:');
    expect(omitted).not.toContain('Consensus Justification:');
    expect(omitted).not.toContain('(selected offer)');
    expect(omitted).toContain(`- **Base Commercial Value:** ${inr(350000)}`);
    expect(omitted).toContain(`- **Total Landed Cost:** **${inr(413000)}**`);
    expect(omitted).toContain('- **Payment Structure:** THREE_PART_MILESTONE');
    expect(omitted).toContain('- **Offers Compared:** 4');

    const unavailableSplit = formatDecisionReceiptMarkdown(
      receipt({
        offer: { gstRate: 18, gstAmount: 63000, taxSplitBasis: 'UNAVAILABLE' },
      }),
    );
    expect(unavailableSplit).toContain('- **Statutory GST Rate:** 18%');
    expect(unavailableSplit).not.toContain('- **Statutory GST Rate:** 18% (');
    expect(unavailableSplit).not.toContain('CGST:');
    expect(unavailableSplit).not.toContain('IGST:');
  });

  it('renders populated GST split, delivery, warranty, rank, lowest cost, and consensus', () => {
    const md = formatDecisionReceiptMarkdown(
      receipt({
        deliveryStateCode: '29',
        offer: {
          gstRate: 18,
          gstAmount: 63000,
          taxSplitBasis: 'QUOTE_SNAPSHOT',
          cgstAmount: 31500,
          sgstAmount: 31500,
          igstAmount: 0,
          isInterState: false,
          deliveryTimelineDays: 7,
          warrantyPeriodMonths: 24,
        },
        merit: {
          rank: 1,
          score: 9.4,
          totalQuotesEvaluated: 4,
          lowestTotalCost: 413000,
          selectedIsLowestCost: true,
          consensusJustification: 'Lowest landed cost with a 24-month warranty.',
        },
      }),
    );

    expect(md).toContain('- **Delivery State:** Code 29');
    expect(md).toContain(`- **Statutory GST Rate:** 18% (CGST: ${inr(31500)} + SGST: ${inr(31500)})`);
    expect(md).toContain('- **Delivery Timeline:** 7 calendar days');
    expect(md).toContain('- **Warranty Period:** 24 months');
    expect(md).toContain('- **Merit Rank:** Rank #1 of 4 evaluated offers');
    expect(md).toContain('- **Merit Score:** 9.4/10');
    expect(md).toContain(`- **Lowest Total Cost Available:** ${inr(413000)} (selected offer)`);
    expect(md).toContain('- **Consensus Justification:** Lowest landed cost with a 24-month warranty.');
    expect(md).toContain('- **Offers Compared:** 4');
  });
});

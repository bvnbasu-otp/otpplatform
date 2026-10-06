import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCanonicalDecisionReceipt, type BuildCanonicalDecisionReceiptParams } from '@otp/domain';
import { DecisionReceiptCard } from './components/DecisionReceiptCard';

function params(overrides: {
  offer?: Partial<BuildCanonicalDecisionReceiptParams['selectedOffer']>;
  merit?: Partial<BuildCanonicalDecisionReceiptParams['meritEvaluation']>;
} = {}): BuildCanonicalDecisionReceiptParams {
  return {
    receiptId: 'REC-OMIT-1',
    rfqId: 'rfq-omit-1',
    rfqRefNumber: 'RFQ-OMIT-1',
    rfqTitle: 'Silent diesel generator',
    buyerPersona: 'INDIVIDUAL',
    buyerContext: {
      organizationId: null,
      organizationName: null,
      buyerName: 'Ananya Sharma',
      buyerEmail: 'ananya@example.com',
      deliveryStateCode: '29',
    },
    requirementSnapshot: {
      requirementId: 'req-omit-1',
      title: '25kVA generator',
      categoryName: 'Power',
      mode: 'CAPITAL_ASSETS',
    },
    selectedOffer: {
      quoteId: 'quote-omit-1',
      quoteVersion: 1,
      supplierId: 'sup-omit-1',
      maskedSupplierLabel: 'Supplier #02',
      businessName: 'Voltech Generators',
      baseAmount: 480000,
      gstRate: null,
      gstAmount: null,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      isInterState: false,
      totalLandedCost: 480000,
      deliveryTimelineDays: null,
      warrantyPeriodMonths: null,
      paymentStructure: 'SINGLE_PAYMENT',
      ...overrides.offer,
    },
    meritEvaluation: {
      rank: null,
      score: null,
      totalQuotesEvaluated: 7,
      lowestTotalCost: null,
      selectedIsLowestCost: null,
      consensusJustification: null,
      ...overrides.merit,
    },
    authorityAttribution: {
      awardedByProfileId: 'usr-1',
      awardedByName: 'Ananya Sharma',
      awardedByRole: 'BUYER',
      isDelegated: false,
    },
    governanceRecord: {
      persona: 'INDIVIDUAL',
      individualConfirmation: {
        confirmedAt: '2026-09-25T10:00:00.000Z',
        confirmedBy: 'usr-1',
      },
    },
    awardedAt: '2026-09-25T10:00:00.000Z',
    revealedAt: '2026-09-25T10:05:00.000Z',
    receiptGeneratedAt: '2026-09-25T10:05:05.000Z',
  };
}

function htmlFor(overrides?: Parameters<typeof params>[0]): string {
  const receipt = buildCanonicalDecisionReceipt(params(overrides));
  return renderToStaticMarkup(React.createElement(DecisionReceiptCard, { receipt }));
}

describe('DecisionReceiptCard omission of unknown commercial and merit fields', () => {
  it('omits null GST, delivery, warranty, rank, lowest cost, and consensus while keeping offers compared', () => {
    const html = htmlFor();

    expect(html).toContain('Offers compared:');
    expect(html).toContain('>7<');
    expect(html).not.toContain('GST');
    expect(html).not.toContain('Delivery TAT');
    expect(html).not.toContain('Warranty');
    expect(html).not.toContain('Rank:');
    expect(html).not.toContain('Lowest Available:');
    expect(html).not.toContain('Consensus Rationale:');
    expect(html).not.toContain('(selected offer)');
  });

  it('shows a populated comparison and the selected-offer marker only when that offer is the lowest cost', () => {
    const populated = htmlFor({
      offer: {
        gstRate: 18,
        gstAmount: 86400,
        cgstAmount: 43200,
        sgstAmount: 43200,
        deliveryTimelineDays: 5,
        warrantyPeriodMonths: 36,
        totalLandedCost: 566400,
      },
      merit: {
        rank: 2,
        score: 8.4,
        totalQuotesEvaluated: 7,
        lowestTotalCost: 540000,
        selectedIsLowestCost: false,
        consensusJustification: 'Accepted on delivery and warranty, not on price.',
      },
    });

    expect(populated).toContain('GST (18%)');
    expect(populated).toContain('Delivery TAT');
    expect(populated).toContain('5 Days');
    expect(populated).toContain('Warranty');
    expect(populated).toContain('36 Months');
    expect(populated).toContain('Rank:');
    expect(populated).toContain('#2 of 7');
    expect(populated).toContain('Lowest Available:');
    expect(populated).toContain('Consensus Rationale:');
    expect(populated).toContain('Offers compared:');
    expect(populated).not.toContain('(selected offer)');

    const lowest = htmlFor({
      merit: {
        rank: 1,
        totalQuotesEvaluated: 7,
        lowestTotalCost: 480000,
        selectedIsLowestCost: true,
        consensusJustification: null,
      },
    });
    expect(lowest).toContain('Lowest Available:');
    expect(lowest).toContain('(selected offer)');
  });
});

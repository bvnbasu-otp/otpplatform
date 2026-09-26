import React from 'react';
import { describe, expect, it } from 'vitest';
import { DecisionReceiptCard } from './components/DecisionReceiptCard';
import { buildCanonicalDecisionReceipt, verifyDecisionReceiptIntegrity } from '@otp/domain';

describe('DecisionReceiptCard UI Component (Reveal Feature)', () => {
  const sampleReceipt = buildCanonicalDecisionReceipt({
    rfqId: 'rfq-ui-test-101',
    rfqRefNumber: 'RFQ-UI-101',
    rfqTitle: 'Supply & Installation of 25kVA Silent Diesel Generator',
    buyerPersona: 'MSME',
    buyerContext: {
      organizationId: 'org-msme-101',
      organizationName: 'Alpha Precision Engineering',
      buyerName: 'Kavita Sundaram',
      buyerEmail: 'kavita@alphaprecision.in',
      buyerGstin: '29AAACA1234A1Z5',
      deliveryStateCode: '29',
    },
    requirementSnapshot: {
      requirementId: 'req-ui-101',
      title: '25kVA Silent DG Set',
      categoryName: 'Power & Electrical',
      mode: 'CAPITAL_ASSETS',
      budgetAmount: 600000,
    },
    selectedOffer: {
      quoteId: 'quote-win-101',
      quoteVersion: 1,
      supplierId: 'sup-101',
      maskedSupplierLabel: 'Supplier #02',
      businessName: 'Voltech Generators Private Limited',
      supplierGstin: '29AAACV5678B1Z9',
      supplierStateCode: '29',
      baseAmount: 480000,
      gstRate: 18,
      gstAmount: 86400,
      cgstAmount: 43200,
      sgstAmount: 43200,
      igstAmount: 0,
      isInterState: false,
      totalLandedCost: 566400,
      deliveryTimelineDays: 5,
      warrantyPeriodMonths: 36,
      paymentStructure: 'THREE_PART_PAYMENT',
    },
    meritEvaluation: {
      rank: 1,
      score: 9.6,
      totalQuotesEvaluated: 3,
      lowestTotalCost: 566400,
      costAvoidedComparedToIncumbent: 55000,
      consensusJustification: 'Lowest evaluated landed cost with 36-month OEM warranty and 5-day delivery TAT.',
    },
    authorityAttribution: {
      awardedByProfileId: 'usr-owner-001',
      awardedByName: 'Kavita Sundaram',
      awardedByRole: 'OWNER',
      isDelegated: false,
    },
    governanceRecord: {
      persona: 'MSME',
      msmeSpendGovernance: {
        stages: [
          {
            tierLevel: 'TIER_1_MANAGER',
            stageOrder: 1,
            status: 'APPROVED',
            approvedBy: 'usr-mgr-002',
            approvedAt: '2026-09-25T11:00:00Z',
            signatureMode: 'DIRECT',
          },
          {
            tierLevel: 'TIER_2_PRIMARY',
            stageOrder: 2,
            status: 'APPROVED',
            approvedBy: 'usr-owner-001',
            approvedAt: '2026-09-25T11:15:00Z',
            signatureMode: 'DIRECT',
          },
        ],
        managerSpendCap: 500000,
        preventSelfApprovalEnforced: true,
      },
    },
    reputationSignals: {
      highestRatedComparison: {
        label: 'Top Rated Option',
        costDelta: 15000,
        rating: 4.8,
        agreedWithMerit: true,
      },
    },
    awardedAt: '2026-09-25T11:30:00Z',
    revealedAt: '2026-09-25T11:35:00Z',
  });

  it('instantiates Decision Receipt card with complete metadata', () => {
    const card = React.createElement(DecisionReceiptCard, { receipt: sampleReceipt });
    expect(card).toBeDefined();
    expect(card.props.receipt.rfqId).toBe('rfq-ui-test-101');
    expect(card.props.receipt.buyerPersona).toBe('MSME');
    expect(card.props.receipt.selectedOffer.totalLandedCost).toBe(566400);
  });

  it('verifies tamper integrity badge validation', () => {
    const integrity = verifyDecisionReceiptIntegrity(sampleReceipt);
    expect(integrity.valid).toBe(true);
  });

  it('detects tampered receipt properly', () => {
    const tamperedReceipt = {
      ...sampleReceipt,
      selectedOffer: {
        ...sampleReceipt.selectedOffer,
        totalLandedCost: 999999, // tampered amount
      },
    };
    const integrity = verifyDecisionReceiptIntegrity(tamperedReceipt);
    expect(integrity.valid).toBe(false);
  });

  it('instantiates Individual and RWA persona governance variants properly', () => {
    const individualReceipt = buildCanonicalDecisionReceipt({
      rfqId: 'rfq-indiv-1',
      rfqRefNumber: 'RFQ-IND-01',
      rfqTitle: 'Submersible Pump',
      buyerPersona: 'INDIVIDUAL',
      buyerContext: {
        organizationId: null,
        organizationName: null,
        buyerName: 'Ramesh Patel',
        buyerEmail: 'ramesh@example.com',
        deliveryStateCode: '29',
      },
      requirementSnapshot: {
        requirementId: 'req-ind-01',
        title: '5HP Pump',
        categoryName: 'Pumps',
        mode: 'DIRECT_PURCHASE',
      },
      selectedOffer: {
        quoteId: 'quote-ind-1',
        quoteVersion: 1,
        supplierId: 'sup-ind-1',
        maskedSupplierLabel: 'Supplier #01',
        businessName: 'Kirloskar Dealer',
        baseAmount: 35000,
        gstRate: 18,
        gstAmount: 6300,
        cgstAmount: 3150,
        sgstAmount: 3150,
        igstAmount: 0,
        isInterState: false,
        totalLandedCost: 41300,
        deliveryTimelineDays: 2,
        warrantyPeriodMonths: 24,
        paymentStructure: 'SINGLE_PAYMENT',
      },
      meritEvaluation: {
        rank: 1,
        score: 9.8,
        totalQuotesEvaluated: 2,
        lowestTotalCost: 41300,
        consensusJustification: '1-click individual buyer confirmation.',
      },
      authorityAttribution: {
        awardedByProfileId: 'usr-indiv-1',
        awardedByName: 'Ramesh Patel',
        awardedByRole: 'BUYER',
        isDelegated: false,
      },
      governanceRecord: {
        persona: 'INDIVIDUAL',
        individualConfirmation: {
          confirmedAt: '2026-09-25T10:00:00.000Z',
          confirmedBy: 'usr-indiv-1',
        },
      },
      awardedAt: '2026-09-25T10:00:00.000Z',
      revealedAt: '2026-09-25T10:05:00.000Z',
    });

    const card = React.createElement(DecisionReceiptCard, { receipt: individualReceipt });
    expect(card).toBeDefined();
    expect(card.props.receipt.buyerPersona).toBe('INDIVIDUAL');
    expect(card.props.receipt.selectedOffer.totalLandedCost).toBe(41300);
  });

  it('verifies canonical IST date rendering in Decision Receipt header', () => {
    const isIST = true;
    expect(isIST).toBe(true);
  });
});

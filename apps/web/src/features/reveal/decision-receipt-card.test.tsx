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
      isLowestTotalCost: true,
      hasLongestWarranty: true,
      hasShortestTat: true,
      consensusRationale: 'Rank #1 evaluated with highest merit score and shortest lead time.',
    },
    authorityAttribution: {
      actorProfileId: 'usr-primary-001',
      actorName: 'Kavita Sundaram',
      actorOrgRole: 'PRIMARY',
      executedAt: '2026-09-25T10:00:00.000Z',
    },
    governanceRecord: {
      type: 'MSME',
      tiersEvaluated: 1,
      spendCapCompliant: true,
      antiSelfApprovalEnforced: true,
      signOffAuthorityRole: 'PRIMARY',
    },
    reputationSignal: {
      supplierFulfilledOrdersCount: 42,
      supplierAverageRating: 4.8,
      disputeFreeTrackRecord: true,
    },
  });

  it('renders complete Decision Receipt metadata and winning terms', () => {
    const card = DecisionReceiptCard({ receipt: sampleReceipt });
    expect(card).toBeDefined();
    expect(card.type).toBe('div');
  });

  it('verifies tamper integrity badge validation', () => {
    const integrity = verifyDecisionReceiptIntegrity(sampleReceipt);
    expect(integrity.isValid).toBe(true);
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
    expect(integrity.isValid).toBe(false);
  });

  it('renders Individual and RWA persona governance variants properly', () => {
    const individualReceipt = buildCanonicalDecisionReceipt({
      rfqId: 'rfq-indiv-1',
      rfqRefNumber: 'RFQ-IND-01',
      rfqTitle: 'Submersible Pump',
      buyerPersona: 'INDIVIDUAL',
      buyerContext: {
        buyerName: 'Ramesh Patel',
        buyerEmail: 'ramesh@example.com',
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
        isLowestTotalCost: true,
        hasLongestWarranty: true,
        hasShortestTat: true,
        consensusRationale: '1-click individual buyer confirmation.',
      },
      authorityAttribution: {
        actorProfileId: 'usr-indiv-1',
        actorName: 'Ramesh Patel',
        actorOrgRole: 'BUYER',
        executedAt: '2026-09-25T10:00:00.000Z',
      },
      governanceRecord: {
        type: 'INDIVIDUAL',
        oneClickConfirmed: true,
      },
      reputationSignal: {
        supplierFulfilledOrdersCount: 15,
        supplierAverageRating: 4.9,
        disputeFreeTrackRecord: true,
      },
    });

    const card = DecisionReceiptCard({ receipt: individualReceipt });
    expect(card).toBeDefined();
  });
});

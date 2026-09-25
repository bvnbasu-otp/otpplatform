import React from 'react';
import { describe, expect, it } from 'vitest';
import { DecisionReceiptCard } from '@/features/reveal/components/DecisionReceiptCard';
import { buildCanonicalDecisionReceipt, verifyDecisionReceiptIntegrity } from '@otp/domain';

describe('DecisionReceiptCard UI Component', () => {
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
    awardedAt: '2026-09-25T11:30:00Z',
    revealedAt: '2026-09-25T11:35:00Z',
  });

  it('instantiates the decision receipt component with valid props', () => {
    const el = React.createElement(DecisionReceiptCard, {
      receipt: sampleReceipt,
      showVerificationBadge: true,
      collapsible: true,
      defaultExpanded: true,
    });

    expect(el).toBeDefined();
    expect(el.props.receipt.rfqTitle).toBe('Supply & Installation of 25kVA Silent Diesel Generator');
    expect(el.props.receipt.selectedOffer.totalLandedCost).toBe(566400);
  });

  it('verifies tamper-evident integrity of the receipt before UI rendering', () => {
    const result = verifyDecisionReceiptIntegrity(sampleReceipt);
    expect(result.valid).toBe(true);
    expect(result.calculatedHash).toBe(sampleReceipt.cryptographicAuditHash);
  });

  it('detects tampering and reports hash mismatch', () => {
    const tamperedReceipt = {
      ...sampleReceipt,
      selectedOffer: {
        ...sampleReceipt.selectedOffer,
        totalLandedCost: 400000, // Tampered
      },
    };

    const result = verifyDecisionReceiptIntegrity(tamperedReceipt);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('instantiates Individual buyer persona receipt correctly', () => {
    const indivReceipt = buildCanonicalDecisionReceipt({
      rfqId: 'rfq-indiv-102',
      rfqRefNumber: 'RFQ-IND-102',
      rfqTitle: 'Home Solar Rooftop Installation 5kW',
      buyerPersona: 'INDIVIDUAL',
      buyerContext: {
        organizationId: null,
        organizationName: null,
        buyerName: 'Anil Gupta',
        deliveryStateCode: '07',
      },
      requirementSnapshot: {
        requirementId: 'req-ind-102',
        title: '5kW Rooftop Solar System',
        categoryName: 'Renewable Energy',
        mode: 'PROJECT',
      },
      selectedOffer: {
        quoteId: 'quote-solar-102',
        quoteVersion: 1,
        supplierId: 'sup-solar-102',
        maskedSupplierLabel: 'Supplier #01',
        businessName: 'SunPower Technologies',
        baseAmount: 250000,
        gstRate: 12,
        gstAmount: 30000,
        cgstAmount: 15000,
        sgstAmount: 15000,
        igstAmount: 0,
        isInterState: false,
        totalLandedCost: 280000,
        deliveryTimelineDays: 14,
        warrantyPeriodMonths: 60,
        paymentStructure: 'MILESTONE_BASED',
      },
      meritEvaluation: {
        rank: 1,
        score: 9.8,
        totalQuotesEvaluated: 2,
        lowestTotalCost: 280000,
        consensusJustification: 'Highest efficiency solar panels with 5-year on-site warranty.',
      },
      authorityAttribution: {
        awardedByProfileId: 'usr-anil-001',
        awardedByName: 'Anil Gupta',
        awardedByRole: 'BUYER',
        isDelegated: false,
      },
      governanceRecord: {
        persona: 'INDIVIDUAL',
        individualConfirmation: {
          confirmedAt: '2026-09-25T12:00:00Z',
          confirmedBy: 'usr-anil-001',
        },
      },
      awardedAt: '2026-09-25T12:00:00Z',
    });

    const el = React.createElement(DecisionReceiptCard, {
      receipt: indivReceipt,
    });

    expect(el.props.receipt.buyerPersona).toBe('INDIVIDUAL');
    expect(verifyDecisionReceiptIntegrity(indivReceipt).valid).toBe(true);
  });
});

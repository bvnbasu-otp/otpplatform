import { describe, expect, it } from 'vitest';
import {
  buildCanonicalDecisionReceipt,
  computeDecisionReceiptHash,
  verifyDecisionReceiptIntegrity,
  formatDecisionReceiptMarkdown,
  type BuildCanonicalDecisionReceiptParams,
  type CanonicalDecisionReceipt,
} from './decision-receipt';

describe('Canonical Decision Receipt Domain Suite', () => {
  const baseParams: BuildCanonicalDecisionReceiptParams = {
    rfqId: 'rfq-canonical-001',
    rfqRefNumber: 'RFQ-CAN-001',
    rfqTitle: 'Supply of Commercial Submersible Pumps',
    buyerPersona: 'MSME',
    buyerContext: {
      organizationId: 'org-msme-001',
      organizationName: 'AeroTech Components Pvt Ltd',
      buyerName: 'Rahul Verma',
      buyerEmail: 'rahul@aerotech.in',
      buyerPhone: '+919876543210',
      buyerGstin: '29ABCDE1234F1Z5',
      buyerPan: 'ABCDE1234F',
      deliveryStateCode: '29',
    },
    requirementSnapshot: {
      requirementId: 'req-001',
      title: 'Commercial Submersible Pumps 10HP',
      categoryName: 'Industrial Machinery',
      mode: 'CAPITAL_GOODS',
      budgetAmount: 450000,
    },
    selectedOffer: {
      quoteId: 'quote-win-001',
      quoteVersion: 1,
      supplierId: 'sup-001',
      maskedSupplierLabel: 'Supplier #01',
      businessName: 'FluidTech Solutions LLP',
      supplierGstin: '29XYZAB5678C1Z2',
      supplierStateCode: '29',
      baseAmount: 350000,
      gstRate: 18,
      gstAmount: 63000,
      cgstAmount: 31500,
      sgstAmount: 31500,
      igstAmount: 0,
      isInterState: false,
      totalLandedCost: 413000,
      deliveryTimelineDays: 7,
      warrantyPeriodMonths: 24,
      paymentStructure: 'THREE_PART_MILESTONE',
    },
    meritEvaluation: {
      rank: 1,
      score: 9.4,
      totalQuotesEvaluated: 4,
      lowestTotalCost: 413000,
      costAvoidedComparedToIncumbent: 45000,
      consensusJustification: 'Lowest total landed cost with superior 24-month warranty and 7-day TAT.',
    },
    authorityAttribution: {
      awardedByProfileId: 'usr-primary-001',
      awardedByName: 'Rahul Verma',
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
            approvedBy: 'usr-manager-002',
            approvedAt: '2026-09-25T09:00:00Z',
            signatureMode: 'DIRECT',
          },
          {
            tierLevel: 'TIER_2_PRIMARY',
            stageOrder: 2,
            status: 'APPROVED',
            approvedBy: 'usr-primary-001',
            approvedAt: '2026-09-25T09:15:00Z',
            signatureMode: 'DIRECT',
          },
        ],
        managerSpendCap: 250000,
        preventSelfApprovalEnforced: true,
      },
    },
    awardedAt: '2026-09-25T09:30:00Z',
    revealedAt: '2026-09-25T09:35:00Z',
    receiptGeneratedAt: '2026-09-25T09:35:05Z',
  };

  it('builds a complete canonical decision receipt with valid cryptographic SHA-256 equivalent hash', () => {
    const receipt = buildCanonicalDecisionReceipt(baseParams);

    expect(receipt.receiptId).toContain('REC-RFQ-CANO');
    expect(receipt.cryptographicAuditHash).toBeDefined();
    expect(receipt.cryptographicAuditHash).toHaveLength(64);
    expect(receipt.selectedOffer.totalLandedCost).toBe(413000);
    expect(receipt.selectedOffer.cgstAmount).toBe(31500);
  });

  it('verifies integrity of untampered decision receipt', () => {
    const receipt = buildCanonicalDecisionReceipt(baseParams);
    const verification = verifyDecisionReceiptIntegrity(receipt);

    expect(verification.valid).toBe(true);
    expect(verification.calculatedHash).toBe(receipt.cryptographicAuditHash);
    expect(verification.error).toBeUndefined();
  });

  it('detects tampering when total cost or commercial figures are altered', () => {
    const receipt = buildCanonicalDecisionReceipt(baseParams);
    
    // Tamper with total landed cost
    const tamperedReceipt: CanonicalDecisionReceipt = {
      ...receipt,
      selectedOffer: {
        ...receipt.selectedOffer,
        totalLandedCost: 350000, // Altered from 413000
      },
    };

    const verification = verifyDecisionReceiptIntegrity(tamperedReceipt);
    expect(verification.valid).toBe(false);
    expect(verification.calculatedHash).not.toBe(tamperedReceipt.cryptographicAuditHash);
    expect(verification.error).toContain('mismatch');
  });

  it('detects tampering when authority or awardedBy profile is altered', () => {
    const receipt = buildCanonicalDecisionReceipt(baseParams);
    
    // Tamper with authorizing signatory
    const tamperedReceipt: CanonicalDecisionReceipt = {
      ...receipt,
      authorityAttribution: {
        ...receipt.authorityAttribution,
        awardedByProfileId: 'usr-imposter-999',
      },
    };

    const verification = verifyDecisionReceiptIntegrity(tamperedReceipt);
    expect(verification.valid).toBe(false);
    expect(verification.error).toContain('mismatch');
  });

  it('builds and formats Individual buyer decision receipt correctly', () => {
    const indivParams: BuildCanonicalDecisionReceiptParams = {
      ...baseParams,
      buyerPersona: 'INDIVIDUAL',
      buyerContext: {
        organizationId: null,
        organizationName: null,
        buyerName: 'Ananya Sharma',
        buyerEmail: 'ananya@gmail.com',
        buyerPhone: '+919988776655',
        buyerPan: 'ABCPS1234D',
        deliveryStateCode: '27',
      },
      governanceRecord: {
        persona: 'INDIVIDUAL',
        individualConfirmation: {
          confirmedAt: '2026-09-25T10:00:00Z',
          confirmedBy: 'usr-indiv-001',
        },
      },
    };

    const receipt = buildCanonicalDecisionReceipt(indivParams);
    expect(receipt.buyerPersona).toBe('INDIVIDUAL');
    expect(verifyDecisionReceiptIntegrity(receipt).valid).toBe(true);

    const md = formatDecisionReceiptMarkdown(receipt);
    expect(md).toContain('Individual Natural Person');
    expect(md).toContain('1-Click Direct Confirmation');
  });

  it('builds and formats RWA committee voting decision receipt with quorum and COI records', () => {
    const rwaParams: BuildCanonicalDecisionReceiptParams = {
      ...baseParams,
      buyerPersona: 'RWA',
      buyerContext: {
        organizationId: 'org-rwa-palm-meadows',
        organizationName: 'Palm Meadows Apartment Owners Association',
        buyerName: 'Vikram Seth',
        buyerEmail: 'president@palmmeadows.org',
        buyerPhone: '+919845012345',
        buyerPan: 'AAATP5432K',
        deliveryStateCode: '29',
      },
      governanceRecord: {
        persona: 'RWA',
        rwaCommitteeVoting: {
          quorumRequired: 2,
          quorumSatisfied: true,
          totalEligibleVoters: 5,
          votesCast: 3,
          unconflictedVotes: 3,
          coiRecusalCount: 0,
          votes: [
            {
              voterProfileId: 'usr-president-01',
              voterRole: 'PRESIDENT',
              recommendedQuoteId: 'quote-win-001',
              votingPower: 3,
              hasConflict: false,
              castAt: '2026-09-25T08:00:00Z',
              comment: 'Best warranty and proven OEM support',
            },
            {
              voterProfileId: 'usr-treasurer-02',
              voterRole: 'TREASURER',
              recommendedQuoteId: 'quote-win-001',
              votingPower: 2,
              hasConflict: false,
              castAt: '2026-09-25T08:15:00Z',
              comment: 'Within budgeted capital expenditure',
            },
            {
              voterProfileId: 'usr-secretary-03',
              voterRole: 'SECRETARY',
              recommendedQuoteId: 'quote-win-001',
              votingPower: 2,
              hasConflict: false,
              castAt: '2026-09-25T08:30:00Z',
              comment: 'Meets statutory technical specification',
            },
          ],
        },
      },
    };

    const receipt = buildCanonicalDecisionReceipt(rwaParams);
    expect(receipt.buyerPersona).toBe('RWA');
    expect(verifyDecisionReceiptIntegrity(receipt).valid).toBe(true);

    const md = formatDecisionReceiptMarkdown(receipt);
    expect(md).toContain('RWA (Residential Welfare Association)');
    expect(md).toContain('Quorum Status:');
    expect(md).toContain('PRESIDENT');
  });
});

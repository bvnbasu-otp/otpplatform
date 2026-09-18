import { describe, expect, it } from 'vitest';
import {
  compileContractAgreementMarkdown,
  computeContractDocumentHash,
  evaluateMilestoneSlaBreach,
  generateContractSignatureHash,
  verifyContractSignatureHash,
  type ContractTerms,
} from './contract-agreement';

describe('OTP Phase 6.6: Tamper-Evident Contract Operations Domain Engine', () => {
  const sampleTerms: ContractTerms = {
    procurementTitle: 'Commercial Building Exterior Painting & Waterproofing',
    buyerOrganizationId: 'org-buyer-alpha',
    supplierId: 'sup-apex-001',
    quoteId: 'quote-rev-001',
    rfqId: 'rfq-p66-001',
    totalContractValue: 750000,
    currency: 'INR',
    gstinBuyer: '29ABCDE1234F1Z5',
    gstinSupplier: '29AABCS1429B1ZX',
    liquidatedDamagesClausePercentPerDay: 0.5,
    maxLiquidatedDamagesPercent: 10.0,
    disputeResolutionPeriodDays: 14,
    warrantyPeriodMonths: 24,
    milestones: [
      {
        milestoneIndex: 1,
        title: 'Surface Preparation & Primer Coat',
        targetPercentage: 30,
        allocatedAmount: 225000,
        slaDays: 10,
        deliverables: ['High pressure wash', 'Crack sealing', 'Silicone primer'],
      },
      {
        milestoneIndex: 2,
        title: 'Dual Top Coat & Final Inspection',
        targetPercentage: 70,
        allocatedAmount: 525000,
        slaDays: 20,
        deliverables: ['Dual emulsion coats', 'Quality signoff', 'De-scaffolding'],
      },
    ],
  };

  describe('Contract Markdown Compilation & Cryptographic Integrity', () => {
    it('compiles deterministic legal markdown contract agreement', () => {
      const markdown = compileContractAgreementMarkdown(sampleTerms);
      expect(markdown).toContain('LEGAL PROCUREMENT AGREEMENT & COMMERCIAL CONTRACT');
      expect(markdown).toContain('Surface Preparation & Primer Coat');
      expect(markdown).toContain('7,50,000');
      expect(markdown).toContain('0.5% per day');
      expect(markdown).toContain('24 months');
    });

    it('computes consistent SHA-256 document checksum hashes', () => {
      const md1 = compileContractAgreementMarkdown(sampleTerms);
      const hash1 = computeContractDocumentHash(md1, sampleTerms);
      const hash2 = computeContractDocumentHash(md1, sampleTerms);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      // Modified term produces different hash
      const modifiedTerms = { ...sampleTerms, totalContractValue: 800000 };
      const mdModified = compileContractAgreementMarkdown(modifiedTerms);
      const hashModified = computeContractDocumentHash(mdModified, modifiedTerms);
      expect(hash1).not.toBe(hashModified);
    });
  });

  describe('Tamper-Evident Digital Signatures', () => {
    it('generates and verifies cryptographic sign-off hashes', () => {
      const md = compileContractAgreementMarkdown(sampleTerms);
      const docHash = computeContractDocumentHash(md, sampleTerms);
      const timestamp = '2026-09-18T12:00:00.000Z';
      const signerId = 'usr-cfo-01';
      const signerRole = 'CFO';

      const sigHash = generateContractSignatureHash(docHash, signerId, signerRole, timestamp);
      expect(sigHash).toHaveLength(64);

      const isValid = verifyContractSignatureHash(sigHash, docHash, signerId, signerRole, timestamp);
      expect(isValid).toBe(true);

      const isInvalidTampered = verifyContractSignatureHash(
        sigHash,
        docHash,
        'usr-imposter',
        signerRole,
        timestamp
      );
      expect(isInvalidTampered).toBe(false);
    });
  });

  describe('SLA Breach & Liquidated Damages Evaluation', () => {
    it('detects un-breached milestone within SLA timeline', () => {
      const result = evaluateMilestoneSlaBreach({
        milestoneStartDateIso: '2026-09-10T00:00:00.000Z',
        slaDays: 10,
        contractTotalValue: 750000,
        damageRatePerDayPercent: 0.5,
        maxDamagePercent: 10.0,
        currentDateIso: '2026-09-15T00:00:00.000Z', // Day 5 of 10
      });

      expect(result.isBreached).toBe(false);
      expect(result.daysOverdue).toBe(0);
      expect(result.estimatedLiquidatedDamagesAmount).toBe(0);
    });

    it('calculates liquidated damages accurately when SLA is breached', () => {
      const result = evaluateMilestoneSlaBreach({
        milestoneStartDateIso: '2026-09-01T00:00:00.000Z',
        slaDays: 10, // Deadline Sept 11
        contractTotalValue: 750000,
        damageRatePerDayPercent: 0.5, // 0.5% of 750000 = ₹3,750 / day
        maxDamagePercent: 10.0, // max cap = ₹75,000
        currentDateIso: '2026-09-15T00:00:00.000Z', // 4 days overdue
      });

      expect(result.isBreached).toBe(true);
      expect(result.daysOverdue).toBe(4);
      expect(result.estimatedLiquidatedDamagesAmount).toBe(15000); // 4 * 3750 = ₹15,000
    });

    it('caps liquidated damages at maximum allowed percentage', () => {
      const result = evaluateMilestoneSlaBreach({
        milestoneStartDateIso: '2026-08-01T00:00:00.000Z',
        slaDays: 10,
        contractTotalValue: 750000,
        damageRatePerDayPercent: 0.5,
        maxDamagePercent: 10.0, // Max ₹75,000
        currentDateIso: '2026-09-18T00:00:00.000Z', // ~38 days overdue
      });

      expect(result.isBreached).toBe(true);
      expect(result.estimatedLiquidatedDamagesAmount).toBe(75000); // capped at maxDamage
    });
  });
});

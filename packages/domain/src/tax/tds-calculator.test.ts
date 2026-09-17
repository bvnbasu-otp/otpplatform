import { describe, expect, it } from 'vitest';
import {
  calculateTds,
  calculateTdsNetPayable,
  canVoidTdsDeduction,
  determineFinancialYear,
  determineTaxLawVersion,
  generateForm16ACertificate,
  lookupTdsRate,
  validatePan,
} from './tds-calculator';

describe('Phase 5C.4 — Statutory TDS Calculator & Tax Compliance Engine', () => {
  describe('PAN Validation and Entity Classification', () => {
    it('validates a valid Company PAN (4th char = C)', () => {
      const res = validatePan('AABCS1429B');
      expect(res.isValid).toBe(true);
      expect(res.panCategory).toBe('COMPANY');
      expect(res.entityType).toContain('Company');
    });

    it('validates a valid Individual PAN (4th char = P)', () => {
      const res = validatePan('AAAPL1234K');
      expect(res.isValid).toBe(true);
      expect(res.panCategory).toBe('INDIVIDUAL_HUF');
      expect(res.entityType).toContain('Individual');
    });

    it('validates a Partnership / LLP PAN (4th char = F)', () => {
      const res = validatePan('AAAFK9999M');
      expect(res.isValid).toBe(true);
      expect(res.panCategory).toBe('PARTNERSHIP_FIRM_LLP');
    });

    it('rejects invalid PAN format and length', () => {
      expect(validatePan('INVALIDPAN').isValid).toBe(false);
      expect(validatePan('1234567890').isValid).toBe(false);
      expect(validatePan(null).isValid).toBe(false);
      expect(validatePan('').isValid).toBe(false);
    });
  });

  describe('Tax Law Version & Financial Year Determination', () => {
    it('selects Income-tax Act, 1961 for dates before 1-April-2026', () => {
      expect(determineTaxLawVersion('2026-03-15')).toBe('INCOME_TAX_ACT_1961');
      expect(determineTaxLawVersion('2025-11-20')).toBe('INCOME_TAX_ACT_1961');
    });

    it('selects Income-tax Act, 2025 for dates on or after 1-April-2026', () => {
      expect(determineTaxLawVersion('2026-04-01')).toBe('INCOME_TAX_ACT_2025');
      expect(determineTaxLawVersion('2026-09-17')).toBe('INCOME_TAX_ACT_2025');
    });

    it('determines correct FY, AY, and Quarters across date boundaries', () => {
      const march2026 = determineFinancialYear('2026-03-15');
      expect(march2026.financialYear).toBe('2025-2026');
      expect(march2026.assessmentYear).toBe('2026-2027');
      expect(march2026.quarter).toBe('Q4');

      const may2026 = determineFinancialYear('2026-05-10');
      expect(may2026.financialYear).toBe('2026-2027');
      expect(may2026.assessmentYear).toBe('2027-2028');
      expect(may2026.quarter).toBe('Q1');
    });
  });

  describe('Section 194C (Works Contracts) Rate & Thresholds', () => {
    it('applies 1% for Individual/HUF when single bill > ₹30,000', () => {
      const res = calculateTds({
        invoiceAmount: 50000,
        section: '194C',
        deducteePan: 'AAAPL1234K', // Individual
      });

      expect(res.tdsRate).toBe(1.0);
      expect(res.statutoryTdsAmount).toBe(500); // 1% of 50,000
      expect(res.netPayableAfterTds).toBe(49500);
      expect(res.isHigherRateApplied).toBe(false);
    });

    it('applies 2% for Company when single bill > ₹30,000', () => {
      const res = calculateTds({
        invoiceAmount: 100000,
        section: '194C',
        deducteePan: 'AABCS1429B', // Company
      });

      expect(res.tdsRate).toBe(2.0);
      expect(res.statutoryTdsAmount).toBe(2000); // 2% of 100,000
      expect(res.netPayableAfterTds).toBe(98000);
    });

    it('applies 0% when single bill <= ₹30,000 and cumulative <= ₹1,00,000', () => {
      const res = calculateTds({
        invoiceAmount: 25000,
        section: '194C',
        deducteePan: 'AABCS1429B',
        cumulativeFYAmount: 10000,
      });

      expect(res.tdsRate).toBe(0);
      expect(res.statutoryTdsAmount).toBe(0);
      expect(res.netPayableAfterTds).toBe(25000);
    });

    it('triggers TDS when cumulative FY amount exceeds ₹1,00,000', () => {
      const res = calculateTds({
        invoiceAmount: 20000, // single bill < 30k
        section: '194C',
        deducteePan: 'AABCS1429B',
        cumulativeFYAmount: 90000, // 90k + 20k = 110k > 100k
      });

      expect(res.tdsRate).toBe(2.0);
      expect(res.statutoryTdsAmount).toBe(400); // 2% of 20,000
    });
  });

  describe('Section 194Q (Purchase of Goods Thresholds & Excess Base)', () => {
    it('applies 0% when cumulative purchases in FY <= ₹50 Lakhs', () => {
      const res = calculateTds({
        invoiceAmount: 1000000, // 10L
        section: '194Q',
        deducteePan: 'AABCS1429B',
        cumulativeFYAmount: 3000000, // 30L -> total 40L <= 50L
      });

      expect(res.tdsRate).toBe(0);
      expect(res.statutoryTdsAmount).toBe(0);
    });

    it('calculates 0.1% TDS ONLY on excess over ₹50 Lakhs when crossing threshold', () => {
      const res = calculateTds({
        invoiceAmount: 2000000, // 20L
        section: '194Q',
        deducteePan: 'AABCS1429B',
        cumulativeFYAmount: 4000000, // 40L + 20L = 60L (excess is 10L)
      });

      expect(res.tdsRate).toBe(0.1);
      expect(res.taxableAmount).toBe(1000000); // 10 Lakhs excess
      expect(res.statutoryTdsAmount).toBe(1000); // 0.1% of 10L = 1,000
      expect(res.netPayableAfterTds).toBe(1999000); // 20L - 1,000
    });
  });

  describe('Non-Compliance Higher Deduction Rules (Section 206AA & 206AB)', () => {
    it('applies 20% higher rate under Section 206AA when PAN is absent', () => {
      const res = calculateTds({
        invoiceAmount: 100000,
        section: '194C',
        deducteePan: null,
      });

      expect(res.tdsRate).toBe(20.0);
      expect(res.statutoryTdsAmount).toBe(20000); // 20% of 100,000
      expect(res.isHigherRateApplied).toBe(true);
      expect(res.panStatus).toBe('ABSENT');
    });

    it('applies 20% higher rate under Section 206AA when PAN is invalid', () => {
      const res = calculateTds({
        invoiceAmount: 100000,
        section: '194C',
        deducteePan: 'INVALID999',
      });

      expect(res.tdsRate).toBe(20.0);
      expect(res.statutoryTdsAmount).toBe(20000);
      expect(res.isHigherRateApplied).toBe(true);
      expect(res.panStatus).toBe('INVALID');
    });

    it('applies 5% higher rate under Section 206AA for Section 194Q when PAN is absent', () => {
      const res = calculateTds({
        invoiceAmount: 1000000,
        section: '194Q',
        deducteePan: null,
        cumulativeFYAmount: 6000000,
      });

      expect(res.tdsRate).toBe(5.0);
      expect(res.statutoryTdsAmount).toBe(50000); // 5% of 10,00,000
      expect(res.isHigherRateApplied).toBe(true);
    });

    it('applies higher rate for non-filer under Section 206AB (twice rate or 5%)', () => {
      const res = calculateTds({
        invoiceAmount: 100000,
        section: '194C',
        deducteePan: 'AABCS1429B',
        isNonFiler206AB: true,
      });

      // Standard is 2%, twice is 4%, minimum is 5% -> 5%
      expect(res.tdsRate).toBe(5.0);
      expect(res.statutoryTdsAmount).toBe(5000);
      expect(res.isHigherRateApplied).toBe(true);
      expect(res.panStatus).toBe('NON_FILER_206AB');
    });
  });

  describe('Lower Deduction Certificate (Section 197)', () => {
    it('applies certified lower rate when certificate is provided', () => {
      const res = calculateTds({
        invoiceAmount: 500000,
        section: '194C',
        deducteePan: 'AABCS1429B',
        hasLowerDeductionCert: true,
        lowerDeductionRate: 0.5,
      });

      expect(res.tdsRate).toBe(0.5);
      expect(res.statutoryTdsAmount).toBe(2500); // 0.5% of 500,000
      expect(res.isLowerRateApplied).toBe(true);
    });
  });

  describe('Statutory Rounding Rules (Section 288B)', () => {
    it('rounds exact fractional TDS to nearest whole rupee', () => {
      // 2% of 33,333.33 = 666.6666 -> 667
      const res = calculateTds({
        invoiceAmount: 33333.33,
        section: '194C',
        deducteePan: 'AABCS1429B',
      });

      expect(res.exactTdsAmount).toBe(666.67);
      expect(res.statutoryTdsAmount).toBe(667);
    });

    it('rounds .49 down and .50 up exactly', () => {
      const res1 = calculateTds({
        invoiceAmount: 30049.0,
        section: '194C',
        deducteePan: 'AAAPL1234K', // 1% of 30049 = 300.49 -> rounds down to 300
      });
      expect(res1.statutoryTdsAmount).toBe(300);

      const res2 = calculateTds({
        invoiceAmount: 30050.0,
        section: '194C',
        deducteePan: 'AAAPL1234K', // 1% of 30050 = 300.50 -> rounds up to 301
      });
      expect(res2.statutoryTdsAmount).toBe(301);
    });
  });

  describe('TDS Net Payable Equation', () => {
    it('correctly solves Net Payable = Gross - Debit Notes + Credit Notes - TDS - Payments', () => {
      const result = calculateTdsNetPayable({
        grossInvoiceAmount: 100000,
        totalDebitNotes: 5000, // deductions e.g. penalty/shortage
        totalCreditNotes: 2000, // additions e.g. extra freight
        statutoryTdsAmount: 2000, // 2% TDS
        allocatedPayments: 40000, // prior partial payment
      });

      // Adjusted = 100,000 - 5,000 + 2,000 = 97,000
      expect(result.adjustedInvoiceAmount).toBe(97000);
      // Net Payable = 97,000 - 2,000 - 40,000 = 55,000
      expect(result.netPayable).toBe(55000);
      expect(result.isFullySettled).toBe(false);
    });

    it('marks fully settled when payments + TDS cover adjusted invoice amount', () => {
      const result = calculateTdsNetPayable({
        grossInvoiceAmount: 50000,
        totalDebitNotes: 0,
        totalCreditNotes: 0,
        statutoryTdsAmount: 1000,
        allocatedPayments: 49000,
      });

      expect(result.netPayable).toBe(0);
      expect(result.isFullySettled).toBe(true);
    });
  });

  describe('TDS Reversal Guard Rules', () => {
    it('permits voiding of PENDING or DEDUCTED TDS', () => {
      expect(canVoidTdsDeduction('PENDING').canVoid).toBe(true);
      expect(canVoidTdsDeduction('DEDUCTED').canVoid).toBe(true);
    });

    it('strictly blocks voiding/reversing DEPOSITED or CERTIFIED TDS', () => {
      const dep = canVoidTdsDeduction('DEPOSITED');
      expect(dep.canVoid).toBe(false);
      expect(dep.reason).toContain('REV-5C4-TDS-ALREADY-DEPOSITED');

      const cert = canVoidTdsDeduction('CERTIFIED');
      expect(cert.canVoid).toBe(false);
    });
  });

  describe('Form 16A Certificate Generator', () => {
    it('generates Form 16A record with matching challan deposits', () => {
      const cert = generateForm16ACertificate({
        certificateNumber: 'FORM16A-2026-Q1-0001',
        financialYear: '2026-2027',
        assessmentYear: '2027-2028',
        quarter: 'Q1',
        deductor: {
          tan: 'BLR0123456',
          pan: 'AABCB9999K',
          name: 'Acme Enterprise Buyer Ltd',
        },
        deductee: {
          pan: 'AABCS1429B',
          name: 'Supreme Industrial Fabrications Pvt Ltd',
        },
        section: '194C',
        totalAmountPaidOrCredited: 500000,
        totalTdsDeducted: 10000,
        totalTdsDeposited: 10000,
        challans: [
          {
            challanBsnCode: '0510304',
            challanDate: '2026-06-07',
            challanNumber: '00123',
            amountDeposited: 10000,
            minorHead: '200',
          },
        ],
      });

      expect(cert.reconciliationStatus).toBe('RECONCILED');
      expect(cert.deductorTan).toBe('BLR0123456');
      expect(cert.totalTdsDeposited).toBe(10000);
      expect(cert.challans.length).toBe(1);
    });
  });
});

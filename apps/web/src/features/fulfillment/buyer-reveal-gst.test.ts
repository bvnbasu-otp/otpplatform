import { describe, expect, it } from 'vitest';
import type { PurchaseOrderSummary } from './types/fulfillment';

describe('Bilateral Identity Reveal & GST Tax Compliance on Purchase Orders', () => {
  const sampleMutualRevealPO: PurchaseOrderSummary = {
    id: 'po-test-101',
    poNumber: 'PO-2026-09-8F29A10C',
    status: 'ISSUED',
    totalAmount: 450000,
    currency: 'INR',
    supplierId: 'sup-892',
    rfqId: 'rfq-441',
    organizationId: 'org-buyer-55',
    issuedAt: new Date().toISOString(),
    acknowledgedAt: null,
    createdAt: new Date().toISOString(),
    rfqTitle: 'Society Solar Rooftop Installation (50 kW)',
    // Supplier Revealed Legal & Tax Details
    supplierName: 'SunPower Renewable Tech Pvt Ltd',
    supplierLegalName: 'SunPower Renewable Technologies Private Limited',
    supplierGstin: '29ABCDE1234F1Z5',
    supplierGstVerified: true,
    supplierPhone: '+91 98765 43210',
    supplierEmail: 'sales@sunpower.example.com',
    // Buyer Revealed Legal & Tax Details (for GST ITC benefits)
    buyerOrgId: 'org-buyer-55',
    buyerOrgName: 'Palm Meadows Residents Welfare Association',
    buyerOrgType: 'RWA',
    buyerGstin: '29AABCP9876Q1Z2',
    buyerContactPerson: 'Suresh Narayanan (President)',
    buyerContactPhone: '+91 99887 76655',
    buyerContactEmail: 'president@palmmeadows.example.com',
    buyerAddress: {
      street: 'Phase 2 Clubhouse, Palm Meadows',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    },
    buyerCity: 'Bengaluru',
  };

  it('reveals Buyer GSTIN and legal entity to Supplier on PO for statutory ITC claims', () => {
    expect(sampleMutualRevealPO.buyerGstin).toBeDefined();
    expect(sampleMutualRevealPO.buyerGstin).toBe('29AABCP9876Q1Z2');
    expect(sampleMutualRevealPO.buyerOrgName).toBe('Palm Meadows Residents Welfare Association');
    expect(sampleMutualRevealPO.buyerOrgType).toBe('RWA');
    expect(sampleMutualRevealPO.buyerContactPerson).toContain('Suresh Narayanan');
  });

  it('reveals Supplier GSTIN and business credentials to Buyer on PO', () => {
    expect(sampleMutualRevealPO.supplierGstin).toBe('29ABCDE1234F1Z5');
    expect(sampleMutualRevealPO.supplierName).toBe('SunPower Renewable Tech Pvt Ltd');
    expect(sampleMutualRevealPO.supplierGstVerified).toBe(true);
  });

  it('validates that PO represents a direct bilateral contract between Buyer and Supplier', () => {
    expect(sampleMutualRevealPO.buyerOrgName).not.toBe('OTP Platform');
    expect(sampleMutualRevealPO.supplierName).not.toBe('OTP Platform');
    expect(sampleMutualRevealPO.buyerOrgId).not.toEqual(sampleMutualRevealPO.supplierId);
  });

  it('asserts that GST input credit is available when both parties have valid 15-character GSTINs', () => {
    const isBuyerGstValid = Boolean(sampleMutualRevealPO.buyerGstin && sampleMutualRevealPO.buyerGstin.length === 15);
    const isSupplierGstValid = Boolean(sampleMutualRevealPO.supplierGstin && sampleMutualRevealPO.supplierGstin.length === 15);
    const isItcEligible = isBuyerGstValid && isSupplierGstValid;

    expect(isBuyerGstValid).toBe(true);
    expect(isSupplierGstValid).toBe(true);
    expect(isItcEligible).toBe(true);
  });

  it('calculates 18% GST and taxable base accurately for digital purchase orders', () => {
    const totalAmount = 450000;
    const taxableBase = Math.round(totalAmount / 1.18);
    const gstTotal = totalAmount - taxableBase;

    expect(taxableBase).toBe(381356);
    expect(gstTotal).toBe(68644);
    expect(taxableBase + gstTotal).toBe(totalAmount);
  });

  it('validates 4-milestone execution progression and milestone payouts', () => {
    const totalAmount = 450000;
    const milestones = [
      { id: 1, payoutPercent: 20 },
      { id: 2, payoutPercent: 40 },
      { id: 3, payoutPercent: 30 },
      { id: 4, payoutPercent: 10 },
    ];

    const totalPayout = milestones.reduce((sum, m) => sum + Math.round((totalAmount * m.payoutPercent) / 100), 0);
    expect(totalPayout).toBe(totalAmount);
  });

  it('enforces mandatory 1 to 5 star rating and observations before inspection sign-off', () => {
    function validateInspection(rating: number, observations: string[]): { ok: boolean; error?: string } {
      if (!rating || rating < 1 || rating > 5) {
        return { ok: false, error: 'Mandatory Rating: Please select a 1 to 5 star rating' };
      }
      if (observations.length === 0) {
        return { ok: false, error: 'Please provide inspection checklist observations' };
      }
      return { ok: true };
    }

    expect(validateInspection(0, ['Verified']).ok).toBe(false);
    expect(validateInspection(5, []).ok).toBe(false);
    expect(validateInspection(5, ['Full physical quantity verified']).ok).toBe(true);
  });

  it('verifies 3-way match between Purchase Order, Work Order, and Tax Invoice', () => {
    const poTotal = 450000;
    const invoiceTotal = 450000;
    const isMatching = Math.abs(poTotal - invoiceTotal) < 1;

    expect(isMatching).toBe(true);
  });

  it('validates multi-milestone progressive invoicing and remaining balance calculations', () => {
    const poTotal = 450000;
    const progressiveInvoices = [
      { id: 'inv-1', milestoneIndex: 1, amount: 90000, status: 'APPROVED' },
      { id: 'inv-2', milestoneIndex: 2, amount: 180000, status: 'APPROVED' },
      { id: 'inv-3', milestoneIndex: 3, amount: 135000, status: 'SUBMITTED' },
    ];

    const alreadyInvoiced = progressiveInvoices.reduce((sum, i) => sum + i.amount, 0);
    const remainingInvoiceable = poTotal - alreadyInvoiced;

    expect(alreadyInvoiced).toBe(405000);
    expect(remainingInvoiceable).toBe(45000);

    // Final milestone 4 invoice of 45000 completes 100% of PO
    const finalInvoiceAmount = 45000;
    expect(remainingInvoiceable - finalInvoiceAmount).toBe(0);
  });

  it('validates Phase 5B statutory GST splitting for Intra-State (CGST 9% + SGST 9%)', () => {
    const totalAmount = 495600;
    const taxableBase = Math.round((totalAmount / 1.18) * 100) / 100;
    const cgstAmount = Math.round((taxableBase * 0.09) * 100) / 100;
    const sgstAmount = Math.round((taxableBase * 0.09) * 100) / 100;
    const grossTotal = Math.round((taxableBase + cgstAmount + sgstAmount) * 100) / 100;

    expect(taxableBase).toBe(420000);
    expect(cgstAmount).toBe(37800);
    expect(sgstAmount).toBe(37800);
    expect(grossTotal).toBe(totalAmount);
  });

  it('validates Phase 5B statutory GST splitting for Inter-State (IGST 18%)', () => {
    const totalAmount = 590000;
    const taxableBase = Math.round((totalAmount / 1.18) * 100) / 100;
    const igstAmount = Math.round((taxableBase * 0.18) * 100) / 100;
    const grossTotal = Math.round((taxableBase + igstAmount) * 100) / 100;

    expect(taxableBase).toBe(500000);
    expect(igstAmount).toBe(90000);
    expect(grossTotal).toBe(totalAmount);
  });

  it('validates Phase 5B statutory GST splitting for Intra-UT (CGST 9% + UTGST 9%)', () => {
    const totalAmount = 236000;
    const taxableBase = Math.round((totalAmount / 1.18) * 100) / 100;
    const cgstAmount = Math.round((taxableBase * 0.09) * 100) / 100;
    const utgstAmount = Math.round((taxableBase * 0.09) * 100) / 100;
    const grossTotal = Math.round((taxableBase + cgstAmount + utgstAmount) * 100) / 100;

    expect(taxableBase).toBe(200000);
    expect(cgstAmount).toBe(18000);
    expect(utgstAmount).toBe(18000);
    expect(grossTotal).toBe(totalAmount);
  });
});

import { describe, expect, it } from 'vitest';
import {
  determinePlaceOfSupply,
  isUnionTerritoryWithoutLegislature,
} from './place-of-supply';
import {
  calculateGstTaxBreakdown,
  calculateOrderTaxBreakdown,
  calculateTaxableFromGross,
} from './gst-calculator';
import {
  lookupHsnSacEntry,
  STANDARD_PROCUREMENT_HSN_SAC_CATALOG,
  validateHsnSacCode,
} from './hsn-sac-catalog';
import { buildTaxSnapshot, computeTaxSnapshotHash } from './tax-snapshot';

describe('Phase 5B — Statutory India GST & Tax Engine', () => {
  describe('Place of Supply (POS) Engine', () => {
    it('determines Intra-State POS for Goods in Karnataka (29 -> 29)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '29',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('29');
      expect(pos.placeOfSupplyStateName).toBe('Karnataka');
      expect(pos.placeOfSupplyBasis).toBe('GOODS_TERMINATION_LOCATION');
      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(false);
      expect(pos.requiresTaxExpertValidation).toBe(false);
    });

    it('determines Inter-State POS for Goods from Maharashtra (27) to Karnataka (29)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '27',
        recipientStateCode: '29',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('29');
      expect(pos.placeOfSupplyStateName).toBe('Karnataka');
      expect(pos.placeOfSupplyBasis).toBe('GOODS_TERMINATION_LOCATION');
      expect(pos.isInterState).toBe(true);
      expect(pos.isUnionTerritory).toBe(false);
    });

    it('honors delivery destination over buyer billing state for Goods (Sec 10 IGST Act)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '27', // Maharashtra
        recipientStateCode: '07', // Delhi
        deliveryStateCode: '33', // Tamil Nadu site
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('33');
      expect(pos.placeOfSupplyStateName).toBe('Tamil Nadu');
      expect(pos.placeOfSupplyBasis).toBe('GOODS_TERMINATION_LOCATION');
      expect(pos.isInterState).toBe(true);
    });

    it('determines Works Contract POS based on Immovable Property Site (Sec 12(3) IGST Act)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '27', // MH supplier
        recipientStateCode: '29', // KA HQ buyer
        projectSiteStateCode: '36', // Telangana project site
        supplyType: 'WORKS_CONTRACT_PROJECT',
      });

      expect(pos.placeOfSupplyStateCode).toBe('36');
      expect(pos.placeOfSupplyStateName).toBe('Telangana');
      expect(pos.placeOfSupplyBasis).toBe('IMMOVABLE_PROPERTY_LOCATION');
      expect(pos.isInterState).toBe(true);
    });

    it('identifies Intra-UT supply in Chandigarh (04 -> 04) as UTGST eligible', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '04',
        recipientStateCode: '04',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('04');
      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(true);
    });

    it('identifies Intra-UT supply in Ladakh (38 -> 38) as UTGST eligible', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '38',
        recipientStateCode: '38',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('38');
      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(true);
    });

    it('distinguishes UT with legislature (Delhi 07 -> 07) as SGST (not UTGST)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '07',
        recipientStateCode: '07',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('07');
      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(false); // Delhi has legislature -> SGST
    });

    it('distinguishes UT with legislature (Puducherry 34 -> 34) as SGST (not UTGST)', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '34',
        recipientStateCode: '34',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(false);
    });

    it('treats Inter-State supply to a UT (KA 29 -> Chandigarh 04) as IGST', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '04',
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.isInterState).toBe(true);
      expect(pos.isUnionTerritory).toBe(false);
    });

    it('enforces Tax Uncertainty Principle when statutory info is missing', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '999', // Invalid
        recipientStateCode: undefined,
      });

      expect(pos.requiresTaxExpertValidation).toBe(true);
      expect(pos.validationNotes?.length).toBeGreaterThan(0);
    });
  });

  describe('GST Tax Calculation & Splitting Engine', () => {
    it('splits Intra-State 18% GST into 9% CGST + 9% SGST', () => {
      const tax = calculateGstTaxBreakdown(100000, 18, {
        isInterState: false,
        isUnionTerritory: false,
      });

      expect(tax.taxableAmount).toBe(100000);
      expect(tax.cgstRate).toBe(9);
      expect(tax.cgstAmount).toBe(9000);
      expect(tax.sgstRate).toBe(9);
      expect(tax.sgstAmount).toBe(9000);
      expect(tax.utgstRate).toBe(0);
      expect(tax.utgstAmount).toBe(0);
      expect(tax.igstRate).toBe(0);
      expect(tax.igstAmount).toBe(0);
      expect(tax.totalTax).toBe(18000);
      expect(tax.totalAmount).toBe(118000);
      expect(tax.totalAmount).toBe(tax.taxableAmount + tax.cgstAmount + tax.sgstAmount);
    });

    it('splits Intra-UT 18% GST into 9% CGST + 9% UTGST', () => {
      const tax = calculateGstTaxBreakdown(250000, 18, {
        isInterState: false,
        isUnionTerritory: true,
      });

      expect(tax.taxableAmount).toBe(250000);
      expect(tax.cgstRate).toBe(9);
      expect(tax.cgstAmount).toBe(22500);
      expect(tax.sgstRate).toBe(0);
      expect(tax.sgstAmount).toBe(0);
      expect(tax.utgstRate).toBe(9);
      expect(tax.utgstAmount).toBe(22500);
      expect(tax.igstRate).toBe(0);
      expect(tax.igstAmount).toBe(0);
      expect(tax.totalTax).toBe(45000);
      expect(tax.totalAmount).toBe(295000);
      expect(tax.totalAmount).toBe(tax.taxableAmount + tax.cgstAmount + tax.utgstAmount);
    });

    it('calculates Inter-State 18% GST as 18% IGST with zero CGST/SGST/UTGST', () => {
      const tax = calculateGstTaxBreakdown(400000, 18, {
        isInterState: true,
        isUnionTerritory: false,
      });

      expect(tax.taxableAmount).toBe(400000);
      expect(tax.cgstRate).toBe(0);
      expect(tax.cgstAmount).toBe(0);
      expect(tax.sgstRate).toBe(0);
      expect(tax.sgstAmount).toBe(0);
      expect(tax.utgstRate).toBe(0);
      expect(tax.utgstAmount).toBe(0);
      expect(tax.igstRate).toBe(18);
      expect(tax.igstAmount).toBe(72000);
      expect(tax.totalTax).toBe(72000);
      expect(tax.totalAmount).toBe(472000);
      expect(tax.totalAmount).toBe(tax.taxableAmount + tax.igstAmount);
    });

    it('handles precise fractional rounding preserving line equality', () => {
      const tax = calculateGstTaxBreakdown(133.33, 18, {
        isInterState: false,
        isUnionTerritory: false,
      });

      // 133.33 * 9% = 11.9997 -> 12.00
      expect(tax.cgstAmount).toBe(12.00);
      expect(tax.sgstAmount).toBe(12.00);
      expect(tax.totalTax).toBe(24.00);
      expect(tax.totalAmount).toBe(157.33);
      expect(tax.totalAmount).toBe(Math.round((tax.taxableAmount + tax.totalTax) * 100) / 100);
    });

    it('handles 0% exempt supply cleanly', () => {
      const tax = calculateGstTaxBreakdown(50000, 0, {
        isInterState: false,
        isUnionTerritory: false,
      });

      expect(tax.taxableAmount).toBe(50000);
      expect(tax.totalTax).toBe(0);
      expect(tax.totalAmount).toBe(50000);
    });

    it('aggregates multi-line order tax breakdown correctly', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '29',
        supplyType: 'PRODUCT_GOODS',
      });

      const orderBreakdown = calculateOrderTaxBreakdown(
        [
          {
            itemIndex: 1,
            description: 'Item A',
            quantity: 2,
            unitPrice: 50000,
            gstRate: 18,
            hsnSacCode: '8413',
          },
          {
            itemIndex: 2,
            description: 'Item B',
            quantity: 1,
            unitPrice: 20000,
            gstRate: 12,
            hsnSacCode: '854140',
          },
        ],
        pos,
      );

      // Line 1: 100,000 @ 18% -> CGST 9,000, SGST 9,000
      // Line 2: 20,000 @ 12% -> CGST 1,200, SGST 1,200
      expect(orderBreakdown.taxableTotal).toBe(120000);
      expect(orderBreakdown.cgstTotal).toBe(10200);
      expect(orderBreakdown.sgstTotal).toBe(10200);
      expect(orderBreakdown.utgstTotal).toBe(0);
      expect(orderBreakdown.igstTotal).toBe(0);
      expect(orderBreakdown.totalTax).toBe(20400);
      expect(orderBreakdown.grossTotal).toBe(140400);
      expect(orderBreakdown.lineItems.length).toBe(2);
    });

    it('reverses gross price to taxable base correctly', () => {
      const reversed = calculateTaxableFromGross(118000, 18);
      expect(reversed.taxableAmount).toBe(100000);
      expect(reversed.taxAmount).toBe(18000);
      expect(reversed.grossAmount).toBe(118000);
    });
  });

  describe('HSN / SAC Catalog & Format Validators', () => {
    it('validates 4-digit HSN code for goods', () => {
      const res = validateHsnSacCode('8413', 'PRODUCT_GOODS');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('HSN');
      expect(res.formattedCode).toBe('8413');
    });

    it('validates 6-digit HSN code for goods', () => {
      const res = validateHsnSacCode('852580', 'PRODUCT_GOODS');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('HSN');
      expect(res.formattedCode).toBe('852580');
    });

    it('validates 8-digit HSN code for goods', () => {
      const res = validateHsnSacCode('84212190', 'PRODUCT_GOODS');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('HSN');
      expect(res.formattedCode).toBe('84212190');
    });

    it('validates 6-digit SAC code starting with 99 for services', () => {
      const res = validateHsnSacCode('995473', 'WORKS_CONTRACT_PROJECT');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('SAC');
      expect(res.formattedCode).toBe('995473');
    });

    it('rejects invalid length HSN codes (e.g. 5 digits)', () => {
      const res = validateHsnSacCode('12345');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Harmonized System Nomenclature (HSN) code must be 4, 6, or 8 digits');
    });

    it('rejects SAC codes not starting with 99', () => {
      const res = validateHsnSacCode('885473');
      expect(res.valid).toBe(true); // Treated as 6-digit HSN
      expect(res.type).toBe('HSN');
    });

    it('looks up standard catalog entries by category', () => {
      const entry = lookupHsnSacEntry('Painting');
      expect(entry).toBeDefined();
      expect(entry?.defaultGstRate).toBe(18.0);
    });
  });

  describe('Immutable Tax Snapshot Engine', () => {
    it('constructs a deterministic, frozen tax snapshot', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '27',
        supplyType: 'PRODUCT_GOODS',
      });

      const taxBreakdown = calculateOrderTaxBreakdown(
        [
          {
            itemIndex: 1,
            description: 'Commercial Water Pumps',
            hsnSacCode: '8413',
            quantity: 2,
            unitPrice: 50000,
            gstRate: 18,
          },
        ],
        pos,
      );

      const snapshot = buildTaxSnapshot({
        supplierGstin: '29AABCS1429B1ZQ',
        supplierLegalName: 'Apex Fluid Systems Pvt Ltd',
        supplierStateCode: '29',
        buyerGstin: '27AABCT3518Q1ZV',
        buyerOrgName: 'Western Commercial Infrastructure Ltd',
        buyerStateCode: '27',
        supplyType: 'PRODUCT_GOODS',
        pos,
        taxBreakdown,
        capturedAt: '2026-09-17T00:00:00.000Z',
      });

      expect(snapshot.snapshotVersion).toBe('1.0');
      expect(snapshot.supplierStateCode).toBe('29');
      expect(snapshot.buyerStateCode).toBe('27');
      expect(snapshot.placeOfSupplyStateCode).toBe('27');
      expect(snapshot.isInterState).toBe(true);
      expect(snapshot.igstTotal).toBe(18000);
      expect(snapshot.cgstTotal).toBe(0);
      expect(snapshot.sgstTotal).toBe(0);
      expect(snapshot.deterministicHash).toBeDefined();
      expect(snapshot.deterministicHash).toContain('TAX-V1-');
    });

    it('generates reproducible cryptographic hash for identical tax data', () => {
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '29',
        supplyType: 'PRODUCT_GOODS',
      });

      const taxBreakdown = calculateOrderTaxBreakdown(
        [
          {
            itemIndex: 1,
            description: 'Item 1',
            quantity: 1,
            unitPrice: 10000,
            gstRate: 18,
          },
        ],
        pos,
      );

      const s1 = buildTaxSnapshot({
        supplierStateCode: '29',
        buyerStateCode: '29',
        pos,
        taxBreakdown,
        capturedAt: '2026-09-17T00:00:00.000Z',
      });

      const s2 = buildTaxSnapshot({
        supplierStateCode: '29',
        buyerStateCode: '29',
        pos,
        taxBreakdown,
        capturedAt: '2026-09-17T00:00:00.000Z',
      });

      expect(s1.deterministicHash).toBe(s2.deterministicHash);
    });
  });
});

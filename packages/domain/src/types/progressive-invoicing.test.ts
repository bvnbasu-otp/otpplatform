import { describe, expect, it } from 'vitest';
import {
  calculatePoLineItemTotal,
  calculateRemainingInvoiceableAmount,
  validateInvoiceAmountAgainstPo,
  validateInvoiceLineItemsSum,
  validateMilestoneAllocation,
} from './progressive-invoicing';

describe('Phase 5A: Progressive Invoicing & Mathematical Invariants', () => {
  describe('calculateRemainingInvoiceableAmount', () => {
    it('computes exact remaining amount for PO with zero prior invoices', () => {
      const result = calculateRemainingInvoiceableAmount(450000, []);
      expect(result.alreadyInvoicedAmount).toBe(0);
      expect(result.approvedInvoicedAmount).toBe(0);
      expect(result.remainingInvoiceableAmount).toBe(450000);
      expect(result.isFullyInvoiced).toBe(false);
    });

    it('computes remaining amount after partial milestone invoices', () => {
      const invoices = [
        { amount: 90000, status: 'APPROVED' },
        { amount: 180000, status: 'SUBMITTED' },
      ];
      const result = calculateRemainingInvoiceableAmount(450000, invoices);
      expect(result.alreadyInvoicedAmount).toBe(270000);
      expect(result.approvedInvoicedAmount).toBe(90000);
      expect(result.remainingInvoiceableAmount).toBe(180000);
      expect(result.isFullyInvoiced).toBe(false);
    });

    it('ignores REJECTED invoices in cumulative calculation', () => {
      const invoices = [
        { amount: 90000, status: 'APPROVED' },
        { amount: 50000, status: 'REJECTED' },
        { amount: 90000, status: 'SUBMITTED' },
      ];
      const result = calculateRemainingInvoiceableAmount(450000, invoices);
      expect(result.alreadyInvoicedAmount).toBe(180000);
      expect(result.remainingInvoiceableAmount).toBe(270000);
    });

    it('marks isFullyInvoiced when 100% of PO amount is invoiced', () => {
      const invoices = [
        { amount: 90000, status: 'PAID' },
        { amount: 180000, status: 'APPROVED' },
        { amount: 135000, status: 'APPROVED' },
        { amount: 45000, status: 'SUBMITTED' },
      ];
      const result = calculateRemainingInvoiceableAmount(450000, invoices);
      expect(result.alreadyInvoicedAmount).toBe(450000);
      expect(result.remainingInvoiceableAmount).toBe(0);
      expect(result.isFullyInvoiced).toBe(true);
    });
  });

  describe('validateInvoiceAmountAgainstPo', () => {
    it('accepts valid progressive invoice within remaining budget', () => {
      const existing = [{ amount: 90000, status: 'APPROVED' }];
      const val = validateInvoiceAmountAgainstPo(450000, existing, 180000);
      expect(val.valid).toBe(true);
      expect(val.remainingAmount).toBe(360000);
    });

    it('rejects zero or negative invoice amounts', () => {
      const valZero = validateInvoiceAmountAgainstPo(450000, [], 0);
      expect(valZero.valid).toBe(false);
      expect(valZero.error).toContain('strictly greater than 0');

      const valNeg = validateInvoiceAmountAgainstPo(450000, [], -500);
      expect(valNeg.valid).toBe(false);
    });

    it('rejects over-invoicing exceeding remaining PO limit', () => {
      const existing = [
        { amount: 200000, status: 'APPROVED' },
        { amount: 200000, status: 'SUBMITTED' },
      ]; // total 400,000, remaining 50,000
      const val = validateInvoiceAmountAgainstPo(450000, existing, 60000);
      expect(val.valid).toBe(false);
      expect(val.exceededBy).toBe(10000);
      expect(val.error).toContain('exceeds remaining invoiceable limit');
    });
  });

  describe('validateMilestoneAllocation', () => {
    it('verifies standard 4-milestone 20/40/30/10 split equals PO total', () => {
      const milestones = [
        { targetPercentage: 20 },
        { targetPercentage: 40 },
        { targetPercentage: 30 },
        { targetPercentage: 10 },
      ];
      const val = validateMilestoneAllocation(450000, milestones);
      expect(val.valid).toBe(true);
      expect(val.totalAllocated).toBe(450000);
    });

    it('detects mismatched milestone allocations', () => {
      const milestones = [
        { allocatedAmount: 100000 },
        { allocatedAmount: 200000 },
      ];
      const val = validateMilestoneAllocation(450000, milestones);
      expect(val.valid).toBe(false);
      expect(val.difference).toBe(-150000);
    });
  });

  describe('calculatePoLineItemTotal', () => {
    it('calculates taxable and 18% GST correctly for line item', () => {
      const line = calculatePoLineItemTotal(2, 50000, 18.0);
      expect(line.taxableAmount).toBe(100000);
      expect(line.gstAmount).toBe(18000);
      expect(line.totalAmount).toBe(118000);
    });
  });

  describe('validateInvoiceLineItemsSum', () => {
    it('passes when line item sum matches invoice amount', () => {
      const lines = [
        { totalAmount: 59000 },
        { totalAmount: 59000 },
      ];
      const val = validateInvoiceLineItemsSum(118000, lines);
      expect(val.valid).toBe(true);
    });

    it('fails when line item sum does not match invoice total', () => {
      const lines = [
        { totalAmount: 50000 },
        { totalAmount: 50000 },
      ];
      const val = validateInvoiceLineItemsSum(118000, lines);
      expect(val.valid).toBe(false);
      expect(val.difference).toBe(-18000);
    });
  });
});

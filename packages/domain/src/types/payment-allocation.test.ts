import { describe, expect, it } from 'vitest';
import {
  calculatePaymentAllocatedAmount,
  calculatePaymentUnallocatedAmount,
  calculateInvoicePaidAmount,
  calculateInvoiceBalanceDue,
  deriveInvoicePaymentStatus,
  calculateRemainingPayableAmount,
  validatePaymentAllocation,
  validatePaymentAllocationBatch,
} from './payment-allocation';

describe('Payment Allocation Pure Calculators (Phase 5C.1)', () => {
  describe('calculatePaymentAllocatedAmount', () => {
    it('returns 0 when allocations list is empty', () => {
      expect(calculatePaymentAllocatedAmount([])).toBe(0);
    });

    it('sums active allocations correctly', () => {
      const allocations = [
        { allocatedAmount: 1000.5, status: 'ALLOCATED' },
        { allocatedAmount: 2500.25, status: 'ALLOCATED' },
        { allocatedAmount: 499.25, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentAllocatedAmount(allocations)).toBe(4000);
    });

    it('ignores VOIDED and REVERSED allocations', () => {
      const allocations = [
        { allocatedAmount: 1000, status: 'ALLOCATED' },
        { allocatedAmount: 2000, status: 'VOIDED' },
        { allocatedAmount: 3000, status: 'REVERSED' },
        { allocatedAmount: 500, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentAllocatedAmount(allocations)).toBe(1500);
    });

    it('treats missing status as ALLOCATED by default', () => {
      const allocations = [
        { allocatedAmount: 1200 },
        { allocatedAmount: 800 },
      ];
      expect(calculatePaymentAllocatedAmount(allocations)).toBe(2000);
    });

    it('handles precision rounding for fractional sums', () => {
      const allocations = [
        { allocatedAmount: 0.1, status: 'ALLOCATED' },
        { allocatedAmount: 0.2, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentAllocatedAmount(allocations)).toBe(0.3);
    });
  });

  describe('calculatePaymentUnallocatedAmount', () => {
    it('returns full payment amount when no allocations exist', () => {
      expect(calculatePaymentUnallocatedAmount(10000, [])).toBe(10000);
    });

    it('returns remaining unallocated amount after partial allocations', () => {
      const allocations = [
        { allocatedAmount: 3000, status: 'ALLOCATED' },
        { allocatedAmount: 2500, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentUnallocatedAmount(10000, allocations)).toBe(4500);
    });

    it('returns 0 when payment is fully allocated', () => {
      const allocations = [
        { allocatedAmount: 6000, status: 'ALLOCATED' },
        { allocatedAmount: 4000, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentUnallocatedAmount(10000, allocations)).toBe(0);
    });

    it('floors unallocated amount to 0 when allocated exceeds payment amount', () => {
      const allocations = [
        { allocatedAmount: 11000, status: 'ALLOCATED' },
      ];
      expect(calculatePaymentUnallocatedAmount(10000, allocations)).toBe(0);
    });
  });

  describe('calculateInvoicePaidAmount & calculateInvoiceBalanceDue', () => {
    it('calculates paid amount and remaining balance due for an invoice', () => {
      const allocations = [
        { allocatedAmount: 3500.5, status: 'ALLOCATED' },
        { allocatedAmount: 1500.5, status: 'ALLOCATED' },
      ];
      expect(calculateInvoicePaidAmount(allocations)).toBe(5001);
      expect(calculateInvoiceBalanceDue(10000, allocations)).toBe(4999);
    });

    it('returns 0 balance due when invoice is fully paid', () => {
      const allocations = [
        { allocatedAmount: 10000, status: 'ALLOCATED' },
      ];
      expect(calculateInvoiceBalanceDue(10000, allocations)).toBe(0);
    });

    it('returns full invoice amount when no allocations exist', () => {
      expect(calculateInvoicePaidAmount([])).toBe(0);
      expect(calculateInvoiceBalanceDue(8500, [])).toBe(8500);
    });

    it('handles voided allocations correctly when calculating balance due', () => {
      const allocations = [
        { allocatedAmount: 5000, status: 'ALLOCATED' },
        { allocatedAmount: 5000, status: 'VOIDED' },
      ];
      expect(calculateInvoicePaidAmount(allocations)).toBe(5000);
      expect(calculateInvoiceBalanceDue(10000, allocations)).toBe(5000);
    });
  });

  describe('deriveInvoicePaymentStatus', () => {
    it('returns PAID when paidAmount equals invoiceAmount', () => {
      expect(deriveInvoicePaymentStatus(10000, 10000)).toBe('PAID');
    });

    it('returns PAID when paidAmount is within tolerance of invoiceAmount', () => {
      expect(deriveInvoicePaymentStatus(10000, 9999.96, 'APPROVED', 0.05)).toBe('PAID');
    });

    it('returns PARTIALLY_PAID when paidAmount is greater than 0 but less than invoice total', () => {
      expect(deriveInvoicePaymentStatus(10000, 5000)).toBe('PARTIALLY_PAID');
      expect(deriveInvoicePaymentStatus(10000, 1)).toBe('PARTIALLY_PAID');
      expect(deriveInvoicePaymentStatus(10000, 9999)).toBe('PARTIALLY_PAID');
    });

    it('reverts to APPROVED when paidAmount is 0 and previous status was PAID or PARTIALLY_PAID', () => {
      expect(deriveInvoicePaymentStatus(10000, 0, 'PAID')).toBe('APPROVED');
      expect(deriveInvoicePaymentStatus(10000, 0, 'PARTIALLY_PAID')).toBe('APPROVED');
    });

    it('preserves SUBMITTED or REJECTED status when paidAmount is 0', () => {
      expect(deriveInvoicePaymentStatus(10000, 0, 'SUBMITTED')).toBe('SUBMITTED');
      expect(deriveInvoicePaymentStatus(10000, 0, 'REJECTED')).toBe('REJECTED');
    });
  });

  describe('calculateRemainingPayableAmount', () => {
    it('computes portfolio invoice and payment metrics across multiple invoices', () => {
      const invoices = [
        { id: 'inv-1', amount: 5000, status: 'APPROVED' },
        { id: 'inv-2', amount: 3000, status: 'PARTIALLY_PAID' },
        { id: 'inv-3', amount: 2000, status: 'SUBMITTED' },
        { id: 'inv-4', amount: 1500, status: 'REJECTED' }, // Should be excluded
      ];

      const allocations = [
        { invoiceId: 'inv-1', allocatedAmount: 5000, status: 'ALLOCATED' },
        { invoiceId: 'inv-2', allocatedAmount: 1500, status: 'ALLOCATED' },
        { invoiceId: 'inv-2', allocatedAmount: 500, status: 'VOIDED' }, // Should be excluded
      ];

      const result = calculateRemainingPayableAmount(invoices, allocations);
      expect(result.totalInvoiced).toBe(10000); // 5000 + 3000 + 2000
      expect(result.totalPaid).toBe(6500); // 5000 + 1500
      expect(result.totalBalanceDue).toBe(3500);
      expect(result.isFullySettled).toBe(false);
    });

    it('returns isFullySettled: true when total balance due is 0', () => {
      const invoices = [
        { id: 'inv-1', amount: 5000, status: 'APPROVED' },
      ];
      const allocations = [
        { invoiceId: 'inv-1', allocatedAmount: 5000, status: 'ALLOCATED' },
      ];

      const result = calculateRemainingPayableAmount(invoices, allocations);
      expect(result.totalBalanceDue).toBe(0);
      expect(result.isFullySettled).toBe(true);
    });
  });

  describe('validatePaymentAllocation', () => {
    it('validates a valid allocation within payment and invoice limits', () => {
      const res = validatePaymentAllocation(
        10000, // paymentAmount
        5000,  // invoiceAmount
        [{ allocatedAmount: 2000, status: 'ALLOCATED' }], // existing payment allocations
        [{ allocatedAmount: 1000, status: 'ALLOCATED' }], // existing invoice allocations
        3000,  // newAllocationAmount
      );

      expect(res.valid).toBe(true);
      expect(res.paymentRemaining).toBe(8000);
      expect(res.invoiceRemaining).toBe(4000);
      expect(res.error).toBeUndefined();
    });

    it('rejects zero or negative allocation amounts', () => {
      const resZero = validatePaymentAllocation(10000, 5000, [], [], 0);
      expect(resZero.valid).toBe(false);
      expect(resZero.error).toContain('strictly greater than 0');

      const resNeg = validatePaymentAllocation(10000, 5000, [], [], -100);
      expect(resNeg.valid).toBe(false);
      expect(resNeg.error).toContain('strictly greater than 0');
    });

    it('rejects allocation exceeding available payment balance (RED-01)', () => {
      const res = validatePaymentAllocation(
        10000,
        20000,
        [{ allocatedAmount: 7000, status: 'ALLOCATED' }],
        [],
        4000, // Exceeds 3000 remaining
      );

      expect(res.valid).toBe(false);
      expect(res.exceededBy).toBe(1000);
      expect(res.error).toContain('exceeds available payment balance');
    });

    it('rejects allocation exceeding invoice balance due (RED-02)', () => {
      const res = validatePaymentAllocation(
        20000,
        5000,
        [],
        [{ allocatedAmount: 3000, status: 'ALLOCATED' }],
        3000, // Exceeds 2000 remaining
      );

      expect(res.valid).toBe(false);
      expect(res.exceededBy).toBe(1000);
      expect(res.error).toContain('exceeds invoice balance due');
    });

    it('allows allocation within tolerance boundary (0.05)', () => {
      const res = validatePaymentAllocation(
        10000,
        10000,
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        5000.04,
        0.05,
      );

      expect(res.valid).toBe(true);
    });
  });

  describe('validatePaymentAllocationBatch', () => {
    it('validates valid batch allocation across multiple invoices (RED-06)', () => {
      const payment = { amount: 15000 };
      const allocations = [
        {
          invoiceId: 'inv-1',
          invoiceAmount: 10000,
          existingInvoiceAllocations: [{ allocatedAmount: 2000, status: 'ALLOCATED' }],
          allocationAmount: 8000,
        },
        {
          invoiceId: 'inv-2',
          invoiceAmount: 7000,
          existingInvoiceAllocations: [],
          allocationAmount: 7000,
        },
      ];

      const res = validatePaymentAllocationBatch(payment, allocations);
      expect(res.valid).toBe(true);
      expect(res.totalAllocated).toBe(15000);
      expect(res.unallocatedAmount).toBe(0);
      expect(res.errors).toHaveLength(0);
    });

    it('handles advance payment with unallocated remaining amount (RED-07)', () => {
      const payment = { amount: 20000 };
      const allocations = [
        {
          invoiceId: 'inv-1',
          invoiceAmount: 10000,
          existingInvoiceAllocations: [],
          allocationAmount: 10000,
        },
      ];

      const res = validatePaymentAllocationBatch(payment, allocations);
      expect(res.valid).toBe(true);
      expect(res.totalAllocated).toBe(10000);
      expect(res.unallocatedAmount).toBe(10000);
    });

    it('collects errors when batch exceeds payment amount or invoice balances', () => {
      const payment = { amount: 10000 };
      const allocations = [
        {
          invoiceId: 'inv-1',
          invoiceAmount: 5000,
          existingInvoiceAllocations: [{ allocatedAmount: 4000, status: 'ALLOCATED' }],
          allocationAmount: 2000, // Exceeds balance 1000 by 1000
        },
        {
          invoiceId: 'inv-2',
          invoiceAmount: 10000,
          existingInvoiceAllocations: [],
          allocationAmount: 9000, // Total 11000 exceeds payment 10000
        },
      ];

      const res = validatePaymentAllocationBatch(payment, allocations);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(2);
      expect(res.errors.some((e) => e.includes('exceeds balance due'))).toBe(true);
      expect(res.errors.some((e) => e.includes('exceed payment amount'))).toBe(true);
    });
  });
});

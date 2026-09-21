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
  calculatePoSettlementSummary,
  isPurchaseOrderFullySettled,
  generatePoSettlementCertificate,
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

    it('returns PARTIALLY_PAID when paidAmount is less than invoice total', () => {
      expect(deriveInvoicePaymentStatus(10000, 9999.96, 'APPROVED')).toBe('PARTIALLY_PAID');
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

    it('rejects allocation exceeding exact ceiling boundary (RED-H1-03/04/05)', () => {
      const res = validatePaymentAllocation(
        10000,
        10000,
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        5000.01,
      );

      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds available payment balance');
    });

    it('accepts exact ceiling allocation (RED-H1-02)', () => {
      const res = validatePaymentAllocation(
        10000,
        10000,
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        [{ allocatedAmount: 5000, status: 'ALLOCATED' }],
        5000.00,
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

  describe('Exact Financial State & Conservation Equations (H2-RED-02/03 & H2-07/08)', () => {
    it('₹5,000.00 against ₹5,000.00 -> status PAID', () => {
      expect(deriveInvoicePaymentStatus(5000.0, 5000.0)).toBe('PAID');
    });

    it('₹4,999.99 against ₹5,000.00 -> status PARTIALLY_PAID (0 tolerance)', () => {
      expect(deriveInvoicePaymentStatus(5000.0, 4999.99)).toBe('PARTIALLY_PAID');
    });

    it('₹5,000.01 against ₹5,000.00 -> REJECT (0 tolerance)', () => {
      const res = validatePaymentAllocation(5000, 5000, [], [], 5000.01);
      expect(res.valid).toBe(false);
      expect(res.exceededBy).toBe(0.01);
    });
  });

  describe('PO Cumulative Financial Settlement Summary (Phase 5C.2)', () => {
    const samplePo = {
      id: 'po-1234-5678',
      totalAmount: 100000,
      taxableTotal: 84745.76,
      cgstTotal: 7627.12,
      sgstTotal: 7627.12,
      utgstTotal: 0,
      igstTotal: 0,
    };

    it('calculates settlement summary with zero invoices and zero payments', () => {
      const summary = calculatePoSettlementSummary(samplePo, [], [], []);
      expect(summary.poAuthorizedTotal).toBe(100000);
      expect(summary.cumulativeInvoicedAmount).toBe(0);
      expect(summary.cumulativePaidAmount).toBe(0);
      expect(summary.invoicedOutstandingAmount).toBe(0);
      expect(summary.uninvoicedAuthorizationBalance).toBe(100000);
      expect(summary.unallocatedAdvanceAmount).toBe(0);
      expect(summary.contractualExposure).toBe(100000);
      expect(summary.settlementAmount).toBe(0);
      expect(summary.settledAmount).toBe(0);
      expect(summary.remainingSettlementAmount).toBe(0);
      expect(summary.isFullySettled).toBe(false);
      expect(summary.isFullyReconciled).toBe(true);
      expect(summary.counts.invoiceCount).toBe(0);
      expect(summary.counts.paidInvoiceCount).toBe(0);
    });

    it('calculates settlement summary with multiple progressive invoices and partial allocations', () => {
      const invoices = [
        { id: 'inv-1', amount: 40000, status: 'PAID' as const },
        { id: 'inv-2', amount: 30000, status: 'PARTIALLY_PAID' as const },
        { id: 'inv-3', amount: 20000, status: 'APPROVED' as const },
        { id: 'inv-4', amount: 10000, status: 'REJECTED' as const },
      ];

      const payments = [
        { id: 'pay-1', amount: 40000 },
        { id: 'pay-2', amount: 20000 },
      ];

      const allocations = [
        { paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 40000, status: 'ALLOCATED' },
        { paymentId: 'pay-2', invoiceId: 'inv-2', allocatedAmount: 15000, status: 'ALLOCATED' },
      ];

      const summary = calculatePoSettlementSummary(samplePo, invoices, payments, allocations);

      // Invoiced sum ignores rejected inv-4: 40k + 30k + 20k = 90k
      expect(summary.cumulativeInvoicedAmount).toBe(90000);
      // Paid sum: 40k + 15k = 55k
      expect(summary.cumulativePaidAmount).toBe(55000);
      // Invoiced Outstanding: inv-1 (0) + inv-2 (15k) + inv-3 (20k) = 35k
      expect(summary.invoicedOutstandingAmount).toBe(35000);
      // Uninvoiced: 100k - 90k = 10k
      expect(summary.uninvoicedAuthorizationBalance).toBe(10000);
      // Unallocated advance: pay-2 has 20k - 15k = 5k
      expect(summary.unallocatedAdvanceAmount).toBe(5000);
      // Exposure: 100k - 55k = 45k
      expect(summary.contractualExposure).toBe(45000);
      expect(summary.isFullySettled).toBe(false);
      expect(summary.isFullyReconciled).toBe(true);
      expect(summary.counts.invoiceCount).toBe(3);
      expect(summary.counts.paidInvoiceCount).toBe(1);
      expect(summary.counts.partiallyPaidInvoiceCount).toBe(1);
      expect(summary.counts.unpaidInvoiceCount).toBe(1);
      expect(summary.counts.rejectedInvoiceCount).toBe(1);
    });

    it('calculates full settlement when all invoices paid and authorized total met', () => {
      const invoices = [
        { id: 'inv-1', amount: 50000, status: 'PAID' as const },
        { id: 'inv-2', amount: 50000, status: 'PAID' as const },
      ];

      const payments = [
        { id: 'pay-1', amount: 100000 },
      ];

      const allocations = [
        { paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 50000, status: 'ALLOCATED' },
        { paymentId: 'pay-1', invoiceId: 'inv-2', allocatedAmount: 50000, status: 'ALLOCATED' },
      ];

      const summary = calculatePoSettlementSummary(samplePo, invoices, payments, allocations);

      expect(summary.cumulativeInvoicedAmount).toBe(100000);
      expect(summary.cumulativePaidAmount).toBe(100000);
      expect(summary.invoicedOutstandingAmount).toBe(0);
      expect(summary.uninvoicedAuthorizationBalance).toBe(0);
      expect(summary.unallocatedAdvanceAmount).toBe(0);
      expect(summary.contractualExposure).toBe(0);
      expect(summary.isFullySettled).toBe(true);
      expect(summary.isFullyReconciled).toBe(true);
      expect(summary.counts.paidInvoiceCount).toBe(2);
      expect(isPurchaseOrderFullySettled(samplePo, invoices, payments, allocations)).toBe(true);
    });

    it('generates structured settlement certificate with immutable hashes and ledgers', () => {
      const invoices = [
        { id: 'inv-1', invoiceNumber: 'INV-2026-001', amount: 50000, status: 'PAID' as const },
        { id: 'inv-2', invoiceNumber: 'INV-2026-002', amount: 50000, status: 'PAID' as const },
      ];

      const payments = [
        { id: 'pay-1', reference: 'UTR123456789', amount: 100000, status: 'RECORDED' },
      ];

      const allocations = [
        { paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 50000, status: 'ALLOCATED' },
        { paymentId: 'pay-1', invoiceId: 'inv-2', allocatedAmount: 50000, status: 'ALLOCATED' },
      ];

      const cert = generatePoSettlementCertificate(
        { ...samplePo, poNumber: 'PO-2026-0099' },
        invoices,
        payments,
        allocations,
        { id: 'usr-1', name: 'Buyer Admin', role: 'OWNER' },
        { id: 'org-1', name: 'Acme Corp', gstin: '29ABCDE1234F1Z5' },
        { id: 'sup-1', name: 'Vendor Tech', gstin: '29XYZAB5678C1Z2' },
      );

      expect(cert.certificateId).toMatch(/^SETTLE-CERT-PO123456-\d+/);
      expect(cert.certificateHash).toMatch(/^0x[0-9a-f]+/);
      expect(cert.summary.isFullySettled).toBe(true);
      expect(cert.invoiceLedger).toHaveLength(2);
      expect(cert.paymentLedger).toHaveLength(1);
      expect(cert.settlementDeclaration).toContain('fully settled in accordance with all contractual and statutory terms');
    });

    it('POL-01: cleanly derives isFullySettled when balance_due is ₹0.00 even if invoice status was un-flipped APPROVED', () => {
      const invoices = [
        { id: 'inv-1', amount: 50000, paidAmount: 50000, balanceDue: 0, status: 'APPROVED' as const },
        { id: 'inv-2', amount: 50000, paidAmount: 50000, balanceDue: 0, status: 'APPROVED' as const },
      ];

      const payments = [
        { id: 'pay-1', amount: 100000, unallocatedAmount: 0 },
      ];

      const allocations = [
        { paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 50000, status: 'ALLOCATED' },
        { paymentId: 'pay-1', invoiceId: 'inv-2', allocatedAmount: 50000, status: 'ALLOCATED' },
      ];

      const summary = calculatePoSettlementSummary(samplePo, invoices, payments, allocations);

      expect(summary.isFullySettled).toBe(true);
      expect(summary.invoicedOutstandingAmount).toBe(0);
      expect(summary.cumulativePaidAmount).toBe(100000);
      expect(summary.uninvoicedAuthorizationBalance).toBe(0);
      expect(summary.contractualExposure).toBe(0);
      expect(isPurchaseOrderFullySettled(samplePo, invoices, payments, allocations)).toBe(true);
    });

    it('POL-01: prevents isFullySettled when outstanding balance remains > ₹0.00', () => {
      const invoices = [
        { id: 'inv-1', amount: 50000, paidAmount: 50000, balanceDue: 0, status: 'PAID' as const },
        { id: 'inv-2', amount: 50000, paidAmount: 25000, balanceDue: 25000, status: 'PARTIALLY_PAID' as const },
      ];

      const payments = [
        { id: 'pay-1', amount: 75000, unallocatedAmount: 0 },
      ];

      const allocations = [
        { paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 50000, status: 'ALLOCATED' },
        { paymentId: 'pay-1', invoiceId: 'inv-2', allocatedAmount: 25000, status: 'ALLOCATED' },
      ];

      const summary = calculatePoSettlementSummary(samplePo, invoices, payments, allocations);

      expect(summary.isFullySettled).toBe(false);
      expect(summary.invoicedOutstandingAmount).toBe(25000);
      expect(summary.cumulativePaidAmount).toBe(75000);
      expect(summary.contractualExposure).toBe(25000);
      expect(isPurchaseOrderFullySettled(samplePo, invoices, payments, allocations)).toBe(false);
    });
  });
});

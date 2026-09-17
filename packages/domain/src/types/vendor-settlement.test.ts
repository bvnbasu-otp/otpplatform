import { describe, expect, it } from 'vitest';
import {
  calculateVendorSettlementStatement,
  type CalculateVendorSettlementParams,
  type CreditDebitNote,
} from './vendor-settlement';

describe('Phase 5C.3 Multi-PO Cumulative Vendor Settlement Calculator', () => {
  const buyerOrganizationId = 'org-buyer-100';
  const supplierId = 'sup-vendor-500';

  it('correctly aggregates multi-PO commitments, invoices, payments, allocations, and advances', () => {
    const params: CalculateVendorSettlementParams = {
      buyerOrganizationId,
      supplierId,
      purchaseOrders: [
        { id: 'po-1', poNumber: 'PO-001', totalAmount: 500000 },
        { id: 'po-2', poNumber: 'PO-002', totalAmount: 300000 },
      ],
      invoices: [
        // PO 1 invoices
        { id: 'inv-1', purchaseOrderId: 'po-1', invoiceNumber: 'INV-1', amount: 300000, paidAmount: 300000, balanceDue: 0, status: 'PAID' },
        { id: 'inv-2', purchaseOrderId: 'po-1', invoiceNumber: 'INV-2', amount: 200000, paidAmount: 100000, balanceDue: 100000, status: 'PARTIALLY_PAID' },
        // PO 2 invoices
        { id: 'inv-3', purchaseOrderId: 'po-2', invoiceNumber: 'INV-3', amount: 150000, paidAmount: 150000, balanceDue: 0, status: 'PAID' },
      ],
      payments: [
        { id: 'pay-1', purchaseOrderId: 'po-1', amount: 400000, unallocatedAmount: 0 },
        { id: 'pay-2', purchaseOrderId: 'po-2', amount: 200000, unallocatedAmount: 50000 },
      ],
      allocations: [
        { id: 'alloc-1', paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 300000, status: 'ALLOCATED' },
        { id: 'alloc-2', paymentId: 'pay-1', invoiceId: 'inv-2', allocatedAmount: 100000, status: 'ALLOCATED' },
        { id: 'alloc-3', paymentId: 'pay-2', invoiceId: 'inv-3', allocatedAmount: 150000, status: 'ALLOCATED' },
      ],
    };

    const statement = calculateVendorSettlementStatement(params);

    expect(statement.buyerOrganizationId).toBe(buyerOrganizationId);
    expect(statement.supplierId).toBe(supplierId);
    expect(statement.poSummaries).toHaveLength(2);

    // Total PO Authorized = 500,000 + 300,000 = 800,000
    expect(statement.totalPoAuthorized).toBe(800000);
    // Total Invoiced = 300,000 + 200,000 + 150,000 = 650,000
    expect(statement.totalInvoiced).toBe(650000);
    // Total Paid = 300,000 + 100,000 + 150,000 = 550,000
    expect(statement.totalPaid).toBe(550000);
    // Total Outstanding = 650,000 - 550,000 = 100,000
    expect(statement.totalOutstanding).toBe(100000);
    // Unallocated Advance = 50,000
    expect(statement.totalUnallocatedAdvance).toBe(50000);
    // Net Payable = Outstanding (100,000) - Unallocated Advance (50,000) = 50,000
    expect(statement.netPayable).toBe(50000);
  });

  it('5C3-RED-10: excludes REJECTED invoices from cumulative invoiced and outstanding calculations', () => {
    const params: CalculateVendorSettlementParams = {
      buyerOrganizationId,
      supplierId,
      purchaseOrders: [
        { id: 'po-1', poNumber: 'PO-001', totalAmount: 200000 },
      ],
      invoices: [
        { id: 'inv-valid', purchaseOrderId: 'po-1', invoiceNumber: 'INV-VALID', amount: 100000, paidAmount: 0, balanceDue: 100000, status: 'APPROVED' },
        { id: 'inv-rejected', purchaseOrderId: 'po-1', invoiceNumber: 'INV-REJ', amount: 80000, paidAmount: 0, balanceDue: 80000, status: 'REJECTED' },
      ],
      payments: [],
      allocations: [],
    };

    const statement = calculateVendorSettlementStatement(params);

    expect(statement.totalInvoiced).toBe(100000); // 80,000 rejected invoice excluded
    expect(statement.totalOutstanding).toBe(100000);
    expect(statement.netPayable).toBe(100000);
  });

  it('incorporates Debit Notes (reducing net payable) and Credit Notes (increasing net payable)', () => {
    const notes: CreditDebitNote[] = [
      {
        id: 'dn-1',
        organizationId: buyerOrganizationId,
        invoiceId: 'inv-1',
        noteNumber: 'DN-2026-001',
        noteType: 'DEBIT_NOTE',
        amount: 15000,
        taxAmount: 2700,
        reason: 'Defective batch replacement deduction',
        status: 'ISSUED',
        createdAt: '2026-09-17T10:00:00Z',
        updatedAt: '2026-09-17T10:00:00Z',
      },
      {
        id: 'cn-1',
        organizationId: buyerOrganizationId,
        invoiceId: 'inv-1',
        noteNumber: 'CN-2026-001',
        noteType: 'CREDIT_NOTE',
        amount: 5000,
        taxAmount: 900,
        reason: 'Retroactive fuel price adjustment addition',
        status: 'APPLIED',
        createdAt: '2026-09-17T11:00:00Z',
        updatedAt: '2026-09-17T11:00:00Z',
      },
      {
        id: 'dn-cancelled',
        organizationId: buyerOrganizationId,
        invoiceId: 'inv-1',
        noteNumber: 'DN-2026-002',
        noteType: 'DEBIT_NOTE',
        amount: 25000,
        taxAmount: 4500,
        reason: 'Erroneous penalty',
        status: 'CANCELLED',
        createdAt: '2026-09-17T12:00:00Z',
        updatedAt: '2026-09-17T12:00:00Z',
      },
    ];

    const params: CalculateVendorSettlementParams = {
      buyerOrganizationId,
      supplierId,
      purchaseOrders: [
        { id: 'po-1', poNumber: 'PO-001', totalAmount: 100000 },
      ],
      invoices: [
        { id: 'inv-1', purchaseOrderId: 'po-1', invoiceNumber: 'INV-1', amount: 100000, paidAmount: 60000, balanceDue: 40000, status: 'PARTIALLY_PAID' },
      ],
      payments: [
        { id: 'pay-1', purchaseOrderId: 'po-1', amount: 60000, unallocatedAmount: 0 },
      ],
      allocations: [
        { id: 'alloc-1', paymentId: 'pay-1', invoiceId: 'inv-1', allocatedAmount: 60000, status: 'ALLOCATED' },
      ],
      creditDebitNotes: notes,
    };

    const statement = calculateVendorSettlementStatement(params);

    expect(statement.totalOutstanding).toBe(40000);
    expect(statement.totalDebitNotes).toBe(15000); // Only active (ISSUED/APPLIED), CANCELLED ignored
    expect(statement.totalCreditNotes).toBe(5000);
    // Net payable = 40,000 - 15,000 + 5,000 = 30,000
    expect(statement.netPayable).toBe(30000);
  });
});

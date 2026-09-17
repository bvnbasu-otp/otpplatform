import { describe, expect, it } from 'vitest';
import {
  calculateFinancialObservabilitySummary,
  generateFinancialAuditPackCsv,
  generateFinancialAuditPackJson,
  type FinancialAuditPack,
} from './financial-observability';

describe('Phase 5C.4 — Financial Observability & Audit Pack Engine', () => {
  it('calculates comprehensive financial metrics with mathematical consistency', () => {
    const summary = calculateFinancialObservabilitySummary({
      organizationId: 'org-enterprise-1',
      purchaseOrders: [
        { id: 'po-1', totalAmount: 150000, status: 'ISSUED' },
        { id: 'po-2', totalAmount: 50000, status: 'COMPLETED' },
      ],
      invoices: [
        { id: 'inv-1', amount: 100000, status: 'APPROVED' },
        { id: 'inv-2', amount: 50000, status: 'PAID' },
        { id: 'inv-3', amount: 30000, status: 'REJECTED' }, // Should be ignored
      ],
      allocations: [
        { paymentId: 'p1', invoiceId: 'inv-1', allocatedAmount: 40000, status: 'ALLOCATED' },
        { paymentId: 'p2', invoiceId: 'inv-2', allocatedAmount: 50000, status: 'ALLOCATED' },
      ],
      payments: [
        { id: 'p1', amount: 60000, unallocatedAmount: 20000 },
        { id: 'p2', amount: 50000, unallocatedAmount: 0 },
      ],
      tdsDeductions: [
        { invoiceId: 'inv-1', tdsAmount: 2000, status: 'DEDUCTED' },
        { invoiceId: 'inv-2', tdsAmount: 1000, status: 'DEPOSITED' },
      ],
      creditDebitNotes: [
        { invoiceId: 'inv-1', noteType: 'DEBIT_NOTE', amount: 5000, status: 'ISSUED' },
      ],
      bankReconciliations: [
        { bankClearedAmount: 60000, amountDifference: 0, status: 'MATCHED' },
        { bankClearedAmount: 45000, amountDifference: 5000, status: 'DISCREPANCY' },
      ],
    });

    expect(summary.totalPoAuthorized).toBe(200000);
    expect(summary.totalInvoiced).toBe(150000); // inv-1 (100k) + inv-2 (50k)
    expect(summary.totalPaid).toBe(90000); // 40k + 50k
    expect(summary.totalTdsWithheld).toBe(3000);
    expect(summary.totalTdsDeposited).toBe(1000);
    expect(summary.totalDebitNotes).toBe(5000);
    // Outstanding = (150,000 - 5,000) - 3,000 TDS - 90,000 Paid = 52,000
    expect(summary.totalOutstandingObligations).toBe(52000);
    expect(summary.totalUnallocatedAdvances).toBe(20000);
    expect(summary.totalUtrCleared).toBe(105000);
    expect(summary.reconciliationDiscrepancyCount).toBe(1);
    expect(summary.reconciliationDiscrepancyAmount).toBe(5000);
    expect(summary.openPoCount).toBe(1);
    expect(summary.completedPoCount).toBe(1);
  });

  it('generates structured JSON and CSV audit pack deliverables', () => {
    const pack: FinancialAuditPack = {
      metadata: {
        exportId: 'AUDIT-20260917-001',
        organizationId: 'org-enterprise-1',
        generatedAt: '2026-09-17T15:00:00Z',
        environment: 'PRODUCTION',
        schemaVersion: '5C.4',
      },
      summary: {
        organizationId: 'org-enterprise-1',
        totalPoAuthorized: 200000,
        totalInvoiced: 150000,
        totalPaid: 90000,
        totalTdsWithheld: 3000,
        totalTdsDeposited: 1000,
        totalDebitNotes: 5000,
        totalCreditNotes: 0,
        totalOutstandingObligations: 52000,
        totalUnallocatedAdvances: 20000,
        totalUtrCleared: 105000,
        reconciliationDiscrepancyCount: 1,
        reconciliationDiscrepancyAmount: 5000,
        openPoCount: 1,
        completedPoCount: 1,
        generatedAt: '2026-09-17T15:00:00Z',
      },
      purchaseOrders: [
        { id: 'po-1', poNumber: 'PO-1001', supplierId: 'sup-1', totalAmount: 150000, status: 'ISSUED' },
      ],
      invoices: [
        { id: 'inv-1', invoiceNumber: 'INV-2026-001', purchaseOrderId: 'po-1', amount: 100000, paidAmount: 40000, status: 'APPROVED' },
      ],
      tdsDeductions: [
        { id: 'tds-1', invoiceId: 'inv-1', section: '194C', taxableAmount: 100000, tdsRate: 2, tdsAmount: 2000, status: 'DEDUCTED', pan: 'AABCS1429B' },
      ],
      payments: [
        { id: 'p1', amount: 60000, unallocatedAmount: 20000, reference: 'HDFC99881122', method: 'BANK_TRANSFER' },
      ],
      bankReconciliations: [
        { id: 'rec-1', utrNumber: 'HDFC99881122', bankClearedAmount: 60000, status: 'MATCHED' },
      ],
    };

    const json = generateFinancialAuditPackJson(pack);
    expect(json).toContain('AUDIT-20260917-001');
    expect(json).toContain('org-enterprise-1');

    const csv = generateFinancialAuditPackCsv(pack);
    expect(csv).toContain('OTP CANONICAL FINANCIAL AUDIT PACK');
    expect(csv).toContain('Total Statutory TDS Withheld,3000');
    expect(csv).toContain('PO-1001');
    expect(csv).toContain('INV-2026-001');
    expect(csv).toContain('HDFC99881122');
  });
});

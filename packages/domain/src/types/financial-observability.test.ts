import { describe, expect, it } from 'vitest';
import {
  calculateFinancialObservabilitySummary,
  generateFinancialAuditPackCsv,
  generateFinancialAuditPackJson,
  type FinancialAuditPack,
} from './financial-observability';

describe('Phase 5C.5 — Financial Observability & Audit Pack Engine', () => {
  it('calculates comprehensive financial metrics with mathematical consistency including fees and settlement reconciliations', () => {
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
      platformFeeTransactions: [
        { grossAmount: 100000, feeAmount: 500, status: 'SETTLED' },
        { grossAmount: 50000, feeAmount: 250, status: 'ACKNOWLEDGED' },
        { grossAmount: 30000, feeAmount: 150, status: 'VOIDED' }, // Voided ignored
      ],
      settlementReconciliations: [
        { status: 'MATCHED', discrepancyType: 'NONE', varianceAmount: 0 },
        { status: 'MISMATCH', discrepancyType: 'UTR_AMOUNT_MISMATCH', varianceAmount: 500 },
      ],
      settlementExceptions: [
        { status: 'OPEN', amountInDispute: 500 },
        { status: 'RESOLVED', amountInDispute: 1000 },
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

    // Phase 5C.5 metrics
    expect(summary.totalPlatformFeeCalculated).toBe(750); // 500 + 250 (ignoring voided)
    expect(summary.totalPlatformFeeSettled).toBe(500);
    expect(summary.settlementReconciliationCount).toBe(2);
    expect(summary.settlementMismatchCount).toBe(1);
    expect(summary.openExceptionCount).toBe(1);
    expect(summary.resolvedExceptionCount).toBe(1);
  });

  it('generates structured JSON and CSV audit pack deliverables with Phase 5C.5 sections', () => {
    const pack: FinancialAuditPack = {
      metadata: {
        exportId: 'AUDIT-20260917-001',
        organizationId: 'org-enterprise-1',
        generatedAt: '2026-09-17T15:00:00Z',
        environment: 'PRODUCTION',
        schemaVersion: '5C.5',
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
        totalPlatformFeeCalculated: 750,
        totalPlatformFeeSettled: 500,
        settlementReconciliationCount: 2,
        settlementMismatchCount: 1,
        openExceptionCount: 1,
        resolvedExceptionCount: 1,
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
      platformFeeTransactions: [
        { id: 'fee-1', purchaseOrderId: 'po-1', invoiceId: 'inv-1', feeRate: 0.5, grossAmount: 100000, feeAmount: 500, netSettlementAmount: 99500, status: 'SETTLED' },
      ],
      settlementReconciliations: [
        { id: 'rec-5c5-1', purchaseOrderId: 'po-1', invoiceId: 'inv-1', invoiceGrossAmount: 100000, paidAllocatedAmount: 97500, platformFeeAmount: 500, supplierNetSettlementAmount: 97500, utrNumber: 'HDFC99881122', status: 'MATCHED', discrepancyType: 'NONE' },
      ],
      settlementExceptions: [
        { id: 'exc-5c5-1', reconciliationId: 'rec-5c5-1', exceptionType: 'NONE', severity: 'LOW', status: 'RESOLVED', amountInDispute: 0, reason: 'Reconciliation verified', resolutionNotes: 'Matched against bank record', resolvedBy: 'mgr-1' },
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
    expect(json).toContain('fee-1');

    const csv = generateFinancialAuditPackCsv(pack);
    expect(csv).toContain('OTP CANONICAL FINANCIAL AUDIT PACK');
    expect(csv).toContain('Total Statutory TDS Withheld,3000');
    expect(csv).toContain('Total Platform Fees Calculated,750');
    expect(csv).toContain('--- OTP PLATFORM FEE TRANSACTIONS ---');
    expect(csv).toContain('--- SETTLEMENT RECONCILIATIONS ---');
    expect(csv).toContain('--- FINANCIAL EXCEPTION QUEUE ---');
    expect(csv).toContain('PO-1001');
    expect(csv).toContain('INV-2026-001');
    expect(csv).toContain('HDFC99881122');
  });
});

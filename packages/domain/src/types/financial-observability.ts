import type { BankReconciliationRecord } from './bank-reconciliation';
import type { PoChangeOrder } from './change-order';

export interface FinancialObservabilitySummary {
  organizationId: string;
  totalPoAuthorized: number;
  totalInvoiced: number;
  totalPaid: number;
  totalTdsWithheld: number;
  totalTdsDeposited: number;
  totalDebitNotes: number;
  totalCreditNotes: number;
  totalOutstandingObligations: number;
  totalUnallocatedAdvances: number;
  totalUtrCleared: number;
  reconciliationDiscrepancyCount: number;
  reconciliationDiscrepancyAmount: number;
  openPoCount: number;
  completedPoCount: number;
  generatedAt: string;
}

export interface ObservabilityCalculationParams {
  organizationId: string;
  purchaseOrders: Array<{
    id: string;
    totalAmount: number;
    status: string;
  }>;
  changeOrders?: Array<{
    purchaseOrderId: string;
    totalDelta: number;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
  }>;
  allocations: Array<{
    paymentId: string;
    invoiceId: string;
    allocatedAmount: number;
    status?: string;
  }>;
  tdsDeductions?: Array<{
    invoiceId?: string;
    tdsAmount: number;
    status: string;
  }>;
  creditDebitNotes?: Array<{
    invoiceId?: string;
    noteType: string;
    amount: number;
    status: string;
  }>;
  bankReconciliations?: Array<{
    bankClearedAmount: number;
    amountDifference: number;
    status: string;
  }>;
}

/**
 * Computes authoritative Financial Observability Summary metrics.
 */
export function calculateFinancialObservabilitySummary(
  params: ObservabilityCalculationParams,
): FinancialObservabilitySummary {
  // 1. PO Commitments with Committed Change Orders
  let totalPoAuthorized = 0;
  let openPoCount = 0;
  let completedPoCount = 0;

  for (const po of params.purchaseOrders) {
    totalPoAuthorized += Number(po.totalAmount || 0);
    if (po.status === 'COMPLETED') {
      completedPoCount++;
    } else if (po.status !== 'CANCELLED') {
      openPoCount++;
    }
  }

  // 2. Invoiced (Exclude REJECTED / CANCELLED)
  let totalInvoiced = 0;
  for (const inv of params.invoices) {
    if (inv.status !== 'REJECTED' && inv.status !== 'CANCELLED') {
      totalInvoiced += Number(inv.amount || 0);
    }
  }

  // 3. Paid (Active allocations)
  let totalPaid = 0;
  for (const alloc of params.allocations) {
    if (!alloc.status || alloc.status === 'ALLOCATED') {
      totalPaid += Number(alloc.allocatedAmount || 0);
    }
  }

  // 4. TDS Withheld and Deposited
  let totalTdsWithheld = 0;
  let totalTdsDeposited = 0;
  if (params.tdsDeductions) {
    for (const tds of params.tdsDeductions) {
      if (tds.status !== 'VOIDED') {
        totalTdsWithheld += Number(tds.tdsAmount || 0);
        if (tds.status === 'DEPOSITED' || tds.status === 'CERTIFIED') {
          totalTdsDeposited += Number(tds.tdsAmount || 0);
        }
      }
    }
  }

  // 5. Debit and Credit Notes
  let totalDebitNotes = 0;
  let totalCreditNotes = 0;
  if (params.creditDebitNotes) {
    for (const note of params.creditDebitNotes) {
      if (note.status !== 'CANCELLED' && note.status !== 'DRAFT') {
        if (note.noteType === 'DEBIT_NOTE') {
          totalDebitNotes += Number(note.amount || 0);
        } else if (note.noteType === 'CREDIT_NOTE') {
          totalCreditNotes += Number(note.amount || 0);
        }
      }
    }
  }

  // 6. Outstanding Obligations
  // Invariant: max(0, Invoiced - Debit + Credit - TDS - Paid)
  const adjustedInvoiced = totalInvoiced - totalDebitNotes + totalCreditNotes;
  const totalOutstanding = Math.max(
    0,
    adjustedInvoiced - totalTdsWithheld - totalPaid,
  );

  // 7. Unallocated Advances
  let totalUnallocatedAdvances = 0;
  for (const pay of params.payments) {
    if (pay.unallocatedAmount !== undefined) {
      totalUnallocatedAdvances += Number(pay.unallocatedAmount || 0);
    }
  }

  // 8. Bank Reconciliation Metrics
  let totalUtrCleared = 0;
  let discrepancyCount = 0;
  let discrepancyAmount = 0;
  if (params.bankReconciliations) {
    for (const rec of params.bankReconciliations) {
      totalUtrCleared += Number(rec.bankClearedAmount || 0);
      if (rec.status === 'DISCREPANCY') {
        discrepancyCount++;
        discrepancyAmount += Math.abs(Number(rec.amountDifference || 0));
      }
    }
  }

  return {
    organizationId: params.organizationId,
    totalPoAuthorized: Math.round(totalPoAuthorized * 100) / 100,
    totalInvoiced: Math.round(totalInvoiced * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalTdsWithheld: Math.round(totalTdsWithheld * 100) / 100,
    totalTdsDeposited: Math.round(totalTdsDeposited * 100) / 100,
    totalDebitNotes: Math.round(totalDebitNotes * 100) / 100,
    totalCreditNotes: Math.round(totalCreditNotes * 100) / 100,
    totalOutstandingObligations: Math.round(totalOutstanding * 100) / 100,
    totalUnallocatedAdvances:
      Math.round(totalUnallocatedAdvances * 100) / 100,
    totalUtrCleared: Math.round(totalUtrCleared * 100) / 100,
    reconciliationDiscrepancyCount: discrepancyCount,
    reconciliationDiscrepancyAmount: Math.round(discrepancyAmount * 100) / 100,
    openPoCount,
    completedPoCount,
    generatedAt: new Date().toISOString(),
  };
}

export interface FinancialAuditPack {
  metadata: {
    exportId: string;
    organizationId: string;
    generatedAt: string;
    environment: string;
    schemaVersion: string;
  };
  summary: FinancialObservabilitySummary;
  purchaseOrders: Array<{
    id: string;
    poNumber?: string;
    supplierId?: string;
    totalAmount: number;
    status: string;
    createdAt?: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber?: string;
    purchaseOrderId?: string;
    amount: number;
    paidAmount?: number;
    status: string;
    createdAt?: string;
  }>;
  tdsDeductions: Array<{
    id: string;
    invoiceId?: string;
    section: string;
    taxableAmount: number;
    tdsRate: number;
    tdsAmount: number;
    status: string;
    pan?: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    unallocatedAmount?: number;
    reference?: string | null;
    method?: string;
    recordedAt?: string;
  }>;
  bankReconciliations: Array<{
    id: string;
    utrNumber: string;
    bankClearedAmount: number;
    status: string;
    discrepancyType?: string;
  }>;
}

/**
 * Generates JSON export format for Financial Audit Pack.
 */
export function generateFinancialAuditPackJson(pack: FinancialAuditPack): string {
  return JSON.stringify(pack, null, 2);
}

/**
 * Generates structured CSV export format for Financial Audit Pack.
 */
export function generateFinancialAuditPackCsv(pack: FinancialAuditPack): string {
  const lines: string[] = [];

  // Header & Metadata
  lines.push('# OTP CANONICAL FINANCIAL AUDIT PACK');
  lines.push(`# Export ID: ${pack.metadata.exportId}`);
  lines.push(`# Organization ID: ${pack.metadata.organizationId}`);
  lines.push(`# Generated At: ${pack.metadata.generatedAt}`);
  lines.push('');

  // Executive Summary Section
  lines.push('--- FINANCIAL OBSERVABILITY EXECUTIVE SUMMARY ---');
  lines.push('Metric,Amount (INR),Count / Notes');
  lines.push(`Total PO Authorized,${pack.summary.totalPoAuthorized},Open POs: ${pack.summary.openPoCount} | Completed POs: ${pack.summary.completedPoCount}`);
  lines.push(`Total Invoiced,${pack.summary.totalInvoiced},-`);
  lines.push(`Total Payments Allocated,${pack.summary.totalPaid},-`);
  lines.push(`Total Statutory TDS Withheld,${pack.summary.totalTdsWithheld},Deposited: ${pack.summary.totalTdsDeposited}`);
  lines.push(`Total Debit Notes,${pack.summary.totalDebitNotes},-`);
  lines.push(`Total Credit Notes,${pack.summary.totalCreditNotes},-`);
  lines.push(`Total Outstanding Obligations,${pack.summary.totalOutstandingObligations},-`);
  lines.push(`Total Unallocated Advances,${pack.summary.totalUnallocatedAdvances},-`);
  lines.push(`Total Bank UTR Cleared,${pack.summary.totalUtrCleared},Discrepancies: ${pack.summary.reconciliationDiscrepancyCount} (₹${pack.summary.reconciliationDiscrepancyAmount})`);
  lines.push('');

  // Purchase Orders
  lines.push('--- PURCHASE ORDERS ---');
  lines.push('PO ID,PO Number,Supplier ID,Total Amount,Status,Created At');
  for (const po of pack.purchaseOrders) {
    lines.push(
      `"${po.id}","${po.poNumber || ''}","${po.supplierId || ''}",${po.totalAmount},"${po.status}","${po.createdAt || ''}"`,
    );
  }
  lines.push('');

  // Invoices
  lines.push('--- INVOICES ---');
  lines.push('Invoice ID,Invoice Number,PO ID,Gross Amount,Paid Amount,Status,Created At');
  for (const inv of pack.invoices) {
    lines.push(
      `"${inv.id}","${inv.invoiceNumber || ''}","${inv.purchaseOrderId || ''}",${inv.amount},${inv.paidAmount ?? 0},"${inv.status}","${inv.createdAt || ''}"`,
    );
  }
  lines.push('');

  // TDS Records
  lines.push('--- STATUTORY TDS DEDUCTIONS ---');
  lines.push('TDS ID,Invoice ID,Section,Taxable Amount,Rate (%),TDS Amount,Status,Deductee PAN');
  for (const tds of pack.tdsDeductions) {
    lines.push(
      `"${tds.id}","${tds.invoiceId || ''}","${tds.section}",${tds.taxableAmount},${tds.tdsRate},${tds.tdsAmount},"${tds.status}","${tds.pan || ''}"`,
    );
  }
  lines.push('');

  // Payments
  lines.push('--- PAYMENTS & ADVANCES ---');
  lines.push('Payment ID,Amount,Unallocated Advance,Reference / UTR,Method,Recorded At');
  for (const p of pack.payments) {
    lines.push(
      `"${p.id}",${p.amount},${p.unallocatedAmount ?? 0},"${p.reference || ''}","${p.method || ''}","${p.recordedAt || ''}"`,
    );
  }
  lines.push('');

  // Bank Reconciliations
  lines.push('--- BANK UTR RECONCILIATIONS ---');
  lines.push('Reconciliation ID,UTR Number,Cleared Amount,Status,Discrepancy Type');
  for (const r of pack.bankReconciliations) {
    lines.push(
      `"${r.id}","${r.utrNumber}",${r.bankClearedAmount},"${r.status}","${r.discrepancyType || 'NONE'}"`,
    );
  }

  return lines.join('\n');
}

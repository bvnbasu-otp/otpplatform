import type { BankReconciliationRecord } from './bank-reconciliation';
import type { PoChangeOrder } from './change-order';

export interface FinancialAgingBuckets {
  bucket_0_7d: number;
  bucket_8_15d: number;
  bucket_16_30d: number;
  bucket_over_30d: number;
}

export interface FinancialAgingSummary {
  unpaid_invoices_aging: FinancialAgingBuckets;
  stuck_advances_aging: FinancialAgingBuckets;
  unresolved_exceptions_aging: FinancialAgingBuckets;
}

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
  // Phase 5C.5 Extensions
  totalPlatformFeeCalculated: number;
  totalPlatformFeeSettled: number;
  settlementReconciliationCount: number;
  settlementMismatchCount: number;
  openExceptionCount: number;
  resolvedExceptionCount: number;
  // Phase 5C.6 Extensions: Financial Aging
  financial_aging?: FinancialAgingSummary;
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
    paidAmount?: number;
    status: string;
    createdAt?: string;
    submittedAt?: string;
    dueDate?: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
    createdAt?: string;
    recordedAt?: string;
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
  // Phase 5C.5 Inputs
  platformFeeTransactions?: Array<{
    grossAmount: number;
    feeAmount: number;
    status: string;
  }>;
  settlementReconciliations?: Array<{
    status: string;
    discrepancyType?: string;
    varianceAmount?: number;
  }>;
  settlementExceptions?: Array<{
    status: string;
    amountInDispute: number;
    createdAt?: string;
  }>;
  asOfDate?: string | Date;
}

/**
 * Calculates financial aging buckets for a list of items with timestamp and amount.
 */
export function calculateAgingBuckets(
  items: Array<{ amount: number; date?: string | Date | null }>,
  asOfDate: string | Date = new Date(),
): FinancialAgingBuckets {
  const asOf = new Date(asOfDate).getTime();
  const buckets: FinancialAgingBuckets = {
    bucket_0_7d: 0,
    bucket_8_15d: 0,
    bucket_16_30d: 0,
    bucket_over_30d: 0,
  };

  for (const item of items) {
    const amt = Number(item.amount || 0);
    if (amt <= 0) continue;

    const itemDate = item.date ? new Date(item.date).getTime() : asOf;
    const diffMs = Math.max(0, asOf - itemDate);
    const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (ageDays <= 7) {
      buckets.bucket_0_7d = Math.round((buckets.bucket_0_7d + amt) * 100) / 100;
    } else if (ageDays <= 15) {
      buckets.bucket_8_15d = Math.round((buckets.bucket_8_15d + amt) * 100) / 100;
    } else if (ageDays <= 30) {
      buckets.bucket_16_30d = Math.round((buckets.bucket_16_30d + amt) * 100) / 100;
    } else {
      buckets.bucket_over_30d = Math.round((buckets.bucket_over_30d + amt) * 100) / 100;
    }
  }

  return buckets;
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

  // 9. Phase 5C.5: Platform Fees Metrics
  let totalPlatformFeeCalculated = 0;
  let totalPlatformFeeSettled = 0;
  if (params.platformFeeTransactions) {
    for (const tx of params.platformFeeTransactions) {
      if (tx.status !== 'VOIDED' && tx.status !== 'REVERSED') {
        totalPlatformFeeCalculated += Number(tx.feeAmount || 0);
        if (tx.status === 'SETTLED') {
          totalPlatformFeeSettled += Number(tx.feeAmount || 0);
        }
      }
    }
  }

  // 10. Phase 5C.5: Settlement Reconciliation & Exceptions Metrics
  let settlementReconciliationCount = 0;
  let settlementMismatchCount = 0;
  if (params.settlementReconciliations) {
    settlementReconciliationCount = params.settlementReconciliations.length;
    for (const sRec of params.settlementReconciliations) {
      if (sRec.status === 'MISMATCH' || sRec.status === 'DISPUTED') {
        settlementMismatchCount++;
      }
    }
  }

  let openExceptionCount = 0;
  let resolvedExceptionCount = 0;
  if (params.settlementExceptions) {
    for (const exc of params.settlementExceptions) {
      if (exc.status === 'OPEN' || exc.status === 'INVESTIGATING') {
        openExceptionCount++;
      } else if (exc.status === 'RESOLVED') {
        resolvedExceptionCount++;
      }
    }
  }

  // 11. Phase 5C.6: Financial Aging Metrics
  const unpaidInvoices = params.invoices
    .filter((inv) => inv.status !== 'REJECTED' && inv.status !== 'CANCELLED' && inv.status !== 'PAID')
    .map((inv) => ({
      amount: Math.max(0, Number(inv.amount || 0) - Number(inv.paidAmount || 0)),
      date: inv.dueDate || inv.submittedAt || inv.createdAt,
    }));

  const stuckAdvances = params.payments
    .filter((p) => p.status !== 'FAILED' && p.status !== 'REVERSED' && p.status !== 'VOIDED')
    .map((p) => ({
      amount: Number(p.unallocatedAmount || 0),
      date: p.recordedAt || p.createdAt,
    }));

  const unresolvedExceptions = (params.settlementExceptions || [])
    .filter((e) => e.status === 'OPEN' || e.status === 'INVESTIGATING')
    .map((e) => ({
      amount: Number(e.amountInDispute || 0),
      date: e.createdAt,
    }));

  const financial_aging: FinancialAgingSummary = {
    unpaid_invoices_aging: calculateAgingBuckets(unpaidInvoices, params.asOfDate),
    stuck_advances_aging: calculateAgingBuckets(stuckAdvances, params.asOfDate),
    unresolved_exceptions_aging: calculateAgingBuckets(unresolvedExceptions, params.asOfDate),
  };

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
    totalPlatformFeeCalculated: Math.round(totalPlatformFeeCalculated * 100) / 100,
    totalPlatformFeeSettled: Math.round(totalPlatformFeeSettled * 100) / 100,
    settlementReconciliationCount,
    settlementMismatchCount,
    openExceptionCount,
    resolvedExceptionCount,
    financial_aging,
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
  // Phase 5C.5 Audit Pack Elements
  platformFeePolicies?: Array<{
    id: string;
    policyVersion: number;
    feeType: string;
    rate: number;
    status: string;
    effectiveFrom?: string;
  }>;
  platformFeeTransactions?: Array<{
    id: string;
    purchaseOrderId: string;
    invoiceId?: string | null;
    paymentId?: string | null;
    feeRate: number;
    grossAmount: number;
    feeAmount: number;
    netSettlementAmount: number;
    status: string;
    settledAt?: string | null;
  }>;
  settlementReconciliations?: Array<{
    id: string;
    purchaseOrderId: string;
    invoiceId: string;
    invoiceGrossAmount: number;
    paidAllocatedAmount: number;
    platformFeeAmount: number;
    supplierNetSettlementAmount: number;
    utrNumber?: string | null;
    status: string;
    discrepancyType: string;
  }>;
  settlementExceptions?: Array<{
    id: string;
    reconciliationId: string;
    exceptionType: string;
    severity: string;
    status: string;
    amountInDispute: number;
    reason: string;
    resolutionNotes?: string | null;
    resolvedBy?: string | null;
    resolvedAt?: string | null;
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
  lines.push(`Total Platform Fees Calculated,${pack.summary.totalPlatformFeeCalculated || 0},Settled: ₹${pack.summary.totalPlatformFeeSettled || 0}`);
  lines.push(`Settlement Reconciliations,${pack.summary.settlementReconciliationCount || 0},Mismatches: ${pack.summary.settlementMismatchCount || 0}`);
  lines.push(`Settlement Exceptions,${pack.summary.openExceptionCount || 0} Open,Resolved: ${pack.summary.resolvedExceptionCount || 0}`);
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

  // Platform Fee Transactions (Phase 5C.5)
  if (pack.platformFeeTransactions && pack.platformFeeTransactions.length > 0) {
    lines.push('--- OTP PLATFORM FEE TRANSACTIONS ---');
    lines.push('Transaction ID,PO ID,Invoice ID,Fee Rate (%),Gross Amount,Fee Amount,Net Settlement Amount,Status,Settled At');
    for (const fee of pack.platformFeeTransactions) {
      lines.push(
        `"${fee.id}","${fee.purchaseOrderId}","${fee.invoiceId || ''}",${fee.feeRate},${fee.grossAmount},${fee.feeAmount},${fee.netSettlementAmount},"${fee.status}","${fee.settledAt || ''}"`,
      );
    }
    lines.push('');
  }

  // Settlement Reconciliations (Phase 5C.5)
  if (pack.settlementReconciliations && pack.settlementReconciliations.length > 0) {
    lines.push('--- SETTLEMENT RECONCILIATIONS ---');
    lines.push('Reconciliation ID,PO ID,Invoice ID,Gross Amount,Paid Amount,Platform Fee,Supplier Net Settlement,UTR Number,Status,Discrepancy Type');
    for (const rec of pack.settlementReconciliations) {
      lines.push(
        `"${rec.id}","${rec.purchaseOrderId}","${rec.invoiceId}",${rec.invoiceGrossAmount},${rec.paidAllocatedAmount},${rec.platformFeeAmount},${rec.supplierNetSettlementAmount},"${rec.utrNumber || ''}","${rec.status}","${rec.discrepancyType}"`,
      );
    }
    lines.push('');
  }

  // Settlement Exceptions (Phase 5C.5)
  if (pack.settlementExceptions && pack.settlementExceptions.length > 0) {
    lines.push('--- FINANCIAL EXCEPTION QUEUE ---');
    lines.push('Exception ID,Reconciliation ID,Exception Type,Severity,Status,Disputed Amount,Reason,Resolution Notes,Resolved By,Resolved At');
    for (const exc of pack.settlementExceptions) {
      lines.push(
        `"${exc.id}","${exc.reconciliationId}","${exc.exceptionType}","${exc.severity}","${exc.status}",${exc.amountInDispute},"${(exc.reason || '').replace(/"/g, '""')}","${(exc.resolutionNotes || '').replace(/"/g, '""')}","${exc.resolvedBy || ''}","${exc.resolvedAt || ''}"`,
      );
    }
    lines.push('');
  }

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
  lines.push('');

  // Financial Aging Breakdown (Phase 5C.6)
  if (pack.summary.financial_aging) {
    const fa = pack.summary.financial_aging;
    lines.push('--- FINANCIAL AGING BREAKDOWN ---');
    lines.push('Category,0-7 Days (INR),8-15 Days (INR),16-30 Days (INR),>30 Days (INR)');
    lines.push(`Unpaid Invoices,${fa.unpaid_invoices_aging.bucket_0_7d},${fa.unpaid_invoices_aging.bucket_8_15d},${fa.unpaid_invoices_aging.bucket_16_30d},${fa.unpaid_invoices_aging.bucket_over_30d}`);
    lines.push(`Stuck Advances,${fa.stuck_advances_aging.bucket_0_7d},${fa.stuck_advances_aging.bucket_8_15d},${fa.stuck_advances_aging.bucket_16_30d},${fa.stuck_advances_aging.bucket_over_30d}`);
    lines.push(`Unresolved Exceptions,${fa.unresolved_exceptions_aging.bucket_0_7d},${fa.unresolved_exceptions_aging.bucket_8_15d},${fa.unresolved_exceptions_aging.bucket_16_30d},${fa.unresolved_exceptions_aging.bucket_over_30d}`);
  }

  return lines.join('\n');
}

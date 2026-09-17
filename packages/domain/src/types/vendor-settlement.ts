import type { InvoiceStatus, PaymentAllocationStatus } from '../enums/procurement';
import {
  calculatePoSettlementSummary,
  calculatePaymentAllocatedAmount,
  type PoSettlementSummary,
} from './payment-allocation';

export type CreditDebitNoteType = 'DEBIT_NOTE' | 'CREDIT_NOTE';
export type CreditDebitNoteStatus = 'DRAFT' | 'ISSUED' | 'APPLIED' | 'CANCELLED';

export interface CreditDebitNote {
  id: string;
  organizationId: string;
  purchaseOrderId?: string | null;
  invoiceId: string;
  noteNumber: string;
  noteType: CreditDebitNoteType;
  amount: number;
  taxAmount: number;
  reason: string;
  status: CreditDebitNoteStatus;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditDebitNoteSummary {
  id: string;
  noteNumber: string;
  noteType: CreditDebitNoteType;
  invoiceId: string;
  purchaseOrderId?: string | null;
  amount: number;
  taxAmount: number;
  status: CreditDebitNoteStatus;
  reason: string;
  createdAt: string;
}

export interface VendorSettlementStatement {
  buyerOrganizationId: string;
  supplierId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  poSummaries: PoSettlementSummary[];
  creditDebitNotes: CreditDebitNote[];
  totalPoAuthorized: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalUnallocatedAdvance: number;
  totalDebitNotes: number;
  totalCreditNotes: number;
  netPayable: number;
  generatedAt: string;
}

export interface CalculateVendorSettlementParams {
  buyerOrganizationId: string;
  supplierId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  purchaseOrders: Array<{
    id: string;
    poNumber?: string;
    totalAmount: number;
    taxableTotal?: number;
    cgstTotal?: number;
    sgstTotal?: number;
    utgstTotal?: number;
    igstTotal?: number;
  }>;
  invoices: Array<{
    id: string;
    purchaseOrderId?: string;
    workOrderId?: string;
    invoiceNumber?: string;
    amount: number;
    paidAmount?: number;
    balanceDue?: number;
    status: InvoiceStatus;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    utgstAmount?: number;
    igstAmount?: number;
    createdAt?: string;
  }>;
  payments: Array<{
    id: string;
    purchaseOrderId?: string | null;
    invoiceId?: string | null;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
    reference?: string | null;
    recordedAt?: string;
  }>;
  allocations: Array<{
    id?: string;
    paymentId: string;
    invoiceId: string;
    allocatedAmount: number;
    status?: PaymentAllocationStatus | string;
  }>;
  creditDebitNotes?: Array<CreditDebitNote | CreditDebitNoteSummary>;
}

/**
 * Pure exact-arithmetic calculation function for Multi-PO Cumulative Vendor Settlement Statements.
 */
export function calculateVendorSettlementStatement(
  params: CalculateVendorSettlementParams,
): VendorSettlementStatement {
  const {
    buyerOrganizationId,
    supplierId,
    periodStart = null,
    periodEnd = null,
    purchaseOrders,
    invoices,
    payments,
    allocations,
    creditDebitNotes = [],
  } = params;

  // 1. Compute per-PO settlement summaries
  const poSummaries: PoSettlementSummary[] = purchaseOrders.map((po) => {
    const poInvoices = invoices.filter((i) => i.purchaseOrderId === po.id);
    const poPayments = payments.filter((p) => p.purchaseOrderId === po.id);
    const poInvoiceIds = new Set(poInvoices.map((i) => i.id));
    const poAllocations = allocations.filter((a) => poInvoiceIds.has(a.invoiceId));

    return calculatePoSettlementSummary(po, poInvoices, poPayments, poAllocations);
  });

  // 2. Global aggregations across all POs
  const totalPoAuthorized = Math.round(
    purchaseOrders.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0) * 100,
  ) / 100;

  // Non-rejected invoices only (5C3-RED-10: exclusion of REJECTED invoices)
  const validInvoices = invoices.filter((i) => i.status !== 'REJECTED');
  const validInvoiceIds = new Set(validInvoices.map((i) => i.id));

  const totalInvoiced = Math.round(
    validInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0) * 100,
  ) / 100;

  // Active allocations for valid invoices
  const activeAllocations = allocations.filter(
    (a) => (!a.status || a.status === 'ALLOCATED') && validInvoiceIds.has(a.invoiceId),
  );

  const totalPaid = Math.round(
    activeAllocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0) * 100,
  ) / 100;

  const totalOutstanding = Math.max(0, Math.round((totalInvoiced - totalPaid) * 100) / 100);

  // Unallocated advances calculation across payments
  const allocSumByPayment: Record<string, number> = {};
  for (const a of allocations.filter((a) => !a.status || a.status === 'ALLOCATED')) {
    allocSumByPayment[a.paymentId] =
      Math.round(((allocSumByPayment[a.paymentId] || 0) + Number(a.allocatedAmount || 0)) * 100) / 100;
  }

  let totalUnallocatedAdvance = 0;
  for (const pay of payments) {
    const payAmt = Math.round(Number(pay.amount || 0) * 100) / 100;
    const payAlloc =
      allocSumByPayment[pay.id] !== undefined
        ? allocSumByPayment[pay.id]!
        : Math.round(Number(payAmt - (pay.unallocatedAmount ?? payAmt)) * 100) / 100;
    const unalloc = Math.max(0, Math.round((payAmt - payAlloc) * 100) / 100);
    totalUnallocatedAdvance = Math.round((totalUnallocatedAdvance + unalloc) * 100) / 100;
  }

  // Active credit & debit notes
  const activeNotes = creditDebitNotes.filter(
    (n) => n.status === 'ISSUED' || n.status === 'APPLIED',
  );

  let totalDebitNotes = 0;
  let totalCreditNotes = 0;

  for (const note of activeNotes) {
    const amt = Math.round(Number(note.amount || 0) * 100) / 100;
    if (note.noteType === 'DEBIT_NOTE') {
      totalDebitNotes = Math.round((totalDebitNotes + amt) * 100) / 100;
    } else if (note.noteType === 'CREDIT_NOTE') {
      totalCreditNotes = Math.round((totalCreditNotes + amt) * 100) / 100;
    }
  }

  // Net payable calculation:
  // Net Payable = Outstanding Invoices - Active Debit Notes + Active Credit Notes - Unallocated Advance
  const rawNet = totalOutstanding - totalDebitNotes + totalCreditNotes - totalUnallocatedAdvance;
  const netPayable = Math.max(0, Math.round(rawNet * 100) / 100);

  const formattedNotes: CreditDebitNote[] = creditDebitNotes.map((n) => ({
    id: n.id,
    organizationId: (n as any).organizationId || buyerOrganizationId,
    purchaseOrderId: n.purchaseOrderId || null,
    invoiceId: n.invoiceId,
    noteNumber: n.noteNumber,
    noteType: n.noteType,
    amount: Math.round(Number(n.amount || 0) * 100) / 100,
    taxAmount: Math.round(Number(n.taxAmount || 0) * 100) / 100,
    reason: n.reason,
    status: n.status,
    createdBy: (n as any).createdBy || null,
    createdAt: n.createdAt || new Date().toISOString(),
    updatedAt: (n as any).updatedAt || n.createdAt || new Date().toISOString(),
  }));

  return {
    buyerOrganizationId,
    supplierId,
    periodStart,
    periodEnd,
    poSummaries,
    creditDebitNotes: formattedNotes,
    totalPoAuthorized,
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    totalUnallocatedAdvance,
    totalDebitNotes,
    totalCreditNotes,
    netPayable,
    generatedAt: new Date().toISOString(),
  };
}

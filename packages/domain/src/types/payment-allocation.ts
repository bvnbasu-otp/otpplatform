import type { InvoiceStatus, PaymentAllocationStatus } from '../enums/procurement';

/**
 * Normalized Payment Allocation Record (Phase 5C.1)
 */
export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  allocatedAmount: number;
  allocatedAt: string;
  status: PaymentAllocationStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Summary of payment and settlement status for an individual Invoice
 */
export interface InvoicePaymentSummary {
  invoiceId: string;
  invoiceAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  allocationCount: number;
}

/**
 * Summary of allocation status for a Payment
 */
export interface PaymentAllocationSummary {
  paymentId: string;
  paymentAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  isFullyAllocated: boolean;
  allocationCount: number;
}

/**
 * Pure Mathematical & Allocation Calculators for Phase 5C.1
 */

/**
 * Calculates the total active allocated amount from a list of payment allocations.
 * Only allocations with status === 'ALLOCATED' (or omitted) are counted.
 */
export function calculatePaymentAllocatedAmount(
  allocations: Array<{ allocatedAmount: number; status?: string }>,
): number {
  const activeAllocations = allocations.filter(
    (a) => !a.status || a.status === 'ALLOCATED',
  );
  const total = activeAllocations.reduce(
    (sum, a) => sum + Number(a.allocatedAmount || 0),
    0,
  );
  return Math.round(total * 100) / 100;
}

/**
 * Calculates remaining unallocated amount for a payment.
 * Invariant: unallocated = max(0, paymentAmount - sum(activeAllocated))
 */
export function calculatePaymentUnallocatedAmount(
  paymentAmount: number,
  allocations: Array<{ allocatedAmount: number; status?: string }>,
): number {
  const allocated = calculatePaymentAllocatedAmount(allocations);
  const unallocated = Math.max(0, paymentAmount - allocated);
  return Math.round(unallocated * 100) / 100;
}

/**
 * Calculates total paid amount for an invoice from active allocations.
 */
export function calculateInvoicePaidAmount(
  allocations: Array<{ allocatedAmount: number; status?: string }>,
): number {
  return calculatePaymentAllocatedAmount(allocations);
}

/**
 * Calculates remaining balance due for an invoice.
 * Invariant: balanceDue = max(0, invoiceAmount - paidAmount)
 */
export function calculateInvoiceBalanceDue(
  invoiceAmount: number,
  allocations: Array<{ allocatedAmount: number; status?: string }>,
): number {
  const paid = calculateInvoicePaidAmount(allocations);
  const balance = Math.max(0, invoiceAmount - paid);
  return Math.round(balance * 100) / 100;
}

/**
 * Derives the canonical invoice status based on paid amount and invoice total.
 * Authoritative financial state uses exact NUMERIC(14,2) precision with 0 tolerance.
 */
export function deriveInvoicePaymentStatus(
  invoiceAmount: number,
  paidAmount: number,
  currentStatus: InvoiceStatus = 'APPROVED',
  tolerance = 0,
): InvoiceStatus {
  if (paidAmount >= invoiceAmount - tolerance) {
    return 'PAID';
  }
  if (paidAmount > 0) {
    return 'PARTIALLY_PAID';
  }
  if (currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID') {
    return 'APPROVED';
  }
  return currentStatus;
}

/**
 * Calculates remaining payable amounts across a portfolio of invoices for a Purchase Order.
 */
export function calculateRemainingPayableAmount(
  invoices: Array<{ id?: string; amount: number; status?: string }>,
  allocations: Array<{ invoiceId: string; allocatedAmount: number; status?: string }>,
): {
  totalInvoiced: number;
  totalPaid: number;
  totalBalanceDue: number;
  isFullySettled: boolean;
} {
  const nonRejected = invoices.filter((i) => i.status !== 'REJECTED');
  const totalInvoiced = nonRejected.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const activeAllocations = allocations.filter(
    (a) => !a.status || a.status === 'ALLOCATED',
  );
  const totalPaid = activeAllocations.reduce(
    (sum, a) => sum + Number(a.allocatedAmount || 0),
    0,
  );

  const roundedInvoiced = Math.round(totalInvoiced * 100) / 100;
  const roundedPaid = Math.round(totalPaid * 100) / 100;
  const totalBalanceDue = Math.max(0, Math.round((roundedInvoiced - roundedPaid) * 100) / 100);
  const isFullySettled = totalBalanceDue <= 0 && roundedInvoiced > 0;

  return {
    totalInvoiced: roundedInvoiced,
    totalPaid: roundedPaid,
    totalBalanceDue,
    isFullySettled,
  };
}

/**
 * Validates whether a proposed payment allocation complies with:
 * 1. Positive allocation amount (> 0)
 * 2. Payment total cap (payment.amount)
 * 3. Invoice balance cap (invoice.amount)
 */
export function validatePaymentAllocation(
  paymentAmount: number,
  invoiceAmount: number,
  existingPaymentAllocations: Array<{ allocatedAmount: number; status?: string }>,
  existingInvoiceAllocations: Array<{ allocatedAmount: number; status?: string }>,
  newAllocationAmount: number,
  tolerance = 0,
): {
  valid: boolean;
  paymentRemaining: number;
  invoiceRemaining: number;
  exceededBy?: number;
  error?: string;
} {
  if (newAllocationAmount <= 0) {
    return {
      valid: false,
      paymentRemaining: 0,
      invoiceRemaining: 0,
      error: 'Allocation amount must be strictly greater than 0',
    };
  }

  const paymentAllocated = calculatePaymentAllocatedAmount(existingPaymentAllocations);
  const invoicePaid = calculateInvoicePaidAmount(existingInvoiceAllocations);

  const paymentRemaining = Math.max(0, Math.round((paymentAmount - paymentAllocated) * 100) / 100);
  const invoiceRemaining = Math.max(0, Math.round((invoiceAmount - invoicePaid) * 100) / 100);

  // Check payment over-allocation
  if (paymentAllocated + newAllocationAmount > paymentAmount + tolerance) {
    const exceededBy = Math.round((paymentAllocated + newAllocationAmount - paymentAmount) * 100) / 100;
    return {
      valid: false,
      paymentRemaining,
      invoiceRemaining,
      exceededBy,
      error: `Allocation amount ₹${newAllocationAmount} exceeds available payment balance of ₹${paymentRemaining} by ₹${exceededBy}`,
    };
  }

  // Check invoice over-allocation
  if (invoicePaid + newAllocationAmount > invoiceAmount + tolerance) {
    const exceededBy = Math.round((invoicePaid + newAllocationAmount - invoiceAmount) * 100) / 100;
    return {
      valid: false,
      paymentRemaining,
      invoiceRemaining,
      exceededBy,
      error: `Allocation amount ₹${newAllocationAmount} exceeds invoice balance due of ₹${invoiceRemaining} by ₹${exceededBy}`,
    };
  }

  return {
    valid: true,
    paymentRemaining,
    invoiceRemaining,
  };
}

/**
 * Validates a batch allocation of a single payment across multiple invoices.
 */
export function validatePaymentAllocationBatch(
  payment: { amount: number },
  allocations: Array<{
    invoiceId: string;
    invoiceAmount: number;
    existingInvoiceAllocations?: Array<{ allocatedAmount: number; status?: string }>;
    allocationAmount: number;
  }>,
  tolerance = 0,
): {
  valid: boolean;
  totalAllocated: number;
  unallocatedAmount: number;
  errors: string[];
} {
  const errors: string[] = [];
  let totalAllocated = 0;

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i]!;
    if (alloc.allocationAmount <= 0) {
      errors.push(`Item ${i + 1}: Allocation amount must be strictly greater than 0`);
      continue;
    }

    const existingPaid = calculateInvoicePaidAmount(alloc.existingInvoiceAllocations || []);
    if (existingPaid + alloc.allocationAmount > alloc.invoiceAmount + tolerance) {
      const remaining = Math.max(0, alloc.invoiceAmount - existingPaid);
      errors.push(
        `Item ${i + 1} (Invoice ${alloc.invoiceId}): Allocation ₹${alloc.allocationAmount} exceeds balance due ₹${remaining}`,
      );
    }

    totalAllocated += alloc.allocationAmount;
  }

  totalAllocated = Math.round(totalAllocated * 100) / 100;

  if (totalAllocated > payment.amount + tolerance) {
    const exceededBy = Math.round((totalAllocated - payment.amount) * 100) / 100;
    errors.push(
      `Total allocations ₹${totalAllocated} exceed payment amount ₹${payment.amount} by ₹${exceededBy}`,
    );
  }

  const unallocatedAmount = Math.max(0, Math.round((payment.amount - totalAllocated) * 100) / 100);

  return {
    valid: errors.length === 0,
    totalAllocated,
    unallocatedAmount,
    errors,
  };
}

/**
 * PO Cumulative Settlement Summary (Phase 5C.2)
 */
export interface PoSettlementSummary {
  purchaseOrderId: string;
  poAuthorizedTotal: number;
  cumulativeInvoicedAmount: number;
  cumulativePaidAmount: number;
  cumulativeAllocatedAmount: number;
  invoicedOutstandingAmount: number;
  uninvoicedAuthorizationBalance: number;
  unallocatedAdvanceAmount: number;
  contractualExposure: number;
  settlementAmount: number;
  settledAmount: number;
  remainingSettlementAmount: number;
  isFullyReconciled: boolean;
  isFullySettled: boolean;
  counts: {
    invoiceCount: number;
    paidInvoiceCount: number;
    partiallyPaidInvoiceCount: number;
    unpaidInvoiceCount: number;
    rejectedInvoiceCount: number;
    paymentCount: number;
    allocationCount: number;
  };
  taxTotals: {
    taxableTotal: number;
    cgstTotal: number;
    sgstTotal: number;
    utgstTotal: number;
    igstTotal: number;
  };
}

/**
 * Itemized Invoice Ledger Entry for Settlement Certificate
 */
export interface SettlementInvoiceLedgerEntry {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  taxableAmount?: number;
  gstAmount?: number;
}

/**
 * Itemized Payment Ledger Entry for Settlement Certificate
 */
export interface SettlementPaymentLedgerEntry {
  paymentId: string;
  reference?: string | null;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  status: string;
  recordedAt: string;
}

/**
 * Structured Reconciliation & Settlement Certificate
 */
export interface PoSettlementCertificate {
  certificateId: string;
  purchaseOrderId: string;
  poNumber?: string;
  generatedAt: string;
  generatedBy: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  };
  organization: {
    id: string;
    name?: string;
    gstin?: string;
  };
  supplier?: {
    id: string;
    name?: string;
    gstin?: string;
  };
  summary: PoSettlementSummary;
  invoiceLedger: SettlementInvoiceLedgerEntry[];
  paymentLedger: SettlementPaymentLedgerEntry[];
  settlementDeclaration: string;
  certificateHash: string;
}

/**
 * Pure exact-arithmetic calculation function for PO Cumulative Financial Settlement Summary.
 */
export function calculatePoSettlementSummary(
  po: { id: string; totalAmount: number; taxableTotal?: number; cgstTotal?: number; sgstTotal?: number; utgstTotal?: number; igstTotal?: number },
  invoices: Array<{
    id: string;
    amount: number;
    paidAmount?: number;
    balanceDue?: number;
    status: InvoiceStatus;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    utgstAmount?: number;
    igstAmount?: number;
  }>,
  payments: Array<{
    id: string;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
  }>,
  allocations: Array<{
    id?: string;
    paymentId: string;
    invoiceId: string;
    allocatedAmount: number;
    status?: PaymentAllocationStatus | string;
  }>,
): PoSettlementSummary {
  const poAuthorizedTotal = Math.round(Number(po.totalAmount || 0) * 100) / 100;

  // 1. Invoices breakdown
  const validInvoices = invoices.filter((i) => i.status !== 'REJECTED');
  const rejectedInvoices = invoices.filter((i) => i.status === 'REJECTED');

  const cumulativeInvoicedAmount = Math.round(
    validInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0) * 100,
  ) / 100;

  // Active allocations for valid invoices
  const validInvoiceIds = new Set(validInvoices.map((i) => i.id));
  const activeAllocations = allocations.filter(
    (a) => (!a.status || a.status === 'ALLOCATED') && validInvoiceIds.has(a.invoiceId),
  );

  const cumulativePaidAmount = Math.round(
    activeAllocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0) * 100,
  ) / 100;
  const cumulativeAllocatedAmount = cumulativePaidAmount;

  // Calculate per-invoice paid amounts from allocations
  const allocSumByInvoice: Record<string, number> = {};
  for (const a of activeAllocations) {
    allocSumByInvoice[a.invoiceId] = Math.round(((allocSumByInvoice[a.invoiceId] || 0) + Number(a.allocatedAmount || 0)) * 100) / 100;
  }

  let invoicedOutstandingAmount = 0;
  let paidInvoiceCount = 0;
  let partiallyPaidInvoiceCount = 0;
  let unpaidInvoiceCount = 0;

  let taxableTotal = po.taxableTotal ? Number(po.taxableTotal) : 0;
  let cgstTotal = po.cgstTotal ? Number(po.cgstTotal) : 0;
  let sgstTotal = po.sgstTotal ? Number(po.sgstTotal) : 0;
  let utgstTotal = po.utgstTotal ? Number(po.utgstTotal) : 0;
  let igstTotal = po.igstTotal ? Number(po.igstTotal) : 0;

  let hasInvoiceTaxes = false;
  let invTaxable = 0;
  let invCgst = 0;
  let invSgst = 0;
  let invUtgst = 0;
  let invIgst = 0;

  for (const inv of validInvoices) {
    const invAmount = Math.round(Number(inv.amount || 0) * 100) / 100;
    const invPaid = allocSumByInvoice[inv.id] !== undefined
      ? allocSumByInvoice[inv.id]!
      : Math.round(Number(inv.paidAmount || 0) * 100) / 100;

    const invBal = Math.max(0, Math.round((invAmount - invPaid) * 100) / 100);
    invoicedOutstandingAmount = Math.round((invoicedOutstandingAmount + invBal) * 100) / 100;

    if (invPaid >= invAmount && invAmount > 0) {
      paidInvoiceCount++;
    } else if (invPaid > 0) {
      partiallyPaidInvoiceCount++;
    } else {
      unpaidInvoiceCount++;
    }

    if (inv.taxableAmount !== undefined || inv.cgstAmount !== undefined || inv.igstAmount !== undefined) {
      hasInvoiceTaxes = true;
      invTaxable += Number(inv.taxableAmount || 0);
      invCgst += Number(inv.cgstAmount || 0);
      invSgst += Number(inv.sgstAmount || 0);
      invUtgst += Number(inv.utgstAmount || 0);
      invIgst += Number(inv.igstAmount || 0);
    }
  }

  if (hasInvoiceTaxes && (!po.taxableTotal && !po.cgstTotal && !po.igstTotal)) {
    taxableTotal = Math.round(invTaxable * 100) / 100;
    cgstTotal = Math.round(invCgst * 100) / 100;
    sgstTotal = Math.round(invSgst * 100) / 100;
    utgstTotal = Math.round(invUtgst * 100) / 100;
    igstTotal = Math.round(invIgst * 100) / 100;
  }

  const uninvoicedAuthorizationBalance = Math.max(
    0,
    Math.round((poAuthorizedTotal - cumulativeInvoicedAmount) * 100) / 100,
  );

  // Unallocated advances calculation from payments
  const allocSumByPayment: Record<string, number> = {};
  for (const a of allocations.filter((a) => !a.status || a.status === 'ALLOCATED')) {
    allocSumByPayment[a.paymentId] = Math.round(((allocSumByPayment[a.paymentId] || 0) + Number(a.allocatedAmount || 0)) * 100) / 100;
  }

  let unallocatedAdvanceAmount = 0;
  for (const pay of payments) {
    const payAmt = Math.round(Number(pay.amount || 0) * 100) / 100;
    const payAlloc = allocSumByPayment[pay.id] !== undefined
      ? allocSumByPayment[pay.id]!
      : Math.round(Number(payAmt - (pay.unallocatedAmount ?? payAmt)) * 100) / 100;
    const unalloc = Math.max(0, Math.round((payAmt - payAlloc) * 100) / 100);
    unallocatedAdvanceAmount = Math.round((unallocatedAdvanceAmount + unalloc) * 100) / 100;
  }

  const contractualExposure = Math.max(
    0,
    Math.round((poAuthorizedTotal - cumulativePaidAmount) * 100) / 100,
  );

  const settlementAmount = invoicedOutstandingAmount;
  const settledAmount = cumulativePaidAmount;
  const remainingSettlementAmount = invoicedOutstandingAmount;

  // Invariant reconciliation checks
  const isFullyReconciled =
    // 1. All valid invoices balance_due math holds
    validInvoices.every((inv) => {
      const invAmount = Math.round(Number(inv.amount || 0) * 100) / 100;
      const invPaid = allocSumByInvoice[inv.id] || 0;
      return invPaid <= invAmount;
    }) &&
    // 2. Payments conservation holds
    payments.every((pay) => {
      const payAmt = Math.round(Number(pay.amount || 0) * 100) / 100;
      const payAlloc = allocSumByPayment[pay.id] || 0;
      return payAlloc <= payAmt;
    });

  const isFullySettled =
    validInvoices.length > 0 &&
    cumulativeInvoicedAmount >= poAuthorizedTotal &&
    invoicedOutstandingAmount === 0 &&
    cumulativePaidAmount >= poAuthorizedTotal &&
    validInvoices.every((inv) => {
      const invAmount = Math.round(Number(inv.amount || 0) * 100) / 100;
      const invPaid = allocSumByInvoice[inv.id] !== undefined
        ? allocSumByInvoice[inv.id]!
        : Math.round(Number(inv.paidAmount || 0) * 100) / 100;
      return invPaid >= invAmount && inv.status === 'PAID';
    });

  return {
    purchaseOrderId: po.id,
    poAuthorizedTotal,
    cumulativeInvoicedAmount,
    cumulativePaidAmount,
    cumulativeAllocatedAmount,
    invoicedOutstandingAmount,
    uninvoicedAuthorizationBalance,
    unallocatedAdvanceAmount,
    contractualExposure,
    settlementAmount,
    settledAmount,
    remainingSettlementAmount,
    isFullyReconciled,
    isFullySettled,
    counts: {
      invoiceCount: validInvoices.length,
      paidInvoiceCount,
      partiallyPaidInvoiceCount,
      unpaidInvoiceCount,
      rejectedInvoiceCount: rejectedInvoices.length,
      paymentCount: payments.length,
      allocationCount: activeAllocations.length,
    },
    taxTotals: {
      taxableTotal: Math.round(taxableTotal * 100) / 100,
      cgstTotal: Math.round(cgstTotal * 100) / 100,
      sgstTotal: Math.round(sgstTotal * 100) / 100,
      utgstTotal: Math.round(utgstTotal * 100) / 100,
      igstTotal: Math.round(igstTotal * 100) / 100,
    },
  };
}

/**
 * Predicate checking if a Purchase Order is fully settled and eligible for COMPLETED state.
 */
export function isPurchaseOrderFullySettled(
  po: { id: string; totalAmount: number; taxableTotal?: number; cgstTotal?: number; sgstTotal?: number; utgstTotal?: number; igstTotal?: number },
  invoices: Array<{
    id: string;
    amount: number;
    paidAmount?: number;
    balanceDue?: number;
    status: InvoiceStatus;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    utgstAmount?: number;
    igstAmount?: number;
  }>,
  payments: Array<{
    id: string;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
  }>,
  allocations: Array<{
    id?: string;
    paymentId: string;
    invoiceId: string;
    allocatedAmount: number;
    status?: PaymentAllocationStatus | string;
  }>,
): boolean {
  const summary = calculatePoSettlementSummary(po, invoices, payments, allocations);
  return summary.isFullySettled;
}

/**
 * Generates an immutable, structured reconciliation and settlement certificate.
 */
export function generatePoSettlementCertificate(
  po: { id: string; poNumber?: string; totalAmount: number; taxableTotal?: number; cgstTotal?: number; sgstTotal?: number; utgstTotal?: number; igstTotal?: number },
  invoices: Array<{
    id: string;
    invoiceNumber?: string;
    amount: number;
    paidAmount?: number;
    balanceDue?: number;
    status: InvoiceStatus;
    taxableAmount?: number;
    gstAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    utgstAmount?: number;
    igstAmount?: number;
  }>,
  payments: Array<{
    id: string;
    reference?: string | null;
    amount: number;
    unallocatedAmount?: number;
    status?: string;
    recordedAt?: string;
  }>,
  allocations: Array<{
    id?: string;
    paymentId: string;
    invoiceId: string;
    allocatedAmount: number;
    status?: PaymentAllocationStatus | string;
  }>,
  generatedBy: { id: string; name?: string; email?: string; role?: string },
  organization: { id: string; name?: string; gstin?: string },
  supplier?: { id: string; name?: string; gstin?: string },
): PoSettlementCertificate {
  const summary = calculatePoSettlementSummary(po, invoices, payments, allocations);
  const now = new Date().toISOString();
  const timestampClean = now.replace(/[-:T.Z]/g, '').slice(0, 14);
  const poIdSuffix = po.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const certificateId = `SETTLE-CERT-${poIdSuffix}-${timestampClean}`;

  const validInvoices = invoices.filter((i) => i.status !== 'REJECTED');
  const allocSumByInvoice: Record<string, number> = {};
  for (const a of allocations.filter((a) => !a.status || a.status === 'ALLOCATED')) {
    allocSumByInvoice[a.invoiceId] = Math.round(((allocSumByInvoice[a.invoiceId] || 0) + Number(a.allocatedAmount || 0)) * 100) / 100;
  }

  const invoiceLedger: SettlementInvoiceLedgerEntry[] = validInvoices.map((inv) => {
    const paidAmt = allocSumByInvoice[inv.id] !== undefined
      ? allocSumByInvoice[inv.id]!
      : Math.round(Number(inv.paidAmount || 0) * 100) / 100;
    const balDue = Math.max(0, Math.round((Number(inv.amount) - paidAmt) * 100) / 100);

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`,
      amount: Math.round(Number(inv.amount) * 100) / 100,
      paidAmount: paidAmt,
      balanceDue: balDue,
      status: inv.status,
      taxableAmount: inv.taxableAmount,
      gstAmount: inv.gstAmount,
    };
  });

  const allocSumByPayment: Record<string, number> = {};
  for (const a of allocations.filter((a) => !a.status || a.status === 'ALLOCATED')) {
    allocSumByPayment[a.paymentId] = Math.round(((allocSumByPayment[a.paymentId] || 0) + Number(a.allocatedAmount || 0)) * 100) / 100;
  }

  const paymentLedger: SettlementPaymentLedgerEntry[] = payments.map((pay) => {
    const payAmt = Math.round(Number(pay.amount) * 100) / 100;
    const allocAmt = allocSumByPayment[pay.id] !== undefined
      ? allocSumByPayment[pay.id]!
      : Math.round(Number(payAmt - (pay.unallocatedAmount ?? payAmt)) * 100) / 100;
    const unallocAmt = Math.max(0, Math.round((payAmt - allocAmt) * 100) / 100);

    return {
      paymentId: pay.id,
      reference: pay.reference || null,
      amount: payAmt,
      allocatedAmount: allocAmt,
      unallocatedAmount: unallocAmt,
      status: pay.status || 'RECORDED',
      recordedAt: pay.recordedAt || now,
    };
  });

  const declaration = summary.isFullySettled
    ? `This certifies that Purchase Order ${po.poNumber || po.id} has been fully settled in accordance with all contractual and statutory terms. Total authorized amount of ₹${summary.poAuthorizedTotal.toFixed(2)} has been fully invoiced (₹${summary.cumulativeInvoicedAmount.toFixed(2)}) and settled (₹${summary.cumulativePaidAmount.toFixed(2)}) with zero outstanding balance due.`
    : `This settlement statement reflects partial reconciliation for Purchase Order ${po.poNumber || po.id}. Total authorized: ₹${summary.poAuthorizedTotal.toFixed(2)}, Invoiced: ₹${summary.cumulativeInvoicedAmount.toFixed(2)}, Settled: ₹${summary.cumulativePaidAmount.toFixed(2)}, Outstanding Invoiced Balance: ₹${summary.invoicedOutstandingAmount.toFixed(2)}.`;

  // Deterministic lightweight hash representation
  const rawPayload = `${certificateId}|${po.id}|${summary.poAuthorizedTotal}|${summary.cumulativePaidAmount}|${summary.invoicedOutstandingAmount}|${now}`;
  let hashVal = 0;
  for (let i = 0; i < rawPayload.length; i++) {
    const char = rawPayload.charCodeAt(i);
    hashVal = (hashVal << 5) - hashVal + char;
    hashVal |= 0;
  }
  const certificateHash = `0x${Math.abs(hashVal).toString(16).padStart(8, '0')}${Buffer.from(certificateId).toString('hex').slice(0, 16)}`;

  return {
    certificateId,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    generatedAt: now,
    generatedBy,
    organization,
    supplier,
    summary,
    invoiceLedger,
    paymentLedger,
    settlementDeclaration: declaration,
    certificateHash,
  };
}

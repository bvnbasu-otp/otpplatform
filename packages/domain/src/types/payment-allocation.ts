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

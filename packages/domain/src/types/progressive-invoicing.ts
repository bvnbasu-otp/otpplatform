import type { InvoiceType, MilestoneStatus } from '../enums/procurement';
import type { TaxSnapshot } from '../tax/tax-snapshot';

/**
 * Normalized Purchase Order Line Item (Phase 5A + Phase 5B Tax Splitting)
 */
export interface PurchaseOrderLineItem {
  id: string;
  purchaseOrderId: string;
  itemIndex: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  // Phase 5B Statutory Tax Columns
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Milestone Allocation Definition
 */
export interface MilestoneAllocation {
  id: string;
  workOrderId: string;
  milestoneIndex: number;
  milestoneTitle: string;
  targetPercentage: number;
  allocatedAmount: number;
  invoicedAmount: number;
  status: MilestoneStatus;
  isInvoiced: boolean;
  deliverablePhotos?: string[];
  supplierNotes?: string | null;
  buyerNotes?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Normalized Invoice Line Item (Phase 5A + Phase 5B Tax Splitting)
 */
export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  poLineItemId?: string | null;
  milestoneId?: string | null;
  lineIndex: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  // Phase 5B Statutory Tax Columns
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Progressive Invoice Overview (Phase 5A + Phase 5B Tax Snapshots)
 */
export interface ProgressiveInvoice {
  id: string;
  purchaseOrderId?: string;
  workOrderId: string;
  milestoneId?: string | null;
  supplierId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  amount: number;
  currency: string;
  status: string;
  documentUrl?: string | null;
  submittedAt: string;
  approvedAt?: string | null;
  lineItems?: InvoiceLineItem[];
  // Phase 5B Statutory GST Metadata & Immutable Tax Snapshot
  placeOfSupplyStateCode?: string | null;
  placeOfSupplyBasis?: string | null;
  taxSnapshot?: TaxSnapshot | null;
  taxableTotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  utgstTotal?: number;
  igstTotal?: number;
}

/**
 * Summary of progressive invoicing status for a Purchase Order
 */
export interface PoInvoicingSummary {
  purchaseOrderId: string;
  totalAuthorizedAmount: number;
  alreadyInvoicedAmount: number;
  approvedInvoicedAmount: number;
  remainingInvoiceableAmount: number;
  invoiceCount: number;
  isFullyInvoiced: boolean;
}

/**
 * Pure Mathematical Calculators for Phase 5A Progressive Invoicing
 */

/**
 * Calculates remaining invoiceable amount given a PO total and existing invoices.
 * Invariant: (PO Authorized Amount - Already Invoiced Amount = Remaining Invoiceable Amount)
 */
export function calculateRemainingInvoiceableAmount(
  poTotalAmount: number,
  existingInvoices: Array<{ amount: number; status: string }>,
): {
  alreadyInvoicedAmount: number;
  approvedInvoicedAmount: number;
  remainingInvoiceableAmount: number;
  isFullyInvoiced: boolean;
} {
  const nonRejected = existingInvoices.filter((inv) => inv.status !== 'REJECTED');
  const alreadyInvoicedAmount = nonRejected.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const approvedInvoicedAmount = nonRejected
    .filter((inv) => inv.status === 'APPROVED' || inv.status === 'PAID')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  const rawRemaining = poTotalAmount - alreadyInvoicedAmount;
  const remainingInvoiceableAmount = Math.max(0, Math.round(rawRemaining * 100) / 100);
  const isFullyInvoiced = remainingInvoiceableAmount <= 0.01;

  return {
    alreadyInvoicedAmount: Math.round(alreadyInvoicedAmount * 100) / 100,
    approvedInvoicedAmount: Math.round(approvedInvoicedAmount * 100) / 100,
    remainingInvoiceableAmount,
    isFullyInvoiced,
  };
}

/**
 * Validates whether adding a new invoice amount complies with the PO total authorization.
 */
export function validateInvoiceAmountAgainstPo(
  poTotalAmount: number,
  existingInvoices: Array<{ amount: number; status: string }>,
  newInvoiceAmount: number,
  tolerance = 0.05,
): {
  valid: boolean;
  remainingAmount: number;
  exceededBy?: number;
  error?: string;
} {
  if (newInvoiceAmount <= 0) {
    return {
      valid: false,
      remainingAmount: 0,
      error: 'Invoice amount must be strictly greater than 0',
    };
  }

  const { alreadyInvoicedAmount, remainingInvoiceableAmount } = calculateRemainingInvoiceableAmount(
    poTotalAmount,
    existingInvoices,
  );

  const potentialTotal = alreadyInvoicedAmount + newInvoiceAmount;
  if (potentialTotal > poTotalAmount + tolerance) {
    const exceededBy = Math.round((potentialTotal - poTotalAmount) * 100) / 100;
    return {
      valid: false,
      remainingAmount: remainingInvoiceableAmount,
      exceededBy,
      error: `Invoice amount ₹${newInvoiceAmount} exceeds remaining invoiceable limit of ₹${remainingInvoiceableAmount} by ₹${exceededBy}`,
    };
  }

  return {
    valid: true,
    remainingAmount: remainingInvoiceableAmount,
  };
}

/**
 * Validates milestone percentage allocations across a set of milestones against the PO total.
 */
export function validateMilestoneAllocation(
  poTotalAmount: number,
  milestones: Array<{ allocatedAmount?: number; targetPercentage?: number }>,
): {
  valid: boolean;
  totalAllocated: number;
  difference: number;
  error?: string;
} {
  const totalAllocated = milestones.reduce((sum, m) => {
    if (m.allocatedAmount != null && m.allocatedAmount > 0) {
      return sum + Number(m.allocatedAmount);
    }
    if (m.targetPercentage != null) {
      return sum + (poTotalAmount * m.targetPercentage) / 100;
    }
    return sum;
  }, 0);

  const diff = Math.round((totalAllocated - poTotalAmount) * 100) / 100;
  if (Math.abs(diff) > 1.0) {
    return {
      valid: false,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      difference: diff,
      error: `Sum of milestone allocations (₹${totalAllocated}) does not match PO authorized amount (₹${poTotalAmount})`,
    };
  }

  return {
    valid: true,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    difference: 0,
  };
}

/**
 * Calculates line item totals with GST (18% default).
 */
export function calculatePoLineItemTotal(
  quantity: number,
  unitPrice: number,
  gstRate = 18.0,
): {
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
} {
  const taxableAmount = Math.round(quantity * unitPrice * 100) / 100;
  const gstAmount = Math.round(((taxableAmount * gstRate) / 100) * 100) / 100;
  const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;

  return {
    taxableAmount,
    gstAmount,
    totalAmount,
  };
}

/**
 * Validates that invoice line items match the parent invoice amount.
 */
export function validateInvoiceLineItemsSum(
  invoiceAmount: number,
  lineItems: Array<{ totalAmount: number }>,
  tolerance = 0.05,
): {
  valid: boolean;
  linesTotal: number;
  difference: number;
  error?: string;
} {
  const linesTotal = lineItems.reduce((sum, li) => sum + Number(li.totalAmount || 0), 0);
  const diff = Math.round((linesTotal - invoiceAmount) * 100) / 100;

  if (Math.abs(diff) > tolerance) {
    return {
      valid: false,
      linesTotal: Math.round(linesTotal * 100) / 100,
      difference: diff,
      error: `Sum of invoice line items (₹${linesTotal}) does not match invoice amount (₹${invoiceAmount})`,
    };
  }

  return {
    valid: true,
    linesTotal: Math.round(linesTotal * 100) / 100,
    difference: 0,
  };
}

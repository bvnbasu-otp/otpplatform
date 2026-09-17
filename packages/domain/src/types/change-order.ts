export type ChangeOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'COMMITTED'
  | 'REJECTED';

export type ChangeOrderType =
  | 'SCOPE_EXPANSION'
  | 'SCOPE_REDUCTION'
  | 'SPECIFICATION_CHANGE'
  | 'RATE_ADJUSTMENT'
  | 'ADMINISTRATIVE';

export interface PoChangeOrderItem {
  id: string;
  changeOrderId: string;
  poLineItemId?: string | null;
  itemIndex: number;
  description: string;
  hsnSacCode?: string | null;
  quantityDelta: number;
  unit: string;
  unitPrice: number;
  amountDelta: number;
  taxAmountDelta: number;
  totalDelta: number;
  notes?: string | null;
}

export interface PoChangeOrder {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  changeOrderNumber: string;
  sequence: number;
  title: string;
  reason: string;
  status: ChangeOrderStatus;
  changeType: ChangeOrderType;
  netAmountDelta: number;
  taxAmountDelta: number;
  totalDelta: number;
  previousPoTotal: number;
  revisedPoTotal: number;
  items?: PoChangeOrderItem[];
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  committedBy?: string | null;
  committedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeOrderSummary {
  id: string;
  changeOrderNumber: string;
  sequence: number;
  title: string;
  status: ChangeOrderStatus;
  changeType: ChangeOrderType;
  totalDelta: number;
  revisedPoTotal: number;
  createdAt: string;
  committedAt?: string | null;
}

export interface CalculateChangeOrderTotalsResult {
  netAmountDelta: number;
  taxAmountDelta: number;
  totalDelta: number;
}

/**
 * Calculates sum of line item deltas for a Change Order.
 */
export function calculateChangeOrderTotals(
  items: Array<{
    amountDelta?: number;
    taxAmountDelta?: number;
    totalDelta?: number;
    quantityDelta?: number;
    unitPrice?: number;
  }>,
): CalculateChangeOrderTotalsResult {
  let netAmount = 0;
  let taxAmount = 0;
  let total = 0;

  for (const item of items) {
    let itemNetAmount = Number(item.amountDelta ?? 0);
    // If amountDelta is not supplied but quantityDelta & unitPrice are, calculate it
    if (
      item.amountDelta === undefined &&
      typeof item.quantityDelta === 'number' &&
      typeof item.unitPrice === 'number'
    ) {
      itemNetAmount =
        Math.round(item.quantityDelta * item.unitPrice * 100) / 100;
    }

    const itemTaxAmount = Number(item.taxAmountDelta ?? 0);
    const itemTotal =
      item.totalDelta !== undefined
        ? Number(item.totalDelta)
        : Math.round((itemNetAmount + itemTaxAmount) * 100) / 100;

    netAmount += itemNetAmount;
    taxAmount += itemTaxAmount;
    total += itemTotal;
  }

  return {
    netAmountDelta: Math.round(netAmount * 100) / 100,
    taxAmountDelta: Math.round(taxAmount * 100) / 100,
    totalDelta: Math.round(total * 100) / 100,
  };
}

/**
 * Formula: Current Authorized Commitment = Original PO Total + sum(Committed Deltas)
 */
export function calculateAuthorizedPoCommitment(
  originalPoTotal: number,
  committedChangeOrders: Array<{
    totalDelta: number;
    status?: ChangeOrderStatus | string;
  }>,
): number {
  const cleanOriginal = Math.round((originalPoTotal || 0) * 100) / 100;
  const committedDeltas = committedChangeOrders
    .filter((co) => !co.status || co.status === 'COMMITTED')
    .reduce((sum, co) => sum + Number(co.totalDelta || 0), 0);

  return Math.round((cleanOriginal + committedDeltas) * 100) / 100;
}

export interface ValidateChangeOrderCommitmentParams {
  originalPoTotal: number;
  existingCommittedChangeOrders: Array<{
    totalDelta: number;
    status?: ChangeOrderStatus | string;
  }>;
  changeOrderToCommit: {
    totalDelta: number;
  };
  cumulativeInvoicedAmount: number;
}

export interface ValidateChangeOrderCommitmentResult {
  isValid: boolean;
  currentAuthorizedTotal: number;
  revisedAuthorizedTotal: number;
  cumulativeInvoicedAmount: number;
  error?: string;
}

/**
 * Validates whether a PO Change Order can be committed.
 * Invariants:
 * 1. Negative Change Order Guard: Revised PO Total >= Cumulative Invoiced Amount
 *    (Cannot reduce commitment below already billed / approved obligations).
 * 2. Revised PO Total cannot be negative.
 */
export function validateChangeOrderCommitment(
  params: ValidateChangeOrderCommitmentParams,
): ValidateChangeOrderCommitmentResult {
  const currentAuthorized = calculateAuthorizedPoCommitment(
    params.originalPoTotal,
    params.existingCommittedChangeOrders,
  );

  const delta = Math.round(params.changeOrderToCommit.totalDelta * 100) / 100;
  const revisedAuthorized = Math.round((currentAuthorized + delta) * 100) / 100;
  const invoiced =
    Math.round((params.cumulativeInvoicedAmount || 0) * 100) / 100;

  if (revisedAuthorized < 0) {
    return {
      isValid: false,
      currentAuthorizedTotal: currentAuthorized,
      revisedAuthorizedTotal: revisedAuthorized,
      cumulativeInvoicedAmount: invoiced,
      error: `Change order would reduce PO authorized total to negative amount (₹${revisedAuthorized})`,
    };
  }

  if (revisedAuthorized < invoiced) {
    return {
      isValid: false,
      currentAuthorizedTotal: currentAuthorized,
      revisedAuthorizedTotal: revisedAuthorized,
      cumulativeInvoicedAmount: invoiced,
      error: `Negative change order rejection: Revised PO commitment ₹${revisedAuthorized} cannot be less than cumulative invoiced amount ₹${invoiced} (REV-5C4-CO-BELOW-INVOICED)`,
    };
  }

  return {
    isValid: true,
    currentAuthorizedTotal: currentAuthorized,
    revisedAuthorizedTotal: revisedAuthorized,
    cumulativeInvoicedAmount: invoiced,
  };
}

/**
 * Valid transitions for PO Change Orders:
 * DRAFT -> SUBMITTED | REJECTED
 * SUBMITTED -> APPROVED | REJECTED | DRAFT
 * APPROVED -> COMMITTED | REJECTED
 * COMMITTED -> (Terminal)
 * REJECTED -> DRAFT (for revision)
 */
export const ALLOWED_CHANGE_ORDER_TRANSITIONS: Record<
  ChangeOrderStatus,
  ChangeOrderStatus[]
> = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['COMMITTED', 'REJECTED'],
  COMMITTED: [],
  REJECTED: ['DRAFT'],
};

export function canTransitionChangeOrder(
  currentStatus: ChangeOrderStatus,
  nextStatus: ChangeOrderStatus,
): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = ALLOWED_CHANGE_ORDER_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

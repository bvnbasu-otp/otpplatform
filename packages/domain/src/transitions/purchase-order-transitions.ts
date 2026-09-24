import type { PurchaseOrderStatus } from '../enums/procurement';

const ALLOWED: Partial<
  Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export interface PurchaseOrderCancellationValidationParams {
  currentStatus: PurchaseOrderStatus;
  cancellationReason?: string | null;
  supplierAcceptedAt?: string | null;
}

export interface PurchaseOrderCancellationValidationResult {
  canCancel: boolean;
  reason?: string;
  rejectionReason?: string;
}

/**
 * Validates whether a Purchase Order can be cancelled by the buyer.
 *
 * Core Directives:
 * 1. An Individual buyer (or authorized procurement lead) can cancel a PO BEFORE supplier acceptance,
 *    even if supplier identity has already been revealed, provided a valid cancellation reason is given.
 * 2. Cancellation is strictly blocked after supplier acceptance (status ACCEPTED, IN_PROGRESS, COMPLETED).
 */
export function validatePurchaseOrderCancellation(
  params: PurchaseOrderCancellationValidationParams,
): PurchaseOrderCancellationValidationResult {
  const { currentStatus, cancellationReason, supplierAcceptedAt } = params;

  // Cancellation is strictly blocked after supplier acceptance or during downstream execution
  if (
    currentStatus === 'ACCEPTED' ||
    currentStatus === 'IN_PROGRESS' ||
    currentStatus === 'COMPLETED' ||
    Boolean(supplierAcceptedAt)
  ) {
    return {
      canCancel: false,
      rejectionReason:
        'Cancellation is strictly blocked after supplier acceptance. Formal dispute or mutual contract amendment is required.',
    };
  }

  if (currentStatus === 'CANCELLED') {
    return {
      canCancel: false,
      rejectionReason: 'Purchase Order is already cancelled.',
    };
  }

  // Pre-acceptance cancellation requires a valid reason
  const trimmedReason = cancellationReason?.trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    return {
      canCancel: false,
      rejectionReason:
        'A valid cancellation reason (minimum 5 characters) is required to cancel the Purchase Order.',
    };
  }

  // Can cancel before supplier acceptance (DRAFT, PENDING_APPROVAL, APPROVED, ISSUED)
  const isPreAcceptanceStatus = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ISSUED',
  ].includes(currentStatus);

  if (!isPreAcceptanceStatus) {
    return {
      canCancel: false,
      rejectionReason: `Cannot cancel Purchase Order in status "${currentStatus}".`,
    };
  }

  return {
    canCancel: true,
    reason: trimmedReason,
  };
}

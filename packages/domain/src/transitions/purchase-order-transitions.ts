import type { PurchaseOrderStatus } from '../enums/procurement';

const ALLOWED: Partial<
  Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['ISSUED', 'CANCELLED'],
  ISSUED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/**
 * Purchase-order presentation.
 *
 * Operational completion is `purchase_orders.status = COMPLETED`.
 * Invoice payment and payment verification are financial evidence only.
 * They do not mean delivery, inspection sign-off, or closeout.
 */

export interface PoLifecycleInput {
  status: string;
  progressPercent?: number | null;
  buyerAcceptedAt?: string | null;
  workOrderStatus?: string | null;
  invoiceStatus?: string | null;
  paymentStatus?: string | null;
}

export type PoCoreStage = 'SETTLED' | 'INVOICED' | 'PO_ISSUED';

export function isPurchaseOrderComplete(status: string): boolean {
  return status === 'COMPLETED';
}

export function hasOffPlatformPaymentEvidence(input: Pick<PoLifecycleInput, 'invoiceStatus' | 'paymentStatus'>): boolean {
  return input.invoiceStatus === 'PAID' || input.paymentStatus === 'VERIFIED' || input.paymentStatus === 'RECORDED';
}

export function purchaseOrderLinearStep(input: PoLifecycleInput): 13 | 14 | 15 {
  if (isPurchaseOrderComplete(input.status)) return 15;
  if (
    input.status === 'IN_PROGRESS' ||
    input.status === 'ACCEPTED' ||
    (input.progressPercent ?? 0) > 0 ||
    Boolean(input.buyerAcceptedAt)
  ) {
    return 14;
  }
  return 13;
}

/** Stage for the navigator. Payment never promotes an open PO to closeout. */
export function purchaseOrderCoreStage(input: PoLifecycleInput): PoCoreStage {
  if (isPurchaseOrderComplete(input.status)) return 'SETTLED';
  if (
    input.invoiceStatus === 'SUBMITTED' ||
    input.invoiceStatus === 'APPROVED' ||
    input.invoiceStatus === 'PARTIALLY_PAID' ||
    input.invoiceStatus === 'PAID' ||
    input.paymentStatus === 'RECORDED' ||
    input.paymentStatus === 'VERIFIED'
  ) {
    return 'INVOICED';
  }
  return 'PO_ISSUED';
}

export interface FulfillmentChip {
  label: string;
  className: string;
}

export function fulfillmentChip(input: PoLifecycleInput): FulfillmentChip {
  if (input.status === 'CANCELLED') {
    return { label: 'Cancelled', className: 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300' };
  }
  if (input.workOrderStatus === 'DISPUTED') {
    return { label: 'Under audit', className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' };
  }
  if (isPurchaseOrderComplete(input.status)) {
    return {
      label: 'Delivered & Accepted',
      className: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300',
    };
  }
  if (input.buyerAcceptedAt) {
    return {
      label: 'Inspection signed off',
      className: 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300',
    };
  }
  const progress = input.progressPercent ?? 0;
  if (progress >= 50) {
    return { label: 'In Transit / Staged', className: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300' };
  }
  if (progress > 0 || input.status === 'ACCEPTED' || input.status === 'IN_PROGRESS') {
    return { label: 'In Production', className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' };
  }
  return { label: 'Order Issued', className: 'bg-muted text-muted-foreground border-border' };
}

/** Secondary label. Never replaces the operational chip. */
export function paymentEvidenceLabel(input: PoLifecycleInput): string | null {
  if (isPurchaseOrderComplete(input.status)) return null;
  if (input.paymentStatus === 'RECORDED') return 'Payment evidence awaiting verification';
  if (input.invoiceStatus === 'PAID' || input.paymentStatus === 'VERIFIED') return 'Off-platform payment recorded';
  if (input.invoiceStatus === 'APPROVED' || input.invoiceStatus === 'PARTIALLY_PAID') return 'Invoice open';
  return null;
}

export function listExecutionLabel(input: PoLifecycleInput): string {
  if (input.status === 'CANCELLED') return 'Cancelled';
  if (isPurchaseOrderComplete(input.status)) return 'Completed';
  if (input.invoiceStatus === 'PAID' || input.paymentStatus === 'VERIFIED') return 'In execution · payment recorded';
  return 'In execution';
}

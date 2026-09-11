import type { PurchaseOrderStatus, WorkOrderStatus } from '@otp/domain';

export interface PurchaseOrderSummary {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  totalAmount: number;
  currency: string;
  supplierId: string;
  rfqId: string;
  organizationId?: string;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  rfqTitle?: string;
  // Supplier Legal & Tax Identity
  supplierName?: string;
  supplierLegalName?: string | null;
  supplierGstin?: string | null;
  supplierGstVerified?: boolean;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  // Buyer Legal & Tax Identity (for GST ITC benefits & direct tax invoices)
  buyerOrgId?: string;
  buyerOrgName?: string;
  buyerOrgType?: string;
  buyerGstin?: string | null;
  buyerContactPerson?: string | null;
  buyerContactPhone?: string | null;
  buyerContactEmail?: string | null;
  buyerAddress?: Record<string, unknown> | string | null;
  buyerCity?: string | null;
  // Lifecycle and Progress
  progressPercent?: number;
  workOrderId?: string;
  workOrderStatus?: WorkOrderStatus;
  buyerAcceptedAt?: string | null;
  isSettled?: boolean;
  invoiceStatus?: string;
  paymentStatus?: string;
}

export interface WorkOrderSummary {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  status: WorkOrderStatus;
  title: string;
  progressPercent: number;
  completedAt: string | null;
  buyerAcceptedAt: string | null;
  inspectionNotes: string | null;
  rating?: number | null;
  reviewText?: string | null;
  poNumber?: string;
}

/** Valid buyer-initiated PO transitions (presentation layer guard). */
export const BUYER_PO_ACTIONS: Partial<
  Record<PurchaseOrderStatus, { label: string; next: PurchaseOrderStatus }[]>
> = {
  DRAFT: [{ label: 'Submit for approval', next: 'PENDING_APPROVAL' }],
  PENDING_APPROVAL: [{ label: 'Approve', next: 'APPROVED' }],
  APPROVED: [{ label: 'Issue to supplier', next: 'ISSUED' }],
  ACCEPTED: [{ label: 'Mark in progress', next: 'IN_PROGRESS' }],
  IN_PROGRESS: [{ label: 'Mark completed', next: 'COMPLETED' }],
};

export const SUPPLIER_PO_ACTIONS: Partial<
  Record<PurchaseOrderStatus, { label: string; next: PurchaseOrderStatus }[]>
> = {
  ISSUED: [{ label: 'Accept purchase order', next: 'ACCEPTED' }],
};

export function formatMoney(amount: number | null | undefined, currency: string = 'INR'): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    const validCurrency = (currency && typeof currency === 'string' && currency.trim())
      ? currency.trim().toUpperCase()
      : 'INR';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: validCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

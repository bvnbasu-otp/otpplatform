import type { CoreProcurementState } from '@/features/lifecycle';
import type { OrganizationRequirementSummary } from '@/features/requirement/api/requirements';
import type { SupplierInvitation } from '@/features/supplier/types/supplier-quote';
import type { PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';

export type ActionPriority = 'P0' | 'P1' | 'P2';

export interface BuyerActionItem {
  id: string;
  requirement: OrganizationRequirementSummary;
  title: string;
  category: string;
  statusLabel: string;
  statusIcon: string;
  whyText: string;
  actionLabel: string;
  actionUrl: string;
  priority: ActionPriority;
  priorityTag: string | null;
  coreState: CoreProcurementState;
  quotesCount: number;
  minQuotesRequired: number;
  rfqId: string | null;
}

export interface BuyerProcurementItem {
  id: string;
  requirement: OrganizationRequirementSummary;
  title: string;
  category: string;
  createdAt: string;
  statusLabel: string;
  statusIcon: string;
  statusClass: string;
  coreState: CoreProcurementState;
  quotesCount: number;
  minQuotesRequired: number;
  workOrderProgressPercent: number | null;
  actionLabel: string;
  actionUrl: string;
  isActionRequired: boolean;
  rfqId: string | null;
}

export interface SupplierActionItem {
  id: string;
  type: 'QUOTE_DRAFT' | 'PO_ACCEPTANCE' | 'RFQ_CLOSING_SOON' | 'DELIVERY_PENDING';
  title: string;
  subtitle: string;
  priority: ActionPriority;
  statusLabel: string;
  whyText: string;
  actionLabel: string;
  actionUrl: string;
  deadline?: string | null;
  publicRef?: string | null;
}

export interface SupplierOpportunityItem {
  id: string;
  invitation: SupplierInvitation;
  title: string;
  publicRef: string | null;
  anonymousLabel: string;
  buyerDisplayName: string;
  buyerAnonymous: boolean;
  quoteDeadline: string | null;
  deadlineCountdown: string;
  invitedAt: string;
  actionUrl: string;
  isClosingSoon: boolean;
  category?: string | null;
  subcategory?: string | null;
  deliveryCity?: string | null;
  quantityText?: string | null;
  status?: string;
  statusLabel?: string;
}

export interface SupplierActiveQuoteItem {
  id: string;
  invitation: SupplierInvitation;
  title: string;
  publicRef: string | null;
  statusLabel: string;
  rfqStatus: string;
  actionUrl: string;
  submittedDate?: string | null;
}

export interface HomeActivityEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  relativeTime: string;
  icon: string;
  category: 'BUYER' | 'SUPPLIER';
  targetUrl?: string;
}

/**
 * OTP Next — RFQ & Quotation Lifecycle Contracts
 * Modules 11, 13
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 11: RFQ Lifecycle
// ==========================================

export type RfqStatus = 'DRAFT' | 'PUBLISHED' | 'QUOTES_RECEIVED' | 'EVALUATION' | 'AWARDED' | 'CANCELLED';

export type RfqCancellationReasonCode =
  | 'NO_SUITABLE_QUOTES'
  | 'BUDGET_RESTRAINTS'
  | 'REQUIREMENT_POSTPONED'
  | 'DUPLICATE_OR_ERROR'
  | 'PROCUREMENT_CANCELLED_OTHER';

export interface RfqLineItemDto {
  itemId: string;
  itemDescription: string;
  quantity: number;
  uom: string;
  targetUnitBudget?: number | null;
}

export interface RfqDetailsDto {
  rfqId: string;
  title: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string | null;
  status: RfqStatus;
  deliveryPincode: string;
  deliveryAddressSummary: string;
  requiredDeliveryDate?: string | null;
  items: RfqLineItemDto[];
  attachmentCount: number;
  quotesReceivedCount: number;
  createdAt: string;
  publishedAt?: string | null;
}

export interface CreateRfqDraftInput {
  title: string;
  categoryId: string;
  subcategoryId?: string;
  deliveryAddressId: string;
  requiredDeliveryDate?: string;
  items: Array<{
    itemDescription: string;
    quantity: number;
    uom: string;
    targetUnitBudget?: number;
  }>;
}

export interface UpdateRfqDraftInput {
  rfqId: string;
  title?: string;
  categoryId?: string;
  subcategoryId?: string;
  deliveryAddressId?: string;
  requiredDeliveryDate?: string;
  items?: Array<{
    itemDescription: string;
    quantity: number;
    uom: string;
    targetUnitBudget?: number;
  }>;
}

export interface RfqLifecycleContract {
  getRfqById(actor: ActorContext, rfqId: string): Promise<Result<RfqDetailsDto, ServiceError>>;
  listBuyerRfqs(actor: ActorContext, statusFilter?: RfqStatus): Promise<Result<RfqDetailsDto[], ServiceError>>;
  createRfqDraft(actor: ActorContext, input: CreateRfqDraftInput): Promise<Result<RfqDetailsDto, ServiceError>>;
  updateRfqDraft(actor: ActorContext, input: UpdateRfqDraftInput): Promise<Result<RfqDetailsDto, ServiceError>>;
  publishRfq(actor: ActorContext, rfqId: string): Promise<Result<RfqDetailsDto, ServiceError>>;
  cancelRfq(actor: ActorContext, rfqId: string, cancellationReason: string): Promise<Result<{ cancelled: boolean }, ServiceError>>;
}

// ==========================================
// Module 13: Quotation Management
// ==========================================

export interface QuoteLineItemDto {
  itemId: string;
  rfqLineItemId: string;
  unitPrice: number;
  quantity: number;
  gstRatePercentage: number;
  gstAmount: number;
  totalLandedAmount: number;
}

export interface IdentityProtectedQuoteDto {
  quoteId: string;
  rfqId: string;
  pseudonymLabel: string; // e.g. "Supplier A", "Supplier B"
  totalBaseAmount: number;
  totalGstAmount: number;
  totalLandedCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  validUntil: string;
  meritScore?: number | null;
  items: QuoteLineItemDto[];
  submittedAt: string;
}

export interface SupplierQuoteDetailsDto extends IdentityProtectedQuoteDto {
  supplierId: string;
  isRevealedToBuyer: boolean;
}

export interface SubmitQuoteInput {
  rfqId: string;
  deliveryDays: number;
  warrantyMonths: number;
  validityDays?: number;
  items: Array<{
    rfqLineItemId: string;
    unitPrice: number;
    gstRatePercentage: number; // 5, 12, 18, 28
  }>;
}

export interface QuotationManagementContract {
  getQuoteById(actor: ActorContext, quoteId: string): Promise<Result<IdentityProtectedQuoteDto, ServiceError>>;
  listQuotesForRfq(actor: ActorContext, rfqId: string): Promise<Result<IdentityProtectedQuoteDto[], ServiceError>>;
  listSupplierOwnQuotes(actor: ActorContext): Promise<Result<SupplierQuoteDetailsDto[], ServiceError>>;
  submitQuote(actor: ActorContext, input: SubmitQuoteInput): Promise<Result<SupplierQuoteDetailsDto, ServiceError>>;
  withdrawQuote(actor: ActorContext, quoteId: string): Promise<Result<{ withdrawn: boolean }, ServiceError>>;
}

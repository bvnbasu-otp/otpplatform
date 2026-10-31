/**
 * OTP Next — Orders & Service Tracking Contracts (PO / WO & Tracking)
 * Modules 18, 19
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 18: Purchase Orders & Work Orders
// ==========================================

export type TaxRegime = 'INTRA_STATE_CGST_SGST' | 'INTER_STATE_IGST' | 'SEZ_ZERO_RATED';
export type PoStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'IN_FULFILLMENT' | 'DISPUTED' | 'COMPLETED' | 'CANCELLED';

export type OrderDisputeReasonCode =
  | 'NON_DELIVERY'
  | 'QUALITY_DEFECT'
  | 'TIMELINE_BREACH'
  | 'SPECIFICATION_MISMATCH'
  | 'INCORRECT_BILLING'
  | 'OTHER_DISPUTE';

export type OrderCancellationReasonCode =
  | 'MUTUAL_CONSENT'
  | 'SUPPLIER_UNRESPONSIVE'
  | 'UNRESOLVED_DISPUTE'
  | 'FORCE_MAJEURE';

export interface PoTaxBreakdownDto {
  taxRegime: TaxRegime;
  baseAmount: number;
  freightAmount: number;
  cgstRatePercentage?: number;
  cgstAmount?: number;
  sgstRatePercentage?: number;
  sgstAmount?: number;
  igstRatePercentage?: number;
  igstAmount?: number;
  totalTaxAmount: number;
  totalLandedCost: number;
  lutReferenceNumber?: string | null;
}

export interface PoMilestoneScheduleDto {
  milestoneId: string;
  milestoneIndex: number;
  title: string;
  percentageAllocation: number;
  expectedAmount: number;
  dueDate: string;
  isCompleted: boolean;
}

export interface DisputeCaseDto {
  disputeId: string;
  poId: string;
  reasonCode: OrderDisputeReasonCode;
  description: string;
  raisedByProfileId: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
}

export interface PurchaseOrderDto {
  poId: string;
  poNumber: string; // e.g. "PO-2026-00042"
  rfqId: string;
  awardId: string;
  buyerOrganizationId?: string | null;
  supplierId: string;
  status: PoStatus;
  taxBreakdown: PoTaxBreakdownDto;
  milestones: PoMilestoneScheduleDto[];
  issuedAt: string;
  acceptedAt?: string | null;
  cancellationReason?: string | null;
  activeDispute?: DisputeCaseDto | null;
}

export interface GeneratePoInput {
  awardId: string;
  taxRegime?: TaxRegime;
  lutReferenceNumber?: string;
  milestones: Array<{
    title: string;
    percentageAllocation: number;
    dueDate: string;
  }>;
}

export interface CancelOrderInput {
  poId: string;
  reasonCode: OrderCancellationReasonCode;
  notes?: string;
}

export interface RaiseDisputeInput {
  poId: string;
  reasonCode: OrderDisputeReasonCode;
  description: string;
}

export interface OrderResolveDisputeInput {
  disputeId: string;
  resolutionNotes: string;
  releaseFunds: boolean;
}

/**
 * Pure domain utility for calculating statutory GST taxes in India
 * Enforces:
 * - Intra-state: CGST (gstRate/2) + SGST (gstRate/2), IGST = 0
 * - Inter-state: IGST (gstRate), CGST = 0, SGST = 0
 * - SEZ (Special Economic Zone): 0% with Letter of Undertaking (LUT)
 * - Freight amounts are not double-taxed (00245)
 */
export function computeStatutoryTaxes(params: {
  buyerStateCode: string;
  supplierStateCode: string;
  isSezUnit?: boolean;
  baseAmount: number;
  freightAmount?: number;
  gstRatePercentage?: number;
  lutReferenceNumber?: string;
}): PoTaxBreakdownDto {
  const {
    buyerStateCode,
    supplierStateCode,
    isSezUnit = false,
    baseAmount,
    freightAmount = 0,
    gstRatePercentage = 18,
    lutReferenceNumber,
  } = params;

  if (isSezUnit) {
    return {
      taxRegime: 'SEZ_ZERO_RATED',
      baseAmount,
      freightAmount,
      cgstRatePercentage: 0,
      cgstAmount: 0,
      sgstRatePercentage: 0,
      sgstAmount: 0,
      igstRatePercentage: 0,
      igstAmount: 0,
      totalTaxAmount: 0,
      totalLandedCost: baseAmount + freightAmount,
      lutReferenceNumber: lutReferenceNumber || 'LUT-SEZ-2026-9901',
    };
  }

  const isIntraState = buyerStateCode.trim() === supplierStateCode.trim();

  if (isIntraState) {
    const halfRate = gstRatePercentage / 2;
    const cgstAmount = Math.round((baseAmount * halfRate) / 100);
    const sgstAmount = Math.round((baseAmount * halfRate) / 100);
    const totalTaxAmount = cgstAmount + sgstAmount;

    return {
      taxRegime: 'INTRA_STATE_CGST_SGST',
      baseAmount,
      freightAmount,
      cgstRatePercentage: halfRate,
      cgstAmount,
      sgstRatePercentage: halfRate,
      sgstAmount,
      igstRatePercentage: 0,
      igstAmount: 0,
      totalTaxAmount,
      totalLandedCost: baseAmount + freightAmount + totalTaxAmount,
    };
  }

  // Inter-state
  const igstAmount = Math.round((baseAmount * gstRatePercentage) / 100);
  return {
    taxRegime: 'INTER_STATE_IGST',
    baseAmount,
    freightAmount,
    cgstRatePercentage: 0,
    cgstAmount: 0,
    sgstRatePercentage: 0,
    sgstAmount: 0,
    igstRatePercentage: gstRatePercentage,
    igstAmount,
    totalTaxAmount: igstAmount,
    totalLandedCost: baseAmount + freightAmount + igstAmount,
  };
}

export interface PurchaseOrderContract {
  getPurchaseOrderById(actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>>;
  listOrdersForBuyer(actor: ActorContext, statusFilter?: PoStatus): Promise<Result<PurchaseOrderDto[], ServiceError>>;
  listOrdersForSupplier(actor: ActorContext, statusFilter?: PoStatus): Promise<Result<PurchaseOrderDto[], ServiceError>>;
  generatePurchaseOrder(actor: ActorContext, input: GeneratePoInput): Promise<Result<PurchaseOrderDto, ServiceError>>;
  issuePurchaseOrder(actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>>;
  signAcceptance(actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>>;
  cancelOrder(actor: ActorContext, input: CancelOrderInput): Promise<Result<PurchaseOrderDto, ServiceError>>;
  raiseDispute(actor: ActorContext, input: RaiseDisputeInput): Promise<Result<DisputeCaseDto, ServiceError>>;
  resolveDispute(actor: ActorContext, input: OrderResolveDisputeInput): Promise<Result<DisputeCaseDto, ServiceError>>;
}

// ==========================================
// Module 19: Order & Service Tracking
// ==========================================

export type TrackingEventType =
  | 'ORDER_CONFIRMED'
  | 'DISPATCHED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'INSPECTION_PASSED'
  | 'DISPUTE_RAISED'
  | 'DISPUTE_RESOLVED'
  | 'ORDER_CANCELLED'
  | 'COMPLETED';

export interface TrackingTimelineEventDto {
  eventId: string;
  poId: string;
  eventType: TrackingEventType;
  title: string;
  description?: string;
  occurredAt: string;
  recordedByProfileId: string;
}

export interface SubmitMilestoneInspectionInput {
  poId: string;
  milestoneId: string;
  passedInspection: boolean;
  notes?: string;
}

export interface OrderTrackingContract {
  getTrackingTimeline(actor: ActorContext, poId: string): Promise<Result<TrackingTimelineEventDto[], ServiceError>>;
  recordDispatchStatus(actor: ActorContext, poId: string, trackingNumber?: string): Promise<Result<TrackingTimelineEventDto, ServiceError>>;
  submitMilestoneInspection(actor: ActorContext, input: SubmitMilestoneInspectionInput): Promise<Result<{ milestoneApproved: boolean }, ServiceError>>;
  confirmFinalCompletion(actor: ActorContext, poId: string): Promise<Result<{ orderCompleted: boolean }, ServiceError>>;
}

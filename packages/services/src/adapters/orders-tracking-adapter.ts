/**
 * OTP Next — Purchase Orders & Order Tracking Adapters
 * Modules 18, 19
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  PurchaseOrderContract,
  OrderTrackingContract,
  PurchaseOrderDto,
  PoStatus,
  GeneratePoInput,
  CancelOrderInput,
  RaiseDisputeInput,
  OrderResolveDisputeInput,
  DisputeCaseDto,
  TrackingTimelineEventDto,
  SubmitMilestoneInspectionInput,
} from '../contracts/orders-tracking.contract';
import { computeStatutoryTaxes } from '../contracts/orders-tracking.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ValidationError } from '../types/errors';

export class SupabasePurchaseOrderAdapter implements PurchaseOrderContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getPurchaseOrderById(_actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>> {
    // Standard mock PO: Intra-state Karnataka transaction (Supplier in KA 29, Buyer at Durga Rainbow KA 29)
    const taxBreakdown = computeStatutoryTaxes({
      buyerStateCode: '29',
      supplierStateCode: '29',
      baseAmount: 104000,
      freightAmount: 0,
      gstRatePercentage: 18,
    });

    return ok({
      poId,
      poNumber: 'PO-2026-00042',
      rfqId: 'rfq_sample_01',
      awardId: 'award_sample_01',
      buyerOrganizationId: 'org_durga_rainbow',
      supplierId: 'sup_alpha',
      status: 'ISSUED',
      taxBreakdown,
      milestones: [
        {
          milestoneId: 'ms_1',
          milestoneIndex: 1,
          title: 'Advance Mobilization & Initial Inspection',
          percentageAllocation: 30,
          expectedAmount: Math.round(taxBreakdown.totalLandedCost * 0.3),
          dueDate: '2026-04-05',
          isCompleted: false,
        },
        {
          milestoneId: 'ms_2',
          milestoneIndex: 2,
          title: 'Completion of 4 Quarterly Maintenance Cycles',
          percentageAllocation: 70,
          expectedAmount: Math.round(taxBreakdown.totalLandedCost * 0.7),
          dueDate: '2027-03-31',
          isCompleted: false,
        },
      ],
      issuedAt: '2026-03-05T10:00:00Z',
      acceptedAt: null,
      cancellationReason: null,
      activeDispute: null,
    });
  }

  async listOrdersForBuyer(actor: ActorContext, _statusFilter?: PoStatus): Promise<Result<PurchaseOrderDto[], ServiceError>> {
    const defaultPo = await this.getPurchaseOrderById(actor, 'po_sample_01');
    if (!defaultPo.ok) return defaultPo;
    return ok([defaultPo.value]);
  }

  async listOrdersForSupplier(actor: ActorContext, _statusFilter?: PoStatus): Promise<Result<PurchaseOrderDto[], ServiceError>> {
    const defaultPo = await this.getPurchaseOrderById(actor, 'po_sample_01');
    if (!defaultPo.ok) return defaultPo;
    return ok([defaultPo.value]);
  }

  async generatePurchaseOrder(actor: ActorContext, input: GeneratePoInput): Promise<Result<PurchaseOrderDto, ServiceError>> {
    const totalPercentage = input.milestones.reduce((acc, m) => acc + m.percentageAllocation, 0);
    if (totalPercentage !== 100) {
      return err(new ValidationError(`Milestone percentage allocations must total exactly 100% (currently ${totalPercentage}%)`));
    }
    const defaultPo = await this.getPurchaseOrderById(actor, 'po_' + Date.now());
    if (!defaultPo.ok) return defaultPo;

    let taxBreakdown = defaultPo.value.taxBreakdown;
    if (input.taxRegime === 'INTER_STATE_IGST') {
      taxBreakdown = computeStatutoryTaxes({
        buyerStateCode: '29',
        supplierStateCode: '33', // e.g. Tamil Nadu
        baseAmount: 104000,
        gstRatePercentage: 18,
      });
    } else if (input.taxRegime === 'SEZ_ZERO_RATED') {
      taxBreakdown = computeStatutoryTaxes({
        buyerStateCode: '29',
        supplierStateCode: '29',
        isSezUnit: true,
        lutReferenceNumber: input.lutReferenceNumber || 'LUT-SEZ-2026-9901',
        baseAmount: 104000,
      });
    }

    return ok({
      ...defaultPo.value,
      taxBreakdown,
    });
  }

  async issuePurchaseOrder(actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>> {
    const po = await this.getPurchaseOrderById(actor, poId);
    if (!po.ok) return po;
    return ok({ ...po.value, status: 'ISSUED' });
  }

  async signAcceptance(actor: ActorContext, poId: string): Promise<Result<PurchaseOrderDto, ServiceError>> {
    const po = await this.getPurchaseOrderById(actor, poId);
    if (!po.ok) return po;
    return ok({
      ...po.value,
      status: 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
    });
  }

  async cancelOrder(actor: ActorContext, input: CancelOrderInput): Promise<Result<PurchaseOrderDto, ServiceError>> {
    const po = await this.getPurchaseOrderById(actor, input.poId);
    if (!po.ok) return po;
    return ok({
      ...po.value,
      status: 'CANCELLED',
      cancellationReason: `[${input.reasonCode}] ${input.notes || ''}`.trim(),
    });
  }

  async raiseDispute(_actor: ActorContext, input: RaiseDisputeInput): Promise<Result<DisputeCaseDto, ServiceError>> {
    const dispute: DisputeCaseDto = {
      disputeId: 'dsp_' + Date.now(),
      poId: input.poId,
      reasonCode: input.reasonCode,
      description: input.description,
      raisedByProfileId: 'prof_buyer',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolutionNotes: null,
    };
    return ok(dispute);
  }

  async resolveDispute(_actor: ActorContext, input: OrderResolveDisputeInput): Promise<Result<DisputeCaseDto, ServiceError>> {
    const dispute: DisputeCaseDto = {
      disputeId: input.disputeId,
      poId: 'po_sample_01',
      reasonCode: 'QUALITY_DEFECT',
      description: 'Defective batch replacement verified on site.',
      raisedByProfileId: 'prof_buyer',
      status: 'RESOLVED',
      createdAt: '2026-03-10T10:00:00Z',
      resolvedAt: new Date().toISOString(),
      resolutionNotes: input.resolutionNotes,
    };
    return ok(dispute);
  }
}

export class SupabaseOrderTrackingAdapter implements OrderTrackingContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getTrackingTimeline(_actor: ActorContext, poId: string): Promise<Result<TrackingTimelineEventDto[], ServiceError>> {
    return ok([
      {
        eventId: 'evt_1',
        poId,
        eventType: 'ORDER_CONFIRMED',
        title: 'Purchase Order Signed & Accepted',
        description: 'Supplier and Buyer signed agreed terms.',
        occurredAt: '2026-03-05T11:00:00Z',
        recordedByProfileId: 'prof_baskar',
      },
      {
        eventId: 'evt_2',
        poId,
        eventType: 'DISPATCHED',
        title: 'Materials Dispatched for Milestone 1',
        description: 'Filters and consumables dispatched via local courier.',
        occurredAt: '2026-03-06T09:30:00Z',
        recordedByProfileId: 'prof_supplier',
      },
    ]);
  }

  async recordDispatchStatus(_actor: ActorContext, poId: string, trackingNumber?: string): Promise<Result<TrackingTimelineEventDto, ServiceError>> {
    return ok({
      eventId: 'evt_' + Date.now(),
      poId,
      eventType: 'DISPATCHED',
      title: 'Dispatch Confirmed',
      description: trackingNumber ? `Tracking Reference: ${trackingNumber}` : undefined,
      occurredAt: new Date().toISOString(),
      recordedByProfileId: 'prof_actor',
    });
  }

  async submitMilestoneInspection(_actor: ActorContext, input: SubmitMilestoneInspectionInput): Promise<Result<{ milestoneApproved: boolean }, ServiceError>> {
    return ok({ milestoneApproved: input.passedInspection });
  }

  async confirmFinalCompletion(_actor: ActorContext, _poId: string): Promise<Result<{ orderCompleted: boolean }, ServiceError>> {
    return ok({ orderCompleted: true });
  }
}

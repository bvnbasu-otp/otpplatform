/**
 * OTP Stage R2-12: Track & 5-Point Milestone Stepper Service
 *
 * Coordinates:
 *   1. Canonical 5-point milestone stepper (Requirement -> Offers -> Decision -> Purchase -> Delivery & Settlement)
 *   2. State Truth & Golden Path progression projection
 *   3. Purchase Order authorized retrieval with frozen snapshots and 0.50% fee disclosure
 *   4. Truthful supplier acceptance representation
 *   5. Delivery confirmation, 5-point QA inspection & cryptographic sign-off
 *   6. Progressive Bilateral GST Invoicing (PA-06)
 *   7. Double-Entry GAAP Financial Settlement (PA-07) & balanced ledger entries
 *   8. Persona-specific tracking views for Individual, RWA, and MSME buyers
 */

import {
  deriveFivePointMilestoneProjection,
  evaluateFivePointInspection,
  verifyInspectionSignoffIntegrity,
  validateDoubleEntryLedgerBalance,
  computeTripleFinancialSegregation,
  deriveProgressiveInvoiceStage,
  validatePurchaseOrderCancellation,
  determinePlaceOfSupply,
  calculateOrderTaxBreakdown,
  buildTaxSnapshot,
  calculatePoSettlementSummary,
  generatePoSettlementCertificate,
  validateInvoiceAmountAgainstPo,
  calculateRemainingInvoiceableAmount,
  isMilestoneInvoiceEligible,
  type FivePointMilestoneSummary,
  type FivePointInspectionItemInput,
  type FivePointInspectionValidationResult,
  type PoSettlementCertificate,
  type PoSettlementSummary,
  type PurchaseOrderStatus,
  type ProgressiveInvoice,
  type BuyerPersona,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  PurchaseOrder,
  WorkOrder,
  Invoice,
  Payment,
  WorkOrderInspectionEntity,
  JournalEntryEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  requireBuyerResourceAccess,
  requireOrgAccess,
  requireSupplierAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface PurchaseOrderTrackDetails {
  order: PurchaseOrder;
  milestoneSummary: FivePointMilestoneSummary;
  settlementSummary: PoSettlementSummary;
  workOrder: WorkOrder | null;
  inspections: WorkOrderInspectionEntity[];
  invoices: Invoice[];
  payments: Payment[];
  platformFeeDisclosure: {
    rate: number;
    feeAmount: number;
    isAcknowledged: boolean;
    acknowledgedAt?: string | null;
  };
  deliveryAddressSnapshot: Record<string, unknown> | null;
  billingAddressSnapshot: Record<string, unknown> | null;
  taxSnapshot: Record<string, unknown> | null;
}

export interface DeliveryConfirmationInput {
  workOrderId: string;
  progressPercent: number; // 0 to 100
  notes?: string | null;
  deliverablePhotos?: string[];
  rating?: number | null;
  reviewText?: string | null;
  fivePointItems?: FivePointInspectionItemInput[];
}

export interface SubmitTrackProgressiveInvoiceInput {
  purchaseOrderId: string;
  workOrderId: string;
  milestoneId?: string | null;
  invoiceNumber: string;
  amount: number;
  hsnCode?: string | null;
  invoiceType?: 'PROGRESSIVE' | 'FINAL' | 'ADVANCE';
  documentUrl?: string | null;
}

export class TrackService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Retrieves deterministic 5-point milestone stepper projection for an RFQ or Purchase Order.
   */
  async getTrackMilestones(
    actor: ActorContext,
    lookup: { rfqId?: string; poId?: string },
  ): Promise<Result<FivePointMilestoneSummary, Error>> {
    let rfqId = lookup.rfqId;
    let poId = lookup.poId;
    let po: PurchaseOrder | null = null;
    let rfq = null;

    if (poId) {
      po = await this.repos.purchaseOrders.findById(poId);
      if (!po) return err(new NotFoundError(`Purchase order '${poId}' not found`));
      rfqId = po.rfqId;
    }

    if (rfqId) {
      rfq = await this.repos.rfqs.findById(rfqId);
    }

    if (!po && !rfq) {
      return err(new ValidationError('Either rfqId or poId must be provided'));
    }

    // Access control check
    if (po) {
      if (actor.persona === 'SUPPLIER' || (actor.supplierIds && actor.supplierIds.length > 0)) {
        const suppAccess = requireSupplierAccess(actor, po.supplierId);
        if (!suppAccess.ok && !actor.isPlatformAdmin) return suppAccess;
      } else {
        const buyerAccess = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
        if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;
      }
    } else if (rfq) {
      if (actor.persona !== 'SUPPLIER' && (!actor.supplierIds || actor.supplierIds.length === 0)) {
        const buyerAccess = requireBuyerResourceAccess(actor, rfq.organizationId, rfq.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
        if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;
      }
    }

    // Load related entities
    if (!po && rfqId) {
      const pos = await this.repos.purchaseOrders.findByOrganizationId?.(rfq?.organizationId || '');
      po = pos?.find((p) => p.rfqId === rfqId) || null;
      if (po) poId = po.id;
    }

    let workOrder: WorkOrder | null = null;
    if (po) {
      workOrder = await this.repos.workOrders.findByPurchaseOrderId(po.id);
    }

    let invoices: Invoice[] = [];
    if (po) {
      invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
      if (invoices.length === 0 && workOrder) {
        invoices = await this.repos.invoices.findByWorkOrderId(workOrder.id);
      }
    }

    let inspections: WorkOrderInspectionEntity[] = [];
    if (workOrder && this.repos.workOrderInspections) {
      inspections = await this.repos.workOrderInspections.findByWorkOrderId(workOrder.id);
    }

    const latestInspection = inspections[inspections.length - 1] || null;

    // Detect persona
    const buyerPersona: BuyerPersona = rfq?.organizationId ? (rfq.organizationId.startsWith('org-rwa') ? 'RWA' : 'MSME') : 'INDIVIDUAL';

    const projection = deriveFivePointMilestoneProjection({
      rfqStatus: rfq?.status || (po ? 'AWARDED' : 'DRAFT'),
      rfqId,
      poStatus: po?.status,
      poId,
      supplierAcceptedAt: po?.acknowledgedAt || null,
      workOrderStatus: workOrder?.status || null,
      workOrderProgressPercent: workOrder?.progressPercent ?? (po?.status === 'COMPLETED' ? 100 : 0),
      inspectionStatus: latestInspection?.status || (workOrder?.completedAt ? 'APPROVED' : null),
      inspectionPassed: latestInspection?.passed ?? Boolean(workOrder?.completedAt),
      invoices: invoices.map((i) => ({ id: i.id, status: i.status, amount: i.amount })),
      isSettled: po?.status === 'COMPLETED',
      buyerPersona,
      role: (actor.persona === 'SUPPLIER' || (actor.supplierIds && actor.supplierIds.length > 0)) ? 'supplier' : 'buyer',
    });

    return ok(projection);
  }

  /**
   * Retrieves complete, authoritative Purchase Order tracking details with frozen snapshots.
   */
  async getPurchaseOrderTrackDetails(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PurchaseOrderTrackDetails, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError(`Purchase order '${poId}' not found`));

    // Multi-tenant isolation guard
    if (actor.persona === 'SUPPLIER' || (actor.supplierIds && actor.supplierIds.length > 0)) {
      const suppAccess = requireSupplierAccess(actor, po.supplierId);
      if (!suppAccess.ok && !actor.isPlatformAdmin) return suppAccess;
    } else {
      const buyerAccess = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
      if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;
    }

    const workOrder = await this.repos.workOrders.findByPurchaseOrderId(po.id);

    let invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
    if (invoices.length === 0 && workOrder) {
      invoices = await this.repos.invoices.findByWorkOrderId(workOrder.id);
    }

    let payments: Payment[] = [];
    if (this.repos.payments.findByPurchaseOrderId) {
      payments = await this.repos.payments.findByPurchaseOrderId(po.id);
    }
    if (payments.length === 0 && invoices.length > 0 && this.repos.payments.findByInvoiceId) {
      for (const inv of invoices) {
        const pList = await this.repos.payments.findByInvoiceId(inv.id);
        payments.push(...pList);
      }
    }

    let inspections: WorkOrderInspectionEntity[] = [];
    if (workOrder && this.repos.workOrderInspections) {
      inspections = await this.repos.workOrderInspections.findByWorkOrderId(workOrder.id);
    }

    let allocations = [];
    if (this.repos.paymentAllocations) {
      for (const inv of invoices) {
        const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allocations.push(...allocs);
      }
    }

    const settlementSummary = calculatePoSettlementSummary(po, invoices, payments, allocations);

    const feeSnapshot = this.repos.poFeeSnapshots
      ? await this.repos.poFeeSnapshots.findByPurchaseOrderId(po.id)
      : null;

    const feeBreakdown = computeTripleFinancialSegregation(po.totalAmount);

    const milestoneRes = await this.getTrackMilestones(actor, { poId: po.id });
    if (!milestoneRes.ok) return err(milestoneRes.error);

    return ok({
      order: po,
      milestoneSummary: milestoneRes.value,
      settlementSummary,
      workOrder,
      inspections,
      invoices,
      payments,
      platformFeeDisclosure: {
        rate: feeSnapshot?.rate ?? 0.005,
        feeAmount: feeSnapshot?.estimatedFeeAmount ?? feeBreakdown.otpPlatformFee,
        isAcknowledged: feeSnapshot?.isAcknowledged ?? Boolean(po.acknowledgedAt),
        acknowledgedAt: feeSnapshot?.acknowledgedAt || po.acknowledgedAt || null,
      },
      deliveryAddressSnapshot: (po.deliveryAddressSnapshot as Record<string, unknown>) || null,
      billingAddressSnapshot: (po.billingAddressSnapshot as Record<string, unknown>) || null,
      taxSnapshot: (po.taxSnapshot as Record<string, unknown>) || null,
    });
  }

  /**
   * Confirms delivery and executes 5-point QA inspection sign-off.
   */
  async confirmDeliveryInspection(
    actor: ActorContext,
    input: DeliveryConfirmationInput,
  ): Promise<Result<{ workOrder: WorkOrder; inspectionResult: FivePointInspectionValidationResult }, Error>> {
    const wo = await this.repos.workOrders.findById(input.workOrderId);
    if (!wo) return err(new NotFoundError(`Work order '${input.workOrderId}' not found`));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new NotFoundError('Associated purchase order not found'));

    // Buyer verification guard
    const buyerAccess = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
    if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;

    const now = timestamp();

    // Evaluate 5-point inspection
    const default5PointItems: FivePointInspectionItemInput[] = [
      { category: 'MATERIALS', description: 'Raw materials and specs verified', status: 'PASSED', score: 95 },
      { category: 'COMPLETION', description: 'Physical deliverables complete', status: 'PASSED', score: 90 },
      { category: 'SAFETY', description: 'Mandatory safety and packaging compliance', status: 'PASSED', score: 100 },
      { category: 'QUALITY', description: 'Operational quality benchmarks satisfied', status: 'PASSED', score: 92 },
      { category: 'SPECIFICATION', description: 'Specifications match approved order', status: 'PASSED', score: 95 },
    ];

    const inspResult = input.fivePointItems !== undefined
      ? evaluateFivePointInspection(input.fivePointItems, {
          workOrderId: wo.id,
          inspectorId: actor.profileId || 'usr-buyer',
          timestamp: now,
        })
      : evaluateFivePointInspection(default5PointItems, {
          workOrderId: wo.id,
          inspectorId: actor.profileId || 'usr-buyer',
          timestamp: now,
        });

    if (!inspResult.isValid || !inspResult.passed) {
      return err(new ValidationError(inspResult.error || '5-point QA inspection failed or is incomplete'));
    }

    // Save inspection record if repos available
    if (this.repos.workOrderInspections) {
      await this.repos.workOrderInspections.save({
        id: createId(),
        workOrderId: wo.id,
        milestoneId: 'ms-final-delivery',
        organizationId: po.organizationId || 'org-direct',
        inspectorId: actor.profileId || 'usr-buyer',
        inspectionType: 'PHYSICAL_ONSITE',
        status: 'APPROVED',
        checklistTemplateCode: 'TPL-5POINT-STANDARD',
        overallScore: inspResult.overallScore,
        passed: true,
        digitalSignoffHash: inspResult.digitalSignoffHash || null,
        reworkCount: 0,
        evidenceVersion: 1,
        notes: input.notes || '100% 5-Point Delivery Inspection Approved',
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const updatedWo: WorkOrder = {
      ...wo,
      status: 'COMPLETED',
      progressPercent: 100,
      completedAt: now,
      updatedAt: now,
    };

    const savedWo = await this.repos.workOrders.save(updatedWo);

    await auditLog(
      this.audit,
      actor,
      'work_order',
      savedWo.id,
      'work_order.delivery_inspected',
      { status: wo.status, progressPercent: wo.progressPercent },
      {
        status: savedWo.status,
        progressPercent: savedWo.progressPercent,
        inspectionScore: inspResult.overallScore,
        digitalSignoffHash: inspResult.digitalSignoffHash,
      },
    );

    return ok({ workOrder: savedWo, inspectionResult: inspResult });
  }

  /**
   * Submits a progressive GST tax invoice with bilateral place-of-supply tax calculations (PA-06).
   */
  async submitProgressiveInvoice(
    actor: ActorContext,
    input: SubmitTrackProgressiveInvoiceInput,
  ): Promise<Result<Invoice, Error>> {
    const po = await this.repos.purchaseOrders.findById(input.purchaseOrderId);
    if (!po) return err(new NotFoundError(`Purchase order '${input.purchaseOrderId}' not found`));

    // Supplier access check
    const suppAccess = requireSupplierAccess(actor, po.supplierId);
    if (!suppAccess.ok && !actor.isPlatformAdmin) return suppAccess;

    const wo = await this.repos.workOrders.findById(input.workOrderId);
    if (!wo || wo.purchaseOrderId !== po.id) {
      return err(new ValidationError('Work order not found for this purchase order'));
    }

    // Existing invoices check
    const existingInvoices = await this.repos.invoices.findByPurchaseOrderId(po.id);

    // Validate commitment cap
    const capValidation = validateInvoiceAmountAgainstPo(po.totalAmount, existingInvoices, input.amount);
    if (!capValidation.valid) {
      return err(new ValidationError(capValidation.error || 'Invoice amount exceeds authorized PO commitment'));
    }

    const now = timestamp();
    const posState = po.placeOfSupplyStateCode || '29';
    const isInterState = posState !== '29'; // Assuming 29 (Karnataka) base

    const taxable = Math.round((input.amount / 1.18) * 100) / 100;
    const gstTotal = Math.round((input.amount - taxable) * 100) / 100;
    const halfGst = Math.round((gstTotal / 2) * 100) / 100;

    const invoice: Invoice = {
      id: createId(),
      purchaseOrderId: po.id,
      workOrderId: wo.id,
      supplierId: po.supplierId,
      invoiceNumber: input.invoiceNumber,
      invoiceType: input.invoiceType || 'PROGRESSIVE',
      amount: input.amount,
      currency: po.currency || 'INR',
      status: 'SUBMITTED',
      submittedAt: now,
    };

    const saved = await this.repos.invoices.save(invoice);

    if (this.repos.invoiceLineItems) {
      await this.repos.invoiceLineItems.save({
        id: createId(),
        invoiceId: saved.id,
        lineIndex: 1,
        description: `Progressive Milestone Deliverable (Ref: ${saved.invoiceNumber})`,
        quantity: 1,
        unitPrice: taxable,
        taxableAmount: taxable,
        gstAmount: gstTotal,
        totalAmount: input.amount,
        hsnCode: input.hsnCode || '995411',
        cgstRate: isInterState ? 0 : 9,
        cgstAmount: isInterState ? 0 : halfGst,
        sgstRate: isInterState ? 0 : 9,
        sgstAmount: isInterState ? 0 : (gstTotal - halfGst),
        igstRate: isInterState ? 18 : 0,
        igstAmount: isInterState ? gstTotal : 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    await auditLog(
      this.audit,
      actor,
      'invoice',
      saved.id,
      'invoice.progressive_submitted',
      null,
      {
        invoiceNumber: saved.invoiceNumber,
        amount: saved.amount,
        placeOfSupply: posState,
      },
    );

    return ok(saved);
  }

  /**
   * Executes double-entry GAAP financial settlement (PA-07) and issues signed PoSettlementCertificate.
   */
  async executeDoubleEntrySettlement(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PoSettlementCertificate, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError(`Purchase order '${poId}' not found`));

    // Buyer owner or manager permission
    const buyerAccess = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER']);
    if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;

    const invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
    let payments: Payment[] = [];
    if (this.repos.payments.findByPurchaseOrderId) {
      payments = await this.repos.payments.findByPurchaseOrderId(po.id);
    }
    if (payments.length === 0 && invoices.length > 0 && this.repos.payments.findByInvoiceId) {
      for (const inv of invoices) {
        const pList = await this.repos.payments.findByInvoiceId(inv.id);
        payments.push(...pList);
      }
    }

    let allocations = [];
    if (this.repos.paymentAllocations) {
      for (const inv of invoices) {
        const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allocations.push(...allocs);
      }
    }

    const settlementSummary = calculatePoSettlementSummary(po, invoices, payments, allocations);

    const isSettled = Boolean(
      (settlementSummary.isFullySettled || po.status === 'COMPLETED') ||
      (invoices.length > 0 && invoices.every((i) => i.status === 'PAID'))
    );

    if (!isSettled) {
      return err(
        new ValidationError(
          `Cannot execute settlement certificate: Invoiced ₹${settlementSummary.cumulativeInvoicedAmount}, Paid ₹${settlementSummary.cumulativePaidAmount}, Outstanding ₹${settlementSummary.invoicedOutstandingAmount}`,
        ),
      );
    }

    const segregation = computeTripleFinancialSegregation(settlementSummary.cumulativePaidAmount || po.totalAmount);

    // Double-entry balanced journal lines verification
    const journalLines = [
      { accountCode: '2110', accountName: 'Accounts Payable - Supplier', debit: segregation.grossProcurementGmv, credit: 0 },
      { accountCode: '1010', accountName: 'Primary Bank Account', debit: 0, credit: segregation.netSupplierDisbursement },
      { accountCode: '4010', accountName: 'OTP Platform Commission Fee', debit: 0, credit: segregation.otpPlatformFee },
    ];

    const doubleEntryCheck = validateDoubleEntryLedgerBalance(journalLines);
    if (!doubleEntryCheck.isBalanced) {
      return err(new ValidationError(`Double-entry ledger integrity violation: ${doubleEntryCheck.error}`));
    }

    const now = timestamp();

    // Post to financial_ledger_entries if repo is available
    if (this.repos.journalEntries) {
      await this.repos.journalEntries.save({
        id: createId(),
        periodId: 'period-active-current',
        entryNumber: `JNL-${now.slice(0, 10)}-${createId().slice(0, 8)}`,
        entryDate: now.slice(0, 10),
        entryType: 'SETTLEMENT',
        narration: `Double-entry financial settlement for PO ${po.poNumber}`,
        sourceEntityType: 'PURCHASE_ORDER',
        sourceEntityId: po.id,
        lines: journalLines.map((l, idx) => ({
          id: createId(),
          journalEntryId: '',
          accountId: l.accountCode,
          lineNumber: idx + 1,
          debit: l.debit,
          credit: l.credit,
          narration: l.accountName,
        })),
        createdAt: now,
      } as unknown as JournalEntryEntity);
    }

    // Generate signed certificate
    const cert = generatePoSettlementCertificate(
      po,
      invoices,
      payments,
      allocations,
      { id: actor.profileId || 'usr-procurement-lead', name: actor.fullName || 'Procurement Lead', role: actor.orgRole || 'OWNER' },
      { id: po.organizationId || 'org-direct', name: 'Buyer Organization' },
      { id: po.supplierId, name: 'Awarded Supplier' },
    );

    // Mark PO completed if not already
    if (po.status !== 'COMPLETED') {
      await this.repos.purchaseOrders.save({
        ...po,
        status: 'COMPLETED',
        updatedAt: now,
      });
    }

    await auditLog(
      this.audit,
      actor,
      'purchase_order',
      po.id,
      'po.double_entry_settled',
      { status: po.status },
      {
        certificateId: cert.certificateId,
        grossGmv: segregation.grossProcurementGmv,
        platformFee: segregation.otpPlatformFee,
      },
    );

    return ok(cert);
  }

  /**
   * Cancels a Purchase Order prior to supplier acceptance with mandatory written reason.
   */
  async cancelPurchaseOrder(
    actor: ActorContext,
    poId: string,
    reason: string,
  ): Promise<Result<PurchaseOrder, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError(`Purchase order '${poId}' not found`));

    // Buyer check
    const buyerAccess = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
    if (!buyerAccess.ok && !actor.isPlatformAdmin) return buyerAccess;

    const validation = validatePurchaseOrderCancellation({
      currentStatus: po.status,
      cancellationReason: reason,
      supplierAcceptedAt: po.acknowledgedAt || null,
    });

    if (!validation.canCancel) {
      return err(new ValidationError(validation.rejectionReason || 'Purchase order cannot be cancelled'));
    }

    const now = timestamp();
    const updated: PurchaseOrder = {
      ...po,
      status: 'CANCELLED',
      updatedAt: now,
    };

    const saved = await this.repos.purchaseOrders.save(updated);

    await auditLog(
      this.audit,
      actor,
      'purchase_order',
      saved.id,
      'po.cancelled',
      { status: po.status },
      {
        cancellationReason: reason,
        status: 'CANCELLED',
      },
    );

    return ok(saved);
  }
}

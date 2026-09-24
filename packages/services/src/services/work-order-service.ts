import {
  type WorkOrderStatus,
  checkSupplierExecutionGate,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { WorkOrder } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  requireBuyerResourceAccess,
  requireOrgAccess,
  requireSupplierAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class WorkOrderService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    purchaseOrderId: string,
    title: string,
  ): Promise<Result<WorkOrder, Error>> {
    const po = await this.repos.purchaseOrders.findById(purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, [
      'OWNER',
      'MANAGER',
      'BUYER',
    ]);
    if (!access.ok) return access;

    const existing = await this.repos.workOrders.findByPurchaseOrderId(
      purchaseOrderId,
    );
    if (existing) return ok(existing);

    const now = timestamp();
    const wo: WorkOrder = {
      id: createId(),
      purchaseOrderId,
      supplierId: po.supplierId,
      status: 'NOT_STARTED',
      title,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.workOrders.save(wo);

    // Auto-create standard milestone allocations if milestone repo is available
    if (this.repos.workOrderMilestones) {
      const m1 = Math.round(po.totalAmount * 0.20 * 100) / 100;
      const m2 = Math.round(po.totalAmount * 0.40 * 100) / 100;
      const m3 = Math.round(po.totalAmount * 0.30 * 100) / 100;
      const m4 = Math.round((po.totalAmount - (m1 + m2 + m3)) * 100) / 100;

      await this.repos.workOrderMilestones.saveMany([
        {
          id: createId(),
          workOrderId: saved.id,
          milestoneIndex: 1,
          milestoneTitle: 'Milestone 1: Advance / Mobilization & Requisition',
          targetPercentage: 25,
          allocatedAmount: m1,
          invoicedAmount: 0,
          status: 'PENDING',
          isInvoiced: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          workOrderId: saved.id,
          milestoneIndex: 2,
          milestoneTitle: 'Milestone 2: Material Dispatch & In-Transit',
          targetPercentage: 50,
          allocatedAmount: m2,
          invoicedAmount: 0,
          status: 'PENDING',
          isInvoiced: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          workOrderId: saved.id,
          milestoneIndex: 3,
          milestoneTitle: 'Milestone 3: Installation & QA Inspection',
          targetPercentage: 75,
          allocatedAmount: m3,
          invoicedAmount: 0,
          status: 'PENDING',
          isInvoiced: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          workOrderId: saved.id,
          milestoneIndex: 4,
          milestoneTitle: 'Milestone 4: Final Acceptance & Retention Sign-off',
          targetPercentage: 100,
          allocatedAmount: m4,
          invoicedAmount: 0,
          status: 'PENDING',
          isInvoiced: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    await auditLog(
      this.audit,
      actor,
      'work_order',
      saved.id,
      'work_order.created',
      null,
      { status: saved.status, title },
    );

    return ok(saved);
  }

  async updateProgress(
    actor: ActorContext,
    workOrderId: string,
    progressPercent: number,
  ): Promise<Result<WorkOrder, Error>> {
    const wo = await this.repos.workOrders.findById(workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const supplierAccess = requireSupplierAccess(actor, wo.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    const supplier = await this.repos.suppliers.findById(wo.supplierId);
    if (supplier) {
      const gate = checkSupplierExecutionGate({
        id: supplier.id,
        lifecycleState:
          (supplier.lifecycleState as SupplierLifecycleState) ||
          SupplierLifecycleState.VERIFIED,
        verificationStatus:
          (supplier.verificationStatus as TruthfulVerificationStatus) ||
          TruthfulVerificationStatus.VERIFIED,
      });
      if (!gate.allowed) {
        return err(
          new ValidationError(
            gate.error ||
              'Supplier must be verified before executing work order milestones',
          ),
        );
      }
    }

    if (progressPercent < 0 || progressPercent > 100) {
      return err(new ValidationError('Progress must be between 0 and 100'));
    }

    const now = timestamp();
    const status: WorkOrderStatus =
      progressPercent >= 100 ? 'COMPLETED' : progressPercent > 0 ? 'IN_PROGRESS' : wo.status;

    const updated: WorkOrder = {
      ...wo,
      progressPercent,
      status,
      updatedAt: now,
      ...(status === 'COMPLETED' ? { completedAt: now } : {}),
    };

    const saved = await this.repos.workOrders.save(updated);
    await auditLog(
      this.audit,
      actor,
      'work_order',
      saved.id,
      'work_order.progress',
      { progressPercent: wo.progressPercent, status: wo.status },
      { progressPercent: saved.progressPercent, status: saved.status },
    );

    return ok(saved);
  }

  async complete(
    actor: ActorContext,
    workOrderId: string,
  ): Promise<Result<WorkOrder, Error>> {
    return this.updateProgress(actor, workOrderId, 100);
  }
}

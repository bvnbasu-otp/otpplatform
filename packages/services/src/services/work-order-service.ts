import type { WorkOrderStatus } from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { WorkOrder } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
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

    const access = requireOrgAccess(actor, po.organizationId, [
      'OWNER',
      'MANAGER',
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

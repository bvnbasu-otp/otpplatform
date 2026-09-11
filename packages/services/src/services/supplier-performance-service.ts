import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { ProcurementPerformanceRecord } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface RecordPerformanceInput {
  supplierId: string;
  rfqId: string;
  organizationId: string;
  quotedTotal: number;
  actualTotal?: number;
  quotedDeliveryDays: number;
  actualDeliveryDays?: number;
  qualityRating?: number;
}

export class SupplierPerformanceService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async recordPerformance(
    actor: ActorContext,
    input: RecordPerformanceInput,
  ): Promise<Result<ProcurementPerformanceRecord, Error>> {
    const access = requireOrgAccess(actor, input.organizationId, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const record: ProcurementPerformanceRecord = {
      id: createId(),
      supplierId: input.supplierId,
      rfqId: input.rfqId,
      organizationId: input.organizationId,
      quotedTotal: input.quotedTotal,
      actualTotal: input.actualTotal,
      quotedDeliveryDays: input.quotedDeliveryDays,
      actualDeliveryDays: input.actualDeliveryDays,
      qualityRating: input.qualityRating,
      recordedAt: timestamp(),
    };

    const saved = await this.repos.performance.save(record);
    await auditLog(
      this.audit,
      actor,
      'performance',
      saved.id,
      'performance.recorded',
      null,
      { supplierId: input.supplierId, rfqId: input.rfqId },
    );

    return ok(saved);
  }
}

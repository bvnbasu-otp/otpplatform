import {
  calculateInspectionScore,
  generateDigitalSignoffHash,
  isMilestoneInvoiceEligible,
  validateInspectionEvidenceAttachment,
  verifyDigitalSignoffHash,
  type InspectionItemCategory,
  type InspectionItemStatus,
  type InspectionType,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  WorkOrderInspectionEntity,
  WorkOrderInspectionItemEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface SubmitInspectionItemInput {
  itemCode: string;
  category: InspectionItemCategory;
  description: string;
  status: InspectionItemStatus;
  score?: number | null;
  evidenceUrls?: string[];
  evidenceMetadata?: Array<{
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    sha256Hash: string;
    uploadedAt: string;
  }>;
  notes?: string | null;
}

export interface SubmitInspectionInput {
  workOrderId: string;
  milestoneId: string;
  inspectionType: InspectionType;
  checklistTemplateCode: string;
  items: SubmitInspectionItemInput[];
  notes?: string | null;
}

export interface ApproveInspectionInput {
  inspectionId: string;
  digitalSignoffHash: string;
  secretSalt?: string;
  notes?: string | null;
}

export interface RejectInspectionInput {
  inspectionId: string;
  reworkReason: string;
  notes?: string | null;
}

export class MilestoneInspectionService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Submits a detailed milestone quality inspection with checklist items and evidence validation.
   */
  async submitInspection(
    actor: ActorContext,
    input: SubmitInspectionInput,
  ): Promise<Result<WorkOrderInspectionEntity, Error>> {
    const woRepo = this.repos.workOrders;
    const milestoneRepo = this.repos.workOrderMilestones;
    const inspRepo = this.repos.workOrderInspections;
    const itemsRepo = this.repos.workOrderInspectionItems;

    if (!woRepo || !milestoneRepo || !inspRepo || !itemsRepo) {
      return err(new ValidationError('Milestone inspection repositories not configured'));
    }

    // 1. Validate Work Order & Milestone
    const wo = await woRepo.findById(input.workOrderId);
    if (!wo) return err(new NotFoundError(`Work order '${input.workOrderId}' not found`));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new NotFoundError('Associated purchase order not found'));

    const orgAccess = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER', 'BUYER']);
    if (!orgAccess.ok && !actor.isPlatformAdmin) {
      return orgAccess;
    }

    const milestone = await milestoneRepo.findById(input.milestoneId);
    if (!milestone || milestone.workOrderId !== input.workOrderId) {
      return err(new NotFoundError(`Milestone '${input.milestoneId}' not found on work order`));
    }

    // 2. Validate Items & Evidence Attachments
    if (!input.items || input.items.length === 0) {
      return err(new ValidationError('Inspection must contain at least one checklist item'));
    }

    for (const item of input.items) {
      if (item.evidenceMetadata) {
        for (const meta of item.evidenceMetadata) {
          const val = validateInspectionEvidenceAttachment(meta.fileSizeBytes, meta.mimeType);
          if (!val.valid) {
            return err(new ValidationError(`Evidence validation failed: ${val.error}`));
          }
        }
      }
    }

    // 3. Calculate Score
    const scoreResult = calculateInspectionScore(input.items);
    const now = timestamp();
    const inspectionId = createId();

    const inspectionEntity: WorkOrderInspectionEntity = {
      id: inspectionId,
      workOrderId: input.workOrderId,
      milestoneId: input.milestoneId,
      organizationId: po.organizationId,
      inspectorId: actor.profileId,
      inspectionType: input.inspectionType,
      status: 'SUBMITTED',
      checklistTemplateCode: input.checklistTemplateCode,
      overallScore: scoreResult.overallScore,
      passed: scoreResult.passed,
      reworkCount: 0,
      evidenceVersion: 1,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const inspectionItems: WorkOrderInspectionItemEntity[] = input.items.map((it) => ({
      id: createId(),
      inspectionId,
      itemCode: it.itemCode,
      category: it.category,
      description: it.description,
      status: it.status,
      score: it.score ?? null,
      evidenceUrls: it.evidenceUrls ?? [],
      evidenceMetadata: it.evidenceMetadata ?? [],
      notes: it.notes ?? null,
      createdAt: now,
    }));

    const savedInsp = await inspRepo.save(inspectionEntity);
    await itemsRepo.saveMany(inspectionItems);
    savedInsp.items = inspectionItems;

    await auditLog(
      this.audit,
      actor,
      'WORK_ORDER_INSPECTION',
      savedInsp.id,
      'INSPECTION_SUBMITTED',
      null,
      {
        milestoneId: input.milestoneId,
        score: scoreResult.overallScore,
        passed: scoreResult.passed,
        itemsCount: inspectionItems.length,
      },
    );

    return ok(savedInsp);
  }

  /**
   * Signs off and approves an inspection, unlocking progressive invoice eligibility on the milestone.
   */
  async approveInspection(
    actor: ActorContext,
    input: ApproveInspectionInput,
  ): Promise<Result<WorkOrderInspectionEntity, Error>> {
    const inspRepo = this.repos.workOrderInspections;
    const milestoneRepo = this.repos.workOrderMilestones;

    if (!inspRepo || !milestoneRepo) {
      return err(new ValidationError('Inspection repositories not configured'));
    }

    const insp = await inspRepo.findById(input.inspectionId);
    if (!insp) return err(new NotFoundError(`Inspection '${input.inspectionId}' not found`));

    const orgAccess = requireOrgAccess(actor, insp.organizationId, ['OWNER', 'MANAGER', 'BUYER']);
    if (!orgAccess.ok && !actor.isPlatformAdmin) {
      return orgAccess;
    }

    if (insp.status === 'APPROVED') {
      return ok(insp); // Idempotent
    }

    // Validate signoff hash
    if (!input.digitalSignoffHash || input.digitalSignoffHash.length < 16) {
      return err(new ValidationError('A valid cryptographic digital signoff hash is required'));
    }

    if (input.secretSalt) {
      const isValid = verifyDigitalSignoffHash(
        input.digitalSignoffHash,
        insp.id,
        insp.milestoneId,
        insp.inspectorId,
        insp.overallScore ?? 100,
        insp.createdAt,
        input.secretSalt,
      );
      if (!isValid) {
        return err(new ValidationError('Digital signoff hash verification failed against salt'));
      }
    }

    const now = timestamp();
    insp.status = 'APPROVED';
    insp.passed = true;
    insp.digitalSignoffHash = input.digitalSignoffHash;
    insp.approvedAt = now;
    if (input.notes) insp.notes = input.notes;
    insp.updatedAt = now;

    const saved = await inspRepo.save(insp);

    // Update milestone status to VERIFIED_BY_BUYER to unlock progressive invoice eligibility
    const milestone = await milestoneRepo.findById(insp.milestoneId);
    if (milestone) {
      milestone.status = 'VERIFIED_BY_BUYER';
      milestone.verifiedAt = now;
      milestone.updatedAt = now;
      await milestoneRepo.save(milestone);
    }

    await auditLog(
      this.audit,
      actor,
      'WORK_ORDER_INSPECTION',
      saved.id,
      'INSPECTION_APPROVED',
      null,
      { milestoneId: saved.milestoneId, signoffHash: input.digitalSignoffHash },
    );

    return ok(saved);
  }

  /**
   * Rejects an inspection with a mandatory rework reason, preventing progressive invoice generation.
   */
  async rejectInspection(
    actor: ActorContext,
    input: RejectInspectionInput,
  ): Promise<Result<WorkOrderInspectionEntity, Error>> {
    const inspRepo = this.repos.workOrderInspections;
    const milestoneRepo = this.repos.workOrderMilestones;

    if (!inspRepo || !milestoneRepo) {
      return err(new ValidationError('Inspection repositories not configured'));
    }

    const insp = await inspRepo.findById(input.inspectionId);
    if (!insp) return err(new NotFoundError(`Inspection '${input.inspectionId}' not found`));

    const orgAccess = requireOrgAccess(actor, insp.organizationId, ['OWNER', 'MANAGER', 'BUYER']);
    if (!orgAccess.ok && !actor.isPlatformAdmin) {
      return orgAccess;
    }

    if (!input.reworkReason || input.reworkReason.trim().length === 0) {
      return err(new ValidationError('A clear rework reason is required for inspection rejection'));
    }

    const now = timestamp();
    insp.status = 'REWORK_REQUESTED';
    insp.passed = false;
    insp.reworkReason = input.reworkReason;
    insp.reworkCount = (insp.reworkCount || 0) + 1;
    insp.rejectedAt = now;
    if (input.notes) insp.notes = input.notes;
    insp.updatedAt = now;

    const saved = await inspRepo.save(insp);

    // Ensure milestone is not marked verified
    const milestone = await milestoneRepo.findById(insp.milestoneId);
    if (milestone) {
      milestone.status = 'PENDING';
      milestone.updatedAt = now;
      await milestoneRepo.save(milestone);
    }

    await auditLog(
      this.audit,
      actor,
      'WORK_ORDER_INSPECTION',
      saved.id,
      'INSPECTION_REJECTED',
      null,
      { milestoneId: saved.milestoneId, reworkReason: input.reworkReason, reworkCount: saved.reworkCount },
    );

    return ok(saved);
  }

  /**
   * Verifies whether a milestone is eligible for progressive invoicing.
   */
  async verifyMilestoneInvoiceEligibility(
    actor: ActorContext,
    milestoneId: string,
  ): Promise<Result<{ eligible: boolean; inspection?: WorkOrderInspectionEntity | null }, Error>> {
    const inspRepo = this.repos.workOrderInspections;
    if (!inspRepo) return err(new ValidationError('Inspection repository not configured'));

    const inspections = await inspRepo.findByMilestoneId(milestoneId);
    if (!inspections || inspections.length === 0) {
      return ok({ eligible: false, inspection: null });
    }

    const latest = inspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!latest) {
      return ok({ eligible: false, inspection: null });
    }
    const eligible = isMilestoneInvoiceEligible(latest.status, latest.passed);

    return ok({ eligible, inspection: latest });
  }

  /**
   * Gets inspection details including checklist items.
   */
  async getInspectionDetails(
    actor: ActorContext,
    inspectionId: string,
  ): Promise<Result<WorkOrderInspectionEntity, Error>> {
    const inspRepo = this.repos.workOrderInspections;
    const itemsRepo = this.repos.workOrderInspectionItems;

    if (!inspRepo || !itemsRepo) {
      return err(new ValidationError('Inspection repositories not configured'));
    }

    const insp = await inspRepo.findById(inspectionId);
    if (!insp) return err(new NotFoundError(`Inspection '${inspectionId}' not found`));

    const items = await itemsRepo.findByInspectionId(inspectionId);
    insp.items = items;

    return ok(insp);
  }
}

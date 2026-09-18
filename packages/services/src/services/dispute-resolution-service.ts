import {
  calculateDisputeSlaDeadline,
  canEscalateDispute,
  getNextEscalationLevel,
  validateDisputeAmount,
  validateDisputeTransition,
  type DisputeCategory,
  type DisputeEntityType,
  type DisputeResolutionCategory,
  type DisputeSeverity,
  type DisputeStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  DisputeEntity,
  DisputeEventEntity,
  DisputeEvidenceEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface OpenDisputeInput {
  organizationId: string;
  counterpartyOrganizationId?: string | null;
  entityType: DisputeEntityType;
  entityId: string;
  category: DisputeCategory;
  severity: DisputeSeverity;
  disputedAmount?: number;
  currency?: string;
  title: string;
  description: string;
}

export interface EscalateDisputeInput {
  disputeId: string;
  reason: string;
  assignTo?: string | null;
}

export interface ResolveDisputeInput {
  disputeId: string;
  resolutionCategory: DisputeResolutionCategory;
  resolutionSummary: string;
}

export interface AttachEvidenceInput {
  disputeId: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  description?: string | null;
}

export class DisputeResolutionService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Opens a new structured exception / dispute record with SLA deadline and immutable audit ledger.
   */
  async openDispute(
    actor: ActorContext,
    input: OpenDisputeInput,
  ): Promise<Result<DisputeEntity, Error>> {
    const disputeRepo = this.repos.disputes;
    const eventRepo = this.repos.disputeEvents;

    if (!disputeRepo || !eventRepo) {
      return err(new ValidationError('Dispute repositories not configured'));
    }

    const orgAccess = requireOrgAccess(actor, input.organizationId);
    if (!orgAccess.ok && !actor.isPlatformAdmin) {
      return orgAccess;
    }

    if (!input.title || input.title.trim().length === 0) {
      return err(new ValidationError('Dispute title is required'));
    }

    if (!input.description || input.description.trim().length === 0) {
      return err(new ValidationError('Dispute description is required'));
    }

    const disputedAmount = input.disputedAmount ?? 0.0;
    if (!validateDisputeAmount(disputedAmount)) {
      return err(new ValidationError('Invalid disputed amount'));
    }

    const now = timestamp();
    const disputeId = createId();
    const disputeNumber = `DSP-2026-${createId().substring(0, 8).toUpperCase()}`;
    const slaDeadline = calculateDisputeSlaDeadline(now, input.severity);

    const dispute: DisputeEntity = {
      id: disputeId,
      disputeNumber,
      organizationId: input.organizationId,
      counterpartyOrganizationId: input.counterpartyOrganizationId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      severity: input.severity,
      status: 'OPEN',
      escalationLevel: 1,
      disputedAmount,
      currency: input.currency ?? 'INR',
      title: input.title,
      description: input.description,
      slaDeadline,
      openedBy: actor.profileId,
      createdAt: now,
      updatedAt: now,
    };

    const initialEvent: DisputeEventEntity = {
      id: createId(),
      disputeId,
      eventType: 'OPENED',
      actorId: actor.profileId,
      actorRole: actor.orgRole ?? (actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'BUYER'),
      previousStatus: null,
      newStatus: 'OPEN',
      previousEscalationLevel: null,
      newEscalationLevel: 1,
      notes: `Dispute opened: ${input.title}`,
      payload: {
        entityType: input.entityType,
        entityId: input.entityId,
        category: input.category,
        severity: input.severity,
        disputedAmount,
      },
      createdAt: now,
    };

    const saved = await disputeRepo.save(dispute);
    await eventRepo.save(initialEvent);

    saved.events = [initialEvent];
    saved.evidence = [];

    await auditLog(
      this.audit,
      actor,
      'DISPUTE',
      saved.id,
      'DISPUTE_OPENED',
      null,
      {
        disputeNumber,
        category: input.category,
        severity: input.severity,
        disputedAmount,
      },
    );

    return ok(saved);
  }

  /**
   * Escalates a dispute to the next hierarchy tier (up to level 4).
   */
  async escalateDispute(
    actor: ActorContext,
    input: EscalateDisputeInput,
  ): Promise<Result<DisputeEntity, Error>> {
    const disputeRepo = this.repos.disputes;
    const eventRepo = this.repos.disputeEvents;

    if (!disputeRepo || !eventRepo) {
      return err(new ValidationError('Dispute repositories not configured'));
    }

    const dispute = await disputeRepo.findById(input.disputeId);
    if (!dispute) return err(new NotFoundError(`Dispute '${input.disputeId}' not found`));

    const isParty = actor.isPlatformAdmin ||
      actor.organizationId === dispute.organizationId ||
      actor.organizationId === dispute.counterpartyOrganizationId;

    if (!isParty) {
      return err(new ForbiddenError('Unauthorized to escalate this dispute'));
    }

    if (!canEscalateDispute(dispute.status, dispute.escalationLevel)) {
      return err(new ValidationError(`Dispute cannot be escalated from status '${dispute.status}' and level ${dispute.escalationLevel}`));
    }

    if (!input.reason || input.reason.trim().length === 0) {
      return err(new ValidationError('Escalation reason is required'));
    }

    const prevLevel = dispute.escalationLevel;
    const prevStatus = dispute.status;
    const newLevel = getNextEscalationLevel(prevLevel);
    const now = timestamp();

    dispute.escalationLevel = newLevel;
    dispute.status = 'ESCALATED';
    if (input.assignTo) dispute.assignedTo = input.assignTo;
    dispute.updatedAt = now;

    const event: DisputeEventEntity = {
      id: createId(),
      disputeId: dispute.id,
      eventType: 'ESCALATED',
      actorId: actor.profileId,
      actorRole: actor.orgRole ?? (actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'BUYER'),
      previousStatus: prevStatus,
      newStatus: 'ESCALATED',
      previousEscalationLevel: prevLevel,
      newEscalationLevel: newLevel,
      notes: input.reason,
      payload: {
        reason: input.reason,
        assignedTo: input.assignTo,
      },
      createdAt: now,
    };

    const saved = await disputeRepo.save(dispute);
    await eventRepo.save(event);

    await auditLog(
      this.audit,
      actor,
      'DISPUTE',
      saved.id,
      'DISPUTE_ESCALATED',
      { level: prevLevel, status: prevStatus },
      { level: newLevel, status: 'ESCALATED', reason: input.reason },
    );

    return ok(saved);
  }

  /**
   * Resolves a dispute with resolution categorization and immutable summary.
   * STRICT INVARIANT: Does NOT execute financial reversals or debit wallets without explicit financial operations.
   */
  async resolveDispute(
    actor: ActorContext,
    input: ResolveDisputeInput,
  ): Promise<Result<DisputeEntity, Error>> {
    const disputeRepo = this.repos.disputes;
    const eventRepo = this.repos.disputeEvents;

    if (!disputeRepo || !eventRepo) {
      return err(new ValidationError('Dispute repositories not configured'));
    }

    const dispute = await disputeRepo.findById(input.disputeId);
    if (!dispute) return err(new NotFoundError(`Dispute '${input.disputeId}' not found`));

    const isParty = actor.isPlatformAdmin ||
      actor.organizationId === dispute.organizationId ||
      actor.organizationId === dispute.counterpartyOrganizationId;

    if (!isParty) {
      return err(new ForbiddenError('Unauthorized to resolve this dispute'));
    }

    if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
      return ok(dispute); // Idempotent
    }

    if (!input.resolutionSummary || input.resolutionSummary.trim().length === 0) {
      return err(new ValidationError('Resolution summary is required'));
    }

    const prevStatus = dispute.status;
    const now = timestamp();

    dispute.status = 'RESOLVED';
    dispute.resolvedBy = actor.profileId;
    dispute.resolutionCategory = input.resolutionCategory;
    dispute.resolutionSummary = input.resolutionSummary;
    dispute.resolvedAt = now;
    dispute.updatedAt = now;

    const event: DisputeEventEntity = {
      id: createId(),
      disputeId: dispute.id,
      eventType: 'RESOLVED',
      actorId: actor.profileId,
      actorRole: actor.orgRole ?? (actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'BUYER'),
      previousStatus: prevStatus,
      newStatus: 'RESOLVED',
      previousEscalationLevel: dispute.escalationLevel,
      newEscalationLevel: dispute.escalationLevel,
      notes: input.resolutionSummary,
      payload: {
        resolutionCategory: input.resolutionCategory,
        resolutionSummary: input.resolutionSummary,
      },
      createdAt: now,
    };

    const saved = await disputeRepo.save(dispute);
    await eventRepo.save(event);

    await auditLog(
      this.audit,
      actor,
      'DISPUTE',
      saved.id,
      'DISPUTE_RESOLVED',
      { status: prevStatus },
      { status: 'RESOLVED', resolutionCategory: input.resolutionCategory },
    );

    return ok(saved);
  }

  /**
   * Attaches immutable evidence to an active dispute.
   */
  async attachEvidence(
    actor: ActorContext,
    input: AttachEvidenceInput,
  ): Promise<Result<DisputeEvidenceEntity, Error>> {
    const disputeRepo = this.repos.disputes;
    const evidenceRepo = this.repos.disputeEvidence;
    const eventRepo = this.repos.disputeEvents;

    if (!disputeRepo || !evidenceRepo || !eventRepo) {
      return err(new ValidationError('Dispute repositories not configured'));
    }

    const dispute = await disputeRepo.findById(input.disputeId);
    if (!dispute) return err(new NotFoundError(`Dispute '${input.disputeId}' not found`));

    const isParty = actor.isPlatformAdmin ||
      actor.organizationId === dispute.organizationId ||
      actor.organizationId === dispute.counterpartyOrganizationId;

    if (!isParty) {
      return err(new ForbiddenError('Unauthorized to attach evidence to this dispute'));
    }

    if (input.fileSizeBytes <= 0 || input.fileSizeBytes > 25 * 1024 * 1024) {
      return err(new ValidationError('File size must be between 1 byte and 25MB'));
    }

    const now = timestamp();
    const evidence: DisputeEvidenceEntity = {
      id: createId(),
      disputeId: input.disputeId,
      uploadedBy: actor.profileId,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileSizeBytes: input.fileSizeBytes,
      mimeType: input.mimeType,
      sha256Hash: input.sha256Hash,
      description: input.description ?? null,
      isImmutable: true,
      createdAt: now,
    };

    const saved = await evidenceRepo.save(evidence);

    const event: DisputeEventEntity = {
      id: createId(),
      disputeId: input.disputeId,
      eventType: 'EVIDENCE_ATTACHED',
      actorId: actor.profileId,
      actorRole: actor.orgRole ?? (actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'BUYER'),
      notes: `Evidence attached: ${input.fileName}`,
      payload: {
        evidenceId: saved.id,
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        sha256Hash: input.sha256Hash,
      },
      createdAt: now,
    };

    await eventRepo.save(event);

    return ok(saved);
  }

  /**
   * Retrieves full dispute aggregate with attached evidence and event history.
   */
  async getDispute(
    actor: ActorContext,
    disputeId: string,
  ): Promise<Result<DisputeEntity, Error>> {
    const disputeRepo = this.repos.disputes;
    const evidenceRepo = this.repos.disputeEvidence;
    const eventRepo = this.repos.disputeEvents;

    if (!disputeRepo) return err(new ValidationError('Dispute repository not configured'));

    const dispute = await disputeRepo.findById(disputeId);
    if (!dispute) return err(new NotFoundError(`Dispute '${disputeId}' not found`));

    const isParty = actor.isPlatformAdmin ||
      actor.organizationId === dispute.organizationId ||
      actor.organizationId === dispute.counterpartyOrganizationId;

    if (!isParty) {
      return err(new ForbiddenError('Unauthorized to view this dispute'));
    }

    if (evidenceRepo) {
      dispute.evidence = await evidenceRepo.findByDisputeId(disputeId);
    }
    if (eventRepo) {
      dispute.events = await eventRepo.findByDisputeId(disputeId);
    }

    return ok(dispute);
  }

  /**
   * Lists disputes for an organization.
   */
  async listDisputes(
    actor: ActorContext,
    organizationId?: string,
  ): Promise<Result<DisputeEntity[], Error>> {
    const disputeRepo = this.repos.disputes;
    if (!disputeRepo) return err(new ValidationError('Dispute repository not configured'));

    const targetOrg = organizationId ?? actor.organizationId;
    if (!targetOrg && !actor.isPlatformAdmin) {
      return err(new ValidationError('Organization ID required'));
    }

    if (actor.isPlatformAdmin && !targetOrg) {
      const all = await disputeRepo.findAll();
      return ok(all);
    }

    const disputes = await disputeRepo.findByOrganizationId(targetOrg!);
    return ok(disputes);
  }
}

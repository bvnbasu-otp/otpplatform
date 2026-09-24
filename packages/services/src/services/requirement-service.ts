import {
  canTransitionRequirement,
  type RequirementStatus,
  type RequirementType,
  type RfqPaymentType,
} from '@otp/domain';
import type { RequirementParserService } from '../interfaces/requirement-parser-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Requirement } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  assertTransition,
  requireBuyerResourceAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface CreateRequirementInput {
  title: string;
  description?: string;
  requirementType: RequirementType;
  budgetAmount?: number | null;
  paymentType?: RfqPaymentType;
  hints?: Record<string, unknown>;
}

export class RequirementService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly parser: RequirementParserService,
  ) {}

  async createDraft(
    actor: ActorContext,
    input: CreateRequirementInput,
  ): Promise<Result<Requirement, Error>> {
    // Check access: For org buyers, require authorized role; for Individual buyers (orgId=null), allow direct creation
    const access = requireBuyerResourceAccess(
      actor,
      actor.organizationId,
      actor.profileId,
      ['OWNER', 'MANAGER', 'BUYER'],
    );
    if (!access.ok) return access;

    const now = timestamp();
    const hints = {
      ...(input.hints || {}),
      ...(input.paymentType ? { paymentType: input.paymentType } : {}),
    };

    const structuredSpecs = this.parser.parse({
      description: input.description ?? input.title,
      requirementType: input.requirementType,
      hints,
    });

    const requirement: Requirement = {
      id: createId(),
      organizationId: actor.organizationId || null,
      createdBy: actor.profileId,
      requirementType: input.requirementType,
      status: 'DRAFT',
      title: input.title,
      description: input.description,
      budgetAmount: input.budgetAmount ?? null,
      structuredSpecs,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.requirements.save(requirement);
    await auditLog(
      this.audit,
      actor,
      'requirement',
      saved.id,
      'requirement.created',
      null,
      {
        status: saved.status,
        title: saved.title,
        organizationId: saved.organizationId,
      },
    );
    return ok(saved);
  }

  async submit(
    actor: ActorContext,
    requirementId: string,
  ): Promise<Result<Requirement, Error>> {
    const req = await this.repos.requirements.findById(requirementId);
    if (!req) return err(new ValidationError('Requirement not found'));

    const access = requireBuyerResourceAccess(
      actor,
      req.organizationId,
      req.createdBy,
      ['OWNER', 'MANAGER', 'BUYER'],
    );
    if (!access.ok) return access;

    const transition = assertTransition(
      canTransitionRequirement,
      req.status,
      'SUBMITTED',
      'requirement',
    );
    if (!transition.ok) return transition;

    const updated = await this.transitionRequirement(actor, req, 'SUBMITTED');
    return ok(updated);
  }

  async transition(
    actor: ActorContext,
    requirementId: string,
    toStatus: RequirementStatus,
  ): Promise<Result<Requirement, Error>> {
    const req = await this.repos.requirements.findById(requirementId);
    if (!req) return err(new ValidationError('Requirement not found'));

    const access = requireBuyerResourceAccess(
      actor,
      req.organizationId,
      req.createdBy,
      ['OWNER', 'MANAGER', 'BUYER'],
    );
    if (!access.ok) return access;

    const transition = assertTransition(
      canTransitionRequirement,
      req.status,
      toStatus,
      'requirement',
    );
    if (!transition.ok) return transition;

    const updated = await this.transitionRequirement(actor, req, toStatus);
    return ok(updated);
  }

  private async transitionRequirement(
    actor: ActorContext,
    req: Requirement,
    toStatus: RequirementStatus,
  ): Promise<Requirement> {
    const before = { status: req.status };
    const updated: Requirement = {
      ...req,
      status: toStatus,
      updatedAt: timestamp(),
    };
    const saved = await this.repos.requirements.save(updated);
    await auditLog(
      this.audit,
      actor,
      'requirement',
      saved.id,
      `requirement.${toStatus.toLowerCase()}`,
      before,
      { status: saved.status },
    );
    return saved;
  }
}

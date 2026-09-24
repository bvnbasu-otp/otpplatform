import {
  canTransitionRfq,
  canTransitionRequirement,
  type RfqPaymentType,
  type RfqStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type {
  DiscoveryCriteria,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';
import type { Repositories } from '../repositories/interfaces';
import type { Rfq, RfqInvitation } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  assertTransition,
  nextAnonymousLabel,
  requireBuyerResourceAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface CreateRfqInput {
  title: string;
  quoteDeadline?: string;
  evaluationDeadline?: string;
  paymentType?: RfqPaymentType | null;
  paymentTerms?: string | null;
  deliveryAddressSnapshot?: Record<string, unknown> | null;
  billingAddressSnapshot?: Record<string, unknown> | null;
  buyerAnonymousToSuppliers?: boolean;
  minQuotesRequired?: number;
}

export class RFQService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly discovery: SupplierDiscoveryService,
  ) {}

  async createFromRequirement(
    actor: ActorContext,
    requirementId: string,
    input: CreateRfqInput,
  ): Promise<Result<Rfq, Error>> {
    const req = await this.repos.requirements.findById(requirementId);
    if (!req) return err(new ValidationError('Requirement not found'));

    const access = requireBuyerResourceAccess(
      actor,
      req.organizationId,
      req.createdBy,
      ['OWNER', 'MANAGER', 'BUYER'],
    );
    if (!access.ok) return access;

    const existing = await this.repos.rfqs.findByRequirementId(requirementId);
    if (existing) return err(new ValidationError('RFQ already exists for requirement'));

    const now = timestamp();
    const declaredPaymentType =
      input.paymentType ||
      ((req.structuredSpecs?.fields?.paymentType as RfqPaymentType | undefined) ?? null);

    const rfq: Rfq = {
      id: createId(),
      requirementId,
      organizationId: req.organizationId || null,
      status: 'DRAFT',
      revealStatus: 'PROTECTED',
      title: input.title,
      quoteDeadline: input.quoteDeadline,
      evaluationDeadline: input.evaluationDeadline,
      paymentType: declaredPaymentType,
      paymentTerms: input.paymentTerms ?? null,
      deliveryAddressSnapshot: input.deliveryAddressSnapshot ?? null,
      billingAddressSnapshot: input.billingAddressSnapshot ?? null,
      buyerAnonymousToSuppliers: input.buyerAnonymousToSuppliers ?? true,
      minQuotesRequired: input.minQuotesRequired ?? 1,
      createdBy: actor.profileId,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.rfqs.save(rfq);
    await auditLog(this.audit, actor, 'rfq', saved.id, 'rfq.created', null, {
      status: saved.status,
      requirementId,
      organizationId: saved.organizationId,
      paymentType: saved.paymentType,
    });

    if (canTransitionRequirement(req.status, 'RFQ_CREATED')) {
      await this.repos.requirements.save({
        ...req,
        status: 'RFQ_CREATED',
        updatedAt: now,
      });
    }

    return ok(saved);
  }

  async open(actor: ActorContext, rfqId: string): Promise<Result<Rfq, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER'],
    );
    if (!access.ok) return access;

    const invitations = await this.repos.invitations.findByRfqId(rfqId);
    if (invitations.length < 1) {
      return err(new ValidationError('At least one invitation required to open RFQ'));
    }

    const transition = assertTransition(canTransitionRfq, rfq.status, 'OPEN', 'rfq');
    if (!transition.ok) return transition;

    const updated = await this.transitionRfq(actor, rfq, 'OPEN');
    const req = await this.repos.requirements.findById(rfq.requirementId);
    if (req && canTransitionRequirement(req.status, 'QUOTING')) {
      await this.repos.requirements.save({
        ...req,
        status: 'QUOTING',
        updatedAt: timestamp(),
      });
    }
    return ok(updated);
  }

  async close(actor: ActorContext, rfqId: string): Promise<Result<Rfq, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER'],
    );
    if (!access.ok) return access;

    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    const finalCount = quotes.filter((q) =>
      ['FINAL', 'SELECTED', 'NOT_SELECTED'].includes(q.status),
    ).length;
    if (finalCount < rfq.minQuotesRequired) {
      return err(
        new ValidationError(
          `Minimum ${rfq.minQuotesRequired} final quotes required`,
        ),
      );
    }

    const transition = assertTransition(canTransitionRfq, rfq.status, 'CLOSED', 'rfq');
    if (!transition.ok) return transition;

    const updated = await this.transitionRfq(actor, rfq, 'CLOSED');
    return ok(updated);
  }

  /**
   * OPEN -> CLARIFICATION. Quotes can only be finalised in this window, so
   * without it an RFQ can never reach the minimum final quotes that close()
   * requires.
   */
  async startClarification(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<Rfq, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER'],
    );
    if (!access.ok) return access;

    const transition = assertTransition(
      canTransitionRfq,
      rfq.status,
      'CLARIFICATION',
      'rfq',
    );
    if (!transition.ok) return transition;

    return ok(await this.transitionRfq(actor, rfq, 'CLARIFICATION'));
  }

  async startEvaluation(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<Rfq, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER'],
    );
    if (!access.ok) return access;

    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    const unscored = quotes.filter(
      (q) => q.status === 'FINAL' && q.evaluationScore === undefined,
    );
    if (unscored.length > 0) {
      return err(new ValidationError('All final quotes must have evaluation scores'));
    }

    const transition = assertTransition(
      canTransitionRfq,
      rfq.status,
      'EVALUATING',
      'rfq',
    );
    if (!transition.ok) return transition;

    const updated = await this.transitionRfq(actor, rfq, 'EVALUATING');
    const req = await this.repos.requirements.findById(rfq.requirementId);
    if (req && canTransitionRequirement(req.status, 'EVALUATION')) {
      await this.repos.requirements.save({
        ...req,
        status: 'EVALUATION',
        updatedAt: timestamp(),
      });
    }
    return ok(updated);
  }

  async discoverAndInvite(
    actor: ActorContext,
    rfqId: string,
    criteria?: DiscoveryCriteria,
  ): Promise<Result<RfqInvitation[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER', 'BUYER'],
    );
    if (!access.ok) return access;

    const req = await this.repos.requirements.findById(rfq.requirementId);
    const specs = req?.structuredSpecs as Record<string, unknown> | undefined;
    const category =
      (specs?.category as string | undefined) ?? 'General';

    const discoveryCriteria: DiscoveryCriteria = criteria ?? {
      category,
      structuredSpecs: specs,
    };

    const results = await this.discovery.discover(discoveryCriteria);
    const existing = await this.repos.invitations.findByRfqId(rfqId);
    const existingSupplierIds = new Set(existing.map((i) => i.supplierId));

    const invitations: RfqInvitation[] = [];
    let labelIndex = existing.length;

    for (const result of results) {
      if (existingSupplierIds.has(result.supplierId)) continue;

      const invitation: RfqInvitation = {
        id: createId(),
        rfqId,
        supplierId: result.supplierId,
        anonymousLabel: nextAnonymousLabel(labelIndex),
        status: 'INVITED',
        matchScore: result.matchScore,
        matchReasons: result.matchReasons,
        invitedAt: timestamp(),
      };
      invitations.push(invitation);
      labelIndex++;
    }

    if (invitations.length > 0) {
      await this.repos.invitations.saveMany(invitations);
      for (const inv of invitations) {
        await auditLog(
          this.audit,
          actor,
          'invitation',
          inv.id,
          'invitation.sent',
          null,
          { anonymousLabel: inv.anonymousLabel, status: inv.status },
        );
      }
    }

    return ok([...existing, ...invitations]);
  }

  private async transitionRfq(
    actor: ActorContext,
    rfq: Rfq,
    toStatus: RfqStatus,
  ): Promise<Rfq> {
    const before = { status: rfq.status };
    const updated: Rfq = {
      ...rfq,
      status: toStatus,
      updatedAt: timestamp(),
    };
    const saved = await this.repos.rfqs.save(updated);
    await auditLog(
      this.audit,
      actor,
      'rfq',
      saved.id,
      `rfq.${toStatus.toLowerCase()}`,
      before,
      { status: saved.status },
    );
    return saved;
  }
}

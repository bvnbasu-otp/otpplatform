import {
  canTransitionRfq,
  canTransitionRequirement,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';
import type { ApprovalPolicyService } from '../interfaces/approval-policy-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Award } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  requireOrgAccess,
  validateJustification,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class AwardService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly policyService: ApprovalPolicyService,
  ) {}

  async createAward(
    actor: ActorContext,
    rfqId: string,
    quoteId: string,
    justification: string,
  ): Promise<Result<Award, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));
    if (rfq.status !== 'EVALUATING') {
      return err(new ValidationError('RFQ must be in EVALUATING status'));
    }

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
      'APPROVER',
    ]);
    if (!access.ok) return access;

    const policy = await this.policyService.getPolicyForRfq(rfqId);
    if (!this.policyService.canAward(actor.orgRole ?? '', policy)) {
      return err(new ValidationError('Role not permitted to award'));
    }

    if (policy.rules.awardRequiresJustification) {
      const justificationCheck = validateJustification(justification);
      if (!justificationCheck.ok) return justificationCheck;
    }

    const existing = await this.repos.awards.findByRfqId(rfqId);
    if (existing) return err(new ValidationError('Award already exists for this RFQ'));

    const quote = await this.repos.quotes.findById(quoteId);
    if (!quote || quote.rfqId !== rfqId) {
      return err(new ValidationError('Quote not found for this RFQ'));
    }
    if (quote.status !== 'FINAL') {
      return err(new ValidationError('Only FINAL quotes can be awarded'));
    }

    const approval = await this.repos.approvals.findByRfqId(rfqId);
    if (approval && approval.status === 'PENDING') {
      return err(new ValidationError('Approval must be granted before award'));
    }
    if (approval && approval.status === 'REJECTED') {
      return err(new ValidationError('Approval was rejected'));
    }

    const coi = await this.repos.coi.findByRfqAndProfile(rfqId, actor.profileId);
    if (coi?.status === 'DECLARED_CONFLICT') {
      return err(new ValidationError('COI conflict blocks award'));
    }

    const now = timestamp();
    const award: Award = {
      id: createId(),
      rfqId,
      quoteId,
      awardedBy: actor.profileId,
      justification,
      status: 'PENDING_REVEAL',
      awardedAt: now,
    };

    const saved = await this.repos.awards.save(award);

    const updatedQuote = { ...quote, status: 'SELECTED' as const, updatedAt: now };
    await this.repos.quotes.save(updatedQuote);

    const otherQuotes = await this.repos.quotes.findByRfqId(rfqId);
    for (const q of otherQuotes) {
      if (q.id !== quoteId && q.status === 'FINAL') {
        await this.repos.quotes.save({
          ...q,
          status: 'NOT_SELECTED',
          updatedAt: now,
        });
      }
    }

    if (canTransitionRfq(rfq.status, 'AWARDED')) {
      await this.repos.rfqs.save({
        ...rfq,
        status: 'AWARDED',
        updatedAt: now,
      });
    }

    const req = await this.repos.requirements.findById(rfq.requirementId);
    if (req && canTransitionRequirement(req.status, 'AWARDED')) {
      await this.repos.requirements.save({
        ...req,
        status: 'AWARDED',
        updatedAt: now,
      });
    }

    const winningSupplier = await this.repos.suppliers.findById(quote.supplierId);
    if (winningSupplier && this.repos.suppliers.save) {
      if (
        !winningSupplier.lifecycleState ||
        winningSupplier.lifecycleState === SupplierLifecycleState.QUOTE_PARTICIPANT
      ) {
        await this.repos.suppliers.save({
          ...winningSupplier,
          lifecycleState: SupplierLifecycleState.ONBOARDING_REQUIRED,
          verificationStatus:
            winningSupplier.verificationStatus ||
            TruthfulVerificationStatus.NOT_PROVIDED,
        });
      }
    }

    await auditLog(
      this.audit,
      actor,
      'award',
      saved.id,
      'award.confirmed',
      null,
      { status: saved.status, quoteId },
    );

    return ok(saved);
  }
}

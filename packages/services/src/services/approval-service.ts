import type { CoiStatus, VoteChoice } from '@otp/domain';
import type { ApprovalPolicyService } from '../interfaces/approval-policy-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  ApprovalInstance,
  CoiDeclaration,
  CommitteeVote,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class ApprovalService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly policyService: ApprovalPolicyService,
  ) {}

  async requestApproval(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<ApprovalInstance, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));
    if (rfq.status !== 'EVALUATING') {
      return err(new ValidationError('RFQ must be in EVALUATING status'));
    }

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const existing = await this.repos.approvals.findByRfqId(rfqId);
    if (existing) return ok(existing);

    const policy = await this.policyService.getPolicyForRfq(rfqId);
    const instance: ApprovalInstance = {
      id: createId(),
      rfqId,
      policyId: policy.policyCode,
      status: 'PENDING',
    };

    const saved = await this.repos.approvals.save(instance);
    await auditLog(
      this.audit,
      actor,
      'approval',
      saved.id,
      'approval.requested',
      null,
      { status: saved.status, policyId: saved.policyId },
    );

    return ok(saved);
  }

  async approve(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<ApprovalInstance, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
      'APPROVER',
    ]);
    if (!access.ok) return access;

    const instance = await this.repos.approvals.findByRfqId(rfqId);
    if (!instance) return err(new ValidationError('No approval instance found'));
    if (instance.status !== 'PENDING') {
      return err(new ValidationError('Approval is not pending'));
    }

    const policy = await this.policyService.getPolicyForRfq(rfqId);
    if (policy.rules.committeeVoteRequired) {
      const votes = await this.repos.votes.findByRfqId(rfqId);
      if (votes.length < policy.rules.minCommitteeVotes) {
        return err(
          new ValidationError(
            `Minimum ${policy.rules.minCommitteeVotes} committee votes required`,
          ),
        );
      }
    }

    const updated: ApprovalInstance = { ...instance, status: 'APPROVED' };
    const saved = await this.repos.approvals.save(updated);

    await auditLog(
      this.audit,
      actor,
      'approval',
      saved.id,
      'approval.granted',
      { status: instance.status },
      { status: saved.status },
    );

    return ok(saved);
  }

  async reject(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<ApprovalInstance, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
      'APPROVER',
    ]);
    if (!access.ok) return access;

    const instance = await this.repos.approvals.findByRfqId(rfqId);
    if (!instance) return err(new ValidationError('No approval instance found'));
    if (instance.status !== 'PENDING') {
      return err(new ValidationError('Approval is not pending'));
    }

    const updated: ApprovalInstance = { ...instance, status: 'REJECTED' };
    const saved = await this.repos.approvals.save(updated);

    await auditLog(
      this.audit,
      actor,
      'approval',
      saved.id,
      'approval.rejected',
      { status: instance.status },
      { status: saved.status },
    );

    return ok(saved);
  }

  async castVote(
    actor: ActorContext,
    rfqId: string,
    choice: VoteChoice,
    recommendedQuoteId?: string,
    comment?: string,
  ): Promise<Result<CommitteeVote, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));
    if (rfq.status !== 'EVALUATING') {
      return err(new ValidationError('Voting only allowed during EVALUATING'));
    }

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'COMMITTEE_MEMBER',
      'MANAGER',
      'OWNER',
    ]);
    if (!access.ok) return access;

    const policy = await this.policyService.getPolicyForRfq(rfqId);
    if (!this.policyService.canVote(actor.orgRole ?? '', policy)) {
      return err(new ValidationError('Role not permitted to vote'));
    }

    const coi = await this.repos.coi.findByRfqAndProfile(rfqId, actor.profileId);
    if (!coi) {
      return err(new ValidationError('COI declaration required before voting'));
    }
    if (coi.status === 'DECLARED_CONFLICT') {
      return err(new ValidationError('COI conflict blocks voting'));
    }

    const existingVotes = await this.repos.votes.findByRfqId(rfqId);
    if (existingVotes.some((v) => v.profileId === actor.profileId)) {
      return err(new ValidationError('Vote already cast'));
    }

    const vote: CommitteeVote = {
      id: createId(),
      rfqId,
      profileId: actor.profileId,
      recommendedQuoteId,
      choice,
      comment,
      castAt: timestamp(),
    };

    const saved = await this.repos.votes.save(vote);
    await auditLog(
      this.audit,
      actor,
      'vote',
      saved.id,
      'vote.cast',
      null,
      { choice: saved.choice },
    );

    return ok(saved);
  }

  async declareCoi(
    actor: ActorContext,
    rfqId: string,
    status: CoiStatus,
    description?: string,
  ): Promise<Result<CoiDeclaration, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'COMMITTEE_MEMBER',
      'MANAGER',
      'OWNER',
      'APPROVER',
    ]);
    if (!access.ok) return access;

    const existing = await this.repos.coi.findByRfqAndProfile(
      rfqId,
      actor.profileId,
    );
    if (existing) return ok(existing);

    const decl: CoiDeclaration = {
      id: createId(),
      rfqId,
      profileId: actor.profileId,
      status,
      description,
      declaredAt: timestamp(),
    };

    const saved = await this.repos.coi.save(decl);
    await auditLog(
      this.audit,
      actor,
      'coi',
      saved.id,
      'coi.declared',
      null,
      { status: saved.status },
    );

    return ok(saved);
  }
}

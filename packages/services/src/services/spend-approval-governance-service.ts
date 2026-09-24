/**
 * OTP Stage R2-06: MSME Spend Approval Governance Service
 *
 * Orchestrates MSME spend governance, delegation proxies (public.organization_delegations),
 * monetary spend caps with UTC expiry, anti-self-approval rules (PA-09), and 1-click
 * approval execution for MSME Primary owners and delegated leads.
 */

import type {
  ApprovalTierPolicyConfig,
  OrganizationApprovalPolicy,
  RfqApprovalStage,
  ApprovalTierLevel,
  ApprovalRouteEvaluation,
  ApprovalExecutionRequest,
  ApprovalExecutionResult,
  ApprovalStageResolution,
  AwardLockEligibilityResult,
  OrganizationDelegation,
  DelegationPermission,
  MsmeSpendDecisionEvaluation,
  MsmeCanonicalRole,
} from '@otp/domain';
import {
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
  resolveRequiredApprovalTiers,
  validateApprovalEligibility,
  isRfqFullyApproved,
  evaluateApprovalRoute,
  validateApprovalPolicy,
  validateApprovalExecution,
  resolveApprovalStageStates,
  isAwardLockEligible,
  evaluateMsmeSpendDecisionState,
  isDelegationActiveForAction,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { EnterpriseApprovalMatrixService } from './enterprise-approval-matrix-service';

export class SpendApprovalGovernanceService extends EnterpriseApprovalMatrixService {
  constructor(
    repos: Repositories,
    audit: AuditAppService
  ) {
    super(repos, audit);
  }

  /**
   * Configures MSME spend governance policy (Manager cap, Primary sign-off, strict anti-self-approval).
   */
  async configureMsmeSpendPolicy(
    actor: ActorContext,
    params: {
      organizationId: string;
      policyName?: string;
      managerSpendCap?: number;
      preventSelfApproval?: boolean;
      requireDualSignoffAboveAmount?: number | null;
      customTiers?: ApprovalTierPolicyConfig[];
    }
  ): Promise<OrganizationApprovalPolicy> {
    const policyName = params.policyName || 'MSME Standard Spend Governance Policy';
    const managerCap = params.managerSpendCap ?? 500000; // default ₹5 Lakhs

    const tiers: ApprovalTierPolicyConfig[] = params.customTiers || [
      {
        tierLevel: 'TIER_1_MANAGER',
        tierName: 'Operations Manager Approval',
        minAmount: 0,
        maxAmount: managerCap,
        requiredApproverRoles: ['BUYER', 'MANAGER', 'APPROVER', 'OPERATIONS_MANAGER', 'OWNER', 'PRIMARY', 'DIRECTOR'],
        minApproversRequired: 1,
      },
      {
        tierLevel: 'TIER_2_DEPT_HEAD',
        tierName: 'Primary Business Owner Sign-off',
        minAmount: managerCap,
        maxAmount: 5000000,
        requiredApproverRoles: ['OWNER', 'PRIMARY', 'DIRECTOR', 'APPROVER'],
        minApproversRequired: 1,
      },
      {
        tierLevel: 'TIER_3_EXECUTIVE',
        tierName: 'Executive Directorate Sign-off',
        minAmount: 5000000,
        maxAmount: null,
        requiredApproverRoles: ['OWNER', 'PRIMARY', 'DIRECTOR'],
        minApproversRequired: 1,
      },
    ];

    return this.configurePolicy(actor, {
      organizationId: params.organizationId,
      policyName,
      tiers,
      preventSelfApproval: params.preventSelfApproval ?? true,
      requireDualSignoffAboveAmount: params.requireDualSignoffAboveAmount ?? 5000000,
    });
  }

  /**
   * Creates a time-bounded, spend-capped delegation proxy for MSME procurement.
   * Strictly enforces:
   *  - Anti-Self-Delegation (delegatorId !== delegateeId)
   *  - Primary/Owner or Admin authority check
   *  - Same organization isolation
   *  - Valid chronological time range (startsAt < expiresAt)
   *  - Spend cap validation
   */
  async createSpendDelegation(
    actor: ActorContext,
    params: {
      organizationId: string;
      delegateeId: string;
      delegateeName?: string;
      delegateeEmail?: string;
      permissions: DelegationPermission[];
      spendCapAmount?: number | null;
      startsAt: string;
      expiresAt: string;
      notes?: string;
    }
  ): Promise<OrganizationDelegation> {
    if (!actor.isPlatformAdmin && (actor.organizationId !== params.organizationId || !['OWNER', 'DIRECTOR', 'PRIMARY', 'ADMIN'].includes(actor.orgRole || ''))) {
      throw new ForbiddenError('Only MSME Primary Owners or Admins can grant spend delegations.');
    }

    if (actor.profileId === params.delegateeId) {
      throw new ValidationError('Self-delegation is strictly prohibited. You cannot delegate authority to yourself.');
    }

    const start = new Date(params.startsAt);
    const expiry = new Date(params.expiresAt);
    if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
      throw new ValidationError('Invalid start or expiry date format.');
    }
    if (start.getTime() >= expiry.getTime()) {
      throw new ValidationError('Delegation start time must be strictly before expiration time.');
    }

    if (params.spendCapAmount !== undefined && params.spendCapAmount !== null && params.spendCapAmount <= 0) {
      throw new ValidationError('Spend cap amount must be a positive number.');
    }

    const now = new Date().toISOString();
    const delegation: OrganizationDelegation = {
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      delegatorId: actor.profileId,
      delegatorName: null,
      delegatorEmail: null,
      delegateeId: params.delegateeId,
      delegateeName: params.delegateeName || null,
      delegateeEmail: params.delegateeEmail || null,
      permissions: params.permissions,
      spendCapAmount: params.spendCapAmount ?? null,
      startsAt: params.startsAt,
      expiresAt: params.expiresAt,
      isActive: true,
      notes: params.notes || null,
      createdAt: now,
    };

    if ((this as any).repos.organizationDelegations) {
      await (this as any).repos.organizationDelegations.save(delegation as any);
    }

    await auditLog(
      (this as any).audit,
      actor,
      'ORGANIZATION_DELEGATION',
      delegation.id,
      'CREATE_SPEND_DELEGATION',
      null,
      {
        organizationId: params.organizationId,
        delegateeId: params.delegateeId,
        permissions: params.permissions,
        spendCapAmount: params.spendCapAmount,
        expiresAt: params.expiresAt,
      }
    );

    return delegation;
  }

  /**
   * Revokes an existing spend delegation.
   */
  async revokeSpendDelegation(
    actor: ActorContext,
    params: {
      organizationId: string;
      delegationId: string;
      reason?: string;
    }
  ): Promise<OrganizationDelegation> {
    if (!actor.isPlatformAdmin && (actor.organizationId !== params.organizationId || !['OWNER', 'DIRECTOR', 'PRIMARY', 'ADMIN'].includes(actor.orgRole || ''))) {
      throw new ForbiddenError('Only MSME Primary Owners or Admins can revoke delegations.');
    }

    if (!(this as any).repos.organizationDelegations) {
      throw new NotFoundError(`Delegation repository not available`);
    }

    const existing = await (this as any).repos.organizationDelegations.findById(params.delegationId);
    if (!existing) {
      throw new NotFoundError(`Delegation ${params.delegationId} not found`);
    }

    if (existing.organizationId !== params.organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError(`Delegation does not belong to organization ${params.organizationId}`);
    }

    const now = new Date().toISOString();
    const updated: OrganizationDelegation = {
      ...existing,
      permissions: existing.permissions as any,
      isActive: false,
      revokedAt: now,
      notes: params.reason ? `${existing.notes || ''} [Revoked: ${params.reason}]`.trim() : existing.notes,
    };

    await (this as any).repos.organizationDelegations.save(updated as any);

    await auditLog(
      (this as any).audit,
      actor,
      'ORGANIZATION_DELEGATION',
      updated.id,
      'REVOKE_SPEND_DELEGATION',
      existing,
      { reason: params.reason }
    );

    return updated;
  }

  /**
   * Evaluates spend decision state for an MSME actor on a given RFQ.
   */
  async evaluateActorSpendDecision(
    actor: ActorContext,
    params: {
      rfqId: string;
      procurementAmount?: number;
      currentTime?: Date;
    }
  ): Promise<MsmeSpendDecisionEvaluation> {
    const rfq = await (this as any).repos.rfqs.findById(params.rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${params.rfqId} not found`);

    const amount = params.procurementAmount ?? rfq.budgetAmount ?? 0;
    const orgId = rfq.organizationId || actor.organizationId || '';

    // Fetch active delegations for this actor in this org
    let activeDelegation: OrganizationDelegation | null = null;
    if ((this as any).repos.organizationDelegations && orgId) {
      const delegations = await (this as any).repos.organizationDelegations.findByDelegateeId?.(actor.profileId) || [];
      const matching = delegations.find((d: any) => d.organizationId === orgId && d.isActive && !d.revokedAt);
      if (matching) {
        activeDelegation = {
          ...matching,
          permissions: matching.permissions as any,
        };
      }
    }

    return evaluateMsmeSpendDecisionState({
      actorProfileId: actor.profileId,
      actorRole: actor.orgRole || 'MEMBER',
      rfqCreatorProfileId: rfq.createdBy,
      procurementAmount: amount,
      activeDelegation,
      currentTime: params.currentTime,
    });
  }
}

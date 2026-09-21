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
  ApprovalSignatureMode,
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
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';

export class EnterpriseApprovalMatrixService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService
  ) {}

  /**
   * Configures organization multi-tier policy.
   */
  async configurePolicy(
    actor: ActorContext,
    params: {
      organizationId: string;
      policyName: string;
      tiers?: ApprovalTierPolicyConfig[];
      preventSelfApproval?: boolean;
      requireDualSignoffAboveAmount?: number | null;
    }
  ): Promise<OrganizationApprovalPolicy> {
    if (!actor.isPlatformAdmin && (actor.organizationId !== params.organizationId || !['OWNER', 'DIRECTOR', 'ADMIN'].includes(actor.orgRole || ''))) {
      throw new ForbiddenError('Only Organization Owners or Admins can configure approval policies.');
    }

    const tiers = params.tiers || [...DEFAULT_ENTERPRISE_APPROVAL_TIERS];
    const now = new Date().toISOString();
    const existing = await this.repos.organizationApprovalPolicies?.findByOrganizationId(params.organizationId);

    const policy: OrganizationApprovalPolicy = {
      id: existing?.id || crypto.randomUUID(),
      organizationId: params.organizationId,
      policyName: params.policyName,
      isActive: true,
      tiers,
      preventSelfApproval: params.preventSelfApproval ?? true,
      requireDualSignoffAboveAmount: params.requireDualSignoffAboveAmount ?? 5000000,
      version: (existing?.version || 0) + 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (this.repos.organizationApprovalPolicies) {
      await this.repos.organizationApprovalPolicies.save({
        ...policy,
        tiers: policy.tiers as any,
      });
    }

    await auditLog(
      this.audit,
      actor,
      'ORGANIZATION_APPROVAL_POLICY',
      policy.id,
      'CONFIGURE_APPROVAL_POLICY',
      null,
      { organizationId: params.organizationId, version: policy.version }
    );

    return policy;
  }

  /**
   * Initializes approval stages for an RFQ based on its awarded/estimated amount.
   */
  async initializeRfqStages(
    actor: ActorContext,
    rfqId: string,
    procurementAmount: number
  ): Promise<RfqApprovalStage[]> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${rfqId} not found`);

    let policy = await this.repos.organizationApprovalPolicies?.findByOrganizationId(rfq.organizationId);
    const tiers: ApprovalTierPolicyConfig[] = (policy?.tiers as unknown as ApprovalTierPolicyConfig[]) || [...DEFAULT_ENTERPRISE_APPROVAL_TIERS];

    const requiredTiers = resolveRequiredApprovalTiers(procurementAmount, tiers);
    const now = new Date().toISOString();

    const stages: RfqApprovalStage[] = requiredTiers.map((tierConfig, idx) => ({
      id: crypto.randomUUID(),
      rfqId,
      organizationId: rfq.organizationId,
      tierLevel: tierConfig.tierLevel,
      stageOrder: idx + 1,
      status: 'PENDING',
      thresholdMinAmount: tierConfig.minAmount,
      thresholdMaxAmount: tierConfig.maxAmount,
      procurementAmount,
      createdAt: now,
      updatedAt: now,
    }));

    if (this.repos.rfqApprovalStages) {
      await this.repos.rfqApprovalStages.saveMany(stages as any);
    }

    return stages;
  }

  /**
   * Executes atomic digital sign-off for an approval tier with full direct or delegated validation.
   */
  async executeTierApproval(
    actor: ActorContext,
    params: {
      rfqId: string;
      tierLevel: ApprovalTierLevel;
      notes?: string;
      delegationId?: string | null;
      signatureHash?: string;
      delegation?: OrganizationDelegation | null;
      currentTime?: Date;
    }
  ): Promise<ApprovalExecutionResult> {
    const currentTime = params.currentTime || new Date();
    const rfq = await this.repos.rfqs.findById(params.rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${params.rfqId} not found`);

    if (!actor.isPlatformAdmin && actor.organizationId !== rfq.organizationId) {
      throw new ForbiddenError(`Actor organization ${actor.organizationId} does not match RFQ organization ${rfq.organizationId}`);
    }

    const existingPolicy = await this.repos.organizationApprovalPolicies?.findByOrganizationId(rfq.organizationId);
    const policy: OrganizationApprovalPolicy = existingPolicy
      ? {
          ...existingPolicy,
          tiers: existingPolicy.tiers as any,
        }
      : {
          id: 'default',
          organizationId: rfq.organizationId,
          policyName: 'Default Policy',
          isActive: true,
          tiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
          preventSelfApproval: true,
          version: 1,
          createdAt: currentTime.toISOString(),
          updatedAt: currentTime.toISOString(),
        };

    let stages = (await this.repos.rfqApprovalStages?.findByRfqId(params.rfqId)) || [];
    let targetStage = stages.find((s) => s.tierLevel === params.tierLevel);

    // If stages don't exist yet, evaluate route and initialize them
    if (!targetStage) {
      const evaluation = await this.evaluateApprovalRoute(actor, {
        rfqId: params.rfqId,
        procurementAmount: stages[0]?.procurementAmount || 0,
      });
      stages = await this.initializeRfqStages(actor, params.rfqId, evaluation.policySnapshot.tiers[0]?.minAmount || 0);
      targetStage = stages.find((s) => s.tierLevel === params.tierLevel);
    }

    if (!targetStage) {
      throw new NotFoundError(`Approval stage ${params.tierLevel} not found for RFQ ${params.rfqId}`);
    }

    // Resolve delegation object if delegationId is provided
    let delegation = params.delegation ?? null;
    if (params.delegationId && !delegation && this.repos.organizationDelegations) {
      const foundDel = await this.repos.organizationDelegations.findById(params.delegationId);
      if (foundDel) {
        delegation = {
          ...foundDel,
          permissions: foundDel.permissions as any,
        };
      }
    }

    // Evaluate route for executive gate context
    const route = await this.evaluateApprovalRoute(actor, {
      rfqId: params.rfqId,
      procurementAmount: targetStage.procurementAmount,
    });

    const previousStages = stages.filter((s) => s.stageOrder < targetStage!.stageOrder) as RfqApprovalStage[];

    const executionRequest: ApprovalExecutionRequest = {
      rfqId: params.rfqId,
      organizationId: rfq.organizationId,
      tierLevel: params.tierLevel,
      stageOrder: targetStage.stageOrder,
      actorProfileId: actor.profileId,
      actorRole: actor.isPlatformAdmin ? 'OWNER' : actor.orgRole || 'COMMITTEE_MEMBER',
      rfqCreatorProfileId: rfq.createdBy,
      procurementAmount: targetStage.procurementAmount,
      signatureMode: params.delegationId || delegation ? 'DELEGATED' : 'DIRECT',
      delegationId: params.delegationId,
      delegation,
      notes: params.notes,
      digitalSignatureHash: params.signatureHash,
    };

    const validation = validateApprovalExecution({
      request: executionRequest,
      stage: targetStage as any,
      previousStages,
      policy,
      route,
      currentTime,
    });

    if (!validation.valid && !actor.isPlatformAdmin) {
      throw new ForbiddenError(validation.error || 'Approval validation failed.');
    }

    const now = currentTime.toISOString();
    const signatureHash =
      params.signatureHash ||
      `${params.rfqId}:${params.tierLevel}:${actor.profileId}:${now}`;

    const updatedStage: RfqApprovalStage = {
      ...(targetStage as any),
      status: 'APPROVED',
      approverProfileId: actor.profileId,
      approverRole: actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : actor.orgRole || 'APPROVER',
      approverComments: params.notes || null,
      digitalSignatureHash: signatureHash,
      delegationId: validation.delegationId || null,
      delegatorProfileId: validation.delegatorProfileId || null,
      signatureMode: validation.signatureMode,
      notes: params.notes || null,
      approvedAt: now,
      updatedAt: now,
    } as any;

    if (this.repos.rfqApprovalStages) {
      await this.repos.rfqApprovalStages.save(updatedStage as any);
    }

    const allUpdatedStages = stages.map((s) => (s.id === updatedStage.id ? updatedStage : s));
    const allApproved = isRfqFullyApproved(allUpdatedStages as any);

    await auditLog(
      this.audit,
      actor,
      'RFQ_APPROVAL_STAGE',
      updatedStage.id,
      'RFQ_TIER_APPROVED',
      null,
      {
        rfqId: params.rfqId,
        tierLevel: params.tierLevel,
        stageOrder: targetStage.stageOrder,
        signatureMode: validation.signatureMode,
        delegationId: validation.delegationId,
        delegatorProfileId: validation.delegatorProfileId,
        allStagesApproved: allApproved,
      }
    );

    return {
      success: true,
      stageId: updatedStage.id,
      rfqId: params.rfqId,
      tierLevel: params.tierLevel,
      stageOrder: targetStage.stageOrder,
      signatureMode: validation.signatureMode,
      approverProfileId: actor.profileId,
      delegatorProfileId: validation.delegatorProfileId,
      delegationId: validation.delegationId,
      allStagesApproved: allApproved,
    };
  }

  /**
   * Submits a tier approval/rejection decision atomically with anti-bypass validation.
   * Backwards-compatible signature supporting stageOrder or tierLevel.
   */
  async submitTierDecision(
    actor: ActorContext,
    params: {
      rfqId: string;
      stageOrder: number;
      decision: 'APPROVED' | 'REJECTED';
      comments?: string;
      signatureHash?: string;
      delegationId?: string | null;
      delegation?: OrganizationDelegation | null;
    }
  ): Promise<RfqApprovalStage> {
    const stages = (await this.repos.rfqApprovalStages?.findByRfqId(params.rfqId)) || [];
    const targetStage = stages.find((s) => s.stageOrder === params.stageOrder);
    if (!targetStage) {
      throw new NotFoundError(`Approval stage ${params.stageOrder} not found for RFQ ${params.rfqId}`);
    }

    if (params.decision === 'APPROVED') {
      const execResult = await this.executeTierApproval(actor, {
        rfqId: params.rfqId,
        tierLevel: targetStage.tierLevel,
        notes: params.comments,
        delegationId: params.delegationId,
        delegation: params.delegation,
        signatureHash: params.signatureHash,
      });

      const updated = (await this.repos.rfqApprovalStages?.findById(execResult.stageId!)) || targetStage;
      return updated as unknown as RfqApprovalStage;
    } else {
      // Rejection logic
      const rfq = await this.repos.rfqs.findById(params.rfqId);
      if (!rfq) throw new NotFoundError(`RFQ ${params.rfqId} not found`);

      if (!actor.isPlatformAdmin && actor.organizationId !== rfq.organizationId) {
        throw new ForbiddenError(`Actor organization ${actor.organizationId} does not match RFQ organization ${rfq.organizationId}`);
      }

      if (rfq.createdBy === actor.profileId && !actor.isPlatformAdmin) {
        throw new ForbiddenError('Anti-bypass policy violation: Procurement creator cannot reject or approve own RFQ.');
      }

      const now = new Date().toISOString();
      const updatedStage: RfqApprovalStage = {
        ...(targetStage as any),
        status: 'REJECTED',
        approverProfileId: actor.profileId,
        approverRole: actor.orgRole || 'APPROVER',
        approverComments: params.comments || null,
        notes: params.comments || null,
        digitalSignatureHash: params.signatureHash || null,
        rejectedAt: now,
        updatedAt: now,
      };

      if (this.repos.rfqApprovalStages) {
        await this.repos.rfqApprovalStages.save(updatedStage as any);
      }

      await auditLog(
        this.audit,
        actor,
        'RFQ_APPROVAL_STAGE',
        updatedStage.id,
        'RFQ_TIER_REJECTED',
        null,
        { rfqId: params.rfqId, stageOrder: params.stageOrder, decision: 'REJECTED' }
      );

      return updatedStage;
    }
  }

  /**
   * Retrieves comprehensive approval execution status, stage resolutions, and award lock eligibility.
   */
  async getApprovalExecutionStatus(
    actor: ActorContext,
    rfqId: string,
    delegations: OrganizationDelegation[] = [],
    currentTime = new Date()
  ): Promise<{
    route: ApprovalRouteEvaluation | null;
    stages: RfqApprovalStage[];
    stageResolutions: ApprovalStageResolution[];
    awardLockEligibility: AwardLockEligibilityResult;
  }> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${rfqId} not found`);

    const stages = ((await this.repos.rfqApprovalStages?.findByRfqId(rfqId)) || []) as unknown as RfqApprovalStage[];
    const procurementAmount = stages[0]?.procurementAmount || 0;

    let route: ApprovalRouteEvaluation | null = null;
    try {
      route = await this.evaluateApprovalRoute(actor, {
        rfqId,
        procurementAmount,
      });
    } catch {
      route = null;
    }

    const stageResolutions = route
      ? resolveApprovalStageStates({
          route,
          stages,
          actorProfileId: actor.profileId,
          actorRole: actor.isPlatformAdmin ? 'OWNER' : actor.orgRole || 'COMMITTEE_MEMBER',
          rfqCreatorProfileId: rfq.createdBy,
          delegations,
          currentTime,
        })
      : [];

    const awardLockEligibility = isAwardLockEligible(stages, route);

    return {
      route,
      stages,
      stageResolutions,
      awardLockEligibility,
    };
  }

  /**
   * Evaluates dynamic spend approval route and returns threshold routing details.
   */
  async evaluateApprovalRoute(
    actor: ActorContext,
    params: {
      rfqId: string;
      procurementAmount: number;
    }
  ): Promise<ApprovalRouteEvaluation> {
    const rfq = await this.repos.rfqs.findById(params.rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${params.rfqId} not found`);

    const policy = await this.repos.organizationApprovalPolicies?.findByOrganizationId(rfq.organizationId);

    const evaluation = evaluateApprovalRoute(
      {
        rfqId: params.rfqId,
        organizationId: rfq.organizationId,
        estimatedOrAwardedAmount: params.procurementAmount,
        creatorProfileId: rfq.createdBy,
        actorProfileId: actor.profileId,
        actorRole: actor.orgRole,
      },
      policy ? (policy as unknown as OrganizationApprovalPolicy) : null
    );

    return evaluation;
  }
}

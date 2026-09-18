import type {
  ApprovalTierPolicyConfig,
  OrganizationApprovalPolicy,
  RfqApprovalStage,
  ApprovalTierLevel,
} from '@otp/domain';
import {
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
  resolveRequiredApprovalTiers,
  validateApprovalEligibility,
  isRfqFullyApproved,
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
   * Submits a tier approval/rejection decision atomically with anti-bypass validation.
   */
  async submitTierDecision(
    actor: ActorContext,
    params: {
      rfqId: string;
      stageOrder: number;
      decision: 'APPROVED' | 'REJECTED';
      comments?: string;
      signatureHash?: string;
    }
  ): Promise<RfqApprovalStage> {
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

    const stages = (await this.repos.rfqApprovalStages?.findByRfqId(params.rfqId)) || [];
    const targetStage = stages.find((s) => s.stageOrder === params.stageOrder);
    if (!targetStage) {
      throw new NotFoundError(`Approval stage ${params.stageOrder} not found for RFQ ${params.rfqId}`);
    }

    // Validate anti-bypass & role eligibility
    const actorRoles = actor.isPlatformAdmin ? ['OWNER', 'DIRECTOR', 'EXECUTIVE', 'VP', 'MANAGER', 'BUYER'] : [actor.orgRole || 'BUYER'];
    const eligibility = validateApprovalEligibility({
      policy,
      stage: targetStage as any,
      previousStages: stages as any,
      actorProfileId: actor.profileId,
      actorRoles,
      rfqCreatorProfileId: rfq.createdBy,
    });

    if (!eligibility.eligible && !actor.isPlatformAdmin) {
      throw new ForbiddenError(eligibility.reason || 'Approval validation failed.');
    }

    const now = new Date().toISOString();
    const updatedStage: RfqApprovalStage = {
      ...(targetStage as any),
      status: params.decision,
      approverProfileId: actor.profileId,
      approverRole: actor.orgRole || 'PLATFORM_ADMIN',
      approverComments: params.comments || null,
      digitalSignatureHash: params.signatureHash || null,
      approvedAt: params.decision === 'APPROVED' ? now : null,
      rejectedAt: params.decision === 'REJECTED' ? now : null,
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
      `RFQ_TIER_${params.decision}`,
      null,
      { rfqId: params.rfqId, stageOrder: params.stageOrder, decision: params.decision }
    );

    return updatedStage;
  }
}

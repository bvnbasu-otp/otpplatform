/**
 * OTP Phase C8.4: Multi-Tier Spend Approval Orchestration & Delegation Signoff Chain
 *
 * Domain models, types, and pure validation engines for:
 *   1. Atomic approval execution (direct and delegated proxy modes).
 *   2. Sequential progression and multi-tier stage resolution.
 *   3. Anti-self-approval & segregation of duties enforcement (creator cannot approve direct or via proxy).
 *   4. Delegation proxy validation (active time window, spend caps, delegatee matching, non-delegable Tier 3 Executive Gate).
 *   5. Award locking & PO issuance eligibility evaluation.
 */

import {
  type ApprovalTierLevel,
  type ApprovalTierPolicyConfig,
  type OrganizationApprovalPolicy,
  type RfqApprovalStage,
  type TierApprovalStatus,
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
} from './approval-matrix';
import {
  type OrganizationDelegation,
  type DelegationPermission,
  isDelegationActiveForAction,
  checkSegregationOfDuties,
} from './buyer-governance';
import {
  type ApprovalRouteEvaluation,
} from './threshold-routing';

export type ApprovalSignatureMode = 'DIRECT' | 'DELEGATED';

export type ApprovalStageState =
  | 'NOT_REQUIRED'
  | 'BLOCKED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export type ApprovalExecutionViolationCode =
  | 'UNAUTHORIZED'
  | 'DELEGATION_EXPIRED'
  | 'DELEGATION_FUTURE'
  | 'DELEGATION_REVOKED'
  | 'DELEGATION_INACTIVE'
  | 'SPEND_CAP_EXCEEDED'
  | 'SELF_APPROVAL_DENIED'
  | 'SELF_DELEGATION_DENIED'
  | 'EXECUTIVE_GATE_REQUIRED'
  | 'PREVIOUS_TIER_PENDING'
  | 'ALREADY_APPROVED'
  | 'ROUTE_NOT_FOUND'
  | 'ORGANIZATION_MISMATCH'
  | 'STAGE_NOT_FOUND'
  | 'INVALID_ROLE';

export interface ApprovalExecutionRequest {
  rfqId: string;
  organizationId: string;
  tierLevel: ApprovalTierLevel;
  stageOrder: number;
  actorProfileId: string;
  actorRole: string;
  rfqCreatorProfileId: string;
  procurementAmount: number;
  signatureMode?: ApprovalSignatureMode;
  delegationId?: string | null;
  delegation?: OrganizationDelegation | null;
  notes?: string | null;
  digitalSignatureHash?: string | null;
}

export interface ApprovalExecutionResult {
  success: boolean;
  stageId?: string;
  rfqId: string;
  tierLevel: ApprovalTierLevel;
  stageOrder: number;
  signatureMode: ApprovalSignatureMode;
  approverProfileId: string;
  delegatorProfileId?: string | null;
  delegationId?: string | null;
  allStagesApproved: boolean;
  error?: string;
  violationCode?: ApprovalExecutionViolationCode;
}

export interface ApprovalStageResolution {
  stageOrder: number;
  tierLevel: ApprovalTierLevel;
  tierName: string;
  thresholdMinAmount: number;
  thresholdMaxAmount: number | null;
  procurementAmount: number;
  state: ApprovalStageState;
  status: TierApprovalStatus;
  canApproveDirect: boolean;
  canApproveDelegated: boolean;
  matchingDelegation?: OrganizationDelegation | null;
  blockingReason?: string | null;
  approvedBy?: string | null;
  approverRole?: string | null;
  approvedAt?: string | null;
  signatureMode?: ApprovalSignatureMode | null;
  delegatorProfileId?: string | null;
}

export interface AwardLockEligibilityResult {
  eligible: boolean;
  isLocked: boolean;
  allRequiredTiersApproved: boolean;
  requiredTierLevels: ApprovalTierLevel[];
  completedTierLevels: ApprovalTierLevel[];
  pendingTierLevels: ApprovalTierLevel[];
  reason: string;
}

/**
 * Maps tier level to required delegation permission.
 */
export function getRequiredDelegationPermissionForTier(tierLevel: ApprovalTierLevel): DelegationPermission {
  switch (tierLevel) {
    case 'TIER_1_MANAGER':
      return 'APPROVE_TIER_1';
    case 'TIER_2_DEPT_HEAD':
      return 'APPROVE_TIER_2';
    case 'TIER_3_EXECUTIVE':
      return 'APPROVE_TIER_3';
    default:
      return 'APPROVE_TIER_1';
  }
}

/**
 * Validates approval execution invariants for direct or delegated digital sign-off.
 * Pure TypeScript function with zero external infrastructure dependencies.
 */
export function validateApprovalExecution(params: {
  request: ApprovalExecutionRequest;
  stage: RfqApprovalStage;
  previousStages: RfqApprovalStage[];
  policy?: OrganizationApprovalPolicy | null;
  route?: ApprovalRouteEvaluation | null;
  currentTime?: Date;
}): {
  valid: boolean;
  error?: string;
  violationCode?: ApprovalExecutionViolationCode;
  signatureMode: ApprovalSignatureMode;
  delegationId?: string | null;
  delegatorProfileId?: string | null;
} {
  const { request, stage, previousStages, policy, route, currentTime = new Date() } = params;
  const nowTime = currentTime.getTime();

  // 1. Organization Isolation Check
  if (request.organizationId !== stage.organizationId) {
    return {
      valid: false,
      error: `Cross-tenant violation: RFQ organization (${stage.organizationId}) does not match actor organization (${request.organizationId}).`,
      violationCode: 'ORGANIZATION_MISMATCH',
      signatureMode: 'DIRECT',
    };
  }

  // 2. Stage Exists & Matches
  if (stage.tierLevel !== request.tierLevel || stage.stageOrder !== request.stageOrder) {
    return {
      valid: false,
      error: `Stage mismatch: Target stage order ${stage.stageOrder} (${stage.tierLevel}) does not match request order ${request.stageOrder} (${request.tierLevel}).`,
      violationCode: 'STAGE_NOT_FOUND',
      signatureMode: 'DIRECT',
    };
  }

  // 3. No Replay Invariant: Stage already approved cannot be re-approved
  if (stage.status === 'APPROVED') {
    return {
      valid: false,
      error: `Stage ${stage.stageOrder} (${stage.tierLevel}) has already been approved. Replay rejected.`,
      violationCode: 'ALREADY_APPROVED',
      signatureMode: 'DIRECT',
    };
  }

  if (stage.status !== 'PENDING') {
    return {
      valid: false,
      error: `Stage ${stage.stageOrder} is in status ${stage.status}, not PENDING.`,
      violationCode: 'ALREADY_APPROVED',
      signatureMode: 'DIRECT',
    };
  }

  // 4. Sequential Progression Invariant: Prior stages must all be APPROVED
  const pendingPriorStage = previousStages.find(
    (s) => s.stageOrder < stage.stageOrder && s.status !== 'APPROVED'
  );
  if (pendingPriorStage) {
    return {
      valid: false,
      error: `Sequential governance violation: Prior tier stage ${pendingPriorStage.stageOrder} (${pendingPriorStage.tierLevel}) is not yet approved.`,
      violationCode: 'PREVIOUS_TIER_PENDING',
      signatureMode: 'DIRECT',
    };
  }

  // 5. Anti-Self-Approval Check (Direct)
  const isSelfApproval = request.actorProfileId === request.rfqCreatorProfileId;
  const preventSelfApproval = policy?.preventSelfApproval ?? true;

  if (isSelfApproval && preventSelfApproval) {
    return {
      valid: false,
      error: `Anti-bypass policy violation: Procurement creator (${request.rfqCreatorProfileId}) cannot sign off or approve their own RFQ.`,
      violationCode: 'SELF_APPROVAL_DENIED',
      signatureMode: 'DIRECT',
    };
  }

  // Determine authorized roles for this tier
  const tierConfig =
    policy?.tiers.find((t) => t.tierLevel === stage.tierLevel) ||
    DEFAULT_ENTERPRISE_APPROVAL_TIERS.find((t) => t.tierLevel === stage.tierLevel);

  const requiredRoles = tierConfig?.requiredApproverRoles || ['OWNER', 'MANAGER', 'APPROVER'];
  const hasDirectRole = requiredRoles.includes(request.actorRole);

  // 6. Delegation Validation (if delegation specified or requested)
  const delegation = request.delegation;
  const isDelegationAttempt = Boolean(request.delegationId || delegation || request.signatureMode === 'DELEGATED');

  if (isDelegationAttempt) {
    if (!delegation) {
      return {
        valid: false,
        error: 'Delegated sign-off requested but no valid delegation proxy object was provided.',
        violationCode: 'DELEGATION_INACTIVE',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.1 Organization Match on Delegation
    if (delegation.organizationId !== stage.organizationId) {
      return {
        valid: false,
        error: 'Delegation organization does not match RFQ organization.',
        violationCode: 'ORGANIZATION_MISMATCH',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.2 Delegatee Profile Match
    if (delegation.delegateeId !== request.actorProfileId) {
      return {
        valid: false,
        error: `Delegation delegatee ID (${delegation.delegateeId}) does not match caller (${request.actorProfileId}).`,
        violationCode: 'UNAUTHORIZED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.3 Anti-Self-Delegation
    if (delegation.delegatorId === delegation.delegateeId) {
      return {
        valid: false,
        error: 'Self-delegation is prohibited.',
        violationCode: 'SELF_DELEGATION_DENIED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.4 Anti-Self-Approval via Proxy: RFQ Creator cannot be the delegator
    if (delegation.delegatorId === request.rfqCreatorProfileId) {
      return {
        valid: false,
        error: `Anti-bypass policy violation: Procurement creator (${request.rfqCreatorProfileId}) cannot delegate authority to approve their own RFQ.`,
        violationCode: 'SELF_APPROVAL_DENIED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.5 Active & Revocation Check
    if (!delegation.isActive) {
      return {
        valid: false,
        error: 'Delegation proxy is inactive.',
        violationCode: 'DELEGATION_INACTIVE',
        signatureMode: 'DELEGATED',
      };
    }

    if (delegation.revokedAt) {
      return {
        valid: false,
        error: 'Delegation proxy has been revoked.',
        violationCode: 'DELEGATION_REVOKED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.6 Time Window Check
    const startsTime = new Date(delegation.startsAt).getTime();
    const expiresTime = new Date(delegation.expiresAt).getTime();

    if (nowTime < startsTime) {
      return {
        valid: false,
        error: `Delegation proxy start time (${delegation.startsAt}) is in the future.`,
        violationCode: 'DELEGATION_FUTURE',
        signatureMode: 'DELEGATED',
      };
    }

    if (nowTime > expiresTime) {
      return {
        valid: false,
        error: `Delegation proxy expired at ${delegation.expiresAt}.`,
        violationCode: 'DELEGATION_EXPIRED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.7 Spend Cap Check: RFQ amount <= spendCapAmount
    const rfqAmount = request.procurementAmount || stage.procurementAmount;
    if (delegation.spendCapAmount != null && rfqAmount > delegation.spendCapAmount) {
      return {
        valid: false,
        error: `Delegation spend cap exceeded: RFQ amount ₹${rfqAmount.toLocaleString('en-IN')} exceeds spend cap limit ₹${delegation.spendCapAmount.toLocaleString('en-IN')}.`,
        violationCode: 'SPEND_CAP_EXCEEDED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.8 Permission Match
    const requiredPermission = getRequiredDelegationPermissionForTier(stage.tierLevel);
    if (!delegation.permissions.includes(requiredPermission)) {
      return {
        valid: false,
        error: `Delegation does not grant permission ${requiredPermission}. Granted: [${delegation.permissions.join(', ')}].`,
        violationCode: 'UNAUTHORIZED',
        signatureMode: 'DELEGATED',
      };
    }

    // 6.9 Executive Gate Invariant: Tier 3 (>₹25L) cannot be delegated to non-executive roles
    if (stage.tierLevel === 'TIER_3_EXECUTIVE') {
      const isExecutiveRole = ['CFO', 'DIRECTOR', 'EXECUTIVE', 'OWNER'].includes(request.actorRole);
      if (!isExecutiveRole && route && !route.delegationAllowed) {
        return {
          valid: false,
          error: 'Tier 3 Executive Gate (>₹25L) cannot be delegated to non-executive personnel.',
          violationCode: 'EXECUTIVE_GATE_REQUIRED',
          signatureMode: 'DELEGATED',
        };
      }
    }

    return {
      valid: true,
      signatureMode: 'DELEGATED',
      delegationId: delegation.id,
      delegatorProfileId: delegation.delegatorId,
    };
  }

  // 7. Direct Role Check
  if (!hasDirectRole) {
    return {
      valid: false,
      error: `Unauthorized: User role '${request.actorRole}' does not satisfy required roles [${requiredRoles.join(', ')}] for ${stage.tierLevel}, and no valid delegation proxy was supplied.`,
      violationCode: 'UNAUTHORIZED',
      signatureMode: 'DIRECT',
    };
  }

  return {
    valid: true,
    signatureMode: 'DIRECT',
    delegationId: null,
    delegatorProfileId: null,
  };
}

/**
 * Resolves the state and interactive readiness for each approval stage for a specific actor.
 */
export function resolveApprovalStageStates(params: {
  route: ApprovalRouteEvaluation;
  stages: RfqApprovalStage[];
  actorProfileId: string;
  actorRole: string;
  rfqCreatorProfileId: string;
  delegations: OrganizationDelegation[];
  currentTime?: Date;
}): ApprovalStageResolution[] {
  const { route, stages, actorProfileId, actorRole, rfqCreatorProfileId, delegations, currentTime = new Date() } = params;
  const isCreator = actorProfileId === rfqCreatorProfileId;

  const sortedStages = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
  const resolutions: ApprovalStageResolution[] = [];

  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i]!;
    const priorStages = sortedStages.slice(0, i);
    const hasPriorIncomplete = priorStages.some((s) => s.status !== 'APPROVED');

    let state: ApprovalStageState;
    if (stage.status === 'APPROVED') {
      state = 'APPROVED';
    } else if (stage.status === 'REJECTED') {
      state = 'REJECTED';
    } else if (hasPriorIncomplete) {
      state = 'BLOCKED';
    } else {
      state = 'PENDING';
    }

    const tierConfig =
      route.applicableTiers.find((t) => t.tierLevel === stage.tierLevel) ||
      DEFAULT_ENTERPRISE_APPROVAL_TIERS.find((t) => t.tierLevel === stage.tierLevel);

    const requiredRoles = tierConfig?.requiredApproverRoles || ['OWNER', 'MANAGER', 'APPROVER'];
    const hasDirectRole = requiredRoles.includes(actorRole);

    let canApproveDirect = false;
    let canApproveDelegated = false;
    let matchingDelegation: OrganizationDelegation | null = null;
    let blockingReason: string | null = null;

    if (state === 'APPROVED') {
      blockingReason = 'Stage already approved';
    } else if (state === 'BLOCKED') {
      blockingReason = 'Waiting on prior tier approval completion';
    } else if (isCreator && route.policySnapshot.preventSelfApproval) {
      blockingReason = 'Anti-bypass: RFQ creator cannot approve own RFQ';
    } else {
      // Check direct eligibility
      if (hasDirectRole && !isCreator) {
        canApproveDirect = true;
      }

      // Check delegation eligibility
      const requiredPerm = getRequiredDelegationPermissionForTier(stage.tierLevel);
      for (const del of delegations) {
        if (
          del.delegateeId === actorProfileId &&
          del.organizationId === stage.organizationId &&
          del.delegatorId !== rfqCreatorProfileId // anti-self-approval via proxy
        ) {
          const activeCheck = isDelegationActiveForAction({
            delegation: del,
            permission: requiredPerm,
            amount: stage.procurementAmount,
            currentTime,
          });

          if (activeCheck.active) {
            // Check executive gate
            if (stage.tierLevel === 'TIER_3_EXECUTIVE' && !route.delegationAllowed) {
              const isExec = ['CFO', 'DIRECTOR', 'EXECUTIVE', 'OWNER'].includes(actorRole);
              if (isExec) {
                canApproveDelegated = true;
                matchingDelegation = del;
                break;
              }
            } else {
              canApproveDelegated = true;
              matchingDelegation = del;
              break;
            }
          }
        }
      }

      if (!canApproveDirect && !canApproveDelegated) {
        blockingReason = isCreator
          ? 'Anti-bypass: RFQ creator cannot approve own RFQ'
          : `Insufficient role authority (Required: ${requiredRoles.join(', ')})`;
      }
    }

    resolutions.push({
      stageOrder: stage.stageOrder,
      tierLevel: stage.tierLevel,
      tierName: tierConfig?.tierName || `Tier ${stage.stageOrder}: ${stage.tierLevel}`,
      thresholdMinAmount: stage.thresholdMinAmount,
      thresholdMaxAmount: stage.thresholdMaxAmount,
      procurementAmount: stage.procurementAmount,
      state,
      status: stage.status,
      canApproveDirect,
      canApproveDelegated,
      matchingDelegation,
      blockingReason,
      approvedBy: stage.approverProfileId,
      approverRole: stage.approverRole,
      approvedAt: stage.approvedAt,
      signatureMode: (stage as any).signatureMode || 'DIRECT',
      delegatorProfileId: (stage as any).delegatorProfileId || null,
    });
  }

  return resolutions;
}

/**
 * Checks whether an RFQ award is eligible for locking and PO issuance.
 * Fails closed: All required stages stamped in route must be APPROVED.
 */
export function isAwardLockEligible(
  stages: RfqApprovalStage[],
  route?: ApprovalRouteEvaluation | null
): AwardLockEligibilityResult {
  if (!stages || stages.length === 0) {
    return {
      eligible: true,
      isLocked: false,
      allRequiredTiersApproved: true,
      requiredTierLevels: [],
      completedTierLevels: [],
      pendingTierLevels: [],
      reason: 'No approval stages required.',
    };
  }

  const requiredTiers = route ? route.requiredTierLevels : stages.map((s) => s.tierLevel);
  const completedTiers: ApprovalTierLevel[] = [];
  const pendingTiers: ApprovalTierLevel[] = [];

  for (const tier of requiredTiers) {
    const stage = stages.find((s) => s.tierLevel === tier);
    if (stage && stage.status === 'APPROVED') {
      completedTiers.push(tier);
    } else {
      pendingTiers.push(tier);
    }
  }

  const allApproved = pendingTiers.length === 0;

  let reason = '';
  if (allApproved) {
    reason = `All ${completedTiers.length} required approval tier(s) are satisfied. Award lock is ELIGIBLE.`;
  } else {
    reason = `Award lock is LOCKED. Pending required tier(s): ${pendingTiers.join(', ')}.`;
  }

  return {
    eligible: allApproved,
    isLocked: !allApproved,
    allRequiredTiersApproved: allApproved,
    requiredTierLevels: requiredTiers,
    completedTierLevels: completedTiers,
    pendingTierLevels: pendingTiers,
    reason,
  };
}

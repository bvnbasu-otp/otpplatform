/**
 * OTP Phase C8.3: Dynamic Spend Approval Matrix & Threshold Routing Engine
 *
 * Implements policy-driven routing evaluation, policy validation (overlaps, gaps, contradictory rules),
 * immutable snapshot generation, anti-self-approval, and delegation spend cap checks.
 */

import {
  type ApprovalTierLevel,
  type ApprovalTierPolicyConfig,
  type OrganizationApprovalPolicy,
  type RfqApprovalStage,
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
} from './approval-matrix';
import {
  type OrganizationDelegation,
  type DelegationPermission,
  isDelegationActiveForAction,
  checkSegregationOfDuties,
} from './buyer-governance';

export interface ProcurementEvaluationContext {
  rfqId: string;
  organizationId: string;
  estimatedOrAwardedAmount: number;
  creatorProfileId: string;
  actorProfileId?: string | null;
  actorRole?: string | null;
  itemCategory?: string | null;
  currency?: string;
}

export interface ApprovalRouteEvaluation {
  requiredApprovalLevel: ApprovalTierLevel;
  requiredTierLevels: ApprovalTierLevel[];
  requiredApprovers: number;
  votingRequired: boolean;
  quorumRequired: boolean;
  delegationAllowed: boolean;
  executiveGate: boolean;
  policyVersion: number;
  evaluationReason: string;
  applicableTiers: ApprovalTierPolicyConfig[];
  policySnapshot: OrganizationApprovalPolicy;
  evaluatedAt: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates an organization approval policy for consistency, gap-freedom, overlap-freedom,
 * and valid role configurations.
 */
export function validateApprovalPolicy(policy: OrganizationApprovalPolicy): PolicyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!policy.organizationId) {
    errors.push('Organization ID is required.');
  }

  if (!policy.tiers || policy.tiers.length === 0) {
    errors.push('At least one approval tier must be defined.');
    return { valid: false, errors, warnings };
  }

  // Sort tiers by minAmount ascending
  const sortedTiers = [...policy.tiers].sort((a, b) => a.minAmount - b.minAmount);

  // 1. Check lowest tier starts at 0
  if (sortedTiers[0]?.minAmount !== 0) {
    errors.push(`First tier must start at 0 INR, but starts at ₹${sortedTiers[0]?.minAmount}.`);
  }

  // 2. Check for contiguous ranges (no gaps, no overlaps)
  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i]!;
    
    if (tier.minAmount < 0) {
      errors.push(`Tier ${tier.tierLevel} (${tier.tierName}) has negative minAmount: ${tier.minAmount}.`);
    }

    if (tier.maxAmount !== null && tier.maxAmount <= tier.minAmount) {
      errors.push(
        `Tier ${tier.tierLevel} (${tier.tierName}) maxAmount (₹${tier.maxAmount}) must be strictly greater than minAmount (₹${tier.minAmount}).`
      );
    }

    if (!tier.requiredApproverRoles || tier.requiredApproverRoles.length === 0) {
      errors.push(`Tier ${tier.tierLevel} (${tier.tierName}) has no authorized approver roles.`);
    }

    if (tier.minApproversRequired < 1) {
      errors.push(`Tier ${tier.tierLevel} (${tier.tierName}) minApproversRequired must be at least 1.`);
    }

    if (i < sortedTiers.length - 1) {
      const nextTier = sortedTiers[i + 1]!;
      if (tier.maxAmount === null) {
        errors.push(
          `Tier ${tier.tierLevel} has an unbounded maxAmount but is followed by tier ${nextTier.tierLevel}. Only the last tier can be unbounded.`
        );
      } else if (tier.maxAmount !== nextTier.minAmount) {
        if (tier.maxAmount < nextTier.minAmount) {
          errors.push(
            `Policy gap detected: Range ₹${tier.maxAmount} to ₹${nextTier.minAmount} is unhandled between ${tier.tierLevel} and ${nextTier.tierLevel}.`
          );
        } else {
          errors.push(
            `Policy overlap detected: Range between ₹${nextTier.minAmount} and ₹${tier.maxAmount} overlaps between ${tier.tierLevel} and ${nextTier.tierLevel}.`
          );
        }
      }
    }
  }

  // 3. Executive tier sanity: Last tier unbounded or high limit
  const lastTier = sortedTiers[sortedTiers.length - 1]!;
  if (lastTier.maxAmount !== null) {
    warnings.push(`Highest tier (${lastTier.tierLevel}) has an upper bound of ₹${lastTier.maxAmount}. Values above this will fall outside policy.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Pure evaluation function for dynamic spend approval routing.
 * Evaluates procurement monetary value against active organizational policy
 * and computes exact approval route, tier progression, executive gate, and justification.
 */
export function evaluateApprovalRoute(
  procurement: ProcurementEvaluationContext,
  policy?: OrganizationApprovalPolicy | null,
  currentTime = new Date()
): ApprovalRouteEvaluation {
  const amount = procurement.estimatedOrAwardedAmount;
  if (amount < 0) {
    throw new Error('Procurement amount cannot be negative.');
  }

  const effectivePolicy: OrganizationApprovalPolicy = policy && policy.isActive
    ? policy
    : {
        id: 'default-system-policy',
        organizationId: procurement.organizationId,
        policyName: 'Standard Enterprise Matrix',
        isActive: true,
        tiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
        preventSelfApproval: true,
        requireDualSignoffAboveAmount: 5000000,
        version: 1,
        createdAt: currentTime.toISOString(),
        updatedAt: currentTime.toISOString(),
      };

  const validation = validateApprovalPolicy(effectivePolicy);
  if (!validation.valid) {
    throw new Error(`Invalid approval policy: ${validation.errors.join('; ')}`);
  }

  // Find all tiers matching from 0 up to amount
  const applicableTiers: ApprovalTierPolicyConfig[] = [];
  const sortedTiers = [...effectivePolicy.tiers].sort((a, b) => a.minAmount - b.minAmount);

  for (const tier of sortedTiers) {
    if (amount >= tier.minAmount) {
      applicableTiers.push(tier);
      if (tier.maxAmount !== null && amount <= tier.maxAmount) {
        break;
      }
    }
  }

  if (applicableTiers.length === 0 && sortedTiers.length > 0) {
    applicableTiers.push(sortedTiers[0]!);
  }

  const highestTier = applicableTiers[applicableTiers.length - 1]!;
  const requiredApprovalLevel = highestTier.tierLevel;
  const requiredTierLevels = applicableTiers.map((t) => t.tierLevel);

  // Executive Gate is triggered for Tier 3 (>₹25L) or whenever dual signoff is required
  const isExecutiveGate =
    requiredApprovalLevel === 'TIER_3_EXECUTIVE' ||
    (effectivePolicy.requireDualSignoffAboveAmount != null &&
      amount >= effectivePolicy.requireDualSignoffAboveAmount);

  // Delegation Allowed: Tier 1 and Tier 2 allow proxy delegation; Tier 3 executive gate restricts delegation
  const delegationAllowed = requiredApprovalLevel !== 'TIER_3_EXECUTIVE';

  // Voting / Quorum Required: Standard OTP governance requires committee merit scoring/voting for multi-quote RFQs
  const votingRequired = true;
  const quorumRequired = true;

  // Approvers required: Sum of min approvers or 2 if dual signoff triggered
  let requiredApprovers = highestTier.minApproversRequired;
  if (
    effectivePolicy.requireDualSignoffAboveAmount != null &&
    amount >= effectivePolicy.requireDualSignoffAboveAmount
  ) {
    requiredApprovers = Math.max(requiredApprovers, 2);
  }

  // Format currency for explanation
  const formattedAmount = `₹${amount.toLocaleString('en-IN')}`;
  let evaluationReason = `Procurement amount ${formattedAmount} routes to ${highestTier.tierName} (${requiredApprovalLevel}).`;
  if (applicableTiers.length > 1) {
    evaluationReason += ` Requires sequential progression through ${applicableTiers.length} tiers: ${applicableTiers.map((t) => t.tierLevel).join(' → ')}.`;
  }
  if (isExecutiveGate) {
    evaluationReason += ' Executive director sign-off required (Tier 3 Gate).';
  }

  return {
    requiredApprovalLevel,
    requiredTierLevels,
    requiredApprovers,
    votingRequired,
    quorumRequired,
    delegationAllowed,
    executiveGate: isExecutiveGate,
    policyVersion: effectivePolicy.version,
    evaluationReason,
    applicableTiers,
    policySnapshot: effectivePolicy,
    evaluatedAt: currentTime.toISOString(),
  };
}

/**
 * Validates whether an actor (or active delegation proxy) is authorized to approve a given tier stage,
 * checking role, segregation of duties, delegation spend caps, and sequential sign-off.
 */
export function checkThresholdApprovalAuthorization(params: {
  route: ApprovalRouteEvaluation;
  stageOrder: number;
  stageTierLevel: ApprovalTierLevel;
  actorProfileId: string;
  actorBaseRole: string;
  rfqCreatorProfileId: string;
  completedStages: RfqApprovalStage[];
  activeDelegations?: OrganizationDelegation[];
  currentTime?: Date;
}): { authorized: boolean; reason?: string; isDelegated?: boolean; delegationId?: string } {
  const {
    route,
    stageOrder,
    stageTierLevel,
    actorProfileId,
    actorBaseRole,
    rfqCreatorProfileId,
    completedStages,
    activeDelegations = [],
    currentTime = new Date(),
  } = params;

  // 1. Anti-Self-Approval Check
  const sodCheck = checkSegregationOfDuties({
    action: 'APPROVE',
    actorProfileId,
    rfqCreatorProfileId,
  });
  if (!sodCheck.allowed && route.policySnapshot.preventSelfApproval) {
    return {
      authorized: false,
      reason: sodCheck.violation || 'Anti-self-approval violation: Requester cannot approve their own RFQ.',
    };
  }

  // 2. Sequential Order Invariant
  const pendingPriorStage = completedStages.find(
    (s) => s.stageOrder < stageOrder && s.status !== 'APPROVED'
  );
  if (pendingPriorStage) {
    return {
      authorized: false,
      reason: `Sequential governance violation: Prior stage ${pendingPriorStage.stageOrder} (${pendingPriorStage.tierLevel}) is still pending.`,
    };
  }

  // 3. Find target tier policy
  const tierConfig = route.applicableTiers.find((t) => t.tierLevel === stageTierLevel);
  if (!tierConfig) {
    return {
      authorized: false,
      reason: `Tier level ${stageTierLevel} is not in the applicable route tiers.`,
    };
  }

  // 4. Check base role authorization
  const hasBaseRole = tierConfig.requiredApproverRoles.includes(actorBaseRole);
  if (hasBaseRole) {
    return { authorized: true };
  }

  // 5. If base role doesn't match, check active delegation proxy
  const matchingPermission: DelegationPermission =
    stageTierLevel === 'TIER_1_MANAGER'
      ? 'APPROVE_TIER_1'
      : stageTierLevel === 'TIER_2_DEPT_HEAD'
      ? 'APPROVE_TIER_2'
      : 'APPROVE_TIER_3';

  // Tier 3 cannot be delegated unless route specifically allows it
  if (stageTierLevel === 'TIER_3_EXECUTIVE' && !route.delegationAllowed) {
    return {
      authorized: false,
      reason: 'Tier 3 Executive Gate cannot be executed via delegation proxy.',
    };
  }

  for (const del of activeDelegations) {
    if (del.delegateeId === actorProfileId && del.organizationId === route.policySnapshot.organizationId) {
      const activeCheck = isDelegationActiveForAction({
        delegation: del,
        permission: matchingPermission,
        amount: completedStages[0]?.procurementAmount,
        currentTime,
      });

      if (activeCheck.active) {
        return {
          authorized: true,
          isDelegated: true,
          delegationId: del.id,
        };
      }
    }
  }

  return {
    authorized: false,
    reason: `Actor role ${actorBaseRole} does not satisfy required roles [${tierConfig.requiredApproverRoles.join(', ')}] for ${stageTierLevel}, and no valid delegation proxy exists.`,
  };
}

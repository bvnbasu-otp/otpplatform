/**
 * OTP Phase 6.6: Multi-Tier Threshold Governance & Enterprise Approval Matrix Domain Model
 *
 * Implements configurable organizational procurement approval tiers based on estimated/awarded
 * procurement monetary value, strict sequential sign-off chains, anti-bypass invariants,
 * self-approval prevention, dual-signoff tracking, and immutable audit logging.
 *
 * Baseline Tier Defaults:
 *   Tier 1: Team Manager (< ₹5,00,000)
 *   Tier 2: Dept Head / VP (₹5,00,000 - ₹25,00,000)
 *   Tier 3: CFO / Executive Director (> ₹25,00,000)
 */

export type ApprovalTierLevel = 'TIER_1_MANAGER' | 'TIER_2_DEPT_HEAD' | 'TIER_3_EXECUTIVE';

export const APPROVAL_TIER_LEVELS: readonly ApprovalTierLevel[] = [
  'TIER_1_MANAGER',
  'TIER_2_DEPT_HEAD',
  'TIER_3_EXECUTIVE',
] as const;

export type TierApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED_SUPERSEDED';

export interface ApprovalTierPolicyConfig {
  tierLevel: ApprovalTierLevel;
  tierName: string;
  minAmount: number; // Inclusive lower bound in INR
  maxAmount: number | null; // Null means no upper bound
  requiredApproverRoles: string[]; // e.g. ['MANAGER', 'HEAD_OF_DEPARTMENT', 'DIRECTOR', 'FINANCE_LEAD', 'OWNER']
  minApproversRequired: number; // default: 1 (or 2 for dual signoff)
  autoApproveBelow?: number | null;
}

export interface OrganizationApprovalPolicy {
  id: string;
  organizationId: string;
  policyName: string;
  isActive: boolean;
  tiers: ApprovalTierPolicyConfig[];
  preventSelfApproval: boolean; // anti-bypass: requester/creator cannot approve own RFQ
  requireDualSignoffAboveAmount?: number | null; // e.g. ₹50,00,000 requires 2 signoffs
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RfqApprovalStage {
  id: string;
  rfqId: string;
  organizationId: string;
  tierLevel: ApprovalTierLevel;
  stageOrder: number; // 1, 2, 3
  status: TierApprovalStatus;
  thresholdMinAmount: number;
  thresholdMaxAmount: number | null;
  procurementAmount: number;
  approverProfileId?: string | null;
  approverRole?: string | null;
  approverComments?: string | null;
  digitalSignatureHash?: string | null;
  delegationId?: string | null;
  delegatorProfileId?: string | null;
  signatureMode?: 'DIRECT' | 'DELEGATED' | null;
  notes?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_ENTERPRISE_APPROVAL_TIERS: ReadonlyArray<ApprovalTierPolicyConfig> = Object.freeze([
    {
      tierLevel: 'TIER_1_MANAGER',
      tierName: 'Tier 1: Team / Procurement Manager',
      minAmount: 0,
      maxAmount: 500000, // < ₹5L
      requiredApproverRoles: ['BUYER', 'MANAGER', 'APPROVER', 'COMMITTEE_MEMBER', 'PROPERTY_OWNER', 'OWNER', 'FINANCE_LEAD'],
      minApproversRequired: 1,
    },
    {
      tierLevel: 'TIER_2_DEPT_HEAD',
      tierName: 'Tier 2: Department Head / VP',
      minAmount: 500000, // ₹5L - ₹25L
      maxAmount: 2500000,
      requiredApproverRoles: ['HEAD_OF_DEPARTMENT', 'VP', 'APPROVER', 'PROPERTY_OWNER', 'OWNER', 'FINANCE_LEAD'],
      minApproversRequired: 1,
    },
    {
      tierLevel: 'TIER_3_EXECUTIVE',
      tierName: 'Tier 3: CFO / Executive Director',
      minAmount: 2500000, // > ₹25L
      maxAmount: null,
      requiredApproverRoles: ['CFO', 'DIRECTOR', 'EXECUTIVE', 'OWNER'],
      minApproversRequired: 1,
    },
]);

/**
 * Resolves which approval tiers are required for a given procurement monetary amount.
 * Returns required tiers in sequential order.
 */
export function resolveRequiredApprovalTiers(
  amount: number,
  tiers: ApprovalTierPolicyConfig[] = [...DEFAULT_ENTERPRISE_APPROVAL_TIERS]
): ApprovalTierPolicyConfig[] {
  if (amount < 0) {
    throw new Error('Procurement amount cannot be negative');
  }

  // Find all tiers whose ranges apply up to this amount sequentially
  // In an enterprise tiered matrix, if an amount reaches Tier 3 (>₹25L),
  // it either requires all progressive tiers or the highest applicable tier.
  // Standard OTP governance requires the highest matching tier, or progressive chain.
  const applicableTiers: ApprovalTierPolicyConfig[] = [];

  for (const tier of tiers) {
    if (amount >= tier.minAmount) {
      applicableTiers.push(tier);
      if (tier.maxAmount !== null && amount <= tier.maxAmount) {
        break;
      }
    }
  }

  if (applicableTiers.length === 0 && tiers.length > 0 && tiers[0]) {
    applicableTiers.push(tiers[0]);
  }

  return applicableTiers;
}

/**
 * Validates whether an actor can approve a specific stage.
 * Enforces anti-bypass:
 *  1. Self-approval prevention (creator/requester cannot approve own RFQ if policy forbids).
 *  2. Role authorization match.
 *  3. Sequential stage order enforcement (previous stage must be APPROVED).
 */
export function validateApprovalEligibility(params: {
  policy: OrganizationApprovalPolicy;
  stage: RfqApprovalStage;
  previousStages: RfqApprovalStage[];
  actorProfileId: string;
  actorRoles: string[];
  rfqCreatorProfileId: string;
}): { eligible: boolean; reason?: string } {
  const { policy, stage, previousStages, actorProfileId, actorRoles, rfqCreatorProfileId } = params;

  // 1. Anti-bypass: Self-approval check
  if (policy.preventSelfApproval && actorProfileId === rfqCreatorProfileId) {
    return {
      eligible: false,
      reason: 'Anti-bypass policy violation: Procurement creator cannot approve their own RFQ.',
    };
  }

  // 2. Sequential order invariant: All prior stages must be APPROVED
  const priorIncomplete = previousStages.find(
    (s) => s.stageOrder < stage.stageOrder && s.status !== 'APPROVED'
  );
  if (priorIncomplete) {
    return {
      eligible: false,
      reason: `Sequential governance violation: Tier stage ${priorIncomplete.stageOrder} (${priorIncomplete.tierLevel}) is not yet approved.`,
    };
  }

  // 3. Status invariant: Stage must currently be PENDING
  if (stage.status !== 'PENDING') {
    return {
      eligible: false,
      reason: `Stage ${stage.stageOrder} is already in state ${stage.status}.`,
    };
  }

  // 4. Role match
  const tierConfig = policy.tiers.find((t) => t.tierLevel === stage.tierLevel);
  if (!tierConfig) {
    return {
      eligible: false,
      reason: `Tier policy configuration not found for level ${stage.tierLevel}.`,
    };
  }

  const hasAuthorizedRole = actorRoles.some((role) =>
    tierConfig.requiredApproverRoles.includes(role)
  );

  if (!hasAuthorizedRole) {
    return {
      eligible: false,
      reason: `Unauthorized: User roles [${actorRoles.join(', ')}] do not satisfy required roles [${tierConfig.requiredApproverRoles.join(', ')}] for ${stage.tierLevel}.`,
    };
  }

  return { eligible: true };
}

/**
 * Checks if the entire multi-tier approval workflow for an RFQ is fully approved.
 */
export function isRfqFullyApproved(stages: RfqApprovalStage[]): boolean {
  if (stages.length === 0) return false;
  return stages.every((s) => s.status === 'APPROVED');
}

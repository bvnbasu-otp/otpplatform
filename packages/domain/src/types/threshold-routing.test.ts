import { describe, expect, it } from 'vitest';
import {
  validateApprovalPolicy,
  evaluateApprovalRoute,
  checkThresholdApprovalAuthorization,
  type ProcurementEvaluationContext,
} from './threshold-routing';
import {
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
  type OrganizationApprovalPolicy,
  type RfqApprovalStage,
} from './approval-matrix';
import { type OrganizationDelegation } from './buyer-governance';

describe('OTP Phase C8.3: Dynamic Spend Approval Matrix & Threshold Routing Engine', () => {
  const basePolicy: OrganizationApprovalPolicy = {
    id: 'pol-c83-001',
    organizationId: 'org-enterprise-alpha',
    policyName: 'Alpha Matrix 2026',
    isActive: true,
    tiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
    preventSelfApproval: true,
    requireDualSignoffAboveAmount: 5000000,
    version: 3,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
  };

  describe('Policy Validation (Overlaps, Gaps, Bounds)', () => {
    it('validates a correct contiguous standard policy', () => {
      const res = validateApprovalPolicy(basePolicy);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('flags an error when policy does not start at 0 INR', () => {
      const invalidPolicy: OrganizationApprovalPolicy = {
        ...basePolicy,
        tiers: [
          {
            tierLevel: 'TIER_1_MANAGER',
            tierName: 'Tier 1',
            minAmount: 100000, // Starts at 1L instead of 0
            maxAmount: 500000,
            requiredApproverRoles: ['MANAGER'],
            minApproversRequired: 1,
          },
        ],
      };
      const res = validateApprovalPolicy(invalidPolicy);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('First tier must start at 0 INR');
    });

    it('detects policy range gaps between tiers', () => {
      const gappedPolicy: OrganizationApprovalPolicy = {
        ...basePolicy,
        tiers: [
          {
            tierLevel: 'TIER_1_MANAGER',
            tierName: 'Tier 1',
            minAmount: 0,
            maxAmount: 500000,
            requiredApproverRoles: ['MANAGER'],
            minApproversRequired: 1,
          },
          {
            tierLevel: 'TIER_2_DEPT_HEAD',
            tierName: 'Tier 2',
            minAmount: 600000, // GAP from 500k to 600k
            maxAmount: 2500000,
            requiredApproverRoles: ['VP'],
            minApproversRequired: 1,
          },
        ],
      };
      const res = validateApprovalPolicy(gappedPolicy);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('Policy gap detected'))).toBe(true);
    });

    it('detects policy range overlaps between tiers', () => {
      const overlappingPolicy: OrganizationApprovalPolicy = {
        ...basePolicy,
        tiers: [
          {
            tierLevel: 'TIER_1_MANAGER',
            tierName: 'Tier 1',
            minAmount: 0,
            maxAmount: 800000, // Overlaps with Tier 2
            requiredApproverRoles: ['MANAGER'],
            minApproversRequired: 1,
          },
          {
            tierLevel: 'TIER_2_DEPT_HEAD',
            tierName: 'Tier 2',
            minAmount: 500000,
            maxAmount: 2500000,
            requiredApproverRoles: ['VP'],
            minApproversRequired: 1,
          },
        ],
      };
      const res = validateApprovalPolicy(overlappingPolicy);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('Policy overlap detected'))).toBe(true);
    });
  });

  describe('Dynamic Threshold Routing Evaluation', () => {
    it('routes low-value procurement (< ₹5L) to Tier 1 Manager without executive gate', () => {
      const ctx: ProcurementEvaluationContext = {
        rfqId: 'rfq-c83-01',
        organizationId: 'org-enterprise-alpha',
        estimatedOrAwardedAmount: 350000,
        creatorProfileId: 'usr-buyer-01',
      };

      const route = evaluateApprovalRoute(ctx, basePolicy);
      expect(route.requiredApprovalLevel).toBe('TIER_1_MANAGER');
      expect(route.requiredTierLevels).toEqual(['TIER_1_MANAGER']);
      expect(route.executiveGate).toBe(false);
      expect(route.delegationAllowed).toBe(true);
      expect(route.policyVersion).toBe(3);
      expect(route.evaluationReason).toContain('Tier 1: Team / Procurement Manager');
    });

    it('routes mid-value procurement (₹5L - ₹25L) sequentially through Tier 1 and Tier 2', () => {
      const ctx: ProcurementEvaluationContext = {
        rfqId: 'rfq-c83-02',
        organizationId: 'org-enterprise-alpha',
        estimatedOrAwardedAmount: 1800000,
        creatorProfileId: 'usr-buyer-01',
      };

      const route = evaluateApprovalRoute(ctx, basePolicy);
      expect(route.requiredApprovalLevel).toBe('TIER_2_DEPT_HEAD');
      expect(route.requiredTierLevels).toEqual(['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']);
      expect(route.executiveGate).toBe(false);
      expect(route.delegationAllowed).toBe(true);
      expect(route.applicableTiers).toHaveLength(2);
    });

    it('routes high-value procurement (> ₹25L) to Tier 3 CFO with Executive Gate locked and non-delegable', () => {
      const ctx: ProcurementEvaluationContext = {
        rfqId: 'rfq-c83-03',
        organizationId: 'org-enterprise-alpha',
        estimatedOrAwardedAmount: 6500000, // ₹65 Lakhs
        creatorProfileId: 'usr-buyer-01',
      };

      const route = evaluateApprovalRoute(ctx, basePolicy);
      expect(route.requiredApprovalLevel).toBe('TIER_3_EXECUTIVE');
      expect(route.requiredTierLevels).toEqual(['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE']);
      expect(route.executiveGate).toBe(true);
      expect(route.delegationAllowed).toBe(false);
      expect(route.requiredApprovers).toBe(2); // Dual signoff triggered for > ₹50L
      expect(route.evaluationReason).toContain('Executive director sign-off required (Tier 3 Gate)');
    });
  });

  describe('Authorization Checks, Delegation Proxies & Red Team Defenses', () => {
    const procurementCtx: ProcurementEvaluationContext = {
      rfqId: 'rfq-c83-10',
      organizationId: 'org-enterprise-alpha',
      estimatedOrAwardedAmount: 1200000,
      creatorProfileId: 'usr-requester-id',
    };
    const route = evaluateApprovalRoute(procurementCtx, basePolicy);

    const completedStage1: RfqApprovalStage = {
      id: 'stg-1',
      rfqId: 'rfq-c83-10',
      organizationId: 'org-enterprise-alpha',
      tierLevel: 'TIER_1_MANAGER',
      stageOrder: 1,
      status: 'APPROVED',
      thresholdMinAmount: 0,
      thresholdMaxAmount: 500000,
      procurementAmount: 1200000,
      createdAt: '2026-09-20T00:00:00Z',
      updatedAt: '2026-09-20T00:00:00Z',
    };

    it('blocks self-approval when creator attempts to approve stage 1', () => {
      const res = checkThresholdApprovalAuthorization({
        route,
        stageOrder: 1,
        stageTierLevel: 'TIER_1_MANAGER',
        actorProfileId: 'usr-requester-id', // Same as creator
        actorBaseRole: 'MANAGER',
        rfqCreatorProfileId: 'usr-requester-id',
        completedStages: [],
      });
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('Segregation of Duties Violation');
    });

    it('blocks stage 2 approval when prior stage 1 is pending (sequential invariant)', () => {
      const pendingStage1: RfqApprovalStage = {
        ...completedStage1,
        status: 'PENDING',
      };
      const res = checkThresholdApprovalAuthorization({
        route,
        stageOrder: 2,
        stageTierLevel: 'TIER_2_DEPT_HEAD',
        actorProfileId: 'usr-vp-id',
        actorBaseRole: 'VP',
        rfqCreatorProfileId: 'usr-requester-id',
        completedStages: [pendingStage1],
      });
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('Sequential governance violation');
    });

    it('allows delegated approval via active proxy with valid spend cap', () => {
      const delegation: OrganizationDelegation = {
        id: 'del-c83-01',
        organizationId: 'org-enterprise-alpha',
        delegatorId: 'usr-vp-id',
        delegateeId: 'usr-senior-buyer-id',
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 2000000, // ₹20 Lakhs cap covers ₹12L
        startsAt: '2026-09-20T00:00:00Z',
        expiresAt: '2026-10-04T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-20T00:00:00Z',
      };

      const res = checkThresholdApprovalAuthorization({
        route,
        stageOrder: 2,
        stageTierLevel: 'TIER_2_DEPT_HEAD',
        actorProfileId: 'usr-senior-buyer-id',
        actorBaseRole: 'BUYER', // Base role lacks TIER_2, but has delegation
        rfqCreatorProfileId: 'usr-requester-id',
        completedStages: [completedStage1],
        activeDelegations: [delegation],
      });

      expect(res.authorized).toBe(true);
      expect(res.isDelegated).toBe(true);
      expect(res.delegationId).toBe('del-c83-01');
    });

    it('blocks delegated approval when procurement amount exceeds proxy spend cap', () => {
      const delegation: OrganizationDelegation = {
        id: 'del-c83-02',
        organizationId: 'org-enterprise-alpha',
        delegatorId: 'usr-vp-id',
        delegateeId: 'usr-senior-buyer-id',
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 1000000, // ₹10 Lakhs cap < ₹12L procurement
        startsAt: '2026-09-20T00:00:00Z',
        expiresAt: '2026-10-04T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-20T00:00:00Z',
      };

      const res = checkThresholdApprovalAuthorization({
        route,
        stageOrder: 2,
        stageTierLevel: 'TIER_2_DEPT_HEAD',
        actorProfileId: 'usr-senior-buyer-id',
        actorBaseRole: 'BUYER',
        rfqCreatorProfileId: 'usr-requester-id',
        completedStages: [completedStage1],
        activeDelegations: [delegation],
      });

      expect(res.authorized).toBe(false);
      expect(res.reason).toContain('does not satisfy required roles');
    });
  });
});

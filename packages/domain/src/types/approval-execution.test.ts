import { describe, it, expect } from 'vitest';
import {
  validateApprovalExecution,
  resolveApprovalStageStates,
  isAwardLockEligible,
  getRequiredDelegationPermissionForTier,
  type ApprovalExecutionRequest,
} from './approval-execution';
import {
  type RfqApprovalStage,
  type OrganizationApprovalPolicy,
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
} from './approval-matrix';
import {
  type OrganizationDelegation,
} from './buyer-governance';
import {
  type ApprovalRouteEvaluation,
} from './threshold-routing';

describe('OTP Phase C8.4: Approval Execution Domain Model & Invariants', () => {
  const orgId = 'org-corp-100';
  const rfqId = 'rfq-200';
  const creatorId = 'user-creator-01';
  const managerId = 'user-manager-02';
  const deptHeadId = 'user-vp-03';
  const executiveId = 'user-cfo-04';
  const buyerId = 'user-buyer-05';
  const unauthorizedId = 'user-stranger-99';

  const now = new Date('2026-09-21T10:00:00Z');

  const defaultPolicy: OrganizationApprovalPolicy = {
    id: 'policy-01',
    organizationId: orgId,
    policyName: 'Standard Matrix',
    isActive: true,
    tiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
    preventSelfApproval: true,
    requireDualSignoffAboveAmount: 5000000,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const sampleRoute: ApprovalRouteEvaluation = {
    requiredApprovalLevel: 'TIER_3_EXECUTIVE',
    requiredTierLevels: ['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE'],
    requiredApprovers: 1,
    votingRequired: true,
    quorumRequired: true,
    delegationAllowed: false, // Tier 3 executive gate
    executiveGate: true,
    policyVersion: 1,
    evaluationReason: 'Procurement > ₹25L routes to Tier 3 Executive Gate.',
    applicableTiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
    policySnapshot: defaultPolicy,
    evaluatedAt: now.toISOString(),
  };

  const tier1Stage: RfqApprovalStage = {
    id: 'stage-1',
    rfqId,
    organizationId: orgId,
    tierLevel: 'TIER_1_MANAGER',
    stageOrder: 1,
    status: 'PENDING',
    thresholdMinAmount: 0,
    thresholdMaxAmount: 500000,
    procurementAmount: 3000000,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const tier2Stage: RfqApprovalStage = {
    id: 'stage-2',
    rfqId,
    organizationId: orgId,
    tierLevel: 'TIER_2_DEPT_HEAD',
    stageOrder: 2,
    status: 'PENDING',
    thresholdMinAmount: 500000,
    thresholdMaxAmount: 2500000,
    procurementAmount: 3000000,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const tier3Stage: RfqApprovalStage = {
    id: 'stage-3',
    rfqId,
    organizationId: orgId,
    tierLevel: 'TIER_3_EXECUTIVE',
    stageOrder: 3,
    status: 'PENDING',
    thresholdMinAmount: 2500000,
    thresholdMaxAmount: null,
    procurementAmount: 3000000,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  describe('Direct Approval Sign-Off Validation', () => {
    it('allows direct approval by authorized manager for Tier 1', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_1_MANAGER',
        stageOrder: 1,
        actorProfileId: managerId,
        actorRole: 'MANAGER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier1Stage,
        previousStages: [],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(true);
      expect(result.signatureMode).toBe('DIRECT');
      expect(result.delegationId).toBeNull();
    });

    it('rejects direct approval if actor role is not authorized', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId,
        actorRole: 'BUYER', // BUYER is only Tier 1, not Tier 2
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('UNAUTHORIZED');
    });

    it('DENIES direct approval if actor is RFQ creator (Anti-Self-Approval)', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_1_MANAGER',
        stageOrder: 1,
        actorProfileId: creatorId, // Creator trying to approve own RFQ
        actorRole: 'MANAGER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier1Stage,
        previousStages: [],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('SELF_APPROVAL_DENIED');
      expect(result.error).toContain('Anti-bypass policy violation');
    });

    it('DENIES approval if previous stage is still pending (Sequential Progression)', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: deptHeadId,
        actorRole: 'VP',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      // Previous stage 1 is PENDING, not APPROVED
      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [tier1Stage],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('PREVIOUS_TIER_PENDING');
      expect(result.error).toContain('Sequential governance violation');
    });

    it('DENIES approval if stage is already APPROVED (No Replay)', () => {
      const approvedStage: RfqApprovalStage = {
        ...tier1Stage,
        status: 'APPROVED',
        approvedAt: now.toISOString(),
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_1_MANAGER',
        stageOrder: 1,
        actorProfileId: managerId,
        actorRole: 'MANAGER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      const result = validateApprovalExecution({
        request,
        stage: approvedStage,
        previousStages: [],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('ALREADY_APPROVED');
      expect(result.error).toContain('Replay rejected');
    });

    it('DENIES approval if cross-tenant organization mismatch occurs', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: 'other-org-999', // Mismatched tenant
        tierLevel: 'TIER_1_MANAGER',
        stageOrder: 1,
        actorProfileId: managerId,
        actorRole: 'MANAGER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier1Stage,
        previousStages: [],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('ORGANIZATION_MISMATCH');
    });
  });

  describe('Delegated Proxy Sign-Off Validation', () => {
    const validDelegation: OrganizationDelegation = {
      id: 'del-101',
      organizationId: orgId,
      delegatorId: deptHeadId,
      delegateeId: buyerId,
      permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
      spendCapAmount: 5000000,
      startsAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-10-01T00:00:00Z',
      isActive: true,
      createdAt: '2026-09-01T00:00:00Z',
    };

    it('allows delegated approval when active delegation proxy is valid and within spend cap', () => {
      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId, // Delegatee (Buyer) acting on behalf of VP
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000, // < 5000000 spend cap
        signatureMode: 'DELEGATED',
        delegationId: validDelegation.id,
        delegation: validDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(true);
      expect(result.signatureMode).toBe('DELEGATED');
      expect(result.delegationId).toBe(validDelegation.id);
      expect(result.delegatorProfileId).toBe(deptHeadId);
    });

    it('DENIES delegated approval if RFQ amount exceeds delegation spend cap', () => {
      const smallCapDelegation: OrganizationDelegation = {
        ...validDelegation,
        spendCapAmount: 2000000, // Spend cap ₹20L, but RFQ is ₹30L
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: smallCapDelegation.id,
        delegation: smallCapDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('SPEND_CAP_EXCEEDED');
      expect(result.error).toContain('exceeds spend cap limit');
    });

    it('DENIES delegated approval if delegation has expired', () => {
      const expiredDelegation: OrganizationDelegation = {
        ...validDelegation,
        expiresAt: '2026-09-15T00:00:00Z', // Expired 6 days ago relative to now
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: expiredDelegation.id,
        delegation: expiredDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('DELEGATION_EXPIRED');
    });

    it('DENIES delegated approval if delegation start time is in the future', () => {
      const futureDelegation: OrganizationDelegation = {
        ...validDelegation,
        startsAt: '2026-10-01T00:00:00Z', // Starts next month
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: futureDelegation.id,
        delegation: futureDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('DELEGATION_FUTURE');
    });

    it('DENIES delegated approval if delegation proxy has been revoked', () => {
      const revokedDelegation: OrganizationDelegation = {
        ...validDelegation,
        revokedAt: '2026-09-20T00:00:00Z',
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_2_DEPT_HEAD',
        stageOrder: 2,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: revokedDelegation.id,
        delegation: revokedDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier2Stage,
        previousStages: [{ ...tier1Stage, status: 'APPROVED' }],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('DELEGATION_REVOKED');
    });

    it('DENIES delegated approval if RFQ creator is the delegator (Anti-Self-Approval via proxy)', () => {
      const creatorDelegation: OrganizationDelegation = {
        ...validDelegation,
        delegatorId: creatorId, // Creator delegated their authority to buyer
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_1_MANAGER',
        stageOrder: 1,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: creatorDelegation.id,
        delegation: creatorDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier1Stage,
        previousStages: [],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('SELF_APPROVAL_DENIED');
      expect(result.error).toContain('cannot delegate authority to approve their own RFQ');
    });

    it('DENIES delegated approval for Tier 3 Executive Gate to non-executive role', () => {
      const execDelegation: OrganizationDelegation = {
        ...validDelegation,
        delegatorId: executiveId,
        permissions: ['APPROVE_TIER_3'],
      };

      const request: ApprovalExecutionRequest = {
        rfqId,
        organizationId: orgId,
        tierLevel: 'TIER_3_EXECUTIVE',
        stageOrder: 3,
        actorProfileId: buyerId,
        actorRole: 'BUYER', // Non-executive role
        rfqCreatorProfileId: creatorId,
        procurementAmount: 3000000,
        signatureMode: 'DELEGATED',
        delegationId: execDelegation.id,
        delegation: execDelegation,
      };

      const result = validateApprovalExecution({
        request,
        stage: tier3Stage,
        previousStages: [
          { ...tier1Stage, status: 'APPROVED' },
          { ...tier2Stage, status: 'APPROVED' },
        ],
        policy: defaultPolicy,
        route: sampleRoute,
        currentTime: now,
      });

      expect(result.valid).toBe(false);
      expect(result.violationCode).toBe('EXECUTIVE_GATE_REQUIRED');
      expect(result.error).toContain('Tier 3 Executive Gate');
    });
  });

  describe('resolveApprovalStageStates & Award Lock Eligibility', () => {
    it('correctly computes stage states and permissions for manager with active delegation', () => {
      const activeDelegation: OrganizationDelegation = {
        id: 'del-200',
        organizationId: orgId,
        delegatorId: deptHeadId,
        delegateeId: buyerId,
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        spendCapAmount: 4000000,
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      const stages = [
        { ...tier1Stage, status: 'APPROVED' as const },
        { ...tier2Stage, status: 'PENDING' as const },
        { ...tier3Stage, status: 'PENDING' as const },
      ];

      const resolutions = resolveApprovalStageStates({
        route: sampleRoute,
        stages,
        actorProfileId: buyerId,
        actorRole: 'BUYER',
        rfqCreatorProfileId: creatorId,
        delegations: [activeDelegation],
        currentTime: now,
      });

      expect(resolutions).toHaveLength(3);
      // Stage 1: APPROVED
      expect(resolutions[0]?.state).toBe('APPROVED');
      // Stage 2: PENDING (Prior is approved), buyer can approve via delegation
      expect(resolutions[1]?.state).toBe('PENDING');
      expect(resolutions[1]?.canApproveDelegated).toBe(true);
      expect(resolutions[1]?.matchingDelegation?.id).toBe(activeDelegation.id);
      // Stage 3: BLOCKED (Stage 2 is pending)
      expect(resolutions[2]?.state).toBe('BLOCKED');
    });

    it('evaluates award lock eligibility: LOCKED when pending stages exist, ELIGIBLE when all approved', () => {
      const pendingStages = [
        { ...tier1Stage, status: 'APPROVED' as const },
        { ...tier2Stage, status: 'PENDING' as const },
        { ...tier3Stage, status: 'PENDING' as const },
      ];

      const lockCheckPending = isAwardLockEligible(pendingStages, sampleRoute);
      expect(lockCheckPending.eligible).toBe(false);
      expect(lockCheckPending.isLocked).toBe(true);
      expect(lockCheckPending.pendingTierLevels).toEqual(['TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE']);
      expect(lockCheckPending.reason).toContain('Award lock is LOCKED');

      const approvedStages = [
        { ...tier1Stage, status: 'APPROVED' as const },
        { ...tier2Stage, status: 'APPROVED' as const },
        { ...tier3Stage, status: 'APPROVED' as const },
      ];

      const lockCheckApproved = isAwardLockEligible(approvedStages, sampleRoute);
      expect(lockCheckApproved.eligible).toBe(true);
      expect(lockCheckApproved.isLocked).toBe(false);
      expect(lockCheckApproved.pendingTierLevels).toHaveLength(0);
      expect(lockCheckApproved.reason).toContain('Award lock is ELIGIBLE');
    });
  });

  describe('Helper functions', () => {
    it('maps tier levels to delegation permissions accurately', () => {
      expect(getRequiredDelegationPermissionForTier('TIER_1_MANAGER')).toBe('APPROVE_TIER_1');
      expect(getRequiredDelegationPermissionForTier('TIER_2_DEPT_HEAD')).toBe('APPROVE_TIER_2');
      expect(getRequiredDelegationPermissionForTier('TIER_3_EXECUTIVE')).toBe('APPROVE_TIER_3');
    });
  });
});

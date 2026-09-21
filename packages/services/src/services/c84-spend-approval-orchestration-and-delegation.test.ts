import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import type { OrganizationDelegation } from '@otp/domain';
import { ForbiddenError, NotFoundError } from '../types/errors';

const ORG_A = 'org-c84-buyer-alpha';
const ORG_B = 'org-c84-buyer-beta';

const CREATOR_ACTOR: ActorContext = {
  profileId: 'usr-creator-101',
  organizationId: ORG_A,
  orgRole: 'BUYER',
};

const MANAGER_ACTOR: ActorContext = {
  profileId: 'usr-manager-102',
  organizationId: ORG_A,
  orgRole: 'MANAGER',
};

const VP_DEPT_HEAD_ACTOR: ActorContext = {
  profileId: 'usr-vp-103',
  organizationId: ORG_A,
  orgRole: 'APPROVER',
};

const CFO_EXEC_ACTOR: ActorContext = {
  profileId: 'usr-cfo-104',
  organizationId: ORG_A,
  orgRole: 'OWNER',
};

const BUYER_DELEGATEE_ACTOR: ActorContext = {
  profileId: 'usr-delegatee-105',
  organizationId: ORG_A,
  orgRole: 'BUYER',
};

const CROSS_TENANT_ACTOR: ActorContext = {
  profileId: 'usr-stranger-999',
  organizationId: ORG_B,
  orgRole: 'MANAGER',
};

describe('OTP Phase C8.4: Multi-Tier Spend Approval Orchestration & Delegation Signoff Chain', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfqWithStages(procurementAmount: number) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: `req-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: ORG_A,
      createdBy: CREATOR_ACTOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Enterprise Server & Cloud Migration Equipment',
      budgetAmount: procurementAmount,
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: `rfq-${crypto.randomUUID().slice(0, 8)}`,
      requirementId: req.id,
      organizationId: ORG_A,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title: 'Enterprise Server & Cloud Migration Equipment',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: CREATOR_ACTOR.profileId,
      createdAt: now,
      updatedAt: now,
    });

    // Initialize approval policy and stages
    await services.enterpriseApprovalMatrix.configurePolicy(CFO_EXEC_ACTOR, {
      organizationId: ORG_A,
      policyName: 'Alpha Matrix Policy',
      preventSelfApproval: true,
      requireDualSignoffAboveAmount: 5000000,
    });

    const stages = await services.enterpriseApprovalMatrix.initializeRfqStages(
      MANAGER_ACTOR,
      rfq.id,
      procurementAmount
    );

    return { req, rfq, stages };
  }

  describe('Direct Multi-Tier Approval Progression', () => {
    it('progresses sequentially from Tier 1 (Manager) to Tier 2 (Dept Head) for ₹15 Lakhs RFQ', async () => {
      const { rfq, stages } = await seedRfqWithStages(1500000);
      expect(stages).toHaveLength(2); // Tier 1 (<5L) and Tier 2 (5L-25L)

      // Step 1: Manager approves Tier 1
      const tier1Result = await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        notes: 'Tier 1 commercial review passed.',
      });

      expect(tier1Result.success).toBe(true);
      expect(tier1Result.signatureMode).toBe('DIRECT');
      expect(tier1Result.allStagesApproved).toBe(false);

      // Step 2: VP approves Tier 2
      const tier2Result = await services.enterpriseApprovalMatrix.executeTierApproval(VP_DEPT_HEAD_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_2_DEPT_HEAD',
        notes: 'Tier 2 technical & operational sign-off complete.',
      });

      expect(tier2Result.success).toBe(true);
      expect(tier2Result.signatureMode).toBe('DIRECT');
      expect(tier2Result.allStagesApproved).toBe(true);

      // Verify overall execution status
      const status = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(status.awardLockEligibility.eligible).toBe(true);
      expect(status.awardLockEligibility.isLocked).toBe(false);
      expect(status.awardLockEligibility.pendingTierLevels).toHaveLength(0);
    });

    it('requires all 3 tiers including Tier 3 Executive Gate for ₹35 Lakhs RFQ', async () => {
      const { rfq, stages } = await seedRfqWithStages(3500000);
      expect(stages).toHaveLength(3); // Tier 1, Tier 2, Tier 3

      // Tier 1 approval
      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      // Tier 2 approval
      await services.enterpriseApprovalMatrix.executeTierApproval(VP_DEPT_HEAD_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_2_DEPT_HEAD',
      });

      // Check award lock before Tier 3: MUST BE LOCKED
      const midStatus = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(midStatus.awardLockEligibility.eligible).toBe(false);
      expect(midStatus.awardLockEligibility.pendingTierLevels).toEqual(['TIER_3_EXECUTIVE']);

      // Tier 3 Executive sign-off
      const tier3Result = await services.enterpriseApprovalMatrix.executeTierApproval(CFO_EXEC_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_3_EXECUTIVE',
        notes: 'Executive Director capital spend authorization confirmed.',
      });

      expect(tier3Result.success).toBe(true);
      expect(tier3Result.allStagesApproved).toBe(true);

      const finalStatus = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(finalStatus.awardLockEligibility.eligible).toBe(true);
    });
  });

  describe('Delegated Proxy Sign-Off Chain', () => {
    it('allows valid delegated proxy sign-off within time window and spend cap', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      // Create active delegation from VP to Buyer
      const delegation: OrganizationDelegation = {
        id: 'del-vp-to-buyer-01',
        organizationId: ORG_A,
        delegatorId: VP_DEPT_HEAD_ACTOR.profileId,
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        spendCapAmount: 2000000,
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      // Tier 1 direct approval by manager
      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      // Tier 2 approval by Buyer via delegation proxy
      const tier2DelegatedResult = await services.enterpriseApprovalMatrix.executeTierApproval(
        BUYER_DELEGATEE_ACTOR,
        {
          rfqId: rfq.id,
          tierLevel: 'TIER_2_DEPT_HEAD',
          delegationId: delegation.id,
          delegation,
          notes: 'Signed via VP delegation proxy while on leave.',
        }
      );

      expect(tier2DelegatedResult.success).toBe(true);
      expect(tier2DelegatedResult.signatureMode).toBe('DELEGATED');
      expect(tier2DelegatedResult.delegationId).toBe(delegation.id);
      expect(tier2DelegatedResult.delegatorProfileId).toBe(VP_DEPT_HEAD_ACTOR.profileId);
      expect(tier2DelegatedResult.allStagesApproved).toBe(true);
    });
  });

  describe('🟥 RED TEAM SECURITY & ADVERSARIAL ATTACKS SUITE', () => {
    it('Attack 01: RFQ creator attempts direct approval -> DENIED (Anti-Self-Approval)', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(CREATOR_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_1_MANAGER',
          notes: 'Self-approval attempt by creator',
        })
      ).rejects.toThrow(/Anti-bypass policy violation.*creator/i);
    });

    it('Attack 02: RFQ creator attempts delegated approval -> DENIED (Anti-Self-Approval via Proxy)', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      // Creator creates a delegation delegating to buyer
      const creatorDelegation: OrganizationDelegation = {
        id: 'del-creator-proxy-01',
        organizationId: ORG_A,
        delegatorId: CREATOR_ACTOR.profileId, // Creator is delegator
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_1'],
        spendCapAmount: 5000000,
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(BUYER_DELEGATEE_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_1_MANAGER',
          delegationId: creatorDelegation.id,
          delegation: creatorDelegation,
        })
      ).rejects.toThrow(/Anti-bypass policy violation.*creator.*cannot delegate/i);
    });

    it('Attack 03: Delegate exceeds spend cap -> DENIED', async () => {
      const { rfq } = await seedRfqWithStages(1800000); // ₹18 Lakhs

      const smallCapDelegation: OrganizationDelegation = {
        id: 'del-small-cap',
        organizationId: ORG_A,
        delegatorId: VP_DEPT_HEAD_ACTOR.profileId,
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 1000000, // Spend cap ₹10L, but RFQ is ₹18L
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(BUYER_DELEGATEE_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_2_DEPT_HEAD',
          delegationId: smallCapDelegation.id,
          delegation: smallCapDelegation,
        })
      ).rejects.toThrow(/Delegation spend cap exceeded/i);
    });

    it('Attack 04: Expired delegation -> DENIED', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      const expiredDelegation: OrganizationDelegation = {
        id: 'del-expired',
        organizationId: ORG_A,
        delegatorId: VP_DEPT_HEAD_ACTOR.profileId,
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 5000000,
        startsAt: '2026-08-01T00:00:00Z',
        expiresAt: '2026-09-01T00:00:00Z', // Expired relative to current date (Sep 21, 2026)
        isActive: true,
        createdAt: '2026-08-01T00:00:00Z',
      };

      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(BUYER_DELEGATEE_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_2_DEPT_HEAD',
          delegationId: expiredDelegation.id,
          delegation: expiredDelegation,
          currentTime: new Date('2026-09-21T10:00:00Z'),
        })
      ).rejects.toThrow(/Delegation proxy expired/i);
    });

    it('Attack 05: Future-start delegation -> DENIED', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      const futureDelegation: OrganizationDelegation = {
        id: 'del-future',
        organizationId: ORG_A,
        delegatorId: VP_DEPT_HEAD_ACTOR.profileId,
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 5000000,
        startsAt: '2026-10-01T00:00:00Z', // Starts next month
        expiresAt: '2026-11-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(BUYER_DELEGATEE_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_2_DEPT_HEAD',
          delegationId: futureDelegation.id,
          delegation: futureDelegation,
          currentTime: new Date('2026-09-21T10:00:00Z'),
        })
      ).rejects.toThrow(/Delegation proxy start time.*future/i);
    });

    it('Attack 06: Tier 2 before Tier 1 -> DENIED (Sequential Order Invariant)', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      // Attempt Tier 2 without Tier 1 approval
      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(VP_DEPT_HEAD_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_2_DEPT_HEAD',
          notes: 'Bypassing Tier 1 directly to VP',
        })
      ).rejects.toThrow(/Sequential governance violation.*Prior tier stage.*not yet approved/i);
    });

    it('Attack 07: Tier 3 delegated to non-executive role -> DENIED (Executive Gate)', async () => {
      const { rfq } = await seedRfqWithStages(4000000); // ₹40 Lakhs requires Tier 3

      const execDelegation: OrganizationDelegation = {
        id: 'del-exec-to-buyer',
        organizationId: ORG_A,
        delegatorId: CFO_EXEC_ACTOR.profileId,
        delegateeId: BUYER_DELEGATEE_ACTOR.profileId,
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2', 'APPROVE_TIER_3'],
        spendCapAmount: 10000000,
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      await services.enterpriseApprovalMatrix.executeTierApproval(VP_DEPT_HEAD_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_2_DEPT_HEAD',
      });

      // Buyer tries to approve Tier 3 Executive Gate via delegation
      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(BUYER_DELEGATEE_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_3_EXECUTIVE',
          delegationId: execDelegation.id,
          delegation: execDelegation,
        })
      ).rejects.toThrow(/Tier 3 Executive Gate.*cannot be delegated to non-executive/i);
    });

    it('Attack 08: Client manipulates procurement amount -> SERVER VALUE WINS', async () => {
      const { rfq } = await seedRfqWithStages(2800000); // Actual server amount ₹28L

      // Route evaluation must evaluate actual server amount ₹28L and produce 3 tiers
      const route = await services.enterpriseApprovalMatrix.evaluateApprovalRoute(MANAGER_ACTOR, {
        rfqId: rfq.id,
        procurementAmount: 2800000,
      });

      expect(route.requiredApprovalLevel).toBe('TIER_3_EXECUTIVE');
      expect(route.requiredTierLevels).toHaveLength(3);
      expect(route.executiveGate).toBe(true);
    });

    it('Attack 09: Client supplies false policy version -> Evaluated against verified policy', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      const route = await services.enterpriseApprovalMatrix.evaluateApprovalRoute(MANAGER_ACTOR, {
        rfqId: rfq.id,
        procurementAmount: 1200000,
      });

      expect(route.policyVersion).toBeGreaterThanOrEqual(1);
      expect(route.policySnapshot.organizationId).toBe(ORG_A);
    });

    it('Attack 10: Client submits cross-tenant RFQ -> DENIED', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(CROSS_TENANT_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_1_MANAGER',
        })
      ).rejects.toThrow(/does not match RFQ organization/i);
    });

    it('Attack 11: Replay same approval -> DENIED / ALREADY APPROVED', async () => {
      const { rfq } = await seedRfqWithStages(1200000);

      // First approval succeeds
      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      // Replay attempt on same stage
      await expect(
        services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
          rfqId: rfq.id,
          tierLevel: 'TIER_1_MANAGER',
        })
      ).rejects.toThrow(/Replay rejected/i);
    });

    it('Attack 12: Fail-Closed Award Lock check -> LOCKED until all tiers approved', async () => {
      const { rfq } = await seedRfqWithStages(1500000);

      // Initially 0 tiers approved
      let status = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(status.awardLockEligibility.eligible).toBe(false);
      expect(status.awardLockEligibility.isLocked).toBe(true);

      // 1 of 2 tiers approved
      await services.enterpriseApprovalMatrix.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      });

      status = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(status.awardLockEligibility.eligible).toBe(false);
      expect(status.awardLockEligibility.isLocked).toBe(true);
      expect(status.awardLockEligibility.pendingTierLevels).toEqual(['TIER_2_DEPT_HEAD']);

      // 2 of 2 tiers approved
      await services.enterpriseApprovalMatrix.executeTierApproval(VP_DEPT_HEAD_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_2_DEPT_HEAD',
      });

      status = await services.enterpriseApprovalMatrix.getApprovalExecutionStatus(MANAGER_ACTOR, rfq.id);
      expect(status.awardLockEligibility.eligible).toBe(true);
      expect(status.awardLockEligibility.isLocked).toBe(false);
      expect(status.awardLockEligibility.reason).toContain('Award lock is ELIGIBLE');
    });
  });
});

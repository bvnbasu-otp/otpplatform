import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import type { OrganizationDelegation } from '@otp/domain';
import {
  evaluateMsmeSpendDecisionState,
  evaluateMsmeStatutoryVerification,
  verifyMsmeHistoricalRoleContinuity,
  verifyMsmeWalletGmvSegregation,
  calculateSupplierPlatformFeeWithGst,
  validateApprovalExecution,
  validatePurchaseOrderCancellation,
  assertIdentityProtectedPayloadSafe,
} from '@otp/domain';
import { ForbiddenError, ValidationError } from '../../packages/services/src/types/errors';

const ORG_MSME_A = 'org-msme-alpha-001';
const ORG_MSME_B = 'org-msme-beta-002';

const PRIMARY_ACTOR: ActorContext = {
  profileId: 'usr-primary-001',
  organizationId: ORG_MSME_A,
  orgRole: 'OWNER',
};

const MANAGER_ACTOR: ActorContext = {
  profileId: 'usr-manager-002',
  organizationId: ORG_MSME_A,
  orgRole: 'MANAGER',
};

const DELEGATEE_ACTOR: ActorContext = {
  profileId: 'usr-delegatee-003',
  organizationId: ORG_MSME_A,
  orgRole: 'BUYER',
};

const CREATOR_ACTOR: ActorContext = {
  profileId: 'usr-creator-004',
  organizationId: ORG_MSME_A,
  orgRole: 'BUYER',
};

const CROSS_TENANT_ACTOR: ActorContext = {
  profileId: 'usr-stranger-999',
  organizationId: ORG_MSME_B,
  orgRole: 'OWNER',
};

describe('MSME Spend Governance Red Team Security Test Suite (20 Attack Vectors)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfq(procurementAmount: number) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: `req-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: ORG_MSME_A,
      createdBy: CREATOR_ACTOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Commercial Hydraulic Press Machinery',
      budgetAmount: procurementAmount,
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: `rfq-${crypto.randomUUID().slice(0, 8)}`,
      requirementId: req.id,
      organizationId: ORG_MSME_A,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title: 'Commercial Hydraulic Press Machinery',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: CREATOR_ACTOR.profileId,
      createdAt: now,
      updatedAt: now,
    });

    // Configure standard MSME spend policy
    await services.spendApprovalGovernance.configureMsmeSpendPolicy(PRIMARY_ACTOR, {
      organizationId: ORG_MSME_A,
      managerSpendCap: 500000,
      preventSelfApproval: true,
    });

    const stages = await services.spendApprovalGovernance.initializeRfqStages(
      PRIMARY_ACTOR,
      rfq.id,
      procurementAmount
    );

    return { req, rfq, stages };
  }

  // -------------------------------------------------------------------------
  // ATTACK 01: Cross-Tenant Approval Hijack
  // -------------------------------------------------------------------------
  it('Attack 01: Cross-Tenant actor from Org B attempts to approve Org A RFQ -> DENIED', async () => {
    const { rfq } = await seedRfq(300000);

    await expect(
      services.spendApprovalGovernance.executeTierApproval(CROSS_TENANT_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      })
    ).rejects.toThrow(ForbiddenError);
  });

  // -------------------------------------------------------------------------
  // ATTACK 02: Direct Anti-Self-Approval Bypass
  // -------------------------------------------------------------------------
  it('Attack 02: RFQ Creator attempts direct spend approval -> DENIED (Anti-Self-Approval PA-09)', async () => {
    const { rfq } = await seedRfq(200000);

    // Creator attempts to sign off own RFQ
    await expect(
      services.spendApprovalGovernance.executeTierApproval(CREATOR_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      })
    ).rejects.toThrow(/cannot sign off or approve their own RFQ/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 03: Delegated Anti-Self-Approval Bypass
  // -------------------------------------------------------------------------
  it('Attack 03: RFQ Creator gets a delegation proxy and attempts to approve own RFQ -> DENIED', async () => {
    const { rfq } = await seedRfq(200000);

    const delegation = await services.spendApprovalGovernance.createSpendDelegation(PRIMARY_ACTOR, {
      organizationId: ORG_MSME_A,
      delegateeId: CREATOR_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1'],
      spendCapAmount: 500000,
      startsAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-10-31T23:59:59Z',
    });

    await expect(
      services.spendApprovalGovernance.executeTierApproval(CREATOR_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        delegationId: delegation.id,
        delegation,
      })
    ).rejects.toThrow(/cannot sign off or approve their own RFQ/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 04: Expired Delegation Proxy Sign-off
  // -------------------------------------------------------------------------
  it('Attack 04: Delegatee attempts approval using expired delegation -> DENIED', async () => {
    const { rfq } = await seedRfq(200000);

    const expiredDelegation: OrganizationDelegation = {
      id: 'del-expired-01',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: DELEGATEE_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1'],
      spendCapAmount: 500000,
      startsAt: '2026-08-01T00:00:00Z',
      expiresAt: '2026-08-31T23:59:59Z', // Expired
      isActive: true,
      createdAt: '2026-08-01T00:00:00Z',
    };

    await expect(
      services.spendApprovalGovernance.executeTierApproval(DELEGATEE_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        delegationId: expiredDelegation.id,
        delegation: expiredDelegation,
        currentTime: new Date('2026-09-24T12:00:00Z'),
      })
    ).rejects.toThrow(/expired/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 05: Future-Dated Delegation Proxy Sign-off
  // -------------------------------------------------------------------------
  it('Attack 05: Delegatee attempts approval before delegation start time -> DENIED', async () => {
    const { rfq } = await seedRfq(200000);

    const futureDelegation: OrganizationDelegation = {
      id: 'del-future-01',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: DELEGATEE_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1'],
      spendCapAmount: 500000,
      startsAt: '2026-10-01T00:00:00Z', // Future
      expiresAt: '2026-10-31T23:59:59Z',
      isActive: true,
      createdAt: '2026-09-24T00:00:00Z',
    };

    await expect(
      services.spendApprovalGovernance.executeTierApproval(DELEGATEE_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        delegationId: futureDelegation.id,
        delegation: futureDelegation,
        currentTime: new Date('2026-09-24T12:00:00Z'),
      })
    ).rejects.toThrow(/future/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 06: Revoked Delegation Proxy Sign-off
  // -------------------------------------------------------------------------
  it('Attack 06: Delegatee attempts approval with revoked delegation -> DENIED', async () => {
    const { rfq } = await seedRfq(200000);

    const revokedDelegation: OrganizationDelegation = {
      id: 'del-revoked-01',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: DELEGATEE_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1'],
      spendCapAmount: 500000,
      startsAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-09-30T23:59:59Z',
      isActive: false,
      revokedAt: '2026-09-20T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    };

    await expect(
      services.spendApprovalGovernance.executeTierApproval(DELEGATEE_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        delegationId: revokedDelegation.id,
        delegation: revokedDelegation,
      })
    ).rejects.toThrow(/revoked|inactive/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 07: Spend Cap Exceeded
  // -------------------------------------------------------------------------
  it('Attack 07: Delegatee with ₹2 Lakhs cap attempts to approve ₹4 Lakhs transaction -> DENIED', async () => {
    const { rfq } = await seedRfq(400000);

    const delegation: OrganizationDelegation = {
      id: 'del-low-cap-01',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: DELEGATEE_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1'],
      spendCapAmount: 200000, // ₹2 Lakhs
      startsAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-09-30T23:59:59Z',
      isActive: true,
      createdAt: '2026-09-01T00:00:00Z',
    };

    await expect(
      services.spendApprovalGovernance.executeTierApproval(DELEGATEE_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
        delegationId: delegation.id,
        delegation,
      })
    ).rejects.toThrow(/exceeds spend cap/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 08: Self-Delegation Authority Elevation
  // -------------------------------------------------------------------------
  it('Attack 08: Actor attempts self-delegation to increase authority -> DENIED', async () => {
    await expect(
      services.spendApprovalGovernance.createSpendDelegation(PRIMARY_ACTOR, {
        organizationId: ORG_MSME_A,
        delegateeId: PRIMARY_ACTOR.profileId, // Self delegation
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-09-30T23:59:59Z',
      })
    ).rejects.toThrow(ValidationError);
  });

  // -------------------------------------------------------------------------
  // ATTACK 09: Unauthorized Delegation Grant
  // -------------------------------------------------------------------------
  it('Attack 09: Basic Member attempts to create spend delegation -> DENIED (ForbiddenError)', async () => {
    await expect(
      services.spendApprovalGovernance.createSpendDelegation(DELEGATEE_ACTOR, {
        organizationId: ORG_MSME_A,
        delegateeId: MANAGER_ACTOR.profileId,
        permissions: ['APPROVE_TIER_1'],
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-09-30T23:59:59Z',
      })
    ).rejects.toThrow(ForbiddenError);
  });

  // -------------------------------------------------------------------------
  // ATTACK 10: Non-Delegable Tier 3 Executive Gate Bypass
  // -------------------------------------------------------------------------
  it('Attack 10: Attempt to use delegation proxy for Non-Delegable Tier 3 Executive Gate -> DENIED', async () => {
    const { rfq } = await seedRfq(6000000); // ₹60 Lakhs -> requires Tier 3

    // First approve Tier 1 & Tier 2
    await services.spendApprovalGovernance.executeTierApproval(MANAGER_ACTOR, {
      rfqId: rfq.id,
      tierLevel: 'TIER_1_MANAGER',
    });
    await services.spendApprovalGovernance.executeTierApproval(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      tierLevel: 'TIER_2_DEPT_HEAD',
    });

    const delegation: OrganizationDelegation = {
      id: 'del-exec-01',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: DELEGATEE_ACTOR.profileId,
      permissions: ['APPROVE_TIER_3'],
      startsAt: '2026-09-01T00:00:00Z',
      expiresAt: '2026-09-30T23:59:59Z',
      isActive: true,
      createdAt: '2026-09-01T00:00:00Z',
    };

    await expect(
      services.spendApprovalGovernance.executeTierApproval(DELEGATEE_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_3_EXECUTIVE',
        delegationId: delegation.id,
        delegation,
      })
    ).rejects.toThrow(/Executive Gate.*cannot be delegated/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 11: Sequential Progression Bypass
  // -------------------------------------------------------------------------
  it('Attack 11: Approver attempts to approve Tier 2 before Tier 1 -> DENIED', async () => {
    const { rfq } = await seedRfq(1500000);

    await expect(
      services.spendApprovalGovernance.executeTierApproval(PRIMARY_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_2_DEPT_HEAD',
      })
    ).rejects.toThrow(/Prior tier.*is not yet approved/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 12: Duplicate Approval Re-Execution
  // -------------------------------------------------------------------------
  it('Attack 12: Approver attempts to re-approve an already approved stage -> DENIED', async () => {
    const { rfq } = await seedRfq(300000);

    // Initial approval
    await services.spendApprovalGovernance.executeTierApproval(MANAGER_ACTOR, {
      rfqId: rfq.id,
      tierLevel: 'TIER_1_MANAGER',
    });

    // Second duplicate approval attempt
    await expect(
      services.spendApprovalGovernance.executeTierApproval(MANAGER_ACTOR, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      })
    ).rejects.toThrow(/has already been approved/i);
  });

  // -------------------------------------------------------------------------
  // ATTACK 13: Role != Person Historical Audit Rewrite (PA-03)
  // -------------------------------------------------------------------------
  it('Attack 13: Succession from Person A to Person B preserves historical audit immutability', () => {
    const auditCheck = verifyMsmeHistoricalRoleContinuity({
      historicalAuditApproverId: 'usr-person-a-101',
      predecessorPersonId: 'usr-person-a-101',
      successorPersonId: 'usr-person-b-202',
    });

    expect(auditCheck.preserved).toBe(true);
    expect(auditCheck.message).toContain('PA-03 Compliant');
  });

  // -------------------------------------------------------------------------
  // ATTACK 14: Expired Role Assignment Approval Attempt (PA-03)
  // -------------------------------------------------------------------------
  it('Attack 14: Expired role assignment cannot approve transactions', () => {
    const expiredDelegation: OrganizationDelegation = {
      id: 'del-expired-role',
      organizationId: ORG_MSME_A,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: 'usr-expired-mgr',
      permissions: ['APPROVE_TIER_1'],
      startsAt: '2025-01-01T00:00:00Z',
      expiresAt: '2026-01-01T00:00:00Z', // 1 year ago
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
    };

    const decision = evaluateMsmeSpendDecisionState({
      actorProfileId: 'usr-expired-mgr',
      actorRole: 'DELEGATE',
      rfqCreatorProfileId: 'usr-creator-999',
      procurementAmount: 100000,
      activeDelegation: expiredDelegation,
      currentTime: new Date('2026-09-24T12:00:00Z'),
    });

    expect(decision.canApprove).toBe(false);
    expect(decision.state).toBe('DELEGATION_EXPIRED');
  });

  // -------------------------------------------------------------------------
  // ATTACK 15: Post-Acceptance PO Cancellation Attempt
  // -------------------------------------------------------------------------
  it('Attack 15: Buyer attempts to cancel PO after supplier acceptance -> BLOCKED', () => {
    const result = validatePurchaseOrderCancellation({
      currentStatus: 'ACCEPTED',
      cancellationReason: 'Found cheaper alternative after supplier accepted',
    });

    expect(result.canCancel).toBe(false);
    expect(result.rejectionReason).toContain('blocked after supplier acceptance');
  });

  // -------------------------------------------------------------------------
  // ATTACK 16: Blank / Whitespace Reason PO Cancellation Attempt
  // -------------------------------------------------------------------------
  it('Attack 16: Buyer attempts to cancel PO with blank or short reason -> REJECTED', () => {
    const result = validatePurchaseOrderCancellation({
      currentStatus: 'ISSUED',
      cancellationReason: '   ',
    });

    expect(result.canCancel).toBe(false);
    expect(result.rejectionReason).toContain('minimum 5 characters');
  });

  // -------------------------------------------------------------------------
  // ATTACK 17: Pre-Award Supplier Identity Leak Attempt (PA-04/PA-05)
  // -------------------------------------------------------------------------
  it('Attack 17: Validates zero supplier PII leakage in quote evaluation payload', () => {
    const safePayload = {
      quoteId: 'q-101',
      unitRate: 1500,
      landedCost: 15000,
      tatDays: 5,
      warrantyMonths: 12,
      meritScore: 92.5,
      supplierMaskedId: 'SUP-MK-748',
    };

    expect(() => assertIdentityProtectedPayloadSafe(safePayload)).not.toThrow();

    const unsafePayload = {
      ...safePayload,
      business_name: 'Super Heavy Machinery Ltd',
    };

    expect(() => assertIdentityProtectedPayloadSafe(unsafePayload)).toThrow();
  });

  // -------------------------------------------------------------------------
  // ATTACK 18: Supplier Platform Fee Discrepancy Attack
  // -------------------------------------------------------------------------
  it('Attack 18: Verifies exact 0.50% supplier platform fee + 18% GST with untouched PO gross', () => {
    const feeResult = calculateSupplierPlatformFeeWithGst({
      poGrossAmount: 1000000, // ₹10 Lakhs PO
      feeRatePercent: 0.50,
      gstRatePercent: 18,
    });

    expect(feeResult.poGrossAmount).toBe(1000000);
    expect(feeResult.feeAmount).toBe(5000); // 0.50% of 10L = ₹5,000
    expect(feeResult.gstOnFeeAmount).toBe(900); // 18% of 5,000 = ₹900
    expect(feeResult.totalFeeWithGst).toBe(5900);
    expect(feeResult.netSupplierDisbursement).toBe(994100);
    expect(feeResult.poGrossUntouched).toBe(true);
  });

  // -------------------------------------------------------------------------
  // ATTACK 19: Fake / Mock Statutory Verification Injection
  // -------------------------------------------------------------------------
  it('Attack 19: Rejects corrupted GSTIN and conflicting PAN without fabricating verification', () => {
    const mismatch = evaluateMsmeStatutoryVerification({
      businessName: 'Apex Precision Tools',
      gstin: '29AABCG7890K1Z2', // PAN: AABCG7890K
      pan: 'BBBCP9999K', // Conflicting PAN
    });

    expect(mismatch.gstinStatus).toBe('MISMATCH');
    expect(mismatch.panStatus).toBe('MISMATCH');
    expect(mismatch.isCompliantForRegistration).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ATTACK 20: Wallet Credits Contamination of GAAP Ledger
  // -------------------------------------------------------------------------
  it('Attack 20: Prevents platform reward credits from contaminating bilateral procurement GMV ledger', () => {
    const ledgerCheck = verifyMsmeWalletGmvSegregation({
      walletBalanceCredits: 10000,
      poContractGmv: 500000,
      isAppliedToBilateralLedger: true, // Illegal mixing attempt
    });

    expect(ledgerCheck.isSegregated).toBe(false);
    expect(ledgerCheck.reason).toContain('VIOLATION');
  });
});

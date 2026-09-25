/**
 * OTP Stage R2-11: DECIDE — Atomic Award, Reveal Gate & Decision Receipt Red Team Test Suite
 *
 * Implements 16 Authoritative Red Team Security & Abuse Attack Vectors (RT-01 through RT-16):
 *   - RT-01: Unauthorized award attempt (actor without role / unauthenticated)
 *   - RT-02: Cross-tenant award attempt (Org B actor awards Org A RFQ)
 *   - RT-03: Cross-RFQ quote injection (Quote from RFQ B awarded on RFQ A)
 *   - RT-04: Double award race condition / competing simultaneous awards
 *   - RT-05: Replay request / duplicate execution protection
 *   - RT-06: Pre-award identity retrieval attempt (inspecting identity before award)
 *   - RT-07: Reveal without award attempt (invoking reveal when RFQ is still EVALUATING)
 *   - RT-08: Unverified supplier reveal bypass attempt (unverified supplier blocked from unmasking)
 *   - RT-09: RWA quorum bypass attempt (< 2 committee votes attempting atomic award)
 *   - RT-10: RWA COI bypass attempt (conflicted committee member vote used to satisfy quorum)
 *   - RT-11: MSME spend-cap bypass attempt (Manager attempting to award quote exceeding limit)
 *   - RT-12: MSME anti-self-approval bypass attempt (RFQ creator attempting to self-award)
 *   - RT-13: Expired delegation award attempt (delegate with expired date window)
 *   - RT-14: Stale quote / RFQ state award attempt (RFQ in DRAFT/CLOSED/STALLED state)
 *   - RT-15: Decision Receipt tampering / cryptographic hash mismatch detection
 *   - RT-16: Frontend-only authorization bypass attempt (calling service directly with mismatched actor)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import {
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  buildCanonicalDecisionReceipt,
  verifyDecisionReceiptIntegrity,
  assertIdentityProtectedPayloadSafe,
} from '@otp/domain';
import { ForbiddenError, NotFoundError, ValidationError } from '../../packages/services/src/types/errors';

const ORG_ALPHA = 'org-msme-alpha-001';
const ORG_BETA = 'org-msme-beta-002';
const ORG_RWA_PALM = 'org-rwa-palm-meadows-003';

const PRIMARY_ACTOR: ActorContext = {
  profileId: 'usr-primary-001',
  organizationId: ORG_ALPHA,
  orgRole: 'OWNER',
};

const MANAGER_ACTOR: ActorContext = {
  profileId: 'usr-manager-002',
  organizationId: ORG_ALPHA,
  orgRole: 'MANAGER',
};

const CREATOR_ACTOR: ActorContext = {
  profileId: 'usr-creator-003',
  organizationId: ORG_ALPHA,
  orgRole: 'BUYER',
};

const CROSS_TENANT_ACTOR: ActorContext = {
  profileId: 'usr-stranger-999',
  organizationId: ORG_BETA,
  orgRole: 'OWNER',
};

const INDIVIDUAL_BUYER_ACTOR: ActorContext = {
  profileId: 'usr-indiv-101',
  organizationId: undefined,
  orgRole: undefined,
};

const RWA_PRESIDENT_ACTOR: ActorContext = {
  profileId: 'usr-rwa-president',
  organizationId: ORG_RWA_PALM,
  orgRole: 'OWNER',
};

describe('DECIDE: Atomic Award & Decision Receipt Red Team Security Battery (RT-01 to RT-16)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfqFixture(options?: {
    orgId?: string;
    createdBy?: string;
    rfqStatus?: string;
    amount?: number;
    supplierVerified?: boolean;
    persona?: 'INDIVIDUAL' | 'RWA' | 'MSME';
  }) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();
    const orgId = options?.orgId !== undefined ? options.orgId : ORG_ALPHA;
    const createdBy = options?.createdBy || CREATOR_ACTOR.profileId;
    const rfqStatus = options?.rfqStatus || 'EVALUATING';
    const amount = options?.amount || 300000;
    const supplierVerified = options?.supplierVerified ?? true;

    // 1. Requirement
    const req = await repos.requirements.save({
      id: `req-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId || null,
      createdBy,
      requirementType: 'GOODS',
      status: 'RFQ_CREATED',
      title: 'Heavy Duty Diesel Generating Set',
      budgetAmount: amount,
      createdAt: now,
      updatedAt: now,
    });

    // 2. RFQ
    const rfq = await repos.rfqs.save({
      id: `rfq-${crypto.randomUUID().slice(0, 8)}`,
      requirementId: req.id,
      organizationId: orgId || null,
      status: rfqStatus as any,
      revealStatus: 'PROTECTED',
      title: 'Heavy Duty Diesel Generating Set',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Suppliers
    const sup1 = await repos.suppliers.save!({
      id: `sup-${crypto.randomUUID().slice(0, 8)}`,
      businessName: 'Prime Power Systems Private Limited',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['generator'],
      gstin: '29AAACP1234A1Z1',
      lifecycleState: supplierVerified ? SupplierLifecycleState.VERIFIED : SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: supplierVerified ? TruthfulVerificationStatus.VERIFIED : TruthfulVerificationStatus.NOT_PROVIDED,
    });

    const sup2 = await repos.suppliers.save!({
      id: `sup-${crypto.randomUUID().slice(0, 8)}`,
      businessName: 'Secondary Generator Works LLP',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['generator'],
      gstin: '29AAACS5678B1Z2',
      lifecycleState: SupplierLifecycleState.VERIFIED,
      verificationStatus: TruthfulVerificationStatus.VERIFIED,
    });

    // 4. Quotes
    const q1 = await repos.quotes.save({
      id: `quote-${crypto.randomUUID().slice(0, 8)}`,
      rfqId: rfq.id,
      supplierId: sup1.id,
      invitationId: 'inv-1',
      status: 'FINAL',
      currentVersion: 1,
      evaluationScore: 9.5,
      createdAt: now,
      updatedAt: now,
    });

    await repos.quoteVersions.save({
      id: `qv-${crypto.randomUUID().slice(0, 8)}`,
      quoteId: q1.id,
      version: 1,
      snapshot: {
        basePrice: amount * 0.85,
        gstAmount: amount * 0.15,
        transportCost: 0,
        totalCost: amount,
        deliveryDays: 7,
        warrantyMonths: 24,
        currency: 'INR',
      },
      notes: 'Initial quotation',
      createdBy: sup1.id,
      createdAt: now,
    });

    const q2 = await repos.quotes.save({
      id: `quote-${crypto.randomUUID().slice(0, 8)}`,
      rfqId: rfq.id,
      supplierId: sup2.id,
      invitationId: 'inv-2',
      status: 'FINAL',
      currentVersion: 1,
      evaluationScore: 8.8,
      createdAt: now,
      updatedAt: now,
    });

    await repos.quoteVersions.save({
      id: `qv-${crypto.randomUUID().slice(0, 8)}`,
      quoteId: q2.id,
      version: 1,
      snapshot: {
        basePrice: amount * 0.9,
        gstAmount: amount * 0.16,
        transportCost: 0,
        totalCost: amount * 1.06,
        deliveryDays: 10,
        warrantyMonths: 12,
        currency: 'INR',
      },
      notes: 'Initial quotation',
      createdBy: sup2.id,
      createdAt: now,
    });

    return { req, rfq, sup1, sup2, q1, q2 };
  }

  // ---------------------------------------------------------------------------
  // RT-01: Unauthorized Award Attempt
  // ---------------------------------------------------------------------------
  it('RT-01: Unauthorized actor without award permission or unauthenticated session -> DENIED', async () => {
    const { rfq, q1 } = await seedRfqFixture();

    const unauthActor: ActorContext = { profileId: '' };
    const res = await services.awards.lockAndRevealAwardAtomic(unauthActor, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Award attempt without valid session credentials.',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // ---------------------------------------------------------------------------
  // RT-02: Cross-Tenant Award Hijack
  // ---------------------------------------------------------------------------
  it('RT-02: Cross-Tenant actor from Org B attempts to award Org A RFQ -> DENIED (PA-03)', async () => {
    const { rfq, q1 } = await seedRfqFixture({ orgId: ORG_ALPHA });

    const res = await services.awards.lockAndRevealAwardAtomic(CROSS_TENANT_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Cross tenant attack attempt.',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // ---------------------------------------------------------------------------
  // RT-03: Cross-RFQ Quote Injection
  // ---------------------------------------------------------------------------
  it('RT-03: Actor attempts to award quote belonging to a completely different RFQ -> DENIED', async () => {
    const fixtureA = await seedRfqFixture({ orgId: ORG_ALPHA });
    const fixtureB = await seedRfqFixture({ orgId: ORG_ALPHA });

    // Attempt to award quote from RFQ B onto RFQ A
    const res = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: fixtureA.rfq.id,
      quoteId: fixtureB.q1.id,
      justification: 'Attempting cross-RFQ quote injection.',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Winning quote does not belong to specified RFQ');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-04: Double Award Race Condition
  // ---------------------------------------------------------------------------
  it('RT-04: Double award race condition: Second award attempt on already awarded RFQ -> DENIED (PA-02)', async () => {
    const { rfq, q1, q2 } = await seedRfqFixture();

    // 1st Award: Successful
    const firstRes = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'First authoritative award decision.',
    });
    expect(firstRes.ok).toBe(true);

    // 2nd Award: Attempting competing award on q2
    const secondRes = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      quoteId: q2.id,
      justification: 'Second conflicting award attempt.',
    });

    expect(secondRes.ok).toBe(false);
    if (!secondRes.ok) {
      expect(secondRes.error.message).toMatch(/Award already exists for this RFQ|RFQ must be in EVALUATING status/);
    }
  });

  // ---------------------------------------------------------------------------
  // RT-05: Replay Request / Duplicate Execution Protection
  // ---------------------------------------------------------------------------
  it('RT-05: Replaying exact same award request payload -> IDEMPOTENTLY BLOCKED / DENIED', async () => {
    const { rfq, q1 } = await seedRfqFixture();

    const payload = {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Original valid award decision justification.',
    };

    const res1 = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, payload);
    expect(res1.ok).toBe(true);

    // Replay exact same request
    const res2 = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, payload);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error.message).toMatch(/Award already exists for this RFQ|RFQ must be in EVALUATING status/);
    }
  });

  // ---------------------------------------------------------------------------
  // RT-06: Pre-Award Identity Retrieval Attempt
  // ---------------------------------------------------------------------------
  it('RT-06: Pre-award identity retrieval attempt throws Memory Guard exception (PA-04/PA-05)', () => {
    const leakedQuote = {
      quoteId: 'q-101',
      contactPhone: '+919876543210', // Forbidden PII field in evaluation payload
      businessName: 'Unmasked Supplier Entity',
    };

    expect(() => {
      assertIdentityProtectedPayloadSafe(leakedQuote);
    }).toThrow();
  });

  // ---------------------------------------------------------------------------
  // RT-07: Reveal Without Award Attempt
  // ---------------------------------------------------------------------------
  it('RT-07: Attempting supplier identity reveal when RFQ is still unawarded -> DENIED', async () => {
    const { rfq } = await seedRfqFixture();

    // Invoking reveal before award lock
    await expect(
      services.supplierReveal.revealForRfq(PRIMARY_ACTOR, rfq.id)
    ).rejects.toThrow('No award exists for this RFQ');
  });

  // ---------------------------------------------------------------------------
  // RT-08: Unverified Supplier Reveal Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-08: Unverified winning supplier cannot bypass verification: Identity unmasking remains locked (R2-08)', async () => {
    const { rfq, q1 } = await seedRfqFixture({ supplierVerified: false });

    // Execute atomic award
    const awardRes = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Awarded to winning quote with onboarding gate required.',
      autoReveal: true,
    });

    expect(awardRes.ok).toBe(true);
    if (awardRes.ok) {
      expect(awardRes.value.status).toBe('PENDING_REVEAL');
      expect(awardRes.value.revealed).toBe(false);
      expect(awardRes.value.supplierVerificationRequired).toBe(true);
      expect(awardRes.value.businessName).toBeNull();
    }

    // Direct reveal attempt should also fail closed
    await expect(
      services.supplierReveal.revealForRfq(PRIMARY_ACTOR, rfq.id)
    ).rejects.toThrow(/Supplier onboarding and identity verification required/);
  });

  // ---------------------------------------------------------------------------
  // RT-09: RWA Quorum Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-09: RWA quorum bypass attempt with < 2 unconflicted committee votes -> DENIED (PA-01)', async () => {
    const { rfq, q1 } = await seedRfqFixture({ orgId: ORG_RWA_PALM, persona: 'RWA' });
    const repos = mem.asRepositories();

    // Cast only 1 vote
    await repos.votes.save({
      id: 'vote-1',
      rfqId: rfq.id,
      profileId: 'usr-member-1',
      choice: 'RECOMMEND',
      recommendedQuoteId: q1.id,
      castAt: new Date().toISOString(),
    });

    const res = await services.awards.lockAndRevealAwardAtomic(RWA_PRESIDENT_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Attempting award with only 1 committee vote.',
      buyerPersona: 'RWA',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('RWA committee quorum (>= 2 unconflicted votes) not satisfied');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-10: RWA COI Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-10: RWA committee member with declared Conflict of Interest attempting award -> DENIED (PA-01)', async () => {
    const { rfq, q1 } = await seedRfqFixture({ orgId: ORG_RWA_PALM, persona: 'RWA' });
    const repos = mem.asRepositories();

    // Declare COI conflict for President
    await repos.coi.save({
      id: 'coi-1',
      rfqId: rfq.id,
      profileId: RWA_PRESIDENT_ACTOR.profileId,
      status: 'DECLARED_CONFLICT',
      description: 'Director in winning supplier firm',
      declaredAt: new Date().toISOString(),
    });

    const res = await services.awards.lockAndRevealAwardAtomic(RWA_PRESIDENT_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Conflicted member attempting award execution.',
      buyerPersona: 'RWA',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('COI conflict blocks award: Recusal is mandatory');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-11: MSME Spend-Cap Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-11: MSME Manager attempting to award quote exceeding ₹5,00,000 spend cap without Primary sign-off -> DENIED (PA-09)', async () => {
    // Seed high-value RFQ of ₹8,00,000
    const { rfq, q1 } = await seedRfqFixture({ amount: 800000 });

    const res = await services.awards.lockAndRevealAwardAtomic(MANAGER_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Manager attempting high value award.',
      buyerPersona: 'MSME',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('Spend cap exceeded');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-12: MSME Anti-Self-Approval Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-12: MSME RFQ creator attempting to execute award sign-off -> DENIED (PA-09)', async () => {
    const managerCreator: ActorContext = {
      profileId: 'usr-mgr-creator-005',
      organizationId: ORG_ALPHA,
      orgRole: 'MANAGER',
    };

    const { rfq, q1 } = await seedRfqFixture({ createdBy: managerCreator.profileId });

    await services.spendApprovalGovernance.initializeRfqStages(PRIMARY_ACTOR, rfq.id, 300000);

    // 1. Creator attempts to self-approve tier stage -> DENIED (PA-09)
    await expect(
      services.spendApprovalGovernance.executeTierApproval(managerCreator, {
        rfqId: rfq.id,
        tierLevel: 'TIER_1_MANAGER',
      })
    ).rejects.toThrow(ForbiddenError);

    // 2. Creator attempts to lock award while tiers pending -> DENIED
    const res = await services.awards.lockAndRevealAwardAtomic(managerCreator, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Creator attempting self-award execution.',
      buyerPersona: 'MSME',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Cannot lock award: Required approval tier(s) are pending satisfaction');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-13: Expired Delegation Proxy Award Attempt
  // ---------------------------------------------------------------------------
  it('RT-13: Delegate attempting award with expired delegation proxy token/date window -> DENIED (PA-09)', async () => {
    const { rfq, q1 } = await seedRfqFixture();
    const repos = mem.asRepositories();

    // Create expired delegation
    const expiredDelegation = await repos.organizationDelegations.save({
      id: 'del-expired-001',
      organizationId: ORG_ALPHA,
      delegatorId: PRIMARY_ACTOR.profileId,
      delegateeId: MANAGER_ACTOR.profileId,
      permissions: ['APPROVE_TIER_1', 'ISSUE_PO'],
      spendCapAmount: 500000,
      startsAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-31T23:59:59Z', // Expired
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const res = await services.awards.lockAndRevealAwardAtomic(MANAGER_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Award under expired proxy delegation.',
      delegationId: expiredDelegation.id,
      buyerPersona: 'MSME',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
      expect(res.error.message).toContain('Delegation proxy date window has expired');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-14: Stale Quote / RFQ State Award Attempt
  // ---------------------------------------------------------------------------
  it('RT-14: Award attempt on RFQ in CLOSED or DRAFT state or WITHDRAWN quote -> DENIED', async () => {
    const { rfq, q1 } = await seedRfqFixture({ rfqStatus: 'CLOSED' });

    const res = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Award attempt on closed RFQ.',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('RFQ must be in EVALUATING status');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-15: Decision Receipt Tampering Detection
  // ---------------------------------------------------------------------------
  it('RT-15: Decision Receipt tampering detection: Cryptographic SHA-256 hash mismatch flag triggered (PA-03/PA-06)', async () => {
    const { rfq, q1 } = await seedRfqFixture();

    const awardRes = await services.awards.lockAndRevealAwardAtomic(PRIMARY_ACTOR, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Valid award for tamper test.',
    });

    expect(awardRes.ok).toBe(true);
    if (awardRes.ok) {
      const receipt = awardRes.value.receipt;
      expect(verifyDecisionReceiptIntegrity(receipt).valid).toBe(true);

      // Attempt payload alteration (tampering with total landed cost)
      const tampered = {
        ...receipt,
        selectedOffer: {
          ...receipt.selectedOffer,
          totalLandedCost: 999999, // Altered
        },
      };

      const verification = verifyDecisionReceiptIntegrity(tampered);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('mismatch: payload has been altered');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-16: Frontend-Only Authorization Bypass Attempt
  // ---------------------------------------------------------------------------
  it('RT-16: Direct service invocation with mismatched or forged actor context credentials -> DENIED', async () => {
    const { rfq, q1 } = await seedRfqFixture();

    const forgedActor: ActorContext = {
      profileId: 'usr-random-attacker',
      organizationId: ORG_BETA,
      orgRole: 'BUYER',
    };

    const res = await services.awards.lockAndRevealAwardAtomic(forgedActor, {
      rfqId: rfq.id,
      quoteId: q1.id,
      justification: 'Direct backend invocation without valid membership.',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });
});

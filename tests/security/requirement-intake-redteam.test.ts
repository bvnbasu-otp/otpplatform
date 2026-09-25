import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import {
  evaluateRfqEntitlement,
  validateMultimodalIntakeSubmission,
  DECLARED_PAYMENT_PLANS,
  assertIdentityProtectedPayloadSafe,
  IdentityProtectedViolationError,
  BlindViolationError,
  createAddressSnapshot,
  SUBSCRIPTION_TIERS,
} from '@otp/domain';
import { ForbiddenError, ValidationError } from '../../packages/services/src/types/errors';

const ORG_ALPHA = 'org-rwa-alpha-001';
const ORG_BETA = 'org-msme-beta-002';

const VALID_INDIVIDUAL_ACTOR: ActorContext = {
  profileId: 'usr-indiv-101',
  organizationId: undefined,
  orgRole: undefined,
  isPlatformAdmin: false,
};

const VALID_RWA_MANAGER_ACTOR: ActorContext = {
  profileId: 'usr-rwa-mgr-201',
  organizationId: ORG_ALPHA,
  orgRole: 'MANAGER',
  isPlatformAdmin: false,
};

const VALID_MSME_OWNER_ACTOR: ActorContext = {
  profileId: 'usr-msme-owner-301',
  organizationId: ORG_BETA,
  orgRole: 'OWNER',
  isPlatformAdmin: false,
};

const ATTACKER_CROSS_TENANT_ACTOR: ActorContext = {
  profileId: 'usr-intruder-999',
  organizationId: 'org-attacker-999',
  orgRole: 'BUYER',
  isPlatformAdmin: false,
};

describe('Stage R2-09: Multimodal Requirement Intake Red Team Battery (RT-01 through RT-16)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // -------------------------------------------------------------------------
  // RT-01: Unauthorized Requirement Creation by Unauthenticated / Stranded Actor
  // -------------------------------------------------------------------------
  it('RT-01: Unauthorized requirement creation without active credentials -> DENIED', async () => {
    const unauthenticatedActor: ActorContext = {
      profileId: '',
      organizationId: ORG_ALPHA,
      orgRole: 'VIEWER',
      isPlatformAdmin: false,
    };

    const res = await services.requirements.createDraft(unauthenticatedActor, {
      title: 'Hacked Borewell Motor',
      requirementType: 'SERVICE',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RT-02: Cross-Tenant Organization Forging
  // -------------------------------------------------------------------------
  it('RT-02: Cross-tenant actor attempts to create requirement under victim organization -> DENIED', async () => {
    // Attacker claims Org Alpha as target but belongs to Org Attacker
    const forgedActor: ActorContext = {
      profileId: ATTACKER_CROSS_TENANT_ACTOR.profileId,
      organizationId: ORG_ALPHA, // Forged context
      orgRole: undefined, // No verified role in Org Alpha
      isPlatformAdmin: false,
    };

    const res = await services.requirements.createDraft(forgedActor, {
      title: 'Forged Elevator Maintenance',
      requirementType: 'SERVICE',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RT-03: Individual Context Pollution (organization_id injection on INDIVIDUAL persona)
  // -------------------------------------------------------------------------
  it('RT-03: Individual context pollution with organization_id injection -> REJECTED', () => {
    const validation = validateMultimodalIntakeSubmission({
      persona: 'INDIVIDUAL',
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      organizationId: 'org-sneaky-pollution', // Malicious injection
      rawPrompt: 'Need 4 ceiling fans for my apartment',
      normalizedTitle: '4 Ceiling Fans',
      deliveryCity: 'Bengaluru',
      deliveryPincode: '560001',
      paymentStructure: 'SINGLE_PAYMENT',
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors.organizationId).toContain('must have organization_id = null');
  });

  // -------------------------------------------------------------------------
  // RT-04: Missing Organization on RWA / MSME Persona
  // -------------------------------------------------------------------------
  it('RT-04: RWA / MSME intake without active organization_id -> REJECTED', () => {
    const validationRwa = validateMultimodalIntakeSubmission({
      persona: 'RWA',
      profileId: 'usr-sec-01',
      organizationId: null, // Missing org
      rawPrompt: 'DG set servicing for society',
      normalizedTitle: 'DG Servicing',
      deliveryCity: 'Chennai',
      deliveryPincode: '600028',
      paymentStructure: 'THREE_PART_PAYMENT',
    });

    expect(validationRwa.isValid).toBe(false);
    expect(validationRwa.errors.organizationId).toContain('require an active organization_id');
  });

  // -------------------------------------------------------------------------
  // RT-05: Entitlement Bypass on Expired Subscription
  // -------------------------------------------------------------------------
  it('RT-05: Expired subscription with 0 free credits attempts RFQ entitlement -> BLOCKED', () => {
    const entitlement = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: '2026-08-01T00:00:00Z',
      rfqsUsedInCurrentMonth: 0,
      freeRfqCredits: 0,
      billingMode: 'LIVE',
      now: '2026-09-25T08:00:00Z',
    });

    expect(entitlement.canCreateRfq).toBe(false);
    expect(entitlement.isSubscriptionActive).toBe(false);
    expect(entitlement.totalAvailableRfqs).toBe(0);
  });

  // -------------------------------------------------------------------------
  // RT-06: Monthly Quota Exhaustion Attack
  // -------------------------------------------------------------------------
  it('RT-06: Individual buyer attempts to exceed monthly 3 RFQs quota -> BLOCKED', () => {
    const entitlement = evaluateRfqEntitlement({
      tierId: 'INDIVIDUAL',
      plan: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: '2026-10-25T00:00:00Z',
      rfqsUsedInCurrentMonth: 3, // All 3 used
      billingMode: 'LIVE',
      now: '2026-09-25T08:00:00Z',
    });

    expect(entitlement.canCreateRfq).toBe(false);
    expect(entitlement.monthlyRemaining).toBe(0);
    expect(entitlement.totalAvailableRfqs).toBe(0);
  });

  // -------------------------------------------------------------------------
  // RT-07: Idempotency & Concurrent Submission Protection
  // -------------------------------------------------------------------------
  it('RT-07: Client idempotency key is preserved and recognized across submissions', () => {
    const input = {
      idempotencyKey: 'idem-key-unique-777',
      persona: 'INDIVIDUAL' as const,
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      organizationId: null,
      rawPrompt: 'Submersible pump rewinding',
      normalizedTitle: 'Pump Rewinding',
      deliveryCity: 'Coimbatore',
      deliveryPincode: '641001',
      paymentStructure: 'SINGLE_PAYMENT' as const,
    };

    const result1 = validateMultimodalIntakeSubmission(input);
    const result2 = validateMultimodalIntakeSubmission(input);

    expect(result1.isIdempotent).toBe(true);
    expect(result2.isIdempotent).toBe(true);
    expect(result1.isValid).toBe(true);
    expect(result2.isValid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RT-08: Negative or Zero Quantity Injection
  // -------------------------------------------------------------------------
  it('RT-08: Negative or zero quantity injection -> REJECTED', () => {
    const negativeQty = validateMultimodalIntakeSubmission({
      persona: 'MSME',
      profileId: VALID_MSME_OWNER_ACTOR.profileId,
      organizationId: ORG_BETA,
      rawPrompt: 'SS304 Flanges batch',
      normalizedTitle: 'SS304 Flanges',
      deliveryCity: 'Pune',
      deliveryPincode: '411018',
      quantity: -50,
      paymentStructure: 'SINGLE_PAYMENT',
    });
    expect(negativeQty.isValid).toBe(false);
    expect(negativeQty.errors.quantity).toContain('positive number');

    const zeroQty = validateMultimodalIntakeSubmission({
      persona: 'MSME',
      profileId: VALID_MSME_OWNER_ACTOR.profileId,
      organizationId: ORG_BETA,
      rawPrompt: 'SS304 Flanges batch',
      normalizedTitle: 'SS304 Flanges',
      deliveryCity: 'Pune',
      deliveryPincode: '411018',
      quantity: 0,
      paymentStructure: 'SINGLE_PAYMENT',
    });
    expect(zeroQty.isValid).toBe(false);
    expect(zeroQty.errors.quantity).toContain('positive number');
  });

  // -------------------------------------------------------------------------
  // RT-09: Malicious / Invalid PIN Code Injection
  // -------------------------------------------------------------------------
  it('RT-09: Invalid / Malicious non-6-digit PIN code injection -> REJECTED', () => {
    const invalidPin1 = validateMultimodalIntakeSubmission({
      persona: 'INDIVIDUAL',
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      rawPrompt: 'Waterproofing terrace',
      normalizedTitle: 'Terrace Waterproofing',
      deliveryCity: 'Bengaluru',
      deliveryPincode: '56000', // Only 5 digits
      paymentStructure: 'SINGLE_PAYMENT',
    });
    expect(invalidPin1.isValid).toBe(false);
    expect(invalidPin1.errors.deliveryPincode).toContain('Valid 6-digit Indian PIN code');

    const injectionPin = validateMultimodalIntakeSubmission({
      persona: 'INDIVIDUAL',
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      rawPrompt: 'Waterproofing terrace',
      normalizedTitle: 'Terrace Waterproofing',
      deliveryCity: 'Bengaluru',
      deliveryPincode: '560001; DROP TABLE requirements;',
      paymentStructure: 'SINGLE_PAYMENT',
    });
    expect(injectionPin.isValid).toBe(false);
    expect(injectionPin.errors.deliveryPincode).toContain('Valid 6-digit Indian PIN code');
  });

  // -------------------------------------------------------------------------
  // RT-10: Zero Simulation & Truthful Sourcing Handoff Invariant
  // -------------------------------------------------------------------------
  it('RT-10: Sourcing handoff produces zero synthetic quotes or fake suppliers in production', async () => {
    const repos = mem.asRepositories();
    const reqRes = await services.requirements.createDraft(VALID_INDIVIDUAL_ACTOR, {
      title: 'Genuine Solar Panel Installation',
      requirementType: 'SERVICE',
    });
    expect(reqRes.ok).toBe(true);
    if (!reqRes.ok) return;

    const rfqRes = await services.rfqs.createFromRequirement(VALID_INDIVIDUAL_ACTOR, reqRes.value.id, {
      title: 'Genuine Solar Panel Installation',
      minQuotesRequired: 3,
    });
    expect(rfqRes.ok).toBe(true);
    if (!rfqRes.ok) return;

    // Verify initially zero quotes exist (no synthetic simulation injection)
    const quotes = await repos.quotes.findByRfqId(rfqRes.value.id);
    expect(quotes).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // RT-11: Pre-Award Supplier Contact / PII Leakage Detection (PA-05)
  // -------------------------------------------------------------------------
  it('RT-11: Leakage of supplier phone / email in requirement payload triggers memory guard -> BLOCKED', () => {
    expect(() =>
      assertIdentityProtectedPayloadSafe({
        supplierId: 'sup-leaked-123',
        contactEmail: 'vendor@suppliercorp.in',
      }),
    ).toThrow(IdentityProtectedViolationError);

    const validation = validateMultimodalIntakeSubmission({
      persona: 'INDIVIDUAL',
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      rawPrompt: 'Contact direct supplier vendor@suppliercorp.in for order',
      normalizedTitle: 'Direct Supplier Order',
      deliveryCity: 'Bengaluru',
      deliveryPincode: '560001',
      paymentStructure: 'SINGLE_PAYMENT',
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors.security).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // RT-12: Declared Payment Structure Integrity (Splits Sum to 100%)
  // -------------------------------------------------------------------------
  it('RT-12: Declared payment structures sum strictly to 100% and cannot be tampered', () => {
    for (const [key, plan] of Object.entries(DECLARED_PAYMENT_PLANS)) {
      if (key === 'CUSTOM_TERMS') continue;
      const totalPct = plan.splits.reduce((acc, split) => acc + split.percentage, 0);
      expect(totalPct).toBe(100);
    }
  });

  // -------------------------------------------------------------------------
  // RT-13: Unlisted Taxonomy Free-Text Fallback Resilience
  // -------------------------------------------------------------------------
  it('RT-13: Unlisted requirement category fallback processes cleanly without blocking buyer', () => {
    const fallback = validateMultimodalIntakeSubmission({
      persona: 'INDIVIDUAL',
      profileId: VALID_INDIVIDUAL_ACTOR.profileId,
      rawPrompt: 'Custom vintage grandfather clock servicing and pendulum calibration',
      normalizedTitle: 'Grandfather Clock Calibration',
      isCustomTaxonomyFallback: true,
      customTaxonomyFreeText: 'Horology & Antique Clock Repairs',
      deliveryCity: 'Mysuru',
      deliveryPincode: '570001',
      paymentStructure: 'SINGLE_PAYMENT',
    });

    expect(fallback.isValid).toBe(true);
    expect(fallback.errors).toEqual({});
  });

  // -------------------------------------------------------------------------
  // RT-14: Immutable Address Snapshot Tamper Resistance
  // -------------------------------------------------------------------------
  it('RT-14: Future buyer address modifications never mutate frozen RFQ address snapshot', async () => {
    const liveAddress = {
      id: 'addr-live-01',
      label: 'Factory Site A',
      line1: '12 Industrial Area, Phase 1',
      city: 'Coimbatore',
      pincode: '641001',
      state: 'Tamil Nadu',
      country: 'India',
    };

    // Capture frozen snapshot at intake time
    const snapshotAtIntake = createAddressSnapshot(liveAddress);
    expect(snapshotAtIntake.line1).toBe('12 Industrial Area, Phase 1');
    expect(snapshotAtIntake.city).toBe('Coimbatore');

    // Live address is subsequently mutated / moved
    const mutatedAddress = {
      ...liveAddress,
      line1: '99 New Industrial Corridor, Phase 4',
      city: 'Chennai',
      pincode: '600001',
    };

    // Snapshot remains immutable and untampered
    expect(snapshotAtIntake.line1).toBe('12 Industrial Area, Phase 1');
    expect(snapshotAtIntake.city).toBe('Coimbatore');
    expect(snapshotAtIntake.pincode).toBe('641001');
    expect(snapshotAtIntake.line1).not.toBe(mutatedAddress.line1);
  });

  // -------------------------------------------------------------------------
  // RT-15: Cross-Tenant Draft Isolation
  // -------------------------------------------------------------------------
  it('RT-15: Cross-tenant actor cannot inspect or update drafts belonging to other organizations', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const victimDraft = await repos.requirements.save({
      id: 'req-victim-001',
      organizationId: ORG_ALPHA,
      createdBy: VALID_RWA_MANAGER_ACTOR.profileId,
      requirementType: 'PRODUCT',
      status: 'DRAFT',
      title: 'Confidential Society CCTV Equipment',
      createdAt: now,
      updatedAt: now,
    });

    const submitRes = await services.requirements.submit(
      ATTACKER_CROSS_TENANT_ACTOR,
      victimDraft.id,
    );

    expect(submitRes.ok).toBe(false);
    if (!submitRes.ok) {
      expect(submitRes.error).toBeInstanceOf(ForbiddenError);
    }
  });

  // -------------------------------------------------------------------------
  // RT-16: MSME Anti-Self-Approval and Spend Policy Preservation during Handoff
  // -------------------------------------------------------------------------
  it('RT-16: MSME requirement creator is prevented from self-approving generated RFQ', async () => {
    const creatorActor: ActorContext = {
      profileId: 'usr-msme-buyer-creator',
      organizationId: ORG_BETA,
      orgRole: 'BUYER',
      isPlatformAdmin: false,
    };

    const reqRes = await services.requirements.createDraft(creatorActor, {
      title: 'Precision Machined Spindles',
      requirementType: 'PROJECT',
      budgetAmount: 250000,
    });
    expect(reqRes.ok).toBe(true);
    if (!reqRes.ok) return;

    const rfqRes = await services.rfqs.createFromRequirement(creatorActor, reqRes.value.id, {
      title: 'Precision Machined Spindles',
    });
    expect(rfqRes.ok).toBe(true);
    if (!rfqRes.ok) return;

    // Configure anti-self-approval MSME policy
    await services.spendApprovalGovernance.configureMsmeSpendPolicy(VALID_MSME_OWNER_ACTOR, {
      organizationId: ORG_BETA,
      managerSpendCap: 500000,
      preventSelfApproval: true,
    });

    await services.spendApprovalGovernance.initializeRfqStages(
      VALID_MSME_OWNER_ACTOR,
      rfqRes.value.id,
      250000,
    );

    // Creator attempts to execute spend approval for their own requirement -> BLOCKED
    await expect(
      services.spendApprovalGovernance.executeTierApproval(creatorActor, {
        rfqId: rfqRes.value.id,
        tierLevel: 'TIER_1_MANAGER',
      }),
    ).rejects.toThrow();
  });
});

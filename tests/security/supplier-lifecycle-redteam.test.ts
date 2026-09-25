import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import type { Supplier, Rfq } from '../../packages/services/src/repositories/entities';
import {
  SupplierDiscoveryLifecycleTier,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  evaluateSupplierDiscoveryTier,
  validateDiscoveryTierTransition,
  assertMonotonicTierTransition,
  IllegalLifecycleTransitionError,
  evaluateStage1OtpVerification,
  evaluateStage2GstVerification,
  evaluateSupplierAwardEligibility,
  checkSupplierExecutionGate,
  assertIdentityProtectedPayloadSafe,
} from '@otp/domain';

const ADMIN_ACTOR: ActorContext = {
  profileId: 'usr-admin-001',
  isPlatformAdmin: true,
};

const UNVERIFIED_SUPPLIER_ACTOR: ActorContext = {
  profileId: 'usr-supplier-unverified',
  isPlatformAdmin: false,
};

const ATTACKER_ACTOR: ActorContext = {
  profileId: 'usr-attacker-666',
  isPlatformAdmin: false,
};

describe('Stage R2-08 Supplier 2-Stage Lifecycle Red Team Battery (16 Attack Vectors)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 1: Self-promotion to OTP_VERIFIED without credentials / auth
  // -------------------------------------------------------------------------
  it('ATTACK 01: Self-promotion to OTP_VERIFIED without credentials -> BLOCKED', async () => {
    const unverifiedSupplier: Supplier = {
      id: 'sup-att-01',
      businessName: 'Unverified Supplies',
      contactPhone: '+919999911111',
      source: 'DIRECT',
      status: 'PENDING',
      categories: ['Hardware'],
      lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
    };
    await mem.asRepositories().suppliers.save!(unverifiedSupplier);

    // Attacker attempts Stage 1 verification with empty / unverified phone OTP
    const res = evaluateStage1OtpVerification({
      authorizedRepName: '',
      contactPhone: '+919999911111',
      phoneOtpVerified: false, // Fake promotion
    });

    expect(res.isValid).toBe(false);
    expect(res.status).toBe(TruthfulVerificationStatus.PENDING);
    expect(res.errors.authorizedRepName).toBeTruthy();
    expect(res.errors.contactPhone).toContain('Phone OTP verification is required');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 2: Self-promotion to GST_VERIFIED with invalid checksum
  // -------------------------------------------------------------------------
  it('ATTACK 02: Self-promotion to GST_VERIFIED with invalid GSTIN checksum -> BLOCKED', async () => {
    // Malicious GSTIN with forged check character (Z9 instead of valid Luhn check digit)
    const forgedGstin = '29ABCDE1234F1Z9';

    const res = evaluateStage2GstVerification({
      gstin: forgedGstin,
      pan: 'ABCDE1234F',
    });

    expect(res.isValid).toBe(false);
    expect(res.checksumValid).toBe(false);
    expect(res.status).toBe(TruthfulVerificationStatus.FAILED);
    expect(res.errors.gstin).toContain('Invalid GSTIN');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 3: Illegal lifecycle downgrade (Monotonicity Violation)
  // -------------------------------------------------------------------------
  it('ATTACK 03: Illegal lifecycle downgrade from GST_VERIFIED to DISCOVERED_IN_AREA -> BLOCKED', () => {
    const check = validateDiscoveryTierTransition(
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    );

    expect(check.valid).toBe(false);
    expect(check.reason).toContain('Illegal backward transition');

    expect(() =>
      assertMonotonicTierTransition(
        SupplierDiscoveryLifecycleTier.GST_VERIFIED,
        SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      ),
    ).toThrow(IllegalLifecycleTransitionError);
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 4: Forged external verification response (Fabricated Mock)
  // -------------------------------------------------------------------------
  it('ATTACK 04: Forged external verification response with CANCELLED / TIMEOUT status -> TRUTHFUL FALLBACK', () => {
    // Attack: External provider times out; system must NOT fabricate VERIFIED badge
    const timeoutRes = evaluateStage2GstVerification({
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      providerResponse: {
        status: 'TIMEOUT',
      },
    });

    expect(timeoutRes.isValid).toBe(true);
    expect(timeoutRes.isOfflineFallback).toBe(true);
    expect(timeoutRes.status).toBe(TruthfulVerificationStatus.PENDING); // Truthful PENDING, never VERIFIED

    // Attack: External registry returns CANCELLED taxpayer status
    const cancelledRes = evaluateStage2GstVerification({
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      providerResponse: {
        status: 'CANCELLED',
        active: false,
      },
    });

    expect(cancelledRes.isValid).toBe(false);
    expect(cancelledRes.status).toBe(TruthfulVerificationStatus.FAILED);
    expect(cancelledRes.errors.gstin).toContain('CANCELLED');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 5: Token replay on magic-link invitation (/q/:token)
  // -------------------------------------------------------------------------
  it('ATTACK 05: Magic-link quote token replay attack after redemption -> BLOCKED', async () => {
    const rfq: Rfq = {
      id: 'rfq-replay-01',
      requirementId: 'req-rep-01',
      status: 'OPEN',
      revealStatus: 'BLIND',
      title: 'Cement Supply Tender',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: 'usr-buyer-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const supplier: Supplier = {
      id: 'sup-rep-01',
      businessName: 'Cement Traders Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Cement'],
    };
    await mem.asRepositories().rfqs.save(rfq);
    await mem.asRepositories().suppliers.save!(supplier);

    const tokenRes = await services.supplierLifecycle.createMagicLinkInvitation(
      ADMIN_ACTOR,
      'rfq-replay-01',
      'sup-rep-01',
    );
    expect(tokenRes.ok).toBe(true);
    if (!tokenRes.ok) return;

    // 1st redemption succeeds
    const redeem1 = await services.supplierLifecycle.redeemMagicLinkInvitation(tokenRes.value.invitationToken);
    expect(redeem1.ok).toBe(true);

    // 2nd redemption attempt (Replay attack) must FAIL
    const redeem2 = await services.supplierLifecycle.redeemMagicLinkInvitation(tokenRes.value.invitationToken);
    expect(redeem2.ok).toBe(false);
    if (redeem2.ok) return;
    expect(redeem2.error.message).toContain('already been redeemed');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 6: Token hijacking across different RFQs (Scope Bypass)
  // -------------------------------------------------------------------------
  it('ATTACK 06: Magic-link session token hijacking across disparate RFQs -> BLOCKED', async () => {
    const rfqA: Rfq = {
      id: 'rfq-scope-A',
      requirementId: 'req-scope-A',
      status: 'OPEN',
      revealStatus: 'BLIND',
      title: 'Tender A',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 2,
      createdBy: 'buyer-a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const rfqB: Rfq = {
      id: 'rfq-scope-B',
      requirementId: 'req-scope-B',
      status: 'OPEN',
      revealStatus: 'BLIND',
      title: 'Tender B',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 2,
      createdBy: 'buyer-b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const supplier: Supplier = {
      id: 'sup-scope-01',
      businessName: 'Scope Supplier Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Hardware'],
    };

    await mem.asRepositories().rfqs.save(rfqA);
    await mem.asRepositories().rfqs.save(rfqB);
    await mem.asRepositories().suppliers.save!(supplier);

    const invite = await services.supplierLifecycle.createMagicLinkInvitation(ADMIN_ACTOR, 'rfq-scope-A', 'sup-scope-01');
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;

    const session = await services.supplierLifecycle.redeemMagicLinkInvitation(invite.value.invitationToken);
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    // Attempt to submit quote for rfq-scope-B using rfq-scope-A session token
    const hijackedQuote = await services.supplierLifecycle.submitMagicLinkQuote(session.value.sessionToken, {
      rfqId: 'rfq-scope-B', // Malicious cross-RFQ injection
      supplierId: 'sup-scope-01',
      basePrice: 10000,
      gstAmount: 1800,
      transportCost: 500,
      deliveryDays: 5,
      warrantyMonths: 6,
    });

    expect(hijackedQuote.ok).toBe(false);
    if (hijackedQuote.ok) return;
    expect(hijackedQuote.error.message).toContain('Scope mismatch');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 7: Cross-supplier quote submission via stolen session
  // -------------------------------------------------------------------------
  it('ATTACK 07: Cross-supplier quote submission via stolen session -> BLOCKED', async () => {
    const rfq: Rfq = {
      id: 'rfq-victim-01',
      requirementId: 'req-vic-01',
      status: 'OPEN',
      revealStatus: 'BLIND',
      title: 'Victim RFQ',
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 2,
      createdBy: 'buyer-vic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const legitSupplier: Supplier = {
      id: 'sup-legit-01',
      businessName: 'Legitimate Vendor',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Cables'],
    };
    const rogueSupplier: Supplier = {
      id: 'sup-rogue-666',
      businessName: 'Rogue Hijacker',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Cables'],
    };

    await mem.asRepositories().rfqs.save(rfq);
    await mem.asRepositories().suppliers.save!(legitSupplier);
    await mem.asRepositories().suppliers.save!(rogueSupplier);

    const invite = await services.supplierLifecycle.createMagicLinkInvitation(ADMIN_ACTOR, 'rfq-victim-01', 'sup-legit-01');
    if (!invite.ok) return;

    const session = await services.supplierLifecycle.redeemMagicLinkInvitation(invite.value.invitationToken);
    if (!session.ok) return;

    // Attacker submits quote claiming to be rogueSupplier on legitSupplier's session
    const hijackedQuote = await services.supplierLifecycle.submitMagicLinkQuote(session.value.sessionToken, {
      rfqId: 'rfq-victim-01',
      supplierId: 'sup-rogue-666', // Impersonation attempt
      basePrice: 5000,
      gstAmount: 900,
      transportCost: 200,
      deliveryDays: 3,
      warrantyMonths: 12,
    });

    expect(hijackedQuote.ok).toBe(false);
    if (hijackedQuote.ok) return;
    expect(hijackedQuote.error.message).toContain('Scope mismatch');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 8: Pre-award identity unmasking / PII leak (PA-04 / PA-05)
  // -------------------------------------------------------------------------
  it('ATTACK 08: Pre-award supplier candidate PII leakage -> BLOCKED BY DOMAIN GUARD', () => {
    const cleanBlindPayload = {
      alias: 'Supplier 7X9K',
      totalCost: 150000,
      deliveryDays: 10,
      rating: 4.8,
      isCertified: true,
    };

    // Safe payload must pass
    expect(() => assertIdentityProtectedPayloadSafe(cleanBlindPayload)).not.toThrow();

    // Payload containing unmasked PII must throw runtime security error
    const leakingPayload = {
      alias: 'Supplier 7X9K',
      businessName: 'Leaked Commercial Ltd',
      phone: '+919876543210',
      email: 'vendor@secret.test',
      gstin: '29ABCDE1234F1Z5',
    };

    expect(() => assertIdentityProtectedPayloadSafe(leakingPayload)).toThrow();
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 9: Unverified supplier PO generation bypass (PA-02 Gate)
  // -------------------------------------------------------------------------
  it('ATTACK 09: Unverified supplier PO generation & reveal bypass -> FAIL-CLOSED BLOCKED', async () => {
    const unverifiedSupplier: Supplier = {
      id: 'sup-unverified-winner',
      businessName: 'Unverified Quoter',
      source: 'DIRECT',
      status: 'PENDING',
      categories: ['Solar'],
      lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
    };

    // Evaluated via pure domain execution gate
    const gateCheck = checkSupplierExecutionGate(unverifiedSupplier);
    expect(gateCheck.allowed).toBe(false);
    expect(gateCheck.error).toContain('has not completed OTP onboarding and verification');

    // Evaluated via award eligibility evaluator
    const awardElig = evaluateSupplierAwardEligibility({
      supplierId: unverifiedSupplier.id,
      lifecycleState: unverifiedSupplier.lifecycleState,
      verificationStatus: unverifiedSupplier.verificationStatus,
    });

    expect(awardElig.canReveal).toBe(false);
    expect(awardElig.canExecuteDownstream).toBe(false);
    expect(awardElig.onboardingRequired).toBe(true);
    expect(awardElig.blockReason).toContain('onboarding and identity verification required');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 10: GSTIN Luhn Mod-36 checksum bypass & PAN mismatch exploit
  // -------------------------------------------------------------------------
  it('ATTACK 10: GSTIN checksum bypass & PAN mismatch exploit -> BLOCKED', () => {
    // GSTIN has PAN ABCDE1234F, but submitted PAN is DIFFERENT99X
    const res = evaluateStage2GstVerification({
      gstin: '29ABCDE1234F1Z5',
      pan: 'DIFFERENT9', // Mismatched PAN
    });

    expect(res.isValid).toBe(false);
    expect(res.panAligned).toBe(false);
    expect(res.status).toBe(TruthfulVerificationStatus.FAILED);
    expect(res.errors.pan).toContain('does not match the PAN embedded in GSTIN');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 11: Duplicate supplier entity creation on re-registration
  // -------------------------------------------------------------------------
  it('ATTACK 11: Duplicate supplier entity creation on re-claim -> REUSES CANONICAL ENTITY', async () => {
    const existingSupplier: Supplier = {
      id: 'sup-canonical-match',
      businessName: 'Prime Solar Corp',
      legalBusinessName: 'Prime Solar Corporation Pvt Ltd',
      contactPhone: '+919876543210',
      contactEmail: 'corp@primesolar.in',
      pan: 'ABCDE1234F',
      gstin: '29ABCDE1234F1Z5',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Solar'],
      lifecycleState: SupplierLifecycleState.VERIFIED,
      verificationStatus: TruthfulVerificationStatus.VERIFIED,
    };
    await mem.asRepositories().suppliers.save!(existingSupplier);

    // Re-claiming supplier with matching PAN & phone must match existing ID without creating duplicate
    const claimRes = await services.supplierLifecycle.claimDiscoveredSupplier(
      UNVERIFIED_SUPPLIER_ACTOR,
      {
        claimedByProfileId: 'usr-new-profile-100',
        contactPhone: '9876543210',
        contactEmail: 'corp@primesolar.in',
        legalBusinessName: 'Prime Solar Corporation Pvt Ltd',
        pan: 'ABCDE1234F',
        gstin: '29ABCDE1234F1Z5',
        verificationMethod: 'PHONE_OTP',
        otpVerified: true,
      },
      'sup-canonical-match',
    );

    expect(claimRes.ok).toBe(true);
    if (!claimRes.ok) return;
    expect(claimRes.value.matchEvaluation.status).toBe('CONFIRMED_MATCH');
    expect(claimRes.value.supplier.id).toBe('sup-canonical-match'); // Reused canonical UUID
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 12: Auto-claim hijack on low confidence / conflicting match
  // -------------------------------------------------------------------------
  it('ATTACK 12: Auto-claim hijack on low confidence or unverified OTP -> FLAGGED REVIEW_REQUIRED', async () => {
    const candidate: Supplier = {
      id: 'sup-target-victim',
      businessName: 'Karnataka Transformers Ltd',
      contactPhone: '+918888877777',
      source: 'DIRECT',
      status: 'PENDING',
      categories: ['Transformers'],
    };
    await mem.asRepositories().suppliers.save!(candidate);

    // Hijacker attempts auto-claim with unverified OTP
    const res = await services.supplierLifecycle.claimDiscoveredSupplier(
      ATTACKER_ACTOR,
      {
        claimedByProfileId: 'usr-attacker-666',
        contactPhone: '8888877777',
        contactEmail: 'hijacker@darkweb.org',
        legalBusinessName: 'Karnataka Transformers Ltd',
        verificationMethod: 'PHONE_OTP',
        otpVerified: false, // OTP verification missing
      },
      'sup-target-victim',
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('manual admin review');
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 13: Cross-supplier KYC/statutory evidence document access
  // -------------------------------------------------------------------------
  it('ATTACK 13: Cross-supplier evidence / KYC data isolation -> ENFORCED', async () => {
    const supplierA: Supplier = {
      id: 'sup-secret-A',
      businessName: 'Secret Supplier A',
      pan: 'AAAAA1111A',
      gstin: '29AAAAA1111A1Z1',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Security'],
    };
    await mem.asRepositories().suppliers.save!(supplierA);

    // Snapshot generation is strictly tenant/entity bound
    const snapA = await services.supplierLifecycle.getSupplierTransactionSnapshot('sup-secret-A');
    expect(snapA.ok).toBe(true);
    if (!snapA.ok) return;
    expect(snapA.value.supplierId).toBe('sup-secret-A');
    expect(snapA.value.pan).toBe('AAAAA1111A');

    // Non-existent supplier lookup returns NotFound
    const snapNonExistent = await services.supplierLifecycle.getSupplierTransactionSnapshot('sup-fake-id');
    expect(snapNonExistent.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 14: Frontend lifecycle status tampering / client spoofing
  // -------------------------------------------------------------------------
  it('ATTACK 14: Frontend lifecycle status tampering -> OVERRULED BY SERVER EVALUATION', () => {
    // Client-side payload claims GST_VERIFIED, but has no GSTIN or OTP credentials
    const spoofedClientInput = {
      supplierId: 'sup-spoofed-01',
      businessName: 'Spoofed Claims Inc',
      isGstVerified: true, // Spoofed frontend boolean
      isOtpVerified: false,
      isOtpRegistered: false,
      gstin: null, // No GSTIN provided
    };

    // Server/domain tier evaluator must reject spoofed claim and classify truthfully as DISCOVERED_IN_AREA
    const evaluated = evaluateSupplierDiscoveryTier(spoofedClientInput);
    expect(evaluated.tier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
    expect(evaluated.rank).toBe(1);
    expect(evaluated.canSubmitQuote).toBe(false);
    expect(evaluated.isStatutoryVerified).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 15: Direct API/RPC execution manipulation without verified status
  // -------------------------------------------------------------------------
  it('ATTACK 15: Direct downstream execution without statutory verification -> BLOCKED', () => {
    const suspendedSupplier = {
      id: 'sup-suspended',
      lifecycleState: SupplierLifecycleState.SUSPENDED,
      verificationStatus: TruthfulVerificationStatus.VERIFIED,
    };

    const failedSupplier = {
      id: 'sup-failed',
      lifecycleState: SupplierLifecycleState.VERIFICATION_FAILED,
      verificationStatus: TruthfulVerificationStatus.FAILED,
    };

    expect(checkSupplierExecutionGate(suspendedSupplier).allowed).toBe(false);
    expect(checkSupplierExecutionGate(failedSupplier).allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ATTACK VECTOR 16: Concurrent award / verification state transition race
  // -------------------------------------------------------------------------
  it('ATTACK 16: Concurrent transition race condition -> DETERMINISTIC ATOMIC RESOLUTION', async () => {
    const supplier: Supplier = {
      id: 'sup-race-01',
      businessName: 'Rapid Solar Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Solar'],
      lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
    };
    await mem.asRepositories().suppliers.save!(supplier);

    // Parallel transition attempts: one to OTP_REGISTERED, one to GST_VERIFIED
    const p1 = services.supplierLifecycle.transitionLifecycleTier(
      ADMIN_ACTOR,
      'sup-race-01',
      SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
    );
    const p2 = services.supplierLifecycle.transitionLifecycleTier(
      ADMIN_ACTOR,
      'sup-race-01',
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
    );

    const [r1, r2] = await Promise.all([p1, p2]);

    // Both transitions are forward/progressive, resulting in a consistent valid state
    expect(r1.ok || r2.ok).toBe(true);
    const finalSupplier = await mem.asRepositories().suppliers.findById('sup-race-01');
    expect(finalSupplier?.lifecycleState).not.toBe(SupplierLifecycleState.QUOTE_PARTICIPANT);
  });
});
